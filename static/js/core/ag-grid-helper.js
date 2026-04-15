/**
 * ag-grid-helper.js
 * AG Grid Community 공용 래퍼 — 모든 목록 페이지에서 동일한 필터/정렬/우클릭 경험 제공
 */
import { escapeHtml } from './management-format.js';

const { createGrid } = globalThis.agGrid || {};

// ── 필터 팝업 ──
let _filterPopup = null;
function removeFilterPopup() { if (_filterPopup) { _filterPopup.remove(); _filterPopup = null; } }
document.addEventListener('pointerdown', (e) => { if (_filterPopup && !_filterPopup.contains(e.target)) removeFilterPopup(); }, true);

function getColValue(colDef, row) {
  if (colDef.valueGetter) return String(colDef.valueGetter({ data: row }) || '');
  return String(row[colDef.field] || '');
}

/**
 * AG Grid 기반 목록 생성
 * @param {Object} opts
 * @param {HTMLElement} opts.container - AG Grid 컨테이너 DOM
 * @param {Array} opts.columnDefs - 컬럼 정의 (_ft: 'set'|'search'|'range'|false)
 * @param {Function} opts.onRowClicked - 행 클릭 콜백 (data)
 * @param {Function} opts.onContextMenu - 우클릭 콜백 (data, event)
 * @param {Function} opts.onFilterChanged - 필터 변경 콜백 (displayCount)
 * @param {Object} opts.gridOptionsOverride - 추가 gridOptions
 * @returns {{ setData, getFilteredData, getApi, applyFilters, destroy }}
 */
export function createAgGridList({
  container,
  columnDefs,
  onRowClicked,
  onContextMenu,
  onFilterChanged,
  gridOptionsOverride = {},
}) {
  if (!container || !createGrid) {
    console.warn('[ag-grid-helper] AG Grid not available');
    return null;
  }

  let gridApi = null;
  let allData = [];
  const colFilters = {}; // { field: Set | string | { type: 'range', ranges, indices } }

  // ── 필터 로직 ──
  function getFilteredExcept(excludeField) {
    let items = allData;
    for (const [field, filterVal] of Object.entries(colFilters)) {
      if (field === excludeField || !filterVal) continue;
      const col = columnDefs.find(c => c.field === field);
      if (!col) continue;
      if (typeof filterVal === 'string') {
        const q = filterVal.toLowerCase();
        items = items.filter(p => getColValue(col, p).toLowerCase().includes(q));
      } else if (filterVal?.type === 'range' && filterVal.ranges) {
        items = items.filter(p => {
          const v = Number(p[field] || 0);
          return filterVal.ranges.some(r => v >= r.min && v < r.max);
        });
      } else if (filterVal instanceof Set && filterVal.size) {
        items = items.filter(p => filterVal.has(getColValue(col, p)));
      }
    }
    return items;
  }

  function getFiltered() { return getFilteredExcept(null); }

  function applyFilters() {
    const filtered = getFiltered();
    if (gridApi) gridApi.setGridOption('rowData', filtered);
    onFilterChanged?.(filtered.length);
    // 헤더 뱃지
    requestAnimationFrame(() => {
      container.querySelectorAll('.ag-header-cell').forEach(cell => {
        const colId = cell.getAttribute('col-id');
        const fv = colFilters[colId];
        const isActive = fv instanceof Set ? fv.size > 0 : fv?.type === 'range' ? true : !!fv;
        cell.classList.toggle('ag-header-cell-filtered', isActive);
        let badge = cell.querySelector('.ag-filter-badge');
        if (isActive) {
          const count = fv instanceof Set ? fv.size : 1;
          if (!badge) {
            badge = document.createElement('span');
            badge.className = 'ag-filter-badge';
            cell.querySelector('.ag-header-cell-label')?.appendChild(badge);
          }
          badge.textContent = count;
        } else if (badge) { badge.remove(); }
      });
    });
  }

  // ── 헤더 클릭 → 필터 드롭다운 ──
  function onHeaderClick(e) {
    const headerEl = e.target.closest('.ag-header-cell');
    if (!headerEl) return;
    const colId = headerEl.getAttribute('col-id');
    if (!colId) return;
    const colDef = columnDefs.find(c => c.field === colId);
    if (!colDef || !colDef._ft) return;

    removeFilterPopup();
    const rect = headerEl.getBoundingClientRect();
    const field = colDef.field;
    const fType = colDef._ft;

    const popup = document.createElement('div');
    popup.className = 'pm-ctx-menu';
    popup.style.cssText = `position:fixed;top:${rect.bottom + 2}px;left:${rect.left}px;z-index:9999;min-width:${Math.max(rect.width, 160)}px;max-height:360px;display:flex;flex-direction:column;padding:0;`;

    if (fType === 'search') {
      const currentQuery = colFilters[field] || '';
      popup.innerHTML = `
        <div style="padding:8px;">
          <input type="text" value="${escapeHtml(currentQuery)}" placeholder="검색어 입력..." style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:var(--radius-sm,3px);font-size:12px;outline:none;box-sizing:border-box;">
        </div>
        <div style="display:flex;gap:4px;padding:6px 10px;border-top:1px solid #e5e8eb;flex-shrink:0;">
          <button type="button" style="flex:1;padding:5px 0;font-size:11px;font-weight:600;border:1px solid #ddd;border-radius:var(--radius-sm,3px);background:#fff;cursor:pointer;" data-action="reset">초기화</button>
          <button type="button" style="flex:1;padding:5px 0;font-size:11px;font-weight:600;border:none;border-radius:var(--radius-sm,3px);background:#1b2a4a;color:#fff;cursor:pointer;" data-action="apply">적용</button>
        </div>
      `;
      const input = popup.querySelector('input');
      setTimeout(() => input?.focus(), 50);
      input?.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') popup.querySelector('[data-action="apply"]')?.click(); });
      popup.querySelector('[data-action="reset"]')?.addEventListener('click', () => { delete colFilters[field]; applyFilters(); removeFilterPopup(); });
      popup.querySelector('[data-action="apply"]')?.addEventListener('click', () => {
        const q = input?.value?.trim() || '';
        if (q) colFilters[field] = q; else delete colFilters[field];
        applyFilters(); removeFilterPopup();
      });

    } else if (fType === 'range') {
      const MILEAGE_RANGES = [
        { label: '1만Km 미만', min: 0, max: 10000 },
        { label: '1만~2만Km', min: 10000, max: 20000 },
        { label: '2만~3만Km', min: 20000, max: 30000 },
        { label: '3만~4만Km', min: 30000, max: 40000 },
        { label: '4만~5만Km', min: 40000, max: 50000 },
        { label: '5만~6만Km', min: 50000, max: 60000 },
        { label: '6만~7만Km', min: 60000, max: 70000 },
        { label: '7만~8만Km', min: 70000, max: 80000 },
        { label: '8만~9만Km', min: 80000, max: 90000 },
        { label: '9만~10만Km', min: 90000, max: 100000 },
        { label: '10만~15만Km', min: 100000, max: 150000 },
        { label: '15만~20만Km', min: 150000, max: 200000 },
        { label: '20만Km 이상', min: 200000, max: Infinity },
      ];
      const otherFiltered = getFilteredExcept(field);
      const rangeCounts = MILEAGE_RANGES.map(r => {
        const cnt = otherFiltered.filter(p => { const v = Number(p[field] || 0); return v >= r.min && v < r.max; }).length;
        return { ...r, cnt };
      }).filter(r => r.cnt > 0);
      const currentSelected = colFilters[field] || null;

      popup.innerHTML = `
        <div style="flex:1;overflow:auto;padding:6px 0;">
          ${rangeCounts.map((r, i) => {
            const checked = currentSelected?.indices?.has(String(i)) ? 'checked' : '';
            return `<label style="display:flex;align-items:center;gap:6px;padding:4px 12px;cursor:pointer;font-size:12px;white-space:nowrap;">
              <input type="checkbox" value="${i}" ${checked} data-min="${r.min}" data-max="${r.max}" style="margin:0;flex-shrink:0;">
              <span style="flex:1">${escapeHtml(r.label)}</span>
              <span style="font-size:10px;color:#94a3b8;flex-shrink:0;">${r.cnt}</span>
            </label>`;
          }).join('')}
        </div>
        <div style="display:flex;gap:4px;padding:6px 10px;border-top:1px solid #e5e8eb;flex-shrink:0;">
          <button type="button" style="width:100%;padding:5px 0;font-size:11px;font-weight:600;border:1px solid #ddd;border-radius:var(--radius-sm,3px);background:#fff;cursor:pointer;" data-action="reset">초기화</button>
        </div>
      `;
      popup.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
          const checked = [...popup.querySelectorAll('input[type="checkbox"]:checked')];
          if (!checked.length) { delete colFilters[field]; }
          else { colFilters[field] = { type: 'range', ranges: checked.map(c => ({ min: Number(c.dataset.min), max: Number(c.dataset.max) })), indices: new Set(checked.map(c => c.value)) }; }
          applyFilters();
        });
      });
      popup.querySelector('[data-action="reset"]')?.addEventListener('click', () => { delete colFilters[field]; applyFilters(); removeFilterPopup(); });

    } else {
      // set 필터
      const otherFiltered = getFilteredExcept(field);
      const countMap = {};
      otherFiltered.forEach(p => { const v = getColValue(colDef, p); if (v) countMap[v] = (countMap[v] || 0) + 1; });
      const sorted = Object.entries(countMap).sort((a, b) => b[1] - a[1]);
      const currentSelected = colFilters[field] || null;

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
          <button type="button" style="width:100%;padding:5px 0;font-size:11px;font-weight:600;border:1px solid #ddd;border-radius:var(--radius-sm,3px);background:#fff;cursor:pointer;" data-action="reset">초기화</button>
        </div>
      `;
      popup.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
          const checked = [...popup.querySelectorAll('input[type="checkbox"]:checked')].map(c => c.value);
          if (!checked.length) delete colFilters[field]; else colFilters[field] = new Set(checked);
          applyFilters();
        });
      });
      popup.querySelector('[data-action="reset"]')?.addEventListener('click', () => { delete colFilters[field]; applyFilters(); removeFilterPopup(); });
    }

    document.body.appendChild(popup);
    _filterPopup = popup;
    requestAnimationFrame(() => {
      const pr = popup.getBoundingClientRect();
      if (pr.right > window.innerWidth) popup.style.left = `${window.innerWidth - pr.width - 8}px`;
      if (pr.bottom > window.innerHeight) popup.style.top = `${rect.top - pr.height - 2}px`;
    });
  }

  // ── Grid 옵션 ──
  const gridOptions = {
    columnDefs,
    rowData: [],
    rowSelection: { mode: 'singleRow', enableClickSelection: true, checkboxes: false },
    animateRows: true,
    suppressCellFocus: true,
    suppressMenuHide: true,
    overlayNoRowsTemplate: '<div style="padding:40px;color:#94a3b8;">데이터가 없습니다.</div>',
    defaultColDef: {
      sortable: false,
      resizable: true,
      suppressMovable: true,
      suppressHeaderMenuButton: true,
      cellStyle: { fontSize: '12px', display: 'flex', alignItems: 'center' },
    },
    getRowId: (params) => params.data?.product_uid || params.data?.product_code || params.data?.contract_code || params.data?.settlement_code || params.data?.room_id || String(Math.random()),
    onRowClicked: (event) => { if (event.data) onRowClicked?.(event.data); },
    ...gridOptionsOverride,
  };

  // ── 초기화 ──
  gridApi = createGrid(container, gridOptions);
  // 컬럼 폭 맞춤 — 그리드가 보일 때만
  const fitColumns = () => {
    if (container.offsetWidth > 0) gridApi?.sizeColumnsToFit();
    else setTimeout(fitColumns, 100);
  };
  requestAnimationFrame(fitColumns);
  window.addEventListener('resize', () => gridApi?.sizeColumnsToFit());

  // 헤더 클릭 → 필터
  container.addEventListener('click', (e) => {
    if (e.target.closest('.ag-header-cell-resize')) return;
    if (e.target.closest('.ag-header-cell')) onHeaderClick(e);
  });

  // 우클릭
  if (onContextMenu) {
    container.addEventListener('contextmenu', (e) => {
      const rowEl = e.target.closest('.ag-row');
      if (!rowEl) return;
      e.preventDefault();
      const rowId = rowEl.getAttribute('row-id');
      if (!rowId || !gridApi) return;
      const rowNode = gridApi.getRowNode(rowId);
      if (rowNode?.data) onContextMenu(rowNode.data, e);
    });
  }

  // ── Public API ──
  return {
    setData(data) {
      allData = data;
      const filtered = getFiltered();
      if (gridApi) {
        gridApi.setGridOption('rowData', filtered);
        requestAnimationFrame(() => gridApi?.sizeColumnsToFit());
      }
      onFilterChanged?.(filtered.length);
    },
    getFilteredData: getFiltered,
    getApi: () => gridApi,
    applyFilters,
    selectRow(id) {
      if (!gridApi) return;
      if (id) { const node = gridApi.getRowNode(id); if (node) node.setSelected(true); }
      else gridApi.deselectAll();
    },
    resetFilters() {
      Object.keys(colFilters).forEach(k => delete colFilters[k]);
      applyFilters();
    },
    destroy() {
      gridApi?.destroy();
      gridApi = null;
    },
  };
}
