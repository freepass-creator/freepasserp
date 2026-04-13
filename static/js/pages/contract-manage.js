import { requireAuth } from '../core/auth-guard.js';
import { qs, registerPageCleanup, runPageCleanup, formatMoney } from '../core/utils.js';
import { setDirtyCheck, clearDirtyCheck } from '../app.js';
import { applyManagementButtonTones, createManagedFormModeApplier, syncTopBarPageCount } from '../core/management-skeleton.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { renderBadgeRow } from '../shared/badge.js';
import { showToast, showConfirm } from '../core/toast.js';
import { validateContract } from '../core/validators.js';
import { savePageState, loadPageState } from '../core/page-state.js';
import { formatPhone, bindAutoFormat } from '../core/management-format.js';
import { maskName, maskPhone, maskBirth, encryptField, decryptField, requestDecryptPassword } from '../core/crypto.js';

const { uploadContractFilesDetailed, deleteProductImagesByUrls } = await import(`../firebase/firebase-storage.js?v=${window.APP_VER || '1'}`);

import { saveContract, updateContract, deleteContract, fetchContractsOnce, watchContracts, getProduct, ensureRoom } from '../firebase/firebase-db.js';
import { formatShortDate, formatYearMonth } from '../core/management-format.js';
import { renderTableGrid, renderSkeletonRows } from '../core/management-list.js';
import { escapeHtml } from '../core/management-format.js';
import { createContractDocsController } from './contract-manage/docs.js';
import { formatContractCodeDisplay, parseMoneyValue, ensureSelectValue, buildVehicleName, buildVehicleDetail, deriveVehicleDisplayName, deriveSubModelDisplay, deriveAgentChannelCode, normalizeRentMonth, resolveTermPricing, seedToPayload, buildContractListTrailing } from './contract-manage/helpers.js';

let menu = qs('#sidebar-menu');
let listBody = qs('#contract-list');
let message = qs('#contract-message');
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
  docs_attached: qs('#docs_attached'),
  approval_requested: qs('#approval_requested'),
  deposit_confirmed: qs('#deposit_confirmed'),
  progress_approved: qs('#progress_approved'),
  contract_written: qs('#contract_written'),
  balance_confirmed: qs('#balance_confirmed'),
  delivery_confirmed: qs('#delivery_confirmed')
};

function bindDOM() {
  menu = qs('#sidebar-menu');
  listBody = qs('#contract-list');
  message = qs('#contract-message');
  resetButton = null;
  saveButton = qs('#contract-submit-head');
  deleteButton = qs('#contract-delete-head');
  chatButton = qs('#contract-chat-btn');
  const contractForm = qs('#contract-form');
  formMode = contractForm?.querySelector('#contract-form_mode') ?? qs('#contract-form_mode');
  contractCodeHidden = contractForm?.querySelector('#contract_code_hidden') ?? qs('#contract_code_hidden');
  docInput = contractForm?.querySelector('#contract_docs') ?? qs('#contract_docs');
  docDropzone = qs('#contract-doc-dropzone');
  docList = qs('#contract-doc-list');
  docSummary = qs('#contract-doc-summary');
  docClearButton = qs('#contract-doc-clear');
  const f = (id) => contractForm?.querySelector(`#${id}`) ?? null;
  fields = {
    contract_code: f('contract_code'),
    contract_status: f('contract_status'),
    partner_code: f('partner_code'),
    agent_code: f('agent_code'),
    policy_code: f('policy_code'),
    product_code: f('product_code'),
    car_number: f('car_number'),
    vehicle_name: f('vehicle_name'),
    rent_month: f('rent_month'),
    rent_amount: f('rent_amount'),
    deposit_amount: f('deposit_amount'),
    customer_name: f('customer_name'),
    customer_birth: f('customer_birth'),
    customer_phone: f('customer_phone'),
    docs_attached: f('docs_attached'),
    approval_requested: f('approval_requested'),
    deposit_confirmed: f('deposit_confirmed'),
    progress_approved: f('progress_approved'),
    contract_written: f('contract_written'),
    balance_confirmed: f('balance_confirmed'),
    delivery_confirmed: f('delivery_confirmed')
  };
  bindAutoFormat(f('customer_phone'), formatPhone);
}

const AGENT_CHECK_KEYS = ['docs_attached', 'approval_requested'];
const AGENT_CHECK_LABELS = { docs_attached: '서류첨부', approval_requested: '승인요청' };
const PROVIDER_CHECK_KEYS = ['deposit_confirmed', 'progress_approved', 'contract_written', 'balance_confirmed', 'delivery_confirmed'];
const PROVIDER_CHECK_LABELS = { deposit_confirmed: '계약금확인', progress_approved: '진행승인', contract_written: '계약서작성', balance_confirmed: '잔금확인', delivery_confirmed: '인도확인' };
const CHECK_FIELD_KEYS = [...AGENT_CHECK_KEYS, ...PROVIDER_CHECK_KEYS];
const CHECK_FIELD_LABELS = { ...AGENT_CHECK_LABELS, ...PROVIDER_CHECK_LABELS };
const CONTRACT_STATUS_OPTIONS = [
  { value: '계약대기', label: '계약대기' },
  { value: '계약요청', label: '계약요청' },
  { value: '계약발송', label: '계약발송' },
  { value: '계약완료', label: '계약완료' },
  { value: '계약철회', label: '계약철회' },
];
const CUSTOMER_FIELD_KEYS = ['customer_name', 'customer_birth', 'customer_phone'];
const productCache = new Map();

let currentProfile = null;
let allContracts = [];
let currentContract = null;
let mode = 'create';
let _bootDone = false;

// ─── 우클릭 컨텍스트 메뉴 ──────────
let _ctxMenu = null;
function removeCtxMenu() { if (_ctxMenu) { _ctxMenu.style.display = 'none'; _ctxMenu.remove(); _ctxMenu = null; } }
document.addEventListener('pointerdown', (e) => { if (_ctxMenu && !_ctxMenu.contains(e.target)) removeCtxMenu(); }, true);
document.addEventListener('scroll', removeCtxMenu, true);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') removeCtxMenu(); });

document.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('#contract-list tr[data-key]');
  if (!row) return;
  e.preventDefault();
  removeCtxMenu();
  const code = row.dataset.key;
  const contract = allContracts.find(c => c.contract_code === code);
  if (!contract) return;
  const checks = contract.checks || {};

  const menu = document.createElement('div');
  menu.className = 'pm-ctx-menu';
  menu.innerHTML = `
    <button type="button" class="pm-ctx-item" data-action="edit">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>
      정보수정
    </button>
    <div class="pm-ctx-divider"></div>
    <div class="pm-ctx-sub">
      <button type="button" class="pm-ctx-item pm-ctx-item--parent">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
        진행상황
        <svg class="pm-ctx-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
      </button>
      <div class="pm-ctx-submenu">
        <div style="padding:4px 14px 2px;font-size:10px;color:#64748b;font-weight:700;">영업자</div>
        ${AGENT_CHECK_KEYS.map(key =>
          `<button type="button" class="pm-ctx-item" data-action="check" data-key="${escapeHtml(key)}">${checks[key] ? '☑' : '☐'} ${escapeHtml(AGENT_CHECK_LABELS[key])}</button>`
        ).join('')}
        <div class="pm-ctx-divider"></div>
        <div style="padding:4px 14px 2px;font-size:10px;color:#64748b;font-weight:700;">공급사</div>
        ${PROVIDER_CHECK_KEYS.map(key =>
          `<button type="button" class="pm-ctx-item" data-action="check" data-key="${escapeHtml(key)}">${checks[key] ? '☑' : '☐'} ${escapeHtml(PROVIDER_CHECK_LABELS[key])}</button>`
        ).join('')}
      </div>
    </div>
    <div class="pm-ctx-sub">
      <button type="button" class="pm-ctx-item pm-ctx-item--parent">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>
        상태변경
        <svg class="pm-ctx-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
      </button>
      <div class="pm-ctx-submenu">
        ${CONTRACT_STATUS_OPTIONS.map(s =>
          `<button type="button" class="pm-ctx-item" data-action="status" data-status="${escapeHtml(s.value)}">${escapeHtml(s.label)}</button>`
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
  menu.style.cssText = `position:fixed;top:${e.clientY}px;left:${e.clientX}px;z-index:9999;`;
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 8}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 8}px`;
  });

  menu.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'edit') {
      removeCtxMenu();
      fillForm(contract);
      setMode('edit');
    }
    if (action === 'check') {
      const key = btn.dataset.key;
      const newChecks = { ...(contract.checks || {}), [key]: !checks[key] };
      const allDone = CHECK_FIELD_KEYS.every(k => !!newChecks[k]);
      const newStatus = allDone ? '계약완료' : (contract.contract_status === '계약완료' ? '계약발송' : contract.contract_status);
      try {
        await updateContract(contract.contract_code, { checks: newChecks, contract_status: newStatus });
        contract.checks = newChecks;
        contract.contract_status = newStatus;
        renderList();
        showToast(`${CHECK_FIELD_LABELS[key]} ${newChecks[key] ? '✓' : '해제'}`, 'success');
      } catch (err) { showToast('체크 변경 실패: ' + (err.message || err), 'error'); }
      removeCtxMenu();
    }
    if (action === 'status') {
      removeCtxMenu();
      try {
        await updateContract(contract.contract_code, { contract_status: btn.dataset.status });
        showToast(`상태 → ${btn.dataset.status}`, 'success');
      } catch (err) { showToast('상태 변경 실패: ' + (err.message || err), 'error'); }
    }
    if (action === 'delete') {
      removeCtxMenu();
      if (contract.contract_status === '계약완료') { showToast('계약완료 상태의 계약은 삭제할 수 없습니다.', 'error'); return; }
      if (!await showConfirm(`${contract.contract_code}\n삭제하시겠습니까?`)) return;
      try {
        await deleteContract(contract.contract_code);
        showToast('삭제 완료', 'success');
        resetForm();
      } catch (err) { showToast('삭제 실패: ' + (err.message || err), 'error'); }
    }
  });
});

const isMobileQuery = window.matchMedia('(max-width: 768px)');

function openMobileContractFormView() {
  if (!isMobileQuery.matches) return;
  document.body.classList.add('contract-m-open');
  history.pushState({ contractOpen: true }, '');
  if (window.showMobileBackBtn) window.showMobileBackBtn();
}

function closeMobileContractFormView() {
  document.body.classList.remove('contract-m-open');
  if (window.hideMobileBackBtn) window.hideMobileBackBtn();
  // 목록으로 돌아올 때 수정 모드 해제 → 목록 클릭 시 경고 안 뜨게
  if (mode === 'edit') {
    mode = 'view';
    clearDirtyCheck();
  }
}

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
  // 분리된 4개 필드 표시
  const $maker = qs('#contract_maker');
  const $model = qs('#contract_model');
  const $sub   = qs('#contract_sub_model');
  const $trim  = qs('#contract_trim');
  if ($maker) $maker.value = contract.maker || '';
  if ($model) $model.value = contract.model_name || '';
  if ($sub)   $sub.value   = contract.sub_model || '';
  if ($trim)  $trim.value  = contract.trim_name || '';
  // hidden vehicle_name 통짜 — 기존 호환용
  fields.vehicle_name.value = deriveVehicleDisplayName(contract);
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
  openMobileContractFormView();
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
  if (currentProfile?.role === 'provider') {
    const cp = String(contract.partner_code || contract.provider_company_code || '').trim();
    return cp === String(currentProfile.company_code || '').trim();
  }
  if (currentProfile?.role === 'agent_manager') {
    const cc = String(contract.channel_code || contract.agent_channel_code || '').trim();
    return cc === String(currentProfile.company_code || '').trim();
  }
  if (currentProfile?.role === 'agent') {
    const myUid = String(currentProfile.uid || '').trim();
    const myCode = String(currentProfile.user_code || '').trim();
    const cAgentUid = String(contract.agent_uid || '').trim();
    const cAgentCode = String(contract.agent_code || '').trim();
    return (myUid && cAgentUid === myUid) || (myCode && cAgentCode === myCode);
  }
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
  { key: 'process',       label: '처리상태',     align: 'c', filterable: true, w: 80 },
  { key: 'partner',       label: '공급사코드',   align: 'c', filterable: true },
  { key: 'agent',         label: '영업자코드',   align: 'c', filterable: true },
  { key: 'car',           label: '차량번호',     align: 'c', searchable: true },
  { key: 'subModel',      label: '세부모델',     align: 'c', searchable: true },
  { key: 'progress',      label: '처리율',       align: 'c' },
  { key: 'month',         label: '기간',         align: 'c', searchable: true },
  { key: 'rent',          label: '대여료',       align: 'r', num: true },
  { key: 'customer',      label: '고객명',       align: 'c', searchable: true },
  { key: 'date',          label: '계약일자',     align: 'c', filterable: true },
];
const contractThead = qs('#contract-list-head');

function renderList() {
  const roleVisible = allContracts.filter(contractVisible).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  const visible = roleVisible;
  syncTopBarPageCount(visible.length);
  renderMobileList(visible);
  renderTableGrid({
    thead: contractThead,
    tbody: listBody,
    columns: CONTRACT_COLS,
    items: visible,
    emptyText: '등록된 계약이 없습니다.',
    selectedKey: contractCodeHidden.value,
    getKey: (item) => item.contract_code,
    onSelect: async (item) => {
      if (mode === 'edit' && !await showConfirm('수정/등록을 중단하시겠습니까?\n저장하지 않은 내용은 사라집니다.')) return;
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
        case 'maker':    return escapeHtml(c.maker || '-');
        case 'model':    return escapeHtml(c.model_name || '-');
        case 'subModel': return escapeHtml(c.sub_model || '-');
        case 'progress': {
          const chk = c.checks || {};
          const done = CHECK_FIELD_KEYS.filter(k => chk[k]).length;
          const total = CHECK_FIELD_KEYS.length;
          return `<span style="font-size:11px;font-weight:600;color:${done === total ? '#16a34a' : done > 0 ? '#f59e0b' : '#94a3b8'}">${done}/${total}</span>`;
        }
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
        case 'maker':    return c.maker || '';
        case 'model':    return c.model_name || '';
        case 'subModel': return c.sub_model || '';
        case 'progress': {
          const chk = c.checks || {};
          return `${CHECK_FIELD_KEYS.filter(k => chk[k]).length}/${CHECK_FIELD_KEYS.length}`;
        }
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

function renderMobileList(visible) {
  const el = document.getElementById('contract-m-list');
  if (!el) return;
  const selectedCode = contractCodeHidden.value || '';
  if (!visible.length) {
    el.innerHTML = '<div class="chat-m-empty">등록된 계약이 없습니다.</div>';
    return;
  }
  el.innerHTML = visible.map((c) => {
    const carNo = c.car_number || '';
    const model = c.sub_model || c.model_name || c.vehicle_name || '';
    const mainLine = [carNo, model].filter(Boolean).join(' ') || '-';
    const partner = c.partner_code || c.provider_company_code || '';
    const agentCode = c.agent_code || '';
    const month = c.rent_month ? `${c.rent_month}개월` : '';
    const customer = c.customer_name || '';
    const subInfo = [partner, agentCode, month, customer].filter(Boolean).join(' · ');
    const status = c.contract_status || '계약대기';
    const at = c.created_at || c.updated_at;
    const d = at ? new Date(at) : null;
    const dateStr = d ? `${String(d.getFullYear()).slice(-2)}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}` : '';
    const isActive = c.contract_code === selectedCode;
    const statusIcon = status === '계약완료'
      ? '<span class="m-list-card__avatar m-list-card__avatar--done"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m9 15 2 2 4-4"/></svg></span>'
      : '<span class="m-list-card__avatar m-list-card__avatar--pending"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></span>';
    let badgeCls = 'm-list-badge';
    if (status === '계약완료') badgeCls += ' m-list-badge--green';
    else if (status === '계약철회') badgeCls += ' m-list-badge--red';
    else if (status === '계약발송') badgeCls += ' m-list-badge--blue';
    else badgeCls += ' m-list-badge--yellow';
    return `<div class="m-list-card${isActive ? ' is-active' : ''}" data-contract-code="${escapeHtml(c.contract_code || '')}">
      ${statusIcon}
      <div class="m-list-card__body">
        <div class="m-list-card__main">
          <span class="m-list-card__name">${escapeHtml(mainLine)}</span>
          <span class="${badgeCls}">${escapeHtml(status)}</span>
        </div>
        <div class="m-list-card__sub">
          <span class="m-list-card__info">${escapeHtml(subInfo)}</span>
          <span class="m-list-card__date">${escapeHtml(dateStr)}</span>
        </div>
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('.m-list-card').forEach((card) => {
    card.addEventListener('click', async () => {
      const code = card.dataset.contractCode;
      const item = allContracts.find((c) => c.contract_code === code);
      if (!item) return;
      if (mode === 'edit' && !await showConfirm('수정/등록을 중단하시겠습니까?\n저장하지 않은 내용은 사라집니다.')) return;
      fillForm(item);
    });
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
  } catch (_) {
    localStorage.removeItem('freepass_pending_contract_seed');
    return;
  }
  if (!seed || typeof seed !== 'object') {
    localStorage.removeItem('freepass_pending_contract_seed');
    return;
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
    checks: Object.fromEntries(CHECK_FIELD_KEYS.map(k => [k, false])),
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
    customer_name: maskName(fields.customer_name.value.trim()),
    customer_birth: maskBirth(fields.customer_birth.value.trim()),
    customer_phone: maskPhone(fields.customer_phone.value.trim()),
    checks: Object.fromEntries(CHECK_FIELD_KEYS.map((key) => [key, !!fields[key]?.checked])),
    docs
  };

  // 원본이 있으면 암호화 저장
  const rawName = fields.customer_name.value.trim();
  const rawBirth = fields.customer_birth.value.trim();
  const rawPhone = fields.customer_phone.value.trim();
  if (rawName || rawBirth || rawPhone) {
    const pw = await requestDecryptPassword();
    if (!pw) throw new Error('비밀번호를 입력해야 저장할 수 있습니다.');
    payload._secure = {
      customer_name: rawName ? await encryptField(rawName, pw) : '',
      customer_birth: rawBirth ? await encryptField(rawBirth, pw) : '',
      customer_phone: rawPhone ? await encryptField(rawPhone, pw) : '',
    };
  }

  // 부분 업데이트이므로 payload에 존재하는 필드만 검증
  if (rawPhone && !/^[\d\-\s]{9,15}$/.test(rawPhone.replace(/[^0-9]/g, ''))) {
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
  _bootDone = false;
  try {
    const { user, profile } = await requireAuth({ roles: ['provider', 'agent', 'agent_manager', 'admin'] });
    currentProfile = { ...profile, uid: user.uid };
    renderRoleMenu(menu, profile.role);

    // 모바일 뒤로가기: 계약 입력/수정 → 계약목록
    document.getElementById('mobile-back-btn')?.addEventListener('click', () => {
      closeMobileContractFormView();
    });

    // 개인정보 원본 열람
    qs('#contract-reveal-btn')?.addEventListener('click', async () => {
      if (!currentContract) return;
      const secure = currentContract._secure;
      if (!secure) { showToast('암호화된 개인정보가 없습니다.', 'error'); return; }
      const pw = await requestDecryptPassword();
      if (!pw) return;
      const name = await decryptField(secure.customer_name, pw);
      if (name === null) { showToast('비밀번호가 올바르지 않습니다.', 'error'); return; }
      const birth = await decryptField(secure.customer_birth, pw);
      const phone = await decryptField(secure.customer_phone, pw);
      fields.customer_name.value = name || '';
      fields.customer_birth.value = birth || '';
      fields.customer_phone.value = phone || '';
      showToast('개인정보가 표시됩니다. 30초 후 자동 마스킹됩니다.', 'info');
      setTimeout(() => {
        if (currentContract) {
          fields.customer_name.value = currentContract.customer_name || '';
          fields.customer_birth.value = currentContract.customer_birth || '';
          fields.customer_phone.value = currentContract.customer_phone || '';
        }
      }, 30000);
    });

    // 첨부파일 열람 시 비밀번호 확인
    const docList = qs('#contract-doc-list');
    docList?.addEventListener('click', async (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;
      e.preventDefault();
      const pw = await requestDecryptPassword();
      if (!pw) return;
      // 비밀번호 확인만 하고 (암호화된 파일이 아니므로) 원본 링크로 이동
      window.open(link.href, '_blank');
    });

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
          agentChannelCode: c.agent_channel_code || currentProfile?.company_code || '',
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
      if (!_bootDone) return;
      if (mode === 'edit') return; // 수정 중 Firebase 업데이트로 폼 초기화 방지
      const code = contractCodeHidden.value || '';
      if (code) {
        const selected = allContracts.find((item) => item.contract_code === code);
        if (selected) fillForm(selected);
      }
    }));

    resetForm();
    setMode('idle');
    _bootDone = true;

    // 부트스트랩 완료 후 1회 선택 복원
    const restoreCode = restoredState?.selectedCode || '';
    if (restoreCode) {
      const restoreTarget = allContracts.find((item) => item.contract_code === restoreCode);
      if (restoreTarget) fillForm(restoreTarget);
    }
    if (restoredState?.scrollTop && listBody) {
      requestAnimationFrame(() => { if (listBody) listBody.scrollTop = restoredState.scrollTop; });
    }

    try {
      await maybeCreateFromPendingSeed();
    } catch (seedError) {
      console.error('계약 시드 처리 오류:', seedError);
      localStorage.removeItem('freepass_pending_contract_seed');
      const errMsg = seedError?.message || seedError?.code || String(seedError) || '알 수 없는 오류';
      showToast(`계약 생성 실패: ${errMsg}`, 'error');
    }
  } catch (error) {
    console.error(error);
    showToast(`초기화 오류: ${error.message}`, 'error');
  }
}

function _registerMobileBack() {
  if (!window.setMobileBackHandler) return;
  window.setMobileBackHandler(async () => {
    if (document.body.classList.contains('contract-m-open')) {
      if (mode === 'edit') {
        const ok = await showConfirm('수정/등록을 중단하시겠습니까?\n저장하지 않은 내용은 사라집니다.');
        if (!ok) return true;
      }
      closeMobileContractFormView();
      return true;
    }
    return false;
  });
}

let _mounted = false;
export async function mount() {
  document.body.classList.add('page-contract');
  window._mobileFilterConfig = { sidebar: 'contractMFilterSidebar', overlay: 'contractMFilterOverlay', close: 'contractMFilterClose' };
  _registerMobileBack();
  // 상품리스트에서 계약으로 넘어온 경우: 즉시 폼 뷰 표시
  if (localStorage.getItem('freepass_pending_contract_seed') && isMobileQuery.matches) {
    document.body.classList.add('contract-m-open');
  }
  bindDOM();
  _mounted = false;
  await bootstrap();
  _mounted = true;
}
export function onHide() {
  document.body.classList.remove('page-contract');
  document.body.classList.remove('contract-m-open');
  window._mobileFilterConfig = null;
  if (window.clearMobileBackHandler) window.clearMobileBackHandler();
}
export function unmount() {
  runPageCleanup();
  onHide();
  _mounted = false;
}
export function onShow() {
  document.body.classList.add('page-contract');
  if (window.hideMobileBackBtn) window.hideMobileBackBtn();
  _registerMobileBack();
  setDirtyCheck(() => mode === 'edit');
}
// Auto-mount on first script load (server-rendered page)
if (!import.meta.url.includes('?')) mount();
