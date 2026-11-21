// Offline cache for the app shell. API calls always go to the network.
const CACHE = 'pengbit-v3';
const SHELL = ['./', 'index.html', 'style.css', 'manifest.webmanifest',
  'js/main.js', 'js/pet.js', 'js/activity.js', 'js/pose.js', 'js/sprites.js', 'js/sprites-builtin.js', 'js/audio.js', 'js/ai.js',
  'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first so new deploys show up right away; cache when offline.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.includes('/api/') || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request)));
});
