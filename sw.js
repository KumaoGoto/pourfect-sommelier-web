const VERSION = 'be939c149595';
const PRECACHE = [
  './',
  'v/be939c149595/app.css',
  'assets/fonts/cormorant-italic.woff',
  'assets/fonts/cormorant.woff',
  'assets/fonts/shippori-500.woff',
  'assets/fonts/shippori-700.woff',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/favicon-32.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/licenses/OFL-CormorantGaramond.txt',
  'assets/licenses/OFL-ShipporiMincho.txt',
  'assets/licenses/three.js-LICENSE.txt',
  'index.html',
  'v/be939c149595/js/app.js',
  'v/be939c149595/js/three.module.js',
  'v/be939c149595/js/web.js',
  'manifest.webmanifest',
  'privacy.html',
];
const CACHE = `pourfectsommelier-${VERSION}`;
self.addEventListener('install', (e) => {
  const fresh = PRECACHE.map((u) => new Request(u, { cache: 'reload' }));
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(fresh)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pourfectsommelier-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
function isGamePage(req, url) {
  if (req.mode !== 'navigate') return false;
  const scope = new URL(self.registration.scope).pathname;
  return url.pathname === scope || url.pathname === `${scope}index.html`;
}
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const game = isGamePage(req, url);
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(game ? 'index.html' : req, { ignoreSearch: game });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.status === 200 && res.type === 'basic') e.waitUntil(cache.put(req, res.clone()));
    return res;
  })());
});
