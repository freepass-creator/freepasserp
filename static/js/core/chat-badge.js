/**
 * chat-badge.js
 * 사이드바 채팅 메뉴 옆 미처리/안읽은 건수 뱃지.
 * workspace_new.html 에서 한 번 로드되며 SPA 네비게이션에도 살아있음.
 */

import { requireAuth } from './auth-guard.js';
import { watchRooms } from '../firebase/firebase-db.js';

const BADGE_ID = 'sidebar-chat-badge';

function getBadge() {
  return document.getElementById(BADGE_ID);
}

function updateBadge(count) {
  const badge = getBadge();
  if (!badge) return;
  const link = badge.closest('.sidebar-link');
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = false;
    link?.classList.add('has-new-event');
  } else {
    badge.hidden = true;
    badge.textContent = '';
    link?.classList.remove('has-new-event');
  }
}

function countPendingRooms(rooms, role, uid, companyCode) {
  return rooms.filter((room) => {
    // 숨긴 방 제외
    const hb = room.hidden_by;
    if (hb && (Array.isArray(hb) ? hb.includes(uid) : hb[uid])) return false;
    // 역할별 방 필터
    if (role === 'agent' && room.agent_uid && room.agent_uid !== uid) return false;
    if (role === 'provider' && room.provider_code && room.provider_code !== companyCode) return false;
    // 메시지 없으면 제외
    if (!Number(room.last_message_at || 0)) return false;
    // 회신대기 기준
    const eff = room.last_effective_sender_role || '';
    const last = room.last_sender_role || '';
    const sender = (eff === 'agent' || eff === 'provider') ? eff : ((last === 'agent' || last === 'provider') ? last : '');
    if (!sender) return false;
    if (role === 'admin' || role === 'provider') return sender === 'agent';
    return sender === 'provider';
  }).length;
}

async function initChatBadge() {
  try {
    const { profile, user } = await requireAuth();
    if (!profile || !user) return;

    // SPA 네비게이션 후에도 뱃지 DOM이 재생성되므로 rooms 데이터를 캐시해
    // 메뉴가 다시 그려지면 즉시 반영할 수 있도록 마지막 count를 기억한다.
    let lastCount = 0;

    // MutationObserver: 사이드바가 re-render 되면 뱃지를 다시 업데이트
    const observer = new MutationObserver(() => {
      const badge = getBadge();
      if (badge && badge.hidden === true && lastCount > 0) {
        updateBadge(lastCount);
      }
    });
    const menu = document.getElementById('sidebar-menu');
    if (menu) observer.observe(menu, { childList: true, subtree: true });

    watchRooms((rooms) => {
      lastCount = countPendingRooms(rooms, profile.role, user.uid, profile.company_code || '');
      console.log('[chat-badge] rooms:', rooms.length, 'pending:', lastCount, 'role:', profile.role);
      if (lastCount > 0) {
        rooms.filter(r => {
          const eff = r.last_effective_sender_role || '';
          const last = r.last_sender_role || '';
          const sender = (eff === 'agent' || eff === 'provider') ? eff : ((last === 'agent' || last === 'provider') ? last : '');
          return sender === 'agent';
        }).forEach(r => console.log('[chat-badge] pending room:', r.room_id, 'eff:', r.last_effective_sender_role, 'last:', r.last_sender_role));
      }
      updateBadge(lastCount);
    });
  } catch (_) {
    // 비로그인 상태 등 — 뱃지 숨김 유지
  }
}

initChatBadge();
