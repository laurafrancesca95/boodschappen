// Service worker: laat de app ook zonder internet openen.
const VERSION = 'v2';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/main.js', './js/store.js', './js/model.js', './js/ui.js', './js/ingredients.js', './js/importer.js', './js/seed.js',
  './icons/icon.svg', './icons/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'fonts').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Lettertype: bewaren na de eerste keer
  if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    e.respondWith(caches.open('fonts').then(async (c) => (await c.match(req)) || fetch(req).then((r) => { c.put(req, r.clone()).catch(() => {}); return r; })));
    return;
  }
  if (url.origin !== location.origin) return;
  // Eigen bestanden: eerst het netwerk (zo krijg je updates), anders uit de cache
  const key = req.mode === 'navigate' ? './index.html' : req;
  e.respondWith(
    fetch(req).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(key, copy)); }
      return r;
    }).catch(() => caches.match(key, { ignoreSearch: true }))
  );
});
