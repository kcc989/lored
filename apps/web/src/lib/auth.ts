import { betterAuth } from 'better-auth';
import { organization, username } from 'better-auth/plugins';

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
      enabled: false,
    },
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        scope: ['user:email'],
      },
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
      },
    },
    advanced: {
      defaultCookieAttributes: {
        sameSite: 'lax',
      },
    },
    callbacks: {
      async onSignIn() {
        return {
          redirect: '/',
        };
      },
    },

    plugins: [
      username(),
      organization({
        teams: {
          enabled: true,
        },
        schema: {
          team: {
            additionalFields: {
              parentTeamId: {
                type: 'string',
                required: false,
                input: true,
              },
            },
          },
        },
      }),
    ],
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

// Type inference from Better Auth with organization + username plugins
export type Session = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
> & {
  user: typeof auth.$Infer.Session.user & {
    username?: string | null;
  };
  session: typeof auth.$Infer.Session.session & {
    activeOrganizationId?: string | null;
    activeTeamId?: string | null;
  };
};

export type User = typeof auth.$Infer.Session.user & {
  username?: string | null;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata?: string | null;
  createdAt: string;
};

export type Team = {
  id: string;
  name: string;
  organizationId: string;
  parentTeamId?: string | null;
  createdAt: string;
  updatedAt?: string | null;
};

export type OrgMember = {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  createdAt: string;
};
