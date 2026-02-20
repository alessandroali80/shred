const CACHE = 'shred-v1';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './data.js',
  './manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Network first per le risorse audio (Soundfont CDN), cache first per il resto
  if (e.request.url.includes('cdn.jsdelivr') || e.request.url.includes('gleitz')) {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        fetch(e.request)
          .then(res => { cache.put(e.request, res.clone()); return res; })
          .catch(() => cache.match(e.request))
      )
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
});
