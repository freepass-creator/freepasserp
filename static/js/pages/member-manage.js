import { requireAuth } from '../core/auth-guard.js';
import { applyManagementButtonTones, bindFilterOverlayToggle, createManagedFormModeApplier, createSubmitHandler, syncTopBarPageCount } from '../core/management-skeleton.js';
import { qs, registerPageCleanup, runPageCleanup, roleLabel } from '../core/utils.js';
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
  return roleLabel(role) === '-' ? '미지정' : roleLabel(role);
}

function buildCompanyCodeOptions(role, selectedCode = '') {
  const items = currentPartners.filter((partner) => {
    if (partner.status === 'deleted' || partner.status === 'inactive') return false;
    if (role === 'provider') return partner.partner_type === 'provider';
    if (role === 'agent' || role === 'agent_manager') return partner.partner_type === 'sales_channel';
    return false;
  });

  const options = ['<option value="">선택</option>'];
  if (role === 'admin') {
    options.push('<option value="admin">admin / 프리패스모빌리티</option>');
  }
  items.forEach((partner) => {
    const selected = selectedCode === partner.partner_code ? 'selected' : '';
    options.push(`<option value="${partner.partner_code}" ${selected}>${partner.partner_code} / ${partner.partner_name}</option>`);
  });
  companyCodeSelect.innerHTML = options.join('');
  if (role === 'admin' && (selectedCode === 'admin' || selectedCode === 'MASTER')) companyCodeSelect.value = 'admin';
}

function syncCompanyName(code) {
  if (code === 'admin') {
    qs('#member_company_name').value = '프리패스모빌리티';
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
  const visibleMembers = members;
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

// ─── 우클릭 컨텍스트 메뉴 (요약보기 / 승인 / 수정 / 등록삭제) ──────────
function renderMemberSummaryHtml(m) {
  const title = [m.name, m.user_code || m.admin_code].filter(Boolean).join(' · ') || '-';
  const roleLabel = { admin: '관리자', agent: '영업자', agent_manager: '영업관리자', provider: '공급사' }[m.role] || m.role || '';
  const rows = [
    ['역할', roleLabel],
    ['소속', m.company_name],
    ['소속코드', m.company_code],
    ['사용자코드', m.user_code || m.admin_code],
    ['직급', m.position],
    ['이메일', m.email],
    ['연락처', m.phone],
    ['상태', m.status],
  ].filter(([, v]) => v && String(v).trim() && String(v).trim() !== '-')
   .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(String(v))}</td></tr>`).join('');
  return `<div class="pls-summary-sub" style="min-width:240px;padding:10px 12px;">
    <div class="pls-summary-sub__title">${escapeHtml(title)}</div>
    <table class="pls-summary-sub__info"><tbody>${rows || '<tr><td style="padding:12px;color:#94a3b8;text-align:center;">정보 없음</td></tr>'}</tbody></table>
  </div>`;
}

const STATUS_OPTIONS = [
  { value: 'active', label: '승인' },
  { value: 'pending', label: '대기' },
  { value: 'rejected', label: '반려' },
];
let _ctxMenu = null;
function removeCtxMenu() { if (_ctxMenu) { _ctxMenu.style.display = 'none'; _ctxMenu.remove(); _ctxMenu = null; } }
document.addEventListener('pointerdown', (e) => { if (_ctxMenu && !_ctxMenu.contains(e.target)) removeCtxMenu(); }, true);
document.addEventListener('scroll', removeCtxMenu, true);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') removeCtxMenu(); });

document.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('#member-list [data-key], #member-list .ag-row[row-id]');
  if (!row) return;
  e.preventDefault();
  removeCtxMenu();
  const uid = row.dataset.key || row.getAttribute('row-id');
  const member = currentMembers.find(m => m.uid === uid);

  const menu = document.createElement('div');
  menu.className = 'pm-ctx-menu';
  menu.innerHTML = `
    <div class="pm-ctx-sub">
      <button type="button" class="pm-ctx-item pm-ctx-item--parent">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
        요약보기
        <svg class="pm-ctx-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
      </button>
      <div class="pm-ctx-submenu">${renderMemberSummaryHtml(member || {})}</div>
    </div>
    <div class="pm-ctx-divider"></div>
    <button type="button" class="pm-ctx-item" data-action="edit">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>
      정보수정
    </button>
    <div class="pm-ctx-sub">
      <button type="button" class="pm-ctx-item pm-ctx-item--parent">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>
        상태변경
        <svg class="pm-ctx-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
      </button>
      <div class="pm-ctx-submenu">
        ${STATUS_OPTIONS.map(s =>
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
  // hover-intent
  const _menuBornAt = performance.now();
  menu.querySelectorAll('.pm-ctx-sub').forEach(sub => {
    let tmr = null;
    sub.addEventListener('mouseenter', () => {
      if (performance.now() - _menuBornAt < 500) return;
      tmr = setTimeout(() => {
        menu.querySelectorAll('.pm-ctx-sub.is-open').forEach(s => s.classList.remove('is-open'));
        sub.classList.add('is-open');
        tmr = null;
      }, 150);
    });
    sub.addEventListener('mouseleave', () => {
      if (tmr) { clearTimeout(tmr); tmr = null; }
      sub.classList.remove('is-open');
    });
  });

  menu.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'edit') {
      removeCtxMenu();
      if (member) {
        fillForm(member);
        applyMode('edit');
      }
    }
    if (action === 'status') {
      removeCtxMenu();
      try {
        await updateUserProfile(uid, { status: btn.dataset.status });
        currentMembers = await fetchUsersOnce();
        renderList(currentMembers);
        showToast(`상태 → ${STATUS_OPTIONS.find(s => s.value === btn.dataset.status)?.label || btn.dataset.status}`, 'success');
      } catch (err) {
        showToast('상태 변경 실패: ' + (err.message || err), 'error');
      }
    }
    if (action === 'delete') {
      removeCtxMenu();
      if (!await showConfirm(`${member?.name || uid}\n삭제하시겠습니까?`)) return;
      try {
        await deleteUserProfile(uid);
        showToast('삭제 완료', 'success');
        clearForm();
      } catch (err) {
        showToast('삭제 실패: ' + (err.message || err), 'error');
      }
    }
  });
});

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
  let companyCode = companyCodeSelect.value;
  let effectiveRole = role;
  if (!role) throw new Error('회원유형을 선택하세요.');
  if (!companyCode && role !== 'admin') {
    companyCode = 'SP999';
    effectiveRole = 'agent';
  }

  const selectedPartner = currentPartners.find((item) => item.partner_code === companyCode);
  const isTemp = companyCode === 'SP999';
  const payload = {
    name: qs('#member_name').value.trim(),
    position: qs('#member_position').value.trim(),
    phone: qs('#member_phone').value.trim(),
    note: qs('#member_note').value.trim(),
    role: effectiveRole,
    company_code: effectiveRole === 'admin' ? 'admin' : companyCode,
    company_name: effectiveRole === 'admin' ? '프리패스모빌리티' : (isTemp ? '임시소속' : (qs('#member_company_name').value.trim() || '')),
    matched_partner_code: effectiveRole === 'admin' ? 'admin' : companyCode,
    matched_partner_name: effectiveRole === 'admin' ? '프리패스모빌리티' : (isTemp ? '임시소속' : (selectedPartner?.partner_name || '')),
    matched_partner_type: isTemp ? 'sales_channel' : (effectiveRole === 'provider' ? 'provider' : effectiveRole === 'agent' ? 'sales_channel' : 'admin'),
    match_status: effectiveRole === 'admin' ? 'matched' : (isTemp ? 'unmatched' : (selectedPartner ? 'matched' : 'unmatched')),
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
      buildCompanyCodeOptions(roleSelect.value, roleSelect.value === 'admin' ? 'admin' : '');
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
