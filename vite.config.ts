import { fileURLToPath, URL } from 'node:url';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/tim-city/',
  plugins: [preact()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    // Three.js alone is most of the vendor chunk; it is cached across releases.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Three.js and the post-processing library change rarely: one
        // long-cached vendor chunk, apart from the game code.
        manualChunks(id: string) {
          return /node_modules\/(three|postprocessing)\//.test(id) ? 'vendor' : undefined;
        },
      },
    },
  },
});
