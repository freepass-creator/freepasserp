/**
 * sidebar-alerts.js
 * 사이드바 메뉴별 실시간 알림 뱃지 + 축소 모드 Notification Dot.
 * workspace_new.html 에서 한 번 로드, SPA 네비게이션에도 유지.
 */

import { requireAuth } from './auth-guard.js';
import { watchRooms, watchUsers, watchPartners, watchContracts, watchSettlements } from '../firebase/firebase-db.js';

let profile = null;
let uid = '';
let companyCode = '';
let counts = { chat: 0, member: 0, partner: 0, contract: 0, settlement: 0 };

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
      if (badge) badge.hidden = true;
      link.classList.remove('has-new-event');
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
    // 역할별 방 필터
    if (profile.role === 'agent' && room.agent_uid && room.agent_uid !== uid) return false;
    if (profile.role === 'provider' && room.provider_code && room.provider_code !== companyCode) return false;
    // 메시지 없으면 제외
    if (!Number(room.last_message_at || 0)) return false;
    // 회신대기 기준: 마지막 발송자(agent/provider만)가 상대방이면 회신대기
    const eff = room.last_effective_sender_role || '';
    const last = room.last_sender_role || '';
    const sender = (eff === 'agent' || eff === 'provider') ? eff : ((last === 'agent' || last === 'provider') ? last : '');
    if (!sender) return false;
    // 관리자/공급사: 영업자가 마지막 = 회신대기
    if (profile.role === 'admin' || profile.role === 'provider') return sender === 'agent';
    // 영업자: 공급사가 마지막 = 회신대기
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
  return 0;
}

// ─── 초기화 ──────────────────────────────────────────────────────────────────

async function init() {
  try {
    const auth = await requireAuth();
    if (!auth?.profile || !auth?.user) return;
    profile = auth.profile;
    uid = auth.user.uid;
    companyCode = profile.company_code || '';

    watchRooms((rooms) => {
      counts.chat = countUnreadRooms(rooms);
      console.log('[sidebar-alerts] chat count:', counts.chat, 'rooms:', rooms.length);
      syncAllBadges();
    });
    watchContracts((items) => { counts.contract = countActionContracts(items); syncAllBadges(); });
    watchSettlements((items) => { counts.settlement = countActionSettlements(items); syncAllBadges(); });

    if (profile.role === 'admin') {
      watchUsers((items) => { counts.member = countPendingUsers(items); syncAllBadges(); });
      watchPartners((items) => { counts.partner = countPendingPartners(items); syncAllBadges(); });
    }
  } catch (_) {}
}

init();
