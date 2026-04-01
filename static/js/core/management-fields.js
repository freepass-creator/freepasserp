function resolveFieldWrapper(field) {
  return field?.closest('.field') || null;
}

function resolvePrimaryControl(fieldWrapper) {
  if (!fieldWrapper) return null;
  return fieldWrapper.querySelector('input:not([type="hidden"]), select, textarea');
}

export function classifyManagedFields(form) {
  if (!form) return;
  form.querySelectorAll('.field').forEach((fieldWrapper) => {
    const control = resolvePrimaryControl(fieldWrapper);
    fieldWrapper.classList.remove('field--text', 'field--select', 'field--textarea', 'field--checkbox', 'field--empty-control');
    if (!control) {
      fieldWrapper.classList.add('field--empty-control');
      return;
    }
    if (control.tagName === 'TEXTAREA') {
      fieldWrapper.classList.add('field--textarea');
      return;
    }
    if (control.tagName === 'SELECT') {
      fieldWrapper.classList.add('field--select');
      return;
    }
    if (control.type === 'checkbox' || control.type === 'radio') {
      fieldWrapper.classList.add('field--checkbox');
      return;
    }
    fieldWrapper.classList.add('field--text');
  });
}

export function syncManagedFieldState(form) {
  if (!form) return;
  classifyManagedFields(form);
  form.querySelectorAll('.field').forEach((fieldWrapper) => {
    const control = resolvePrimaryControl(fieldWrapper);
    const value = control ? String(control.value ?? '').trim() : '';
    const disabled = Boolean(control?.disabled);
    const readOnly = Boolean(control?.readOnly) || (control?.tagName === 'SELECT' && disabled);
    const empty = !value;

    fieldWrapper.classList.toggle('is-disabled', disabled);
    fieldWrapper.classList.toggle('is-readonly', readOnly);
    fieldWrapper.classList.toggle('is-empty', empty);
  });
}

export function bindManagedFieldState(form) {
  if (!form) return () => {};
  const sync = () => syncManagedFieldState(form);
  sync();
  const handler = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.closest('.field')) return;
    sync();
  };
  form.addEventListener('input', handler);
  form.addEventListener('change', handler);
  return () => {
    form.removeEventListener('input', handler);
    form.removeEventListener('change', handler);
  };
}
