import { env } from 'cloudflare:workers';
import type { RequestInfo } from 'rwsdk/worker';

import {
  buildGitHubAuthUrl,
  exchangeCodeForConnection,
  disconnectGitHub,
  getGitHubIntegrationConnection,
  generateOAuthState,
  validateOAuthState,
} from '@/lib/services/github-auth-service';

/**
 * Initiate GitHub OAuth flow for integration (repo access).
 * Redirects the user to GitHub's consent screen.
 */
export async function handleGitHubIntegrationConnect({
  request,
  ctx,
}: RequestInfo): Promise<Response> {
  const state = await generateOAuthState(env.BETTER_AUTH_SECRET);
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/integrations/github/callback`;
  const authUrl = buildGitHubAuthUrl(env, redirectUri, state);

  const response = Response.redirect(authUrl, 302);
  response.headers.append(
    'Set-Cookie',
    `github_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api/integrations/github; Max-Age=600`
  );
  return response;
}

/**
 * Handle the GitHub OAuth callback.
 * Exchanges the authorization code for tokens and stores the connection.
 */
export async function handleGitHubIntegrationCallback({
  request,
  ctx,
}: RequestInfo): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return Response.redirect(`${url.origin}/settings?github_error=${error}`, 302);
  }

  if (!code || !state) {
    return Response.redirect(`${url.origin}/settings?github_error=missing_params`, 302);
  }

  // Validate CSRF state
  const cookies = request.headers.get('Cookie') ?? '';
  const stateCookie = cookies
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('github_oauth_state='));
  const storedState = stateCookie?.split('=').slice(1).join('=');

  if (!storedState || storedState !== state) {
    const isValid = await validateOAuthState(env.BETTER_AUTH_SECRET, state);
    if (!isValid) {
      return Response.redirect(`${url.origin}/settings?github_error=invalid_state`, 302);
    }
  }

  try {
    const redirectUri = `${url.origin}/api/integrations/github/callback`;
    await exchangeCodeForConnection(env, ctx.user!.id, code, redirectUri);

    const response = Response.redirect(`${url.origin}/settings?github_connected=true`, 302);
    response.headers.append(
      'Set-Cookie',
      'github_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/integrations/github; Max-Age=0'
    );
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GitHub OAuth callback error:', message);
    return Response.redirect(
      `${url.origin}/settings?github_error=auth_failed`,
      302
    );
  }
}

/**
 * Disconnect GitHub integration.
 */
export async function handleGitHubIntegrationDisconnect({
  ctx,
}: RequestInfo): Promise<Response> {
  await disconnectGitHub(env, ctx.user!.id);
  return Response.json({ success: true });
}

/**
 * Check GitHub integration connection status.
 */
export async function handleGitHubIntegrationStatus({
  ctx,
}: RequestInfo): Promise<Response> {
  const connection = await getGitHubIntegrationConnection(ctx.user!.id);

  if (!connection) {
    return Response.json({ connected: false });
  }

  const metadata = connection.metadata ? JSON.parse(connection.metadata) : {};
  return Response.json({
    connected: true,
    login: metadata.login ?? null,
    name: metadata.name ?? null,
    connectedAt: connection.createdAt,
  });
}
