import { nanoid } from 'nanoid';

import { db } from '@/db';
import {
  generateOAuthState,
  validateOAuthState,
} from '@/lib/services/google-auth-service';

export { generateOAuthState, validateOAuthState };

const LINEAR_AUTH_URL = 'https://linear.app/oauth/authorize';
const LINEAR_TOKEN_URL = 'https://api.linear.app/oauth/token';
const LINEAR_REVOKE_URL = 'https://api.linear.app/oauth/revoke';
const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

const LINEAR_SCOPE = 'read';

// Refresh tokens 5 minutes before they expire
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export interface LinearConnection {
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
 * Get the user's active Linear integration connection.
 * Returns null if no active connection exists.
 */
export async function getLinearConnection(
  userId: string
): Promise<LinearConnection | null> {
  const connection = await db
    .selectFrom('integration_connection')
    .where('userId', '=', userId)
    .where('provider', '=', 'linear')
    .where('status', '=', 'active')
    .selectAll()
    .executeTakeFirst();

  return (connection as LinearConnection) ?? null;
}

/**
 * Get a valid Linear access token for the user.
 * Automatically refreshes if the token is expired or about to expire.
 * Linear tokens are typically long-lived, so refresh is only needed
 * when tokenExpiresAt is set and approaching expiry.
 */
export async function getValidLinearToken(
  env: Env,
  userId: string
): Promise<{ accessToken: string; connection: LinearConnection }> {
  const connection = await getLinearConnection(userId);
  if (!connection) {
    throw new LinearAuthError('linear_not_connected', 'No Linear account connected');
  }

  // Only check refresh if tokenExpiresAt is set (Linear tokens may be long-lived)
  if (connection.tokenExpiresAt) {
    const expiresAt = new Date(connection.tokenExpiresAt).getTime();
    const now = Date.now();
    if (now >= expiresAt - TOKEN_REFRESH_BUFFER_MS) {
      return refreshLinearToken(env, connection);
    }
  }

  return { accessToken: connection.accessToken, connection };
}

/**
 * Refresh the Linear access token using the stored refresh token.
 */
async function refreshLinearToken(
  env: Env,
  connection: LinearConnection
): Promise<{ accessToken: string; connection: LinearConnection }> {
  if (!connection.refreshToken) {
    await db
      .updateTable('integration_connection')
      .set({ status: 'expired', updatedAt: new Date().toISOString() })
      .where('id', '=', connection.id)
      .execute();
    throw new LinearAuthError(
      'linear_token_expired',
      'Linear connection has expired. Please reconnect your Linear account.'
    );
  }

  const response = await fetch(LINEAR_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.LINEAR_CLIENT_ID,
      client_secret: env.LINEAR_CLIENT_SECRET,
      refresh_token: connection.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    await db
      .updateTable('integration_connection')
      .set({ status: 'expired', updatedAt: new Date().toISOString() })
      .where('id', '=', connection.id)
      .execute();
    throw new LinearAuthError(
      'linear_token_expired',
      'Linear connection has expired. Please reconnect your Linear account.'
    );
  }

  const tokens = (await response.json()) as {
    access_token: string;
    expires_in?: number;
    scope?: string;
  };

  const now = new Date();
  const expiresAt = tokens.expires_in
    ? new Date(now.getTime() + tokens.expires_in * 1000)
    : null;

  await db
    .updateTable('integration_connection')
    .set({
      accessToken: tokens.access_token,
      tokenExpiresAt: expiresAt?.toISOString() ?? null,
      updatedAt: now.toISOString(),
    })
    .where('id', '=', connection.id)
    .execute();

  const updated = {
    ...connection,
    accessToken: tokens.access_token,
    tokenExpiresAt: expiresAt?.toISOString() ?? null,
    updatedAt: now.toISOString(),
  };

  return { accessToken: tokens.access_token, connection: updated };
}

/**
 * Build the Linear OAuth authorization URL.
 */
export function buildLinearAuthUrl(env: Env, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env.LINEAR_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: LINEAR_SCOPE,
    state,
    actor: 'user',
  });
  return `${LINEAR_AUTH_URL}?${params}`;
}

/**
 * Exchange an authorization code for tokens and create/update the connection.
 */
export async function exchangeCodeForConnection(
  env: Env,
  userId: string,
  code: string,
  redirectUri: string
): Promise<LinearConnection> {
  // Exchange code for tokens
  const tokenResponse = await fetch(LINEAR_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.LINEAR_CLIENT_ID,
      client_secret: env.LINEAR_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    throw new LinearAuthError('linear_auth_failed', `Failed to exchange code: ${error}`);
  }

  const tokens = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  // Fetch Linear viewer identity via GraphQL
  const viewerResponse = await fetch(LINEAR_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: '{ viewer { id email name displayName } }',
    }),
  });

  if (!viewerResponse.ok) {
    throw new LinearAuthError('linear_auth_failed', 'Failed to fetch Linear user info');
  }

  const viewerData = (await viewerResponse.json()) as {
    data?: {
      viewer: {
        id: string;
        email: string;
        name: string;
        displayName: string;
      };
    };
  };

  if (!viewerData.data?.viewer) {
    throw new LinearAuthError('linear_auth_failed', 'Failed to fetch Linear user info');
  }

  const viewer = viewerData.data.viewer;
  const now = new Date();
  const expiresAt = tokens.expires_in
    ? new Date(now.getTime() + tokens.expires_in * 1000)
    : null;

  // Check for existing connection
  const existing = await db
    .selectFrom('integration_connection')
    .where('userId', '=', userId)
    .where('provider', '=', 'linear')
    .where('providerAccountId', '=', viewer.id)
    .selectAll()
    .executeTakeFirst();

  if (existing) {
    // Update existing connection
    await db
      .updateTable('integration_connection')
      .set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? existing.refreshToken,
        tokenExpiresAt: expiresAt?.toISOString() ?? null,
        scope: tokens.scope ?? LINEAR_SCOPE,
        status: 'active',
        metadata: JSON.stringify({
          email: viewer.email,
          name: viewer.name,
          displayName: viewer.displayName,
        }),
        updatedAt: now.toISOString(),
      })
      .where('id', '=', existing.id)
      .execute();

    return {
      ...(existing as unknown as LinearConnection),
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? (existing as unknown as LinearConnection).refreshToken,
      tokenExpiresAt: expiresAt?.toISOString() ?? null,
      scope: tokens.scope ?? LINEAR_SCOPE,
      status: 'active',
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
      provider: 'linear',
      providerAccountId: viewer.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      tokenExpiresAt: expiresAt?.toISOString() ?? null,
      scope: tokens.scope ?? LINEAR_SCOPE,
      status: 'active',
      metadata: JSON.stringify({
        email: viewer.email,
        name: viewer.name,
        displayName: viewer.displayName,
      }),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })
    .execute();

  return {
    id,
    userId,
    provider: 'linear',
    providerAccountId: viewer.id,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    tokenExpiresAt: expiresAt?.toISOString() ?? null,
    scope: tokens.scope ?? LINEAR_SCOPE,
    status: 'active',
    metadata: JSON.stringify({
      email: viewer.email,
      name: viewer.name,
      displayName: viewer.displayName,
    }),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

/**
 * Disconnect (revoke) a Linear integration connection.
 */
export async function disconnectLinear(userId: string): Promise<void> {
  const connection = await getLinearConnection(userId);
  if (!connection) return;

  // Revoke the token with Linear (best effort)
  try {
    await fetch(LINEAR_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: connection.accessToken,
      }),
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

export class LinearAuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'LinearAuthError';
  }
}
