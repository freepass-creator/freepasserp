/* 모바일 대화 — 추후 구현 */
import { requireAuth } from '../core/auth-guard.js';
(async () => {
  await requireAuth();
  const $list = document.getElementById('m-chat-list');
  if ($list) $list.innerHTML = '<div style="padding:48px 0;text-align:center;color:#8b95a1;">대화 페이지 준비중</div>';
})();
