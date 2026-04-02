import { requireAuth } from '../core/auth-guard.js';
import { qs, registerPageCleanup, runPageCleanup } from '../core/utils.js';
import { setDirtyCheck, clearDirtyCheck } from '../app.js';
import { syncEditSaveButtonTone , syncTopBarPageCount } from '../core/management-skeleton.js';
import { setSelectionUiClass } from '../core/ui-standards.js';
import { escapeHtml, formatShortDate, formatYearMonth } from '../core/management-format.js';
import { createProductFormModeController } from './product-manage/form-mode.js';
import { renderTableGrid, renderSkeletonRows } from '../core/management-list.js';
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
  const selectedCode = String(editingCodeInput?.value || '').trim();
  listBody?.querySelectorAll('.summary-row').forEach((row) => {
    const rowKey = row.dataset.managementKey || row.dataset.code || '';
    setSummaryRowSelected(row, selectedCode && rowKey === selectedCode);
  });
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
let applyGoogleSheetImport = null;

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

applyGoogleSheetImport = createGoogleSheetImporter({
  importAllowedFields: IMPORT_ALLOWED_FIELDS,
  fieldNumbers: FIELD_NUMBERS,
  getLinkedVehicleClass,
  normalizeDateText,
  inferYearFromDateText,
  buildBasePayload: () => buildProductPayload({ ...adapterContext, currentProfile: currentProfile || null }),
  getPartnerNameByCode,
  currentProfile: () => currentProfile,
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

const PRODUCT_REG_COLS = [
  { key: 'vehicleStatus', label: '차량상태',   align: 'c', filterable: true, w: 80 },
  { key: 'productType',   label: '상품구분',   align: 'c', filterable: true, w: 80 },
  { key: 'partner',       label: '공급사코드', align: 'c', filterable: true },
  { key: 'carNo',         label: '차량번호',   align: 'c', searchable: true },
  { key: 'maker',         label: '제조사',     align: 'c', filterable: true },
  { key: 'model',         label: '모델',       align: 'c', filterable: true },
  { key: 'subModel',      label: '세부모델',   searchable: true },
  { key: 'fuel',          label: '연료',       align: 'c', filterable: true },
  { key: 'mileage',       label: '주행거리',   align: 'c', filterable: true },
  { key: 'date',          label: '반영일자',   align: 'c', filterable: true },
];
const productRegThead = qs('#product-register-list-head');

function renderList(products) {
  syncTopBarPageCount(products.length);
  renderTableGrid({
    thead: productRegThead,
    tbody: listBody,
    columns: PRODUCT_REG_COLS,
    items: products,
    emptyText: '등록된 상품이 없습니다.',
    selectedKey: editingCodeInput?.value || '',
    getKey: (item) => item?.product_uid || item?.product_code || '',
    onSelect: async (product) => {
      if (mode === 'edit' && !await showConfirm('수정/등록을 중단하시겠습니까?\n저장하지 않은 내용은 사라집니다.')) return;
      if (product) fillProductForm(product, { ...adapterContext, currentProfile });
    },
    getCellValue: (col, p) => {
      switch (col.key) {
        case 'vehicleStatus': return renderBadgeRow([{ field: 'vehicle_status', value: p.vehicle_status || '-' }]);
        case 'productType': return renderBadgeRow([{ field: 'product_type', value: p.product_type || '-' }]);
        case 'partner': return escapeHtml(p.partner_code || p.provider_company_code || '');
        case 'carNo': return escapeHtml(p.car_number || '');
        case 'maker': return escapeHtml(p.maker || '');
        case 'model': return escapeHtml(p.model_name || '');
        case 'subModel': return escapeHtml(p.sub_model || '');
        case 'fuel': return escapeHtml(p.fuel_type || '');
        case 'mileage': { const v = Number(p.mileage || 0); return v ? `${v.toLocaleString('ko-KR')}km` : '-'; }
        case 'date': return escapeHtml(formatShortDate(p.updated_at || p.created_at));
        default: return '';
      }
    },
    getCellText: (col, p) => {
      switch (col.key) {
        case 'vehicleStatus': return p.vehicle_status || '-';
        case 'productType': return p.product_type || '-';
        case 'partner': return p.partner_code || p.provider_company_code || '';
        case 'carNo': return p.car_number || '';
        case 'maker': return p.maker || '';
        case 'model': return p.model_name || '';
        case 'subModel': return p.sub_model || '';
        case 'fuel': return p.fuel_type || '';
        case 'mileage': return mileageBucketLabel(p.mileage);
        case 'date': return formatYearMonth(p.updated_at || p.created_at);
        default: return '';
      }
    }
  });
  syncSelectedSummaryRow();
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
        if (typeof applyGoogleSheetImport !== 'function') throw new Error('시트 반영 모듈이 아직 준비되지 않았습니다.');
        await applyGoogleSheetImport(sheetUrlInput?.value || '');
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

    renderSkeletonRows(listBody, PRODUCT_REG_COLS, 8);
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