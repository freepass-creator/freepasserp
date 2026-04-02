import { requireAuth } from './auth-guard.js';
import { qs } from './utils.js';
import { renderRoleMenu } from './role-menu.js';
import { bindManagedFieldState, syncManagedFieldState } from './management-fields.js';
import { showConfirm, showToast } from './toast.js';
import {
  UI_FORM_MODE,
  composePanelHeadTitle as composePanelHeadTitleBase,
  composePanelModeTitle as composePanelModeTitleBase,
  setFormUiModeClass
} from './ui-standards.js';

export function composePanelHeadTitle(identity, name, panelLabel) {
  return composePanelHeadTitleBase(identity, panelLabel);
}

export function composePanelModeTitle(baseLabel, panelMode = UI_FORM_MODE.VIEW) {
  return composePanelModeTitleBase(baseLabel, panelMode);
}

export function updateDetailPanelTitle(form, baseLabel) {
  const title = form?.closest('.panel')?.querySelector('.panel-head-title');
  if (!title) return;
  const base = String(baseLabel || '').trim();
  const suffix = '정보';
  title.textContent = base ? `${base}${suffix}` : suffix;
}



export function resolveManagedPanelTitle({ panelLabel = '', identity = '', selected = false } = {}) {
  return String(panelLabel || '').trim();
}


export function resolveManagedPanelStateTitle({ panelLabel = '' } = {}) {
  const base = String(panelLabel || '').trim();
  return base ? `${base}정보` : '정보';
}

export function syncManagedPanelHead(options = {}) {
  const {
    form,
    panel,
    panelLabel = '',
  } = options;

  const panelNode = panel || form?.closest('.panel') || null;
  if (!panelNode) return;

  const titleNode = panelNode.querySelector('.panel-head-title');
  if (titleNode) {
    titleNode.textContent = resolveManagedPanelStateTitle({ panelLabel });
  }
}

function _syncTopBarWorkState(mode, identity) {
  const sep    = document.getElementById('topBarStateSep');
  const identEl = document.getElementById('topBarIdentity');
  const badge  = document.getElementById('topBarWorkBadge');
  if (!sep || !badge) return;

  const identText = mode === 'create' ? '신규' : (String(identity || '').trim());
  const modeLabel = mode === 'edit' ? '수정 중' : mode === 'create' ? '등록 중' : '';

  const hasContent = mode !== 'idle' && mode !== 'view' && (identText || modeLabel);
  sep.hidden = !hasContent;

  if (identEl) {
    if (mode === 'view' && identText) {
      identEl.textContent = identText;
      identEl.hidden = false;
      sep.hidden = false;
    } else if (hasContent) {
      identEl.textContent = identText;
      identEl.hidden = !identText;
    } else {
      identEl.textContent = '';
      identEl.hidden = true;
    }
  }

  badge.textContent = modeLabel;
}

/** 상단바 페이지명에 건수 표시 */
export function syncTopBarPageCount(count) {
  const el = document.querySelector('.top-bar-page-name');
  if (!el) return;
  const base = el.textContent.replace(/\s*\(.*\)$/, '').trim();
  el.textContent = count > 0 ? `${base} (${count}건)` : base;
}

function normalizeFormMode(mode) {
  if (mode === UI_FORM_MODE.IDLE) return UI_FORM_MODE.IDLE;
  if (mode === UI_FORM_MODE.CREATE) return UI_FORM_MODE.CREATE;
  if (mode === UI_FORM_MODE.VIEW) return UI_FORM_MODE.VIEW;
  return UI_FORM_MODE.EDIT;
}

function resolveOverride(overrides, key, fallback) {
  return Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : fallback;
}

export function createManagedFormModeApplier(options = {}) {
  const {
    form,
    panelLabel = '',
    getIdentity,
    isSelected,
    submitButtons = [],
    deleteButtons = [],
    defaultOptions = {}
  } = options;

  bindManagedFieldState(form);

  return function applyMode(mode, overrides = {}) {
    const selected = typeof overrides.selected === 'boolean'
      ? overrides.selected
      : (typeof isSelected === 'function' ? Boolean(isSelected()) : Boolean(isSelected));
    const identity = resolveOverride(overrides, 'identity',
      typeof getIdentity === 'function' ? getIdentity() : getIdentity);
    const titleLabel = resolveOverride(overrides, 'titleLabel',
      resolveManagedPanelTitle({ panelLabel, identity, selected }));

    return applyManagedFormMode({
      ...defaultOptions,
      ...overrides,
      form,
      mode,
      identity,
      titleLabel,
      submitButtons: resolveOverride(overrides, 'submitButtons', submitButtons),
      deleteButtons: resolveOverride(overrides, 'deleteButtons', deleteButtons)
    });
  };
}

export function setButtonTone(button, tone) {
  if (!button) return;
  button.classList.remove('btn-tone-neutral', 'btn-tone-edit', 'btn-tone-save', 'btn-tone-delete', 'btn-tone-hide', 'btn-tone-share', 'btn-tone-inquiry', 'btn-tone-contract', 'btn-danger');
  if (tone) button.classList.add(tone);
  if (tone === 'btn-tone-delete') button.classList.add('btn-danger');
}

export function syncEditSaveButtonTone(button, viewMode) {
  setButtonTone(button, viewMode ? 'btn-tone-edit' : 'btn-tone-save');
}

export function applyManagementButtonTones(options = {}) {
  const {
    resetButtons = [],
    neutralButtons = [],
    submitButtons = [],
    deleteButtons = [],
    hideButtons = []
  } = options;

  asArray(resetButtons).forEach((button) => setButtonTone(button, 'btn-tone-neutral'));
  asArray(neutralButtons).forEach((button) => setButtonTone(button, 'btn-tone-neutral'));
  asArray(submitButtons).forEach((button) => syncEditSaveButtonTone(button, true));
  asArray(deleteButtons).forEach((button) => setButtonTone(button, 'btn-tone-delete'));
  asArray(hideButtons).forEach((button) => setButtonTone(button, 'btn-tone-hide'));
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function asSet(values) {
  return new Set(asArray(values));
}

export function applyManagedFormMode(options = {}) {
  const {
    form,
    mode = 'view',
    identity = '',
    titleLabel = '',
    titleBuilder,
    submitButtons = [],
    deleteButtons = [],
    deleteEnabled = false,
    alwaysReadOnlyIds = [],
    alwaysDisabledIds = [],
    editDisabledIds = [],
    submitLabels = { view: '수정', edit: '저장', create: '저장' },
    writeDatasetMode = true,
    clearPlaceholderInView = false,
    customDisable,
    customReadOnly,
    afterFieldUpdate
  } = options;

  const normalizedMode = normalizeFormMode(mode);
  const isView = normalizedMode === UI_FORM_MODE.VIEW;
  const isIdle = normalizedMode === UI_FORM_MODE.IDLE;
  const resolvedTitleLabel = typeof titleBuilder === 'function'
    ? titleBuilder({ mode: normalizedMode, titleLabel })
    : (typeof titleLabel === 'function' ? titleLabel() : titleLabel);
  const readOnlyIds = asSet(alwaysReadOnlyIds);
  const disabledIds = asSet(alwaysDisabledIds);
  const editLockedIds = asSet(editDisabledIds);

  setFormUiModeClass(form, normalizedMode);
  if (form && writeDatasetMode) form.dataset.mode = normalizedMode;

  form?.querySelectorAll('input, select, textarea').forEach((field) => {
    if (field.type === 'hidden') return;
    const id = field.id || '';
    const baseDisabled = disabledIds.has(id) || (normalizedMode !== UI_FORM_MODE.CREATE && editLockedIds.has(id));
    const resolvedDisabled = typeof customDisable === 'function'
      ? Boolean(customDisable(field, { mode: normalizedMode, isView, baseDisabled }))
      : baseDisabled;
    const baseReadOnly = isView || isIdle || readOnlyIds.has(id) || baseDisabled;
    const resolvedReadOnly = typeof customReadOnly === 'function'
      ? Boolean(customReadOnly(field, { mode: normalizedMode, isView, baseReadOnly, disabled: resolvedDisabled }))
      : baseReadOnly;

    if (clearPlaceholderInView && 'placeholder' in field) {
      if (!field.dataset.originalPlaceholder) {
        field.dataset.originalPlaceholder = field.getAttribute('placeholder') || '';
      }
      field.setAttribute('placeholder', (isView || isIdle) ? '' : (field.dataset.originalPlaceholder || ''));
    }

    if (field.tagName === 'SELECT') {
      // 보기/idle 모드에서는 disabled 대신 CSS pointer-events로 차단 — disabled는 브라우저별 회색 스타일 변경 유발
      field.disabled = resolvedDisabled;
      field.setAttribute('aria-disabled', String(isView || isIdle || resolvedDisabled));
    } else {
      field.readOnly = resolvedReadOnly;
      field.disabled = resolvedDisabled;
    }

    if (isView || isIdle) {
      field.tabIndex = -1;
      field.blur();
    } else {
      field.removeAttribute('tabindex');
    }

    if (typeof afterFieldUpdate === 'function') {
      afterFieldUpdate(field, { mode: normalizedMode, isView, disabled: resolvedDisabled, readOnly: resolvedReadOnly });
    }
  });

  updateDetailPanelTitle(form, resolvedTitleLabel);
  syncManagedFieldState(form);

  const panel = form?.closest('.panel');
  if (panel) panel.dataset.panelMode = normalizedMode;

  _syncTopBarWorkState(normalizedMode, identity);

  asArray(submitButtons).forEach((button) => {
    if (!button) return;
    if (isIdle) {
      button.disabled = true;
      setButtonTone(button, 'btn-tone-edit');
      return;
    }
    button.disabled = false;
    const label = submitLabels[normalizedMode] || submitLabels.view || '수정';
    button.title = label;
    button.classList.add('btn-icon-only');
    syncEditSaveButtonTone(button, isView);
  });

  asArray(deleteButtons).forEach((button) => {
    if (!button) return;
    button.title = '삭제';
    button.classList.add('btn-icon-only');
    button.disabled = isIdle || !deleteEnabled;
    setButtonTone(button, 'btn-tone-delete');
  });
}

function persistFilterOverlay(overlay, storageKey) {
  if (!overlay || !storageKey) return;

  // 저장된 값 복원
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    if (saved) {
      overlay.querySelectorAll('select, input[type="checkbox"], input[type="radio"], input[type="text"]').forEach((el) => {
        const key = el.name || el.id;
        if (!key || !(key in saved)) return;
        if (el.type === 'checkbox' || el.type === 'radio') {
          el.checked = Boolean(saved[key]);
        } else {
          el.value = saved[key];
        }
      });
      // 복원 후 change 이벤트로 의존 로직 트리거
      overlay.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } catch (_) {}

  // 변경될 때마다 저장
  overlay.addEventListener('change', () => {
    try {
      const values = {};
      overlay.querySelectorAll('select, input[type="checkbox"], input[type="radio"], input[type="text"]').forEach((el) => {
        const key = el.name || el.id;
        if (!key) return;
        values[key] = (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value;
      });
      sessionStorage.setItem(storageKey, JSON.stringify(values));
    } catch (_) {}
  });
}

export function bindFilterOverlayToggle(button, overlay, { storageKey } = {}) {
  if (!button || !overlay) return () => {};

  if (storageKey) persistFilterOverlay(overlay, storageKey);

  const toggle = () => {
    const isOpen = overlay.classList.contains('is-open');
    overlay.classList.toggle('is-open', !isOpen);
    overlay.setAttribute('aria-hidden', String(isOpen));
  };

  button.addEventListener('click', toggle);
  return () => button.removeEventListener('click', toggle);
}

function applyFormMode({ form, submitButton, deleteButton, modeField, message, mode, viewMode, titleLabel }) {
  if (modeField) modeField.value = mode;
  const panelMode = mode === UI_FORM_MODE.CREATE ? UI_FORM_MODE.CREATE : (viewMode ? UI_FORM_MODE.VIEW : UI_FORM_MODE.EDIT);
  const resolvedTitleLabel = typeof titleLabel === 'function' ? titleLabel() : titleLabel;
  updateDetailPanelTitle(form, resolvedTitleLabel);
  setFormUiModeClass(form, panelMode);
  form?.querySelectorAll('input, select, textarea').forEach((field) => {
    if (field.type === 'hidden') return;
    if (viewMode) {
      field.tabIndex = -1;
      field.blur();
    } else {
      field.removeAttribute('tabindex');
    }
  });

  const panelNode = form?.closest('.panel');
  if (panelNode) panelNode.dataset.panelMode = panelMode;

  if (submitButton) {
    submitButton.title = viewMode ? '수정' : '저장';
    submitButton.classList.add('btn-icon-only');
    syncEditSaveButtonTone(submitButton, viewMode);
  }
  if (deleteButton) {
    deleteButton.title = '삭제';
    deleteButton.classList.add('btn-icon-only');
    deleteButton.disabled = mode !== 'edit';
    setButtonTone(deleteButton, 'btn-tone-delete');
  }
  if (message) message.textContent = '';
}

export async function bootstrapManagementSkeleton(options = {}) {
  const {
    roles = ['provider', 'agent', 'admin'],
    listId,
    formId,
    resetId,
    submitId,
    deleteId,
    messageId,
    emptyText = '등록된 항목이 없습니다.',
    itemLabel = '항목',
    titleLabel = '',
    titleBuilder
  } = options;

  const resolvedTitleLabel = typeof titleBuilder === 'function'
    ? titleBuilder({ mode: UI_FORM_MODE.CREATE, titleLabel })
    : (typeof titleLabel === 'function' ? titleLabel() : titleLabel);

  const { profile } = await requireAuth({ roles });
  renderRoleMenu(qs('#sidebar-menu'), profile.role);

  const list = qs(`#${listId}`);
  const form = qs(`#${formId}`);
  const resetButton = qs(`#${resetId}`);
  const submitButton = qs(`#${submitId}`);
  const deleteButton = qs(`#${deleteId}`);
  const message = qs(`#${messageId}`);
  const modeField = qs(`#${formId}_mode`);

  const createTitleLabel = () => typeof titleBuilder === 'function'
    ? titleBuilder({ mode: UI_FORM_MODE.CREATE, titleLabel })
    : (typeof titleLabel === 'function' ? titleLabel() : titleLabel);

  if (list && !list.children.length) {
    list.innerHTML = `<div class="empty-block list-empty">${emptyText}</div>`;
  }

  let currentMode = 'create';
  let selected = false;
  applyFormMode({
    form,
    submitButton,
    deleteButton,
    modeField,
    message,
    mode: currentMode,
    viewMode: false,
    titleLabel: createTitleLabel
  });

  applyManagementButtonTones({ resetButtons: [resetButton], submitButtons: [submitButton], deleteButtons: [deleteButton] });

  resetButton?.addEventListener('click', () => {
    form?.reset();
    currentMode = 'create';
    selected = false;
    applyFormMode({ form, submitButton, deleteButton, modeField, message, mode: currentMode, viewMode: false, titleLabel: createTitleLabel });
    if (message) message.textContent = `${itemLabel} 신규 입력 상태입니다.`;
  });

  submitButton?.addEventListener('click', () => {
    if (currentMode === 'edit') {
      const isView = form?.classList.contains('ui-mode-view');
      if (isView) {
        applyFormMode({ form, submitButton, deleteButton, modeField, message, mode: currentMode, viewMode: false, titleLabel: createTitleLabel });
        if (message) message.textContent = `${itemLabel} 수정 상태입니다.`;
        return;
      }
    }

    if (message) {
      const modeText = currentMode === 'edit' ? '수정' : '저장';
      message.textContent = `${itemLabel} ${modeText} 기능은 다음 단계에서 연결합니다.`;
    }
    if (currentMode === 'edit') {
      applyFormMode({ form, submitButton, deleteButton, modeField, message, mode: currentMode, viewMode: true, titleLabel });
    }
  });

  deleteButton?.addEventListener('click', () => {
    if (message) message.textContent = `${itemLabel} 삭제 기능은 다음 단계에서 연결합니다.`;
  });

  list?.querySelectorAll('[data-mock-item]').forEach((row) => {
    row.addEventListener('click', () => {
      list.querySelectorAll('[data-mock-item]').forEach((node) => node.classList.remove('is-selected'));
      row.classList.add('is-selected');
      currentMode = 'edit';
      selected = true;
      const codeInput = form?.querySelector('[data-auto-code]');
      if (codeInput && !codeInput.value) codeInput.value = row.dataset.mockCode || '';
      applyFormMode({ form, submitButton, deleteButton, modeField, message, mode: currentMode, viewMode: true, titleLabel });
      if (message) message.textContent = `${itemLabel} 보기 상태입니다.`;
    });
  });
}

/**
 * View→Edit→Save 2단계 버튼 핸들러 공통 팩토리
 * @param {object} options
 * @param {() => string}   options.getFormMode  - 현재 formMode 반환
 * @param {() => void}     options.setEditMode  - edit 모드로 전환
 * @param {() => boolean}  options.isSelected   - 항목 선택 여부 (선택 안 된 경우 저장 차단)
 * @param {() => Promise}  options.onSave       - 저장 로직 (async)
 * @param {() => void}    [options.clearMessage] - 메시지 초기화 (선택)
 */
export function createSubmitHandler({ getFormMode, setEditMode, isSelected, onSave, clearMessage }) {
  return async () => {
    try {
      if (getFormMode() === 'view' && isSelected()) {
        if (!await showConfirm('수정하시겠습니까?')) return;
        setEditMode();
        clearMessage?.();
        return;
      }
      if (!isSelected()) return;
      if (!await showConfirm('저장하시겠습니까?')) return;
      await onSave();
    } catch (error) {
      showToast(`저장 실패: ${error?.message || String(error) || '알 수 없는 오류'}`, 'error');
    }
  };
}
