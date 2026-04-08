/**
 * mobile/prefetch.js — 모바일 앱 글로벌 데이터 프리페처
 *
 * _layout.html에서 모든 모바일 페이지에 로드.
 * 인증 직후 모든 컬렉션(products/terms/rooms/contracts)을 한 번에 구독.
 * watchCollection은 공유 캐시(_sharedWatchers)를 쓰므로,
 * 각 페이지가 watchProducts() 등 호출하면 캐시된 값을 즉시 받음.
 *
 * 캐시: IndexedDB (10MB+ 가능, 비동기)
 * 효과: 페이지 진입 시 Firebase round-trip 0회
 */

import { requireAuth } from '../core/auth-guard.js';
import {
  watchProducts, watchTerms, watchRooms, watchContracts
} from '../firebase/firebase-db.js';
import { idbGet, idbSet } from './idb-cache.js';

const CACHE_TTL = 30 * 60 * 1000; // 30분

// ─── 메모리 캐시 (페이지 간 공유) ───────────────────────────────────────────
window.__appData = window.__appData || {
  products: null,
  terms: null,
  rooms: null,
  contracts: null,
  ts: { products: 0, terms: 0, rooms: 0, contracts: 0 },
  ready: { products: false, terms: false, rooms: false, contracts: false },
};

// ─── IndexedDB → 메모리 (앱 시작 시 즉시 복원, 비동기) ──────────────────────
(async function restoreFromIDB() {
  const keys = ['products', 'terms', 'rooms', 'contracts'];
  await Promise.all(keys.map(async (key) => {
    try {
      const cached = await idbGet(`fp.${key}`);
      if (!cached) return;
      const { data, ts } = cached;
      if (Date.now() - ts > CACHE_TTL) return;
      // Firebase에서 아직 안 받아왔으면 캐시 사용
      if (!window.__appData[key]) {
        window.__appData[key] = data;
        window.__appData.ts[key] = ts;
        window.dispatchEvent(new CustomEvent('fp:data', { detail: { type: key, fromCache: true } }));
      }
    } catch {}
  }));
})();

// ─── 메모리 → IndexedDB (디바운스 저장) ──────────────────────────────────────
const _saveTimers = {};
function saveToIDB(key) {
  clearTimeout(_saveTimers[key]);
  _saveTimers[key] = setTimeout(() => {
    const data = window.__appData[key];
    if (!data) return;
    idbSet(`fp.${key}`, { data, ts: Date.now() }).catch(() => {});
  }, 1500);
}

// ─── 글로벌 구독 시작 ───────────────────────────────────────────────────────
(async () => {
  try {
    await requireAuth();
  } catch { return; }

  watchProducts((products) => {
    window.__appData.products = products;
    window.__appData.ts.products = Date.now();
    window.__appData.ready.products = true;
    saveToIDB('products');
    window.dispatchEvent(new CustomEvent('fp:data', { detail: { type: 'products' } }));
  });

  watchTerms((terms) => {
    window.__appData.terms = terms;
    window.__appData.ts.terms = Date.now();
    window.__appData.ready.terms = true;
    saveToIDB('terms');
    window.dispatchEvent(new CustomEvent('fp:data', { detail: { type: 'terms' } }));
  });

  watchRooms((rooms) => {
    window.__appData.rooms = rooms;
    window.__appData.ts.rooms = Date.now();
    window.__appData.ready.rooms = true;
    saveToIDB('rooms');
    window.dispatchEvent(new CustomEvent('fp:data', { detail: { type: 'rooms' } }));
  });

  watchContracts((contracts) => {
    window.__appData.contracts = contracts;
    window.__appData.ts.contracts = Date.now();
    window.__appData.ready.contracts = true;
    saveToIDB('contracts');
    window.dispatchEvent(new CustomEvent('fp:data', { detail: { type: 'contracts' } }));
  });
})();
