import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';

const BUILD_ID = Date.now().toString(36);

/** Lists every file the build made, so the service worker can cache it all on install. */
function precacheList(): Plugin {
  return {
    name: 'precache-list',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && !f.endsWith('.woff') && f !== 'index.html');
      this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify(files) });
    },
  };
}

// Relative base so the build works on GitHub Pages (/chess/) or any static host.
export default defineConfig({
  base: './',
  plugins: [svelte(), precacheList()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  worker: { format: 'es' },
  // three.js lives in the lazily loaded 3D chunk, which is expected to be large.
  build: { chunkSizeWarningLimit: 700 },
  server: { host: true },
});
