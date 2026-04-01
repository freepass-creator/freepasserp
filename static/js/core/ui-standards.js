export const UI_FORM_MODE = Object.freeze({
  IDLE: 'idle',
  VIEW: 'view',
  EDIT: 'edit',
  CREATE: 'create'
});

export const UI_MODE_SUFFIX = Object.freeze({
  [UI_FORM_MODE.VIEW]:   '정보',
  [UI_FORM_MODE.EDIT]:   '정보',
  [UI_FORM_MODE.CREATE]: '정보',
  [UI_FORM_MODE.IDLE]:   '정보'
});

export function normalizeUiText(value) {
  return String(value ?? '').trim();
}

export function resolveUiFormMode(mode) {
  if (mode === UI_FORM_MODE.CREATE) return UI_FORM_MODE.CREATE;
  if (mode === UI_FORM_MODE.EDIT) return UI_FORM_MODE.EDIT;
  if (mode === UI_FORM_MODE.IDLE) return UI_FORM_MODE.IDLE;
  return UI_FORM_MODE.VIEW;
}

export function composePanelHeadTitle(identity, panelLabel) {
  const code = normalizeUiText(identity);
  const label = normalizeUiText(panelLabel);
  if (!code) return label;
  if (!label) return code;
  return `${code} ${label}`;
}

export function composePanelModeTitle(baseLabel, panelMode = UI_FORM_MODE.VIEW, identity = '') {
  const mode = resolveUiFormMode(panelMode);
  const base = normalizeUiText(baseLabel);
  const code = normalizeUiText(identity);
  const suffix = mode in UI_MODE_SUFFIX ? UI_MODE_SUFFIX[mode] : UI_MODE_SUFFIX[UI_FORM_MODE.VIEW];
  const title = base ? `${base}${suffix}` : suffix;
  return code ? `${title}(${code})` : title;
}

export function setFormUiModeClass(form, mode) {
  if (!form) return;
  const resolved = resolveUiFormMode(mode);
  form.classList.remove('ui-mode-idle', 'ui-mode-view', 'ui-mode-edit', 'ui-mode-create');
  form.classList.add(`ui-mode-${resolved}`);
}

export function setSelectionUiClass(node, selected) {
  if (!node) return;
  node.classList.toggle('ui-selected', Boolean(selected));
}
