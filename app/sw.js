// Offline cache for the app shell. API calls always go to the network.
// Bump on every change so phones pick up new code (pengbit-v3, v4, ...).
const CACHE = 'pengbit-v21-focus';
const SHELL = ['./', 'index.html', 'style.css', 'manifest.webmanifest',
  'js/main.js', 'js/pet.js', 'js/activity.js', 'js/pose.js', 'js/sprites.js', 'js/sprites-builtin.js', 'js/audio.js', 'js/ai.js',
  'js/evolutions.js', 'js/recap.js', 'js/focus-timer.js', 'css/focus.css', 'sprites/study-actions.png',
  'js/bus.js', 'js/ctx.js', 'js/features.js', 'js/pip.js', 'css/pip.css', 'js/mood.js', 'js/mirror.js', 'js/names.js', 'css/names.css', 'js/exercise.js', 'js/reps.js',
  'js/desk.js', 'js/posture.js', 'js/roam.js', 'js/roamer.js', 'roam.html', 'js/onboarding.js', 'css/onboarding.css',
  'js/flock.js', 'js/flock-core.js', 'js/fedavg.js', 'flock.html', 'js/flock-screen.js', 'js/flock-sim.js', 'js/vendor/qrcode.js', 'css/flock-screen.css',
  'css/flock.css', 'css/move.css', 'css/insights.css', 'css/talk.css', 'css/desk.css', 'css/campus.css', 'css/retro.css',
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
