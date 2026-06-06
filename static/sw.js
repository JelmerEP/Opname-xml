// Service worker - network-first: online altijd verse bestanden, offline val terug op cache.
const CACHE = 'vabi-app-dev-v13';
const SHELL = ['./','index.html','style.css','app.js','inmeten.js','manifest.webmanifest','icon-192.png','icon-512.png','logo.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.pathname.includes('/api/')) return;          // API altijd rechtstreeks via netwerk
  if (e.request.method !== 'GET') return;
  // network-first: probeer vers van de server; lukt dat niet (offline) -> cache
  e.respondWith(
    fetch(e.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return resp;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
