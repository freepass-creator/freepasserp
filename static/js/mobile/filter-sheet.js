/**
 * mobile/filter-sheet.js — 모바일 필터 패널 (좌측 슬라이드)
 *
 * 지원 타입:
 *  - check       : 다중선택 체크 (옵션은 데이터에서 자동 추출)
 *  - periods     : 기간 (1·12·24·36·48·60) — rent_{m} > 0 인 상품 매칭
 *  - range       : 숫자 범위 버킷 (rent/deposit/mileage)
 *  - search      : 텍스트 부분일치 (trim, options)
 *  - policyCheck : 정책 매칭 후 정책 필드 값 (심사기준, 최저연령)
 */
import { escapeHtml } from '../core/management-format.js';

/* ── Lucide 아이콘 (필터 그룹 헤드용) ─────────── */
const _svg = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const ICON_LIB = {
  // 가격·기간
  money:    _svg('<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'),
  deposit:  _svg('<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
  calendar: _svg('<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  // 차량 식별
  car:      _svg('<path d="M21 8 17.65 2.65A2 2 0 0 0 15.94 2H8.06a2 2 0 0 0-1.71 1.65L3 8"/><rect width="18" height="13" x="3" y="8" rx="2"/><path d="M7 10h0M17 10h0M5 21v-2M19 21v-2"/>'),
  layers:   _svg('<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>'),
  rows:     _svg('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>'),
  // 트림·옵션
  award:    _svg('<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/>'),
  list:     _svg('<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>'),
  // 스펙
  hash:     _svg('<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>'),
  road:     _svg('<path d="M12 13v8"/><path d="M12 3v3"/><rect width="20" height="8" x="2" y="6" rx="2"/>'),
  fuel:     _svg('<line x1="3" x2="15" y1="22" y2="22"/><line x1="4" x2="14" y1="9" y2="9"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>'),
  palette:  _svg('<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>'),
  shape:    _svg('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18M3 9h18"/>'),
  // 정책
  shield:   _svg('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>'),
  user:     _svg('<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>'),
  building: _svg('<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/>'),
  message:  _svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  reply:    _svg('<polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>'),
  search:   _svg('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
};

let state = {
  groups: [],
  items: [],
  policies: [],
  selected: {},
  searchText: {},
  openKeys: {},
  onApply: null,
  headerLabel: '검색 결과',
  unit: '건',
};
let $sheet = null, $backdrop = null;

/* ── helpers ───────────────────────────────────────── */
function ensureMounted() {
  if ($sheet) return;
  $backdrop = document.createElement('div');
  $backdrop.className = 'm-fs-backdrop';
  $backdrop.hidden = true;
  $sheet = document.createElement('div');
  $sheet.className = 'm-fs';
  $sheet.hidden = true;
  document.body.appendChild($backdrop);
  document.body.appendChild($sheet);
  $backdrop.addEventListener('click', close);
}

function findPolicyForItem(item, policies) {
  if (!item || !policies?.length) return null;
  const termCode = String(item.term_code || item.policy_code || '').trim();
  const termName = String(item.term_name || '').trim();
  const provider = String(item.provider_company_code || item.partner_code || '').trim();
  return (
    (termCode && policies.find(t => String(t.term_code || '').trim() === termCode)) ||
    (termName && policies.find(t => String(t.term_name || '').trim() === termName)) ||
    (provider && policies.find(t => String(t.provider_company_code || '').trim() === provider)) ||
    null
  );
}

function getNum(v) {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function getCheapestRent(item) {
  const months = [1, 12, 24, 36, 48, 60];
  let min = 0;
  for (const m of months) {
    const v = getNum(item?.price?.[m]?.rent) ||
              (m === 48 ? getNum(item?.rental_price_48) || getNum(item?.rental_price) : 0) ||
              (m === 60 ? getNum(item?.rental_price_60) : 0);
    if (v > 0 && (min === 0 || v < min)) min = v;
  }
  return min;
}
function getCheapestDeposit(item) {
  const months = [1, 12, 24, 36, 48, 60];
  let min = 0;
  for (const m of months) {
    const v = getNum(item?.price?.[m]?.deposit) ||
              (m === 48 ? getNum(item?.deposit_48) || getNum(item?.deposit) : 0) ||
              (m === 60 ? getNum(item?.deposit_60) : 0);
    if (v > 0 && (min === 0 || v < min)) min = v;
  }
  return min;
}

function inBucket(value, bucket) {
  if (value <= 0) return false;
  const [lo, hi] = bucket.range;
  if (lo != null && value < lo) return false;
  if (hi != null && value > hi) return false;
  return true;
}

/* ── 옵션 추출 ──────────────────────────────────────── */
function inDateRange(item, group, value) {
  const opt = (group.options || []).find(o => o.value === value);
  if (!opt) return false;
  const ts = Number(item?.[group.field || 'updated_at'] || item?.updated_at || item?.created_at || 0);
  if (!ts) return false;
  const now = Date.now();
  if (opt.ytd) {
    const start = new Date(new Date().getFullYear(), 0, 1).getTime();
    return ts >= start;
  }
  if (opt.days) {
    return ts >= now - opt.days * 86400000;
  }
  return false;
}

function buildOptions(group) {
  // 모든 타입: count 내림차순 정렬 (많은 값이 위)
  if (group.type === 'dateRange') {
    return (group.options || []).map(o => ({
      value: o.value,
      label: o.label,
      count: state.items.filter(it => inDateRange(it, group, o.value)).length,
    })).sort((a, b) => b.count - a.count);
  }
  if (group.type === 'periods') {
    return (group.options || ['1','12','24','36','48','60']).map(m => {
      const count = state.items.filter(it => {
        const v = getNum(it?.price?.[m]?.rent) ||
                  (m === '48' ? getNum(it?.rental_price_48) || getNum(it?.rental_price) : 0) ||
                  (m === '60' ? getNum(it?.rental_price_60) : 0);
        return v > 0;
      }).length;
      return { value: m, label: `${m}개월`, count };
    }).sort((a, b) => b.count - a.count);
  }
  if (group.type === 'range') {
    return (group.buckets || []).map(b => {
      const count = state.items.filter(it => {
        let v;
        if (group.key === 'rent') v = getCheapestRent(it);
        else if (group.key === 'deposit') v = getCheapestDeposit(it);
        else v = getNum(it[group.field || group.key]);
        return inBucket(v, b);
      }).length;
      return { value: b.value, label: b.label, count };
    }).filter(o => o.count > 0).sort((a, b) => b.count - a.count);
  }
  if (group.type === 'check') {
    const counts = new Map();
    state.items.forEach(item => {
      const fields = group.fields || [group.field || group.key];
      for (const f of fields) {
        const v = String(item?.[f] ?? '').trim();
        if (!v || v === '-') continue;
        counts.set(v, (counts.get(v) || 0) + 1);
      }
    });
    let arr = [...counts.entries()];
    if (group.sort === 'desc') arr.sort((a, b) => Number(b[0]) - Number(a[0]) || b[1] - a[1]);
    else arr.sort((a, b) => b[1] - a[1]);
    return arr.map(([value, count]) => ({ value, label: value, count }));
  }
  if (group.type === 'policyCheck') {
    const counts = new Map();
    state.items.forEach(item => {
      const policy = findPolicyForItem(item, state.policies);
      if (!policy) return;
      const v = String(policy[group.field] ?? '').trim();
      if (!v || v === '-') return;
      counts.set(v, (counts.get(v) || 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, label: value, count }));
  }
  return [];
}

/* ── 렌더 ──────────────────────────────────────────── */
function render() {
  if (!$sheet) return;
  // 스크롤 위치 보존
  const $oldBody = $sheet.querySelector('.m-fs__body');
  const savedScroll = $oldBody ? $oldBody.scrollTop : 0;
  const totalSelected = Object.values(state.selected).reduce((s, set) => s + (set?.size || 0), 0)
    + Object.values(state.searchText).filter(Boolean).length;

  // 데이터 없는 그룹은 숨김 (search 타입은 제외)
  const visibleGroups = state.groups.filter(g => {
    if (g.type === 'search') return true;
    const opts = buildOptions(g);
    return opts.some(o => o.count > 0);
  });

  const sections = visibleGroups.map(g => {
    const isOpen = !!state.openKeys[g.key];
    const selSet = state.selected[g.key] || new Set();
    const txt = state.searchText[g.key] || '';
    const badge = (selSet.size || (g.type === 'search' && txt))
      ? `<span class="m-fs__badge">${selSet.size || (txt ? '·' : '')}</span>` : '';

    let body = '';
    if (isOpen) {
      if (g.type === 'search') {
        body = `<div class="m-fs__search-wrap"><input type="search" class="m-fs__search-input" data-search="${escapeHtml(g.key)}" placeholder="${escapeHtml(g.placeholder || '검색어 입력')}" value="${escapeHtml(txt)}"></div>`;
      } else {
        const opts = buildOptions(g);
        const visibleOpts = opts.filter(o => o.count > 0 || selSet.has(o.value));
        if (!visibleOpts.length) {
          body = '<div class="m-fs__empty">해당 항목이 없습니다</div>';
        } else {
          // 전부 텍스트 리스트 (체크박스 + 좌 라벨 / 우 카운트)
          body = `<div class="m-fs__opts">${visibleOpts.map(o => `
            <button class="m-fs__opt${selSet.has(o.value) ? ' is-on' : ''}" data-key="${escapeHtml(g.key)}" data-val="${escapeHtml(o.value)}" type="button">
              <span class="m-fs__opt-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
              <span class="m-fs__opt-label">${escapeHtml(o.label)}</span>
              <span class="m-fs__opt-count">${o.count}</span>
            </button>`).join('')}</div>`;
        }
      }
    }

    const iconSvg = ICON_LIB[g.icon] || '';
    const hasActive = (selSet && selSet.size > 0) || (g.type === 'search' && txt);
    return `<div class="m-fs__group${isOpen ? ' is-open' : ''}${hasActive ? ' has-active' : ''}">
      <button class="m-fs__group-head" data-toggle="${escapeHtml(g.key)}" type="button">
        <span class="m-fs__group-title">
          ${iconSvg ? `<span class="m-fs__group-icon">${iconSvg}</span>` : ''}
          ${escapeHtml(g.title)} ${badge}
        </span>
        <svg class="m-fs__group-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      ${body}
    </div>`;
  }).join('');

  const totalCount = state.items.length;
  $sheet.innerHTML = `
    <div class="m-fs__head">
      <span class="m-fs__head-count">${escapeHtml(state.headerLabel)} <strong>${totalCount.toLocaleString('ko-KR')}</strong>${escapeHtml(state.unit)}</span>
      <button class="m-fs__close" type="button" aria-label="닫기"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
    </div>
    <div class="m-fs__body">${sections}</div>
    <div class="m-fs__foot">
      <button class="m-fs__btn m-fs__btn--reset" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        선택 초기화
      </button>
      <button class="m-fs__btn m-fs__btn--apply" type="button">적용</button>
    </div>
  `;

  // 스크롤 복원
  const $newBody = $sheet.querySelector('.m-fs__body');
  if ($newBody && savedScroll) $newBody.scrollTop = savedScroll;

  // 이벤트
  $sheet.querySelector('.m-fs__close').addEventListener('click', close);
  $sheet.querySelector('.m-fs__btn--reset')?.addEventListener('click', () => {
    state.selected = {};
    state.searchText = {};
    render();
  });
  $sheet.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.toggle;
      state.openKeys[k] = !state.openKeys[k];
      render();
    });
  });
  $sheet.querySelectorAll('.m-fs__opt, .m-fs__chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.key;
      const v = btn.dataset.val;
      const set = state.selected[k] || new Set();
      if (set.has(v)) set.delete(v); else set.add(v);
      state.selected[k] = set;
      render();
    });
  });
  $sheet.querySelectorAll('[data-search]').forEach(input => {
    input.addEventListener('input', (e) => {
      state.searchText[e.target.dataset.search] = e.target.value;
    });
  });
  $sheet.querySelector('.m-fs__btn--apply').addEventListener('click', () => {
    if (typeof state.onApply === 'function') state.onApply(serialize());
    close();
  });
}

function serialize() {
  const out = { selected: {}, searchText: {} };
  for (const [k, set] of Object.entries(state.selected)) {
    if (set && set.size) out.selected[k] = [...set];
  }
  for (const [k, txt] of Object.entries(state.searchText)) {
    if (txt && txt.trim()) out.searchText[k] = txt.trim();
  }
  return out;
}

/* ── 외부 API ──────────────────────────────────────── */
export function isOpen() {
  return $sheet && !$sheet.hidden && $sheet.classList.contains('is-open');
}

export function toggleFilter(opts) {
  if (isOpen()) close(); else openFilter(opts);
}

export function openFilter({ groups, items, policies = [], filterState = {}, onApply = null, headerLabel = '검색 결과', unit = '건' }) {
  ensureMounted();
  state.groups = groups || [];
  state.items = items || [];
  state.policies = policies || [];
  state.headerLabel = headerLabel;
  state.unit = unit;
  state.selected = {};
  for (const [k, arr] of Object.entries(filterState.selected || {})) {
    state.selected[k] = new Set(arr);
  }
  state.searchText = { ...(filterState.searchText || {}) };
  state.openKeys = {};
  groups.forEach((g, i) => { state.openKeys[g.key] = i < 3; });
  state.onApply = onApply;
  $backdrop.hidden = false;
  $sheet.hidden = false;
  render();
  requestAnimationFrame(() => {
    $backdrop.classList.add('is-open');
    $sheet.classList.add('is-open');
  });
}

export function close() {
  if (!$sheet) return;
  $backdrop.classList.remove('is-open');
  $sheet.classList.remove('is-open');
  setTimeout(() => {
    $backdrop.hidden = true;
    $sheet.hidden = true;
  }, 200);
}

/* ── 적용 (외부에서 호출) ──────────────────────────── */
export function applyFilter(items, filterState, groups, policies = []) {
  const sel = filterState?.selected || {};
  const txt = filterState?.searchText || {};
  if (!Object.keys(sel).length && !Object.keys(txt).length) return items;

  return items.filter(item => {
    for (const g of groups) {
      // search 타입
      if (g.type === 'search') {
        const q = (txt[g.key] || '').trim().toLowerCase();
        if (!q) continue;
        const v = String(item?.[g.field || g.key] ?? '').toLowerCase();
        if (!v.includes(q)) return false;
        continue;
      }
      const values = sel[g.key];
      if (!values || !values.length) continue;

      if (g.type === 'check') {
        const fields = g.fields || [g.field || g.key];
        const itemVals = fields.map(f => String(item?.[f] ?? '').trim());
        if (!values.some(v => itemVals.includes(v))) return false;
      } else if (g.type === 'periods') {
        const ok = values.some(m => {
          const v = getNum(item?.price?.[m]?.rent) ||
                    (m === '48' ? getNum(item?.rental_price_48) || getNum(item?.rental_price) : 0) ||
                    (m === '60' ? getNum(item?.rental_price_60) : 0);
          return v > 0;
        });
        if (!ok) return false;
      } else if (g.type === 'range') {
        let v;
        if (g.key === 'rent') v = getCheapestRent(item);
        else if (g.key === 'deposit') v = getCheapestDeposit(item);
        else v = getNum(item[g.field || g.key]);
        const buckets = (g.buckets || []).filter(b => values.includes(b.value));
        if (!buckets.some(b => inBucket(v, b))) return false;
      } else if (g.type === 'dateRange') {
        if (!values.some(v => inDateRange(item, g, v))) return false;
      } else if (g.type === 'policyCheck') {
        const policy = findPolicyForItem(item, policies);
        if (!policy) return false;
        const v = String(policy[g.field] ?? '').trim();
        if (!values.includes(v)) return false;
      }
    }
    return true;
  });
}
