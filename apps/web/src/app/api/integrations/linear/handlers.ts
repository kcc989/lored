import { env } from 'cloudflare:workers';
import type { RequestInfo } from 'rwsdk/worker';

import {
  buildLinearAuthUrl,
  exchangeCodeForConnection,
  disconnectLinear,
  getLinearConnection,
} from '@/lib/services/linear-auth-service';
import {
  generateOAuthState,
  validateOAuthState,
} from '@/lib/services/google-auth-service';

/**
 * Initiate Linear OAuth flow.
 * Redirects the user to Linear's consent screen.
 */
export async function handleLinearConnect({
  request,
  ctx,
}: RequestInfo): Promise<Response> {
  const state = await generateOAuthState(env.BETTER_AUTH_SECRET);
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/integrations/linear/callback`;
  const authUrl = buildLinearAuthUrl(env, redirectUri, state);

  // Store state in a short-lived cookie for CSRF validation
  const response = Response.redirect(authUrl, 302);
  response.headers.append(
    'Set-Cookie',
    `linear_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api/integrations/linear; Max-Age=600`
  );
  return response;
}

/**
 * Handle the Linear OAuth callback.
 * Exchanges the authorization code for tokens and stores the connection.
 */
export async function handleLinearCallback({
  request,
  ctx,
}: RequestInfo): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return Response.redirect(`${url.origin}/settings?linear_error=${error}`, 302);
  }

  if (!code || !state) {
    return Response.redirect(`${url.origin}/settings?linear_error=missing_params`, 302);
  }

  // Validate CSRF state
  const cookies = request.headers.get('Cookie') ?? '';
  const stateCookie = cookies
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('linear_oauth_state='));
  const storedState = stateCookie?.split('=').slice(1).join('=');

  if (!storedState || storedState !== state) {
    const isValid = await validateOAuthState(env.BETTER_AUTH_SECRET, state);
    if (!isValid) {
      return Response.redirect(`${url.origin}/settings?linear_error=invalid_state`, 302);
    }
  }

  try {
    const redirectUri = `${url.origin}/api/integrations/linear/callback`;
    await exchangeCodeForConnection(env, ctx.user!.id, code, redirectUri);

    // Clear the state cookie and redirect to settings with success
    const response = Response.redirect(`${url.origin}/settings?linear_connected=true`, 302);
    response.headers.append(
      'Set-Cookie',
      'linear_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/integrations/linear; Max-Age=0'
    );
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Linear OAuth callback error:', message);
    return Response.redirect(
      `${url.origin}/settings?linear_error=auth_failed`,
      302
    );
  }
}

/**
 * Disconnect Linear integration.
 */
export async function handleLinearDisconnect({
  ctx,
}: RequestInfo): Promise<Response> {
  await disconnectLinear(ctx.user!.id);
  return Response.json({ success: true });
}

/**
 * Check Linear integration connection status.
 */
export async function handleLinearStatus({
  ctx,
}: RequestInfo): Promise<Response> {
  const connection = await getLinearConnection(ctx.user!.id);

  if (!connection) {
    return Response.json({ connected: false });
  }

  const metadata = connection.metadata ? JSON.parse(connection.metadata) : {};
  return Response.json({
    connected: true,
    email: metadata.email ?? null,
    name: metadata.name ?? null,
    displayName: metadata.displayName ?? null,
    connectedAt: connection.createdAt,
  });
}
