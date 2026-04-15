import { requireAuth } from '../core/auth-guard.js';
import { applyManagementButtonTones, bindFilterOverlayToggle, createManagedFormModeApplier, createSubmitHandler, syncTopBarPageCount } from '../core/management-skeleton.js';
import { qs, registerPageCleanup, runPageCleanup } from '../core/utils.js';
import { setDirtyCheck, clearDirtyCheck } from '../app.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { deletePartner, savePartner, updatePartner, watchPartners, fetchUsersOnce, updateUserProfile } from '../firebase/firebase-db.js';
import { storage } from '../firebase/firebase-config.js';
import { ref as sRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js';
import { renderBadgeRow } from '../shared/badge.js';
import { showToast, showConfirm } from '../core/toast.js';
import { formatPhone, formatBizNumber, bindAutoFormat } from '../core/management-format.js';
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
  // 자동 포맷
  bindAutoFormat(qs('#partner_business_number'), formatBizNumber);
  bindAutoFormat(qs('#partner_company_phone'), formatPhone);
  bindAutoFormat(qs('#partner_ceo_phone'), formatPhone);
  bindAutoFormat(qs('#partner_manager_phone'), formatPhone);
}

applyManagementButtonTones({ resetButtons, submitButtons, deleteButtons });

let currentPartners = [];
let currentUid = '';
let formMode = 'create';

const applyPartnerFormMode = createManagedFormModeApplier({
  form,
  panelLabel: '파트너',
  getIdentity: () => editingCodeInput.value,
  isSelected: () => Boolean(editingCodeInput.value),
  submitButtons,
  deleteButtons,
  defaultOptions: {
    alwaysReadOnlyIds: ['partner_code_preview'],
    editDisabledIds: ['partner_type']
  }
});

function applyFormMode(nextMode) {
  formMode = nextMode;
  applyPartnerFormMode(nextMode, { deleteEnabled: Boolean(editingCodeInput.value) });
}

function updatePreview() {
  if (editingCodeInput.value) {
    preview.value = editingCodeInput.value;
    return;
  }
  preview.value = typeInput.value === 'provider' ? 'RP***' : typeInput.value === 'operator' ? 'OP***' : 'SP***';
}

function setIdleMode() {
  editingCodeInput.value = '';
  form.reset();
  applyFormMode('idle');
  renderList(currentPartners);
}

function setCreateMode() {
  editingCodeInput.value = '';
  form.reset();
  statusInput.value = 'active';
  updatePreview();
  applyFormMode('create');
  renderList(currentPartners);
}

function fillForm(partner) {
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
  // 첨부서류 링크
  const bizLink = qs('#partner_biz_link');
  const cardLink = qs('#partner_card_link');
  if (bizLink) { bizLink.href = partner.biz_file_url || '#'; bizLink.hidden = !partner.biz_file_url; }
  if (cardLink) { cardLink.href = partner.card_file_url || '#'; cardLink.hidden = !partner.card_file_url; }
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

// ─── 우클릭 컨텍스트 메뉴 (요약보기 / 정보수정 / 등록삭제) ──────────
function renderPartnerSummaryHtml(p) {
  const title = [p.partner_code, p.partner_name].filter(Boolean).join(' · ') || '-';
  const typeLabel = p.partner_type === 'provider' ? '공급사' : p.partner_type === 'operator' ? '운영사' : '영업채널';
  const statusLabel = p.status === 'active' ? '활성' : p.status === 'inactive' ? '비활성' : (p.status || '');
  const rows = [
    ['구분', typeLabel],
    ['상태', statusLabel],
    ['파트너명', p.partner_name],
    ['사업자번호', p.business_number],
    ['대표자', p.ceo_name],
    ['대표연락처', p.ceo_phone],
    ['대표전화', p.company_phone],
    ['담당자', p.manager_name],
    ['담당자연락처', p.manager_phone],
    ['이메일', p.email],
    ['주소', p.address],
  ].filter(([, v]) => v && String(v).trim() && String(v).trim() !== '-')
   .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(String(v))}</td></tr>`).join('');
  return `<div class="pls-summary-sub" style="min-width:240px;padding:10px 12px;">
    <div class="pls-summary-sub__title">${escapeHtml(title)}</div>
    <table class="pls-summary-sub__info"><tbody>${rows || '<tr><td style="padding:12px;color:#94a3b8;text-align:center;">정보 없음</td></tr>'}</tbody></table>
  </div>`;
}

let _partnerCtxMenu = null;
function removePartnerCtxMenu() { if (_partnerCtxMenu) { _partnerCtxMenu.remove(); _partnerCtxMenu = null; } }
document.addEventListener('pointerdown', (e) => { if (_partnerCtxMenu && !_partnerCtxMenu.contains(e.target)) removePartnerCtxMenu(); }, true);
document.addEventListener('scroll', removePartnerCtxMenu, true);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') removePartnerCtxMenu(); });

document.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('#partner-list [data-key], #partner-list .ag-row[row-id]');
  if (!row) return;
  e.preventDefault();
  removePartnerCtxMenu();
  const code = row.dataset.key || row.getAttribute('row-id');
  const partner = currentPartners.find(p => p.partner_code === code);
  if (!partner) return;

  const menu = document.createElement('div');
  menu.className = 'pm-ctx-menu';
  menu.innerHTML = `
    <div class="pm-ctx-sub">
      <button type="button" class="pm-ctx-item pm-ctx-item--parent">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
        요약보기
        <svg class="pm-ctx-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
      </button>
      <div class="pm-ctx-submenu">${renderPartnerSummaryHtml(partner)}</div>
    </div>
    <div class="pm-ctx-divider"></div>
    <button type="button" class="pm-ctx-item" data-action="edit">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>
      정보수정
    </button>
    <div class="pm-ctx-divider"></div>
    <button type="button" class="pm-ctx-item pm-ctx-item--danger" data-action="delete">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
      등록삭제
    </button>
  `;
  document.body.appendChild(menu);
  _partnerCtxMenu = menu;
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
    removePartnerCtxMenu();
    if (action === 'edit') {
      fillForm(partner);
    }
    if (action === 'delete') {
      editingCodeInput.value = partner.partner_code;
      try { await handleDelete(); } catch (error) { showToast(`삭제 실패: ${error.message}`, 'error'); }
    }
  });
});


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
    const bizNum = payload.business_number?.replace(/[^0-9]/g, '');
    if (bizNum && bizNum !== '7777777777') {
      try {
        const users = await fetchUsersOnce();
        const unmatchedUsers = users.filter(u => u.company_code === 'SP999' && u.business_number?.replace(/[^0-9]/g, '') === bizNum);
        for (const u of unmatchedUsers) {
          await updateUserProfile(u.uid, {
            company_code: code, company_name: payload.partner_name,
            matched_partner_code: code, matched_partner_name: payload.partner_name,
            matched_partner_type: payload.partner_type,
            match_status: 'matched',
            role: payload.partner_type === 'provider' ? 'provider' : 'agent'
          });
        }
        if (unmatchedUsers.length) showToast(`임시소속 ${unmatchedUsers.length}명이 자동 매칭되었습니다.`, 'success');
      } catch (err) { console.error('[partner] auto-match error:', err); }
    }
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
  // 소속 직원 확인
  const { fetchUsersOnce, fetchProductsOnce } = await import('../firebase/firebase-db.js');
  const users = await fetchUsersOnce();
  const hasUsers = users.some(u => u.company_code === editingCode && u.status !== 'deleted');
  if (hasUsers) {
    showToast('소속 직원이 있는 파트너는 삭제할 수 없습니다.', 'error');
    return;
  }
  // 등록 상품 확인
  const products = await fetchProductsOnce();
  const hasProducts = products.some(p => (p.provider_company_code || p.partner_code) === editingCode && p.status !== 'deleted');
  if (hasProducts) {
    showToast('등록된 재고가 있는 파트너는 삭제할 수 없습니다.\n관리자 페이지에서 재고를 먼저 삭제하세요.', 'error');
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
    const onSubmit = createSubmitHandler({
      getFormMode: () => formMode,
      setEditMode: () => applyFormMode('edit'),
      isSelected: () => Boolean(editingCodeInput.value),
      onSave: () => form.requestSubmit(),
      clearMessage: () => { message.textContent = ''; },
    });
    submitButtons.forEach((button) => button?.addEventListener('click', onSubmit));
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

    // 첨부서류 업로드
    const bizFileInput = qs('#partner_biz_file');
    const cardFileInput = qs('#partner_card_file');
    qs('#partner_biz_upload')?.addEventListener('click', () => bizFileInput?.click());
    qs('#partner_card_upload')?.addEventListener('click', () => cardFileInput?.click());

    async function uploadPartnerFile(file, type) {
      const code = editingCodeInput.value.trim();
      if (!code) { showToast('파트너를 먼저 선택하세요.', 'info'); return; }
      const path = `partner-docs/${code}/${type}_${Date.now()}_${file.name}`;
      const fileRef = sRef(storage, path);
      showToast('업로드 중...', 'progress', { duration: 0 });
      try {
        await uploadBytes(fileRef, file);
        const url = await getDownloadURL(fileRef);
        const field = type === 'biz' ? 'biz_file_url' : 'card_file_url';
        await updatePartner(code, { [field]: url });
        showToast('업로드 완료', 'success');
        const linkEl = type === 'biz' ? qs('#partner_biz_link') : qs('#partner_card_link');
        if (linkEl) { linkEl.href = url; linkEl.hidden = false; }
      } catch (err) {
        showToast('업로드 실패', 'error');
      }
    }

    bizFileInput?.addEventListener('change', () => {
      if (bizFileInput.files?.[0]) uploadPartnerFile(bizFileInput.files[0], 'biz');
      bizFileInput.value = '';
    });
    cardFileInput?.addEventListener('change', () => {
      if (cardFileInput.files?.[0]) uploadPartnerFile(cardFileInput.files[0], 'card');
      cardFileInput.value = '';
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
