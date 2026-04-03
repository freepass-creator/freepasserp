import { requireAuth } from '../core/auth-guard.js';
import { applyManagementButtonTones, bindFilterOverlayToggle, createManagedFormModeApplier, createSubmitHandler, syncTopBarPageCount } from '../core/management-skeleton.js';
import { qs, registerPageCleanup, runPageCleanup } from '../core/utils.js';
import { setDirtyCheck, clearDirtyCheck } from '../app.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { deleteUserProfile, fetchPartnersOnce, fetchUsersOnce, updateUserProfile, watchUsers } from '../firebase/firebase-db.js';
import { renderBadgeRow } from '../shared/badge.js';
import { formatShortDate, formatYearMonth, formatPhone, bindAutoFormat } from '../core/management-format.js';
import { renderTableGrid, renderSkeletonRows } from '../core/management-list.js';
import { escapeHtml } from '../core/management-format.js';
import { showToast, showConfirm } from '../core/toast.js';

let menu = qs('#sidebar-menu');
let form = qs('#member-form');
let message = qs('#member-message');
let filterToggleButton = qs('#openMemberFilterBtn');
let filterOverlay = qs('#memberFilterOverlay');
let list = qs('#member-list');
let editingUidInput = qs('#editing_member_uid');
let refreshButton = qs('#member-refresh');
let submitButton = qs('#member-submit-head');
let deleteButton = qs('#member-delete-head');
let roleSelect = qs('#member_role_select');
let companyCodeSelect = qs('#member_company_code_select');

function bindDOM() {
  menu = qs('#sidebar-menu');
  form = qs('#member-form');
  message = qs('#member-message');
  filterToggleButton = qs('#openMemberFilterBtn');
  filterOverlay = qs('#memberFilterOverlay');
  list = qs('#member-list');
  editingUidInput = qs('#editing_member_uid');
  refreshButton = qs('#member-refresh');
  submitButton = qs('#member-submit-head');
  deleteButton = qs('#member-delete-head');
  roleSelect = qs('#member_role_select');
  companyCodeSelect = qs('#member_company_code_select');
  bindAutoFormat(qs('#member_phone'), formatPhone);
}

applyManagementButtonTones({ neutralButtons: [refreshButton], submitButtons: [submitButton], deleteButtons: [deleteButton] });

let currentMembers = [];
let currentPartners = [];
let selectedUid = '';
let formMode = 'view';

const applyMemberFormMode = createManagedFormModeApplier({
  form,
  panelLabel: '회원',
  getIdentity: () => qs('#member_user_code')?.value || qs('#member_email')?.value || selectedUid,
  isSelected: () => Boolean(selectedUid),
  submitButtons: [submitButton],
  deleteButtons: [deleteButton],
  defaultOptions: {
    alwaysReadOnlyIds: ['editing_member_uid', 'member_user_code', 'member_email', 'member_business_number', 'member_match_result', 'member_company_name']
  }
});

function statusLabel(status) {
  if (status === 'active') return '승인';
  if (status === 'rejected') return '반려';
  return '대기';
}

function badgeRoleLabel(role) {
  if (role === 'admin') return '관리자';
  if (role === 'provider') return '공급사';
  if (role === 'agent') return '영업자';
  return '미지정';
}

function buildCompanyCodeOptions(role, selectedCode = '') {
  const items = currentPartners.filter((partner) => {
    if (partner.status === 'deleted' || partner.status === 'inactive') return false;
    if (role === 'provider') return partner.partner_type === 'provider';
    if (role === 'agent') return partner.partner_type === 'sales_channel';
    return false;
  });

  const options = ['<option value="">선택</option>'];
  if (role === 'admin') {
    options.push('<option value="MASTER">MASTER</option>');
  }
  items.forEach((partner) => {
    const selected = selectedCode === partner.partner_code ? 'selected' : '';
    options.push(`<option value="${partner.partner_code}" ${selected}>${partner.partner_code} / ${partner.partner_name}</option>`);
  });
  companyCodeSelect.innerHTML = options.join('');
  if (role === 'admin' && selectedCode === 'MASTER') companyCodeSelect.value = 'MASTER';
}

function syncCompanyName(code) {
  if (code === 'MASTER') {
    qs('#member_company_name').value = 'FREEPASS';
    return;
  }
  const partner = currentPartners.find((item) => item.partner_code === code);
  qs('#member_company_name').value = partner?.partner_name || '';
}

function applyMode(mode) {
  formMode = mode;
  const hasSelection = Boolean(selectedUid);
  const normalizedMode = mode === 'idle' ? 'idle' : (hasSelection ? mode : 'view');

  applyMemberFormMode(normalizedMode, { deleteEnabled: hasSelection && mode !== 'idle' });

  if (mode === 'idle') return;
  if (!hasSelection) {
    submitButton.disabled = true;
    deleteButton.disabled = true;
  } else {
    submitButton.disabled = false;
    deleteButton.disabled = false;
  }
}

function clearForm() {
  editingUidInput.value = '';
  selectedUid = '';
  form.reset();
  qs('#member_user_code').value = '';
  qs('#member_email').value = '';
  qs('#member_name').value = '';
  qs('#member_business_number').value = '';
  qs('#member_match_result').value = '매칭되는 코드 없음';
  qs('#member_company_name').value = '';
  roleSelect.value = '';
  buildCompanyCodeOptions('', '');
  applyMode('view');
  renderList(currentMembers);
}

function fillForm(member) {
  editingUidInput.value = member.uid;
  selectedUid = member.uid;
  qs('#member_user_code').value = member.user_code || member.admin_code || '-';
  qs('#member_email').value = member.email || '';
  qs('#member_name').value = member.name || '';
  qs('#member_business_number').value = member.business_number || '';
  qs('#member_match_result').value = member.matched_partner_code ? `${member.matched_partner_code} / ${member.matched_partner_name || ''}` : '매칭되는 코드 없음';
  roleSelect.value = member.role || '';
  buildCompanyCodeOptions(member.role || '', member.company_code || '');
  syncCompanyName(member.company_code || '');
  qs('#member_status').value = member.status || 'pending';
  qs('#member_position').value = member.position || '';
  qs('#member_phone').value = member.phone || '';
  qs('#member_note').value = member.note || '';
  applyMode('view');
  renderList(currentMembers);
}

const MEMBER_COLS = [
  { key: 'status',      label: '회원상태',   align: 'c', filterable: true, w: 80 },
  { key: 'role',        label: '회원구분',   align: 'c', filterable: true, w: 80 },
  { key: 'companyCode', label: '회사코드',   align: 'c', filterable: true },
  { key: 'company',     label: '회사명',     align: 'c', searchable: true },
  { key: 'code',        label: '사용자코드', align: 'c', searchable: true },
  { key: 'email',       label: '이메일',     searchable: true },
  { key: 'name',        label: '이름',       align: 'c', searchable: true },
  { key: 'date',        label: '반영일자',   align: 'c', filterable: true },
];
const memberThead = qs('#member-list-head');

function renderList(members) {
  syncTopBarPageCount(members.length);
  const visibleMembers = members.filter((member) => member.email !== 'dudguq@gmail.com');
  renderTableGrid({
    thead: memberThead,
    tbody: list,
    columns: MEMBER_COLS,
    items: visibleMembers,
    emptyText: '등록된 회원이 없습니다.',
    selectedKey: selectedUid,
    getKey: (item) => item.uid,
    onSelect: async (item) => {
      if (formMode === 'edit' && !await showConfirm('수정/등록을 중단하시겠습니까?\n저장하지 않은 내용은 사라집니다.')) return;
      fillForm(item);
    },
    getCellValue: (col, m) => {
      switch (col.key) {
        case 'status': return renderBadgeRow([{ field: 'member_status', value: statusLabel(m.status) }]);
        case 'role': return renderBadgeRow([{ field: 'member_role', value: badgeRoleLabel(m.role) }]);
        case 'companyCode': return escapeHtml(m.company_code || '');
        case 'company': return escapeHtml(m.company_name || '');
        case 'code': return escapeHtml(m.user_code || m.admin_code || '-');
        case 'email': return escapeHtml(m.email || '');
        case 'name': return escapeHtml(m.name || '');
        case 'date': return escapeHtml(formatShortDate(m.updated_at || m.created_at));
        default: return '';
      }
    },
    getCellText: (col, m) => {
      switch (col.key) {
        case 'status': return statusLabel(m.status);
        case 'role': return badgeRoleLabel(m.role);
        case 'companyCode': return m.company_code || '';
        case 'company': return m.company_name || '';
        case 'code': return m.user_code || m.admin_code || '';
        case 'email': return m.email || '';
        case 'name': return m.name || '';
        case 'date': return formatYearMonth(m.updated_at || m.created_at);
        default: return '';
      }
    }
  });
}

async function refreshMembers() {
  currentPartners = await fetchPartnersOnce();
  currentMembers = await fetchUsersOnce();
  renderList(currentMembers);
  showToast('새로고침 완료', 'success');
}

async function handleSave() {
  const editingUid = editingUidInput.value.trim();
  if (!editingUid) {
    message.textContent = '수정할 회원을 먼저 선택하세요.';
    return;
  }
  const role = roleSelect.value;
  const companyCode = companyCodeSelect.value;
  if (!role) throw new Error('회원유형을 선택하세요.');
  if (!companyCode && role !== 'admin') throw new Error('소속코드를 선택하세요.');

  const selectedPartner = currentPartners.find((item) => item.partner_code === companyCode);
  const payload = {
    name: qs('#member_name').value.trim(),
    position: qs('#member_position').value.trim(),
    phone: qs('#member_phone').value.trim(),
    note: qs('#member_note').value.trim(),
    role,
    company_code: role === 'admin' ? 'MASTER' : companyCode,
    company_name: qs('#member_company_name').value.trim() || (role === 'admin' ? 'FREEPASS' : ''),
    matched_partner_code: role === 'admin' ? 'MASTER' : companyCode,
    matched_partner_name: role === 'admin' ? 'FREEPASS' : (selectedPartner?.partner_name || ''),
    matched_partner_type: role === 'provider' ? 'provider' : role === 'agent' ? 'sales_channel' : 'admin',
    match_status: role === 'admin' ? 'matched' : (selectedPartner ? 'matched' : 'unmatched'),
    status: qs('#member_status').value
  };

  await updateUserProfile(editingUid, payload);
  const refreshed = await fetchUsersOnce();
  currentMembers = refreshed;
  const selected = refreshed.find((item) => item.uid === editingUid);
  if (selected) fillForm(selected);
  applyMode('view');
  showToast(`수정 완료: ${editingUid}`, 'success');
}

async function handleDelete() {
  const editingUid = editingUidInput.value.trim();
  if (!editingUid) {
    message.textContent = '삭제할 회원을 먼저 선택하세요.';
    return;
  }
  if (!await showConfirm('선택한 회원을 삭제 처리할까요?')) return;
  await deleteUserProfile(editingUid);
  showToast(`삭제 완료: ${editingUid}`, 'success');
  clearForm();
}

async function bootstrap() {
  try {
    const { profile } = await requireAuth({ roles: ['admin'] });
    renderRoleMenu(menu, profile.role);
    bindFilterOverlayToggle(filterToggleButton, filterOverlay, { storageKey: 'fp.member-filter.v1' });
    currentPartners = await fetchPartnersOnce();
    setDirtyCheck(() => formMode === 'edit');
    registerPageCleanup(() => clearDirtyCheck());

    roleSelect?.addEventListener('change', () => {
      buildCompanyCodeOptions(roleSelect.value, roleSelect.value === 'admin' ? 'MASTER' : '');
      syncCompanyName(companyCodeSelect.value);
    });
    companyCodeSelect?.addEventListener('change', () => syncCompanyName(companyCodeSelect.value));
    refreshButton?.addEventListener('click', async () => {
      try { await refreshMembers(); } catch (error) { showToast(`새로고침 실패: ${error.message}`, 'error'); }
    });
    const onSubmit = createSubmitHandler({
      getFormMode: () => formMode,
      setEditMode: () => applyMode('edit'),
      isSelected: () => Boolean(selectedUid),
      onSave: handleSave,
    });
    submitButton?.addEventListener('click', onSubmit);
    deleteButton?.addEventListener('click', async () => {
      try { await handleDelete(); } catch (error) { showToast(`삭제 실패: ${error.message}`, 'error'); }
    });

    renderSkeletonRows(list, MEMBER_COLS, 8);
    registerPageCleanup(watchUsers((users) => {
      currentMembers = users;
      renderList(currentMembers);
    }));
    applyMode('idle');
    renderList(currentMembers);
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
