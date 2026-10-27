import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages (/chess/) or any static host.
export default defineConfig({
  base: './',
  plugins: [svelte()],
  worker: { format: 'es' },
  // three.js lives in the lazily loaded 3D chunk, which is expected to be large.
  build: { chunkSizeWarningLimit: 700 },
  server: { host: true },
});
