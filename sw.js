const CACHE = 'eobcheck-v8';
const ASSETS = ['/', '/privacy', '/terms', '/refund-policy', '/sitemap', '/manifest.json', '/icon.svg', '/favicon.ico', '/favicon-48.png', '/favicon-192.png', '/favicon-512.png', '/apple-touch-icon.png', '/blog', '/blog/why-medical-bill-doesnt-match-eob', '/blog/how-to-read-an-eob', '/blog/good-faith-estimate-dispute-guide', '/blog/bill-higher-than-eob', '/blog/medical-bill-dispute-letter-template'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Network-first: always try to get the latest version while online.
  // Only fall back to the cached copy if the network request fails (e.g. offline).
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
