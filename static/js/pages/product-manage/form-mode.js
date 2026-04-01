import { applyManagedFormMode, composePanelModeTitle } from '../../core/management-skeleton.js';
import { UI_FORM_MODE } from '../../core/ui-standards.js';

export function createProductFormModeController(options = {}) {
  const {
    form,
    submitButton,
    deleteButton,
    getTitleLabel,
    getIdentity,
    getField,
    fieldIds = [],
    getCurrentProfile,
    onBeforeApply,
    onAfterApply,
    syncFieldFocusability,
    syncViewModeFieldPresentation
  } = options;

  function canEditPartnerCode(mode) {
    const profile = typeof getCurrentProfile === 'function' ? getCurrentProfile() : null;
    return profile?.role === 'admin' && mode !== 'view';
  }

  function getUiMode(mode) {
    if (mode === 'create') return UI_FORM_MODE.CREATE;
    if (mode === 'edit') return UI_FORM_MODE.EDIT;
    if (mode === 'idle') return UI_FORM_MODE.IDLE;
    return UI_FORM_MODE.VIEW;
  }

  function apply(mode = 'view') {
    const nextMode = mode === 'create' ? 'create' : (mode === 'edit' ? 'edit' : mode === 'idle' ? 'idle' : 'view');
    const uiMode = getUiMode(nextMode);
    const isIdle = uiMode === UI_FORM_MODE.IDLE;
    const isView = uiMode === UI_FORM_MODE.VIEW;
    const isCreate = uiMode === UI_FORM_MODE.CREATE;

    if (isIdle) {
      applyManagedFormMode({
        form,
        mode: UI_FORM_MODE.IDLE,
        identity: '',
        titleLabel: typeof getTitleLabel === 'function' ? getTitleLabel() : '',
        submitButtons: [submitButton],
        deleteButtons: [deleteButton],
        deleteEnabled: false
      });
      if (typeof onAfterApply === 'function') {
        onAfterApply({ mode: nextMode, uiMode, isView: false, isCreate: false });
      }
      return nextMode;
    }

    if (typeof onBeforeApply === 'function') {
      onBeforeApply({ mode: nextMode, uiMode, isView, isCreate });
    }

    applyManagedFormMode({
      form,
      mode: uiMode,
      identity: typeof getIdentity === 'function' ? getIdentity() : '',
      titleLabel: typeof getTitleLabel === 'function' ? getTitleLabel() : '',
      submitButtons: [submitButton],
      deleteButtons: [deleteButton],
      deleteEnabled: !isCreate,
      submitLabels: { view: '수정', edit: '저장', create: '저장' },
      alwaysReadOnlyIds: ['vehicle_class'],
      clearPlaceholderInView: true,
      customDisable(field, context) {
        if (field.tagName !== 'SELECT') return context.baseDisabled;
        if (field.id === 'vehicle_class') return true;
        if (field.id === 'partner_code') return !canEditPartnerCode(nextMode);
        return isView || context.baseDisabled;
      },
      customReadOnly(field, context) {
        if (field.id === 'vehicle_class') return true;
        if (field.id === 'partner_code') return !canEditPartnerCode(nextMode);
        return context.baseReadOnly;
      },
      afterFieldUpdate(field, context) {
        if (!field || field.type === 'hidden') return;
        const editable = !isView;
        if (field.id === 'partner_code') {
          const profile = typeof getCurrentProfile === 'function' ? getCurrentProfile() : null;
          if (profile?.role !== 'admin') {
            field.value = profile?.company_code || '';
          }
          field.dataset.locked = String(!canEditPartnerCode(nextMode));
        }
        if (typeof syncFieldFocusability === 'function') {
          if (field.id === 'vehicle_class') syncFieldFocusability(field, false);
          else if (field.id === 'partner_code') syncFieldFocusability(field, canEditPartnerCode(nextMode));
          else syncFieldFocusability(field, editable);
        }
        if (typeof syncViewModeFieldPresentation === 'function') {
          syncViewModeFieldPresentation(field, nextMode);
        }
      }
    });

    if (typeof onAfterApply === 'function') {
      onAfterApply({ mode: nextMode, uiMode, isView, isCreate });
    }

    return nextMode;
  }

  return { apply, getUiMode, canEditPartnerCode };
}
