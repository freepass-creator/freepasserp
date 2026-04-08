/**
 * mobile/prefetch.js — 모바일 앱 글로벌 데이터 프리페처
 *
 * _layout.html에서 모든 모바일 페이지에 로드.
 * 인증 직후 모든 컬렉션(products/terms/rooms/contracts)을 한 번에 구독한다.
 * watchCollection은 공유 캐시(_sharedWatchers)를 쓰므로,
 * 이후 각 페이지가 watchProducts() 등을 호출하면 캐시된 값을 "즉시" 받는다.
 *
 * 효과: 페이지 진입 시 Firebase round-trip 0회 → 즉시 렌더링
 */

import { requireAuth } from '../core/auth-guard.js';
import {
  watchProducts, watchTerms, watchRooms, watchContracts
} from '../firebase/firebase-db.js';

// localStorage 키
const CACHE_KEYS = {
  products: 'fp.cache.products',
  terms: 'fp.cache.terms',
  rooms: 'fp.cache.rooms',
  contracts: 'fp.cache.contracts',
};
const CACHE_TTL = 10 * 60 * 1000; // 10분

// ─── 메모리 캐시 (페이지 간 공유) ───────────────────────────────────────────
window.__appData = window.__appData || {
  products: null,
  terms: null,
  rooms: null,
  contracts: null,
  ts: { products: 0, terms: 0, rooms: 0, contracts: 0 },
};

// ─── localStorage → 메모리 (페이지 새로고침 시 즉시 복원) ───────────────────
function restoreFromStorage() {
  for (const [key, sk] of Object.entries(CACHE_KEYS)) {
    try {
      const raw = localStorage.getItem(sk);
      if (!raw) continue;
      const { data, ts } = JSON.parse(raw);
      if (Date.now() - ts > CACHE_TTL) continue;
      window.__appData[key] = data;
      window.__appData.ts[key] = ts;
    } catch {}
  }
}
restoreFromStorage();

// ─── 메모리 → localStorage (백그라운드, 디바운스) ──────────────────────────
const _saveTimers = {};
function saveToStorage(key) {
  clearTimeout(_saveTimers[key]);
  _saveTimers[key] = setTimeout(() => {
    try {
      const data = window.__appData[key];
      if (!data) return;
      localStorage.setItem(CACHE_KEYS[key], JSON.stringify({ data, ts: Date.now() }));
    } catch {}
  }, 1000);
}

// ─── 글로벌 구독 시작 ───────────────────────────────────────────────────────
(async () => {
  try {
    await requireAuth();
  } catch { return; }

  // 모든 컬렉션을 병렬 구독 — 한 번만 등록되면 watchCollection 공유 캐시에 들어감
  // 각 페이지가 같은 watch*() 호출하면 즉시 캐시 값을 받음
  watchProducts((products) => {
    window.__appData.products = products;
    window.__appData.ts.products = Date.now();
    saveToStorage('products');
    window.dispatchEvent(new CustomEvent('fp:data', { detail: { type: 'products' } }));
  });

  watchTerms((terms) => {
    window.__appData.terms = terms;
    window.__appData.ts.terms = Date.now();
    saveToStorage('terms');
    window.dispatchEvent(new CustomEvent('fp:data', { detail: { type: 'terms' } }));
  });

  watchRooms((rooms) => {
    window.__appData.rooms = rooms;
    window.__appData.ts.rooms = Date.now();
    saveToStorage('rooms');
    window.dispatchEvent(new CustomEvent('fp:data', { detail: { type: 'rooms' } }));
  });

  watchContracts((contracts) => {
    window.__appData.contracts = contracts;
    window.__appData.ts.contracts = Date.now();
    saveToStorage('contracts');
    window.dispatchEvent(new CustomEvent('fp:data', { detail: { type: 'contracts' } }));
  });
})();
