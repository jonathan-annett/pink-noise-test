// Pink Noise Test service worker
// - App shell: network-first, so deploys show up on the next visit; falls back to cache offline.
// - music.mp3 and icons: cache-first (large / rarely change). Bump VERSION if you replace music.mp3.
const VERSION = 'v2';
const SHELL = `shell-${VERSION}`;
const MEDIA = `media-${VERSION}`;
const SHELL_FILES = ['/', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png', '/icons/bmc-qr.svg', '/app.css', '/app.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = new Set([SHELL, MEDIA]);
    for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  // The page asks us to cache the music track in the background
  if (e.data === 'cache-music') {
    e.waitUntil(caches.open(MEDIA).then(async c => {
      if (!(await c.match('/music.mp3'))) {
        const r = await fetch('/music.mp3');
        if (r.ok) await c.put('/music.mp3', r);
      }
    }).catch(() => {}));
  }
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Large media: cache-first
  if (url.pathname.endsWith('.mp3') || url.pathname.startsWith('/icons/')) {
    e.respondWith((async () => {
      const cache = await caches.open(url.pathname.endsWith('.mp3') ? MEDIA : SHELL);
      const hit = await cache.match(url.pathname);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.status === 200) cache.put(url.pathname, res.clone());
      return res;
    })());
    return;
  }

  // Everything else (the page, manifest): network-first with cache fallback
  e.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const key = req.mode === 'navigate' ? '/' : url.pathname;
    try {
      const res = await fetch(req);
      if (res.ok && res.status === 200) cache.put(key, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(key);
      if (hit) return hit;
      throw err;
    }
  })());
});
