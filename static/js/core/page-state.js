/**
 * core/page-state.js
 *
 * SPA 라우팅 시 페이지 상태(필터, 스크롤, 선택 항목)를 sessionStorage에
 * 저장·복원하는 유틸리티.
 *
 * 사용법 (각 페이지 모듈에서):
 *   import { savePageState, loadPageState, clearPageState } from '../core/page-state.js';
 *
 *   // 페이지 떠날 때 저장
 *   registerPageCleanup(() => savePageState('/product-new', {
 *     selectedCode: lastSelectedCode,
 *     filterText: searchInput.value,
 *     scrollTop: listBody.scrollTop
 *   }));
 *
 *   // 페이지 진입 시 복원
 *   const saved = loadPageState('/product-new');
 *   if (saved?.selectedCode) selectProduct(saved.selectedCode);
 */

const STORAGE_PREFIX = 'fp.pageState.';
const MAX_AGE_MS = 30 * 60 * 1000; // 30분 후 만료

/**
 * 특정 페이지의 상태를 sessionStorage에 저장한다.
 * @param {string} pageKey   페이지 식별자 (보통 pathname, e.g. '/product-new')
 * @param {object} state     저장할 상태 객체 (JSON 직렬화 가능해야 함)
 */
export function savePageState(pageKey, state) {
  if (!pageKey || !state || typeof state !== 'object') return;
  try {
    const entry = { state, savedAt: Date.now() };
    sessionStorage.setItem(STORAGE_PREFIX + pageKey, JSON.stringify(entry));
  } catch (error) {
    // sessionStorage 사용 불가 또는 용량 초과 시 무시
  }
}

/**
 * 저장된 페이지 상태를 복원한다.
 * MAX_AGE_MS 이상 지난 상태는 만료 처리하여 null을 반환한다.
 *
 * @param {string} pageKey  페이지 식별자
 * @param {object} [options]
 * @param {boolean} [options.consume=true]  true이면 읽은 후 삭제 (일회성 복원)
 * @returns {object|null}   저장된 상태 객체 또는 null
 */
export function loadPageState(pageKey, { consume = true } = {}) {
  if (!pageKey) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + pageKey);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry?.state || !entry?.savedAt) return null;
    // 만료 확인
    if (Date.now() - entry.savedAt > MAX_AGE_MS) {
      sessionStorage.removeItem(STORAGE_PREFIX + pageKey);
      return null;
    }
    if (consume) {
      sessionStorage.removeItem(STORAGE_PREFIX + pageKey);
    }
    return entry.state;
  } catch (error) {
    return null;
  }
}

/**
 * 특정 페이지의 저장된 상태를 삭제한다.
 * @param {string} pageKey  페이지 식별자
 */
export function clearPageState(pageKey) {
  if (!pageKey) return;
  try {
    sessionStorage.removeItem(STORAGE_PREFIX + pageKey);
  } catch (error) {
    // 무시
  }
}

/**
 * 모든 페이지 상태를 일괄 삭제한다.
 */
export function clearAllPageStates() {
  try {
    const keysToRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => sessionStorage.removeItem(key));
  } catch (error) {
    // 무시
  }
}
