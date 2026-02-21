import { nanoid } from 'nanoid';

import { db } from '@/db';
import {
  generateOAuthState,
  validateOAuthState,
} from '@/lib/services/google-auth-service';

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';

// Scopes: 'repo' for private repo access, 'read:project' for Projects V2
const GITHUB_INTEGRATION_SCOPES = 'repo read:project';

// Re-validate token every 24 hours (GitHub tokens don't have built-in expiry)
const TOKEN_REVALIDATION_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Re-export for convenience
export { generateOAuthState, validateOAuthState };

export interface GitHubConnection {
  id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  scope: string | null;
  status: string;
  metadata: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Get the user's active GitHub integration connection.
 * Returns null if no active connection exists.
 */
export async function getGitHubIntegrationConnection(
  userId: string
): Promise<GitHubConnection | null> {
  const connection = await db
    .selectFrom('integration_connection')
    .where('userId', '=', userId)
    .where('provider', '=', 'github_integration')
    .where('status', '=', 'active')
    .selectAll()
    .executeTakeFirst();

  return (connection as GitHubConnection) ?? null;
}

/**
 * Get a valid GitHub access token for the user.
 * Periodically re-validates the token since GitHub tokens don't expire on a timer.
 * Throws if no connection exists or the token has been revoked.
 */
export async function getValidGitHubToken(
  env: Env,
  userId: string
): Promise<{ accessToken: string; connection: GitHubConnection }> {
  const connection = await getGitHubIntegrationConnection(userId);
  if (!connection) {
    throw new GitHubAuthError('github_not_connected', 'No GitHub account connected');
  }

  // Check if we need to re-validate the token
  if (connection.tokenExpiresAt) {
    const expiresAt = new Date(connection.tokenExpiresAt).getTime();
    if (Date.now() >= expiresAt) {
      return validateAndUpdateToken(connection);
    }
  }

  return { accessToken: connection.accessToken, connection };
}

/**
 * Validate a GitHub token by calling the /user endpoint.
 * Updates the next revalidation time on success, marks as expired on failure.
 */
async function validateAndUpdateToken(
  connection: GitHubConnection
): Promise<{ accessToken: string; connection: GitHubConnection }> {
  const isValid = await validateGitHubToken(connection.accessToken);

  if (!isValid) {
    await db
      .updateTable('integration_connection')
      .set({ status: 'expired', updatedAt: new Date().toISOString() })
      .where('id', '=', connection.id)
      .execute();
    throw new GitHubAuthError(
      'github_token_expired',
      'GitHub connection has expired. Please reconnect your GitHub account.'
    );
  }

  // Token is valid — schedule next revalidation
  const nextCheck = new Date(Date.now() + TOKEN_REVALIDATION_INTERVAL_MS);
  await db
    .updateTable('integration_connection')
    .set({
      tokenExpiresAt: nextCheck.toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where('id', '=', connection.id)
    .execute();

  const updated = {
    ...connection,
    tokenExpiresAt: nextCheck.toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return { accessToken: connection.accessToken, connection: updated };
}

/**
 * Validate a GitHub access token by calling the /user endpoint.
 */
async function validateGitHubToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(GITHUB_USER_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Lored/1.0',
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Build the GitHub OAuth authorization URL.
 */
export function buildGitHubAuthUrl(env: Env, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: GITHUB_INTEGRATION_SCOPES,
    state,
  });
  return `${GITHUB_AUTH_URL}?${params}`;
}

/**
 * Exchange an authorization code for tokens and create/update the connection.
 */
export async function exchangeCodeForConnection(
  env: Env,
  userId: string,
  code: string,
  redirectUri: string
): Promise<GitHubConnection> {
  // Exchange code for access token
  const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    throw new GitHubAuthError('github_auth_failed', `Failed to exchange code: ${error}`);
  }

  const tokens = (await tokenResponse.json()) as {
    access_token?: string;
    token_type?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (tokens.error || !tokens.access_token) {
    throw new GitHubAuthError(
      'github_auth_failed',
      tokens.error_description ?? tokens.error ?? 'Failed to obtain access token'
    );
  }

  // Fetch GitHub user info
  const userinfoResponse = await fetch(GITHUB_USER_URL, {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Lored/1.0',
    },
  });

  if (!userinfoResponse.ok) {
    throw new GitHubAuthError('github_auth_failed', 'Failed to fetch GitHub user info');
  }

  const userinfo = (await userinfoResponse.json()) as {
    id: number;
    login: string;
    name: string | null;
    email: string | null;
    avatar_url: string;
  };

  const now = new Date();
  const nextCheck = new Date(now.getTime() + TOKEN_REVALIDATION_INTERVAL_MS);
  const providerAccountId = String(userinfo.id);

  // Check for existing connection
  const existing = await db
    .selectFrom('integration_connection')
    .where('userId', '=', userId)
    .where('provider', '=', 'github_integration')
    .where('providerAccountId', '=', providerAccountId)
    .selectAll()
    .executeTakeFirst();

  const metadata = JSON.stringify({
    login: userinfo.login,
    name: userinfo.name,
    email: userinfo.email,
    avatarUrl: userinfo.avatar_url,
  });

  if (existing) {
    await db
      .updateTable('integration_connection')
      .set({
        accessToken: tokens.access_token,
        tokenExpiresAt: nextCheck.toISOString(),
        scope: tokens.scope ?? GITHUB_INTEGRATION_SCOPES,
        status: 'active',
        metadata,
        updatedAt: now.toISOString(),
      })
      .where('id', '=', existing.id)
      .execute();

    return {
      ...(existing as unknown as GitHubConnection),
      accessToken: tokens.access_token,
      tokenExpiresAt: nextCheck.toISOString(),
      scope: tokens.scope ?? GITHUB_INTEGRATION_SCOPES,
      status: 'active',
      metadata,
      updatedAt: now.toISOString(),
    };
  }

  // Create new connection
  const id = nanoid();
  await db
    .insertInto('integration_connection')
    .values({
      id,
      userId,
      provider: 'github_integration',
      providerAccountId,
      accessToken: tokens.access_token,
      refreshToken: null,
      tokenExpiresAt: nextCheck.toISOString(),
      scope: tokens.scope ?? GITHUB_INTEGRATION_SCOPES,
      status: 'active',
      metadata,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })
    .execute();

  return {
    id,
    userId,
    provider: 'github_integration',
    providerAccountId,
    accessToken: tokens.access_token,
    refreshToken: null,
    tokenExpiresAt: nextCheck.toISOString(),
    scope: tokens.scope ?? GITHUB_INTEGRATION_SCOPES,
    status: 'active',
    metadata,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

/**
 * Disconnect (revoke) a GitHub integration connection.
 */
export async function disconnectGitHub(env: Env, userId: string): Promise<void> {
  const connection = await getGitHubIntegrationConnection(userId);
  if (!connection) return;

  // Revoke the token with GitHub (best effort)
  // Uses the OAuth App token deletion endpoint
  try {
    const credentials = btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`);
    await fetch(`https://api.github.com/applications/${env.GITHUB_CLIENT_ID}/token`, {
      method: 'DELETE',
      headers: {
        Authorization: `Basic ${credentials}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Lored/1.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ access_token: connection.accessToken }),
    });
  } catch {
    // Revocation failure is non-critical
  }

  await db
    .updateTable('integration_connection')
    .set({ status: 'revoked', updatedAt: new Date().toISOString() })
    .where('id', '=', connection.id)
    .execute();
}

export class GitHubAuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'GitHubAuthError';
  }
}
