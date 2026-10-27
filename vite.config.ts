import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages (/chess/) or any static host.
export default defineConfig({
  base: './',
  plugins: [svelte()],
  worker: { format: 'es' },
  server: { host: true },
});
