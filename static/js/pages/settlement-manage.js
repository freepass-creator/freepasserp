import { requireAuth } from '../core/auth-guard.js';
import { qs, registerPageCleanup, runPageCleanup } from '../core/utils.js';
import { setDirtyCheck, clearDirtyCheck } from '../app.js';
import { applyManagementButtonTones, createManagedFormModeApplier, createSubmitHandler, syncTopBarPageCount } from '../core/management-skeleton.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { renderBadgeRow } from '../shared/badge.js';
import { showToast, showConfirm } from '../core/toast.js';
import { watchSettlements, updateSettlement, deleteSettlement, createClawback, getProduct, ensureRoom } from '../firebase/firebase-db.js';
import { formatSequenceCodeDisplay, formatShortDate, formatYearMonth, safeText } from '../core/management-format.js';
import { renderTableGrid, renderSkeletonRows } from '../core/management-list.js';
import { escapeHtml } from '../core/management-format.js';

let menu = qs('#sidebar-menu');
let list = qs('#settlement-list');
let form = qs('#settlement-form');
let resetButton = qs('#settlement-form-reset');
let submitButton = qs('#settlement-submit-head');
let deleteButton = qs('#settlement-delete-head');
let clawbackButton = qs('#settlement-clawback-btn');
let chatButton = qs('#settlement-chat-btn');
let message = qs('#settlement-message');
let modeField = qs('#settlement-form_mode');

let fields = {
  settlement_code: qs('#settlement_code'),
  settlement_status: qs('#settlement_status'),
  partner_code: qs('#stl_partner_code'),
  channel_code: qs('#stl_channel_code'),
  agent_code: qs('#stl_agent_code'),
  car_number: qs('#stl_car_number'),
  model_name: qs('#stl_model_name'),
  customer_name: qs('#stl_customer_name'),
  fee_amount: qs('#stl_fee_amount'),
  settled_date: qs('#stl_settled_date'),
  provider_confirmed: qs('#stl_provider_confirmed_select'),
  provider_memo: qs('#stl_provider_memo'),
  agent_confirmed: qs('#stl_agent_confirmed_select'),
  agent_memo: qs('#stl_agent_memo'),
  admin_confirmed: qs('#stl_admin_confirmed_select'),
  admin_memo: qs('#stl_admin_memo')
};

function bindDOM() {
  menu = qs('#sidebar-menu');
  list = qs('#settlement-list');
  form = qs('#settlement-form');
  resetButton = null;
  submitButton = qs('#settlement-submit-head');
  deleteButton = qs('#settlement-delete-head');
  clawbackButton = qs('#settlement-clawback-btn');
  chatButton = qs('#settlement-chat-btn');
  message = qs('#settlement-message');
  modeField = qs('#settlement-form_mode');
  fields = {
    settlement_code: qs('#settlement_code'),
    settlement_status: qs('#settlement_status'),
    partner_code: qs('#stl_partner_code'),
    channel_code: qs('#stl_channel_code'),
    agent_code: qs('#stl_agent_code'),
    car_number: qs('#stl_car_number'),
    model_name: qs('#stl_model_name'),
    customer_name: qs('#stl_customer_name'),
    fee_amount: qs('#stl_fee_amount'),
    settled_date: qs('#stl_settled_date'),
    provider_confirmed: qs('#stl_provider_confirmed_select'),
    provider_memo: qs('#stl_provider_memo'),
    agent_confirmed: qs('#stl_agent_confirmed_select'),
    agent_memo: qs('#stl_agent_memo'),
    admin_confirmed: qs('#stl_admin_confirmed_select'),
    admin_memo: qs('#stl_admin_memo')
  };
}

let currentProfile = null;
let currentSettlements = [];
let selectedCode = '';
const productCache = new Map();
let formMode = 'create';

const CHECK_KEYS = ['provider_confirmed', 'agent_confirmed', 'admin_confirmed'];

let applySettlementFormMode = null;

function initFormMode() {
  applySettlementFormMode = createManagedFormModeApplier({
    form,
    panelLabel: '정산',
    getIdentity: () => fields.settlement_code?.value,
    isSelected: () => Boolean(selectedCode),
    submitButtons: [submitButton],
    deleteButtons: [deleteButton],
    defaultOptions: {
      alwaysReadOnlyIds: ['settlement_code', 'stl_partner_code', 'stl_channel_code', 'stl_agent_code', 'stl_car_number', 'stl_model_name', 'stl_customer_name', 'stl_settled_date'],
      customDisable: (field, context) => {
        const key = Object.entries(fields).find(([, node]) => node === field)?.[0] || '';
        const role = currentProfile?.role;
        if (key === 'settlement_status') return context.isView;
        if (CHECK_KEYS.includes(key)) {
          if (context.isView) return true;
          if (role === 'admin') return false;
          if (role === 'provider' && key === 'provider_confirmed') return false;
          if (role === 'agent' && key === 'agent_confirmed') return false;
          return true;
        }
        return false;
      },
      customReadOnly: (field, context) => {
        const key = Object.entries(fields).find(([, node]) => node === field)?.[0] || '';
        const role = currentProfile?.role;
        // 관리자: 모든 칸 수정 가능
        if (role === 'admin') return context.baseReadOnly;
        // 공급사: 공급사 체크/메모만
        if (role === 'provider') {
          if (['agent_confirmed', 'agent_memo', 'admin_confirmed', 'admin_memo'].includes(key)) return true;
        }
        // 영업자: 영업자 체크/메모만
        if (role === 'agent') {
          if (['provider_confirmed', 'provider_memo', 'admin_confirmed', 'admin_memo'].includes(key)) return true;
        }
        return context.baseReadOnly;
      }
    }
  });
}




function formatSettlementCodeDisplay(value) {
  return formatSequenceCodeDisplay(value, { prefix: 'ST' });
}

function settlementVisible(item) {
  if (currentProfile?.role === 'admin') return true;
  if (currentProfile?.role === 'provider') return safeText(item.partner_code, '') === safeText(currentProfile.company_code, '');
  if (currentProfile?.role === 'agent') return safeText(item.agent_uid, '') === safeText(currentProfile.uid, '');
  return false;
}

function allConfirmsDone() {
  return CHECK_KEYS.every((key) => fields[key]?.value === 'confirmed');
}

function isClawbackRecord() {
  const currentItem = currentSettlements.find(s => s.settlement_code === selectedCode);
  return !!currentItem?.is_clawback;
}

function ensureSelectOption(select, value) {
  if (!select || select.tagName !== 'SELECT') return;
  const opt = [...select.options].find(o => o.value === value);
  if (!opt) { const newOpt = document.createElement('option'); newOpt.value = value; newOpt.textContent = value; select.appendChild(newOpt); }
}

function syncSettlementStatusByChecks() {
  if (!fields.settlement_status) return;
  const status = String(fields.settlement_status.value || '').trim();
  if (allConfirmsDone()) {
    if (isClawbackRecord()) {
      ensureSelectOption(fields.settlement_status, '환수결정');
      fields.settlement_status.value = '환수결정';
    } else {
      ensureSelectOption(fields.settlement_status, '정산완료');
      fields.settlement_status.value = '정산완료';
    }
    return;
  }
  // 확인 하나 해제 시 원래 대기 상태로
  if (status === '정산완료') fields.settlement_status.value = '정산대기';
  if (status === '환수결정') fields.settlement_status.value = '환수대기';
}

function applyFormMode(nextMode) {
  formMode = nextMode;
  if (modeField) modeField.value = nextMode;
  if (!applySettlementFormMode) return;
  const hasSelection = nextMode !== 'create' && nextMode !== 'idle';
  applySettlementFormMode(nextMode, { deleteEnabled: hasSelection });
  if (clawbackButton) clawbackButton.disabled = !hasSelection;
  if (chatButton) chatButton.disabled = !hasSelection;
}

function setIdleMode() {
  selectedCode = '';
  form?.reset();
  applyFormMode('idle');
  renderList();
  if (message) message.textContent = '';
}

function resetForm() {
  selectedCode = '';
  form?.reset();
  Object.values(fields).forEach((node) => {
    if (!node) return;
    if (node.type === 'checkbox') node.checked = false;
    else node.value = '';
  });
  if (fields.settlement_status) fields.settlement_status.value = '정산대기';
  applyFormMode('create');
  renderList();
  if (message) message.textContent = '';
}

function formatFeeDisplay(amount, status) {
  const num = Number(amount || 0);
  if (String(status || '').includes('환수')) return num ? `-${Math.abs(num).toLocaleString('ko-KR')}` : '';
  return num ? num.toLocaleString('ko-KR') : '';
}

function todayYmd() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}.${mm}.${dd}`;
}

function _applyFeeDisplay(feeActual, feeOrigin, status) {
  if (!fields.fee_amount) return;
  fields.fee_amount.value = formatFeeDisplay(feeActual || feeOrigin, status);
  fields.fee_amount.dataset.origin = String(feeOrigin);
  fields.fee_amount.classList.toggle('is-changed', feeActual !== feeOrigin && feeOrigin > 0 && feeActual > 0);
  const feeLabel = fields.fee_amount.parentElement?.querySelector('label');
  if (feeLabel) feeLabel.textContent = feeOrigin ? `지급수수료 (기존금액 ${feeOrigin.toLocaleString('ko-KR')}원)` : '지급수수료';
}

async function _loadProductFee(productKey, month, feeActual, status) {
  try {
    let product = productCache.get(productKey);
    if (product === undefined) {
      product = await getProduct(productKey);
      productCache.set(productKey, product || null);
    }
    if (!product) return;
    const plan = product.price?.[month];
    const feeOrigin = Number(plan?.fee || plan?.commission || product[`fee_${month}`] || product[`commission_${month}`] || 0);
    if (feeOrigin) _applyFeeDisplay(feeActual || feeOrigin, feeOrigin, status);
  } catch (_) {}
}

function fillForm(item) {
  selectedCode = item.settlement_code || '';
  if (fields.settlement_code) fields.settlement_code.value = formatSettlementCodeDisplay(item.settlement_code);
  const status = item.settlement_status || item.status || '정산대기';
  if (fields.settlement_status) {
    if (fields.settlement_status.tagName === 'SELECT') {
      const opt = [...fields.settlement_status.options].find(o => o.value === status);
      if (!opt) { const newOpt = document.createElement('option'); newOpt.value = status; newOpt.textContent = status; fields.settlement_status.appendChild(newOpt); }
    }
    fields.settlement_status.value = status;
  }
  if (fields.partner_code) fields.partner_code.value = item.partner_code || item.partner_code_snapshot || '';
  if (fields.channel_code) fields.channel_code.value = item.agent_channel_code_snapshot || item.agent_channel_code || item.agent_company_code || '';
  if (fields.agent_code) fields.agent_code.value = item.agent_code_snapshot || item.agent_code || '';
  if (fields.car_number) fields.car_number.value = item.car_number || item.car_number_snapshot || '';
  if (fields.model_name) fields.model_name.value = item.model_name || item.model_name_snapshot || item.sub_model_snapshot || item.sub_model || item.vehicle_name || '';
  if (fields.customer_name) fields.customer_name.value = item.customer_name || item.customer_name_snapshot || '';

  // 수수료: 먼저 저장된 값으로 표시, 비동기로 상품 조회 후 갱신
  const feeActual = Number(item.fee_amount || 0);
  const feeOriginSaved = Number(item.origin_fee_amount || 0);
  _applyFeeDisplay(feeActual, feeOriginSaved, status);

  if (!feeOriginSaved) {
    const productKey = item.product_uid_snapshot || item.product_code_snapshot || '';
    const month = String(item.rent_month || '').replace(/[^\d]/g, '');
    if (productKey && month) _loadProductFee(productKey, month, feeActual, status);
  }
  if (fields.settled_date) fields.settled_date.value = item.settled_date || todayYmd();

  const confirms = item.confirms || {};
  if (fields.provider_confirmed) fields.provider_confirmed.value = confirms.provider ? 'confirmed' : '';
  if (fields.agent_confirmed) fields.agent_confirmed.value = confirms.agent ? 'confirmed' : '';
  if (fields.admin_confirmed) fields.admin_confirmed.value = confirms.admin ? 'confirmed' : '';
  if (fields.provider_memo) fields.provider_memo.value = item.provider_memo || '';
  if (fields.agent_memo) fields.agent_memo.value = item.agent_memo || '';
  if (fields.admin_memo) fields.admin_memo.value = item.admin_memo || '';

  applyFormMode('view');
  markSettlementIncomplete();
  renderList();
}

function markSettlementIncomplete() {
  // 정산확인 드롭다운 미완료 표시
  CHECK_KEYS.forEach((key) => {
    const el = fields[key];
    if (!el) return;
    el.classList.toggle('is-incomplete', el.value !== 'confirmed');
  });
  // 수수료 비어있으면 표시
  if (fields.fee_amount) {
    const val = String(fields.fee_amount.value || '').replace(/[^\d]/g, '');
    fields.fee_amount.classList.toggle('is-incomplete', !val || val === '0');
  }
}

function getSettleProcessStatus(s) {
  const role = currentProfile?.role;
  const confirms = s.confirms || {};
  if (role === 'provider') return confirms.provider ? '처리완료' : '미완료';
  if (role === 'agent') return confirms.agent ? '처리완료' : '미완료';
  if (role === 'admin') {
    const all = confirms.provider && confirms.agent && confirms.admin;
    return all ? '처리완료' : '미완료';
  }
  return '미완료';
}

const SETTLE_COLS = [
  { key: 'status',   label: '정산상태',     align: 'c', filterable: true, w: 80 },
  { key: 'process',  label: '처리상태',     align: 'c', filterable: true, w: 70 },
  { key: 'code',     label: '정산코드',     align: 'c', searchable: true },
  { key: 'partner',  label: '공급사코드',   align: 'c', filterable: true },
  { key: 'channel',  label: '영업채널코드', align: 'c', filterable: true },
  { key: 'agent',    label: '영업자코드',   align: 'c', filterable: true },
  { key: 'car',      label: '차량번호',     align: 'c', searchable: true },
  { key: 'submodel', label: '모델명',       searchable: true },
  { key: 'customer', label: '고객명',       align: 'c', searchable: true },
  { key: 'fee',      label: '수수료',       align: 'c', searchable: true },
  { key: 'date',     label: '정산일자',     align: 'c', filterable: true },
];
const settleThead = qs('#settlement-list-head');

function renderList() {
  const visible = currentSettlements.filter(settlementVisible);
  syncTopBarPageCount(visible.length);
  renderTableGrid({
    thead: settleThead,
    tbody: list,
    columns: SETTLE_COLS,
    items: visible,
    emptyText: '등록된 정산이 없습니다.',
    selectedKey: selectedCode,
    getKey: (item) => item.settlement_code,
    onSelect: async (item) => {
      if (formMode === 'edit' && !await showConfirm('수정/등록을 중단하시겠습니까?\n저장하지 않은 내용은 사라집니다.')) return;
      fillForm(item);
    },
    getCellValue: (col, s) => {
      switch (col.key) {
        case 'status': return renderBadgeRow([{ field: 'settlement_status', value: s.settlement_status || s.status || '정산대기' }]);
        case 'process': return renderBadgeRow([{ field: 'process_status', value: getSettleProcessStatus(s) }]);
        case 'code': return escapeHtml(formatSettlementCodeDisplay(s.settlement_code));
        case 'partner': return escapeHtml(s.partner_code || s.partner_code_snapshot || '');
        case 'channel': return escapeHtml(s.agent_channel_code_snapshot || s.agent_channel_code || s.agent_company_code || '');
        case 'agent': return escapeHtml(s.agent_code_snapshot || s.agent_code || '');
        case 'car': return escapeHtml(s.car_number || s.car_number_snapshot || '');
        case 'submodel': return escapeHtml(s.model_name || s.model_name_snapshot || s.sub_model_snapshot || s.sub_model || s.vehicle_name_snapshot || s.vehicle_name || '');
        case 'customer': return escapeHtml(s.customer_name || s.customer_name_snapshot || '');
        case 'fee': { const f = Number(s.fee_amount || s.origin_fee_amount || 0); return escapeHtml(f ? f.toLocaleString('ko-KR') : ''); }
        case 'date': return escapeHtml(formatShortDate(s.completed_at || s.created_at || s.updated_at));
        default: return '';
      }
    },
    getCellText: (col, s) => {
      switch (col.key) {
        case 'status': return s.settlement_status || s.status || '정산대기';
        case 'process': return getSettleProcessStatus(s);
        case 'code': return formatSettlementCodeDisplay(s.settlement_code) || '';
        case 'partner': return s.partner_code || s.partner_code_snapshot || '';
        case 'channel': return s.agent_channel_code_snapshot || s.agent_channel_code || s.agent_company_code || '';
        case 'agent': return s.agent_code_snapshot || s.agent_code || '';
        case 'car': return s.car_number || s.car_number_snapshot || '';
        case 'submodel': return s.model_name || s.model_name_snapshot || s.sub_model_snapshot || s.sub_model || s.vehicle_name_snapshot || s.vehicle_name || '';
        case 'customer': return s.customer_name || s.customer_name_snapshot || '';
        case 'fee': { const f = Number(s.fee_amount || s.origin_fee_amount || 0); return f ? String(f) : ''; }
        case 'date': return formatYearMonth(s.completed_at || s.created_at || s.updated_at);
        default: return '';
      }
    }
  });
}


async function bootstrap() {
  try {
    const { user, profile } = await requireAuth({ roles: ['provider', 'agent', 'admin'] });
    currentProfile = { ...profile, uid: user.uid };
    renderRoleMenu(menu, profile.role);

    initFormMode();
    applyManagementButtonTones({ resetButtons: [resetButton], submitButtons: [submitButton], deleteButtons: [deleteButton] });

    resetButton?.addEventListener('click', () => { resetForm(); showToast('신규 등록 상태입니다.', 'info'); });

    chatButton?.addEventListener('click', async () => {
      if (!selectedCode) return;
      const s = currentSettlements.find(item => item.settlement_code === selectedCode);
      if (!s) return;
      const productKey = s.product_uid_snapshot || s.product_code_snapshot || '';
      if (!productKey && !s.car_number) { showToast('차량 정보가 없어 대화를 시작할 수 없습니다.', 'error'); return; }
      if (!await showConfirm('이 정산 건에 대해 대화를 시작하시겠습니까?')) return;
      try {
        showToast('대화방 연결 중...', 'progress', { duration: 0 });
        const roomId = await ensureRoom({
          productUid: productKey,
          productCode: productKey,
          providerUid: '',
          providerCompanyCode: s.partner_code || s.partner_code_snapshot || '',
          providerName: '',
          agentUid: s.agent_uid || currentProfile?.uid || '',
          agentCode: s.agent_code_snapshot || s.agent_code || currentProfile?.user_code || '',
          agentName: '',
          vehicleNumber: s.car_number || s.car_number_snapshot || '',
          modelName: s.model_name || s.model_name_snapshot || s.vehicle_name || ''
        });
        setIdleMode();
        localStorage.setItem('freepass_pending_chat_room', roomId);
        window.location.href = `/chat?room_id=${encodeURIComponent(roomId)}`;
      } catch (error) {
        showToast(`대화 연결 실패: ${error.message}`, 'error');
      }
    });

    async function handleSave() {
      const currentItem = currentSettlements.find(s => s.settlement_code === selectedCode);
      const contractCode = currentItem?.contract_code || selectedCode;
      const feeRaw = String(fields.fee_amount?.value || '').replace(/[^\d]/g, '');
      const status = fields.settlement_status?.value || '정산대기';
      const payload = {
        settlement_status: status,
        status: status,
        fee_amount: status.includes('환수') ? -Math.abs(Number(feeRaw || 0)) : Number(feeRaw || 0),
        settled_date: fields.settled_date?.value || '',
        provider_memo: fields.provider_memo?.value || '',
        agent_memo: fields.agent_memo?.value || '',
        admin_memo: fields.admin_memo?.value || '',
        confirms: {
          provider: fields.provider_confirmed?.value === 'confirmed',
          agent: fields.agent_confirmed?.value === 'confirmed',
          admin: fields.admin_confirmed?.value === 'confirmed'
        }
      };
      await updateSettlement(contractCode, payload);
      showToast(`저장 완료: ${formatSettlementCodeDisplay(selectedCode)}`, 'success');
      if (currentItem) fillForm({ ...currentItem, ...payload });
    }
    const onSubmit = createSubmitHandler({
      getFormMode: () => formMode,
      setEditMode: () => applyFormMode('edit'),
      isSelected: () => Boolean(selectedCode),
      onSave: handleSave,
      clearMessage: () => { if (message) message.textContent = ''; },
    });
    submitButton?.addEventListener('click', onSubmit);
    deleteButton?.addEventListener('click', async () => {
      if (!selectedCode) return;
      const currentItem = currentSettlements.find(s => s.settlement_code === selectedCode);
      const status = String(fields.settlement_status?.value || '').trim();
      if (['정산완료', '환수결정'].includes(status)) {
        showToast('완료건은 삭제할 수 없습니다.', 'error');
        return;
      }
      if (!await showConfirm(`선택한 정산 ${formatSettlementCodeDisplay(selectedCode)} 를 삭제할까요?`)) return;
      try {
        // 환수 레코드는 {contractCode}-CB 경로
        const firebaseKey = currentItem?.is_clawback
          ? `${currentItem.contract_code}-CB`
          : (currentItem?.contract_code || selectedCode);
        await deleteSettlement(firebaseKey);
        showToast(`삭제 완료: ${formatSettlementCodeDisplay(selectedCode)}`, 'success');
        setIdleMode();
      } catch (error) {
        showToast(`삭제 실패: ${error.message}`, 'error');
      }
    });

    // 환수 버튼 → 환수 레코드 생성 (원본 유지)
    clawbackButton?.addEventListener('click', async () => {
      if (!selectedCode) return;
      const currentItem = currentSettlements.find(s => s.settlement_code === selectedCode);
      if (currentItem?.is_clawback) { showToast('환수 레코드에는 환수를 적용할 수 없습니다.', 'error'); return; }
      const stlStatus = String(currentItem?.settlement_status || currentItem?.status || '').trim();
      if (stlStatus !== '정산완료') { showToast('정산완료 상태에서만 환수할 수 있습니다.', 'error'); return; }
      // 이미 환수 레코드가 존재하는지 확인
      const existingCB = currentSettlements.find(s => s.clawback_of === selectedCode);
      if (existingCB) { showToast(`이미 환수 처리됨: ${formatSettlementCodeDisplay(existingCB.settlement_code)}`, 'error'); return; }
      if (!await showConfirm('환수 결정하시겠습니까?\n환수코드가 생성되고 수수료가 마이너스로 반영됩니다.')) return;
      try {
        const contractCode = currentItem?.contract_code || selectedCode;
        const cbCode = await createClawback(contractCode);
        showToast(`환수 레코드 생성: ${cbCode}`, 'success');
      } catch (error) {
        showToast(`환수 실패: ${error.message}`, 'error');
      }
    });

    // 정산확인 체크 → 3개 모두 체크 시 정산완료
    CHECK_KEYS.forEach((key) => {
      fields[key]?.addEventListener('change', () => syncSettlementStatusByChecks());
    });

    // 정산상태 → 환수 시 수수료 마이너스 자동반영
    fields.settlement_status?.addEventListener('change', () => {
      const status = fields.settlement_status.value;
      const raw = String(fields.fee_amount.value || '').replace(/[^\d]/g, '');
      if (raw) fields.fee_amount.value = formatFeeDisplay(raw, status);
    });

    // 수수료 숫자만 입력 + 콤마 + 변경 시 색상 + 비우면 복원
    if (fields.fee_amount) {
      fields.fee_amount.addEventListener('input', () => {
        const raw = fields.fee_amount.value.replace(/[^\d]/g, '');
        const cursor = fields.fee_amount.selectionStart;
        const prevLen = fields.fee_amount.value.length;
        const status = fields.settlement_status?.value || '';
        fields.fee_amount.value = formatFeeDisplay(raw, status);
        const diff = fields.fee_amount.value.length - prevLen;
        fields.fee_amount.setSelectionRange(cursor + diff, cursor + diff);
        const origin = fields.fee_amount.dataset.origin || '0';
        fields.fee_amount.classList.toggle('is-changed', !!raw && raw !== origin);
      });
      fields.fee_amount.addEventListener('blur', () => {
        const raw = fields.fee_amount.value.replace(/[^\d]/g, '');
        const origin = fields.fee_amount.dataset.origin || '0';
        if (!raw && origin !== '0') {
          const status = fields.settlement_status?.value || '';
          fields.fee_amount.value = formatFeeDisplay(origin, status);
          fields.fee_amount.classList.remove('is-changed');
        }
      });
    }

    setDirtyCheck(() => formMode === 'edit');
    registerPageCleanup(() => clearDirtyCheck());

    renderSkeletonRows(list, SETTLE_COLS, 8);
    registerPageCleanup(watchSettlements((items) => {
      currentSettlements = items;
      renderList();
      if (selectedCode) {
        const selected = currentSettlements.find((item) => item.settlement_code === selectedCode);
        if (selected) fillForm(selected);
      }
    }));

    setIdleMode();
  } catch (error) {
    console.error(error);
    showToast(error.message, 'error');
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
