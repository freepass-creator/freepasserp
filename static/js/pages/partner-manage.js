import { requireAuth } from '../core/auth-guard.js';
import { applyManagementButtonTones, bindFilterOverlayToggle, createManagedFormModeApplier , syncTopBarPageCount } from '../core/management-skeleton.js';
import { qs, registerPageCleanup, runPageCleanup } from '../core/utils.js';
import { setDirtyCheck, clearDirtyCheck } from '../app.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { deletePartner, savePartner, updatePartner, watchPartners } from '../firebase/firebase-db.js';
import { renderBadgeRow } from '../shared/badge.js';
import { showToast, showConfirm } from '../core/toast.js';
import { formatShortDate, formatYearMonth } from '../core/management-format.js';
import { renderTableGrid, renderSkeletonRows } from '../core/management-list.js';
import { escapeHtml } from '../core/management-format.js';

let menu = qs('#sidebar-menu');
let form = qs('#partner-form');
let message = qs('#partner-message');
let filterToggleButton = qs('#openPartnerFilterBtn');
let filterOverlay = qs('#partnerFilterOverlay');
let list = qs('#partner-list');
let typeInput = qs('#partner_type');
let preview = qs('#partner_code_preview');
let editingCodeInput = qs('#editing_partner_code');
let statusInput = qs('#partner_status');
let resetButtons = [qs('#partner-form-reset')].filter(Boolean);
let submitButtons = [qs('#partner-submit-head')].filter(Boolean);
let deleteButtons = [qs('#partner-delete-head')].filter(Boolean);

function bindDOM() {
  menu = qs('#sidebar-menu');
  form = qs('#partner-form');
  message = qs('#partner-message');
  filterToggleButton = qs('#openPartnerFilterBtn');
  filterOverlay = qs('#partnerFilterOverlay');
  list = qs('#partner-list');
  typeInput = qs('#partner_type');
  preview = qs('#partner_code_preview');
  editingCodeInput = qs('#editing_partner_code');
  statusInput = qs('#partner_status');
  resetButtons = [qs('#partner-form-reset')].filter(Boolean);
  submitButtons = [qs('#partner-submit-head')].filter(Boolean);
  deleteButtons = [qs('#partner-delete-head')].filter(Boolean);
}

applyManagementButtonTones({ resetButtons, submitButtons, deleteButtons });

let currentPartners = [];
let mode = 'create';
let currentUid = '';
let formMode = 'create';

const applyPartnerFormMode = createManagedFormModeApplier({
  form,
  panelLabel: '파트너',
  getIdentity: () => editingCodeInput.value,
  isSelected: () => mode === 'edit',
  submitButtons,
  deleteButtons,
  defaultOptions: {
    alwaysReadOnlyIds: ['partner_code_preview'],
    editDisabledIds: ['partner_type']
  }
});

function applyFormMode(nextMode) {
  formMode = nextMode;
  applyPartnerFormMode(nextMode, { deleteEnabled: mode === 'edit' });
}

function updatePreview() {
  if (mode === 'edit' && editingCodeInput.value) {
    preview.value = editingCodeInput.value;
    return;
  }
  preview.value = typeInput.value === 'provider' ? 'RP001' : typeInput.value === 'operator' ? 'OP001' : 'SP001';
}

function setIdleMode() {
  mode = 'idle';
  editingCodeInput.value = '';
  form.reset();
  applyFormMode('idle');
  renderList(currentPartners);
}

function setCreateMode() {
  mode = 'create';
  editingCodeInput.value = '';
  form.reset();
  statusInput.value = 'active';
  updatePreview();
  applyFormMode('create');
  renderList(currentPartners);
}

function fillForm(partner) {
  mode = 'edit';
  editingCodeInput.value = partner.partner_code;
  statusInput.value = partner.status || 'active';
  typeInput.value = partner.partner_type || 'provider';
  preview.value = partner.partner_code || '';
  qs('#partner_name').value = partner.partner_name || '';
  qs('#partner_business_number').value = partner.business_number || '';
  qs('#partner_company_phone').value = partner.company_phone || '';
  qs('#partner_ceo_name').value = partner.ceo_name || '';
  if (qs('#partner_ceo_phone')) qs('#partner_ceo_phone').value = partner.ceo_phone || '';
  qs('#partner_manager_name').value = partner.manager_name || '';
  qs('#partner_manager_phone').value = partner.manager_phone || '';
  qs('#partner_address').value = partner.address || '';
  qs('#partner_email').value = partner.email || '';
  qs('#partner_fax').value = partner.fax || '';
  qs('#partner_note').value = partner.note || '';
  applyFormMode('view');
  renderList(currentPartners);
}

const PARTNER_COLS = [
  { key: 'status',   label: '파트너상태',     align: 'c', filterable: true, w: 80 },
  { key: 'type',     label: '파트너구분',     align: 'c', filterable: true, w: 80 },
  { key: 'code',     label: '파트너코드',     align: 'c', searchable: true },
  { key: 'name',     label: '파트너명',       align: 'c', searchable: true },
  { key: 'bizNo',    label: '사업자등록번호', align: 'c', searchable: true },
  { key: 'ceo',      label: '대표자',         align: 'c', searchable: true },
  { key: 'date',     label: '반영일자',       align: 'c', filterable: true },
];
const partnerThead = qs('#partner-list-head');

function renderList(partners) {
  syncTopBarPageCount(partners.length);
  renderTableGrid({
    thead: partnerThead,
    tbody: list,
    columns: PARTNER_COLS,
    items: partners,
    emptyText: '등록된 파트너가 없습니다.',
    selectedKey: editingCodeInput.value,
    getKey: (item) => item.partner_code,
    onSelect: async (item) => {
      if (formMode === 'edit' && !await showConfirm('수정/등록을 중단하시겠습니까?\n저장하지 않은 내용은 사라집니다.')) return;
      fillForm(item);
    },
    getCellValue: (col, p) => {
      switch (col.key) {
        case 'status': return renderBadgeRow([{ field: 'partner_status', value: p.status === 'active' ? '활성' : p.status === 'inactive' ? '비활성' : p.status || '-' }]);
        case 'type': return renderBadgeRow([{ field: 'partner_type', value: p.partner_type === 'provider' ? '공급사' : p.partner_type === 'operator' ? '운영사' : '영업채널' }]);
        case 'code': return escapeHtml(p.partner_code || '-');
        case 'name': return escapeHtml(p.partner_name || '');
        case 'bizNo': return escapeHtml(p.business_number || '');
        case 'ceo': return escapeHtml(p.ceo_name || '');
        case 'date': return escapeHtml(formatShortDate(p.updated_at || p.created_at));
        default: return '';
      }
    },
    getCellText: (col, p) => {
      switch (col.key) {
        case 'status': return p.status === 'active' ? '활성' : p.status === 'inactive' ? '비활성' : p.status || '-';
        case 'type': return p.partner_type === 'provider' ? '공급사' : p.partner_type === 'operator' ? '운영사' : '영업채널';
        case 'code': return p.partner_code || '';
        case 'name': return p.partner_name || '';
        case 'bizNo': return p.business_number || '';
        case 'ceo': return p.ceo_name || '';
        case 'date': return formatYearMonth(p.updated_at || p.created_at);
        default: return '';
      }
    }
  });
}

async function handleSubmit() {
  const val = (id) => qs(id)?.value?.trim() || '';
  const payload = {
    partner_type: typeInput.value,
    status: statusInput.value,
    partner_name: val('#partner_name'),
    business_number: val('#partner_business_number'),
    company_phone: val('#partner_company_phone'),
    ceo_name: val('#partner_ceo_name'),
    ceo_phone: val('#partner_ceo_phone'),
    manager_name: val('#partner_manager_name'),
    manager_phone: val('#partner_manager_phone'),
    address: val('#partner_address'),
    email: val('#partner_email'),
    fax: val('#partner_fax'),
    note: val('#partner_note'),
    created_by: currentUid
  };
  const editingCode = editingCodeInput.value.trim();
  if (!editingCode) {
    const code = await savePartner(payload);
    showToast(`저장 완료: ${code}`, 'success');
    const saved = currentPartners.find((item) => item.partner_code === code) || { ...payload, partner_code: code };
    fillForm(saved);
    applyFormMode('view');
  } else {
    await updatePartner(editingCode, payload);
    showToast(`수정 완료: ${editingCode}`, 'success');
    const saved = currentPartners.find((item) => item.partner_code === editingCode) || { ...payload, partner_code: editingCode };
    fillForm(saved);
    applyFormMode('view');
  }
}

async function handleDelete() {
  const editingCode = editingCodeInput.value.trim();
  if (!editingCode) {
    message.textContent = '삭제할 파트너를 먼저 선택하세요.';
    return;
  }
  if (!await showConfirm(`선택한 파트너 ${editingCode} 를 삭제할까요?`)) return;
  await deletePartner(editingCode);
  showToast(`삭제 완료: ${editingCode}`, 'success');
  setCreateMode();
}

async function bootstrap() {
  try {
    const { user, profile } = await requireAuth({ roles: ['admin'] });
    currentUid = user.uid;
    renderRoleMenu(menu, profile.role);
    bindFilterOverlayToggle(filterToggleButton, filterOverlay, { storageKey: 'fp.partner-filter.v1' });
    updatePreview();
    typeInput.addEventListener('change', updatePreview);
    resetButtons.forEach((button) => button?.addEventListener('click', () => { setCreateMode(); showToast('신규 등록 상태입니다.', 'info'); }));
    submitButtons.forEach((button) => button?.addEventListener('click', async () => {
      if (mode === 'edit' && formMode === 'view') {
        if (!await showConfirm('수정하시겠습니까?')) return;
        applyFormMode('edit');
        message.textContent = '';
        return;
      }
      if (!await showConfirm('저장하시겠습니까?')) return;
      form.requestSubmit();
    }));
    deleteButtons.forEach((button) => button?.addEventListener('click', async () => {
      try { await handleDelete(); } catch (error) { showToast(`삭제 실패: ${error.message}`, 'error'); }
    }));

    setDirtyCheck(() => formMode === 'edit');
    registerPageCleanup(() => clearDirtyCheck());

    renderSkeletonRows(list, PARTNER_COLS, 8);
    registerPageCleanup(watchPartners((partners) => {
      currentPartners = partners;
      renderList(currentPartners);
    }));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try { await handleSubmit(); } catch (error) { showToast(`저장 실패: ${error.message}`, 'error'); }
    });

    setIdleMode();
  } catch (error) {
    console.error(error);
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
