import { nanoid } from 'nanoid';

import { db } from '@/db';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

// Refresh tokens 5 minutes before they expire
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export interface GoogleConnection {
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
 * Get the user's active Google integration connection.
 * Returns null if no active connection exists.
 */
export async function getGoogleConnection(
  userId: string
): Promise<GoogleConnection | null> {
  const connection = await db
    .selectFrom('integration_connection')
    .where('userId', '=', userId)
    .where('provider', '=', 'google')
    .where('status', '=', 'active')
    .selectAll()
    .executeTakeFirst();

  return (connection as GoogleConnection) ?? null;
}

/**
 * Get a valid Google access token for the user.
 * Automatically refreshes if the token is expired or about to expire.
 * Throws if no connection exists or the refresh fails.
 */
export async function getValidGoogleToken(
  env: Env,
  userId: string
): Promise<{ accessToken: string; connection: GoogleConnection }> {
  const connection = await getGoogleConnection(userId);
  if (!connection) {
    throw new GoogleAuthError('google_not_connected', 'No Google account connected');
  }

  // Check if token needs refresh
  if (connection.tokenExpiresAt) {
    const expiresAt = new Date(connection.tokenExpiresAt).getTime();
    const now = Date.now();
    if (now >= expiresAt - TOKEN_REFRESH_BUFFER_MS) {
      return refreshGoogleToken(env, connection);
    }
  }

  return { accessToken: connection.accessToken, connection };
}

/**
 * Refresh the Google access token using the stored refresh token.
 */
async function refreshGoogleToken(
  env: Env,
  connection: GoogleConnection
): Promise<{ accessToken: string; connection: GoogleConnection }> {
  if (!connection.refreshToken) {
    // Mark connection as expired if we can't refresh
    await db
      .updateTable('integration_connection')
      .set({ status: 'expired', updatedAt: new Date().toISOString() })
      .where('id', '=', connection.id)
      .execute();
    throw new GoogleAuthError(
      'google_token_expired',
      'Google connection has expired. Please reconnect your Google account.'
    );
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: connection.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    // Token has been revoked or is invalid
    await db
      .updateTable('integration_connection')
      .set({ status: 'expired', updatedAt: new Date().toISOString() })
      .where('id', '=', connection.id)
      .execute();
    throw new GoogleAuthError(
      'google_token_expired',
      'Google connection has expired. Please reconnect your Google account.'
    );
  }

  const tokens = (await response.json()) as {
    access_token: string;
    expires_in: number;
    scope?: string;
  };

  const now = new Date();
  const expiresAt = new Date(now.getTime() + tokens.expires_in * 1000);

  await db
    .updateTable('integration_connection')
    .set({
      accessToken: tokens.access_token,
      tokenExpiresAt: expiresAt.toISOString(),
      updatedAt: now.toISOString(),
    })
    .where('id', '=', connection.id)
    .execute();

  const updated = {
    ...connection,
    accessToken: tokens.access_token,
    tokenExpiresAt: expiresAt.toISOString(),
    updatedAt: now.toISOString(),
  };

  return { accessToken: tokens.access_token, connection: updated };
}

/**
 * Build the Google OAuth authorization URL.
 */
export function buildGoogleAuthUrl(env: Env, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: DRIVE_READONLY_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

/**
 * Exchange an authorization code for tokens and create/update the connection.
 */
export async function exchangeCodeForConnection(
  env: Env,
  userId: string,
  code: string,
  redirectUri: string
): Promise<GoogleConnection> {
  // Exchange code for tokens
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    throw new GoogleAuthError('google_auth_failed', `Failed to exchange code: ${error}`);
  }

  const tokens = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };

  // Fetch Google user info
  const userinfoResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userinfoResponse.ok) {
    throw new GoogleAuthError('google_auth_failed', 'Failed to fetch Google user info');
  }

  const userinfo = (await userinfoResponse.json()) as {
    id: string;
    email: string;
    name: string;
  };

  const now = new Date();
  const expiresAt = new Date(now.getTime() + tokens.expires_in * 1000);

  // Check for existing connection
  const existing = await db
    .selectFrom('integration_connection')
    .where('userId', '=', userId)
    .where('provider', '=', 'google')
    .where('providerAccountId', '=', userinfo.id)
    .selectAll()
    .executeTakeFirst();

  if (existing) {
    // Update existing connection
    await db
      .updateTable('integration_connection')
      .set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? existing.refreshToken,
        tokenExpiresAt: expiresAt.toISOString(),
        scope: tokens.scope,
        status: 'active',
        metadata: JSON.stringify({ email: userinfo.email, name: userinfo.name }),
        updatedAt: now.toISOString(),
      })
      .where('id', '=', existing.id)
      .execute();

    return {
      ...(existing as unknown as GoogleConnection),
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? (existing as unknown as GoogleConnection).refreshToken,
      tokenExpiresAt: expiresAt.toISOString(),
      scope: tokens.scope,
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
      provider: 'google',
      providerAccountId: userinfo.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      tokenExpiresAt: expiresAt.toISOString(),
      scope: tokens.scope,
      status: 'active',
      metadata: JSON.stringify({ email: userinfo.email, name: userinfo.name }),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })
    .execute();

  return {
    id,
    userId,
    provider: 'google',
    providerAccountId: userinfo.id,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    tokenExpiresAt: expiresAt.toISOString(),
    scope: tokens.scope,
    status: 'active',
    metadata: JSON.stringify({ email: userinfo.email, name: userinfo.name }),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

/**
 * Disconnect (revoke) a Google integration connection.
 */
export async function disconnectGoogle(userId: string): Promise<void> {
  const connection = await getGoogleConnection(userId);
  if (!connection) return;

  // Revoke the token with Google (best effort)
  try {
    await fetch(`${GOOGLE_REVOKE_URL}?token=${connection.accessToken}`, {
      method: 'POST',
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

/**
 * Generate a state parameter for CSRF protection using HMAC.
 */
export async function generateOAuthState(secret: string): Promise<string> {
  const nonce = nanoid(32);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(nonce));
  const hmac = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return `${nonce}.${hmac}`;
}

/**
 * Validate a state parameter against the expected HMAC.
 */
export async function validateOAuthState(
  secret: string,
  state: string
): Promise<boolean> {
  const parts = state.split('.');
  if (parts.length !== 2) return false;
  const [nonce, hmac] = parts;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  try {
    const signatureBytes = Uint8Array.from(atob(hmac), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(nonce));
  } catch {
    return false;
  }
}

export class GoogleAuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'GoogleAuthError';
  }
}
