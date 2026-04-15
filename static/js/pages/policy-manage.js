import { requireAuth } from '../core/auth-guard.js';
import { applyManagementButtonTones, bindFilterOverlayToggle, createManagedFormModeApplier, createSubmitHandler, syncTopBarPageCount } from '../core/management-skeleton.js';
import { qs, registerPageCleanup, runPageCleanup } from '../core/utils.js';
import { setDirtyCheck, clearDirtyCheck } from '../app.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { deleteTerm, saveTerm, updateTerm, watchTerms, watchPartners } from '../firebase/firebase-db.js';
import { formatShortDate, formatYearMonth, safeText } from '../core/management-format.js';
import { renderTableGrid, renderSkeletonRows } from '../core/management-list.js';
import { escapeHtml } from '../core/management-format.js';
import { renderBadgeRow } from '../shared/badge.js';
import { showToast, showConfirm } from '../core/toast.js';
import {
  MONEY_FIELD_IDS,
  DIGIT_ONLY_FIELD_IDS,
  createPolicyFieldBindings,
  applyMoneyFieldFormatting,
  bindMoneyFieldFormatting,
  bindDigitOnlyFields,
  buildStructuredContent,
  buildDirectFieldPayload,
  buildLegacyFieldPayload,
  clearDetailFields,
  resolveFormValues
} from './policy-manage/helpers.js';

let menu = qs('#sidebar-menu');
let list = qs('#term-list');
let form = qs('#term-form');
let message = qs('#term-message');
let filterToggleButton = qs('#openTermFilterBtn');
let filterOverlay = qs('#termFilterOverlay');
let providerCodeInput = qs('#term_provider_code');
let previewCodeInput = qs('#term_code_preview');
let editingCodeInput = qs('#editing_term_code');
let resetButton = qs('#term-form-reset');
let submitButton = qs('#term-submit-head');
let deleteButton = qs('#term-delete-head');

function bindDOM() {
  menu = qs('#sidebar-menu');
  list = qs('#term-list');
  form = qs('#term-form');
  message = qs('#term-message');
  filterToggleButton = qs('#openTermFilterBtn');
  filterOverlay = qs('#termFilterOverlay');
  providerCodeInput = qs('#term_provider_code');
  previewCodeInput = qs('#term_code_preview');
  editingCodeInput = qs('#editing_term_code');
  resetButton = qs('#term-form-reset');
  submitButton = qs('#term-submit-head');
  deleteButton = qs('#term-delete-head');
  const rebound = createPolicyFieldBindings();
  detailFields = rebound.detailFields;
  CONTENT_LABELS = rebound.CONTENT_LABELS;
  CONTENT_KEYS = rebound.CONTENT_KEYS;
  CONTENT_LABEL_TO_KEY = rebound.CONTENT_LABEL_TO_KEY;
}

let { detailFields, CONTENT_LABELS, CONTENT_KEYS, CONTENT_LABEL_TO_KEY } = createPolicyFieldBindings();

let currentTerms = [];
let currentProfile = null;
let currentUid = '';
let availableProviders = [];
let lastSelectedCode = '';
let formMode = 'create';

let applyPolicyFormMode = null;

function initPolicyFormMode() {
  applyPolicyFormMode = createManagedFormModeApplier({
    form,
    panelLabel: '정책',
    getIdentity: () => editingCodeInput.value,
    isSelected: () => Boolean(editingCodeInput.value),
    submitButtons: [submitButton],
    deleteButtons: [deleteButton],
    defaultOptions: {
      alwaysReadOnlyIds: ['term_code_preview', 'injury_compensation_limit'],
      clearPlaceholderInView: true,
      customDisable: (field, context) => {
        const id = field.id || '';
        if (field.tagName === 'SELECT' && context.mode === 'create' && id === 'term_provider_code' && currentProfile?.role !== 'admin') {
          return true;
        }
        return false;
      }
    }
  });
}

function applyFormMode(nextMode) {
  formMode = nextMode;
  if (!applyPolicyFormMode) return;
  applyPolicyFormMode(nextMode, { deleteEnabled: Boolean(editingCodeInput.value) });
}


function renderProviderOptions(selectedCode = '') {
  if (currentProfile?.role === 'admin') {
    const providers = availableProviders.filter((item) => item.partner_type === 'provider' && item.status !== 'inactive' && item.status !== 'deleted');
    providerCodeInput.disabled = false;
    providerCodeInput.innerHTML = providers.length
      ? providers.map((partner) => `<option value="${partner.partner_code}">${partner.partner_code} / ${partner.partner_name}</option>`).join('')
      : '<option value="">등록된 공급사 없음</option>';
    if (selectedCode && providers.some((item) => item.partner_code === selectedCode)) {
      providerCodeInput.value = selectedCode;
    } else if (!providers.some((item) => item.partner_code === providerCodeInput.value)) {
      providerCodeInput.value = providers[0]?.partner_code || '';
    }
    return;
  }
  providerCodeInput.innerHTML = '';
  const code = currentProfile?.company_code || '';
  const label = currentProfile?.company_name ? `${code} / ${currentProfile.company_name}` : code;
  providerCodeInput.innerHTML = `<option value="${code}">${label}</option>`;
  providerCodeInput.value = code;
  providerCodeInput.disabled = true;
}

function updatePreviewCode() {
  const providerCode = providerCodeInput.value || currentProfile?.company_code || '';
  previewCodeInput.value = providerCode ? `${providerCode}_T***` : '공급사코드를 먼저 선택하세요';
}

function setIdleMode() {
  editingCodeInput.value = '';
  lastSelectedCode = '';
  applyFormMode('idle');
  renderList(currentTerms);
}

function setCreateMode(selectedProviderCode = '') {
  editingCodeInput.value = '';
  lastSelectedCode = '';
  form.reset();
  clearDetailFields(detailFields);
  detailFields.injury_compensation_limit.value = '무한';
  detailFields.screening_criteria.value = '무심사';
  detailFields.credit_grade.value = '저신용';
  detailFields.basic_driver_age.value = '만 26세 이상';
  detailFields.annual_mileage.value = '3만Km';
  detailFields.driver_age_lowering.value = '불가';
  detailFields.personal_driver_scope.value = '계약자 본인+직계가족';
  detailFields.business_driver_scope.value = '계약사업자 임직원 및 관계자';
  detailFields.additional_driver_allowance_count.value = '불가';
  detailFields.additional_driver_cost.value = '불가';
  detailFields.age_lowering_cost.value = '대여료의 10%';
  detailFields.mileage_upcharge_per_10000km.value = '대여료의 10%';
  detailFields.deposit_installment.value = '불가능';
  detailFields.deposit_card_payment.value = '가능';
  detailFields.rental_region.value = '전국';
  detailFields.maintenance_service.value = '불포함';
  detailFields.annual_roadside_assistance.value = '연간 5회';
  detailFields.insurance_included.value = '보험료 포함';
  detailFields.property_compensation_limit.value = '1억원';
  detailFields.self_body_accident.value = '1억원';
  detailFields.uninsured_damage.value = '2억원';
  detailFields.own_damage_compensation.value = '차량가액';
  detailFields.own_damage_repair_ratio.value = '20';
  detailFields.injury_deductible.value = '없음';
  detailFields.property_deductible.value = '30만원';
  detailFields.self_body_deductible.value = '없음';
  detailFields.uninsured_deductible.value = '없음';
  detailFields.own_damage_min_deductible.value = '50만원';
  detailFields.own_damage_max_deductible.value = '100만원';
  applyMoneyFieldFormatting(MONEY_FIELD_IDS);
  renderProviderOptions(selectedProviderCode || currentProfile?.company_code || '');
  updatePreviewCode();
  applyFormMode('create');
  renderList(currentTerms);
}

function fillForm(term) {
  editingCodeInput.value = term.term_code || '';
  lastSelectedCode = term.term_code || '';
  renderProviderOptions(term.provider_company_code || '');
  previewCodeInput.value = term.term_code || '';
  qs('#term_name_input').value = term.term_name || '';

  clearDetailFields(detailFields);
  const resolved = resolveFormValues(term, CONTENT_LABEL_TO_KEY);
  CONTENT_KEYS.forEach((key) => {
    if (!detailFields[key]) return;
    // 직접 저장된 필드값 우선, 없으면 content 파싱값
    const val = (term[key] != null && String(term[key]).trim() !== '') ? String(term[key]).trim() : (resolved[key] || (key === 'injury_compensation_limit' ? '무한' : ''));
    detailFields[key].value = val;
    // select에 매칭 옵션이 없으면 동적 추가
    if (val && detailFields[key].tagName === 'SELECT' && detailFields[key].value !== val) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      detailFields[key].appendChild(opt);
      detailFields[key].value = val;
    }
  });

  applyMoneyFieldFormatting(MONEY_FIELD_IDS);
  applyFormMode('view');
  renderList(currentTerms);
}

const TERM_COLS = [
  { key: 'status',      label: '정책상태',   align: 'c', filterable: true, w: 80 },
  { key: 'partner',     label: '공급사코드', align: 'c', filterable: true },
  { key: 'code',        label: '정책코드',   align: 'c', searchable: true },
  { key: 'partnerName', label: '공급사명',   align: 'c', searchable: true },
  { key: 'name',        label: '정책명',     searchable: true },
  { key: 'desc',        label: '정책설명',   maxW: 160, searchable: true },
  { key: 'date',        label: '반영일자',   align: 'c', filterable: true },
];
const termThead = qs('#term-list-head');

// ─── 우클릭 컨텍스트 메뉴 (요약보기 / 정보수정 / 등록삭제) ──────────
function renderPolicySummaryHtml(t) {
  const partner = availableProviders.find(i => i.partner_code === t.provider_company_code);
  const title = [t.term_code, t.term_name].filter(Boolean).join(' · ') || '-';
  const rows = [
    ['정책상태', t.status === 'inactive' ? '비활성' : '활성'],
    ['공급사', t.provider_company_code],
    ['공급사명', partner?.partner_name],
    ['정책명', t.term_name],
    ['설명', t.term_description],
  ].filter(([, v]) => v && String(v).trim() && String(v).trim() !== '-')
   .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(String(v))}</td></tr>`).join('');
  return `<div class="pls-summary-sub" style="min-width:240px;padding:10px 12px;">
    <div class="pls-summary-sub__title">${escapeHtml(title)}</div>
    <table class="pls-summary-sub__info"><tbody>${rows || '<tr><td style="padding:12px;color:#94a3b8;text-align:center;">정보 없음</td></tr>'}</tbody></table>
  </div>`;
}

let _policyCtxMenu = null;
function removePolicyCtxMenu() { if (_policyCtxMenu) { _policyCtxMenu.remove(); _policyCtxMenu = null; } }
document.addEventListener('pointerdown', (e) => { if (_policyCtxMenu && !_policyCtxMenu.contains(e.target)) removePolicyCtxMenu(); }, true);
document.addEventListener('scroll', removePolicyCtxMenu, true);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') removePolicyCtxMenu(); });

document.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('#term-list [data-key], #term-list .ag-row[row-id]');
  if (!row) return;
  e.preventDefault();
  removePolicyCtxMenu();
  const code = row.dataset.key || row.getAttribute('row-id');
  const term = currentTerms.find(t => t.term_code === code);
  if (!term) return;

  const menu = document.createElement('div');
  menu.className = 'pm-ctx-menu';
  menu.innerHTML = `
    <div class="pm-ctx-sub">
      <button type="button" class="pm-ctx-item pm-ctx-item--parent">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
        요약보기
        <svg class="pm-ctx-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
      </button>
      <div class="pm-ctx-submenu">${renderPolicySummaryHtml(term)}</div>
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
  _policyCtxMenu = menu;
  menu.style.cssText = `position:fixed;top:${e.clientY}px;left:${e.clientX}px;z-index:9999;`;
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 8}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 8}px`;
  });
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
    removePolicyCtxMenu();
    if (action === 'edit') {
      fillForm(term);
    }
    if (action === 'delete') {
      editingCodeInput.value = term.term_code;
      try { await handleDelete(); } catch (error) { showToast(`삭제 실패: ${error.message}`, 'error'); }
    }
  });
});


function renderList(terms) {
  syncTopBarPageCount(terms.length);
  renderTableGrid({
    thead: termThead,
    tbody: list,
    columns: TERM_COLS,
    items: terms,
    emptyText: '등록된 정책이 없습니다.',
    selectedKey: editingCodeInput.value,
    getKey: (item) => item.term_code,
    onSelect: async (item) => {
      if (formMode === 'edit' && !await showConfirm('수정/등록을 중단하시겠습니까?\n저장하지 않은 내용은 사라집니다.')) return;
      fillForm(item);
    },
    getCellValue: (col, t) => {
      switch (col.key) {
        case 'status': return renderBadgeRow([{ field: 'term_status', value: t.status === 'inactive' ? '비활성' : '활성' }]);
        case 'code': return escapeHtml(safeText(t.term_code));
        case 'partner': return escapeHtml(t.provider_company_code || '');
        case 'partnerName': { const p = availableProviders.find(i => i.partner_code === t.provider_company_code); return escapeHtml(p?.partner_name || ''); }
        case 'name': return escapeHtml(t.term_name || '');
        case 'desc': return escapeHtml(t.term_description || '');
        case 'date': return escapeHtml(formatShortDate(t.updated_at || t.created_at));
        default: return '';
      }
    },
    getCellText: (col, t) => {
      switch (col.key) {
        case 'status': return t.status === 'inactive' ? '비활성' : '활성';
        case 'code': return t.term_code || '';
        case 'partner': return t.provider_company_code || '';
        case 'partnerName': { const p = availableProviders.find(i => i.partner_code === t.provider_company_code); return p?.partner_name || ''; }
        case 'name': return t.term_name || '';
        case 'desc': return t.term_description || '';
        case 'date': return formatYearMonth(t.updated_at || t.created_at);
        default: return '';
      }
    }
  });
}

function findTermByCode(code) {
  return currentTerms.find((item) => item.term_code === code) || null;
}

function keepEditState(termCode, payload) {
  const current = findTermByCode(termCode) || {};
  const merged = {
    ...current,
    ...payload,
    term_code: termCode,
    provider_company_code: payload.provider_company_code || current.provider_company_code || '',
    term_name: payload.term_name || current.term_name || '',
    content: payload.content || current.content || ''
  };
  fillForm(merged);
}

async function handleSubmit() {
  // disabled select도 value를 읽을 수 있도록 잠시 해제
  const wasDisabled = providerCodeInput?.disabled;
  if (wasDisabled) providerCodeInput.disabled = false;
  const providerCode = providerCodeInput?.value || currentProfile?.company_code || '';
  if (wasDisabled) providerCodeInput.disabled = true;
  if (!providerCode) throw new Error('공급사코드를 선택하세요.');

  const termNameInput = qs('#term_name_input');
  const termName = termNameInput?.value?.trim() || '';
  if (!termName) throw new Error('정책명을 입력하세요.');

  const directPayload = buildDirectFieldPayload(detailFields);
  const payload = {
    provider_company_code: providerCode,
    term_name: termName,
    term_description: directPayload.term_description || '',
    content: buildStructuredContent(detailFields, CONTENT_KEYS, CONTENT_LABELS),
    ...directPayload,
    ...buildLegacyFieldPayload(directPayload),
    status: 'active',
    created_by: currentUid
  };

  const editingCode = editingCodeInput.value.trim();
  if (!editingCode) {
    const termCode = await saveTerm(payload);
    lastSelectedCode = termCode;
    keepEditState(termCode, payload);
    applyFormMode('view');
    showToast(`저장 완료: ${termCode}`, 'success');
    return;
  }
  await updateTerm(editingCode, payload);
  lastSelectedCode = editingCode;
  keepEditState(editingCode, payload);
  applyFormMode('view');
  showToast(`수정 완료: ${editingCode}`, 'success');
}

async function handleDelete() {
  const editingCode = editingCodeInput.value.trim();
  if (!editingCode) {
    showToast('삭제할 정책을 먼저 선택하세요.', 'info');
    return;
  }
  if (!await showConfirm(`선택한 정책 ${editingCode} 를 삭제할까요?`)) return;
  await deleteTerm(editingCode);
  showToast(`삭제 완료: ${editingCode}`, 'success');
  lastSelectedCode = '';
  setCreateMode(providerCodeInput.value || currentProfile?.company_code || '');
}

async function bootstrap() {
  try {
    const { user, profile } = await requireAuth({ roles: ['provider', 'admin'] });
    currentUid = user.uid;
    currentProfile = profile;
    renderRoleMenu(menu, profile.role);
    initPolicyFormMode();
    applyManagementButtonTones({ resetButtons: [resetButton], submitButtons: [submitButton], deleteButtons: [deleteButton] });
    bindFilterOverlayToggle(filterToggleButton, filterOverlay, { storageKey: 'fp.policy-filter.v1' });

    registerPageCleanup(watchPartners((partners) => {
      availableProviders = partners;
      renderProviderOptions(providerCodeInput.value || profile.company_code || '');
      if (!editingCodeInput.value) updatePreviewCode();
    }));

    resetButton?.addEventListener('click', () => { setCreateMode(); showToast('신규 등록 상태입니다.', 'info'); });
    const onSubmit = createSubmitHandler({
      getFormMode: () => formMode,
      setEditMode: () => applyFormMode('edit'),
      isSelected: () => Boolean(editingCodeInput.value),
      onSave: handleSubmit,
      clearMessage: () => { if (message) message.textContent = ''; },
    });
    submitButton?.addEventListener('click', onSubmit);
    deleteButton?.addEventListener('click', async () => {
      try {
        await handleDelete();
      } catch (error) {
        showToast(`삭제 실패: ${error.message}`, 'error');
      }
    });

    setDirtyCheck(() => formMode === 'edit');
    registerPageCleanup(() => clearDirtyCheck());

    renderSkeletonRows(list, TERM_COLS, 8);
    registerPageCleanup(watchTerms((terms) => {
      currentTerms = profile.role === 'admin' ? terms : terms.filter((term) => term.provider_company_code === profile.company_code);
      renderList(currentTerms);
      if (lastSelectedCode) {
        const selected = findTermByCode(lastSelectedCode);
        if (selected) {
          fillForm(selected);
          return;
        }
      }
      if (!editingCodeInput.value && formMode !== 'idle') setCreateMode(providerCodeInput.value || profile.company_code || '');
    }));

    providerCodeInput.addEventListener('change', updatePreviewCode);
    bindMoneyFieldFormatting(MONEY_FIELD_IDS);
    bindDigitOnlyFields(DIGIT_ONLY_FIELD_IDS, MONEY_FIELD_IDS);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await handleSubmit();
      } catch (error) {
        showToast(`저장 실패: ${error.message}`, 'error');
      }
    });

    setIdleMode();
  } catch (error) {
    console.error('[policy] bootstrap error', error);
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
