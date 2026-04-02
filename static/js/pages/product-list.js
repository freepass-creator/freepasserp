function moneyText(value){ const n = Number(value || 0); return n ? n.toLocaleString('ko-KR') : '-'; }
function safeText(value){ return String(value ?? '').trim() || '-'; }

import { renderColorBadge } from "../core/product-colors.js";
import { requireAuth } from "../core/auth-guard.js";
import { qs, registerPageCleanup, runPageCleanup } from "../core/utils.js";
import { renderRoleMenu } from "../core/role-menu.js";
import { pushEsc, removeEsc } from "../core/esc-stack.js";
import { ensureRoom, watchProducts, resolveTermForProduct } from "../firebase/firebase-db.js";
import { bindProductDetailPhotoEvents, extractTermFields, normalizeProduct, renderProductDetailMarkup } from "../shared/product-list-detail-view.js";
import { renderBadgeRow } from "../shared/badge.js";

const DEFAULT_PERIODS = ["48"];
const RANGE_BUCKETS = {
  rent: [
    { value: "under50", label: "50만원 이하", match: v => v > 0 && v < 500000 },
    { value: "50", label: "50만원~", match: v => v >= 500000 && v < 600000 },
    { value: "60", label: "60만원~", match: v => v >= 600000 && v < 700000 },
    { value: "70", label: "70만원~", match: v => v >= 700000 && v < 800000 },
    { value: "80", label: "80만원~", match: v => v >= 800000 && v < 900000 },
    { value: "90", label: "90만원~", match: v => v >= 900000 && v < 1000000 },
    { value: "100", label: "100만원~", match: v => v >= 1000000 }
  ],
  deposit: [
    { value: "none", label: "무보증", match: v => v === 0 },
    { value: "under100", label: "100만원 이하", match: v => v > 0 && v <= 1000000 },
    { value: "100", label: "100만원~", match: v => v >= 1000000 && v < 2000000 },
    { value: "200", label: "200만원~", match: v => v >= 2000000 && v < 3000000 },
    { value: "300", label: "300만원~", match: v => v >= 3000000 && v < 4000000 },
    { value: "400", label: "400만원~", match: v => v >= 4000000 && v < 5000000 },
    { value: "500", label: "500만원~", match: v => v >= 5000000 }
  ],
  mileage: [
    { value: "0",  label: "0Km~",   match: v => v >= 0 && v < 10000 },
    { value: "1",  label: "1만Km~",  match: v => v >= 10000 && v < 20000 },
    { value: "2",  label: "2만Km~",  match: v => v >= 20000 && v < 30000 },
    { value: "3",  label: "3만Km~",  match: v => v >= 30000 && v < 40000 },
    { value: "4",  label: "4만Km~",  match: v => v >= 40000 && v < 50000 },
    { value: "5",  label: "5만Km~",  match: v => v >= 50000 && v < 60000 },
    { value: "6",  label: "6만Km~",  match: v => v >= 60000 && v < 70000 },
    { value: "7",  label: "7만Km~",  match: v => v >= 70000 && v < 80000 },
    { value: "8",  label: "8만Km~",  match: v => v >= 80000 && v < 90000 },
    { value: "9",  label: "9만Km~",  match: v => v >= 90000 && v < 100000 },
    { value: "10", label: "10만Km~", match: v => v >= 100000 && v < 110000 },
    { value: "11", label: "11만Km~", match: v => v >= 110000 && v < 120000 },
    { value: "12", label: "12만Km~", match: v => v >= 120000 && v < 130000 },
    { value: "13", label: "13만Km~", match: v => v >= 130000 && v < 140000 },
    { value: "14", label: "14만Km~", match: v => v >= 140000 && v < 150000 },
    { value: "15", label: "15만Km~", match: v => v >= 150000 && v < 200000 },
    { value: "20", label: "20만Km~", match: v => v >= 200000 }
  ],
  vehiclePrice: [
    { value: "under2000", label: "2000만원 이하", match: v => v > 0 && v < 20000000 },
    { value: "2000", label: "2000만원~", match: v => v >= 20000000 && v < 30000000 },
    { value: "3000", label: "3000만원~", match: v => v >= 30000000 && v < 40000000 },
    { value: "4000", label: "4000만원~", match: v => v >= 40000000 && v < 50000000 },
    { value: "5000", label: "5000만원~", match: v => v >= 50000000 }
  ],
  fee: [
    { value: "none", label: "없음", match: v => v === 0 },
    { value: "under5", label: "5만원 이하", match: v => v > 0 && v < 50000 },
    { value: "5", label: "5만원~", match: v => v >= 50000 && v < 100000 },
    { value: "10", label: "10만원~", match: v => v >= 100000 }
  ]
};
const sampleProducts = [];
const FILTER_SCHEMA = [
  { key:"periods",      title:"기간",       type:"periods",      options:["1","12","24","36","48","60"], open:true },
  { key:"maker",        title:"제조사",     type:"select",       optionsFromData:true, open:true },
  { key:"model",        title:"모델",       type:"select",       optionsFromData:true, open:true },
  { key:"subModel",     title:"세부모델",   type:"select",       optionsFromData:true, open:false },
  { key:"vehicleClass", title:"차종구분",   type:"select",       optionsFromData:true, open:false },
  { key:"vehicleStatus",title:"차량상태",   type:"select",       optionsFromData:true, open:false },
  { key:"productType",  title:"상품구분",   type:"select",       optionsFromData:true, open:false },
  { key:"fuel",         title:"연료",       type:"select",       optionsFromData:true, open:false },
  { key:"extColor",     title:"외부색상",   type:"select",       optionsFromData:true, open:false },
  { key:"intColor",     title:"내부색상",   type:"select",       optionsFromData:true, open:false },
  { key:"year",         title:"연식",       type:"year",                               open:false },
  { key:"partnerCode",  title:"공급사",     type:"select",       optionsFromData:true, open:false },
  { key:"policyCode",   title:"정책코드",   type:"select",       optionsFromData:true, open:false },
  { key:"reviewStatus",  title:"심사여부",        type:"termSelect", field:"screening_criteria", fallback:"reviewStatus", open:false },
  { key:"creditGrade",   title:"신용등급",        type:"termSelect", field:"credit_grade",       fallback:"creditGrade",  open:false },
  { key:"annualMileage", title:"연간약정주행거리", type:"termSelect", field:"annual_mileage",                              open:false },
  { key:"basicDriverAge",title:"기본운전연령",     type:"termSelect", field:"basic_driver_age",                            open:false },
  { key:"paymentMethod", title:"결제방식",        type:"termSelect", field:"payment_method",                              open:false },
  { key:"ageLowering",   title:"운전연령하향",     type:"termSelect", field:"driver_age_lowering", fallback:"ageLowering", open:false },
  { key:"vehiclePrice", title:"차량가격",   type:"range",                              open:false },
  { key:"rent",         title:"대여료",     type:"range",                              open:false },
  { key:"deposit",      title:"보증금",     type:"range",                              open:false },
  { key:"fee",          title:"수수료",     type:"range",                              open:false },
  { key:"mileage",      title:"주행거리",   type:"range",                              open:false }
];
const FILTER_STORAGE_KEY = 'freepass.product-list.filters.v5';
const state = { allProducts: [], filteredProducts: [], selectedId: null, activePhotoIndex: 0, openGroups: {}, filters: {}, searchQuery: '', role: '', companyCode: '', profile: null, user: null, termCache: {}, termLoading: {}, filterOverlayOpen: false };
const params = new URLSearchParams(window.location.search);
const preferredProductCode = String(params.get('product_code') || '').trim();
FILTER_SCHEMA.forEach(g=>{state.filters[g.key]=g.key==="periods"?DEFAULT_PERIODS.slice():[]; state.openGroups[g.key]=!!g.open;});
function defaultFilterState(){
  return {
    filters: Object.fromEntries(FILTER_SCHEMA.map((group)=>[group.key, group.key === 'periods' ? DEFAULT_PERIODS.slice() : []])),
    openGroups: Object.fromEntries(FILTER_SCHEMA.map((group)=>[group.key, !!group.open])),
    filterOverlayOpen: false
  };
}
function sanitizeStoredList(value){
  if(!Array.isArray(value)) return [];
  return [...new Set(value.map((item)=>String(item || '').trim()).filter(Boolean))];
}
function persistFilterState(){
  try {
    const payload = {
      filters: Object.fromEntries(FILTER_SCHEMA.map((group)=>[group.key, sanitizeStoredList(state.filters[group.key])])),
      openGroups: Object.fromEntries(FILTER_SCHEMA.map((group)=>[group.key, !!state.openGroups[group.key]])),
      filterOverlayOpen: !!state.filterOverlayOpen,
    };
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[product-list] persistFilterState failed', error);
  }
}
function restoreFilterState(){
  const fallback = defaultFilterState();
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if(!raw) return fallback;
    const parsed = JSON.parse(raw);
    const restoredFilters = {};
    const restoredOpenGroups = {};
    FILTER_SCHEMA.forEach((group)=>{
      const current = sanitizeStoredList(parsed?.filters?.[group.key]);
      restoredFilters[group.key] = group.key === 'periods' ? (current.length ? current : DEFAULT_PERIODS.slice()) : current;
      restoredOpenGroups[group.key] = typeof parsed?.openGroups?.[group.key] === 'boolean' ? parsed.openGroups[group.key] : !!group.open;
    });
    return {
      filters: restoredFilters,
      openGroups: restoredOpenGroups,
      filterOverlayOpen: typeof parsed?.filterOverlayOpen === 'boolean' ? parsed.filterOverlayOpen : false
    };
  } catch (error) {
    console.warn('[product-list] restoreFilterState failed', error);
    return fallback;
  }
}
(function hydrateFilterState(){
  const restored = restoreFilterState();
  state.filterOverlayOpen = !!restored.filterOverlayOpen;
  FILTER_SCHEMA.forEach((group)=>{
    state.filters[group.key] = restored.filters[group.key];
    state.openGroups[group.key] = restored.openGroups[group.key];
  });
})();
let overlayEscId = null;
function setFilterOverlay(open){
  state.filterOverlayOpen = !!open;
  $overlay?.classList.toggle('is-open', !!open);
  $overlay?.setAttribute('aria-hidden', String(!open));
  if (open) {
    if (overlayEscId) removeEsc(overlayEscId);
    overlayEscId = pushEsc(() => setFilterOverlay(false));
  } else {
    if (overlayEscId) { removeEsc(overlayEscId); overlayEscId = null; }
  }
  persistFilterState();
}
let menu = qs('#sidebar-menu');
let $list = qs('#productList'); let $detail = qs('#productDetail'); let $title = qs('#detailPanelTitle'); let $overlay = qs('#filterOverlay'); let $accordion = qs('#filterAccordion'); let $periodHead = qs('#selectedPeriodsHead'); let $filterSearch = qs('#filterSearchInput');
let $gridHeader = qs('#plsGridHeader');
let $pageName = qs('.top-bar-page-name');
let $stateSep = qs('#topBarStateSep');
let $stateIdentity = qs('#topBarIdentity');
let $shell = qs('#productListShell');
let $detailPanel = qs('#plsDetailPanel');

function bindDOM() {
  menu = qs('#sidebar-menu');
  $list = qs('#productList'); $detail = qs('#productDetail'); $title = qs('#detailPanelTitle'); $overlay = qs('#filterOverlay'); $accordion = qs('#filterAccordion'); $periodHead = qs('#selectedPeriodsHead'); $filterSearch = qs('#filterSearchInput');
  $gridHeader = qs('#plsGridHeader');
  $pageName = qs('.top-bar-page-name');
  $stateSep = qs('#topBarStateSep');
  $stateIdentity = qs('#topBarIdentity');
  $shell = qs('#productListShell');
  $detailPanel = qs('#plsDetailPanel');
}

/* ── 엑셀 그리드 컬럼 정의 ── */
const PRICE_MONTHS = ['1','12','24','36','48','60'];

// align: 'c'=가운데, 'r'=우측, 기본=좌측
const INFO_COLS = [
  // maxW: 최대폭(px). 넘으면 말줄임. 없으면 auto.
  // maxW 없음 = 텍스트에 맞게 자동. ellipsis = 상한만 제한
  { key: 'vehicleStatus', label: '차량상태', align: 'c', filterKey: 'vehicleStatus', w: 80 },
  { key: 'productType',   label: '상품구분', align: 'c', filterKey: 'productType', w: 80 },
  { key: 'carNo',         label: '차량번호', align: 'c', sticky: true, filterKey: null, filterType: 'search' },
  { key: 'maker',         label: '제조사',   align: 'c', filterKey: 'maker' },
  { key: 'model',         label: '모델명',   align: 'c', filterKey: 'model' },
  { key: 'subModel',      label: '세부모델', maxW: 100, filterKey: 'subModel' },
  { key: 'trim',          label: '세부트림', maxW: 100, filterKey: null, filterType: 'search' },
  { key: 'options',       label: '선택옵션', maxW: 120, filterKey: null, filterType: 'search' },
  { key: 'fuel',          label: '연료',     align: 'c', filterKey: 'fuel' },
  { key: 'color',         label: '색상',     align: 'c', maxW: 80, filterKey: 'extColor', filterKey2: 'intColor', filterType: 'dual', filterLabel1: '외장', filterLabel2: '내장' },
  { key: 'year',          label: '연식',     align: 'c', filterKey: 'year', filterType: 'numeric', sortField: 'year' },
  { key: 'mileage',       label: '주행거리', num: true,  filterKey: 'mileage', filterType: 'numeric', sortField: 'mileageValue', wCh: '999,999km' },
  { key: 'vehicleClass',  label: '차종구분', align: 'c', filterKey: 'vehicleClass' },
  { key: 'reviewStatus',  label: '심사기준', align: 'c', filterKey: 'reviewStatus' },
  { key: 'minAge',        label: '최저연령', align: 'c', filterKey: 'ageLowering' },
];

// 기간별 대여료 컬럼 — 9,999,999 기준 고정폭, 대여료/보증금 구간 필터
const PRICE_COLS = PRICE_MONTHS.map(m => ({
  key: `price_${m}`, label: `${m}개월`, wCh: '9,999,999', num: true, priceMonth: m,
  filterKey: 'rent', filterKey2: 'deposit', filterType: 'dual', filterLabel1: '대여료', filterLabel2: '보증금',
  sortField: `rent_${m}`
}));

const GRID_COLS = [...INFO_COLS, ...PRICE_COLS];
function getVisiblePriceCols() {
  const selected = getSelectedPeriods();
  return PRICE_COLS.filter(col => selected.includes(col.priceMonth));
}
function getVisibleGridCols() {
  return [...INFO_COLS, ...getVisiblePriceCols()];
}

let activeHeaderFilter = null;
let headerFilterEscId = null;
let gridSortField = null;   // 현재 정렬 필드
let gridSortDir = 0;        // 0=없음, 1=오름차순, -1=내림차순

function closeHeaderFilter() {
  if (!activeHeaderFilter) return;
  document.querySelectorAll('.pls-filter-dd').forEach(dd => dd.remove());
  $gridHeader?.querySelectorAll('.pls-th.is-filtering').forEach(th => th.classList.remove('is-filtering'));
  activeHeaderFilter = null;
  if (headerFilterEscId) { removeEsc(headerFilterEscId); headerFilterEscId = null; }
}

function _positionFilterDD(dd, thEl) {
  dd.style.position = 'fixed';
  dd.style.left = '-9999px';
  dd.style.top = '-9999px';
  document.body.appendChild(dd);

  requestAnimationFrame(() => {
    const thRect = thEl.getBoundingClientRect();
    const ddW = dd.offsetWidth;
    const ddH = dd.offsetHeight;

    const panel = thEl.closest('.panel, .pls-grid-panel, section');
    const pr = panel ? panel.getBoundingClientRect() : { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight };

    let left = thRect.left;
    let top = thRect.bottom + 1;

    if (left + ddW > pr.right) {
      left = thRect.right - ddW;
    }
    if (top + ddH > pr.bottom) {
      top = thRect.top - ddH - 1;
    }

    dd.style.left = `${Math.max(pr.left, left)}px`;
    dd.style.top = `${Math.max(0, top)}px`;
  });
}

function buildCheckboxSection(title, groupKey, source) {
  const group = FILTER_SCHEMA.find(g => g.key === groupKey);
  if (!group) return '';
  const options = getGroupOptions(group, source);
  const selected = new Set(state.filters[groupKey] || []);

  // 각 옵션별 매칭 건수 계산
  const counted = options.map(opt => {
    const count = source.filter(item => passesAllFilters(item, groupKey) && matchSingle(group, opt.value, item)).length;
    return { ...opt, count };
  });

  // range/year 타입은 원래 순서 유지 (구간이 적은→큰), 나머지는 건수 많은 순
  if (group.type !== 'range' && group.type !== 'year') {
    counted.sort((a, b) => {
      const aChecked = selected.has(a.value) ? 1 : 0;
      const bChecked = selected.has(b.value) ? 1 : 0;
      if (aChecked !== bChecked) return bChecked - aChecked;
      return b.count - a.count;
    });
  }

  const checks = counted.filter(opt => opt.count > 0).slice(0, 30).map(opt => {
    const checked = selected.has(opt.value) ? 'checked' : '';
    return `<label class="${checked ? 'is-checked' : ''}"><input type="checkbox" data-fk="${groupKey}" value="${escapeHtml(opt.value)}" ${checked}><span>${escapeHtml(opt.label)}</span><span class="pls-fdd__count">${opt.count}</span></label>`;
  }).join('');

  const titleHtml = title ? `<div class="pls-fdd__title">${escapeHtml(title)}</div>` : '';
  return `<div class="pls-fdd__section">${titleHtml}${checks}</div>`;
}

function openHeaderFilter(colDef, thEl) {
  closeHeaderFilter();
  if (!colDef?.filterKey && colDef?.filterType !== 'search') return;

  activeHeaderFilter = colDef.key;
  thEl.classList.add('is-filtering');
  headerFilterEscId = pushEsc(() => { applyFilters(); closeHeaderFilter(); });

  const dd = document.createElement('div');
  dd.className = 'pls-filter-dd';

  // ── 검색형 필터 (세부트림, 선택옵션) ──
  if (colDef.filterType === 'search') {
    const fieldKey = colDef.key;
    const curQ = state._colSearch?.[fieldKey] || '';
    dd.innerHTML = `<div class="pls-fdd__search-wrap"><input type="text" class="pls-fdd__search" placeholder="${escapeHtml(colDef.label)} 검색..." data-search-col="${fieldKey}" value="${escapeHtml(curQ)}"><span class="pls-fdd__match-count" data-fdd-count></span></div>`;
    _positionFilterDD(dd, thEl);
    const searchInput = dd.querySelector('.pls-fdd__search');
    const countEl = dd.querySelector('[data-fdd-count]');
    function updateCount(q) {
      if (!countEl) return;
      if (!q) { countEl.textContent = ''; return; }
      const n = state.allProducts.filter(item => {
        const val = fieldKey === 'options' ? String(item.optionSummary || '') : fieldKey === 'carNo' ? String(item.carNo || '') : String(item[fieldKey] || '');
        return val.toLowerCase().includes(q);
      }).length;
      countEl.textContent = `${n}건`;
      countEl.classList.toggle('pls-fdd__match-count--zero', n === 0);
    }
    updateCount(curQ);
    searchInput?.focus();
    let searchTimer = null;
    searchInput?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const q = (searchInput.value || '').trim().toLowerCase();
        state._colSearch = state._colSearch || {};
        state._colSearch[fieldKey] = q;
        updateCount(q);
        applyFiltersKeepDropdown();
      }, 150);
    });

    // 적용/초기화
    const filterKeys = [];
    const actionBar = document.createElement('div');
    actionBar.className = 'pls-fdd__actions';
    actionBar.innerHTML = `<button type="button" class="pls-fdd__action-btn pls-fdd__action-btn--reset" data-fdd-reset>초기화</button>`
      + `<button type="button" class="pls-fdd__action-btn pls-fdd__action-btn--apply" data-fdd-apply>적용</button>`;
    dd.appendChild(actionBar);
    actionBar.addEventListener('click', (e) => {
      if (e.target.closest('[data-fdd-apply]')) { applyFilters(); closeHeaderFilter(); return; }
      if (e.target.closest('[data-fdd-reset]')) {
        if (state._colSearch) delete state._colSearch[fieldKey];
        applyFilters(); closeHeaderFilter();
      }
    });
    return;
  }

  // ── 타입별 드롭다운 내용 ──
  if (colDef.filterType === 'dual') {
    // 2줄 필터
    let sortHtml = '';
    if (colDef.sortField) {
      const isAsc = gridSortField === colDef.sortField && gridSortDir === 1;
      const isDesc = gridSortField === colDef.sortField && gridSortDir === -1;
      sortHtml = `<div class="pls-fdd__sort-row">`
        + `<button type="button" class="pls-fdd__sort-btn${isAsc?' is-active':''}" data-sort-dir="1">▲ 오름차순</button>`
        + `<button type="button" class="pls-fdd__sort-btn${isDesc?' is-active':''}" data-sort-dir="-1">▼ 내림차순</button>`
        + `</div>`;
    }
    dd.innerHTML = sortHtml
                 + buildCheckboxSection(colDef.filterLabel1 || '', colDef.filterKey, state.allProducts)
                 + buildCheckboxSection(colDef.filterLabel2 || '', colDef.filterKey2, state.allProducts);

  } else if (colDef.filterType === 'numeric') {
    // 숫자: 정렬 버튼 + 구간 필터
    const group = FILTER_SCHEMA.find(g => g.key === colDef.filterKey);
    const isAsc = gridSortField === colDef.sortField && gridSortDir === 1;
    const isDesc = gridSortField === colDef.sortField && gridSortDir === -1;
    const sortBtns = `<div class="pls-fdd__sort-row">`
      + `<button type="button" class="pls-fdd__sort-btn${isAsc?' is-active':''}" data-sort-dir="1">▲ 오름차순</button>`
      + `<button type="button" class="pls-fdd__sort-btn${isDesc?' is-active':''}" data-sort-dir="-1">▼ 내림차순</button>`
      + `</div>`;
    const rangeGroup = FILTER_SCHEMA.find(g => g.key === colDef.filterKey && g.type === 'range');
    let rangeSection = '';
    if (rangeGroup) {
      rangeSection = buildCheckboxSection('구간', colDef.filterKey, state.allProducts);
    } else {
      // year 등 range가 아닌 숫자는 체크박스로
      rangeSection = buildCheckboxSection('선택', colDef.filterKey, state.allProducts);
    }
    dd.innerHTML = sortBtns + rangeSection;

  } else {
    // 일반 체크박스
    dd.innerHTML = buildCheckboxSection('', colDef.filterKey, state.allProducts);
  }

  // ── 하단 액션 바: 적용 / 초기화 ──
  const filterKeys = [colDef.filterKey, colDef.filterKey2].filter(Boolean);
  const actionBar = document.createElement('div');
  actionBar.className = 'pls-fdd__actions';
  actionBar.innerHTML = `<button type="button" class="pls-fdd__action-btn pls-fdd__action-btn--reset" data-fdd-reset>초기화</button>`
    + `<button type="button" class="pls-fdd__action-btn pls-fdd__action-btn--apply" data-fdd-apply>적용</button>`;
  dd.appendChild(actionBar);

  _positionFilterDD(dd, thEl);

  // ── 이벤트: 적용/초기화 버튼 ──
  actionBar.addEventListener('click', (e) => {
    if (e.target.closest('[data-fdd-apply]')) {
      applyFilters();
      closeHeaderFilter();
      return;
    }
    if (e.target.closest('[data-fdd-reset]')) {
      filterKeys.forEach(fk => { state.filters[fk] = []; });
      if (colDef.sortField && gridSortField === colDef.sortField) {
        gridSortField = null;
        gridSortDir = 0;
      }
      applyFilters();
      closeHeaderFilter();
    }
  });

  // ── 이벤트: 체크박스 → 필터 즉시 반영 + 드롭다운 유지 ──
  dd.addEventListener('change', (e) => {
    const input = e.target.closest('input[type="checkbox"][data-fk]');
    if (!input) return;
    const fk = input.dataset.fk;
    const cur = new Set(state.filters[fk] || []);
    if (input.checked) cur.add(input.value); else cur.delete(input.value);
    state.filters[fk] = [...cur];
    input.closest('label')?.classList.toggle('is-checked', input.checked);
    // 목록만 갱신하고 헤더는 건드리지 않음 (드롭다운 유지)
    applyFiltersKeepDropdown();
  });

  // ── 이벤트: 정렬 버튼 ──
  dd.addEventListener('click', (e) => {
    const sortBtn = e.target.closest('[data-sort-dir]');
    if (!sortBtn || !colDef.sortField) return;
    const dir = Number(sortBtn.dataset.sortDir);
    if (gridSortField === colDef.sortField && gridSortDir === dir) {
      gridSortField = null; gridSortDir = 0; // 토글 해제
    } else {
      gridSortField = colDef.sortField; gridSortDir = dir;
    }
    applyFilters();
    closeHeaderFilter();
  });
}

function renderGridHeader() {
  if (!$gridHeader) return;
  const visibleCols = getVisibleGridCols();
  const ths = visibleCols.map(col => {
    const cls = col.sticky ? ' pls-th--sticky' : '';
    const filterable = (col.filterKey || col.filterType === 'search') ? ' pls-th--filterable' : '';
    const cnt1 = col.filterKey ? (state.filters[col.filterKey]?.length || 0) : 0;
    const cnt2 = col.filterKey2 ? (state.filters[col.filterKey2]?.length || 0) : 0;
    const hasColSearch = state._colSearch?.[col.key] ? 1 : 0;
    const totalActive = cnt1 + cnt2 + hasColSearch;
    const hasFilter = totalActive > 0 ? ' pls-th--has-filter' : '';
    const isSorted = col.sortField && gridSortField === col.sortField;
    const sortIndicator = isSorted ? `<span class="pls-th__sort">${gridSortDir === 1 ? '▲' : '▼'}</span>` : '';
    const styles = [];
    if (col.w) styles.push(`width:${col.w}px`);
    else if (col.wCh) styles.push(`width:${col.wCh.length + 1}ch`);
    if (col.maxW) styles.push(`max-width:${col.maxW}px`);
    const wAttr = styles.length ? ` style="${styles.join(';')}"` : '';
    const alignCls = col.align === 'r' ? ' pls--right' : ' pls--center';
    return `<th class="pls-th${cls}${filterable}${hasFilter}${alignCls}" data-col-key="${col.key}"${wAttr}><span class="pls-th__label">${escapeHtml(col.label)}</span>${sortIndicator}</th>`;
  }).join('');
  $gridHeader.innerHTML = `<tr>${ths}</tr>`;
}

$gridHeader?.addEventListener('click', (e) => {
  if (e.target.closest('.pls-filter-dd')) return;
  const th = e.target.closest('.pls-th--filterable');
  if (!th) return;
  const colKey = th.dataset.colKey;
  const col = getVisibleGridCols().find(c => c.key === colKey);
  if (activeHeaderFilter === colKey) { closeHeaderFilter(); return; }
  openHeaderFilter(col, th);
});

document.addEventListener('click', (e) => {
  if (activeHeaderFilter && !e.target.closest('.pls-th') && !e.target.closest('.pls-filter-dd')) closeHeaderFilter();
});

/* ── 상세 패널 열기/닫기 (우측 오버레이) ── */
let detailEscId = null;

function showDetailPanel() {
  if (!$detailPanel) return;
  $detailPanel.hidden = false;
  $detailPanel.classList.remove('is-open');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $detailPanel.classList.add('is-open');
  }));
  // ESC 스택에 등록
  if (detailEscId) removeEsc(detailEscId);
  detailEscId = pushEsc(() => hideDetailPanel());
}

function hideDetailPanel() {
  if (!$detailPanel) return;
  $detailPanel.classList.remove('is-open');
  $detailPanel.hidden = true;
  state.selectedId = null;
  if (detailEscId) { removeEsc(detailEscId); detailEscId = null; }
  renderList();
}
qs('#closeDetailBtn')?.addEventListener('click', hideDetailPanel);

// 패널 바깥 클릭 → 닫기
document.addEventListener('click', (e) => {
  if (!$detailPanel || $detailPanel.hidden) return;
  if (e.target.closest('.pls-detail-panel')) return;
  if (e.target.closest('.pls-row')) return;
  hideDetailPanel();
});
const $openFilterBtn = qs('#openFilterBtn');
const $resetFilterBtn = qs('#resetFilterBtn');
const $closeFilterBtn = qs('#closeFilterBtn');
const $toggleAllGroupsBtn = qs('#toggleAllGroupsBtn');
function syncFilterOverlayWidth(){}
function moneyToNumber(v){return Number(String(v||'').replace(/[^\d]/g,''))||0;}
function moneyToDisplay(v){const n=moneyToNumber(v); return n?String(Math.round(n/1000)):'0';}
function moneyToFull(v){const n=moneyToNumber(v);return n?n.toLocaleString('ko-KR'):'-';}
function moneyToShort(v){const n=moneyToNumber(v);if(!n)return '-';return Math.round(n/1000).toLocaleString('ko-KR')+',';}
function priceCell(v){return`<span class="price-full">${moneyToFull(v)}</span><span class="price-short">${moneyToShort(v)}</span>`;}
function safe(v){return v!==null&&v!==undefined&&String(v).trim()!==''?String(v):'-';}
function joinWithMainDot(values){ return values.map((value)=>safe(value)).join('&nbsp;·&nbsp;'); }
function formatMileage(value){const n=Number(value||0); return n?`${n.toLocaleString('ko-KR')}km`:'-';}
function applyRoleFilter(products){
  if (state.role === 'provider') return products.filter(item => String(item.partnerCode||'') === String(state.companyCode||''));
  return products;
}
function getSelectedPeriods(){const arr=state.filters.periods.slice().sort((a,b)=>Number(a)-Number(b)); return arr.length?arr:DEFAULT_PERIODS.slice();}
function getValueForRange(groupKey,item){const p=getSelectedPeriods()[0]||'48'; if(groupKey==='rent') return moneyToNumber(item.price[p]?.rent); if(groupKey==='deposit') return moneyToNumber(item.price[p]?.deposit); if(groupKey==='fee') return moneyToNumber(item.price[p]?.fee); if(groupKey==='mileage') return item.mileageValue||0; if(groupKey==='vehiclePrice') return moneyToNumber(item.vehiclePrice)||0; return 0;}
function getTermVal(group,item){ const tf=getTermFields(item); return tf[group.field]||( group.fallback ? item[group.fallback] : '')||''; }
function getGroupOptions(group,source){ if(group.type==='periods') return group.options.map(v=>({value:v,label:`${v}M`})); if(group.type==='range') return RANGE_BUCKETS[group.key].map(b=>({value:b.value,label:b.label})); if(group.type==='year'){const years=[...new Set(source.map(i=>i.year).filter(Boolean))].sort((a,b)=>b-a); return years.map(y=>({value:String(y),label:`${y}~`}));} if(group.type==='termSelect'){const values=[...new Set(source.map(i=>getTermVal(group,i)).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'ko')); return values.map(v=>({value:String(v),label:String(v)}));} const values=[...new Set(source.map(i=> group.type==='policySelect' ? i[group.field] : i[group.key]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'ko')); return values.map(v=>({value:String(v),label:String(v)})); }
function matchRange(groupKey,optionValue,item){const bucket=RANGE_BUCKETS[groupKey].find(x=>x.value===optionValue); return bucket?bucket.match(getValueForRange(groupKey,item)):false;}
function matchSingle(group,optionValue,item){ if(group.type==='periods') return true; if(group.type==='range') return matchRange(group.key, optionValue, item); if(group.type==='year') return String(item.year)===String(optionValue); if(group.type==='termSelect') return String(getTermVal(group,item))===String(optionValue); if(group.type==='policySelect') return String(item[group.field]||'')===String(optionValue); return String(item[group.key]||'')===String(optionValue); }
function passesGroup(group,item,selected){ if(group.key==='periods') return true; if(!selected||!selected.length) return true; return selected.some(v=>matchSingle(group,v,item)); }
function passesSearch(item, query) {
  if (query) {
    const q = query.toLowerCase();
    const fields = [item.carNo, item.maker, item.model, item.subModel, item.trim, item.fuel, item.extColor, item.intColor, item.vehicleClass, item.partnerCode, item.productCode, item.optionSummary, item.vehicleStatus, item.productType, item.year];
    if (!fields.some(f => String(f || '').toLowerCase().includes(q))) return false;
  }
  return true;
}
function passesColSearch(items) {
  const colSearch = state._colSearch || {};
  let result = items;
  for (const [key, q] of Object.entries(colSearch)) {
    if (!q) continue;
    const candidate = result.filter(item => {
      const val = key === 'options' ? String(item.optionSummary || '') : key === 'carNo' ? String(item.carNo || '') : String(item[key] || '');
      return val.toLowerCase().includes(q);
    });
    if (candidate.length) result = candidate;
  }
  return result;
}
function passesAllFilters(item,skip){ if(!passesSearch(item, state.searchQuery)) return false; return FILTER_SCHEMA.every(group=>{ if(group.key==='periods') return true; if(group.key===skip) return true; return passesGroup(group,item,state.filters[group.key]);}); }
function safeFilterAll(items) {
  let result = items.filter(item => passesSearch(item, state.searchQuery));
  FILTER_SCHEMA.forEach(group => {
    if (group.key === 'periods') return;
    const selected = state.filters[group.key];
    if (!selected || !selected.length) return;
    const candidate = result.filter(item => passesGroup(group, item, selected));
    if (candidate.length) result = candidate;
  });
  return passesColSearch(result);
}
function renderPeriodsHead(){ /* 기간 헤더는 그리드 내장으로 이동 — 호환성 유지 */ if($periodHead) $periodHead.innerHTML=''; }
function summarizeOptionText(text){ const raw=safe(text); if(raw==='-') return raw; return raw.length>18 ? `${raw.slice(0,18)}...` : raw; }
function buildBaseSets(){
  const map=new Map();
  FILTER_SCHEMA.forEach(g=>{ if(g.key!=='periods') map.set(g.key, state.allProducts.filter(item=>passesAllFilters(item,g.key))); });
  return map;
}
function renderFilterAccordion(baseSets){
  if(!$accordion) return;
  const bs = baseSets || buildBaseSets();
  $accordion.innerHTML = FILTER_SCHEMA.map(group=>{
    const baseSet = group.key==='periods' ? state.allProducts : (bs.get(group.key)||[]);
    const options = getGroupOptions(group, baseSet);
    const body = options.map(option=>{
      const count = group.key==='periods' ? state.allProducts.length : baseSet.filter(item=>matchSingle(group,option.value,item)).length;
      if(group.key!=='periods'&&count===0) return '';
      const checked = state.filters[group.key].includes(option.value);
      return `<label class="filter-option"><span class="filter-check"><input type="checkbox" data-group="${group.key}" data-value="${option.value}" ${checked?'checked':''}><span>${option.label}</span></span><span class="filter-count">(${count})</span></label>`;
    }).join('');
    return `<section class="filter-group ${state.openGroups[group.key]?'is-open':''}" data-filter-group="${group.key}"><button type="button" class="filter-group-head" data-toggle-group="${group.key}" aria-expanded="${state.openGroups[group.key]?'true':'false'}"><span class="filter-group-title">${group.title}</span><span class="filter-group-caret">${state.openGroups[group.key]?'닫기':'열기'}</span></button><div class="filter-group-body" ${state.openGroups[group.key]?'':'hidden'}>${body}</div></section>`;
  }).join('');
}
function bindFilterAccordion(){
  if(!$accordion || $accordion.dataset.bound === 'true') return;
  $accordion.dataset.bound = 'true';
  $accordion.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-toggle-group]');
    if(!btn) return;
    event.preventDefault();
    const key = btn.dataset.toggleGroup;
    state.openGroups[key] = !state.openGroups[key];
    persistFilterState();
    renderFilterAccordion();
  });
  $accordion.addEventListener('change', (event) => {
    const input = event.target.closest('input[type="checkbox"][data-group]');
    if(!input) return;
    const key = input.dataset.group;
    const current = new Set(state.filters[key]);
    if(input.checked) current.add(input.dataset.value);
    else current.delete(input.dataset.value);
    if(key === 'periods' && current.size === 0) current.add(DEFAULT_PERIODS[0]);
    state.filters[key] = [...current];
    applyFilters();
  });
}
function badgeClass(value) {
  const v = String(value || '').trim();
  if (['운행중','가능','즉시출고','신차'].some(k => v.includes(k))) return 'pls-badge--ok';
  if (['불가','중지','삭제'].some(k => v.includes(k))) return 'pls-badge--warn';
  return 'pls-badge--off';
}

function fmtPrice(v) { const n = moneyToNumber(v); return n ? n.toLocaleString('ko-KR') : ''; }

function cellValue(col, item) {
  const tf = getTermFields(item);
  switch (col.key) {
    case 'vehicleStatus': return { html: renderBadgeRow([{ field: 'vehicle_status', value: item.vehicleStatus }]) };
    case 'productType': return { html: renderBadgeRow([{ field: 'product_type', value: item.productType }]) };
    case 'carNo': return { text: safe(item.carNo) };
    case 'maker': return { text: safe(item.maker) };
    case 'model': return { text: safe(item.model) };
    case 'subModel': return { text: safe(item.subModel) };
    case 'trim': return { text: safe(item.trim) };
    case 'options': return { text: safe(item.optionSummary) };
    case 'fuel': return { text: safe(item.fuel) };
    case 'color': return { text: [item.extColor, item.intColor].filter(v => v && v !== '-').join('/') || '-' };
    case 'year': return { text: item.year || '' };
    case 'mileage': return { text: item.mileageDisplay || '' };
    case 'vehicleClass': return { text: safe(item.vehicleClass) };
    case 'reviewStatus': return { text: safe(tf.screening_criteria || item.reviewStatus) };
    case 'minAge': return { text: safe(tf.driver_age_lowering || item.ageLowering) };
    default: return { text: '' };
  }
}

let _renderListRaf = 0;
function scheduleRenderList() {
  if (_renderListRaf) return;
  _renderListRaf = requestAnimationFrame(() => { _renderListRaf = 0; renderList(); });
}

function renderList(){
  if ($pageName) $pageName.textContent = `전체 상품 검색 (${state.filteredProducts.length}건)`;

  const visiblePriceCols = getVisiblePriceCols();
  if(!state.filteredProducts.length){
    const colSpan = INFO_COLS.length + visiblePriceCols.length;
    $list.innerHTML=`<tr><td colspan="${colSpan}" class="list-empty">조건에 맞는 상품이 없습니다.</td></tr>`;
    return;
  }

  $list.innerHTML = state.filteredProducts.map(item => {
    const active = item.id === state.selectedId ? ' is-active' : '';

    // 정보 컬럼 셀들
    const infoCells = INFO_COLS.map(col => {
      const stickyClass = col.sticky ? ' pls-cell--sticky' : '';
      const numClass = col.num ? ' pls-cell--num' : '';
      const alignCls = col.align === 'c' ? ' pls--center' : col.align === 'r' || col.num ? ' pls--right' : '';
      const cv = cellValue(col, item);
      const inner = cv.html || escapeHtml(cv.text || '');
      const cellStyles = [];
      if (col.maxW) cellStyles.push(`max-width:${col.maxW}px`);
      const sAttr = cellStyles.length ? ` style="${cellStyles.join(';')}"` : '';
      return `<td class="pls-cell${stickyClass}${numClass}${alignCls}"${sAttr}>${inner}</td>`;
    }).join('');

    // 기간별 대여료 셀들 (2줄: 대여료 + 보증금)
    const priceCells = visiblePriceCols.map(col => {
      const rent = fmtPrice(item.price[col.priceMonth]?.rent);
      const depNum = moneyToNumber(item.price[col.priceMonth]?.deposit);
      const dep = depNum ? depNum.toLocaleString('ko-KR') : '0';
      return `<td class="pls-cell pls-cell--num pls-cell--price">`
        + `<span class="pls-price-rent">${rent}</span>`
        + `<span class="pls-price-dep">${dep}</span>`
        + `</td>`;
    }).join('');

    return `<tr class="pls-row${active}" data-id="${item.id}">${infoCells}${priceCells}</tr>`;
  }).join('');

  $list.querySelectorAll('.pls-row').forEach(row => row.addEventListener('click', () => {
    const clickedId = row.dataset.id;

    // 같은 행 클릭 → 닫기
    if (state.selectedId === clickedId && $detailPanel && !$detailPanel.hidden) {
      hideDetailPanel();
      return;
    }

    state.selectedId = clickedId;
    state.activePhotoIndex = 0;
    renderList();
    renderDetail();

    if ($detailPanel && !$detailPanel.hidden) {
      // 열려있으면 즉시 숨기고 다음 틱에 새로 슬라이드
      $detailPanel.classList.remove('is-open');
      $detailPanel.hidden = true;
      setTimeout(() => showDetailPanel(), 0);
    } else {
      showDetailPanel();
    }
  }));
}
function hasContent(value){ return String(value ?? '').trim() !== '' && String(value ?? '').trim() !== '-'; }
function escapeHtml(value){ return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function formatYearShort(value){ const digits=String(value ?? '').replace(/[^\d]/g,''); if(!digits) return '-'; return `${digits.length >= 4 ? digits.slice(-2) : digits}년식`; }
function formatEngineCc(value){ const digits=String(value ?? '').replace(/[^\d]/g,''); return digits ? `${Number(digits).toLocaleString('ko-KR')}cc` : '-'; }
function inlineValue(left, right){ return `${safe(left)} / ${safe(right)}`; }
function detailItem(label,value,modifier=''){ return `<div class="detail-item ${modifier}"><span class="detail-label">${escapeHtml(label)}</span><span class="detail-value">${escapeHtml(safe(value))}</span></div>`; }
function detailPair(labelLeft,valueLeft,labelRight,valueRight){ return detailItem(`${labelLeft} / ${labelRight}`, inlineValue(valueLeft, valueRight), 'detail-item--inline'); }
function detailLong(label,value){ return `<div class="detail-item detail-item--stack"><span class="detail-label">${escapeHtml(label)}</span><div class="detail-value detail-value--multiline">${escapeHtml(safe(value)).replace(/\n/g,'<br>')}</div></div>`; }
function detailLink(label, href){ const url = String(href || '').trim(); if(!url) return detailItem(label, '링크없음'); return `<div class="detail-item"><span class="detail-label">${escapeHtml(label)}</span><a class="detail-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">사진보기</a></div>`; }
function detailSection(content, extraClass=''){ if(!content) return ''; return `<section class="detail-section ${extraClass}">${content}</section>`; }
function parsePolicyCell(value){ const text = String(value ?? '').trim(); if(!text || text === '-') return { limit: '-', deductible: '-' }; const parts = text.split('/').map(part => part.trim()).filter(Boolean); if(parts.length >= 2) return { limit: parts[0], deductible: parts.slice(1).join(' / ') || '-' }; return { limit: text, deductible: '-' }; }
function getTermCacheKey(product){
  const code = String(product?.policyCode || product?.termCode || '').trim();
  if (code) return `code:${code}`;
  const providerCode = String(product?.providerCompanyCode || product?.partnerCode || '').trim();
  const termName = String(product?.termName || '').trim();
  if (providerCode || termName) return `lookup:${providerCode}:${termName}`;
  return '';
}
function getTermFields(product){
  const cacheKey = getTermCacheKey(product);
  return cacheKey ? (state.termCache[cacheKey] || {}) : {};
}
function getMergedPolicy(product){
  const term = getTermFields(product);
  return {
    ageText: hasContent(product.ageText) ? product.ageText : (term.basic_driver_age || '-'),
    ageLowering: hasContent(product.policy.ageLowering) ? product.policy.ageLowering : (term.driver_age_lowering || '-'),
    ageLoweringCost: hasContent(product.policy.ageLoweringCost) ? product.policy.ageLoweringCost : (term.age_lowering_cost || '-'),
    annualMileage: hasContent(product.policy.annualMileage) ? product.policy.annualMileage : (term.annual_mileage || '-'),
    paymentMethod: hasContent(product.policy.paymentMethod) ? product.policy.paymentMethod : (term.payment_method || '-'),
    bodily: hasContent(product.policy.bodily) ? product.policy.bodily : (term.injury_limit_deductible || '-'),
    property: hasContent(product.policy.property) ? product.policy.property : (term.property_limit_deductible || '-'),
    selfBodily: hasContent(product.policy.selfBodily) ? product.policy.selfBodily : (term.personal_injury_limit_deductible || '-'),
    uninsured: hasContent(product.policy.uninsured) ? product.policy.uninsured : (term.uninsured_limit_deductible || '-'),
    ownDamage: hasContent(product.policy.ownDamage) ? product.policy.ownDamage : (term.own_damage_limit_deductible || '-'),
    emergency: hasContent(product.condition.emergency) ? product.condition.emergency : (term.roadside_assistance || '-')
  };
}
function renderPhotoSection(product){
  const photos=product.photos||[];
  const active=photos[state.activePhotoIndex]||'';
  const photoMain = photos.length ? `<div class="photo-main">${active?`<img src="${escapeHtml(active)}" alt="차량사진">`:''}</div>` : '';
  const thumbs = photos.length > 1 ? `<div class="photo-thumbs">${photos.map((src,idx)=>`<div class="photo-thumb ${idx===state.activePhotoIndex?'is-active':''}" data-photo-index="${idx}"><img src="${escapeHtml(src)}" alt="${idx+1}"></div>`).join('')}</div>` : '';
  const linkRow = `<div class="detail-grid">${detailLink('사진링크', product.photoLink)}</div>`;
  return detailSection(`${photoMain}${thumbs}${linkRow}`, 'detail-section--photos');
}
function renderPriceTable(product){ const months=['1','6','12','24','36','48','60']; return `<table class="price-table"><thead><tr><th>기간</th><th>대여료</th><th>보증금</th><th>수수료</th></tr></thead><tbody>${months.map(m=>`<tr><td>${m}개월</td><td>${Number(product.price[m]?.rent||0).toLocaleString('ko-KR')}</td><td>${Number(product.price[m]?.deposit||0).toLocaleString('ko-KR')}</td><td class="price-cell--disabled">준비중</td></tr>`).join('')}</tbody></table>`; }
function renderInsuranceTable(product){
  const merged = getMergedPolicy(product);
  const rows = [
    { item: '대인배상', raw: merged.bodily },
    { item: '대물배상', raw: merged.property },
    { item: '자기신체사고', raw: merged.selfBodily },
    { item: '무보험차상해', raw: merged.uninsured },
    { item: '자기차량손해', raw: merged.ownDamage }
  ];
  return `<table class="price-table insurance-table"><thead><tr><th>항목</th><th>보상한도</th><th>면책금</th></tr></thead><tbody>${rows.map((row)=>{ const parsed = parsePolicyCell(row.raw); return `<tr><td>${escapeHtml(row.item)}</td><td>${escapeHtml(parsed.limit)}</td><td>${escapeHtml(parsed.deductible)}</td></tr>`; }).join('')}</tbody></table>`;
}
function renderSpecSection(product){
  const grid = `<div class="detail-grid">${detailItem('제조사', product.maker)}${detailItem('세부차종', product.model)}${detailItem('세부모델', product.subModel)}${detailItem('세부트림', product.trim)}${detailLong('선택옵션', product.optionSummary)}${detailItem('색상(외부/내부)', inlineValue(product.extColor, product.intColor))}${detailPair('연식', formatYearShort(product.year), '주행거리', product.mileageDisplay)}${detailPair('연료', product.fuel, '배기량', formatEngineCc(product.engineCc))}${detailPair('차량상태', product.vehicleStatus, '상품구분', product.productType)}${detailPair('심사여부', product.reviewStatus, '신용등급', product.creditGrade)}</div>`;
  return detailSection(grid);
}
function renderPricingSection(product){ return detailSection(renderPriceTable(product)); }
function renderInsuranceSection(product){
  const merged = getMergedPolicy(product);
  const basics = `<div class="detail-grid">${detailPair('최소운전자연령', merged.ageText, '연령하향', merged.ageLowering)}${detailItem('연령하향비용', merged.ageLoweringCost)}${detailPair('연간약정주행거리', merged.annualMileage, '결제방식', merged.paymentMethod)}</div>`;
  return detailSection(`${basics}${renderInsuranceTable(product)}`, 'detail-section--insurance');
}
function renderEtcSection(product){
  const merged = getMergedPolicy(product);
  const rows = [
    detailItem('차량세부상태', product.condition.detailStatus),
    detailPair('사고여부', product.condition.accident, '즉시출고', product.condition.immediate),
    detailPair('탁송가능', product.condition.delivery, '정비서비스', product.condition.maintenance)
  ];
  if(hasContent(merged.emergency)) rows.push(detailItem('긴급출동', merged.emergency));
  rows.push(detailLong('특이사항', product.condition.note));
  return detailSection(`<div class="detail-grid">${rows.join('')}</div>`);
}
async function ensureTermLoaded(product){
  const cacheKey = getTermCacheKey(product);
  if(!cacheKey || state.termCache[cacheKey] || state.termLoading[cacheKey]) return;
  state.termLoading[cacheKey] = true;
  try {
    const term = await resolveTermForProduct({
      termCode: product?.policyCode || product?.termCode || '',
      termName: product?.termName || '',
      providerCompanyCode: product?.providerCompanyCode || product?.partnerCode || ''
    });
    state.termCache[cacheKey] = term ? extractTermFields(term) : {};
    if (!term) {
      console.warn('[product-list] term resolution failed', {
        productCode: product?.productCode || product?.id || '',
        policyCode: product?.policyCode || '',
        termCode: product?.termCode || '',
        termName: product?.termName || '',
        providerCompanyCode: product?.providerCompanyCode || product?.partnerCode || ''
      });
    }
  } catch (error) {
    console.error('[product-list] resolveTermForProduct failed', error);
    state.termCache[cacheKey] = {};
  } finally {
    delete state.termLoading[cacheKey];
    scheduleRenderList();
    if (state.selectedId === product.id) renderDetail();
  }
}
function currentProduct(){
  return state.filteredProducts.find(i=>i.id===state.selectedId) || state.allProducts.find(i=>i.id===state.selectedId) || null;
}

function buildShareUrl(product){
  const url = new URL(window.location.href);
  url.pathname = '/product-list';
  url.searchParams.set('product_code', product.id);
  return url.toString();
}

async function handleShare(){
  const product = currentProduct();
  if (!product) {
    window.alert('공유할 상품을 먼저 선택하세요.');
    return;
  }
  const shareUrl = buildShareUrl(product);
  const shareText = `[FREEPASS] ${safe(product.carNo)} ${[product.maker, product.model, product.subModel, product.trim].filter(Boolean).join(' ')}`.trim();
  try {
    if (navigator.share) {
      await navigator.share({ title: 'FREEPASS 상품공유', text: shareText, url: shareUrl });
      return;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      window.alert('상품 링크를 복사했습니다.');
      return;
    }
  } catch (error) {
    if (error?.name === 'AbortError') return;
  }
  window.prompt('아래 링크를 복사하세요.', shareUrl);
}

async function handleInquiry(){
  const product = currentProduct();
  if (!product) {
    window.alert('문의할 상품을 먼저 선택하세요.');
    return;
  }
  if (state.role !== 'agent' || !state.user || !state.profile) {
    window.alert('영업자 계정에서만 문의할 수 있습니다.');
    return;
  }
  try {
    if (!await showConfirm('이 상품에 대해 대화를 시작하시겠습니까?')) return;
    const roomId = await ensureRoom({
      productUid: product.productUid || '',
      productCode: product.productCode || product.id,
      providerUid: product.providerUid,
      providerCompanyCode: product.providerCompanyCode || product.partnerCode,
      providerName: product.providerName || '',
      agentUid: state.user.uid,
      agentCode: state.profile.user_code || '',
      agentName: state.profile.name || state.profile.user_name || '',
      vehicleNumber: product.carNo || '',
      modelName: [product.maker, product.model, product.subModel, product.trim].filter(Boolean).join(' ')
    });
    window.location.href = `/chat?room_id=${encodeURIComponent(roomId)}&product_code=${encodeURIComponent(product.id)}`;
  } catch (error) {
    window.alert(`문의 연결 실패: ${error.message}`);
  }
}

async function handleContract(){
  const product=currentProduct();
  if(!product) {
    window.alert('계약할 상품을 먼저 선택하세요.');
    return;
  }
  if(!await showConfirm('이 상품에 대해 계약을 생성하시겠습니까?')) {
    return;
  }
  const seed = {
    seed_product_key: product.id,
    product_uid: product.id,
    product_code: product.id,
    product_code_snapshot: product.productCode || product.id,
    partner_code: product.partnerCode || 'RP003',
    policy_code: product.policyCode || '',
    car_number: product.carNo || '',
    vehicle_name: [product.maker, product.model, product.subModel, product.trim].filter(Boolean).join(' '),
    maker: product.maker || '',
    model_name: product.model || '',
    sub_model: product.subModel || '',
    trim_name: product.trim || '',
    rent_month: '48',
    rent_amount: Number(product.price?.['48']?.rent || 0),
    deposit_amount: Number(product.price?.['48']?.deposit || 0)
  };
  localStorage.setItem('freepass_pending_contract_seed', JSON.stringify(seed));
  window.location.href='/contract';
}

function syncSelectionFromPreferredProduct(){
  if (!preferredProductCode) return;
  const preferred = state.filteredProducts.find((item) => item.id === preferredProductCode) || state.allProducts.find((item) => item.id === preferredProductCode);
  if (!preferred) return;
  if (state.selectedId !== preferred.id) {
    state.selectedId = preferred.id;
    state.activePhotoIndex = 0;
  }
}

/** 드롭다운을 유지한 채 목록만 갱신 (헤더 재렌더링 안 함) */
function applyFiltersKeepDropdown(){
  state.filteredProducts = safeFilterAll(state.allProducts);
  if (gridSortField && gridSortDir) {
    state.filteredProducts.sort((a, b) => {
      let av, bv;
      const priceMatch = gridSortField.match(/^rent_(\d+)$/);
      if (priceMatch) {
        av = moneyToNumber(a.price[priceMatch[1]]?.rent);
        bv = moneyToNumber(b.price[priceMatch[1]]?.rent);
      } else {
        av = Number(a[gridSortField]) || 0;
        bv = Number(b[gridSortField]) || 0;
      }
      return gridSortDir === 1 ? av - bv : bv - av;
    });
  }
  syncSelectionFromPreferredProduct();
  if (state.selectedId && !state.filteredProducts.find(item => item.id === state.selectedId)) {
    state.selectedId = null;
    state.activePhotoIndex = 0;
  }
  renderList();
  renderDetail();
  persistFilterState();
}

function syncTopBarIdentity(product) {
  if (!$stateSep || !$stateIdentity) return;
  const badge = document.getElementById('topBarWorkBadge');
  if (product) {
    const label = [product.carNo, product.maker, product.model].filter(v => v && v !== '-').join(' ');
    $stateIdentity.textContent = label;
    $stateIdentity.hidden = false;
    $stateSep.hidden = false;
    if (badge) badge.textContent = '상세정보';
  } else {
    $stateIdentity.hidden = true;
    $stateSep.hidden = true;
    if (badge) badge.textContent = '';
  }
}

function renderDetail(){
  const product=state.filteredProducts.find(i=>i.id===state.selectedId);
  if(!product){
    $title.textContent='상세정보';
    $detail.innerHTML='<div class="detail-empty">좌측 목록에서 차량을 선택하세요.</div>';
    syncTopBarIdentity(null);
    hideDetailPanel();
    return;
  }
  const _carNo = safe(product.carNo);
  $title.textContent = _carNo && _carNo !== '-' ? `상세정보(${_carNo})` : '상세정보';
  syncTopBarIdentity(product);
  $detail.innerHTML=renderProductDetailMarkup(product,{ activePhotoIndex: state.activePhotoIndex, termFields: getTermFields(product) });
  bindProductDetailPhotoEvents($detail,(index)=>{ state.activePhotoIndex=index; renderDetail(); });
  ensureTermLoaded(product);
}
function applyFilters(){
  // baseSet 1회 계산 후 stale 필터 정리 (선택값이 faceted 결과에서 사라진 경우 자동 해제)
  const baseSets = buildBaseSets();
  FILTER_SCHEMA.forEach(group=>{
    if(group.key==='periods'||!state.filters[group.key].length) return;
    const available=new Set(getGroupOptions(group, baseSets.get(group.key)||[]).map(o=>o.value));
    state.filters[group.key]=state.filters[group.key].filter(v=>available.has(v));
  });
  state.filteredProducts = safeFilterAll(state.allProducts);
  // 그리드 정렬 적용
  if (gridSortField && gridSortDir) {
    state.filteredProducts.sort((a, b) => {
      let av, bv;
      // rent_48 → price['48'].rent
      const priceMatch = gridSortField.match(/^rent_(\d+)$/);
      if (priceMatch) {
        av = moneyToNumber(a.price[priceMatch[1]]?.rent);
        bv = moneyToNumber(b.price[priceMatch[1]]?.rent);
      } else {
        av = Number(a[gridSortField]) || 0;
        bv = Number(b[gridSortField]) || 0;
      }
      return gridSortDir === 1 ? av - bv : bv - av;
    });
  }
  syncSelectionFromPreferredProduct();
  if (state.selectedId && !state.filteredProducts.find((item) => item.id === state.selectedId)) {
    state.selectedId = null;
    state.activePhotoIndex = 0;
  }
  renderPeriodsHead();
  renderGridHeader();
  renderFilterAccordion(baseSets);
  syncPeriodChips();
  renderList();
  renderDetail();
  persistFilterState();
}
$openFilterBtn?.addEventListener('click',()=>{ 
  syncFilterOverlayWidth();
  setFilterOverlay(!$overlay.classList.contains('is-open'));
});
$closeFilterBtn?.addEventListener('click',()=>{
  setFilterOverlay(false);
});
$filterSearch?.addEventListener('input', () => { state.searchQuery = $filterSearch.value.trim(); applyFilters(); });
$resetFilterBtn?.addEventListener('click',()=>{ FILTER_SCHEMA.forEach(g=>{state.filters[g.key]=g.key==='periods'?DEFAULT_PERIODS.slice():[]; state.openGroups[g.key]=!!g.open;}); state.searchQuery=''; if($filterSearch) $filterSearch.value=''; applyFilters(); });
$toggleAllGroupsBtn?.addEventListener('click',()=>{ const anyOpen=FILTER_SCHEMA.some(g=>state.openGroups[g.key]); FILTER_SCHEMA.forEach(g=>{state.openGroups[g.key]=!anyOpen;}); persistFilterState(); renderFilterAccordion(); const icon=$toggleAllGroupsBtn.querySelector('svg'); if(icon) icon.style.transform=anyOpen?'':'rotate(180deg)'; });
qs('#shareProductBtn')?.addEventListener('click', handleShare);
qs('#inquiryProductBtn')?.addEventListener('click', handleInquiry);
qs('#contractProductBtn')?.addEventListener('click', handleContract);

function syncPeriodChips() {
  const chips = document.querySelectorAll('#periodChips .period-chip input');
  const current = new Set(state.filters.periods || []);
  chips.forEach((input) => { input.checked = current.has(input.value); });
}

function bindPeriodSelector() {
  const selector = document.getElementById('periodSelector');
  const toggle = document.getElementById('periodToggle');
  const chips = document.getElementById('periodChips');
  if (!selector || !toggle || !chips) return;

  toggle.addEventListener('click', () => {
    selector.classList.toggle('is-open');
  });

  chips.addEventListener('change', (e) => {
    const input = e.target.closest('input[type="checkbox"]');
    if (!input) return;
    const current = new Set(state.filters.periods || []);
    if (input.checked) current.add(input.value); else current.delete(input.value);
    if (!current.size) current.add(DEFAULT_PERIODS[0]);
    state.filters.periods = [...current];
    syncPeriodChips();
    applyFilters();
  });

  syncPeriodChips();
}

function applyRoleActions() {
  const inquiryBtn = qs('#inquiryProductBtn');
  const contractBtn = qs('#contractProductBtn');
  const shareBtn = qs('#shareProductBtn');
  if (state.role === 'agent') {
    inquiryBtn?.classList.remove('detail-actions-hidden');
    contractBtn?.classList.remove('detail-actions-hidden');
    shareBtn?.classList.remove('detail-actions-hidden');
  } else {
    inquiryBtn?.classList.add('detail-actions-hidden');
    contractBtn?.classList.add('detail-actions-hidden');
  }
}

async function init(){ 
  const { user, profile } = await requireAuth({ roles: ['provider','agent','admin'] }); 
  state.user = user;
  state.profile = profile;
  state.role = profile.role;
  state.companyCode = profile.company_code || '';
  renderRoleMenu(menu, profile.role);
  applyRoleActions();
  syncFilterOverlayWidth();
  setFilterOverlay(state.filterOverlayOpen);
  bindFilterAccordion();
  bindPeriodSelector();
  renderGridHeader();

  // 스켈레톤 로딩 표시
  if ($list) {
    const visibleCols = getVisibleGridCols();
    const sizes = ['skeleton-cell--sm', 'skeleton-cell--md', 'skeleton-cell--lg'];
    $list.innerHTML = Array.from({ length: 10 }, () => {
      const cells = visibleCols.map((_, i) =>
        `<td class="pls-cell"><div class="skeleton-cell ${sizes[i % sizes.length]}"></div></td>`
      ).join('');
      return `<tr class="pls-row">${cells}</tr>`;
    }).join('');
  }

  const unsubscribe = watchProducts((products) => {
    state.allProducts = applyRoleFilter(products.map(normalizeProduct)).filter(item => item.id);
    state.allProducts.forEach(item => ensureTermLoaded(item));
    applyFilters();
  });
  registerPageCleanup(unsubscribe);
}
let _mounted = false;
export async function mount() {
  bindDOM();
  _mounted = false;
  await init().catch((error) => {
    console.error('[product-list] init failed', error);
    $list.innerHTML = '<div class="list-empty">상품목록을 불러오지 못했습니다.</div>';
  });
  _mounted = true;
}
export function unmount() {
  runPageCleanup();
  _mounted = false;
}
export function onShow() {
  bindPeriodSelector();
}
// Auto-mount on first script load (server-rendered page)
if (!import.meta.url.includes('?')) mount();
