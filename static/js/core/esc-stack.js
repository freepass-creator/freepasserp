/**
 * core/esc-stack.js
 *
 * 전역 ESC 키 스택. LIFO(후입선출) 방식으로 가장 최근에 등록된
 * 핸들러부터 순서대로 실행된다.
 *
 * 사용법:
 *   import { pushEsc, removeEsc } from '../core/esc-stack.js';
 *
 *   // 모달/패널 열 때
 *   const id = pushEsc(() => closeMyPanel());
 *
 *   // 모달/패널 닫을 때 (수동 닫기 시)
 *   removeEsc(id);
 *
 * ESC를 누르면 스택 맨 위 핸들러가 호출되고 자동 제거된다.
 * 연속 ESC → 스택을 하나씩 소비하며 순차 취소.
 */

const stack = [];
let nextId = 1;
let bound = false;

function handleKeydown(e) {
  if (e.key !== 'Escape') return;
  if (!stack.length) return;
  // 입력 필드에서 ESC → 포커스 해제만 (스택 소비 X)
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    document.activeElement.blur();
    return;
  }
  e.preventDefault();
  const top = stack.pop();
  try { top.fn(); } catch (err) { console.warn('[esc-stack]', err); }
}

function ensureBound() {
  if (bound) return;
  bound = true;
  document.addEventListener('keydown', handleKeydown);
}

/**
 * ESC 핸들러를 스택에 push한다.
 * @param {Function} fn  ESC 시 실행할 함수
 * @returns {number}     핸들러 ID (removeEsc에 사용)
 */
export function pushEsc(fn) {
  ensureBound();
  const id = nextId++;
  stack.push({ id, fn });
  return id;
}

/**
 * 특정 핸들러를 스택에서 제거한다 (수동 닫기 시 호출).
 * @param {number} id  pushEsc가 반환한 ID
 */
export function removeEsc(id) {
  const idx = stack.findIndex(item => item.id === id);
  if (idx !== -1) stack.splice(idx, 1);
}

/**
 * 현재 스택 크기를 반환한다.
 */
export function escStackSize() {
  return stack.length;
}
