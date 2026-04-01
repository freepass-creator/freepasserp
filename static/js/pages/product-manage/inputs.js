import { DEFAULT_SELECT_VALUES, SELECT_PLACEHOLDER_TEXT } from './fields.js';

export function createProductInputController(deps = {}) {
  const {
    getField,
    currentProfile,
    getMode,
    syncProductCodePreview,
    enforceVehicleClassFieldOrder,
    renderYearSelectOptions,
    syncLinkedVehicleClass,
    refreshVehicleSpecSelects,
    clearStatus,
    applyFormMode,
    syncSelectedSummaryRow,
    renderFilteredList,
    form,
    editingCodeInput,
    deleteButton,
    setProductCodeDisplay,
    setStoredImageUrls,
    clearRemovedStoredImageUrls,
    clearPendingFiles,
    closeImageViewer,
    renderCurrentPreview
  } = deps;

  function syncFieldFocusability(field, editable) {
    if (!field) return;
    if (editable) {
      field.removeAttribute('tabindex');
      field.removeAttribute('aria-readonly');
      return;
    }
    field.setAttribute('tabindex', '-1');
    field.setAttribute('aria-readonly', 'true');
    try { field.blur(); } catch (error) {}
  }

  function syncViewModeFieldPresentation(field, nextMode) {
    if (!field) return;
    const isViewMode = nextMode === 'view';
    const currentValue = String(field.value ?? '').trim();
    const hasValue = currentValue !== '';

    if (field.tagName === 'SELECT') {
      const firstOption = field.options?.[0];
      if (!firstOption || firstOption.value !== '') return;
      if (field.dataset.originalPlaceholderOptionText === undefined) {
        field.dataset.originalPlaceholderOptionText = firstOption.textContent || SELECT_PLACEHOLDER_TEXT;
      }
      if (isViewMode && !hasValue) {
        firstOption.textContent = '';
        field.classList.add('is-empty-view');
        field.dataset.viewEmpty = 'true';
        return;
      }
      firstOption.textContent = field.dataset.originalPlaceholderOptionText || SELECT_PLACEHOLDER_TEXT;
      field.classList.remove('is-empty-view');
      delete field.dataset.viewEmpty;
      return;
    }

    if (field.dataset.originalPlaceholder === undefined) {
      field.dataset.originalPlaceholder = field.getAttribute('placeholder') ?? '';
    }

    if (isViewMode && !hasValue) {
      field.setAttribute('placeholder', '');
      field.classList.add('is-empty-view');
      field.dataset.viewEmpty = 'true';
      return;
    }

    const originalPlaceholder = field.dataset.originalPlaceholder ?? '';
    if (originalPlaceholder) field.setAttribute('placeholder', originalPlaceholder);
    else field.removeAttribute('placeholder');
    field.classList.remove('is-empty-view');
    delete field.dataset.viewEmpty;
  }

  function digitsOnly(value) {
    return String(value || '').replace(/[^\d]/g, '');
  }

  function formatCommaNumber(value) {
    const digits = digitsOnly(value);
    if (!digits) return '';
    return Number(digits).toLocaleString('ko-KR');
  }

  function parseNormalizedDateParts(value = '') {
    const digits = digitsOnly(value);
    if (!digits) return null;

    let year = '';
    let month = '';
    let day = '';

    if (digits.length === 6) {
      year = `20${digits.slice(0, 2)}`;
      month = digits.slice(2, 4);
      day = digits.slice(4, 6);
    } else if (digits.length === 8) {
      year = digits.slice(0, 4);
      month = digits.slice(4, 6);
      day = digits.slice(6, 8);
    } else {
      return null;
    }

    const yearNumber = Number(year);
    const monthNumber = Number(month);
    const dayNumber = Number(day);
    if (!yearNumber || monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) return null;

    const date = new Date(yearNumber, monthNumber - 1, dayNumber);
    if (Number.isNaN(date.getTime())) return null;
    if (date.getFullYear() !== yearNumber || (date.getMonth() + 1) !== monthNumber || date.getDate() !== dayNumber) return null;

    return {
      year: String(yearNumber),
      month: String(monthNumber).padStart(2, '0'),
      day: String(dayNumber).padStart(2, '0')
    };
  }

  function normalizeDateText(value = '') {
    const parsed = parseNormalizedDateParts(value);
    if (!parsed) return String(value || '').trim();
    return `${parsed.year}.${parsed.month}.${parsed.day}`;
  }

  function inferYearFromDateText(value = '') {
    const parsed = parseNormalizedDateParts(value);
    return parsed?.year || '';
  }

  function ensureSelectValue(field, value) {
    if (!field || field.tagName !== 'SELECT') return;
    const text = String(value || '').trim();
    if (!text) return;
    const hasOption = Array.from(field.options || []).some((option) => option.value === text);
    if (!hasOption) {
      const option = document.createElement('option');
      option.value = text;
      option.textContent = text;
      field.append(option);
    }
    field.value = text;
  }

  function syncYearFromFirstRegistrationDate(force = false) {
    const yearField = getField('year');
    const dateField = getField('first_registration_date');
    if (!yearField || !dateField) return;
    const inferredYear = inferYearFromDateText(dateField.value);
    if (!inferredYear) return;
    if (force || !String(yearField.value || '').trim()) {
      ensureSelectValue(yearField, inferredYear);
    }
  }

  function normalizeDateFieldValue(field, { syncYear = false } = {}) {
    if (!field) return;
    field.value = normalizeDateText(field.value);
    if (syncYear) syncYearFromFirstRegistrationDate(false);
  }

  function bindDateInputs() {
    [
      { id: 'first_registration_date', syncYear: true },
      { id: 'vehicle_age_expiry_date', syncYear: false }
    ].forEach(({ id, syncYear }) => {
      const field = getField(id);
      if (!field) return;
      field.addEventListener('blur', () => normalizeDateFieldValue(field, { syncYear }));
      field.addEventListener('change', () => normalizeDateFieldValue(field, { syncYear }));
    });
  }

  function bindMoneyInputs() {
    ['vehicle_price','mileage','rent_1','deposit_1','fee_1','rent_12','deposit_12','fee_12','rent_24','deposit_24','fee_24','rent_36','deposit_36','fee_36','rent_48','deposit_48','fee_48','rent_60','deposit_60','fee_60']
      .map((id) => getField(id))
      .filter(Boolean)
      .forEach((input) => {
        input.style.textAlign = 'right';
        input.addEventListener('input', () => {
          input.value = formatCommaNumber(input.value);
        });
        input.addEventListener('blur', () => {
          input.value = formatCommaNumber(input.value);
        });
      });
  }

  function setReadOnlyByRole() {
    const partnerField = getField('partner_code');
    if (!partnerField) return;
    const isAdmin = currentProfile()?.role === 'admin';
    const canEditPartnerCode = isAdmin && getMode() !== 'view';
    if (!isAdmin) {
      partnerField.value = currentProfile()?.company_code || '';
    }
    partnerField.readOnly = !canEditPartnerCode;
    if (partnerField.tagName === 'SELECT') partnerField.disabled = !canEditPartnerCode;
    partnerField.dataset.locked = (!canEditPartnerCode).toString();
    syncFieldFocusability(partnerField, canEditPartnerCode);
  }

  function resetForm() {
    editingCodeInput.value = '';
    setProductCodeDisplay('');
    setStoredImageUrls([]);
    clearRemovedStoredImageUrls();
    form.reset();
    renderYearSelectOptions('');
    syncLinkedVehicleClass({}, { fallbackValue: '' });
    clearPendingFiles();
    closeImageViewer();
    renderCurrentPreview();
    setReadOnlyByRole();
    refreshVehicleSpecSelects({ maker: '', model_name: '', sub_model: '' });
    syncProductCodePreview();
    ['vehicle_status', 'product_type'].forEach((fieldId) => {
      const field = getField(fieldId);
      const defaultValue = DEFAULT_SELECT_VALUES[fieldId];
      if (field && defaultValue) field.value = defaultValue;
    });
    clearStatus();
    if (deleteButton) deleteButton.disabled = true;
    enforceVehicleClassFieldOrder();
    applyFormMode('create');
    renderFilteredList();
    syncSelectedSummaryRow();
  }

  return {
    syncFieldFocusability,
    syncViewModeFieldPresentation,
    digitsOnly,
    formatCommaNumber,
    normalizeDateText,
    inferYearFromDateText,
    ensureSelectValue,
    bindDateInputs,
    bindMoneyInputs,
    setReadOnlyByRole,
    resetForm
  };
}
