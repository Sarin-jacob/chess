// Offline support: network-first for pages and the manifest, cache-first for hashed assets.
// Registered as sw.js?v=<build>, so every deploy installs afresh into its own cache.
const BUILD = new URL(location.href).searchParams.get('v') || 'dev';
const CACHE = 'nine-peaks-' + BUILD;
const SHELL = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './icon-192.png', './icon-512.png', './fonts/mashanzheng-subset.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then(async (c) => {
        await c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
        // The whole build, so the 3D board, the hidden paths and the engines work offline
        // even if they were never opened online.
        try {
          const list = await (await fetch('./precache.json', { cache: 'no-store' })).json();
          await c.addAll(list.map((f) => new Request('./' + f, { cache: 'reload' })));
        } catch {
          /* no list (dev): files are cached as they are used */
        }
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  // The manifest isn't hashed, so fetch it fresh when online (its id and colours can change).
  if (new URL(req.url).pathname.endsWith('.webmanifest')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req, { ignoreVary: true })),
    );
    return;
  }

  // Hashed files never vary, and a Vary: Origin header would stop crossorigin scripts matching.
  e.respondWith(
    caches.match(req, { ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
