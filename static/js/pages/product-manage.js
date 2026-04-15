import { requireAuth } from '../core/auth-guard.js';
import { qs, registerPageCleanup, runPageCleanup } from '../core/utils.js';
import { setDirtyCheck, clearDirtyCheck } from '../app.js';
import { syncEditSaveButtonTone , syncTopBarPageCount } from '../core/management-skeleton.js';
import { setSelectionUiClass } from '../core/ui-standards.js';
import { escapeHtml, formatShortDate, formatYearMonth } from '../core/management-format.js';
import { createProductFormModeController } from './product-manage/form-mode.js';
import { renderSkeletonRows } from '../core/management-list.js';
const { createGrid } = globalThis.agGrid || {};
import { createProductManageState } from './product-manage/state.js';
import { createProductImageManager } from './product-manage/images.js';
import { buildProductPayload, fillProductForm } from './product-manage/adapter.js';
import { createGoogleSheetImporter } from './product-manage/import.js';
import { createProductSelectController } from './product-manage/selects.js';
import { createProductInputController } from './product-manage/inputs.js';
import { createProductFilterController } from './product-manage/filters.js';
import { FIELD_IDS, FIELD_NUMBERS, IMPORT_ALLOWED_FIELDS, PRODUCT_MANAGE_FILTER_GROUPS, PRODUCT_PANEL_LABEL } from './product-manage/fields.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { deleteProductImagesByUrls, prepareProductImageFiles, uploadProductImagesDetailed } from '../firebase/firebase-storage.js';
import { deleteProduct, saveProduct, updateProduct, watchCodeItemsByGroup, watchPartners, watchProducts, watchTermsByProvider, watchVehicleMaster } from '../firebase/firebase-db.js';
import { renderBadgeRow } from '../shared/badge.js';
import { buildProductCode } from '../firebase/firebase-codes.js';
import { validateProduct } from '../core/validators.js';
import { showToast, showConfirm } from '../core/toast.js';
import { savePageState, loadPageState } from '../core/page-state.js';

let menu = qs('#sidebar-menu');
let form = qs('#product-form');
let messageBar = qs('#product-feedback');
let message = qs('#product-message');
let filterToggleButton = qs('#openProductFilterBtn');
let filterOverlay = qs('#productFilterOverlay');
let listBody = qs('#product-register-list');
let resetButton = qs('#product-form-reset');
let submitButton = qs('#product-submit-head');
let deleteButton = qs('#product-delete-head');
let editingCodeInput = qs('#editing_product_code');
let productCodeDisplayInput = qs('#product_code_display');
let existingImageInput = qs('#existing_image_url');
let existingImageListInput = qs('#existing_image_urls');
let imageInput = qs('#product_image');
let previewList = qs('#image-preview-list');
let previewSummary = qs('#image-preview-summary');
let previewClearButton = qs('#image-preview-clear-btn');
let previewToolbar = qs('#image-preview-toolbar');
let uploadDropzone = qs('#upload-dropzone');
let imageEditorField = qs('#product-image-editor-field');
let sheetUrlInput = qs('#sheet_url');
let sheetApplyButton = qs('#sheet-apply-btn');

function bindDOM() {
  menu = qs('#sidebar-menu');
  form = qs('#product-form');
  messageBar = qs('#product-feedback');
  message = qs('#product-message');
  filterToggleButton = qs('#openProductFilterBtn');
  filterOverlay = qs('#productFilterOverlay');
  listBody = qs('#product-register-list');
  resetButton = qs('#product-form-reset');
  submitButton = qs('#product-submit-head');
  deleteButton = qs('#product-delete-head');
  editingCodeInput = qs('#editing_product_code');
  productCodeDisplayInput = qs('#product_code_display');
  existingImageInput = qs('#existing_image_url');
  existingImageListInput = qs('#existing_image_urls');
  imageInput = qs('#product_image');
  previewList = qs('#image-preview-list');
  previewSummary = qs('#image-preview-summary');
  previewClearButton = qs('#image-preview-clear-btn');
  previewToolbar = qs('#image-preview-toolbar');
  uploadDropzone = qs('#upload-dropzone');
  imageEditorField = qs('#product-image-editor-field');
  sheetUrlInput = qs('#sheet_url');
  sheetApplyButton = qs('#sheet-apply-btn');
}

const pageState = createProductManageState();
const productManageInitErrors = [];

function safeCreateProductManageController(label, factory, fallback = {}) {
  try {
    return typeof factory === 'function' ? factory() : fallback;
  } catch (error) {
    console.error(`[product-manage] ${label} init failed`, error);
    productManageInitErrors.push({ label, error });
    return fallback;
  }
}

const productSelectController = safeCreateProductManageController('select-controller', () => createProductSelectController({
  getField,
  registerPageCleanup,
  escapeHtml,
  currentProfile: () => currentProfile,
  setCurrentProfile: (value) => { currentProfile = value; pageState.currentProfile = value; },
  getAllProducts: () => allProducts,
  getVehicleMasterEntries: () => vehicleMasterEntries,
  getCodeGroupItems: () => CODE_GROUP_ITEMS,
  watchCodeItemsByGroup,
  watchPartners,
  watchTermsByProvider,
  setReadOnlyByRole: () => setReadOnlyByRole(),
  syncProductCodePreview: () => syncProductCodePreview(),
  onLinkedSpecChanged: () => { pageState.allProducts = allProducts; },
  onRefreshVehicleSpecSelects: () => renderFilteredList(),
  enforceVehicleClassFieldOrder: () => enforceVehicleClassFieldOrder()
}), {});

const {
  refreshVehicleSpecSelects = () => {},
  renderYearSelectOptions = () => {},
  getLinkedVehicleClass = () => '',
  syncLinkedVehicleClass = () => {},
  bindCodeSelects = () => {},
  getPartnerNameByCode = () => '',
  bindPartnerCodeSelect = () => {},
  bindPolicyCodeSelect = () => {},
  getSelectedPolicyMeta = () => ({}),
  bindVehicleSpecLinks = () => {},
  startPolicyTermWatch = () => {}
} = productSelectController || {};

function syncSubmitButtonState(currentMode) {
  if (!submitButton) return;
  const isView = currentMode === 'view';
  syncEditSaveButtonTone(submitButton, isView);
}

function setSummaryRowSelected(row, selected) {
  if (!row) return;
  row.classList.toggle('is-selected', Boolean(selected));
  setSelectionUiClass(row, selected);
}

function syncSelectedSummaryRow() {
  if (!gridApi) return;
  const selectedCode = String(editingCodeInput?.value || '').trim();
  if (selectedCode) {
    const node = gridApi.getRowNode(selectedCode);
    if (node) node.setSelected(true);
  } else {
    gridApi.deselectAll();
  }
}


const filterResetButton = qs('#productFilterResetBtn');
const filterCloseButton = filterOverlay?.querySelector('[data-filter-close]');
const filterSearchInput = qs('#productManageFilterSearch');
const filterAccordion = qs('#productManageFilterAccordion');


const MAX_PRODUCT_IMAGE_COUNT = 20;
const PREPARE_IMAGE_CONCURRENCY = 4;
const SAVE_UPLOAD_CONCURRENCY = 10;
const CODE_GROUP_ITEMS = {};

function enforceVehicleClassFieldOrder() {
  // 위치는 템플릿 순서를 그대로 사용한다.
}


let currentProfile = null;
let allProducts = [];
let vehicleMasterEntries = [];
let lastSelectedProductCode = '';
let mode = 'create';
let _bootDone = false;

let _progressToast = null;
function setStatus(text = '', tone = 'info') {
  const normalizedText = String(text || '').trim();
  if (!normalizedText) {
    if (_progressToast) { _progressToast.dismiss(); _progressToast = null; }
    return;
  }
  if (tone === 'progress') {
    if (_progressToast) { _progressToast.update(normalizedText); }
    else { _progressToast = showToast(normalizedText, 'progress', { duration: 0 }); }
  } else {
    if (_progressToast) { _progressToast.dismiss(); _progressToast = null; }
    showToast(normalizedText, tone);
  }
}

function clearStatus() {
  if (_progressToast) { _progressToast.dismiss(); _progressToast = null; }
}

function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function setActionButtonBusy(button) {
  if (!button) return;
  button.disabled = true;
  button.dataset.busy = 'true';
}

function restoreActionButton(button) {
  if (!button) return;
  button.disabled = false;
  delete button.dataset.busy;
}



const imageManager = safeCreateProductManageController('image-manager', () => createProductImageManager({
  imageInput,
  existingImageInput,
  existingImageListInput,
  previewList,
  previewSummary,
  previewClearButton,
  previewToolbar,
  uploadDropzone,
  MAX_PRODUCT_IMAGE_COUNT,
  PREPARE_IMAGE_CONCURRENCY,
  getMode: () => mode,
  setStatus,
  waitForPaint,
  escapeHtml
}), {});

const {
  normalizeImageUrls = (value) => Array.isArray(value) ? value : [],
  dedupeImageUrls = (value) => Array.isArray(value) ? value : [],
  getStoredImageUrls = () => [],
  setStoredImageUrls = () => [],
  clearRemovedStoredImageUrls = () => {},
  getQueuedStoredImageRemovalUrls = () => [],
  getPendingFiles = () => [],
  clearPendingFiles = () => {},
  renderCurrentPreview = () => {},
  syncImageInteraction = () => {},
  moveStoredImageToFront = () => {},
  movePendingFileToFront = () => {},
  removeStoredImageAt = () => {},
  removePendingFileAt = () => {},
  clearAllImages = () => {},
  openImageViewer = () => {},
  closeImageViewer = () => {},
  handleImageViewerKeydown = () => {},
  cleanup: cleanupImageManager = () => {},
  getImagePrepareActiveCount = () => 0,
  getImagePrepareQueue = async () => {}
} = imageManager || {};

let adapterContext = null;
let sheetImporter = null;

let productFormModeController = null;

function buildProductHeaderIdentity() {
  return String(productCodeDisplayInput?.value || editingCodeInput?.value || getField('car_number')?.value || '').trim();
}



function applyFormMode(nextMode) {
  if (!productFormModeController || typeof productFormModeController.apply !== 'function') {
    mode = nextMode === 'create' ? 'create' : (nextMode === 'edit' ? 'edit' : 'view');
    pageState.mode = mode;
    return mode;
  }
  mode = productFormModeController.apply(nextMode);
  pageState.mode = mode;
  return mode;
}












function buildProductPanelTitle() {
  return PRODUCT_PANEL_LABEL;
}


function setProductCodeDisplay(value = '') {
  if (productCodeDisplayInput) productCodeDisplayInput.value = String(value || '').trim();
}

function computeProductCodePreview() {
  const carNumber = String(getField('car_number')?.value || '').trim();
  const providerCode = currentProfile?.role === 'provider'
    ? String(currentProfile?.company_code || '').trim()
    : String(getField('partner_code')?.value || currentProfile?.company_code || '').trim();
  if (!carNumber || !providerCode) return '';
  return buildProductCode(carNumber, providerCode);
}

function syncProductCodePreview(fallbackCode = '') {
  const previewCode = computeProductCodePreview();
  if (!previewCode) {
    setProductCodeDisplay(String(fallbackCode || '').trim());
    return;
  }
  setProductCodeDisplay(previewCode);
}

function getField(id) {
  return (form || document).querySelector(`#${id}`);
}

const inputController = safeCreateProductManageController('input-controller', () => createProductInputController({
  getField,
  currentProfile: () => currentProfile,
  getMode: () => mode,
  syncProductCodePreview: () => syncProductCodePreview(),
  enforceVehicleClassFieldOrder: () => enforceVehicleClassFieldOrder(),
  renderYearSelectOptions,
  syncLinkedVehicleClass,
  refreshVehicleSpecSelects,
  clearStatus,
  applyFormMode: (nextMode) => applyFormMode(nextMode),
  syncSelectedSummaryRow: () => syncSelectedSummaryRow(),
  renderFilteredList: () => renderFilteredList(),
  form,
  editingCodeInput,
  deleteButton,
  setProductCodeDisplay,
  setStoredImageUrls: (urls) => setStoredImageUrls(urls),
  clearRemovedStoredImageUrls: () => clearRemovedStoredImageUrls(),
  clearPendingFiles: () => clearPendingFiles(),
  closeImageViewer: () => closeImageViewer(),
  renderCurrentPreview: () => renderCurrentPreview()
}), {});


const {
  syncFieldFocusability,
  syncViewModeFieldPresentation,
  normalizeDateText,
  inferYearFromDateText,
  ensureSelectValue,
  formatCommaNumber,
  bindDateInputs,
  bindMoneyInputs,
  setReadOnlyByRole,
  resetForm
} = inputController;

productFormModeController = createProductFormModeController({
  form,
  submitButton,
  deleteButton,
  getTitleLabel: () => buildProductPanelTitle(),
  getIdentity: () => buildProductHeaderIdentity(),
  getField,
  fieldIds: FIELD_IDS,
  getCurrentProfile: () => currentProfile,
  onBeforeApply: ({ mode: nextMode }) => {
    mode = nextMode;
    pageState.mode = nextMode;
    enforceVehicleClassFieldOrder();
  },
  onAfterApply: ({ mode: nextMode, isView }) => {
    renderCurrentPreview();
    syncImageInteraction(!isView);
  },
  syncFieldFocusability,
  syncViewModeFieldPresentation
});

// image handling moved to ./product-manage/images.js



// payload / form hydration moved to ./product-manage/adapter.js

function renderPreviewFromExisting(urls) {
  setStoredImageUrls(urls);
  renderCurrentPreview();
}













function getProductFilterFieldValue(product, key) {
  if (!product) return '';
  if (key === 'partner_code') return product.partner_code || product.provider_company_code || '';
  return product[key] || '';
}

const productFilterController = safeCreateProductManageController('filter-controller', () => createProductFilterController({
  escapeHtml,
  safeText: (value, fallback = '') => {
    const text = String(value ?? '').trim();
    return text || String(fallback || '');
  },
  filterGroups: PRODUCT_MANAGE_FILTER_GROUPS,
  filterOverlay,
  filterSearchInput,
  filterAccordion,
  getAllProducts: () => allProducts,
  onFilteredProductsChanged: (products) => renderList(products),
  getProductFilterFieldValue
}), {});

const { setFilterOverlay = () => {}, renderFilterAccordion = () => {}, renderFilteredList = () => {}, resetFilters = () => {}, bindSearchInput = () => {} } = productFilterController || {};

adapterContext = {
  FIELD_IDS,
  FIELD_NUMBERS,
  getField,
  getPartnerNameByCode,
  getSelectedPolicyMeta,
  getStoredImageUrls,
  normalizeDateText,
  inferYearFromDateText,
  getLinkedVehicleClass,
  currentProfile: () => currentProfile,
  setCurrentProfile: (value) => { currentProfile = value; pageState.currentProfile = value; },
  editingCodeInput,
  setLastSelectedProductCode: (value) => { lastSelectedProductCode = value; pageState.lastSelectedProductCode = value; },
  setMode: (value) => { mode = value; pageState.mode = value; },
  setProductCodeDisplay,
  dedupeImageUrls,
  setStoredImageUrls,
  clearRemovedStoredImageUrls,
  ensureSelectValue,
  formatCommaNumber,
  startPolicyTermWatch,
  syncLinkedVehicleClass,
  refreshVehicleSpecSelects,
  setReadOnlyByRole,
  syncProductCodePreview,
  clearPendingFiles,
  renderCurrentPreview,
  renderFilteredList,
  syncSelectedSummaryRow,
  deleteButton,
  applyFormMode
};

sheetImporter = createGoogleSheetImporter({
  importAllowedFields: IMPORT_ALLOWED_FIELDS,
  fieldNumbers: FIELD_NUMBERS,
  getLinkedVehicleClass,
  normalizeDateText,
  inferYearFromDateText,
  buildBasePayload: () => buildProductPayload({ ...adapterContext, currentProfile: currentProfile || null }),
  getPartnerNameByCode,
  currentProfile: () => currentProfile,
  getAllProducts: () => allProducts,
  saveProduct,
  setStatus
});

function buildProductBadges(product) {
  return renderBadgeRow([
    { field: 'vehicle_status', value: product.vehicle_status },
    { field: 'product_type', value: product.product_type }
  ]);
}

function mileageBucketLabel(value) {
  const v = Number(value || 0);
  if (v < 10000) return '0Km~';
  if (v < 20000) return '1만Km~';
  if (v < 30000) return '2만Km~';
  if (v < 40000) return '3만Km~';
  if (v < 50000) return '4만Km~';
  if (v < 60000) return '5만Km~';
  if (v < 70000) return '6만Km~';
  if (v < 80000) return '7만Km~';
  if (v < 90000) return '8만Km~';
  if (v < 100000) return '9만Km~';
  if (v < 110000) return '10만Km~';
  if (v < 120000) return '11만Km~';
  if (v < 130000) return '12만Km~';
  if (v < 140000) return '13만Km~';
  if (v < 150000) return '14만Km~';
  if (v < 200000) return '15만Km~';
  return '20만Km~';
}

// ─── AG Grid ──────────────────────────────────────────────────────
let gridApi = null;
const gridContainer = document.getElementById('product-ag-grid');

// 커스텀 Set Filter (Community 대용)
class CheckboxSetFilter {
  init(params) {
    this.params = params;
    this.selectedValues = null; // null = 전체
    this.el = document.createElement('div');
    this.el.style.cssText = 'padding:8px;min-width:160px;max-height:300px;overflow:auto;font-size:12px;';
  }
  getGui() { return this.el; }
  afterGuiAttached() { this._render(); }
  _render() {
    const vals = new Set();
    this.params.api.forEachNode(n => { if (n.data) vals.add(this.params.valueGetter({ data: n.data, node: n, colDef: this.params.colDef, column: this.params.column, api: this.params.api, columnApi: this.params.columnApi, context: this.params.context }) || ''); });
    const sorted = [...vals].sort();
    const sel = this.selectedValues;
    this.el.innerHTML = `
      <div style="margin-bottom:6px;display:flex;gap:4px;">
        <button type="button" style="font-size:11px;padding:2px 8px;border:1px solid #ddd;border-radius:3px;background:#fff;cursor:pointer;" data-action="all">전체</button>
        <button type="button" style="font-size:11px;padding:2px 8px;border:1px solid #ddd;border-radius:3px;background:#fff;cursor:pointer;" data-action="reset">초기화</button>
      </div>
      ${sorted.map(v => {
        const checked = !sel || sel.has(v) ? 'checked' : '';
        const label = v || '(빈값)';
        return `<label style="display:flex;align-items:center;gap:4px;padding:2px 0;cursor:pointer;"><input type="checkbox" value="${escapeHtml(v)}" ${checked} style="margin:0;"><span>${escapeHtml(label)}</span></label>`;
      }).join('')}
    `;
    this.el.querySelector('[data-action="all"]')?.addEventListener('click', () => {
      this.selectedValues = null;
      this.params.filterChangedCallback();
      this._render();
    });
    this.el.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
      this.selectedValues = null;
      this.params.filterChangedCallback();
      this._render();
    });
    this.el.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const allCbs = this.el.querySelectorAll('input[type="checkbox"]');
        const checked = [...allCbs].filter(c => c.checked).map(c => c.value);
        if (checked.length === allCbs.length) {
          this.selectedValues = null;
        } else {
          this.selectedValues = new Set(checked);
        }
        this.params.filterChangedCallback();
      });
    });
  }
  isFilterActive() { return this.selectedValues !== null; }
  doesFilterPass(params) {
    if (!this.selectedValues) return true;
    const val = this.params.valueGetter({ data: params.data, node: params.node, colDef: this.params.colDef, column: this.params.column, api: this.params.api, columnApi: this.params.columnApi, context: this.params.context }) || '';
    return this.selectedValues.has(val);
  }
  getModel() { return this.selectedValues ? { values: [...this.selectedValues] } : null; }
  setModel(model) { this.selectedValues = model?.values ? new Set(model.values) : null; }
}

// _ft: 'set' = 체크박스, 'search' = 텍스트검색, 'range' = 숫자구간, false = 없음
const AG_COL_DEFS = [
  { field: 'vehicle_status', headerName: '차량상태', minWidth: 72, maxWidth: 80, _ft: 'set',
    cellRenderer: (p) => renderBadgeRow([{ field: 'vehicle_status', value: p.value || '-' }]) },
  { field: 'product_type', headerName: '상품구분', minWidth: 72, maxWidth: 80, _ft: 'set',
    cellRenderer: (p) => renderBadgeRow([{ field: 'product_type', value: p.value || '-' }]) },
  { field: 'partner_code', headerName: '공급사', minWidth: 60, maxWidth: 72, _ft: 'set',
    valueGetter: (p) => p.data?.partner_code || p.data?.provider_company_code || '' },
  { field: 'car_number', headerName: '차량번호', minWidth: 90, maxWidth: 110, _ft: 'search' },
  { field: 'maker', headerName: '제조사', minWidth: 50, maxWidth: 68, _ft: 'set' },
  { field: 'model_name', headerName: '모델', minWidth: 60, maxWidth: 80, _ft: 'set' },
  { field: 'sub_model', headerName: '세부모델', minWidth: 100, flex: 1, _ft: 'search' },
  { field: 'trim_name', headerName: '세부트림', minWidth: 80, flex: 1, _ft: 'search' },
  { field: 'options', headerName: '선택옵션', minWidth: 70, maxWidth: 90, _ft: 'search' },
  { field: 'ext_color', headerName: '외부색상', minWidth: 56, maxWidth: 68, _ft: 'set' },
  { field: 'int_color', headerName: '내부색상', minWidth: 56, maxWidth: 68, _ft: 'set' },
  { field: 'fuel_type', headerName: '연료', minWidth: 48, maxWidth: 60, _ft: 'set' },
  { field: 'mileage', headerName: '주행거리', minWidth: 72, maxWidth: 90, _ft: 'range', sortable: true,
    valueFormatter: (p) => { const v = Number(p.value || 0); return v ? `${v.toLocaleString('ko-KR')}km` : '-'; },
    comparator: (a, b) => (Number(a) || 0) - (Number(b) || 0) },
  { field: '_rent_48', headerName: '대여료', minWidth: 72, maxWidth: 90, _ft: false, sortable: true,
    valueGetter: (p) => Number(p.data?.price?.['48']?.rent || 0),
    valueFormatter: (p) => p.value ? `${Number(p.value).toLocaleString('ko-KR')}` : '-',
    comparator: (a, b) => (Number(a) || 0) - (Number(b) || 0) },
  { field: '_dep_48', headerName: '보증금', minWidth: 72, maxWidth: 90, _ft: false, sortable: true,
    valueGetter: (p) => Number(p.data?.price?.['48']?.deposit || 0),
    valueFormatter: (p) => p.value ? `${Number(p.value).toLocaleString('ko-KR')}` : '-',
    comparator: (a, b) => (Number(a) || 0) - (Number(b) || 0) },
  { field: '_date', headerName: '반영일자', minWidth: 72, maxWidth: 84, _ft: 'set', sort: 'desc', sortable: true,
    valueGetter: (p) => formatShortDate(p.data?.updated_at || p.data?.created_at) },
];

const gridOptions = {
  columnDefs: AG_COL_DEFS,
  rowData: [],
  rowSelection: { mode: 'singleRow', enableClickSelection: true, checkboxes: false },
  animateRows: true,
  suppressCellFocus: true,
  suppressMenuHide: true,
  overlayNoRowsTemplate: '<div style="padding:40px;color:#94a3b8;">등록된 상품이 없습니다.</div>',
  defaultColDef: {
    sortable: false,
    resizable: true,
    suppressMovable: true,
    suppressHeaderMenuButton: true,
    cellStyle: { fontSize: '12px', display: 'flex', alignItems: 'center' },
  },
  getRowId: (params) => params.data?.product_uid || params.data?.product_code || '',
  onRowClicked: async (event) => {
    const product = event.data;
    if (!product) return;
    const currentCode = editingCodeInput?.value || '';
    const nextCode = product.product_uid || product.product_code || '';
    if (currentCode && currentCode === nextCode && mode === 'view') {
      resetForm(); applyFormMode('idle'); return;
    }
    if ((mode === 'edit' || mode === 'create') && !await showConfirm('수정/등록을 중단하시겠습니까?\n저장하지 않은 내용은 사라집니다.')) return;
    resetForm();
    fillProductForm(product, { ...adapterContext, currentProfile });
  },
};

// ── 외부 필터 상태 ──
const _colFilters = {}; // { field: Set of selected values }
let _allGridProducts = [];

// 특정 필드를 제외한 나머지 필터만 적용 (종속 필터용)
function getFilteredProductsExcept(excludeField) {
  let items = _allGridProducts;
  for (const [field, filterVal] of Object.entries(_colFilters)) {
    if (field === excludeField || !filterVal) continue;
    const col = AG_COL_DEFS.find(c => c.field === field);
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

function getFilteredProducts() {
  let items = _allGridProducts;
  for (const [field, filterVal] of Object.entries(_colFilters)) {
    if (!filterVal) continue;
    const col = AG_COL_DEFS.find(c => c.field === field);
    if (!col) continue;
    if (typeof filterVal === 'string') {
      // 텍스트 검색
      const q = filterVal.toLowerCase();
      items = items.filter(p => getColValue(col, p).toLowerCase().includes(q));
    } else if (filterVal?.type === 'range' && filterVal.ranges) {
      // 구간 필터
      items = items.filter(p => {
        const v = Number(p[field] || 0);
        return filterVal.ranges.some(r => v >= r.min && v < r.max);
      });
    } else if (filterVal instanceof Set && filterVal.size) {
      // 체크박스 Set
      items = items.filter(p => filterVal.has(getColValue(col, p)));
    }
  }
  return items;
}

function applyGridFilters() {
  const filtered = getFilteredProducts();
  if (gridApi) gridApi.setGridOption('rowData', filtered);
  syncTopBarPageCount(filtered.length);
  // 헤더에 필터 활성 표시 + 건수 뱃지
  requestAnimationFrame(() => {
    document.querySelectorAll('#product-ag-grid .ag-header-cell').forEach(cell => {
      const colId = cell.getAttribute('col-id');
      const filterVal = _colFilters[colId];
      const isActive = filterVal instanceof Set ? filterVal.size > 0 : filterVal?.type === 'range' ? true : !!filterVal;
      cell.classList.toggle('ag-header-cell-filtered', isActive);
      // 뱃지 업데이트
      let badge = cell.querySelector('.ag-filter-badge');
      if (isActive) {
        const count = filterVal instanceof Set ? filterVal.size : 1;
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'ag-filter-badge';
          cell.querySelector('.ag-header-cell-label')?.appendChild(badge);
        }
        badge.textContent = count;
      } else if (badge) {
        badge.remove();
      }
    });
  });
}

// ── 헤더 클릭 → 커스텀 필터 드롭다운 ──
let _filterPopup = null;
function removeFilterPopup() { if (_filterPopup) { _filterPopup.remove(); _filterPopup = null; } }
document.addEventListener('pointerdown', (e) => { if (_filterPopup && !_filterPopup.contains(e.target)) removeFilterPopup(); }, true);

function getColValue(colDef, p) {
  if (colDef.valueGetter) return String(colDef.valueGetter({ data: p }) || '');
  return String(p[colDef.field] || '');
}

function onGridHeaderClick(e) {
  const headerEl = e.target.closest('.ag-header-cell');
  if (!headerEl) return;
  const colId = headerEl.getAttribute('col-id');
  if (!colId) return;
  const colDef = AG_COL_DEFS.find(c => c.field === colId);
  if (!colDef || !colDef._ft) return;

  removeFilterPopup();
  const rect = headerEl.getBoundingClientRect();
  const field = colDef.field;
  const fType = colDef._ft;

  const popup = document.createElement('div');
  popup.className = 'pm-ctx-menu';
  popup.style.cssText = `position:fixed;top:${rect.bottom + 2}px;left:${rect.left}px;z-index:9999;min-width:${Math.max(rect.width, 160)}px;max-height:360px;display:flex;flex-direction:column;padding:0;`;

  if (fType === 'search') {
    // ── 텍스트 검색 필터 ──
    const currentQuery = _colFilters[field] || '';
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
    input?.focus();
    input?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { popup.querySelector('[data-action="apply"]')?.click(); }
    });
    popup.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
      delete _colFilters[field];
      applyGridFilters();
      removeFilterPopup();
    });
    popup.querySelector('[data-action="apply"]')?.addEventListener('click', () => {
      const q = input?.value?.trim() || '';
      if (q) { _colFilters[field] = q; } else { delete _colFilters[field]; }
      applyGridFilters();
      removeFilterPopup();
    });

  } else if (fType === 'range') {
    // ── 구간 필터 (주행거리 등) ──
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
    // 종속 데이터에서 각 구간 건수
    const otherFiltered = getFilteredProductsExcept(field);
    const rangeCounts = MILEAGE_RANGES.map(r => {
      const cnt = otherFiltered.filter(p => {
        const v = Number(p[field] || 0);
        return v >= r.min && v < r.max;
      }).length;
      return { ...r, cnt };
    }).filter(r => r.cnt > 0);

    const currentSelected = _colFilters[field] || null;

    popup.innerHTML = `
      <div style="flex:1;overflow:auto;padding:6px 0;">
        ${rangeCounts.map((r, i) => {
          const checked = currentSelected?.has(String(i)) ? 'checked' : '';
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
    // 즉시 적용
    popup.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const checked = [...popup.querySelectorAll('input[type="checkbox"]:checked')];
        if (checked.length === 0) {
          delete _colFilters[field];
        } else {
          // 선택된 구간 범위를 저장
          const ranges = checked.map(c => ({ min: Number(c.dataset.min), max: Number(c.dataset.max) }));
          _colFilters[field] = { type: 'range', ranges, indices: new Set(checked.map(c => c.value)) };
        }
        applyGridFilters();
      });
    });
    popup.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
      delete _colFilters[field];
      applyGridFilters();
      removeFilterPopup();
    });

  } else {
    // ── 체크박스 Set 필터 ──
    // 다른 필터가 적용된 상태에서의 종속 데이터로 건수 계산
    const otherFiltered = getFilteredProductsExcept(field);
    const countMap = {};
    otherFiltered.forEach(p => {
      const v = getColValue(colDef, p);
      if (v) countMap[v] = (countMap[v] || 0) + 1;
    });
    const sorted = Object.entries(countMap).sort((a, b) => b[1] - a[1]);
    const currentSelected = _colFilters[field] || null;

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
    // 체크 즉시 적용
    popup.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const checked = [...popup.querySelectorAll('input[type="checkbox"]:checked')].map(c => c.value);
        if (checked.length === 0) {
          delete _colFilters[field];
        } else {
          _colFilters[field] = new Set(checked);
        }
        applyGridFilters();
      });
    });
    popup.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
      delete _colFilters[field];
      applyGridFilters();
      removeFilterPopup();
    });
  }

  document.body.appendChild(popup);
  _filterPopup = popup;

  requestAnimationFrame(() => {
    const pr = popup.getBoundingClientRect();
    if (pr.right > window.innerWidth) popup.style.left = `${window.innerWidth - pr.width - 8}px`;
    if (pr.bottom > window.innerHeight) popup.style.top = `${rect.top - pr.height - 2}px`;
  });
}

function initGrid() {
  if (!gridContainer || gridApi) return;
  gridApi = createGrid(gridContainer, gridOptions);
  gridApi.sizeColumnsToFit();
  window.addEventListener('resize', () => gridApi?.sizeColumnsToFit());
  // 헤더 클릭 → 필터 드롭다운 (리사이즈 핸들 제외)
  gridContainer.addEventListener('click', (e) => {
    if (e.target.closest('.ag-header-cell-resize')) return;
    if (e.target.closest('.ag-header-cell')) onGridHeaderClick(e);
  });
  // 우클릭 메뉴
  gridContainer.addEventListener('contextmenu', onGridContextMenu);
}

function renderList(products) {
  if (!gridApi) initGrid();
  _allGridProducts = products;
  const filtered = getFilteredProducts();
  syncTopBarPageCount(filtered.length);
  if (gridApi) {
    gridApi.setGridOption('rowData', filtered);
    requestAnimationFrame(() => gridApi?.sizeColumnsToFit());
  }
  syncSelectedSummaryRow();
}


// ─── 우클릭 컨텍스트 메뉴 (정보수정 / 상태변경 / 등록삭제) ──────────
const VEHICLE_STATUS_OPTIONS = ['출고가능', '출고협의', '출고불가', '계약대기', '계약완료'];
let _ctxMenu = null;
function removeCtxMenu() { if (_ctxMenu) { _ctxMenu.style.display = 'none'; _ctxMenu.remove(); _ctxMenu = null; } }
document.addEventListener('pointerdown', (e) => { if (_ctxMenu && !_ctxMenu.contains(e.target)) removeCtxMenu(); }, true);
document.addEventListener('scroll', removeCtxMenu, true);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') removeCtxMenu(); });

function onGridContextMenu(e) {
  const rowEl = e.target.closest('.ag-row');
  if (!rowEl) return;
  e.preventDefault();
  removeCtxMenu();
  const rowId = rowEl.getAttribute('row-id');
  if (!rowId || !gridApi) return;
  const rowNode = gridApi.getRowNode(rowId);
  const product = rowNode?.data;
  if (!product) return;
  const productKey = product.product_uid || product.product_code;

  const menu = document.createElement('div');
  menu.className = 'pm-ctx-menu';
  menu.innerHTML = `
    <button type="button" class="pm-ctx-item" data-action="edit">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>
      정보수정
    </button>
    <div class="pm-ctx-sub">
      <button type="button" class="pm-ctx-item pm-ctx-item--parent">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
        상태변경
        <svg class="pm-ctx-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
      </button>
      <div class="pm-ctx-submenu">
        ${VEHICLE_STATUS_OPTIONS.map(s =>
          `<button type="button" class="pm-ctx-item" data-action="status" data-status="${escapeHtml(s)}">${escapeHtml(s)}</button>`
        ).join('')}
      </div>
    </div>
    <div class="pm-ctx-divider"></div>
    <button type="button" class="pm-ctx-item pm-ctx-item--danger" data-action="delete">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
      등록삭제
    </button>
  `;
  document.body.appendChild(menu);
  _ctxMenu = menu;
  // 위치
  menu.style.cssText = `position:fixed;top:${e.clientY}px;left:${e.clientX}px;z-index:9999;`;
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 8}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 8}px`;
  });

  // 이벤트
  menu.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'edit') {
      removeCtxMenu();
      if (product) {
        fillProductForm(product, { ...adapterContext, currentProfile });
        requestAnimationFrame(() => applyFormMode('edit'));
      }
    }
    if (action === 'status') {
      removeCtxMenu();
      try {
        await updateProduct(productKey, { vehicle_status: btn.dataset.status });
        showToast(`차량상태 → ${btn.dataset.status}`, 'success');
      } catch (err) {
        showToast('상태 변경 실패: ' + (err.message || err), 'error');
      }
    }
    if (action === 'delete') {
      removeCtxMenu();
      if (!await showConfirm('이 상품을 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.')) return;
      try {
        await deleteProduct(productKey);
        showToast('삭제 완료', 'success');
        resetForm();
        applyFormMode('idle');
      } catch (err) {
        showToast('삭제 실패: ' + (err.message || err), 'error');
      }
    }
  });
}

async function handleSubmit() {
  setActionButtonBusy(submitButton);
  setActionButtonBusy(deleteButton);
  try {
    if (getImagePrepareActiveCount() > 0) {
      setStatus('사진 준비중입니다.', 'progress');
      await waitForPaint();
    }
    await getImagePrepareQueue();

    const selectedFiles = getPendingFiles();
  let imageUrls = getStoredImageUrls();
  let imageUploadWarning = '';
  let imageDeleteWarning = '';
  const queuedRemovedUrls = getQueuedStoredImageRemovalUrls();

  if (selectedFiles.length) {
    setStatus('사진 업로드중입니다.', 'progress');
    const { urls: uploadedUrls, failedFiles } = await uploadProductImagesDetailed(selectedFiles, currentProfile?.uid, {
      concurrency: SAVE_UPLOAD_CONCURRENCY,
      onProgress: ({ completed, total, phase }) => {
        if (!message) return;
        if (phase === 'start') {
          setStatus('사진 업로드중입니다.', 'progress');
          return;
        }
        if (phase === 'done') {
          setStatus('사진 업로드중입니다.', 'progress');
          return;
        }
        if (completed < total) {
          setStatus('사진 업로드중입니다.', 'progress');
        }
      }
    });
    if (!uploadedUrls.length && failedFiles.length) {
      const failedNames = failedFiles.map((item) => item.file).filter(Boolean).join(', ');
      throw new Error(failedNames ? `사진 업로드 실패: ${failedNames}` : '사진 업로드에 실패했습니다.');
    }
    imageUrls = dedupeImageUrls([...imageUrls, ...uploadedUrls]);
    setStoredImageUrls(imageUrls);
    if (failedFiles.length) {
      const failedNames = failedFiles.map((item) => item.file).filter(Boolean).join(', ');
      imageUploadWarning = failedNames ? ` · 일부 사진 제외: ${failedNames}` : ' · 일부 사진 제외';
    }
  }

  setStatus(editingCodeInput.value.trim() ? '수정 저장중입니다.' : '저장중입니다.', 'progress');
  await waitForPaint();

  const payload = buildProductPayload({ ...adapterContext, currentProfile });
  payload.image_urls = imageUrls;
  payload.image_url = imageUrls[0] || '';
  payload.image_count = imageUrls.length;

  const validationErrors = validateProduct(payload);
  if (validationErrors.length) {
    throw new Error(validationErrors[0]);
  }

  const editingCode = editingCodeInput.value.trim();
  let result;
  if (!editingCode) {
    result = await saveProduct(payload);
  } else {
    result = await updateProduct(editingCode, payload);
  }

  if (queuedRemovedUrls.length) {
    const { failedUrls } = await deleteProductImagesByUrls(queuedRemovedUrls);
    if (failedUrls.length) {
      imageDeleteWarning = ' · Storage 사진 일부 삭제 실패';
    }
  }
  clearRemovedStoredImageUrls();

  lastSelectedProductCode = result.productUid;
  editingCodeInput.value = result.productUid;
  setProductCodeDisplay(result.productCode);
  deleteButton.disabled = false;
  applyFormMode('view');
  setStatus(imageUploadWarning || imageDeleteWarning ? '저장되었습니다. 일부 사진은 확인이 필요합니다.' : '저장되었습니다.', 'success');
  renderFilteredList();

  clearPendingFiles();
  renderCurrentPreview();
  } finally {
    restoreActionButton(submitButton);
    syncSubmitButtonState(mode);
    restoreActionButton(deleteButton);
    deleteButton.disabled = mode === 'create';
  }
}

async function handleDelete() {
  setActionButtonBusy(deleteButton);
  try {
    const editingCode = editingCodeInput.value.trim();
  if (!editingCode) {
    setStatus('삭제할 상품을 먼저 선택하세요.', 'info');
    return;
  }
  if (!await showConfirm(`선택한 상품 ${editingCode} 를 삭제할까요?`)) return;
  const deletingImageUrls = getStoredImageUrls();
  await deleteProduct(editingCode);
  const { failedUrls } = await deleteProductImagesByUrls(deletingImageUrls);
  const deleteStatusText = failedUrls.length
    ? '삭제되었습니다. Storage 사진 일부는 확인이 필요합니다.'
    : '삭제되었습니다.';
  const deleteStatusTone = failedUrls.length ? 'error' : 'success';
  lastSelectedProductCode = '';
  resetForm();
  setStatus(deleteStatusText, deleteStatusTone);
  } finally {
    restoreActionButton(deleteButton);
    deleteButton.disabled = mode === 'create';
  }
}

async function bootstrap() {
  _bootDone = false;
  try {
    const { user, profile } = await requireAuth({ roles: ['provider', 'admin'] });
    if (productManageInitErrors.length) {
      const firstInitError = productManageInitErrors[0];
      throw new Error(`${firstInitError.label} 초기화 실패: ${firstInitError.error?.message || '알 수 없는 오류'}`);
    }
    currentProfile = { ...profile, uid: user.uid };
    pageState.currentProfile = currentProfile;
    renderRoleMenu(menu, profile.role);

    resetButton?.addEventListener('click', () => { resetForm(); showToast('신규 등록 상태입니다.', 'info'); });
    filterToggleButton?.addEventListener('click', () => {
      const isOpen = filterOverlay?.classList.contains('is-open');
      setFilterOverlay(!isOpen);
    });
    filterResetButton?.addEventListener('click', resetFilters);
    filterCloseButton?.addEventListener('click', () => setFilterOverlay(false));
    bindSearchInput();
    submitButton?.addEventListener('click', async () => {
      if (mode === 'view' && editingCodeInput.value.trim()) {
        if (!await showConfirm('수정하시겠습니까?')) return;
        applyFormMode('edit');
        return;
      }
      if (!await showConfirm('저장하시겠습니까?')) return;
      form.requestSubmit();
    });
    deleteButton?.addEventListener('click', async () => {
      try {
        await handleDelete();
      } catch (error) {
        setStatus(`삭제 실패: ${error.message}`, 'error');
      }
    });
    imageInput?.addEventListener('change', () => imageManager.renderSelectedFiles(imageInput.files));
    getField('car_number')?.addEventListener('input', syncProductCodePreview);
    getField('car_number')?.addEventListener('change', syncProductCodePreview);
    previewList?.addEventListener('click', (event) => {
      const actionButton = event.target?.closest?.('[data-preview-source][data-preview-index][data-preview-action]');
      if (actionButton) {
        if (mode === 'view') return;
        const source = actionButton.dataset.previewSource;
        const index = Number(actionButton.dataset.previewIndex);
        const action = actionButton.dataset.previewAction;
        if (!Number.isInteger(index) || index < 0) return;
        if (action === 'set-main') {
          if (source === 'stored') {
            moveStoredImageToFront(index);
          } else if (source === 'pending') {
            movePendingFileToFront(index);
          } else {
            return;
          }
          renderCurrentPreview();
          setStatus('대표사진이 변경되었습니다.', 'info');
          return;
        }
        if (action !== 'remove') return;
        if (source === 'stored') {
          removeStoredImageAt(index);
        } else if (source === 'pending') {
          removePendingFileAt(index);
        } else {
          return;
        }
        renderCurrentPreview();
        const storedCount = getStoredImageUrls().length;
        const pendingCount = getPendingFiles().length;
        const totalCount = storedCount + pendingCount;
        setStatus(totalCount ? `사진 ${totalCount}장 준비됨` : '등록된 사진이 없습니다.', totalCount ? 'info' : 'info');
        return;
      }

      const openButton = event.target?.closest?.('[data-preview-open][data-preview-entry-index]');
      if (!openButton) return;
      const entryIndex = Number(openButton.dataset.previewEntryIndex);
      if (!Number.isInteger(entryIndex) || entryIndex < 0) return;
      openImageViewer(entryIndex);
    });
    uploadDropzone?.addEventListener('dragover', (event) => {
      if (mode === 'view') return;
      event.preventDefault();
      uploadDropzone.classList.add('is-dragover');
    });
    uploadDropzone?.addEventListener('dragleave', () => uploadDropzone.classList.remove('is-dragover'));
    uploadDropzone?.addEventListener('drop', (event) => {
      if (mode === 'view') return;
      event.preventDefault();
      uploadDropzone.classList.remove('is-dragover');
      imageManager.renderSelectedFiles(event.dataTransfer?.files || []);
    });
    previewClearButton?.addEventListener('click', clearAllImages);
    sheetApplyButton?.addEventListener('click', async () => {
      try {
        if (!sheetImporter) throw new Error('시트 반영 모듈이 아직 준비되지 않았습니다.');

        // 1단계: 검증
        setStatus('구글시트 검증 중...', 'progress');
        const { results, warnings, dupCount, newCount, totalRows } = await sheetImporter.validate(sheetUrlInput?.value || '');

        // 2단계: 미리보기 + 중복 처리
        const sheetCount = results.length;
        const preview = results.map(r => `• ${r.rowCount}건 (${r.carNumbers.slice(0, 3).join(', ')}${r.rowCount > 3 ? ' ...' : ''})`).join('\n');
        let skipDuplicates = false;

        if (dupCount > 0) {
          const warningText = warnings.length ? '\n\n' + warnings.join('\n') : '';
          const dupConfirm = await showConfirm(
            `총 ${totalRows}건 중 ${dupCount}건 중복\n\n` +
            `중복 제외 ${newCount}건만 반영할까요?\n` +
            `(취소 시 전체 ${totalRows}건 반영 여부를 다시 묻습니다)${warningText}`
          );
          if (dupConfirm) {
            skipDuplicates = true;
          } else {
            const allConfirm = await showConfirm(`중복 포함 전체 ${totalRows}건을 반영할까요?\n\n${preview}`);
            if (!allConfirm) { setStatus('반영 취소', 'info'); return; }
          }
        } else {
          const confirmed = await showConfirm(`구글시트 ${sheetCount}개, 총 ${totalRows}건을 반영할까요?\n\n${preview}`);
          if (!confirmed) { setStatus('반영 취소', 'info'); return; }
        }

        // 3단계: 반영
        setStatus('구글시트 반영 중...', 'progress');
        await sheetImporter.apply(results, { skipDuplicates });
      } catch (error) {
        setStatus(`반영 실패: ${error.message}`, 'error');
      }
    });

    document.addEventListener('keydown', handleImageViewerKeydown);

    setDirtyCheck(() => mode === 'edit');

    // 페이지 떠날 때 선택 상태 저장
    registerPageCleanup(() => {
      clearDirtyCheck();
      savePageState('/product-new', {
        selectedCode: editingCodeInput.value || lastSelectedProductCode || '',
        scrollTop: listBody?.scrollTop || 0
      });
      document.removeEventListener('keydown', handleImageViewerKeydown);
      closeImageViewer();
      cleanupImageManager();
    });

    // 이전 페이지 상태 복원 (뒤로가기 시)
    const restoredState = loadPageState('/product-new');

    initGrid();
    registerPageCleanup(watchProducts((products) => {
      allProducts = profile.role === 'admin'
        ? [...products]
        : products.filter((item) => (item.partner_code || item.provider_company_code) === profile.company_code);
      refreshVehicleSpecSelects();
      renderFilterAccordion();
      renderFilteredList();
      // 부트스트랩 완료 전에는 폼 복원 스킵 (셀렉트 옵션 미준비)
      if (!_bootDone) return;
      if (mode === 'edit') return; // 수정 중 Firebase 업데이트로 폼 초기화 방지
      // 복원된 코드가 있으면 우선 사용, 그 다음 현재 선택 코드
      const selectedCode = editingCodeInput.value || lastSelectedProductCode || '';
      if (selectedCode) {
        const selected = allProducts.find((item) => (item.product_uid || item.product_code) === selectedCode);
        if (selected) fillProductForm(selected, { ...adapterContext, currentProfile });
      }
    }));

    registerPageCleanup(watchVehicleMaster((payload) => {
      vehicleMasterEntries = payload?.items || [];
      refreshVehicleSpecSelects();
    }));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await handleSubmit();
      } catch (error) {
        setStatus(`저장 실패: ${error.message}`, 'error');
      }
    });

    form.addEventListener('focusin', (event) => {
      const target = event.target;
      if (mode !== 'view') return;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
      target.blur();
    });

    bindCodeSelects();
    bindPartnerCodeSelect();
    bindPolicyCodeSelect();
    bindVehicleSpecLinks();
    bindMoneyInputs();
    bindDateInputs();
    renderYearSelectOptions();
    syncLinkedVehicleClass({}, { fallbackValue: '' });
    renderFilterAccordion();
    setFilterOverlay(false);
    resetForm();
    applyFormMode('idle');
    _bootDone = true;

    // 부트스트랩 완료 후 1회 선택 복원 (셀렉트 옵션이 모두 준비된 시점)
    const restoreCode = restoredState?.selectedCode || '';
    if (restoreCode) {
      const restoreTarget = allProducts.find((item) => (item.product_uid || item.product_code) === restoreCode);
      if (restoreTarget) fillProductForm(restoreTarget, { ...adapterContext, currentProfile });
    }
    if (restoredState?.scrollTop && listBody) {
      requestAnimationFrame(() => { listBody.scrollTop = restoredState.scrollTop; });
    }
  } catch (error) {
    console.error(error);
    const detail = error?.message ? `재고관리 초기화 실패: ${error.message}` : '재고관리 초기화 실패';
    setStatus(detail, 'error');
    if (listBody) {
      listBody.innerHTML = `<div class="management-empty">${escapeHtml(detail)}</div>`;
    }
  }
}

let _mounted = false;
export async function mount() {
  bindDOM();
  _mounted = false;
  await bootstrap();
  _mounted = true;
}
export function unmount() {
  runPageCleanup();
  _mounted = false;
}
export function onShow() {
  setDirtyCheck(() => mode === 'edit');
}
// Auto-mount on first script load (server-rendered page)
if (!import.meta.url.includes('?')) mount();