import { renderOneLineManagementList, summaryText } from '../../core/management-list.js';
import { deleteCodeItem, saveCodeItem, updateCodeItem } from '../../firebase/firebase-db.js';
import { renderBadgeRow } from '../../shared/badge.js';
import { showConfirm } from '../../core/toast.js';

export function createCodeSettingsController({ elements, getProfile }) {
  const { list, form, message, resetButton, submitButton, deleteButton, editingKeyInput, getField } = elements;
  let currentCodeItems = [];
  let eventsBound = false;

  function getCodePayload() {
    return {
      group_code: getField('group_code')?.value.trim() || '',
      item_code: getField('item_code')?.value.trim() || '',
      item_name: getField('item_name')?.value.trim() || '',
      note: getField('code_note')?.value.trim() || '',
      sort_order: Number(getField('sort_order')?.value || 0),
      is_active: getField('is_active')?.value === 'true',
      created_by: getProfile()?.uid || ''
    };
  }

  function renderCodeList(items = []) {
    if (!list) return;
    renderOneLineManagementList({
      container: list,
      items,
      emptyText: '등록된 코드가 없습니다.',
      selectedKey: String(editingKeyInput?.value || ''),
      getKey: (item) => item.code_key,
      onSelect: (item) => fillCodeForm(item),
      buildRowConfig: (item) => ({
        badgesHtml: renderBadgeRow([{
          field: 'settings_code_status',
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

  function resetCodeForm(options = {}) {
    editingKeyInput.value = '';
    form?.reset();
    getField('sort_order').value = 0;
    getField('is_active').value = 'true';
    deleteButton.disabled = true;
    submitButton.textContent = '저장';
    if (!options.keepMessage) message.textContent = '';
    renderCodeList(currentCodeItems);
  }

  function fillCodeForm(item) {
    editingKeyInput.value = item.code_key || '';
    getField('group_code').value = item.group_code || '';
    getField('item_code').value = item.item_code || '';
    getField('item_name').value = item.item_name || '';
    getField('code_note').value = item.note || '';
    getField('sort_order').value = item.sort_order ?? 0;
    getField('is_active').value = item.is_active === false ? 'false' : 'true';
    deleteButton.disabled = false;
    submitButton.textContent = '저장';
    renderCodeList(currentCodeItems);
  }

  async function handleCodeSubmit() {
    const payload = getCodePayload();
    if (!payload.group_code || !payload.item_code || !payload.item_name) throw new Error('그룹코드, 항목코드, 항목명은 필수입니다.');
    const editingKey = String(editingKeyInput?.value || '').trim();
    if (!editingKey) {
      const key = await saveCodeItem(payload);
      message.textContent = `저장 완료: ${key}`;
      fillCodeForm({ ...payload, code_key: key });
      return;
    }
    await updateCodeItem(editingKey, payload);
    message.textContent = `수정 완료: ${editingKey}`;
    fillCodeForm({ ...payload, code_key: editingKey });
  }

  async function handleCodeDelete() {
    const editingKey = String(editingKeyInput?.value || '').trim();
    if (!editingKey) throw new Error('삭제할 코드를 먼저 선택하세요.');
    if (!await showConfirm(`선택한 코드 ${editingKey} 를 삭제할까요?`)) return;
    await deleteCodeItem(editingKey);
    message.textContent = `삭제 완료: ${editingKey}`;
    resetCodeForm({ keepMessage: true });
  }

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;
    resetButton?.addEventListener('click', () => { resetCodeForm(); message.textContent = '코드 신규 입력 상태입니다.'; });
    submitButton?.addEventListener('click', () => { form?.requestSubmit(); });
    deleteButton?.addEventListener('click', async () => {
      try { await handleCodeDelete(); } catch (error) { message.textContent = `삭제 실패: ${error.message}`; }
    });
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      try { await handleCodeSubmit(); } catch (error) { message.textContent = `저장 실패: ${error.message}`; }
    });
  }

  function applyItems(items) { currentCodeItems = items; renderCodeList(currentCodeItems); }

  return { bindEvents, resetCodeForm, applyItems };
}
