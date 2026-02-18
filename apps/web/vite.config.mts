import { defineConfig } from 'vite';
import { redwood } from 'rwsdk/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  environments: {
    worker: {
      build: {
        rollupOptions: {
          // chromadb dynamically imports @chroma-core/default-embed which has native deps.
          // We use Jina + SPLADE instead, so externalize it.
          external: ['@chroma-core/default-embed'],
        },
      },
    },
  },
  plugins: [
    tailwindcss(),
    cloudflare({
      viteEnvironment: { name: 'worker' },
    }),
    redwood(),
  ],
});
