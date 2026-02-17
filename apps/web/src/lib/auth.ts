import { betterAuth } from 'better-auth';
import { username } from 'better-auth/plugins';

import { rwsdkAdapter } from './durableObjectAdapter';

export const createAuth = (env: Env) => {
  return betterAuth({
    database: rwsdkAdapter(),
    baseURL: env.BETTER_AUTH_URL || 'http://localhost:5173',
    secret: env.BETTER_AUTH_SECRET,
    logger: {
      level: 'debug',
    },
    trustedOrigins: [env.BETTER_AUTH_URL],
    emailAndPassword: {
      enabled: false, // Disable email/password auth, only use OAuth
    },
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        // Better Auth will automatically handle the callback URL
      },
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5, // 5 minutes - enough for OAuth flow
      },
    },
    advanced: {
      defaultCookieAttributes: {
        sameSite: 'lax',
      },
    },
    callbacks: {
      async onSignIn() {
        // Redirect to home page after successful sign in
        return {
          redirect: '/',
        };
      },
    },

    plugins: [username()],
    // Better Auth automatically creates the required tables:
    // - user (id, email, emailVerified, name, image, createdAt, updatedAt)
    // - session (id, userId, expiresAt, ipAddress, userAgent)
    // - account (id, userId, accountId, providerId, accessToken, refreshToken, expiresAt, scope)
    //
    // The username plugin adds:
    // - username field to user table
    //
    // Our existing schema is compatible with these requirements
  });
};

// CLI-compatible configuration that doesn't require runtime imports
// This will be used by Better Auth CLI for schema generation
const createAuthForCLI = async () => {
  // Use process.env for CLI context
  const env = process.env;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createAuth(env as any);
};

// Export for CLI compatibility - Better Auth CLI will detect this
export const auth = await createAuthForCLI();

// Type inference from Better Auth with username plugin
// getSession() returns { session: {...}, user: {...} }
export type Session = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
> & {
  user: typeof auth.$Infer.Session.user & {
    username?: string | null; // Added by username plugin
  };
};

export type User = typeof auth.$Infer.Session.user & {
  username?: string | null; // Added by username plugin
};
