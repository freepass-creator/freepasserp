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

    // 대화 안읽음 — 자기 방만 + 역할별 카운트 합산
    let prevChat = -1;
    watchRooms((rooms) => {
      let total = 0;
      (rooms || []).forEach(r => {
        if (!r) return;
        if (r.hidden_by && Object.keys(r.hidden_by).length) return;
        if (!isMineRoom(r)) return;
        if (role === 'agent' || role === 'agent_manager' || role === 'admin') total += Number(r.unread_for_agent || 0);
        else if (role === 'provider') total += Number(r.unread_for_provider || 0);
      });
      setBadge('m-tab-chat-badge', total);
      if (prevChat >= 0 && total > prevChat) playNotifSound({ type: 'message' });
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
