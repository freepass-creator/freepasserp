/**
 * firebase-db-helpers.js
 * 
 * firebase-db.js 전반에 걸쳐 반복되는 패턴을 공통 함수로 추출한 헬퍼 모듈.
 * firebase-db.js에서 import하여 사용하며, 외부 페이지에서 직접 import하지 않는다.
 */

import {
  get, onValue, update, query, orderByChild, equalTo, limitToLast
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';
import { db } from './firebase-config.js';
import { ref } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';

// ─── 소프트 삭제 ────────────────────────────────────────────────────────────

/**
 * 공통 소프트 삭제: status = 'deleted', deleted_at = now
 * @param {string} path  Firebase 경로 (e.g. 'partners/RP001')
 */
export function softDelete(path) {
  return update(ref(db, path), {
    status: 'deleted',
    deleted_at: Date.now()
  });
}

/**
 * 공통 상태 변경: status + updated_at
 */
export function setStatus(path, status) {
  return update(ref(db, path), {
    status,
    updated_at: Date.now()
  });
}

// ─── 스냅샷 → 배열 변환 ──────────────────────────────────────────────────────

/**
 * snapshot.val()을 Object.values() 배열로 변환. null-safe.
 */
export function snapshotToValues(snapshot) {
  const data = snapshot.val() || {};
  return Object.values(data);
}

/**
 * snapshot.val()을 [{ uid, ...value }] 배열로 변환 (users처럼 key가 uid인 경우).
 */
export function snapshotToEntries(snapshot, keyName = 'uid') {
  const data = snapshot.val() || {};
  return Object.entries(data).map(([key, value]) => ({ [keyName]: key, ...value }));
}

// ─── 공통 필터 ───────────────────────────────────────────────────────────────

/** status !== 'deleted' 필터 */
export const isNotDeleted = (item) => item.status !== 'deleted';

/** status !== 'deleted' && status !== 'inactive' 필터 */
export const isActive = (item) => item.status !== 'deleted' && item.status !== 'inactive';

// ─── 공유 구독 캐시 (같은 경로 중복 구독 방지) ─────────────────────────────
// 여러 페이지/모듈이 동일 경로를 watch할 때 Firebase onValue를 1개만 유지하고
// 각 콜백에 결과를 개별 배포한다. 마지막 구독자가 해제되면 Firebase 리스너도 해제.

const _sharedWatchers = new Map();

// ─── 페이지별 콜백 일시정지 (숨겨진 페이지의 불필요한 DOM 업데이트 방지) ────
// Firebase 리스너는 유지하되, 보이지 않는 페이지의 콜백만 스킵한다.
// 페이지가 다시 보이면 dirty 플래그가 있을 때만 최신 데이터로 1회 렌더링.
const _pageWatchers = new Map(); // pageKey → Set<entry>

function _applyTransform(raw, filter, sort) {
  let items = raw.slice(); // 공유 배열 변경 방지
  if (typeof filter === 'function') items = items.filter(filter);
  if (typeof sort === 'function') items.sort(sort);
  return items;
}

export { limitToLast, query, orderByChild };

/**
 * 특정 경로를 watch하고, snapshot을 변환·필터·정렬한 뒤 callback에 전달한다.
 * 동일 경로에 대한 Firebase onValue는 최초 1회만 생성하며 이후 구독자는 공유한다.
 * 페이지 전환 시 숨겨진 페이지의 콜백은 자동으로 일시정지된다.
 *
 * @param {string} path           Firebase 경로
 * @param {Function} callback     결과 배열을 받는 함수
 * @param {object} options
 * @param {'values'|'entries'} options.mode  배열 변환 방식 (기본: 'values')
 * @param {string} options.entryKey          entries 모드일 때 key 이름 (기본: 'uid')
 * @param {Function} [options.filter]        필터 함수
 * @param {Function} [options.sort]          정렬 함수
 * @param {Function} [options.queryFn]       Firebase ref → query 변환 함수 (limitToLast 등)
 * @param {string}   [options.queryKey]      queryFn 식별용 캐시 키 접미사
 * @returns unsubscribe 함수
 */

export function watchCollection(path, callback, {
  mode = 'values',
  entryKey = 'uid',
  filter,
  sort,
  queryFn,
  queryKey
} = {}) {
  const cacheKey = queryKey !== undefined
    ? `${path}\x00${mode}\x00${entryKey}\x00${queryKey}`
    : `${path}\x00${mode}\x00${entryKey}`;

  if (!_sharedWatchers.has(cacheKey)) {
    const listeners = new Set();
    const shared = { unsubFirebase: null, listeners, latestRaw: null };
    const listenRef = typeof queryFn === 'function' ? queryFn(ref(db, path)) : ref(db, path);
    shared.unsubFirebase = onValue(listenRef, (snapshot) => {
      shared.latestRaw = mode === 'entries'
        ? snapshotToEntries(snapshot, entryKey)
        : snapshotToValues(snapshot);
      listeners.forEach(fn => { try { fn(); } catch (e) { console.warn('[watchCollection] listener error', e); } });
    });
    _sharedWatchers.set(cacheKey, shared);
  }

  const shared = _sharedWatchers.get(cacheKey);
  const pageKey = window.__currentPage || '';
  const entry = { paused: false, dirty: false };

  const notify = () => {
    if (entry.paused) { entry.dirty = true; return; }
    callback(_applyTransform(shared.latestRaw, filter, sort));
  };
  entry.flush = () => {
    if (shared.latestRaw !== null) callback(_applyTransform(shared.latestRaw, filter, sort));
  };

  shared.listeners.add(notify);

  // 페이지별 추적 등록
  if (pageKey) {
    if (!_pageWatchers.has(pageKey)) _pageWatchers.set(pageKey, new Set());
    _pageWatchers.get(pageKey).add(entry);
  }

  // 이미 데이터가 있으면 즉시 호출 (재방문 시 캐시 활용)
  if (shared.latestRaw !== null) { try { notify(); } catch (e) { console.warn('[watchCollection] immediate notify error', e); } }

  return () => {
    shared.listeners.delete(notify);
    if (pageKey) _pageWatchers.get(pageKey)?.delete(entry);
    if (shared.listeners.size === 0) {
      shared.unsubFirebase();
      _sharedWatchers.delete(cacheKey);
    }
  };
}

/**
 * 특정 페이지의 모든 watchCollection 콜백을 일시정지한다.
 * Firebase 리스너는 유지되며, 데이터 변경 시 dirty 플래그만 설정된다.
 */
export function pausePageWatchers(pageKey) {
  const entries = _pageWatchers.get(pageKey);
  if (entries) entries.forEach(e => { e.paused = true; });
}

/**
 * 특정 페이지의 일시정지된 콜백을 재개한다.
 * dirty 플래그가 있는 콜백만 최신 데이터로 1회 실행된다.
 */
export function resumePageWatchers(pageKey) {
  const entries = _pageWatchers.get(pageKey);
  if (!entries) return;
  entries.forEach(e => {
    e.paused = false;
    if (e.dirty) {
      e.dirty = false;
      try { e.flush(); } catch (err) { console.warn('[watchCollection] resume flush error', err); }
    }
  });
}

// ─── 단일 레코드 조회 ────────────────────────────────────────────────────────

/**
 * 단일 경로를 한 번 조회. 없으면 null 반환.
 */
export async function fetchOne(path) {
  const snapshot = await get(ref(db, path));
  return snapshot.exists() ? snapshot.val() : null;
}

/**
 * 경로 전체를 한 번 조회하여 배열로 반환.
 */
export async function fetchCollection(path, { filter, sort, mode = 'values', entryKey = 'uid' } = {}) {
  const snapshot = await get(ref(db, path));
  let items = mode === 'entries'
    ? snapshotToEntries(snapshot, entryKey)
    : snapshotToValues(snapshot);

  if (typeof filter === 'function') items = items.filter(filter);
  if (typeof sort === 'function') items = items.sort(sort);

  return items;
}


/**
 * 특정 필드 값으로 단일 쿼리 조회 (중복 검사 등에 사용).
 * orderByChild + equalTo 조합으로 서버에서 필터링.
 *
 * @param {string} path       컬렉션 경로
 * @param {string} childKey   orderByChild 대상 필드
 * @param {*}      value      equalTo 값
 * @returns {Promise<object>}  { [key]: value } 형태의 매칭 결과 (없으면 빈 객체)
 */
export async function queryByChild(path, childKey, value) {
  const dbRef = ref(db, path);
  const q = query(dbRef, orderByChild(childKey), equalTo(value));
  const snapshot = await get(q);
  return snapshot.val() || {};
}

// ─── 업데이트 with guard ──────────────────────────────────────────────────────

/**
 * 경로를 조회한 뒤 없으면 에러, 있으면 merge update.
 * updated_at은 자동으로 포함된다.
 *
 * @param {string} path
 * @param {object} updates
 * @param {string} [notFoundMessage]
 * @returns 업데이트된 현재 값
 */
export async function guardedUpdate(path, updates, notFoundMessage = '항목을 찾을 수 없습니다.') {
  const dbRef = ref(db, path);
  const snapshot = await get(dbRef);
  if (!snapshot.exists()) throw new Error(notFoundMessage);
  const current = snapshot.val();
  const next = { ...current, ...updates, updated_at: Date.now() };
  await update(dbRef, next);
  return next;
}
