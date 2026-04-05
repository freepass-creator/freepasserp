// FREEPASS ERP — Service Worker (오프라인 기본 지원)
const CACHE_NAME = 'freepass-v11';

// 설치: 기본 셸 캐시
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// 활성화: 이전 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 네트워크 우선, 실패 시 캐시 (API 제외)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  // API, Firebase, 외부 요청은 무시
  if (request.url.includes('/api/') || request.url.includes('firebaseio.com') || request.url.includes('googleapis.com')) return;
  // GET 요청만 캐시
  if (request.method !== 'GET') return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // 정상 응답만 캐시
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
