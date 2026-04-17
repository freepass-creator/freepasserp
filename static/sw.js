// FREEPASS ERP — Service Worker (precache + stale-while-revalidate)
const CACHE_NAME = 'freepass-v249';
const IMG_CACHE = 'freepass-img-v1';

// 핵심 자원 — 첫 방문 시 미리 다운로드
const PRECACHE_URLS = [
  '/static/css/mobile/app.css',
  '/static/css/mobile/product.css',
  '/static/css/mobile/chat.css',
  '/static/css/mobile/contract.css',
  '/static/css/mobile/settings.css',
  '/static/css/ui_toast.css',
  '/static/css/shared/fullscreen-photo-viewer.css',
  '/static/js/mobile/product.js',
  '/static/js/mobile/chat.js',
  '/static/js/mobile/contract.js',
  '/static/js/mobile/settings.js',
  '/static/js/mobile/tab-badges.js',
  '/static/js/mobile/prefetch.js',
  '/static/js/mobile/idb-cache.js',
  '/static/js/mobile/filter-sheet.js',
  '/static/js/firebase/firebase-config.js',
  '/static/js/firebase/firebase-db.js',
  '/static/js/firebase/firebase-db-helpers.js',
  '/static/js/firebase/firebase-auth.js',
  '/static/js/core/auth-guard.js',
  '/static/js/core/management-format.js',
  '/static/icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      const old = keys.filter((k) => k !== CACHE_NAME && k !== IMG_CACHE);
      return Promise.all(old.map((k) => caches.delete(k)));
    }).then(() => self.clients.claim()).then(() => {
      // 새 SW 활성화 시 모든 탭에 reload 메시지
      return self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' }));
      });
    })
  );
});

// 이미지 캐시 LRU (최대 200개)
async function trimImageCache() {
  const cache = await caches.open(IMG_CACHE);
  const keys = await cache.keys();
  if (keys.length > 200) {
    const toDelete = keys.slice(0, keys.length - 150);
    await Promise.all(toDelete.map(k => cache.delete(k)));
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = request.url;

  // API/Realtime DB/Auth API: 캐시 안 함, 그냥 통과
  if (url.includes('/api/') || url.includes('firebaseio.com') || url.includes('identitytoolkit.googleapis.com')) return;

  // Firebase Storage 이미지: 캐시 우선 (한번 받으면 영구)
  if (url.includes('firebasestorage.googleapis.com') || url.includes('storage.googleapis.com')) {
    event.respondWith(
      caches.open(IMG_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response.ok) {
              cache.put(request, response.clone());
              trimImageCache();
            }
            return response;
          });
        })
      )
    );
    return;
  }

  // 외부 CDN (폰트 등): 캐시 우선
  if (url.includes('cdn.jsdelivr.net') || url.includes('gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(request).then(cached => cached || fetch(request).then(r => {
          if (r.ok) cache.put(request, r.clone());
          return r;
        }))
      )
    );
    return;
  }

  // HTML 페이지(navigate): 항상 network-first (캐시 잘못 매칭 방지)
  // — stale-while-revalidate가 다른 경로의 HTML을 반환하는 케이스가 있어
  //   카톡 인앱 등에서 의도와 다른 페이지로 점프하는 문제 발생
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((response) => {
        // 같은 URL만 캐시 (정확 매칭)
        if (response.ok && url.includes('/m/')) {
          caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
        }
        return response;
      }).catch(() => caches.match(request, { ignoreSearch: false }))
    );
    return;
  }

  // 페이지/모바일/공유 JS/CSS: network-first (항상 최신 코드)
  // ?v= 쿼리 없이 로드되는 정적 자원도 network-first로 강제
  const hasVersionParam = url.includes('?v=') || url.includes('&v=');
  if (url.includes('/static/js/mobile/') || url.includes('/static/css/mobile/') ||
      url.includes('/static/js/pages/')  || url.includes('/static/css/pages/')  ||
      url.includes('/static/css/shared/') || url.includes('/static/js/shared/') ||
      url.includes('/static/js/firebase/') || url.includes('/static/js/core/') ||
      (url.includes('/static/css/') && !hasVersionParam)) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
        }
        return response;
      }).catch(() => caches.match(request))
    );
    return;
  }
  // SPA HTML fetch (X-Requested-With: XMLHttpRequest) — 항상 최신
  if (request.headers.get('X-Requested-With') === 'XMLHttpRequest' &&
      request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  // 그 외 정적 자산: stale-while-revalidate (폴백은 반드시 Response 반환)
  event.respondWith((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) {
        // 백그라운드 업데이트
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') cache.put(request, response.clone());
        }).catch(() => {});
        return cached;
      }
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') cache.put(request, response.clone());
      return response;
    } catch (_) {
      return new Response('', { status: 504, statusText: 'offline' });
    }
  })());
});
