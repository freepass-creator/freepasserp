import { requireAuth } from '../core/auth-guard.js';
import { applyManagementButtonTones, bindFilterOverlayToggle, createManagedFormModeApplier } from '../core/management-skeleton.js';
import { qs, registerPageCleanup } from '../core/utils.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { deleteCodeItem, saveCodeItem, updateCodeItem, watchCodeItems } from '../firebase/firebase-db.js';
import { renderOneLineManagementList, summaryText } from '../core/management-list.js';
import { renderBadgeRow } from '../shared/badge.js';
import { showToast, showConfirm } from '../core/toast.js';

const menu = qs('#sidebar-menu');
const form = qs('#code-form');
const message = qs('#code-message');
const filterToggleButton = qs('#openCodeFilterBtn');
const filterOverlay = qs('#codeFilterOverlay');
const list = qs('#code-item-list');
const editingCodeKeyInput = qs('#editing_code_key');
const resetButtons = [qs('#code-form-reset')].filter(Boolean);
const submitButtons = [qs('#code-submit-head')].filter(Boolean);
const deleteButtons = [qs('#code-delete-head')].filter(Boolean);

applyManagementButtonTones({ resetButtons, submitButtons, deleteButtons });

let currentItems = [];
let mode = 'create';
let currentUid = '';
let formMode = 'create';

const applyCodeFormMode = createManagedFormModeApplier({
  form,
  panelLabel: '코드',
  getIdentity: () => editingCodeKeyInput.value,
  isSelected: () => mode === 'edit',
  submitButtons,
  deleteButtons,
  defaultOptions: {
    submitLabels: {
      view: '수정',
      edit: '저장',
      create: '저장'
    }
  }
});

function applyFormMode(nextMode) {
  formMode = nextMode;
  applyCodeFormMode(nextMode, { deleteEnabled: mode === 'edit' });
}

function setCreateMode() {
  mode = 'create';
  editingCodeKeyInput.value = '';
  form.reset();
  qs('#sort_order').value = 0;
  qs('#is_active').value = 'true';
  applyFormMode('create');
  renderList(currentItems);
}

function fillForm(item) {
  mode = 'edit';
  editingCodeKeyInput.value = item.code_key || '';
  qs('#group_code').value = item.group_code || '';
  qs('#item_code').value = item.item_code || '';
  qs('#item_name').value = item.item_name || '';
  qs('#code_note').value = item.note || '';
  qs('#sort_order').value = item.sort_order ?? 0;
  qs('#is_active').value = item.is_active === false ? 'false' : 'true';
  applyFormMode('view');
  renderList(currentItems);
}

function renderList(items) {
  renderOneLineManagementList({
    container: list,
    items,
    emptyText: '등록된 코드가 없습니다.',
    selectedKey: editingCodeKeyInput.value,
    getKey: (item) => item.code_key,
    onSelect: (item) => fillForm(item),
    buildRowConfig: (item) => ({
      badgesHtml: renderBadgeRow([{
        field: 'code_item_status',
        value: item.is_active === false ? '미사용' : '사용'
      }]),
      strong: item.item_code || '-',
      trailing: [
        item.item_name || '-',
        summaryText(item.group_code || '-', { tone: 'muted' })
      ]
    })
  });
}

async function handleSubmit() {
  const payload = {
    group_code: qs('#group_code').value.trim(),
    item_code: qs('#item_code').value.trim(),
    item_name: qs('#item_name').value.trim(),
    note: qs('#code_note').value.trim(),
    sort_order: Number(qs('#sort_order').value || 0),
    is_active: qs('#is_active').value === 'true',
    created_by: currentUid
  };
  const editingKey = editingCodeKeyInput.value.trim();
  if (!editingKey) {
    const key = await saveCodeItem(payload);
    showToast(`저장 완료: ${key}`, 'success');
    const saved = currentItems.find((item) => item.code_key === key) || { ...payload, code_key: key };
    fillForm(saved);
    applyFormMode('view');
  } else {
    await updateCodeItem(editingKey, payload);
    showToast(`수정 완료: ${editingKey}`, 'success');
    const saved = currentItems.find((item) => item.code_key === editingKey) || { ...payload, code_key: editingKey };
    fillForm(saved);
    applyFormMode('view');
  }
}

async function handleDelete() {
  const editingKey = editingCodeKeyInput.value.trim();
  if (!editingKey) {
    showToast('삭제할 코드를 먼저 선택하세요.', 'info');
    return;
  }
  if (!await showConfirm(`선택한 코드 ${editingKey} 를 삭제할까요?`)) return;
  await deleteCodeItem(editingKey);
  showToast(`삭제 완료: ${editingKey}`, 'success');
  setCreateMode();
}

async function bootstrap() {
  try {
    const { user, profile } = await requireAuth({ roles: ['admin'] });
    currentUid = user.uid;
    renderRoleMenu(menu, profile.role);
    bindFilterOverlayToggle(filterToggleButton, filterOverlay);
    resetButtons.forEach((button) => button?.addEventListener('click', setCreateMode));
    submitButtons.forEach((button) => button?.addEventListener('click', () => {
      if (mode === 'edit' && formMode === 'view') {
        applyFormMode('edit');
        showToast('수정 상태입니다.', 'info');
        return;
      }
      form.requestSubmit();
    }));
    deleteButtons.forEach((button) => button?.addEventListener('click', async () => {
      try { await handleDelete(); } catch (error) { showToast(`삭제 실패: ${error.message}`, 'error'); }
    }));

    registerPageCleanup(watchCodeItems((items) => {
      currentItems = items;
      renderList(currentItems);
    }));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try { await handleSubmit(); } catch (error) { showToast(`저장 실패: ${error.message}`, 'error'); }
    });

    setCreateMode();
  } catch (error) {
    console.error(error);
  }
}

bootstrap();
