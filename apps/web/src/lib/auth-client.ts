import { createAuthClient } from 'better-auth/client';
import { organizationClient, usernameClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL:
    typeof window !== 'undefined'
      ? window.location.origin + '/api/auth'
      : 'http://localhost:5173/api/auth',
  plugins: [
    usernameClient(),
    organizationClient({
      teams: {
        enabled: true,
      },
    }),
  ],
});

export const { signIn, signOut, signUp, getSession, useSession } = authClient;
export const { organization } = authClient;
