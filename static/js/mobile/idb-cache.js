/**
 * mobile/idb-cache.js — IndexedDB 캐시 (localStorage 대체)
 *
 * 특징:
 * - 비동기 (메인 스레드 안 막음)
 * - 50MB+ 저장 가능 (localStorage 5MB 한도 해제)
 * - 큰 배열 직렬화 빠름 (localStorage는 JSON.stringify로 동기)
 *
 * API:
 *   await idbSet('products', data)
 *   const data = await idbGet('products')
 */

const DB_NAME = 'fp_cache';
const STORE = 'data';
const DB_VERSION = 1;

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
  return _dbPromise;
}

export async function idbGet(key) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch { return null; }
}

export async function idbSet(key, value) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch { return false; }
}

export async function idbDel(key) {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch { return false; }
}

// ─── 동기 캐시 (메모리) — 첫 방문 시 IDB 로드 결과 보관 ──────────────────────
const _memCache = new Map();

export function memGet(key) { return _memCache.get(key); }
export function memSet(key, value) { _memCache.set(key, value); }
