import { escapeHtml, normalizeText } from './management-format.js';

// ─── 스켈레톤 ───────────────────────────────────────────────────────────────

export function renderSkeletonRows(tbody, columns = [], rowCount = 8) {
  if (!tbody) return;
  const sizes = ['skeleton-cell--sm', 'skeleton-cell--md', 'skeleton-cell--lg'];
  tbody.innerHTML = Array.from({ length: rowCount }, () => {
    const cells = columns.map((_, i) =>
      `<td class="pls-cell"><div class="skeleton-cell ${sizes[i % sizes.length]}"></div></td>`
    ).join('');
    return `<tr class="pls-row pls-row--skeleton">${cells}</tr>`;
  }).join('');
}

export function clearSkeleton(tbody) {
  if (!tbody) return;
  tbody.querySelectorAll('.pls-row--skeleton').forEach((row) => row.remove());
}

function normalizeClassName(value) {
  return String(value || '').trim();
}

function createItem(type, value, options = {}) {
  return {
    type,
    value,
    tone: options.tone || '',
    align: options.align || 'start',
    className: normalizeClassName(options.className)
  };
}

export function summaryText(value, options = {}) {
  return createItem('text', value, options);
}

export function summaryStrong(value, options = {}) {
  return createItem('text', value, { ...options, tone: options.tone || 'strong' });
}

export function summaryHtml(html, options = {}) {
  return createItem('html', html, options);
}

export function summaryDate(value, options = {}) {
  return createItem('text', value, { ...options, tone: options.tone || 'date', align: 'end' });
}

function buildItemMarkup(item, insertSeparator) {
  if (!item) return '';
  const classes = ['management-summary-row__item'];
  if (item.tone) classes.push(`management-summary-row__item--${item.tone}`);
  if (item.align === 'end') classes.push('management-summary-row__item--end');
  if (item.className) classes.push(item.className);

  const content = item.type === 'html'
    ? String(item.value || '')
    : escapeHtml(String(item.value ?? ''));

  if (!normalizeText(content)) return '';

  const separator = insertSeparator
    ? '<span class="management-summary-row__sep" aria-hidden="true">·</span>'
    : '';

  return `${separator}<span class="${classes.join(' ')}">${content}</span>`;
}

function buildLineMarkup(items = []) {
  const normalizedItems = items.filter(Boolean);
  if (!normalizedItems.length) return '';

  let started = false;
  let reachedEndAligned = false;
  let previousItem = null;
  const markup = normalizedItems.map((item) => {
    const insertSeparator = started
      && item.align !== 'end'
      && !reachedEndAligned
      && previousItem?.tone !== 'badges'
      && item.tone !== 'badges';
    const html = buildItemMarkup(item, insertSeparator);
    if (!html) return '';
    started = true;
    previousItem = item;
    if (item.align === 'end') reachedEndAligned = true;
    return html;
  }).join('');

  if (!normalizeText(markup)) return '';
  return `<span class="management-summary-row__line">${markup}</span>`;
}

export function buildManagementSummaryRow({ selected = false, lines = [], extraClassName = '', density = 'single' } = {}) {
  const classes = ['summary-row', 'admin-summary-row', 'management-summary-row', `management-summary-row--${density === 'double' ? 'double' : 'single'}`];
  if (selected) classes.push('is-selected');
  if (extraClassName) classes.push(extraClassName);

  const lineMarkup = lines
    .map((line) => buildLineMarkup(Array.isArray(line) ? line : []))
    .filter(Boolean)
    .join('');

  return `<button type="button" class="${classes.join(' ')}" data-management-key="true">${lineMarkup}</button>`;
}

export function renderManagementSummaryList(options = {}) {
  const {
    container,
    items = [],
    emptyText = '등록된 항목이 없습니다.',
    selectedKey = '',
    getKey,
    onSelect,
    buildRow
  } = options;

  if (!container) return;
  const resolvedItems = Array.isArray(items) ? items : [];
  const selectedValue = String(selectedKey ?? '').trim();

  if (!resolvedItems.length) {
    container.innerHTML = `<div class="empty-block list-empty ui-empty">${escapeHtml(emptyText)}</div>`;
    return;
  }

  const keyedItems = resolvedItems.map((item, index) => ({
    item,
    key: String(typeof getKey === 'function' ? getKey(item, index) ?? '' : ''),
    index
  }));

  container.innerHTML = keyedItems.map(({ item, key, index }) => {
    const row = typeof buildRow === 'function' ? buildRow(item, { key, index, selected: key === selectedValue }) : {};
    const markup = buildManagementSummaryRow({
      selected: key === selectedValue,
      lines: row?.lines || [],
      extraClassName: row?.extraClassName || '',
      density: row?.density || 'single'
    });
    return markup.replace('data-management-key="true"', `data-management-key="${escapeHtml(key)}"`);
  }).join('');

  if (typeof onSelect !== 'function') return;
  container.querySelectorAll('[data-management-key]').forEach((row) => {
    row.addEventListener('click', () => {
      const key = row.dataset.managementKey || '';
      const found = keyedItems.find((entry) => entry.key === key);
      if (found) onSelect(found.item, found.index);
    });
  });
}


function isSummaryToken(value) {
  return !!value && typeof value === 'object' && (value.type === 'text' || value.type === 'html');
}

function normalizeSummaryToken(value, strong = false) {
  if (value == null || value === false) return null;
  if (isSummaryToken(value)) return value;
  return strong ? summaryStrong(value) : summaryText(value);
}

export function buildOneLineManagementRow({
  badgesHtml = '',
  leading = [],
  strong = '',
  trailing = [],
  dateText = '',
  extraClassName = '',
  density = 'single'
} = {}) {
  const line = [];
  if (normalizeText(badgesHtml)) line.push(summaryHtml(badgesHtml, { tone: 'badges' }));
  const normalizedLeading = Array.isArray(leading) ? leading.map((item) => normalizeSummaryToken(item)).filter(Boolean) : [];
  const strongItem = normalizeSummaryToken(strong, true);
  const normalizedTrailing = Array.isArray(trailing) ? trailing.map((item) => normalizeSummaryToken(item)).filter(Boolean) : [];
  const dateItem = normalizeText(dateText) ? summaryDate(dateText) : null;
  return {
    density: density === 'double' ? 'double' : 'single',
    extraClassName,
    lines: [[
      ...line,
      ...normalizedLeading,
      ...(strongItem ? [strongItem] : []),
      ...normalizedTrailing,
      ...(dateItem ? [dateItem] : [])
    ]]
  };
}

export function renderOneLineManagementList(options = {}) {
  const {
    buildRowConfig,
    density = 'single',
    ...rest
  } = options;

  return renderManagementSummaryList({
    ...rest,
    buildRow: (item, context) => {
      const config = typeof buildRowConfig === 'function' ? buildRowConfig(item, context) || {} : {};
      return buildOneLineManagementRow({
        density,
        ...config
      });
    }
  });
}


// ═══════════════════════════════════════════════════════════════════════════
// 테이블 그리드 렌더러 — 상품목록 스타일의 <table> 기반 목록
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 테이블 그리드 목록을 렌더링한다.
 *
 * @param {object} options
 * @param {HTMLElement} options.thead       <thead> 요소
 * @param {HTMLElement} options.tbody       <tbody> 요소
 * @param {Array} options.columns          컬럼 정의 [{ key, label, align, maxW, w, wCh }]
 * @param {Array} options.items            데이터 배열
 * @param {string} options.selectedKey     선택된 행 키
 * @param {Function} options.getKey        (item) => key
 * @param {Function} options.getCellValue  (col, item) => string|html
 * @param {Function} options.onSelect      (item, index) => void
 * @param {string} [options.emptyText]     빈 목록 텍스트
 */
/**
 * 테이블 그리드 + 헤더 내장형 필터.
 * filterable: true인 컬럼은 헤더 클릭 시 체크박스 드롭다운이 열린다.
 * getCellText(col, item)가 있으면 필터용 텍스트값으로 사용.
 */
const EDIT_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></svg>';
const DELETE_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

export function renderTableGrid(options = {}) {
  const {
    thead, tbody, columns = [], items = [], selectedKey = '',
    getKey, getCellValue, getCellText, getRowClass, onSelect, onAction = null,
    emptyText = '등록된 항목이 없습니다.',
    sortable = false,
    _bodyOnly = false
  } = options;

  // ── 필터 상태 (thead에 바인딩) ──
  if (thead && !thead._gridFilter) {
    thead._gridFilter = { active: {}, search: {}, openCol: null, latestOpts: null, sortCol: null, sortDir: 0 };

    thead.addEventListener('click', (e) => {
      if (e.target.closest('.pls-filter-dd')) return;
      const th = e.target.closest('.pls-th[data-col-key]');
      if (!th) return;
      const colKey = th.dataset.colKey;
      const gf = thead._gridFilter;
      const col = (gf.latestOpts?.columns || []).find(c => c.key === colKey);
      const hasFilter = col?.filterable || col?.searchable;
      if (hasFilter) {
        if (gf.openCol === colKey) { _closeGridFilter(thead); return; }
        const o = gf.latestOpts;
        if (o) _openGridFilter(thead, o.tbody, colKey, o.columns, o.items, o.getKey, o.getCellValue, o.getCellText, o.selectedKey, o.onSelect, o.emptyText, o);
      } else if (gf.latestOpts?.sortable) {
        // 필터 없는 컬럼: 클릭으로 정렬 토글 (sortable: true인 경우만)
        if (gf.sortCol === colKey) {
          gf.sortDir = gf.sortDir === 1 ? -1 : gf.sortDir === -1 ? 0 : 1;
          if (!gf.sortDir) gf.sortCol = null;
        } else {
          gf.sortCol = colKey; gf.sortDir = 1;
        }
        const o = gf.latestOpts;
        if (o) renderTableGrid(o);
      }
    });

    document.addEventListener('click', (e) => {
      if (!thead._gridFilter.openCol) return;
      if (e.target.closest('.pls-th') || e.target.closest('.pls-filter-dd')) return;
      _closeGridFilter(thead);
      const o = thead._gridFilter.latestOpts;
      if (o) renderTableGrid(o);
    });
  }
  // 최신 옵션 저장 (이벤트 핸들러에서 참조)
  if (thead?._gridFilter) {
    thead._gridFilter.latestOpts = { thead, tbody, columns, items, selectedKey, getKey, getCellValue, getCellText, onSelect, emptyText, ...options };
  }

  const gf = thead?._gridFilter || { active: {} };
  const hasActions = typeof onAction === 'function';

  // ── 필터 적용 (체크박스 + 검색) ──
  let filtered = items;
  const activeFilters = gf.active || {};
  const searchFilters = gf.search || {};
  for (const [colKey, selectedSet] of Object.entries(activeFilters)) {
    if (!selectedSet.size) continue;
    const col = columns.find(c => c.key === colKey);
    if (!col) continue;
    const candidate = filtered.filter(item => {
      const text = typeof getCellText === 'function' ? getCellText(col, item) : '';
      return selectedSet.has(text);
    });
    if (candidate.length) filtered = candidate;
  }
  for (const [colKey, query] of Object.entries(searchFilters)) {
    if (!query) continue;
    const col = columns.find(c => c.key === colKey);
    if (!col) continue;
    const q = query.toLowerCase();
    const candidate = filtered.filter(item => {
      const text = typeof getCellText === 'function' ? getCellText(col, item) : '';
      return text.toLowerCase().includes(q);
    });
    if (candidate.length) filtered = candidate;
  }

  // ── 선택된 항목 보존: 필터에 빠져도 목록에 유지 ──
  const selKey = String(selectedKey ?? '').trim();
  if (selKey && typeof getKey === 'function') {
    const inFiltered = filtered.some((item, i) => String(getKey(item, i) ?? '') === selKey);
    if (!inFiltered) {
      const selItem = items.find((item, i) => String(getKey(item, i) ?? '') === selKey);
      if (selItem) filtered = [selItem, ...filtered];
    }
  }

  // ── 정렬 적용 ──
  if (gf.sortCol && gf.sortDir) {
    const sortCol = columns.find(c => c.key === gf.sortCol);
    if (sortCol) {
      filtered = [...filtered].sort((a, b) => {
        const aText = typeof getCellText === 'function' ? getCellText(sortCol, a) : '';
        const bText = typeof getCellText === 'function' ? getCellText(sortCol, b) : '';
        // 숫자 컬럼 — getCellValue에서 숫자 추출 시도, 없으면 텍스트에서 파싱
        if (sortCol.num || sortCol.priceMonth) {
          const aVal = typeof getCellValue === 'function' ? getCellValue(sortCol, a) : aText;
          const bVal = typeof getCellValue === 'function' ? getCellValue(sortCol, b) : bText;
          const aNum = parseFloat(String(aVal).replace(/[^\d.-]/g, '')) || 0;
          const bNum = parseFloat(String(bVal).replace(/[^\d.-]/g, '')) || 0;
          return gf.sortDir * (aNum - bNum);
        }
        return gf.sortDir * aText.localeCompare(bText, 'ko');
      });
    }
  }

  // ── 헤더 렌더링 (필터 드롭다운이 열려 있으면 건너뜀) ──
  if (thead && !_bodyOnly) {
    const ths = columns.map(col => {
      const styles = [];
      if (col.w) { styles.push(`width:${col.w}px`); styles.push(`min-width:${col.w}px`); styles.push(`max-width:${col.w}px`); }
      else if (col.wCh) styles.push(`width:${col.wCh.length + 1}ch`);
      if (col.maxW) styles.push(`max-width:${col.maxW}px`);
      const sAttr = styles.length ? ` style="${styles.join(';')}"` : '';
      const alignCls = col.align === 'r' ? ' pls--right' : col.align === 'c' ? ' pls--center' : '';
      const isFilterable = col.filterable || col.searchable;
      const filterable = isFilterable ? ' pls-th--filterable' : '';
      const hasCheckFilter = col.filterable && activeFilters[col.key]?.size;
      const hasSearchFilter = col.searchable && searchFilters[col.key];
      const hasFilter = (hasCheckFilter || hasSearchFilter) ? ' pls-th--has-filter' : '';
      const dataAttr = ` data-col-key="${escapeHtml(col.key)}"`;
      const isSorted = sortable && gf.sortCol === col.key && gf.sortDir;
      const sortIndicator = isSorted ? `<span class="pls-th__sort">${gf.sortDir === 1 ? '▲' : '▼'}</span>` : '';
      const sortableCls = (sortable && !isFilterable) ? ' pls-th--sortable' : '';
      return `<th class="pls-th${alignCls}${filterable}${hasFilter}${sortableCls}"${dataAttr}${sAttr}><span class="pls-th__label">${escapeHtml(col.label)}</span>${sortIndicator}</th>`;
    }).join('');
    const actionTh = hasActions ? '<th class="pls-th pls--center" style="width:56px"></th>' : '';
    thead.innerHTML = `<tr>${ths}${actionTh}</tr>`;
  }

  // ── 바디 렌더링 ──
  if (!tbody) return;
  const scrollParent = tbody.closest('.pls-grid-scroll') || tbody.parentElement;
  const prevScroll = scrollParent?.scrollTop || 0;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="${columns.length}" class="list-empty">${escapeHtml(emptyText)}</td></tr>`;
    return;
  }

  const selected = String(selectedKey ?? '').trim();
  tbody.innerHTML = filtered.map((item, index) => {
    const key = String(typeof getKey === 'function' ? getKey(item, index) ?? '' : '');
    const active = key === selected ? ' is-active' : '';
    const extraClass = typeof getRowClass === 'function' ? (getRowClass(item, index) || '') : '';
    const rowCls = `pls-row${active}${extraClass ? ' ' + extraClass : ''}`;
    const cells = columns.map(col => {
      const alignCls = col.align === 'c' ? ' pls--center' : col.align === 'r' ? ' pls--right' : '';
      const styles = [];
      if (col.maxW) styles.push(`max-width:${col.maxW}px`);
      const sAttr = styles.length ? ` style="${styles.join(';')}"` : '';
      const val = typeof getCellValue === 'function' ? getCellValue(col, item) : '';
      return `<td class="pls-cell${alignCls}"${sAttr}>${val}</td>`;
    }).join('');
    const actionCell = hasActions
      ? `<td class="pls-cell pls--center" style="width:56px"><span class="row-actions">`
        + `<button type="button" class="row-action-btn" data-action="edit" data-row-key="${escapeHtml(key)}" title="수정">${EDIT_ICON}</button>`
        + `<button type="button" class="row-action-btn row-action-btn--danger" data-action="delete" data-row-key="${escapeHtml(key)}" title="삭제">${DELETE_ICON}</button>`
        + `</span></td>`
      : '';
    return `<tr class="${rowCls}" data-key="${escapeHtml(key)}">${cells}${actionCell}</tr>`;
  }).join('');

  // ── 행 액션 버튼 바인딩 ──
  if (hasActions) {
    tbody.querySelectorAll('.row-action-btn[data-action]').forEach((btn) => {
      btn.onclick = function(e) {
        e.stopImmediatePropagation();
        e.stopPropagation();
        e.preventDefault();
        const action = this.getAttribute('data-action');
        const rowKey = this.getAttribute('data-row-key');
        const item = filtered.find((it, i) => String(typeof getKey === 'function' ? getKey(it, i) : '') === rowKey);
        onAction(action, rowKey, item);
      };
    });
  }

  // 스크롤 위치 복원
  if (scrollParent && prevScroll) scrollParent.scrollTop = prevScroll;

  if (typeof onSelect !== 'function') return;
  tbody.querySelectorAll('.pls-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.row-action-btn') || e.target.closest('[data-action]') || e.target.closest('.row-actions')) return;
      const key = row.dataset.key || '';
      const idx = filtered.findIndex((item, i) => String(typeof getKey === 'function' ? getKey(item, i) : '') === key);
      if (idx >= 0) onSelect(filtered[idx], idx);
    });
  });
}

function _closeGridFilter(thead) {
  if (!thead) return;
  // body에 붙은 드롭다운도 제거
  document.querySelectorAll('.pls-filter-dd').forEach(dd => dd.remove());
  thead.querySelectorAll('.pls-th.is-filtering').forEach(th => th.classList.remove('is-filtering'));
  if (thead._gridFilter) thead._gridFilter.openCol = null;
}

function _buildSortRow(gf, colKey) {
  const isAsc = gf.sortCol === colKey && gf.sortDir === 1;
  const isDesc = gf.sortCol === colKey && gf.sortDir === -1;
  return `<div class="pls-fdd__sort-row">`
    + `<button type="button" class="pls-fdd__sort-btn${isAsc ? ' is-active' : ''}" data-sort-dir="1">▲ 오름차순</button>`
    + `<button type="button" class="pls-fdd__sort-btn${isDesc ? ' is-active' : ''}" data-sort-dir="-1">▼ 내림차순</button>`
    + `</div>`;
}

function _bindSortButtons(dd, thead, gf, colKey, fullOptions, items) {
  dd.addEventListener('click', (e) => {
    const sortBtn = e.target.closest('[data-sort-dir]');
    if (!sortBtn) return;
    const dir = Number(sortBtn.dataset.sortDir);
    if (gf.sortCol === colKey && gf.sortDir === dir) {
      gf.sortCol = null; gf.sortDir = 0;
    } else {
      gf.sortCol = colKey; gf.sortDir = dir;
    }
    _closeGridFilter(thead);
    renderTableGrid({ ...fullOptions, items });
  });
}

function _positionDropdown(dd, th) {
  // 패널 경계를 미리 캡처 (rAF 전에)
  const panel = th.closest('.pls-grid-panel, .panel');
  const panelRect = panel ? panel.getBoundingClientRect() : null;

  dd.style.position = 'fixed';
  dd.style.left = '-9999px';
  dd.style.top = '-9999px';
  document.body.appendChild(dd);
  dd._parentTh = th;

  requestAnimationFrame(() => {
    const thRect = th.getBoundingClientRect();
    const ddW = dd.offsetWidth;
    const ddH = dd.offsetHeight;
    const pr = panelRect || { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight };

    let left = thRect.left;
    let top = thRect.bottom + 1;

    // 패널 우측 벗어남 → th 우측 끝 기준 좌측으로
    if (left + ddW > pr.right) {
      left = thRect.right - ddW;
    }
    // 패널 하단 벗어남 → 위로
    if (top + ddH > pr.bottom) {
      top = thRect.top - ddH - 1;
    }

    dd.style.left = `${Math.max(pr.left, left)}px`;
    dd.style.top = `${Math.max(0, top)}px`;
  });
}

function _openGridFilter(thead, tbody, colKey, columns, items, getKey, getCellValue, getCellText, selectedKey, onSelect, emptyText, fullOptions) {
  _closeGridFilter(thead);
  const gf = thead._gridFilter;
  const col = columns.find(c => c.key === colKey);
  if (!col) return;

  gf.openCol = colKey;
  const th = thead.querySelector(`[data-col-key="${colKey}"]`);
  if (!th) return;
  th.classList.add('is-filtering');

  const dd = document.createElement('div');
  dd.className = 'pls-filter-dd';

  // ── 검색형 필터 ──
  if (col.searchable) {
    const curQuery = gf.search[colKey] || '';
    dd.innerHTML = `<div class="pls-fdd__search-wrap"><input type="text" class="pls-fdd__search" placeholder="${escapeHtml(col.label)} 검색..." value="${escapeHtml(curQuery)}"><span class="pls-fdd__match-count" data-fdd-count></span></div>`
      + `<div class="pls-fdd__actions"><button type="button" class="pls-fdd__action-btn pls-fdd__action-btn--reset" data-fdd-reset>초기화</button><button type="button" class="pls-fdd__action-btn pls-fdd__action-btn--apply" data-fdd-apply>적용</button></div>`;
    _positionDropdown(dd, th);
    const searchInput = dd.querySelector('.pls-fdd__search');
    const countEl = dd.querySelector('[data-fdd-count]');
    function updateMatchCount(query) {
      if (!countEl) return;
      const q = (query || '').trim().toLowerCase();
      if (!q) { countEl.textContent = ''; return; }
      // faceted: 다른 컬럼 필터 반영
      let base = items;
      for (const [otherKey, otherSet] of Object.entries(gf.active || {})) {
        if (otherKey === colKey || !otherSet.size) continue;
        const otherCol = columns.find(c => c.key === otherKey);
        if (!otherCol) continue;
        base = base.filter(item => {
          const text = typeof getCellText === 'function' ? getCellText(otherCol, item) : '';
          return otherSet.has(text);
        });
      }
      const matchCount = base.filter(item => {
        const text = typeof getCellText === 'function' ? getCellText(col, item) : '';
        return text.toLowerCase().includes(q);
      }).length;
      countEl.textContent = `${matchCount}건`;
      countEl.classList.toggle('pls-fdd__match-count--zero', matchCount === 0);
    }
    updateMatchCount(curQuery);
    searchInput?.focus();
    let timer = null;
    searchInput?.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const q = (searchInput.value || '').trim();
        gf.search[colKey] = q;
        updateMatchCount(q);
        const latest = thead._gridFilter?.latestOpts || { ...fullOptions, items };
        renderTableGrid({ ...latest, _bodyOnly: true });
      }, 150);
    });
    dd.addEventListener('click', (e) => {
      const latest = thead._gridFilter?.latestOpts || { ...fullOptions, items };
      if (e.target.closest('[data-fdd-apply]')) { _closeGridFilter(thead); renderTableGrid(latest); return; }
      if (e.target.closest('[data-fdd-reset]')) { delete gf.search[colKey]; _closeGridFilter(thead); renderTableGrid(latest); }
    });
    return;
  }

  // ── 체크박스형 필터 (faceted: 다른 컬럼 필터 반영) ──
  let facetedItems = items;
  for (const [otherKey, otherSet] of Object.entries(gf.active)) {
    if (otherKey === colKey || !otherSet.size) continue;
    const otherCol = columns.find(c => c.key === otherKey);
    if (!otherCol) continue;
    facetedItems = facetedItems.filter(item => {
      const text = typeof getCellText === 'function' ? getCellText(otherCol, item) : '';
      return otherSet.has(text);
    });
  }
  for (const [otherKey, query] of Object.entries(gf.search || {})) {
    if (otherKey === colKey || !query) continue;
    const otherCol = columns.find(c => c.key === otherKey);
    if (!otherCol) continue;
    const q = query.toLowerCase();
    facetedItems = facetedItems.filter(item => {
      const text = typeof getCellText === 'function' ? getCellText(otherCol, item) : '';
      return text.toLowerCase().includes(q);
    });
  }
  const counts = new Map();
  facetedItems.forEach(item => {
    const text = typeof getCellText === 'function' ? getCellText(col, item) : '';
    if (text && text !== '-') counts.set(text, (counts.get(text) || 0) + 1);
  });
  // 숫자 컬럼(대여료/주행거리 등)은 원래 순서(금액·거리순), 나머지는 count 내림차순
  const isNumCol = col.num || col.priceMonth;
  const sorted = [...counts.entries()].sort((a, b) =>
    isNumCol
      ? (parseFloat(a[0].replace(/[^\d.-]/g, '')) || 0) - (parseFloat(b[0].replace(/[^\d.-]/g, '')) || 0)
      : b[1] - a[1]
  );

  if (!gf.active[colKey]) gf.active[colKey] = new Set();
  const selected = gf.active[colKey];

  dd.innerHTML = sorted.map(([val, cnt]) => {
      const checked = selected.has(val) ? 'checked' : '';
      const cls = checked ? ' is-checked' : '';
      return `<label class="${cls}"><input type="checkbox" value="${escapeHtml(val)}" ${checked}><span>${escapeHtml(val)}</span><span class="pls-fdd__count">${cnt}</span></label>`;
    }).join('')
    + `<div class="pls-fdd__actions"><button type="button" class="pls-fdd__action-btn pls-fdd__action-btn--reset" data-fdd-reset>초기화</button><button type="button" class="pls-fdd__action-btn pls-fdd__action-btn--apply" data-fdd-apply>적용</button></div>`;

  _positionDropdown(dd, th);

  // 체크박스 → 즉시 필터 (드롭다운 유지, 바디만 갱신)
  dd.addEventListener('change', (e) => {
    const input = e.target.closest('input[type="checkbox"]');
    if (!input) return;
    if (input.checked) selected.add(input.value); else selected.delete(input.value);
    input.closest('label')?.classList.toggle('is-checked', input.checked);
    const latest = thead._gridFilter?.latestOpts || { ...fullOptions, items };
    renderTableGrid({ ...latest, _bodyOnly: true });
  });

  // 적용/초기화
  dd.addEventListener('click', (e) => {
    if (e.target.closest('[data-fdd-apply]')) {
      _closeGridFilter(thead);
      const latest = thead._gridFilter?.latestOpts || { ...fullOptions, items };
      renderTableGrid(latest);
      return;
    }
    if (e.target.closest('[data-fdd-reset]')) {
      selected.clear();
      _closeGridFilter(thead);
      const latest = thead._gridFilter?.latestOpts || { ...fullOptions, items };
      renderTableGrid(latest);
    }
  });
}
