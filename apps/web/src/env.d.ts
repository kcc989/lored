// Extend the Cloudflare Env interface with auth-related environment variables
// These should be set via wrangler secret for production
declare module 'cloudflare:workers' {
  interface Env {
    BETTER_AUTH_URL: string;
    BETTER_AUTH_SECRET: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    // ChromaDB Cloud
    CHROMA_HOST: string;
    CHROMA_API_KEY: string;
    CHROMA_TENANT: string;
    CHROMA_DATABASE: string;
    // Jina AI embeddings
    JINA_API_KEY: string;
    // Anthropic (extraction agent)
    ANTHROPIC_API_KEY: string;
    // Google OAuth (for Google Docs integration)
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    // Linear OAuth (for Linear integration)
    LINEAR_CLIENT_ID: string;
    LINEAR_CLIENT_SECRET: string;
  }
}

// Also extend the global Cloudflare.Env (used by worker-configuration.d.ts)
declare namespace Cloudflare {
  interface Env {
    BETTER_AUTH_SECRET: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    // ChromaDB Cloud
    CHROMA_HOST: string;
    CHROMA_API_KEY: string;
    CHROMA_TENANT: string;
    CHROMA_DATABASE: string;
    // Jina AI embeddings
    JINA_API_KEY: string;
    // Anthropic (extraction agent)
    ANTHROPIC_API_KEY: string;
    // Google OAuth (for Google Docs integration)
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    // Linear OAuth (for Linear integration)
    LINEAR_CLIENT_ID: string;
    LINEAR_CLIENT_SECRET: string;
  }
}
