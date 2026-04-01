/**
 * firebase-db-helpers.js
 * 
 * firebase-db.js 전반에 걸쳐 반복되는 패턴을 공통 함수로 추출한 헬퍼 모듈.
 * firebase-db.js에서 import하여 사용하며, 외부 페이지에서 직접 import하지 않는다.
 */

import {
  get, onValue, update, query, orderByChild, equalTo
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

// ─── onValue 래퍼 ────────────────────────────────────────────────────────────

/**
 * 특정 경로를 watch하고, snapshot을 변환·필터·정렬한 뒤 callback에 전달한다.
 *
 * @param {string} path           Firebase 경로
 * @param {Function} callback     결과 배열을 받는 함수
 * @param {object} options
 * @param {'values'|'entries'} options.mode  배열 변환 방식 (기본: 'values')
 * @param {string} options.entryKey          entries 모드일 때 key 이름 (기본: 'uid')
 * @param {Function} [options.filter]        필터 함수
 * @param {Function} [options.sort]          정렬 함수
 * @returns unsubscribe 함수
 */
export function watchCollection(path, callback, {
  mode = 'values',
  entryKey = 'uid',
  filter,
  sort
} = {}) {
  return onValue(ref(db, path), (snapshot) => {
    let items = mode === 'entries'
      ? snapshotToEntries(snapshot, entryKey)
      : snapshotToValues(snapshot);

    if (typeof filter === 'function') items = items.filter(filter);
    if (typeof sort === 'function') items = items.sort(sort);

    callback(items);
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
