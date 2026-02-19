import { env } from 'cloudflare:workers';
import type { RequestInfo } from 'rwsdk/worker';

import {
  buildGoogleAuthUrl,
  exchangeCodeForConnection,
  disconnectGoogle,
  generateOAuthState,
  validateOAuthState,
  getGoogleConnection,
} from '@/lib/services/google-auth-service';

/**
 * Initiate Google OAuth flow.
 * Redirects the user to Google's consent screen.
 */
export async function handleGoogleConnect({
  request,
  ctx,
}: RequestInfo): Promise<Response> {
  const state = await generateOAuthState(env.BETTER_AUTH_SECRET);
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/integrations/google/callback`;
  const authUrl = buildGoogleAuthUrl(env, redirectUri, state);

  // Store state in a short-lived cookie for CSRF validation
  const response = Response.redirect(authUrl, 302);
  response.headers.append(
    'Set-Cookie',
    `google_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api/integrations/google; Max-Age=600`
  );
  return response;
}

/**
 * Handle the Google OAuth callback.
 * Exchanges the authorization code for tokens and stores the connection.
 */
export async function handleGoogleCallback({
  request,
  ctx,
}: RequestInfo): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return Response.redirect(`${url.origin}/settings?google_error=${error}`, 302);
  }

  if (!code || !state) {
    return Response.redirect(`${url.origin}/settings?google_error=missing_params`, 302);
  }

  // Validate CSRF state
  const cookies = request.headers.get('Cookie') ?? '';
  const stateCookie = cookies
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('google_oauth_state='));
  const storedState = stateCookie?.split('=').slice(1).join('=');

  if (!storedState || storedState !== state) {
    const isValid = await validateOAuthState(env.BETTER_AUTH_SECRET, state);
    if (!isValid) {
      return Response.redirect(`${url.origin}/settings?google_error=invalid_state`, 302);
    }
  }

  try {
    const redirectUri = `${url.origin}/api/integrations/google/callback`;
    await exchangeCodeForConnection(env, ctx.user!.id, code, redirectUri);

    // Clear the state cookie and redirect to settings with success
    const response = Response.redirect(`${url.origin}/settings?google_connected=true`, 302);
    response.headers.append(
      'Set-Cookie',
      'google_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/integrations/google; Max-Age=0'
    );
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Google OAuth callback error:', message);
    return Response.redirect(
      `${url.origin}/settings?google_error=auth_failed`,
      302
    );
  }
}

/**
 * Disconnect Google integration.
 */
export async function handleGoogleDisconnect({
  ctx,
}: RequestInfo): Promise<Response> {
  await disconnectGoogle(ctx.user!.id);
  return Response.json({ success: true });
}

/**
 * Check Google integration connection status.
 */
export async function handleGoogleStatus({
  ctx,
}: RequestInfo): Promise<Response> {
  const connection = await getGoogleConnection(ctx.user!.id);

  if (!connection) {
    return Response.json({ connected: false });
  }

  const metadata = connection.metadata ? JSON.parse(connection.metadata) : {};
  return Response.json({
    connected: true,
    email: metadata.email ?? null,
    name: metadata.name ?? null,
    connectedAt: connection.createdAt,
  });
}
