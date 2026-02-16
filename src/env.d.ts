// Extend the Cloudflare Env interface with auth-related environment variables
// These should be set via wrangler secret for production
declare module 'cloudflare:workers' {
  interface Env {
    BETTER_AUTH_URL: string;
    BETTER_AUTH_SECRET: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
  }
}
