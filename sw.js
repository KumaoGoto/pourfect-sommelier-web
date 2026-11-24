const VERSION = 'daba633e9a98';
const PRECACHE = [
  './',
  'v/daba633e9a98/app.css',
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
  'v/daba633e9a98/js/app.js',
  'v/daba633e9a98/js/three.module.js',
  'v/daba633e9a98/js/web.js',
  'manifest.webmanifest',
  'privacy.html',
];
const CACHE = `pourfectsommelier-${VERSION}`;
self.addEventListener('install', (e) => {
  const fresh = PRECACHE.map((u) => new Request(u, { cache: 'reload' }));
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(fresh)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const old = keys.filter((k) => k.startsWith('pourfectsommelier-') && k !== CACHE);
    await Promise.all(old.map((k) => caches.delete(k)));
    await self.clients.claim();
    if (old.length) await tellPages();
  })());
});
const ASK_MS = 2000;
function isGameUrl(href) {
  try {
    const scope = new URL(self.registration.scope).pathname;
    const p = new URL(href).pathname;
    return p === scope || p === `${scope}index.html`;
  } catch (e) { return false; }
}
function ask(client) {
  return new Promise((resolve) => {
    let done = false;
    const end = (v) => { if (!done) { done = true; resolve(v); } };
    setTimeout(() => end(false), ASK_MS);
    try {
      const ch = new MessageChannel();
      ch.port1.onmessage = (m) => { if (m.data && m.data.type === 'ps-update-ack') end(true); };
      client.postMessage({ type: 'ps-update' }, [ch.port2]);
    } catch (e) { end(false); }
  });
}
async function tellPages() {
  try {
    const list = (await self.clients.matchAll({ type: 'window' })).filter((c) => isGameUrl(c.url));
    const answered = await Promise.all(list.map(ask));
    list.forEach((c, i) => {
      if (answered[i] || c.visibilityState === 'hidden' || typeof c.navigate !== 'function') return;
      try { Promise.resolve(c.navigate(c.url)).catch(() => {}); } catch (e) {}
    });
  } catch (e) {}
}
function isGamePage(req, url) {
  if (req.mode !== 'navigate') return false;
  return isGameUrl(url.href);
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
