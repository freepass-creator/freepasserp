/* 모바일 설정 — 추후 구현 */
import { requireAuth } from '../core/auth-guard.js';
(async () => {
  await requireAuth();
  const $s = document.getElementById('m-settings');
  if ($s) $s.innerHTML = '<div style="padding:48px 0;text-align:center;color:#8b95a1;">설정 페이지 준비중</div>';
})();
