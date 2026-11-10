// Service worker: makes BREACH: ZERO installable as an app and playable offline.
// Network first, so a new version on the site always wins; the last copy of every file
// (the game, three.js from the CDN, the fonts) is kept for when there is no connection.
const CACHE = 'bz-v1';
const SHELL = ['./', 'index.html', 'style.css', 'manifest.webmanifest', 'favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/main.js', 'js/levels.js', 'js/world.js', 'js/enemies.js', 'js/player.js', 'js/fx.js', 'js/audio.js', 'js/textures.js', 'js/merge.js', 'js/pad.js'];
const CACHED_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin && !CACHED_HOSTS.includes(url.hostname)) return;
  const key = url.origin === self.location.origin ? req.url.split('?')[0] : req.url;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)).catch(() => {}); }
      return res;
    } catch (err) {
      const hit = await caches.match(key);
      if (hit) return hit;
      throw err;
    }
  })());
});
