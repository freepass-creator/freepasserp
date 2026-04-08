/**
 * mobile/tab-badges.js — 하단 탭바 뱃지 글로벌 업데이터
 * 모든 모바일 페이지에서 로드되어 안읽음 카운트 등 표시
 */
import { requireAuth } from '../core/auth-guard.js';
import { watchRooms, watchContracts } from '../firebase/firebase-db.js';

function setBadge(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = '';
  el.hidden = !(Number(count || 0) > 0);
}

(async () => {
  try {
    const { profile } = await requireAuth();
    const role = profile?.role || '';

    // 대화 안읽음 — 역할별로 다른 카운트 합산
    watchRooms((rooms) => {
      let total = 0;
      (rooms || []).forEach(r => {
        if (!r) return;
        if (r.hidden_by && Object.keys(r.hidden_by).length) return;
        if (role === 'agent' || role === 'admin') {
          total += Number(r.unread_for_agent || 0);
        } else if (role === 'provider') {
          total += Number(r.unread_for_provider || 0);
        } else {
          total += Number(r.unread_for_agent || 0) + Number(r.unread_for_provider || 0);
        }
      });
      setBadge('m-tab-chat-badge', total);
    });

    // 계약 처리 대기 — 진행중인 건수 표시
    watchContracts((contracts) => {
      const pending = (contracts || []).filter(c =>
        c && /대기|진행|신규/.test(String(c.contract_status || ''))
      ).length;
      setBadge('m-tab-contract-badge', pending);
    });
  } catch (e) {
    console.warn('[tab-badges] init failed', e);
  }
})();
