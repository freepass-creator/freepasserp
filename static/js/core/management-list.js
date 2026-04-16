/**
 * management-list.js (AG Grid v2)
 *
 * renderTableGrid — 기존 API 호환, 내부 AG Grid Community 사용
 * 모든 목록 페이지에서 동일한 규격으로 동작
 */
import { escapeHtml } from './management-format.js';

const { createGrid } = globalThis.agGrid || {};

// ── 스켈레톤 (AG Grid 로딩 전 표시) ──
export function renderSkeletonRows() {
  // AG Grid가 자체 로딩을 처리하므로 no-op
}

export function clearSkeleton() {}

// ── 필터 팝업 (공용) ──
let _filterPopup = null;
let _filterPopupColId = null;
function removeFilterPopup() { if (_filterPopup) { _filterPopup.remove(); _filterPopup = null; _filterPopupColId = null; } }
document.addEventListener('pointerdown', (e) => {
  if (!_filterPopup) return;
  if (_filterPopup.contains(e.target)) return;
  // 같은 헤더 재클릭은 click 핸들러에서 토글 처리하므로 여기서 닫지 않음
  if (e.target.closest('.ag-header-cell')?.getAttribute('col-id') === _filterPopupColId) return;
  removeFilterPopup();
}, true);

// ── AG Grid 인스턴스 캐시 (container → { gridApi, colFilters, allData, options }) ──
const _gridCache = new WeakMap();

function getColValue(col, getCellText, item) {
  if (typeof getCellText === 'function') return getCellText(col, item) || '';
  return '';
}

function getFilteredItems(allData, colFilters, columns, getCellText) {
  let items = allData;
  for (const [colKey, filterVal] of Object.entries(colFilters)) {
    if (!filterVal) continue;
    const col = columns.find(c => c.key === colKey);
    if (!col) continue;
    if (typeof filterVal === 'string') {
      const q = filterVal.toLowerCase();
      items = items.filter(item => getColValue(col, getCellText, item).toLowerCase().includes(q));
    } else if (filterVal instanceof Set && filterVal.size) {
      items = items.filter(item => filterVal.has(getColValue(col, getCellText, item)));
    }
  }
  return items;
}

function getFilteredExcept(excludeKey, allData, colFilters, columns, getCellText) {
  let items = allData;
  for (const [colKey, filterVal] of Object.entries(colFilters)) {
    if (colKey === excludeKey || !filterVal) continue;
    const col = columns.find(c => c.key === colKey);
    if (!col) continue;
    if (typeof filterVal === 'string') {
      const q = filterVal.toLowerCase();
      items = items.filter(item => getColValue(col, getCellText, item).toLowerCase().includes(q));
    } else if (filterVal instanceof Set && filterVal.size) {
      items = items.filter(item => filterVal.has(getColValue(col, getCellText, item)));
    }
  }
  return items;
}

// ── 헤더 클릭 → 필터 드롭다운 ──
function openFilterDropdown(col, headerEl, ctx) {
  const wasSameCol = (_filterPopupColId === col.key);
  removeFilterPopup();
  if (wasSameCol) return; // 같은 헤더 재클릭 → 닫기만
  const { colFilters, allData, columns, getCellText } = ctx;
  const rect = headerEl.getBoundingClientRect();
  const colKey = col.key;
  const isSearchable = col.searchable;
  const isFilterable = col.filterable;
  if (!isSearchable && !isFilterable) return;

  const popup = document.createElement('div');
  popup.className = 'pm-ctx-menu';
  popup.style.cssText = `position:fixed;top:${rect.bottom + 2}px;left:${rect.left}px;z-index:9999;min-width:${Math.max(rect.width, 160)}px;max-height:360px;display:flex;flex-direction:column;padding:0;`;

  if (isSearchable) {
    const currentQuery = colFilters[colKey] || '';
    popup.innerHTML = `
      <div style="padding:8px;">
        <input type="text" value="${escapeHtml(currentQuery)}" placeholder="${escapeHtml(col.label)} 검색..." style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:var(--radius-sm,3px);font-size:12px;outline:none;box-sizing:border-box;">
      </div>
      <div style="display:flex;gap:4px;padding:6px 10px;border-top:1px solid #e5e8eb;flex-shrink:0;">
        <button type="button" style="flex:1;padding:5px 0;font-size:11px;font-weight:600;border:1px solid #ddd;border-radius:var(--radius-sm,3px);background:#fff;cursor:pointer;" data-action="reset">초기화</button>
        <button type="button" style="flex:1;padding:5px 0;font-size:11px;font-weight:600;border:none;border-radius:var(--radius-sm,3px);background:#1b2a4a;color:#fff;cursor:pointer;" data-action="apply">닫기</button>
      </div>
    `;
    const input = popup.querySelector('input');
    setTimeout(() => input?.focus(), 50);
    // 입력 즉시 반영 — 체크박스 필터와 동일한 UX
    let _liveTimer = 0;
    input?.addEventListener('input', () => {
      clearTimeout(_liveTimer);
      _liveTimer = setTimeout(() => {
        const q = input.value.trim();
        if (q) colFilters[colKey] = q; else delete colFilters[colKey];
        ctx.refresh();
      }, 150);
    });
    input?.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') removeFilterPopup(); });
    popup.querySelector('[data-action="reset"]')?.addEventListener('click', () => { delete colFilters[colKey]; ctx.refresh(); removeFilterPopup(); });
    popup.querySelector('[data-action="apply"]')?.addEventListener('click', () => { removeFilterPopup(); });
  } else {
    // 체크박스 Set 필터
    const otherFiltered = getFilteredExcept(colKey, allData, colFilters, columns, getCellText);
    const countMap = {};
    otherFiltered.forEach(item => { const v = getColValue(col, getCellText, item); if (v && v !== '-') countMap[v] = (countMap[v] || 0) + 1; });

    // 숫자 컬럼(대여료, 주행거리 등)은 순서대로, 나머지는 건수 많은순
    const isNumCol = col.num || col.priceMonth;
    const numKey = (s) => parseFloat(String(s).replace(/[^\d.-]/g, '')) || 0;
    const sorted = Object.entries(countMap).sort((a, b) => isNumCol ? numKey(a[0]) - numKey(b[0]) : b[1] - a[1]);
    const currentSelected = colFilters[colKey] || null;

    popup.innerHTML = `
      <div style="flex:1;overflow:auto;padding:6px 0;">
        ${sorted.map(([v, cnt]) => {
          const checked = currentSelected?.has(v) ? 'checked' : '';
          return `<label style="display:flex;align-items:center;gap:6px;padding:4px 12px;cursor:pointer;font-size:12px;white-space:nowrap;">
            <input type="checkbox" value="${escapeHtml(v)}" ${checked} style="margin:0;flex-shrink:0;">
            <span style="flex:1">${escapeHtml(v)}</span>
            <span style="font-size:10px;color:#94a3b8;flex-shrink:0;">${cnt}</span>
          </label>`;
        }).join('')}
      </div>
      <div style="display:flex;gap:4px;padding:6px 10px;border-top:1px solid #e5e8eb;flex-shrink:0;">
        <button type="button" style="flex:1;padding:5px 0;font-size:11px;font-weight:600;border:1px solid #ddd;border-radius:var(--radius-sm,3px);background:#fff;cursor:pointer;" data-action="reset">초기화</button>
        <button type="button" style="flex:1;padding:5px 0;font-size:11px;font-weight:600;border:none;border-radius:var(--radius-sm,3px);background:#1b2a4a;color:#fff;cursor:pointer;" data-action="apply">적용</button>
      </div>
    `;
    // 체크 즉시 반영 + 적용 버튼
    popup.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const checked = [...popup.querySelectorAll('input[type="checkbox"]:checked')].map(c => c.value);
        if (!checked.length) delete colFilters[colKey]; else colFilters[colKey] = new Set(checked);
        ctx.refresh();
      });
    });
    popup.querySelector('[data-action="reset"]')?.addEventListener('click', () => { delete colFilters[colKey]; ctx.refresh(); removeFilterPopup(); });
    popup.querySelector('[data-action="apply"]')?.addEventListener('click', () => { ctx.refresh(); removeFilterPopup(); });
  }

  document.body.appendChild(popup);
  _filterPopup = popup;
  _filterPopupColId = col.key;
  requestAnimationFrame(() => {
    const pr = popup.getBoundingClientRect();
    if (pr.right > window.innerWidth) popup.style.left = `${window.innerWidth - pr.width - 8}px`;
    if (pr.bottom > window.innerHeight) popup.style.top = `${rect.top - pr.height - 2}px`;
  });
}

// ── renderTableGrid (AG Grid 래퍼) ──
export function renderTableGrid(options = {}) {
  const {
    thead, tbody, columns = [], items = [], selectedKey = '',
    getKey, getCellValue, getCellText, onSelect,
    emptyText = '등록된 항목이 없습니다.',
    _bodyOnly = false
  } = options;

  // AG Grid 컨테이너 찾기 — tbody 자체가 .erp-grid이거나, 부모 패널 안에 .erp-grid가 있거나
  let container = null;
  if (tbody?.classList?.contains('erp-grid')) {
    container = tbody;
  } else if (tbody) {
    container = tbody.closest('.pls-grid-panel')?.querySelector('.erp-grid') || tbody.closest('.erp-grid');
  }
  if (!container || !createGrid) {
    console.warn('[management-list] AG Grid not available or container not found');
    return;
  }

  let cached = _gridCache.get(container);

  // 컬럼 정의 빌더 (재사용)
  function buildAgColDefs(colList) {
    return colList.map(col => {
      // 전체 좌측 정렬 통일 (AG Grid 디폴트)
      const isNum = col.num || col.priceMonth || false;
      const WIDE_KEYS = ['subModel', 'sub_model', 'trim', 'trim_name', 'subTrim', 'options'];
      // 헤더는 항상 가운데, 셀은 align:'l'일 때만 좌측 들여쓰기
      const isLeft = col.align === 'l';
      const def = {
        colId: col.key,
        headerName: col.label || col.key,
        sortable: isNum || false,
        resizable: true,
        suppressMovable: false,
        suppressHeaderMenuButton: true,
        headerClass: 'ag-center-aligned-header',
        cellClass: isLeft ? 'ag-left-aligned-cell erp-indent' : 'ag-center-aligned-cell',
      };
      // 컬럼 고정 (좌측/우측)
      if (col.pinned === 'left' || col.pinned === 'right') def.pinned = col.pinned;
      // 폭 설정 — 뱃지/필터 컬럼은 넉넉히, 검색 컬럼만 flex
      const labelLen = (col.label || '').length;
      const hasBadge = col.filterable && !col.searchable && !col.num && !col.priceMonth;
      const badgeExtra = hasBadge ? 20 : 0; // 뱃지 패딩+테두리 여유
      // 초기 힌트 폭 — autoSize가 실제 콘텐츠에 맞춰 재조정
      const autoW = Math.max(40, labelLen * 10 + 8 + badgeExtra);
      if (col.w) { def.width = col.w; def.minWidth = 40; }
      else if (col.priceMonth) { def.width = 75; def.minWidth = 40; }
      else if (WIDE_KEYS.includes(col.key)) { def.width = 160; def.minWidth = 40; }
      else { def.width = autoW; def.minWidth = 40; }
      // maxWidth 제거 — 콘텐츠 길이만큼 자유롭게 (사용자가 수동 조절 가능)

      // 값 가져오기
      def.valueGetter = (params) => {
        if (!params.data) return '';
        return typeof getCellText === 'function' ? getCellText(col, params.data) : '';
      };

      // HTML 셀 렌더링 — AG Grid 기본 렌더 사용 (wrapper 없음)
      if (typeof getCellValue === 'function') {
        def.cellRenderer = (params) => {
          if (!params.data) return '';
          return getCellValue(col, params.data);
        };
      }

      // 정렬
      if (col.num || col.priceMonth) {
        def.comparator = (a, b) => {
          const aNum = parseFloat(String(a).replace(/[^\d.-]/g, '')) || 0;
          const bNum = parseFloat(String(b).replace(/[^\d.-]/g, '')) || 0;
          return aNum - bNum;
        };
      }

      return def;
    });
  }

  if (!cached) {
    // ── 최초: AG Grid 생성 ──
    const colFilters = {};
    const agColDefs = buildAgColDefs(columns);

    const gridOptions = {
      columnDefs: agColDefs,
      rowData: [],
      rowSelection: { mode: 'singleRow', enableClickSelection: true, checkboxes: false },
      animateRows: true,
      suppressCellFocus: true,
      overlayNoRowsTemplate: `<div style="padding:40px;color:#94a3b8;font-size:12px;">${escapeHtml(emptyText)}</div>`,
      defaultColDef: {
        sortable: false,
        resizable: true,
        suppressMovable: false,  // 드래그로 컬럼 순서 변경 가능
        suppressHeaderMenuButton: true,
      },
      getRowId: (params) => {
        if (!params.data) return String(Math.random());
        return typeof getKey === 'function' ? String(getKey(params.data, 0) || Math.random()) : String(Math.random());
      },
      onRowClicked: (event) => {
        const ctx = _gridCache.get(container);
        if (event.data && typeof ctx?.onSelect === 'function') ctx.onSelect(event.data, 0);
      },
    };

    container.innerHTML = '';
    const gridApi = createGrid(container, gridOptions);

    // 헤더 클릭 → 필터
    container.addEventListener('click', (e) => {
      if (e.target.closest('.ag-header-cell-resize')) return;
      const headerEl = e.target.closest('.ag-header-cell');
      if (!headerEl) return;
      const colId = headerEl.getAttribute('col-id');
      if (!colId) return;
      const col = columns.find(c => c.key === colId);
      if (!col || (!col.filterable && !col.searchable)) return;
      const ctx = _gridCache.get(container);
      if (ctx) openFilterDropdown(col, headerEl, ctx);
    });

    // 우클릭용 data-key는 contextmenu 핸들러에서 row-id를 직접 읽도록 했으므로
    // 여기서 setAttribute 하지 않음 (AG Grid DOM 재조정과 충돌 방지)

    // 컬럼 폭 저장/복원 (페이지별 localStorage)
    const storageKey = `erp.colWidth.v2.${location.pathname}.${container.id}`;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      Object.entries(saved).forEach(([colId, w]) => {
        const colDef = agColDefs.find(c => c.colId === colId);
        if (colDef && w > 0) { colDef.width = w; delete colDef.flex; }
      });
      if (Object.keys(saved).length) gridApi.setGridOption('columnDefs', agColDefs);
    } catch (_) {}

    // 저장된 폭 없으면 첫 렌더 후 AG Grid 자동맞춤 (엑셀식)
    // — 헤더+콘텐츠 max 폭으로 자동 조정
    if (!Object.keys(JSON.parse(localStorage.getItem(storageKey) || '{}')).length) {
      let _autoFitDone = false;
      gridApi.addEventListener('firstDataRendered', () => {
        if (_autoFitDone) return;
        _autoFitDone = true;
        setTimeout(() => { try { gridApi.autoSizeAllColumns(false); } catch (_) {} }, 100);
      });
    }

    // 헤더 경계 더블클릭 → 해당 컬럼 엑셀식 자동 폭 (헤더+콘텐츠 max)
    container.addEventListener('dblclick', (e) => {
      const resizeHandle = e.target.closest('.ag-header-cell-resize');
      if (!resizeHandle) return;
      const headerCell = resizeHandle.closest('.ag-header-cell');
      const colId = headerCell?.getAttribute('col-id');
      if (colId && gridApi) gridApi.autoSizeColumns([colId], false);
    });

    gridApi.addEventListener('columnResized', (event) => {
      if (!event.finished) return;
      const src = event.source || '';
      if (src !== 'uiColumnResized' && src !== 'uiColumnDragged' && src !== 'autosizeColumns') return;
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
        gridApi.getColumns().forEach(col => {
          saved[col.getColId()] = col.getActualWidth();
        });
        localStorage.setItem(storageKey, JSON.stringify(saved));
      } catch (_) {}
    });

    // 컬럼 순서 변경 영속화
    const orderKey = `erp.colOrder.v1.${location.pathname}.${container.id}`;
    // 저장된 순서 복원
    try {
      const order = JSON.parse(localStorage.getItem(orderKey) || '[]');
      if (Array.isArray(order) && order.length) {
        setTimeout(() => { try { gridApi.moveColumns(order, 0); } catch (_) {} }, 50);
      }
    } catch (_) {}
    gridApi.addEventListener('columnMoved', (event) => {
      if (!event.finished) return;
      try {
        const order = gridApi.getColumns().map(c => c.getColId());
        localStorage.setItem(orderKey, JSON.stringify(order));
      } catch (_) {}
    });

    cached = { gridApi, colFilters, allData: items, columns, getCellText, options };
    cached.refresh = () => {
      const filtered = getFilteredItems(cached.allData, cached.colFilters, cached.columns, cached.getCellText);
      cached.gridApi.setGridOption('rowData', filtered);
      // 헤더 필터 뱃지
      requestAnimationFrame(() => {
        container.querySelectorAll('.ag-header-cell').forEach(cell => {
          const colId = cell.getAttribute('col-id');
          const fv = cached.colFilters[colId];
          const isActive = fv instanceof Set ? fv.size > 0 : !!fv;
          cell.classList.toggle('ag-header-cell-filtered', isActive);
          // 뱃지는 data-count로만 표시 — CSS ::after로 렌더, AG Grid DOM 미터치
          if (isActive) {
            const count = fv instanceof Set ? fv.size : 1;
            cell.setAttribute('data-filter-count', count);
          } else {
            cell.removeAttribute('data-filter-count');
          }
        });
      });
    };

    _gridCache.set(container, cached);
  }

  // ── 데이터 업데이트 ──
  // 컬럼 키셋이 바뀌었으면 컬럼 재적용 (기간 토글 등)
  // — 기존 컬럼의 현재 폭은 그대로 유지, 신규 컬럼만 default 폭 적용
  const prevKeys = (cached.columns || []).map(c => c.key).join('|');
  const nextKeys = columns.map(c => c.key).join('|');
  if (prevKeys !== nextKeys) {
    const newDefs = buildAgColDefs(columns);
    // 기존 컬럼들의 현재 폭 수집 (실시간 + localStorage)
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(`erp.colWidth.v2.${location.pathname}.${container.id}`) || '{}'); } catch (_) {}
    try {
      cached.gridApi.getColumns()?.forEach(col => {
        const w = col.getActualWidth();
        if (w > 0) saved[col.getColId()] = w;
      });
    } catch (_) {}
    newDefs.forEach(def => {
      if (saved[def.colId]) {
        def.width = saved[def.colId];
        delete def.flex;
      }
    });
    cached.gridApi.setGridOption('columnDefs', newDefs);
    // localStorage 갱신
    try {
      requestAnimationFrame(() => {
        const fresh = {};
        cached.gridApi.getColumns()?.forEach(col => {
          fresh[col.getColId()] = col.getActualWidth();
        });
        localStorage.setItem(`erp.colWidth.v2.${location.pathname}.${container.id}`, JSON.stringify(fresh));
      });
    } catch (_) {}
  }
  cached.allData = items;
  cached.columns = columns;
  cached.getCellText = getCellText;
  cached.options = options;
  cached.onSelect = onSelect;
  cached.getKey = getKey;

  const filtered = getFilteredItems(items, cached.colFilters, columns, getCellText);
  cached.gridApi.setGridOption('rowData', filtered);

  // 선택 복원
  if (selectedKey) {
    requestAnimationFrame(() => {
      const node = cached.gridApi.getRowNode(String(selectedKey));
      if (node) node.setSelected(true);
    });
  }

}
