// FREEPASS ERP — Service Worker (precache + stale-while-revalidate)
const CACHE_NAME = 'freepass-v17';

const PRECACHE_URLS = [
  '/static/css/reset.css',
  '/static/css/base.css',
  '/static/css/ui_tokens.css',
  '/static/css/ui_toast.css',
  '/static/css/mobile-app.css',
  '/static/css/shared/mobile.css',
  '/static/css/shared/detail-common.css',
  '/static/css/shared/fullscreen-photo-viewer.css',
  '/static/css/form.css',
  '/static/css/button.css',
  '/static/css/list.css',
  '/static/css/catalog.css',
  '/static/icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Stale-while-revalidate: 캐시 먼저 반환, 백그라운드에서 네트워크 업데이트
self.addEventListener('fetch', (event) => {
  const { request } = event;
  // API, Firebase, 외부 요청은 무시
  if (request.url.includes('/api/') || request.url.includes('firebaseio.com') || request.url.includes('googleapis.com')) return;
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        const fetched = fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            cache.put(request, response.clone());
          }
          return response;
        }).catch(() => cached);

        return cached || fetched;
      })
    )
  );
});
