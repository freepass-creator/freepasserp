/**
 * mobile/tab-badges.js — 하단 탭바 뱃지 글로벌 업데이터
 * 모든 모바일 페이지에서 로드되어 안읽음 카운트 등 표시
 */
import { requireAuth } from '../core/auth-guard.js';
import { watchRooms, watchContracts } from '../firebase/firebase-db.js';
import { playNotifSound } from '../core/notif-sound.js';

// ⚡ sessionStorage 캐시 — 페이지 이동 시 뱃지 깜빡임 방지
const BADGE_CACHE_KEY = 'fp_tab_badges_v1';
function loadBadgeCache() {
  try { return JSON.parse(sessionStorage.getItem(BADGE_CACHE_KEY) || '{}'); } catch { return {}; }
}
function saveBadgeCache(obj) {
  try { sessionStorage.setItem(BADGE_CACHE_KEY, JSON.stringify(obj)); } catch {}
}
const _badgeCache = loadBadgeCache();

function setBadge(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = '';
  el.hidden = !(Number(count || 0) > 0);
  _badgeCache[id] = Number(count || 0);
  saveBadgeCache(_badgeCache);
}

// 페이지 로드 즉시 캐시값으로 뱃지 복원 (Firebase 구독 응답 기다리지 않음)
function restoreBadgesFromCache() {
  Object.keys(_badgeCache).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = '';
    el.hidden = !(Number(_badgeCache[id] || 0) > 0);
  });
}
restoreBadgesFromCache();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', restoreBadgesFromCache, { once: true });
}

(async () => {
  try {
    const { user, profile } = await requireAuth();
    const role = profile?.role || '';
    const myUid = user?.uid || '';
    const myCode = profile?.user_code || '';
    const myCompanyCode = profile?.company_code || '';

    // 자기 것만 필터
    function isMineRoom(r) {
      if (role === 'admin') return true;
      if (role === 'agent') return r.agent_uid === myUid || r.agent_code === myCode;
      if (role === 'agent_manager') return (r.agent_channel_code || '') === myCompanyCode;
      if (role === 'provider') return (r.provider_company_code || '') === myCompanyCode;
      return false;
    }
    function isMineContract(c) {
      if (role === 'admin') return true;
      if (role === 'agent') return c.agent_uid === myUid || c.agent_code === myCode;
      if (role === 'agent_manager') return (c.channel_code || '') === myCompanyCode || (c.agent_channel_code || '') === myCompanyCode;
      if (role === 'provider') {
        return (c.partner_code || '') === myCompanyCode || (c.provider_company_code || '') === myCompanyCode;
      }
      return false;
    }

    // 대화 안읽음 — desktop sidebar-alerts 와 동일 로직 (last_sender + read_by)
    let prevChat = -1;
    watchRooms((rooms) => {
      const total = (rooms || []).filter((r) => {
        if (!r) return false;
        if (r.hidden_by && r.hidden_by[myUid]) return false;
        if (!isMineRoom(r)) return false;
        const lastMsgAt = Number(r.last_message_at || 0);
        if (!lastMsgAt) return false;
        const myReadAt = Number((r.read_by || {})[myUid] || 0);
        if (myReadAt >= lastMsgAt) return false;
        const eff = r.last_effective_sender_role || '';
        const last = r.last_sender_role || '';
        const sender = (eff === 'agent' || eff === 'provider') ? eff : ((last === 'agent' || last === 'provider') ? last : '');
        if (!sender) return false;
        if (role === 'admin' || role === 'provider') return sender === 'agent';
        return sender === 'provider';
      }).length;
      setBadge('m-tab-chat-badge', total);
      const onChatPage = /^\/(chat|m\/chat)(\/|$)/.test(location.pathname);
      const isFocused = document.visibilityState === 'visible' && document.hasFocus();
      const skip = onChatPage && isFocused;
      if (prevChat >= 0 && total > prevChat && !skip) playNotifSound({ type: 'message' });
      prevChat = total;
    });

    // 계약 처리 대기 — 자기 것만
    let prevContract = -1;
    watchContracts((contracts) => {
      const pending = (contracts || []).filter(c =>
        c && isMineContract(c) && /대기|진행|신규/.test(String(c.contract_status || ''))
      ).length;
      setBadge('m-tab-contract-badge', pending);
      if (prevContract >= 0 && pending > prevContract) playNotifSound({ type: 'contract' });
      prevContract = pending;
    });
  } catch (e) {
    console.warn('[tab-badges] init failed', e);
  }
})();
