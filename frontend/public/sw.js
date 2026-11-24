/* PhoneStock Pro: offline application shell. Never cache API responses or cookies. */
const CACHE = 'phonestock-shell-v2';
const BOOT = ['/', '/index.html', '/manifest.webmanifest'];
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(BOOT);
    // Precache Vite's production JS/CSS identified in the generated index.html.
    // Without this, the app would show offline HTML but could not launch its UI
    // until a *second* online reload had cached its scripts.
    const shell = await cache.match('/index.html');
    if (shell) {
      const html = await shell.text();
      const assets = [...html.matchAll(/(?:src|href)="(\/(?:assets\/[^"]+|src\/main\.tsx))"/g)]
        .map((match) => match[1]);
      await Promise.all(assets.map((asset) => cache.add(asset).catch(() => {})));
    }
  })());
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('phonestock-shell-') && key !== CACHE)
      .map((key) => caches.delete(key)))).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Strictly no /api cache: authenticated data must never leak via shared HTTP cache.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/@vite') ||
      url.pathname.startsWith('/__vite') || url.pathname.startsWith('/@react-refresh')) return;
  // Don't cache websocket/HMR or documents that aren't application shell assets.
  if (request.destination && !['document', 'script', 'style', 'font', 'image', 'manifest'].includes(request.destination)) return;
  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(request, { ignoreSearch: request.mode === 'navigate' });
      if (cached) return cached;
      if (request.mode === 'navigate') return (await caches.match('/')) || Response.error();
      return Response.error();
    })
  );
});
