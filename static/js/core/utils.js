export function qs(selector) {
  return document.querySelector(selector);
}

export function formatMoney(value) {
  return Number(value || 0).toLocaleString('ko-KR');
}

export function roleLabel(role) {
  if (role === 'provider') return '공급사';
  if (role === 'agent') return '영업자';
  if (role === 'admin') return '관리자';
  return '-';
}

// ─── 시간 유틸 (대시보드 필터링용) ─────────────────────────────────────────

export function getStartOfToday() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
}

export function getStartOfWeek() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); return d.getTime();
}

export function getStartOfMonth() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(1); return d.getTime();
}

export function countByPeriod(items, tsKey = 'created_at') {
  const today = getStartOfToday();
  const week = getStartOfWeek();
  const month = getStartOfMonth();
  let todayCount = 0, weekCount = 0, monthCount = 0;
  items.forEach((item) => {
    const ts = Number(item[tsKey] || 0);
    if (ts >= today) todayCount++;
    if (ts >= week) weekCount++;
    if (ts >= month) monthCount++;
  });
  return { today: todayCount, week: weekCount, month: monthCount, total: items.length };
}

function getCleanupStore() {
  if (!window.__freepassPageCleanup) {
    window.__freepassPageCleanup = [];
  }
  return window.__freepassPageCleanup;
}

export function registerPageCleanup(cleanup) {
  if (typeof cleanup !== 'function') return cleanup;
  getCleanupStore().push(cleanup);
  return cleanup;
}

export function runPageCleanup() {
  const store = getCleanupStore();
  while (store.length) {
    const cleanup = store.pop();
    try {
      cleanup?.();
    } catch (error) {
      console.warn('page cleanup failed', error);
    }
  }
}
