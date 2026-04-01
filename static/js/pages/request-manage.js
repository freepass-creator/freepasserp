import { bindFilterOverlayToggle, bootstrapManagementSkeleton } from '../core/management-skeleton.js';

const filterBtn = document.getElementById('openRequestFilterBtn');
const filterOverlay = document.getElementById('requestFilterOverlay');
bindFilterOverlayToggle(filterBtn, filterOverlay);

const requestCodeInput = document.getElementById('request_code');

bootstrapManagementSkeleton({
  listId: 'request-list',
  formId: 'request-form',
  resetId: 'request-form-reset',
  submitId: 'request-submit-head',
  deleteId: 'request-delete-head',
  messageId: 'request-message',
  titleBuilder: () => {
    const code = String(requestCodeInput?.value || '').trim();
    return code ? `${code} 요청` : '요청';
  },
  itemLabel: '요청'
}).catch((error) => {
  console.error(error);
});
