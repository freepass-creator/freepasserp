/**
 * sidebar-alerts.js
 * 사이드바 메뉴별 실시간 알림 뱃지 + 축소 모드 Notification Dot.
 * workspace.html 에서 한 번 로드, SPA 네비게이션에도 유지.
 */

import { requireAuth } from './auth-guard.js';
import { watchRooms, watchUsers, watchPartners, watchContracts, watchSettlements } from '../firebase/firebase-db.js';
import { playNotifSound } from './notif-sound.js';

let profile = null;
let uid = '';
let userCode = '';
let companyCode = '';
let counts = { chat: 0, member: 0, partner: 0, contract: 0, settlement: 0 };
// 알림음 — 이전 카운트 대비 증가 시 1회 재생 (초기 로드 제외)
let prevChatCount = -1;
let prevContractCount = -1;

// ─── 뱃지 DOM 조작 ──────────────────────────────────────────────────────────

function setBadge(href, count) {
  const links = document.querySelectorAll(`.sidebar-link[href="${href}"]`);
  links.forEach((link) => {
    let badge = link.querySelector('.sidebar-nav-badge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'sidebar-nav-badge';
        link.appendChild(badge);
      }
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.hidden = false;
      link.classList.add('has-new-event');
    } else {
      if (badge) { badge.hidden = true; badge.textContent = ''; }
      link.classList.remove('has-new-event');
      // 강제: 축소모드 빨간점 제거를 위해 아이콘 ::after도 초기화
      const icon = link.querySelector('.sidebar-link-icon');
      if (icon) icon.style.setProperty('--has-badge', '0');
    }
  });
}

function isBadgeEnabled(href) {
  const badgeMap = profile?.settings?.badge;
  if (!badgeMap) return true;
  const key = href.replace(/\//g, '_');
  return badgeMap[key] !== false;
}

function syncAllBadges() {
  setBadge('/chat', isBadgeEnabled('/chat') ? counts.chat : 0);
  setBadge('/member', isBadgeEnabled('/member') ? counts.member : 0);
  setBadge('/partner', isBadgeEnabled('/partner') ? counts.partner : 0);
  setBadge('/contract', isBadgeEnabled('/contract') ? counts.contract : 0);
  setBadge('/settlement', isBadgeEnabled('/settlement') ? counts.settlement : 0);
}

// ─── 카운트 로직 ─────────────────────────────────────────────────────────────

function countUnreadRooms(rooms) {
  return rooms.filter((room) => {
    // 숨긴 방 제외
    if (room.hidden_by && (Array.isArray(room.hidden_by) ? room.hidden_by.includes(uid) : room.hidden_by[uid])) return false;
    // 역할별 방 필터 — uid 우선, 그 다음 code 폴백 (legacy 방에 uid 누락된 케이스 대응)
    if (profile.role === 'agent') {
      const byUid = !!room.agent_uid && room.agent_uid === uid;
      const byCode = !!room.agent_code && !!userCode && room.agent_code === userCode;
      if (!byUid && !byCode) return false;
    } else if (profile.role === 'agent_manager') {
      if (!room.agent_channel_code || !companyCode || room.agent_channel_code !== companyCode) return false;
    } else if (profile.role === 'provider') {
      if (!room.provider_company_code || !companyCode || room.provider_company_code !== companyCode) return false;
    }
    // admin 은 방 필터 없음 (전체 감시)
    if (!Number(room.last_message_at || 0)) return false;
    const eff = room.last_effective_sender_role || '';
    const last = room.last_sender_role || '';
    const sender = (eff === 'agent' || eff === 'provider') ? eff : ((last === 'agent' || last === 'provider') ? last : '');
    if (!sender) return false;
    // 관리자/공급사 → 영업자 발신 건을 대기 (관리자는 공급사처럼 동작)
    if (profile.role === 'admin' || profile.role === 'provider') return sender === 'agent';
    // 영업자/영업관리자 → 공급사 발신 건을 대기
    return sender === 'provider';
  }).length;
}

function countPendingUsers(users) {
  if (profile.role !== 'admin') return 0;
  return users.filter((u) => u.status === 'pending').length;
}

function countPendingPartners(partners) {
  if (profile.role !== 'admin') return 0;
  return partners.filter((p) => p.status === 'pending').length;
}

const CONTRACT_DONE = ['계약완료'];

function countActionContracts(contracts) {
  if (profile.role === 'provider') {
    return contracts.filter((c) => {
      const match = [c.partner_code, c.provider_company_code].includes(companyCode);
      return match && !CONTRACT_DONE.includes(c.contract_status);
    }).length;
  }
  if (profile.role === 'agent') {
    return contracts.filter((c) => {
      const match = c.agent_uid === uid;
      return match && !CONTRACT_DONE.includes(c.contract_status);
    }).length;
  }
  if (profile.role === 'agent_manager') {
    return contracts.filter((c) => {
      const match = [c.channel_code, c.agent_channel_code].includes(companyCode);
      return match && !CONTRACT_DONE.includes(c.contract_status);
    }).length;
  }
  if (profile.role === 'admin') {
    return contracts.filter((c) => !CONTRACT_DONE.includes(c.contract_status)).length;
  }
  return 0;
}

const SETTLEMENT_DONE = ['정산완료', '환수결정'];

function countActionSettlements(settlements) {
  if (profile.role === 'admin') {
    return settlements.filter((s) => !SETTLEMENT_DONE.includes(s.settlement_status || s.status)).length;
  }
  if (profile.role === 'provider') {
    return settlements.filter((s) => {
      const match = [s.partner_code, s.partner_code_snapshot].includes(companyCode);
      return match && !SETTLEMENT_DONE.includes(s.settlement_status || s.status);
    }).length;
  }
  if (profile.role === 'agent') {
    return settlements.filter((s) => {
      const match = s.agent_uid === uid || s.agent_code === (profile.user_code || '');
      return match && !SETTLEMENT_DONE.includes(s.settlement_status || s.status);
    }).length;
  }
  if (profile.role === 'agent_manager') {
    return settlements.filter((s) => {
      const match = [s.channel_code, s.agent_channel_code].includes(companyCode);
      return match && !SETTLEMENT_DONE.includes(s.settlement_status || s.status);
    }).length;
  }
  return 0;
}

// ─── 초기화 ──────────────────────────────────────────────────────────────────

let _initialized = false;

async function init() {
  if (_initialized) return;
  _initialized = true;
  try {
    const auth = await requireAuth();
    if (!auth?.profile || !auth?.user) { _initialized = false; return; }
    profile = auth.profile;
    uid = auth.user.uid;
    userCode = profile.user_code || '';
    companyCode = profile.company_code || '';

    let _rafId = 0;
    function scheduleBadges() { if (_rafId) return; _rafId = requestAnimationFrame(() => { _rafId = 0; syncAllBadges(); }); }
    watchRooms((rooms) => {
      counts.chat = countUnreadRooms(rooms);
      // 대화 페이지 + 포커스 상태에선 UI 가 이미 반영하므로 소리 생략.
      // 다른 창 보고 있거나 탭 백그라운드면 울려야 함.
      const onChatPage = /^\/(chat|m\/chat)(\/|$)/.test(location.pathname);
      const isFocused = document.visibilityState === 'visible' && document.hasFocus();
      const skip = onChatPage && isFocused;
      if (prevChatCount >= 0 && counts.chat > prevChatCount && !skip) {
        playNotifSound({ type: 'message' });
      }
      prevChatCount = counts.chat;
      scheduleBadges();
    });
    watchContracts((items) => {
      counts.contract = countActionContracts(items);
      if (prevContractCount >= 0 && counts.contract > prevContractCount) playNotifSound({ type: 'contract' });
      prevContractCount = counts.contract;
      scheduleBadges();
    });
    watchSettlements((items) => {
      counts.settlement = countActionSettlements(items);
      scheduleBadges();
    });

    if (profile.role === 'admin') {
      watchUsers((items) => { counts.member = countPendingUsers(items); scheduleBadges(); });
      watchPartners((items) => { counts.partner = countPendingPartners(items); scheduleBadges(); });
    }
  } catch (_) { _initialized = false; }
}

init();
