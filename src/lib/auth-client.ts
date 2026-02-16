import { createAuthClient } from 'better-auth/client';
import { usernameClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL:
    typeof window !== 'undefined'
      ? window.location.origin + '/api/auth'
      : 'http://localhost:5173/api/auth',
  plugins: [usernameClient()],
});

export const { signIn, signOut, signUp, getSession, useSession } = authClient;
