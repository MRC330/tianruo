/* PWA Service Worker：离线缓存 App 外壳，接口请求走网络 */
const CACHE = 'tianruo-v10';
const SHELL = [
  '/', '/index.html', '/css/app.css',
  '/js/config.js', '/js/api.js', '/js/ui.js',
  '/js/pages.js', '/js/pages2.js', '/js/pages3.js', '/js/pages4.js', '/js/app.js',
  '/manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // 接口与上传：只走网络
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) return;
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html')))
  );
});
