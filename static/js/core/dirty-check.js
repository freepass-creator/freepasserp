/** 작업 중 이탈 방지 — app.js와 app-mobile.js 공통 */
let _dirtyCheck = null;

export function setDirtyCheck(fn) { _dirtyCheck = typeof fn === 'function' ? fn : null; }
export function clearDirtyCheck() { _dirtyCheck = null; }
export function isPageDirty() { return typeof _dirtyCheck === 'function' && _dirtyCheck(); }
