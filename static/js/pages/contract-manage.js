import { requireAuth } from '../core/auth-guard.js';
import { qs, registerPageCleanup, runPageCleanup, formatMoney } from '../core/utils.js';
import { setDirtyCheck, clearDirtyCheck } from '../app.js';
import { applyManagementButtonTones, bindFilterOverlayToggle, createManagedFormModeApplier , syncTopBarPageCount } from '../core/management-skeleton.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { renderBadgeRow } from '../shared/badge.js';
import { showToast, showConfirm } from '../core/toast.js';
import { validateContract } from '../core/validators.js';
import { savePageState, loadPageState } from '../core/page-state.js';

const _t = new URL(import.meta.url).searchParams.get('t') || '';
const { uploadContractFilesDetailed, deleteProductImagesByUrls } = await import(`../firebase/firebase-storage.js${_t ? `?t=${_t}` : ''}`);

import { saveContract, updateContract, deleteContract, fetchContractsOnce, watchContracts, getProduct, ensureRoom } from '../firebase/firebase-db.js';
import { formatShortDate, formatYearMonth } from '../core/management-format.js';
import { renderTableGrid, renderSkeletonRows } from '../core/management-list.js';
import { escapeHtml } from '../core/management-format.js';
import { createContractDocsController } from './contract-manage/docs.js';
import { formatContractCodeDisplay, parseMoneyValue, ensureSelectValue, buildVehicleName, buildVehicleDetail, deriveVehicleDisplayName, deriveSubModelDisplay, deriveAgentChannelCode, normalizeRentMonth, resolveTermPricing, seedToPayload, buildContractListTrailing } from './contract-manage/helpers.js';

let menu = qs('#sidebar-menu');
let listBody = qs('#contract-list');
let message = qs('#contract-message');
let filterToggleButton = qs('#openContractFilterBtn');
let filterOverlay = qs('#contractFilterOverlay');
let resetButton = null;
let saveButton = qs('#contract-submit-head');
let deleteButton = qs('#contract-delete-head');
let chatButton = qs('#contract-chat-btn');

applyManagementButtonTones({ resetButtons: [resetButton], submitButtons: [saveButton], deleteButtons: [deleteButton] });

let formMode = qs('#contract-form_mode');
let contractCodeHidden = qs('#contract_code_hidden');
let docInput = qs('#contract_docs');
let docDropzone = qs('#contract-doc-dropzone');
let docList = qs('#contract-doc-list');
let docSummary = qs('#contract-doc-summary');
let docClearButton = qs('#contract-doc-clear');

let fields = {
  contract_code: qs('#contract_code'),
  contract_status: qs('#contract_status'),
  partner_code: qs('#partner_code'),
  agent_code: qs('#agent_code'),
  policy_code: qs('#policy_code'),
  product_code: qs('#product_code'),
  car_number: qs('#car_number'),
  vehicle_name: qs('#vehicle_name'),
  rent_month: qs('#rent_month'),
  rent_amount: qs('#rent_amount'),
  deposit_amount: qs('#deposit_amount'),
  customer_name: qs('#customer_name'),
  customer_birth: qs('#customer_birth'),
  customer_phone: qs('#customer_phone'),
  deposit_confirmed: qs('#deposit_confirmed'),
  docs_confirmed: qs('#docs_confirmed'),
  approval_confirmed: qs('#approval_confirmed'),
  contract_confirmed: qs('#contract_confirmed'),
  balance_confirmed: qs('#balance_confirmed'),
  delivery_confirmed: qs('#delivery_confirmed')
};

function bindDOM() {
  menu = qs('#sidebar-menu');
  listBody = qs('#contract-list');
  message = qs('#contract-message');
  filterToggleButton = qs('#openContractFilterBtn');
  filterOverlay = qs('#contractFilterOverlay');
  resetButton = null;
  saveButton = qs('#contract-submit-head');
  deleteButton = qs('#contract-delete-head');
  chatButton = qs('#contract-chat-btn');
  formMode = qs('#contract-form_mode');
  contractCodeHidden = qs('#contract_code_hidden');
  docInput = qs('#contract_docs');
  docDropzone = qs('#contract-doc-dropzone');
  docList = qs('#contract-doc-list');
  docSummary = qs('#contract-doc-summary');
  docClearButton = qs('#contract-doc-clear');
  fields = {
    contract_code: qs('#contract_code'),
    contract_status: qs('#contract_status'),
    partner_code: qs('#partner_code'),
    agent_code: qs('#agent_code'),
    policy_code: qs('#policy_code'),
    product_code: qs('#product_code'),
    car_number: qs('#car_number'),
    vehicle_name: qs('#vehicle_name'),
    rent_month: qs('#rent_month'),
    rent_amount: qs('#rent_amount'),
    deposit_amount: qs('#deposit_amount'),
    customer_name: qs('#customer_name'),
    customer_birth: qs('#customer_birth'),
    customer_phone: qs('#customer_phone'),
    deposit_confirmed: qs('#deposit_confirmed'),
    docs_confirmed: qs('#docs_confirmed'),
    approval_confirmed: qs('#approval_confirmed'),
    contract_confirmed: qs('#contract_confirmed'),
    balance_confirmed: qs('#balance_confirmed'),
    delivery_confirmed: qs('#delivery_confirmed')
  };
}

const CHECK_FIELD_KEYS = ['deposit_confirmed', 'docs_confirmed', 'approval_confirmed', 'contract_confirmed', 'balance_confirmed', 'delivery_confirmed'];
const CUSTOMER_FIELD_KEYS = ['customer_name', 'customer_birth', 'customer_phone'];
const productCache = new Map();

let currentProfile = null;
let allContracts = [];
let currentContract = null;
let mode = 'create';

const docsController = createContractDocsController({
  input: docInput,
  dropzone: docDropzone,
  list: docList,
  summary: docSummary,
  clearButton: docClearButton,
  getMode: () => mode
});




const applyContractFormMode = createManagedFormModeApplier({
  form: qs('#contract-form'),
  panelLabel: '계약',
  getIdentity: () => currentContract?.contract_code || contractCodeHidden.value || fields.contract_code?.value || '',
  isSelected: () => Boolean(contractCodeHidden.value || currentContract?.contract_code),
  submitButtons: [saveButton],
  deleteButtons: [deleteButton],
  defaultOptions: {
    alwaysReadOnlyIds: ['contract_code', 'partner_code', 'agent_code', 'car_number', 'vehicle_name'],
    customDisable: (field, context) => {
      const key = Object.entries(fields).find(([, node]) => node === field)?.[0] || '';
      if (['contract_status', 'rent_month'].includes(key)) return context.isView;
      if (CHECK_FIELD_KEYS.includes(key)) return context.isView;
      return false;
    }
  }
});


function setMode(nextMode) {
  mode = nextMode;
  if (formMode) formMode.value = nextMode;
  const isIdle = nextMode === 'idle';
  const isCreate = nextMode === 'create';
  const isView = nextMode === 'view';
  const canDelete = !isCreate && !isIdle && (currentProfile?.role === 'provider' || currentProfile?.role === 'admin');

  applyContractFormMode(nextMode, { deleteEnabled: canDelete });
  if (chatButton) chatButton.disabled = isIdle || isCreate;

  if (!isIdle) saveButton.disabled = false;
  docsController.syncInteraction(!isView && !isIdle);
}


function resetForm() {
  currentContract = null;
  contractCodeHidden.value = '';
  docsController.reset();
  Object.entries(fields).forEach(([key, node]) => {
    if (!node) return;
    if (node.type === 'checkbox') node.checked = false;
    else node.value = '';
  });
  fields.contract_status.value = '계약대기';
  fields.rent_month.value = '';
  syncContractStatusByChecks();
  setMode('create');
  if (message) message.textContent = '';
  renderList();
}

async function loadLinkedProduct(contract = {}) {
  const productCode = String(contract.product_uid || contract.product_code || contract.seed_product_key || '').trim();
  if (!productCode) return null;
  if (productCache.has(productCode)) return productCache.get(productCode);
  try {
    const product = await getProduct(productCode);
    productCache.set(productCode, product || null);
    return product || null;
  } catch (error) {
    console.error(error);
    productCache.set(productCode, null);
    return null;
  }
}

async function populateRentMonthOptions(contract = {}) {
  const select = fields.rent_month;
  if (!select) return;
  // 기존 옵션 초기화 ("선택" 유지)
  select.innerHTML = '<option value="">선택</option>';
  const product = await loadLinkedProduct(contract);
  if (!product) return;
  // product.price 에서 기간 키 추출 (숫자만)
  const months = [];
  if (product.price && typeof product.price === 'object') {
    Object.keys(product.price).forEach((k) => {
      const m = Number(k);
      if (m > 0) months.push(m);
    });
  }
  // price 키가 없으면 rent_XX / deposit_XX 패턴 탐색
  if (!months.length) {
    Object.keys(product).forEach((k) => {
      const match = k.match(/^(?:rent|rental_price|deposit)_(\d+)$/);
      if (match) {
        const m = Number(match[1]);
        if (m > 0 && !months.includes(m)) months.push(m);
      }
    });
  }
  months.sort((a, b) => a - b);
  months.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = String(m);
    opt.textContent = `${m}개월`;
    select.appendChild(opt);
  });
}

async function applySelectedRentPlan(month, { silent = false } = {}) {
  const normalizedMonth = String(month || '').replace(/[^\d]/g, '');
  if (!normalizedMonth) return;

  const contract = currentContract || {
    product_code: fields.product_code.value,
    seed_product_key: fields.product_code.value
  };

  const product = await loadLinkedProduct(contract);
  const pricing = resolveTermPricing(product, normalizedMonth);
  if (!pricing) {
    if (!silent) showToast(`${normalizedMonth}개월 요금정보가 없습니다.`, 'info');
    return;
  }

  const rent = pricing.rent || 0;
  const deposit = pricing.deposit || 0;
  fields.rent_amount.value = formatMoney(rent);
  fields.rent_amount.dataset.origin = String(rent);
  fields.rent_amount.classList.remove('is-changed');
  fields.deposit_amount.value = formatMoney(deposit);
  fields.deposit_amount.dataset.origin = String(deposit);
  fields.deposit_amount.classList.remove('is-changed');
  // 라벨 갱신
  const rentLabel = fields.rent_amount.parentElement?.querySelector('label');
  if (rentLabel) rentLabel.textContent = rent ? `대여료 (기존금액 ${rent.toLocaleString('ko-KR')}원)` : '대여료';
  const depositLabel = fields.deposit_amount.parentElement?.querySelector('label');
  if (depositLabel) depositLabel.textContent = deposit ? `보증금 (기존금액 ${deposit.toLocaleString('ko-KR')}원)` : '보증금';
  if (!silent) showToast(`${normalizedMonth}개월 기준 대여료와 보증금을 반영했습니다.`, 'success');
}

async function fillForm(contract) {
  currentContract = contract;
  contractCodeHidden.value = contract.contract_code || '';
  fields.contract_code.value = formatContractCodeDisplay(contract.contract_code);
  ensureSelectValue(fields.contract_status, contract.contract_status || '계약대기');
  fields.contract_status.value = contract.contract_status || '계약대기';
  fields.partner_code.value = contract.partner_code || contract.provider_company_code || '';
  fields.agent_code.value = deriveAgentChannelCode(contract);
  fields.policy_code.value = contract.policy_code || '';
  fields.product_code.value = contract.product_uid || contract.product_code || contract.seed_product_key || '';
  fields.car_number.value = contract.car_number || '';
  fields.vehicle_name.value = deriveSubModelDisplay(contract) || deriveVehicleDisplayName(contract);
  await populateRentMonthOptions(contract);
  const rm = String(contract.rent_month || '').replace(/[^\d]/g, '');
  ensureSelectValue(fields.rent_month, rm);
  fields.rent_month.value = rm;

  // 상품 원래 가격 조회 → origin 기준
  const product = await loadLinkedProduct(contract);
  const pricing = resolveTermPricing(product, rm);
  const rentOrigin = Number(pricing?.rent || 0);
  const depositOrigin = Number(pricing?.deposit || 0);
  const rentActual = Number(contract.rent_amount || 0);
  const depositActual = Number(contract.deposit_amount || 0);

  fields.rent_amount.value = formatMoney(rentActual);
  fields.rent_amount.dataset.origin = String(rentOrigin);
  fields.deposit_amount.value = formatMoney(depositActual);
  fields.deposit_amount.dataset.origin = String(depositOrigin);

  const rentLabel = fields.rent_amount.parentElement?.querySelector('label');
  if (rentLabel) rentLabel.textContent = rentOrigin ? `대여료 (기존금액 ${rentOrigin.toLocaleString('ko-KR')}원)` : '대여료';
  const depositLabel = fields.deposit_amount.parentElement?.querySelector('label');
  if (depositLabel) depositLabel.textContent = depositOrigin ? `보증금 (기존금액 ${depositOrigin.toLocaleString('ko-KR')}원)` : '보증금';

  // 원래 값과 다르면 빨간색 유지 (보기모드에서도)
  fields.rent_amount.classList.toggle('is-changed', rentActual !== rentOrigin && rentOrigin > 0);
  fields.deposit_amount.classList.toggle('is-changed', depositActual !== depositOrigin && depositOrigin > 0);
  fields.customer_name.value = contract.customer_name || '';
  fields.customer_birth.value = contract.customer_birth || '';
  fields.customer_phone.value = contract.customer_phone || '';

  const checks = contract.checks || {};
  CHECK_FIELD_KEYS.forEach((key) => {
    if (fields[key]) fields[key].checked = !!checks[key];
  });
  syncContractStatusByChecks();

  docsController.load(contract.docs || []);
  setMode('view');
  markIncompleteFields(contract);
  renderList();
}

function markIncompleteFields(contract) {
  // 체크박스 미완료 표시
  CHECK_FIELD_KEYS.forEach((key) => {
    const checkbox = fields[key];
    if (!checkbox) return;
    const item = checkbox.closest('.contract-check-item');
    if (item) item.classList.toggle('is-incomplete', !checkbox.checked);
  });
  // 필수 입력칸 비어있으면 표시
  const requiredKeys = ['rent_month', 'rent_amount', 'deposit_amount', 'customer_name', 'customer_birth', 'customer_phone'];
  requiredKeys.forEach((key) => {
    const el = fields[key];
    if (!el) return;
    const val = String(el.value || '').trim();
    const empty = !val || val === '0';
    el.classList.toggle('is-incomplete', empty);
  });
}

function contractVisible(contract) {
  if (currentProfile?.role === 'admin') return true;
  if (currentProfile?.role === 'provider') return (contract.partner_code || '') === (currentProfile.company_code || '');
  if (currentProfile?.role === 'agent') return (contract.agent_uid || '') === (currentProfile.uid || '');
  return false;
}

async function refreshContracts() {
  const selectedCode = contractCodeHidden.value.trim();
  allContracts = await fetchContractsOnce();
  renderList();
  if (selectedCode) {
    const selected = allContracts.find((item) => item.contract_code === selectedCode);
    if (selected) {
      fillForm(selected);
      showToast(`새로고침 완료: ${formatContractCodeDisplay(selectedCode)}`, 'success');
      return;
    }
  }
  showToast('계약목록을 새로고침했습니다.', 'success');
}

function getProcessStatus(c) {
  const checks = c.checks || {};
  const allChecked = CHECK_FIELD_KEYS.every((k) => !!checks[k]);
  const hasCustomer = !!(c.customer_name && c.customer_birth && c.customer_phone);
  const hasPricing = !!(c.rent_month && Number(c.rent_amount || 0) > 0 && Number(c.deposit_amount || 0) > 0);
  return (allChecked && hasCustomer && hasPricing) ? '처리완료' : '미완료';
}

const CONTRACT_COLS = [
  { key: 'status',        label: '계약상태',     align: 'c', filterable: true, w: 80 },
  { key: 'process',       label: '처리상태',     align: 'c', filterable: true, w: 70 },
  { key: 'code',          label: '계약코드',     align: 'c', searchable: true },
  { key: 'partner',       label: '공급사코드',   align: 'c', filterable: true },
  { key: 'channel',       label: '영업채널코드', align: 'c', filterable: true },
  { key: 'agent',         label: '영업자코드',   align: 'c', filterable: true },
  { key: 'car',           label: '차량번호',     align: 'c', searchable: true },
  { key: 'model',         label: '모델명',       align: 'c', searchable: true },
  { key: 'month',         label: '기간',         align: 'c', searchable: true },
  { key: 'rent',          label: '대여료',       align: 'c', searchable: true },
  { key: 'deposit',       label: '보증금',       align: 'c', searchable: true },
  { key: 'customer',      label: '고객명',       align: 'c', searchable: true },
  { key: 'date',          label: '계약일자',     align: 'c', filterable: true },
];
const contractThead = qs('#contract-list-head');

function renderList() {
  const visible = allContracts.filter(contractVisible).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  syncTopBarPageCount(visible.length);
  renderTableGrid({
    thead: contractThead,
    tbody: listBody,
    columns: CONTRACT_COLS,
    items: visible,
    emptyText: '등록된 계약이 없습니다.',
    selectedKey: contractCodeHidden.value,
    getKey: (item) => item.contract_code,
    onSelect: async (item) => {
      if ((mode === 'edit' || mode === 'create') && !await showConfirm('수정/등록을 중단하시겠습니까?\n저장하지 않은 내용은 사라집니다.')) return;
      fillForm(item);
    },
    getCellValue: (col, c) => {
      switch (col.key) {
        case 'status': return renderBadgeRow([{ field: 'contract_status', value: c.contract_status || '계약대기' }]);
        case 'process': return renderBadgeRow([{ field: 'process_status', value: getProcessStatus(c) }]);
        case 'code': return escapeHtml(formatContractCodeDisplay(c.contract_code));
        case 'partner': return escapeHtml(c.partner_code || c.provider_company_code || '');
        case 'channel': return escapeHtml(c.agent_channel_code || c.agent_company_code || '');
        case 'agent': return escapeHtml(c.agent_code || '');
        case 'car': return escapeHtml(c.car_number || '');
        case 'model': return escapeHtml(c.model_name || c.sub_model || c.vehicle_name || '');
        case 'month': return escapeHtml(c.rent_month ? `${c.rent_month}개월` : '');
        case 'rent': return escapeHtml(c.rent_amount ? Number(c.rent_amount).toLocaleString('ko-KR') : '');
        case 'deposit': return escapeHtml(c.deposit_amount ? Number(c.deposit_amount).toLocaleString('ko-KR') : '');
        case 'customer': return escapeHtml(c.customer_name || '');
        case 'date': return escapeHtml(formatShortDate(c.created_at || c.updated_at));
        default: return '';
      }
    },
    getCellText: (col, c) => {
      switch (col.key) {
        case 'status': return c.contract_status || '계약대기';
        case 'process': return getProcessStatus(c);
        case 'code': return formatContractCodeDisplay(c.contract_code) || '';
        case 'partner': return c.partner_code || c.provider_company_code || '';
        case 'channel': return c.agent_channel_code || c.agent_company_code || '';
        case 'agent': return c.agent_code || '';
        case 'car': return c.car_number || '';
        case 'model': return c.model_name || c.sub_model || c.vehicle_name || '';
        case 'month': return c.rent_month ? `${c.rent_month}개월` : '';
        case 'rent': return c.rent_amount ? String(c.rent_amount) : '';
        case 'deposit': return c.deposit_amount ? String(c.deposit_amount) : '';
        case 'customer': return c.customer_name || '';
        case 'date': return formatYearMonth(c.created_at || c.updated_at);
        default: return '';
      }
    }
  });
}

function allChecksDone() {
  return CHECK_FIELD_KEYS.every((key) => !!fields[key]?.checked);
}

function syncContractStatusByChecks() {
  if (!fields.contract_status) return;
  if (allChecksDone()) {
    ensureSelectValue(fields.contract_status, '계약완료');
    fields.contract_status.value = '계약완료';
    return;
  }
  if (String(fields.contract_status.value || '').trim() === '계약완료') {
    ensureSelectValue(fields.contract_status, '계약발송');
    fields.contract_status.value = '계약발송';
  }
}

async function maybeCreateFromPendingSeed() {
  const raw = localStorage.getItem('freepass_pending_contract_seed');
  if (!raw) return;

  let seed = null;
  try {
    seed = JSON.parse(raw);
  } catch (error) {
    localStorage.removeItem('freepass_pending_contract_seed');
    throw error;
  }

  const remoteContracts = await fetchContractsOnce();
  allContracts = remoteContracts;
  renderList();

  const normalizedSeedProductKey = String(seed.product_uid || seed.seed_product_key || seed.product_code || '').trim();
  const normalizedCarNumber = String(seed.car_number || '').trim();
  const existing = remoteContracts.find((item) => {
    const sameAgent = String(item.agent_uid || '').trim() === String(currentProfile?.uid || '').trim();
    const sameSeedProduct = normalizedSeedProductKey
      && [item.product_uid, item.seed_product_key, item.product_code].some((value) => String(value || '').trim() === normalizedSeedProductKey);
    const sameCar = normalizedCarNumber && String(item.car_number || '').trim() === normalizedCarNumber;
    const isActive = String(item.contract_status || '').trim() !== '계약완료';
    return sameAgent && isActive && (sameSeedProduct || sameCar);
  });

  if (existing) {
    localStorage.removeItem('freepass_pending_contract_seed');
    fillForm(existing);
    showToast(`기존 계약으로 이동: ${formatContractCodeDisplay(existing.contract_code)}`, 'info');
    return;
  }

  const payload = seedToPayload(seed, currentProfile);
  const code = await saveContract(payload);
  localStorage.removeItem('freepass_pending_contract_seed');

  const created = {
    contract_code: code,
    ...payload,
    created_at: Date.now(),
    checks: {
      deposit_confirmed: false,
      docs_confirmed: false,
      approval_confirmed: false,
      contract_confirmed: false,
      balance_confirmed: false,
      delivery_confirmed: false
    },
    docs: []
  };
  allContracts = [created, ...remoteContracts];
  fillForm(created);
  showToast(`계약 생성 완료: ${formatContractCodeDisplay(code)}`, 'success');
}

async function handleSave() {
  const editingCode = contractCodeHidden.value.trim();
  if (!editingCode) {
    showToast('계약은 상품상세에서 계약 버튼을 눌러 생성하세요.', 'info');
    return;
  }

  const pendingDocFiles = docsController.getPendingDocFiles();
  const docs = docsController.getStoredDocs();
  if (pendingDocFiles.length) {
    const uploadProgress = showToast(`서류 업로드 중... (0/${pendingDocFiles.length})`, 'progress', { duration: 0 });
    const { results } = await uploadContractFilesDetailed(pendingDocFiles, currentProfile?.uid || 'unknown', {
      onProgress: ({ completed, total }) => {
        uploadProgress.update(`서류 업로드 중... (${completed}/${total})`);
      }
    });
    uploadProgress.dismiss();
    results.forEach((result) => {
      if (result?.success) docs.push({ name: result.name, url: result.url, type: result.type });
    });
  }

  // 삭제된 서류 Storage에서 제거
  const previousDocs = currentContract?.docs || [];
  const currentDocUrls = new Set(docs.map(d => d.url).filter(Boolean));
  const removedUrls = previousDocs.map(d => d.url).filter(url => url && !currentDocUrls.has(url));
  if (removedUrls.length) {
    try { await deleteProductImagesByUrls(removedUrls); } catch (_) {}
  }

  syncContractStatusByChecks();
  const selectedStatus = String(fields.contract_status.value || '계약대기').trim() || '계약대기';
  const payload = {
    contract_status: allChecksDone() ? '계약완료' : selectedStatus,
    rent_month: String(fields.rent_month.value || '').replace(/[^\d]/g, '') || '',
    rent_amount: parseMoneyValue(fields.rent_amount.value),
    deposit_amount: parseMoneyValue(fields.deposit_amount.value),
    customer_name: fields.customer_name.value.trim(),
    customer_birth: fields.customer_birth.value.trim(),
    customer_phone: fields.customer_phone.value.trim(),
    checks: Object.fromEntries(CHECK_FIELD_KEYS.map((key) => [key, !!fields[key]?.checked])),
    docs
  };

  // 부분 업데이트이므로 payload에 존재하는 필드만 검증
  if (payload.customer_phone && !/^[\d\-\s]{9,15}$/.test(payload.customer_phone.replace(/[^0-9]/g, ''))) {
    throw new Error('고객 연락처 형식이 올바르지 않습니다.');
  }

  await updateContract(editingCode, payload);
  docsController.setStoredDocs(docs);
  docsController.setPendingDocFiles([]);
  docsController.render();
  if (docInput) docInput.value = '';
  showToast(
    payload.contract_status === '계약완료'
      ? `저장 완료: ${editingCode} / 정산대기 등록`
      : `저장 완료: ${editingCode}`,
    'success'
  );

  const saved = allContracts.find((item) => item.contract_code === editingCode);
  if (saved) {
    fillForm({ ...saved, ...payload, contract_code: editingCode });
  }
}

async function handleDelete() {
  const editingCode = contractCodeHidden.value.trim();
  if (!editingCode) return;
  const status = String(fields.contract_status?.value || '').trim();
  if (status === '계약완료') {
    showToast('계약완료 상태의 계약은 삭제할 수 없습니다.', 'error');
    return;
  }
  if (!await showConfirm(`선택한 계약 ${editingCode} 를 삭제할까요?`)) return;
  await deleteContract(editingCode);
  showToast(`삭제 완료: ${editingCode}`, 'success');
  resetForm();
}

function handleDocSelection(files) {
  docsController.appendFiles(files);
}

async function bootstrap() {
  try {
    const { user, profile } = await requireAuth({ roles: ['provider', 'agent', 'admin'] });
    currentProfile = { ...profile, uid: user.uid };
    renderRoleMenu(menu, profile.role);

    bindFilterOverlayToggle(filterToggleButton, filterOverlay, { storageKey: 'fp.contract-filter.v1' });

    chatButton?.addEventListener('click', async () => {
      if (!currentContract) return;
      const c = currentContract;
      const productKey = c.product_uid || c.product_code || c.seed_product_key || '';
      const partnerKey = c.partner_code || c.provider_company_code || '';
      const agentKey = c.agent_uid || '';
      if (!productKey && !c.car_number) { showToast('차량 정보가 없어 대화를 시작할 수 없습니다.', 'error'); return; }
      if (!await showConfirm('이 계약 건에 대해 대화를 시작하시겠습니까?')) return;
      try {
        showToast('대화방 연결 중...', 'progress', { duration: 0 });
        const roomId = await ensureRoom({
          productUid: productKey,
          productCode: productKey,
          providerUid: '',
          providerCompanyCode: partnerKey,
          providerName: '',
          agentUid: agentKey || currentProfile?.uid || '',
          agentCode: c.agent_code || currentProfile?.user_code || '',
          agentName: c.agent_name || currentProfile?.name || '',
          vehicleNumber: c.car_number || '',
          modelName: c.model_name || c.vehicle_name || ''
        });
        // dirty 상태 해제 후 이동
        setMode('view');
        localStorage.setItem('freepass_pending_chat_room', roomId);
        window.location.href = `/chat?room_id=${encodeURIComponent(roomId)}`;
      } catch (error) {
        showToast(`대화 연결 실패: ${error.message}`, 'error');
      }
    });

    saveButton?.addEventListener('click', async () => {
      if (mode === 'view' && contractCodeHidden.value) {
        if (!await showConfirm('수정하시겠습니까?')) return;
        setMode('edit');
        if (message) message.textContent = '';
        return;
      }
      try {
        if (!await showConfirm('저장하시겠습니까?')) return;
        await handleSave();
      } catch (error) {
        showToast(`저장 실패: ${error.message}`, 'error');
      }
    });

    deleteButton?.addEventListener('click', async () => {
      try {
        await handleDelete();
      } catch (error) {
        showToast(`삭제 실패: ${error.message}`, 'error');
      }
    });

    resetButton?.addEventListener('click', async () => {
      try {
        await refreshContracts();
      } catch (error) {
        showToast(`새로고침 실패: ${error.message}`, 'error');
      }
    });

    CHECK_FIELD_KEYS.forEach((key) => {
      fields[key]?.addEventListener('change', () => syncContractStatusByChecks());
    });

    // 대여기간 변경 → 대여료/보증금 자동반영
    fields.rent_month?.addEventListener('change', async () => {
      const month = fields.rent_month.value;
      if (!month) return;
      try {
        await applySelectedRentPlan(month);
      } catch (error) {
        showToast(`대여기간 반영 실패: ${error.message}`, 'error');
      }
    });

    // 대여료 · 보증금 숫자만 입력 + 콤마 + 변경 시 색상 + 비우면 복원
    ['rent_amount', 'deposit_amount'].forEach((key) => {
      const input = fields[key];
      if (!input) return;
      input.addEventListener('input', () => {
        const raw = input.value.replace(/[^\d]/g, '');
        const cursor = input.selectionStart;
        const prevLen = input.value.length;
        input.value = raw ? Number(raw).toLocaleString('ko-KR') : '';
        const diff = input.value.length - prevLen;
        input.setSelectionRange(cursor + diff, cursor + diff);
        const origin = input.dataset.origin || '0';
        input.classList.toggle('is-changed', !!raw && raw !== origin);
      });
      input.addEventListener('blur', () => {
        const raw = input.value.replace(/[^\d]/g, '');
        const origin = input.dataset.origin || '0';
        if (!raw && origin !== '0') {
          input.value = Number(origin).toLocaleString('ko-KR');
          input.classList.remove('is-changed');
        }
      });
    });

    docInput?.addEventListener('change', () => handleDocSelection(docInput.files || []));

    docDropzone?.addEventListener('dragover', (event) => {
      if (mode === 'view') return;
      event.preventDefault();
      docDropzone.classList.add('is-dragover');
    });

    docDropzone?.addEventListener('dragleave', () => docDropzone.classList.remove('is-dragover'));

    docDropzone?.addEventListener('drop', (event) => {
      if (mode === 'view') return;
      event.preventDefault();
      docDropzone.classList.remove('is-dragover');
      handleDocSelection(event.dataTransfer?.files || []);
    });

    docClearButton?.addEventListener('click', () => {
      if (mode === 'view') return;
      docsController.clearAll();
    });

    setDirtyCheck(() => mode === 'edit');

    // 페이지 떠날 때 선택 상태 저장
    registerPageCleanup(() => {
      clearDirtyCheck();
      savePageState('/contract', {
        selectedCode: contractCodeHidden.value || '',
        scrollTop: listBody?.scrollTop || 0
      });
      docsController.destroy();
    });

    const restoredState = loadPageState('/contract');

    renderSkeletonRows(listBody, CONTRACT_COLS, 8);
    registerPageCleanup(watchContracts((items) => {
      allContracts = items;
      renderList();
      const code = contractCodeHidden.value || restoredState?.selectedCode || '';
      if (code) {
        const selected = allContracts.find((item) => item.contract_code === code);
        if (selected) fillForm(selected);
      }
      if (restoredState?.scrollTop && listBody) {
        requestAnimationFrame(() => { listBody.scrollTop = restoredState.scrollTop; });
        restoredState.scrollTop = 0;
      }
    }));

    resetForm();
    setMode('idle');
    await maybeCreateFromPendingSeed();
  } catch (error) {
    console.error(error);
    showToast(`초기화 오류: ${error.message}`, 'error');
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
// Auto-mount on first script load (server-rendered page)
if (!import.meta.url.includes('?')) mount();
