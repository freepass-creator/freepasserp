function moneyText(value){ const n = Number(value || 0); return n ? n.toLocaleString('ko-KR') : '-'; }
function safeText(value){ return String(value ?? '').trim() || '-'; }

import { open as openFullscreenViewer } from '../shared/fullscreen-photo-viewer.js';
import { escapeHtml } from '../core/management-format.js';
import { renderTableGrid } from '../core/management-list.js';
import { renderColorBadge } from "../core/product-colors.js";
import { requireAuth } from "../core/auth-guard.js";
import { qs, registerPageCleanup, runPageCleanup } from "../core/utils.js";
import { renderRoleMenu } from "../core/role-menu.js";
import { pushEsc, removeEsc } from "../core/esc-stack.js";
import { ensureRoom, watchProducts, resolveTermForProduct } from "../firebase/firebase-db.js";
import { showConfirm, showToast } from "../core/toast.js";
import { bindProductDetailPhotoEvents, extractTermFields, normalizeProduct, renderProductDetailMarkup } from "../shared/product-list-detail-view.js";
import { renderBadgeRow } from "../shared/badge.js";

const _isMobile = window.matchMedia('(max-width: 768px)');
import {
  esc,
  renderCatalogCard,
  renderCatalogDetailHero,
  renderCatalogPriceTable,
  renderCatalogInsuranceTable,
  renderCatalogConditions,
  renderCatalogClawback,
  renderCatalogExtra,
  fmt,
} from "../shared/catalog-card.js";

const DEFAULT_PERIODS = ["1", "12", "24", "36", "48", "60"];
const RANGE_BUCKETS = {
  rent: [
    { value: "under50", label: "50만원 이하", match: v => v > 0 && v < 500000 },
    { value: "50", label: "50만원~", match: v => v >= 500000 && v < 600000 },
    { value: "60", label: "60만원~", match: v => v >= 600000 && v < 700000 },
    { value: "70", label: "70만원~", match: v => v >= 700000 && v < 800000 },
    { value: "80", label: "80만원~", match: v => v >= 800000 && v < 900000 },
    { value: "90", label: "90만원~", match: v => v >= 900000 && v < 1000000 },
    { value: "100", label: "100만원~", match: v => v >= 1000000 && v < 1500000 },
    { value: "150", label: "150만원~", match: v => v >= 1500000 && v < 2000000 },
    { value: "200", label: "200만원~", match: v => v >= 2000000 }
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
let _accordionDirty = true;
function setFilterOverlay(open){
  state.filterOverlayOpen = !!open;
  $overlay?.classList.toggle('is-open', !!open);
  $overlay?.setAttribute('aria-hidden', String(!open));
  if (open) {
    if (overlayEscId) removeEsc(overlayEscId);
    overlayEscId = pushEsc(() => setFilterOverlay(false));
    if (_accordionDirty) { renderFilterAccordion(); _accordionDirty = false; }
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
// 모바일 카탈로그 뷰 DOM refs
let $plsMGrid, $plsMSidebar, $plsMOverlay, $plsMClose, $plsMCount, $plsMSearch, $plsMReset, $plsMFilters;
let $plsMDetail, $plsMDetailBack, $plsMDetailTitle, $plsMDetailContent, $plsMDetailHeadActions;

function bindDOM() {
  menu = qs('#sidebar-menu');
  $list = qs('#productList'); $detail = qs('#productDetail'); $title = qs('#detailPanelTitle'); $overlay = qs('#filterOverlay'); $accordion = qs('#filterAccordion'); $periodHead = qs('#selectedPeriodsHead'); $filterSearch = qs('#filterSearchInput');
  $gridHeader = qs('#plsGridHeader');
  $pageName = qs('.top-bar-page-name');
  $stateSep = qs('#topBarStateSep');
  $stateIdentity = qs('#topBarIdentity');
  $shell = qs('#productListShell');
  $detailPanel = qs('#plsDetailPanel');
  // 모바일
  $plsMGrid    = qs('#plsMCatalogGrid');
  $plsMSidebar = qs('#plsMCatalogSidebar');
  $plsMOverlay = qs('#plsMCatalogOverlay');
  $plsMClose   = qs('#plsMCatalogClose');
  $plsMCount   = qs('#plsMCatalogCount');
  $plsMSearch  = qs('#plsMCatalogSearch');
  $plsMReset   = qs('#plsMCatalogReset');
  $plsMFilters = qs('#plsMCatalogFilterSections');
  $plsMDetail        = qs('#plsMDetail');
  $plsMDetailBack    = qs('#plsMDetailBack');
  $plsMDetailTitle   = qs('#plsMDetailTitle');
  $plsMDetailContent = qs('#plsMDetailContent');
  $plsMDetailHeadActions = qs('#plsMDetailHeadActions');
}

/* ── 엑셀 그리드 컬럼 정의 ── */
const PRICE_MONTHS = ['1','12','24','36','48','60'];

// align: 'c'=가운데, 'r'=우측, 기본=좌측
const INFO_COLS = [
  // maxW: 최대폭(px). 넘으면 말줄임. 없으면 auto.
  // maxW 없음 = 텍스트에 맞게 자동. ellipsis = 상한만 제한
  { key: 'vehicleStatus', label: '차량상태', align: 'c', filterable: true, w: 80 },
  { key: 'productType',   label: '상품구분', align: 'c', filterable: true, w: 80 },
  { key: 'partnerCode',   label: '공급코드', align: 'c', filterable: true },
  { key: 'carNo',         label: '차량번호', align: 'c', sticky: true, searchable: true },
  { key: 'maker',         label: '제조사',   align: 'c', filterable: true },
  { key: 'model',         label: '모델명',   align: 'c', filterable: true },
  { key: 'subModel',      label: '세부모델', maxW: 100, filterable: true },
  { key: 'trim',          label: '세부트림', maxW: 100, searchable: true },
  { key: 'options',       label: '선택옵션', maxW: 120, searchable: true },
  { key: 'fuel',          label: '연료',     align: 'c', filterable: true },
  { key: 'color',         label: '색상',     align: 'c', maxW: 80, filterable: true },
  { key: 'year',          label: '연식',     align: 'c', filterable: true },
  { key: 'mileage',       label: '주행거리', num: true,  filterable: true, wCh: '999,999km' },
  { key: 'vehicleClass',  label: '차종구분', align: 'c', filterable: true },
  { key: 'reviewStatus',  label: '심사기준', align: 'c', filterable: true },
  { key: 'minAge',        label: '최저연령', align: 'c', filterable: true },
];

// 기간별 대여료 컬럼 — 9,999,999 기준 고정폭
const PRICE_COLS = PRICE_MONTHS.map(m => ({
  key: `price_${m}`, label: m === '1' ? '월렌트' : `${m}개월`, wCh: '9,999,999', num: true, priceMonth: m,
}));

const GRID_COLS = [...INFO_COLS, ...PRICE_COLS];
function getVisiblePriceCols() {
  const selected = getSelectedPeriods();
  return PRICE_COLS.filter(col => selected.includes(col.priceMonth));
}
function getVisibleGridCols() {
  return [...INFO_COLS, ...getVisiblePriceCols()];
}

/* Header column filters are now managed by renderTableGrid's built-in filter system */

/* ── 상세 패널 열기/닫기 (우측 오버레이) ── */
let detailEscId = null;

function _syncTopBar(item) {
  const sep = document.getElementById('topBarStateSep');
  const identEl = document.getElementById('topBarIdentity');
  const badge = document.getElementById('topBarWorkBadge');
  if (!sep || !identEl) return;
  if (item) {
    identEl.textContent = [item.carNo, item.model].filter(Boolean).join(' · ');
    identEl.hidden = false;
    sep.hidden = false;
    if (badge) badge.textContent = '상세정보';
  } else {
    identEl.textContent = '';
    identEl.hidden = true;
    sep.hidden = true;
    if (badge) badge.textContent = '';
  }
}

function showDetailPanel() {
  if (!$detailPanel) return;
  $detailPanel.hidden = false;
  $detailPanel.classList.remove('is-open');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $detailPanel.classList.add('is-open');
  }));
  // 상단바에 선택 항목 표시
  const selected = state.filteredProducts.find(p => p.id === state.selectedId);
  _syncTopBar(selected);
  // ESC 스택에 등록
  if (detailEscId) removeEsc(detailEscId);
  detailEscId = pushEsc(() => hideDetailPanel());
}

function hideDetailPanel() {
  if (!$detailPanel) return;
  $detailPanel.classList.remove('is-open');
  $detailPanel.hidden = true;
  state.selectedId = null;
  _syncTopBar(null);
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
function getGroupOptions(group,source){ if(group.type==='periods') return group.options.map(v=>({value:v,label:v==='1'?'월렌트':`${v}개월`})); if(group.type==='range') return RANGE_BUCKETS[group.key].map(b=>({value:b.value,label:b.label})); if(group.type==='year'){const years=[...new Set(source.map(i=>i.year).filter(Boolean))].sort((a,b)=>b-a); return years.map(y=>({value:String(y),label:`${y}~`}));} if(group.type==='termSelect'){const values=[...new Set(source.map(i=>getTermVal(group,i)).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'ko')); return values.map(v=>({value:String(v),label:String(v)}));} const values=[...new Set(source.map(i=> group.type==='policySelect' ? i[group.field] : i[group.key]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'ko')); return values.map(v=>({value:String(v),label:String(v)})); }
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
  return result;
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
    case 'partnerCode': return { text: safe(item.partnerCode) };
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
  if (_isMobile.matches) return; // 모바일에서는 카드 뷰만 사용
  if ($pageName) $pageName.textContent = `전체 상품 검색 (${state.filteredProducts.length}건)`;

  renderTableGrid({
    thead: $gridHeader,
    tbody: $list,
    columns: getVisibleGridCols(),
    items: state.filteredProducts,
    selectedKey: state.selectedId,
    sortable: true,
    getKey: (item) => item.id,
    onSelect: (item) => {
      if (state.selectedId === item.id && $detailPanel && !$detailPanel.hidden) {
        hideDetailPanel();
        return;
      }
      state.selectedId = item.id;
      state.activePhotoIndex = 0;
      renderList();
      renderDetail();
      if ($detailPanel && !$detailPanel.hidden) {
        $detailPanel.classList.remove('is-open');
        $detailPanel.hidden = true;
        setTimeout(() => showDetailPanel(), 0);
      } else {
        showDetailPanel();
      }
    },
    getCellValue: (col, item) => {
      if (col.priceMonth) {
        const rent = fmtPrice(item.price[col.priceMonth]?.rent);
        const depNum = moneyToNumber(item.price[col.priceMonth]?.deposit);
        const dep = depNum ? depNum.toLocaleString('ko-KR') : '0';
        return `<span class="pls-price-rent">${rent}</span><span class="pls-price-dep">${dep}</span>`;
      }
      const cv = cellValue(col, item);
      return cv.html || escapeHtml(cv.text || '');
    },
    getCellText: (col, item) => {
      if (col.priceMonth) {
        const rent = moneyToNumber(item.price[col.priceMonth]?.rent);
        return rent ? rent.toString() : '';
      }
      const cv = cellValue(col, item);
      return cv.text || '';
    },
    emptyText: '조건에 맞는 상품이 없습니다.'
  });
}

/* Row click handling is now managed by renderTableGrid's onSelect callback */
function hasContent(value){ return String(value ?? '').trim() !== '' && String(value ?? '').trim() !== '-'; }
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
function renderPriceTable(product){ const months=['1','6','12','24','36','48','60']; return `<table class="price-table"><thead><tr><th>기간</th><th>대여료</th><th>보증금</th></tr></thead><tbody>${months.map(m=>`<tr><td>${m}개월</td><td>${Number(product.price[m]?.rent||0).toLocaleString('ko-KR')}</td><td>${Number(product.price[m]?.deposit||0).toLocaleString('ko-KR')}</td></tr>`).join('')}</tbody></table>`; }
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
    if (state.selectedId === product.id) {
      renderDetail();
      // 모바일 상세 패널도 재렌더링 (정책 데이터 반영)
      if ($plsMDetailContent && $plsMDetail && !$plsMDetail.hidden) {
        $plsMDetailContent.innerHTML = renderMobileCatalogDetail(product);
        bindMobileDetailGallery($plsMDetailContent);
      }
    }
  }
}
function currentProduct(){
  return state.filteredProducts.find(i=>i.id===state.selectedId) || state.allProducts.find(i=>i.id===state.selectedId) || null;
}

function buildShareUrl(product){
  const url = new URL(window.location.origin + '/catalog');
  if (state.profile?.user_code) url.searchParams.set('a', state.profile.user_code);
  url.searchParams.set('id', product.productUid || product.id);
  return url.toString();
}

async function handleShare(){
  const product = currentProduct();
  if (!product) {
    showToast('공유할 상품을 먼저 선택하세요.', 'info');
    return;
  }
  const shareUrl = buildShareUrl(product);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      showToast('공유 링크가 복사되었습니다.', 'success');
      return;
    }
  } catch (error) {
    if (error?.name === 'AbortError') return;
  }
  window.prompt('아래 링크를 복사하세요.', shareUrl);
}

async function handleInquiry(btnEl) {
  const product = currentProduct();
  if (!product) { showToast('문의할 상품을 먼저 선택하세요.', 'info'); return; }
  if (state.role !== 'agent' || !state.user || !state.profile) { showToast('영업자 계정에서만 문의할 수 있습니다.', 'error'); return; }
  if (!await showConfirm('이 상품에 대해 대화를 시작하시겠습니까?')) return;
  if (btnEl) btnEl.disabled = true;
  try {
    const roomId = await ensureRoom({
      productUid: product.productUid || '',
      productCode: product.productCode || product.id,
      providerUid: product.providerUid || '',
      providerCompanyCode: product.providerCompanyCode || product.partnerCode || '',
      providerName: product.providerName || '',
      agentUid: state.user.uid,
      agentCode: state.profile.user_code || '',
      agentName: state.profile.name || state.profile.user_name || '',
      vehicleNumber: product.carNo && product.carNo !== '-' ? product.carNo : '',
      modelName: [product.maker, product.model, product.subModel, product.trim].filter(v => v && v !== '-').join(' ')
    });
    localStorage.setItem('freepass_pending_chat_room', roomId);
    window.location.href = '/chat';
  } catch (e) {
    if (btnEl) btnEl.disabled = false;
    showToast('채팅 연결에 실패했습니다.', 'error');
  }
}

async function handleContract(){
  const product=currentProduct();
  if(!product) {
    showToast('계약할 상품을 먼저 선택하세요.', 'info');
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


function syncTopBarIdentity(product) {
  if (!$stateSep || !$stateIdentity) return;
  const badge = document.getElementById('topBarWorkBadge');
  if (product) {
    const label = product.carNo || '';
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

function syncDetailBadges(product) {
  const el = document.getElementById('productDetailBadges');
  if (!el) return;
  if (!product) { el.innerHTML = ''; return; }
  const badges = [
    product.vehicleStatus && product.vehicleStatus !== '-' && product.vehicleStatus !== '재고'
      ? { field: 'vehicle_status', value: product.vehicleStatus } : null,
    product.productType && product.productType !== '-'
      ? { field: 'product_type', value: product.productType } : null,
  ].filter(Boolean);
  el.innerHTML = badges.map(b => renderBadgeRow([b])).join('');
}

function renderDetail(){
  const product=state.filteredProducts.find(i=>i.id===state.selectedId);
  if(!product){
    $title.textContent='상세정보';
    $detail.innerHTML='<div class="detail-empty">좌측 목록에서 차량을 선택하세요.</div>';
    syncTopBarIdentity(null);
    syncDetailBadges(null);
    hideDetailPanel();
    return;
  }
  const _carNo = safe(product.carNo);
  $title.textContent = _carNo && _carNo !== '-' ? `상세정보(${_carNo})` : '상세정보';
  syncDetailBadges(product);
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
  syncSelectionFromPreferredProduct();
  if (state.selectedId && !state.filteredProducts.find((item) => item.id === state.selectedId)) {
    state.selectedId = null;
    state.activePhotoIndex = 0;
  }
  renderPeriodsHead();
  if (state.filterOverlayOpen) { renderFilterAccordion(baseSets); _accordionDirty = false; } else { _accordionDirty = true; }
  syncPeriodChips();
  if (!_isMobile.matches) { renderList(); renderDetail(); }
  if (_isMobile.matches) { renderMobileCatalogGrid(); }
  persistFilterState();
}
$openFilterBtn?.addEventListener('click',()=>{ 
  syncFilterOverlayWidth();
  setFilterOverlay(!$overlay.classList.contains('is-open'));
});
$closeFilterBtn?.addEventListener('click',()=>{
  setFilterOverlay(false);
});
let _searchTimer = 0;
$filterSearch?.addEventListener('input', () => { state.searchQuery = $filterSearch.value.trim(); clearTimeout(_searchTimer); _searchTimer = setTimeout(applyFilters, 150); });
$resetFilterBtn?.addEventListener('click',()=>{ FILTER_SCHEMA.forEach(g=>{state.filters[g.key]=g.key==='periods'?DEFAULT_PERIODS.slice():[]; state.openGroups[g.key]=!!g.open;}); state.searchQuery=''; if($filterSearch) $filterSearch.value=''; applyFilters(); });
$toggleAllGroupsBtn?.addEventListener('click',()=>{ const anyOpen=FILTER_SCHEMA.some(g=>state.openGroups[g.key]); FILTER_SCHEMA.forEach(g=>{state.openGroups[g.key]=!anyOpen;}); persistFilterState(); renderFilterAccordion(); const icon=$toggleAllGroupsBtn.querySelector('svg'); if(icon) icon.style.transform=anyOpen?'':'rotate(180deg)'; });
qs('#shareProductBtn')?.addEventListener('click', handleShare);
qs('#inquiryProductBtn')?.addEventListener('click', (e) => handleInquiry(e.currentTarget));
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
  const role = state.role;
  // 문의: 영업자만
  if (role === 'agent') {
    inquiryBtn?.classList.remove('detail-actions-hidden');
  } else {
    inquiryBtn?.classList.add('detail-actions-hidden');
  }
  // 계약: 영업자만
  if (role === 'agent') {
    contractBtn?.classList.remove('detail-actions-hidden');
  } else {
    contractBtn?.classList.add('detail-actions-hidden');
  }
  // 공유: 전체 (항상 표시, 기본 숨김 없음)
}

// ─── 모바일 카탈로그 뷰 ───────────────────────────────────────────────────────

// 카탈로그와 동일한 순서
const MOBILE_FILTER_KEYS = ['rent','deposit','periods','productType','maker','model','subModel','fuel','extColor','year','mileage','vehicleClass','basicDriverAge','reviewStatus'];

function _updateFilterIcon(open) {
  const btn = document.getElementById('mobile-filter-btn');
  if (!btn) return;
  const svg = btn.querySelector('svg');
  if (!svg) return;
  // 열림: < (접기), 닫힘: > (펼치기)
  svg.innerHTML = open
    ? '<path d="m15 18-6-6 6-6"/>'
    : '<path d="m9 18 6-6-6-6"/>';
}
function openMobileSidebar() {
  renderMobileSidebarFilters();
  $plsMSidebar?.classList.add('is-open');
  $plsMOverlay?.classList.add('is-open');
  _updateFilterIcon(true);
}
function closeMobileSidebar() {
  $plsMSidebar?.classList.remove('is-open');
  $plsMOverlay?.classList.remove('is-open');
  _updateFilterIcon(false);
}

// ── 모바일 상세: 카탈로그 스타일 렌더링 ────────────────────────────────────

function renderMobileCatalogDetail(product, { actionsHtml = '' } = {}) {
  // 갤러리 (plsMGallery IDs는 bindMobileDetailGallery 에서 사용하므로 로컬 유지)
  const photos = product.photos || [];
  const total = photos.length;
  const galleryHtml = total
    ? `<div class="catalog-gallery__track pls-m-gallery" id="plsMGallery" data-photos='${JSON.stringify(photos).replace(/'/g,"&#39;")}' data-idx="0">
        <img class="catalog-gallery__img" src="${esc(photos[0])}" alt="차량사진" id="plsMGalleryImg">
        ${total > 1 ? `
          <button class="catalog-gallery__nav catalog-gallery__nav--prev" id="plsMGalleryPrev" aria-label="이전"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m15 18-6-6 6-6"/></svg></button>
          <button class="catalog-gallery__nav catalog-gallery__nav--next" id="plsMGalleryNext" aria-label="다음"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg></button>
          <div class="catalog-gallery__counter" id="plsMGalleryCtr">1 / ${total}</div>` : ''}
        ${total > 0 ? `<div class="catalog-gallery__hint">사진을 눌러 ${total}장 모두 보기</div>` : ''}
      </div>`
    : `<div class="catalog-gallery__empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;

  // 가격표 행 (수수료 포함 — ERP 전용)
  const periods = ['1', '6', '12', '24', '36', '48', '60'];
  const tf = getTermFields(product);
  const priceRows = periods
    .filter(m => Number(product.price?.[m]?.rent || 0) > 0)
    .map(m => ({ m, rent: product.price[m].rent, dep: product.price[m].deposit, fee: product.price[m].fee }));
  const guideNote = tf.rental_guide_note || '';

  // 보험 행
  function first(...vs) { for (const v of vs) { if (v && String(v).trim() && v !== '-') return v; } return ''; }
  function parsePol(raw) {
    const s = String(raw ?? '').trim();
    if (!s || s === '-') return { limit: '-', deductible: '-' };
    const parts = s.split('/').map(x => x.trim()).filter(Boolean);
    return parts.length >= 2 ? { limit: parts[0], deductible: parts.slice(1).join(' / ') } : { limit: s, deductible: '-' };
  }
  const pol = product.policy || {};
  const bodily   = parsePol(first(tf.injury_limit_deductible,          pol.bodily));
  const property = parsePol(first(tf.property_limit_deductible,        pol.property));
  const selfB    = parsePol(first(tf.personal_injury_limit_deductible, pol.selfBodily));
  const unins    = parsePol(first(tf.uninsured_limit_deductible,       pol.uninsured));
  const own      = parsePol(first(tf.own_damage_limit_deductible,      pol.ownDamage));
  const insRows = [
    ['대인',         first(tf.injury_compensation_limit,          bodily.limit),    first(tf.injury_deductible,           bodily.deductible)],
    ['대물',         first(tf.property_compensation_limit,        property.limit),  first(tf.property_deductible,         property.deductible)],
    ['자기신체사고', first(tf.personal_injury_compensation_limit, selfB.limit),     first(tf.personal_injury_deductible,  selfB.deductible)],
    ['무보험차상해', first(tf.uninsured_compensation_limit,       unins.limit),     first(tf.uninsured_deductible,        unins.deductible)],
    ['자기차량손해', first(tf.own_damage_compensation,            own.limit),       first(tf.own_damage_min_deductible,   own.deductible)],
    ['긴급출동',     first(tf.roadside_assistance, product.condition?.emergency),   '-'],
  ];

  // 대여조건 행
  const condRows = [
    ['1만Km추가비용',   first(tf.mileage_upcharge_per_10000km)],
    ['보증금분납',       first(tf.deposit_installment)],
    ['결제방식',         first(tf.payment_method,   pol.paymentMethod)],
    ['위약금',           first(tf.penalty_condition, product.condition?.penaltyRate)],
    ['보증금카드결제',   first(tf.deposit_card_payment)],
    ['대여지역',         first(tf.rental_region,    product.condition?.rentalRegion)],
    ['탁송비',           first(tf.delivery_fee,     product.condition?.deliveryFee)],
    ['운전연령하향',     first(tf.driver_age_lowering, pol.ageLowering)],
    ['운전연령하향비용', first(tf.age_lowering_cost,   pol.ageLoweringCost)],
    ['개인운전자범위',   first(tf.personal_driver_scope)],
    ['사업자운전자범위', first(tf.business_driver_scope)],
    ['추가운전자수',     first(tf.additional_driver_allowance_count)],
    ['추가운전자비용',   first(tf.additional_driver_cost)],
    ['정비서비스',       first(tf.maintenance_service, product.condition?.maintenance)],
    ['최소운전연령',     first(tf.basic_driver_age, product.ageText)],
    ['연간약정주행거리', first(tf.annual_mileage,   pol.annualMileage)],
  ];

  // 추가정보 행 (catalog.js와 동일)
  const _fmtDate = (v) => { const d = String(v ?? '').replace(/[^\d]/g, ''); if (!d) return null; if (d.length === 8) return `${d.slice(0,4)}.${d.slice(4,6)}.${d.slice(6,8)}`; if (d.length === 6) return `20${d.slice(0,2)}.${d.slice(2,4)}.${d.slice(4,6)}`; return String(v ?? '').trim() || null; };
  const extraRows = [
    ['차량번호',   product.car_number],
    ['차종구분',   product.vehicle_class],
    ['최초등록일', _fmtDate(product.first_registration_date)],
    ['차령만료일', _fmtDate(product.vehicle_age_expiry_date)],
    ['차량가격',   fmt(product.vehicle_price)],
    ['특이사항',   product.partner_memo || product.note],
    ['공급코드',   product.providerCompanyCode || product.provider_company_code || product.partner_code],
  ];

  // 카탈로그와 동일한 섹션 순서, 수수료 컬럼 + 환수조건(표 아래)만 추가
  return galleryHtml
    + renderCatalogDetailHero(product, actionsHtml)
    + renderCatalogPriceTable(priceRows, { showFee: true, guideNote, clawbackNote: tf.commission_clawback_condition || '' })
    + renderCatalogInsuranceTable(insRows)
    + renderCatalogConditions(condRows)
    + renderCatalogExtra(extraRows);
}

function bindMobileDetailGallery(container) {
  const wrap = container.querySelector('#plsMGallery');
  if (!wrap) return;
  let photos, idx;
  try { photos = JSON.parse(wrap.dataset.photos || '[]'); } catch { return; }
  if (!photos.length) return;
  idx = 0;
  const img = container.querySelector('#plsMGalleryImg');
  const ctr = container.querySelector('#plsMGalleryCtr');
  const update = () => {
    if (img) img.src = photos[idx];
    if (ctr) ctr.textContent = `${idx + 1} / ${photos.length}`;
    wrap.dataset.idx = idx;
  };
  if (photos.length > 1) {
    container.querySelector('#plsMGalleryPrev')?.addEventListener('click', (e) => { e.stopPropagation(); idx = (idx - 1 + photos.length) % photos.length; update(); });
    container.querySelector('#plsMGalleryNext')?.addEventListener('click', (e) => { e.stopPropagation(); idx = (idx + 1) % photos.length; update(); });
  }
  // 사진 클릭 → 풀스크린 뷰어 (스와이프 후 클릭 방지)
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('.catalog-gallery__nav')) return;
    if (_swiped) { _swiped = false; return; }
    openFullscreenViewer(photos, idx);
  });
  // 스와이프 (스크롤 충돌 방지 + 클릭 오작동 방지)
  let _tx = 0, _ty = 0, _swiped = false, _locked = false;
  wrap.addEventListener('touchstart', e => {
    _tx = e.touches[0].clientX; _ty = e.touches[0].clientY;
    _swiped = false; _locked = false;
  }, { passive: true });
  wrap.addEventListener('touchmove', e => {
    if (_locked) return;
    const dx = Math.abs(e.touches[0].clientX - _tx);
    const dy = Math.abs(e.touches[0].clientY - _ty);
    if (dx > dy && dx > 10) { _locked = true; _swiped = true; e.preventDefault(); }
    else if (dy > dx && dy > 10) { _locked = true; } // 세로 스크롤 허용
  }, { passive: false });
  wrap.addEventListener('touchend', e => {
    if (!_swiped) return;
    const dx = e.changedTouches[0].clientX - _tx;
    if (Math.abs(dx) < 40) return;
    idx = dx < 0 ? (idx + 1) % photos.length : (idx - 1 + photos.length) % photos.length;
    update();
  });
}

function openMobileDetail(id) {
  if (!$plsMDetail || !$plsMDetailContent) return;
  state.selectedId = id;

  const product = state.filteredProducts.find(p => p.id === id);
  if (!product) return;

  ensureTermLoaded(product);

  if ($plsMDetailTitle) {
    const p = state.profile || {};
    const userLabel = [p.company_name || p.company, p.name || p.user_name, p.position || p.rank].filter(Boolean).join(' ');
    $plsMDetailTitle.textContent = userLabel || '상세정보';
  }
  // 카탈로그 스타일 상세 렌더링 — 액션 버튼 컨텐츠 내부로
  // 문의: 영업자만 / 계약: 영업자+공급사+관리자 / 공유: 전체
  const role = state.role;
  const inquiryBtn = role === 'agent'
    ? `<button class="cat-share-btn" id="plsMDetailInquiry" title="대화" type="button"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/><path d="M8 12h8"/><path d="M12 8v8"/></svg></button>`
    : '';
  const contractBtn = role === 'agent'
    ? `<button class="cat-share-btn" id="plsMDetailContract" title="계약" type="button"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m9 15 2 2 4-4"/></svg></button>`
    : '';
  const actionsHtml = `${inquiryBtn}${contractBtn}<button class="cat-share-btn" id="plsMDetailShare" title="공유" type="button"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg></button>`;
  $plsMDetailContent.innerHTML = renderMobileCatalogDetail(product, { actionsHtml });
  bindMobileDetailGallery($plsMDetailContent);
  $plsMDetailContent.querySelector('#plsMDetailInquiry')?.addEventListener('click', (e) => handleInquiry(e.currentTarget));
  $plsMDetailContent.querySelector('#plsMDetailShare')?.addEventListener('click', handleShare);
  $plsMDetailContent.querySelector('#plsMDetailContract')?.addEventListener('click', handleContract);

  // 헤더: 뒤로가기만, 액션 버튼 없음
  if ($plsMDetailBack) $plsMDetailBack.onclick = closeMobileDetail;
  if ($plsMDetailHeadActions) $plsMDetailHeadActions.innerHTML = '';
  $plsMDetail.hidden = false;
}


function closeMobileDetail() {
  if ($plsMDetail) $plsMDetail.hidden = true;
  if ($plsMDetailBack) $plsMDetailBack.onclick = null;
  state.selectedId = null;
}

function renderMobileSidebarFilters() {
  if (!$plsMFilters) return;
  const bs = buildBaseSets();
  const groups = MOBILE_FILTER_KEYS.map(k => FILTER_SCHEMA.find(g => g.key === k)).filter(Boolean);
  $plsMFilters.innerHTML = groups.map(group => {
    const baseSet = group.key === 'periods' ? state.allProducts : (bs.get(group.key) || []);
    const options = getGroupOptions(group, baseSet);
    const selected = state.filters[group.key];
    const activeCount = selected.length;
    const isOpen = state.openGroups[group.key];
    const badge = activeCount ? `<span class="filter-active-badge">${activeCount}</span>` : '';
    const body = options.map(option => {
      const count = group.key === 'periods' ? state.allProducts.length : baseSet.filter(item => matchSingle(group, option.value, item)).length;
      if (group.key !== 'periods' && count === 0 && !selected.includes(option.value)) return '';
      const checked = selected.includes(option.value) ? 'checked' : '';
      return `<label class="filter-check">
        <input type="checkbox" data-mobile-group="${esc(group.key)}" data-value="${esc(option.value)}" ${checked}>
        <span class="filter-check__label">${esc(option.label)}</span>
        <span class="filter-check__count">${count}</span>
      </label>`;
    }).join('');
    return `<div class="catalog-sidebar__section${isOpen ? '' : ' is-collapsed'}" data-filter-key="${esc(group.key)}">
      <div class="catalog-sidebar__title">${esc(group.title)}${badge}</div>
      <div class="catalog-filter-body">${body}</div>
    </div>`;
  }).join('');
}

function renderMobileCatalogGrid() {
  if (!$plsMGrid) return;
  const products = state.filteredProducts;
  if ($plsMCount) $plsMCount.textContent = products.length;

  if (!products.length) {
    $plsMGrid.innerHTML = '<div class="catalog-empty">조건에 맞는 상품이 없습니다.</div>';
    return;
  }

  const periods = state.filters.periods.length ? state.filters.periods : DEFAULT_PERIODS;
  $plsMGrid.innerHTML = products.map(p =>
    renderCatalogCard(p, { periods, dataAttr: `data-id="${esc(p.id)}"` })
  ).join('');
}

function bindMobile() {
  // 모바일 필터 버튼 — 토글 (우측 상단)
  const filterBtn = document.getElementById('mobile-filter-btn');
  if (filterBtn) {
    filterBtn.addEventListener('click', () => {
      const isOpen = $plsMSidebar?.classList.contains('is-open');
      if (isOpen) closeMobileSidebar(); else openMobileSidebar();
    });
  }
  // 사이드바 닫기
  $plsMClose?.addEventListener('click', closeMobileSidebar);
  $plsMOverlay?.addEventListener('click', closeMobileSidebar);
  // 검색 (공유 searchQuery)
  $plsMSearch?.addEventListener('input', () => {
    state.searchQuery = $plsMSearch.value.trim();
    if ($filterSearch) $filterSearch.value = state.searchQuery;
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(applyFilters, 150);
  });
  // 필터 초기화
  $plsMReset?.addEventListener('click', () => {
    FILTER_SCHEMA.forEach(g => { state.filters[g.key] = g.key === 'periods' ? DEFAULT_PERIODS.slice() : []; state.openGroups[g.key] = !!g.open; });
    state.searchQuery = '';
    if ($plsMSearch) $plsMSearch.value = '';
    if ($filterSearch) $filterSearch.value = '';
    applyFilters();
  });
  // 필터 체크박스
  $plsMFilters?.addEventListener('change', (e) => {
    const input = e.target.closest('input[type="checkbox"][data-mobile-group]');
    if (!input) return;
    const key = input.dataset.mobileGroup;
    const cur = new Set(state.filters[key]);
    if (input.checked) cur.add(input.dataset.value);
    else cur.delete(input.dataset.value);
    if (key === 'periods' && cur.size === 0) cur.add(DEFAULT_PERIODS[0]);
    state.filters[key] = [...cur];
    applyFilters();
    renderMobileSidebarFilters();
  });
  // 필터 아코디언 토글
  $plsMFilters?.addEventListener('click', (e) => {
    const title = e.target.closest('.catalog-sidebar__title');
    if (!title) return;
    const section = title.closest('.catalog-sidebar__section');
    if (!section) return;
    const key = section.dataset.filterKey;
    if (key) { state.openGroups[key] = !state.openGroups[key]; section.classList.toggle('is-collapsed', !state.openGroups[key]); }
  });
  // 카드 클릭 → 모바일 상세 패널
  $plsMGrid?.addEventListener('click', (e) => {
    const card = e.target.closest('.catalog-card[data-id]');
    if (!card) return;
    openMobileDetail(card.dataset.id);
  });
  // 상세 패널 뒤로가기
  // 뒤로가기는 openMobileDetail 내에서 .onclick으로 동적 설정 (채팅/상세 상태에 따라 분기)
}

async function init(){ 
  const { user, profile } = await requireAuth({ roles: ['provider','agent','admin'] }); 
  state.user = user;
  state.profile = profile;
  state.role = profile.role;
  state.companyCode = profile.company_code || '';
  const savedPeriods = profile.settings?.periods;
  if (savedPeriods?.length) state.filters.periods = savedPeriods.slice();
  renderRoleMenu(menu, profile.role);
  applyRoleActions();
  bindMobile();
  syncFilterOverlayWidth();
  setFilterOverlay(state.filterOverlayOpen);
  bindFilterAccordion();
  bindPeriodSelector();

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

  const onSettingsSaved = (e) => {
    const periods = e.detail?.periods;
    state.filters.periods = periods?.length ? periods.slice() : DEFAULT_PERIODS.slice();
    applyFilters();
  };
  window.addEventListener('fp:settings-saved', onSettingsSaved);
  registerPageCleanup(() => window.removeEventListener('fp:settings-saved', onSettingsSaved));
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
  scheduleRenderList();
}
// Auto-mount on first script load (server-rendered page)
if (!import.meta.url.includes('?')) mount();
