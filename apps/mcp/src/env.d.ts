// Environment bindings for the MCP server worker
// Secrets should be set via `wrangler secret put`

declare namespace Cloudflare {
  interface Env {
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    COOKIE_ENCRYPTION_KEY: string;
    MCP_OBJECT: DurableObjectNamespace;
    OAUTH_KV: KVNamespace;
    WEB_APP: Fetcher;
  }
}

// Global Env interface (used by Hono bindings and McpAgent generics)
interface Env extends Cloudflare.Env {}
