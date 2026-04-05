/**
 * mobile/chat.js — 모바일 전용 채팅
 * Firebase 직접 조회. 웹 chat.js와 분리.
 */
import { requireAuth } from '../core/auth-guard.js';
import { watchRooms, watchMessages, sendMessage, markRoomRead, watchProducts } from '../firebase/firebase-db.js';
import { normalizeProduct } from '../shared/product-list-detail-view.js';
import { escapeHtml } from '../core/management-format.js';
import { showToast, showConfirm } from '../core/toast.js';

let currentUser = null;
let currentProfile = null;
let currentRoomId = null;
let allRooms = [];
let productMap = new Map();
let unsubMessages = null;

// DOM
const $rooms = document.getElementById('chatMRooms');
const $chatroom = document.getElementById('mChatroom');
const $msgList = document.getElementById('message-list');
const $msgForm = document.getElementById('message-form');
const $msgInput = document.getElementById('message-input');
const $chatCode = document.getElementById('chat-code');

// ─── 방 목록 렌더링 ─────────────────────────────────────────────────────────

function renderRooms(rooms) {
  if (!$rooms) return;
  if (!rooms.length) {
    $rooms.innerHTML = '<div class="m-list-empty">대화가 없습니다.</div>';
    return;
  }
  $rooms.innerHTML = rooms.map(room => {
    const product = productMap.get(room.product_uid);
    const carNo = room.vehicle_number || product?.carNo || '';
    const model = room.model_name || product?.model || '';
    const partner = currentProfile?.role === 'agent'
      ? (room.provider_name || room.provider_company_code || '')
      : (room.agent_name || room.agent_code || '');
    const lastMsg = truncate(room.last_message || '', 25);
    const date = formatDate(room.last_message_at);
    const unread = currentProfile?.role === 'agent'
      ? (room.unread_for_agent || 0)
      : (room.unread_for_provider || 0);
    const badge = unread > 0 ? `<span class="m-list-badge m-list-badge--blue">${unread}</span>` : '';
    const active = room.room_id === currentRoomId ? ' is-active' : '';

    return `<div class="m-list-card${active}" data-room-id="${escapeHtml(room.room_id)}">
      <div class="m-list-card__avatar"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/></svg></div>
      <div class="m-list-card__body">
        <div class="m-list-card__main">
          <span class="m-list-card__name">${escapeHtml(carNo || model || '대화')}</span>
          ${badge}
        </div>
        <div class="m-list-card__sub">
          <span class="m-list-card__info">${escapeHtml(partner ? partner + ' · ' : '')}${escapeHtml(lastMsg)}</span>
          <span class="m-list-card__date">${escapeHtml(date)}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ─── 메시지 렌더링 ───────────────────────────────────────────────────────────

function renderMessages(messages) {
  if (!$msgList) return;
  if (!messages.length) {
    $msgList.innerHTML = '<div class="empty-block">아직 메시지가 없습니다.</div>';
    return;
  }
  const sorted = [...messages].sort((a, b) => a.created_at - b.created_at);
  let lastDate = '';
  $msgList.innerHTML = sorted.map(msg => {
    const own = msg.sender_uid === currentUser.uid ? 'out' : 'in';
    const time = new Date(msg.created_at);
    const hm = `${String(time.getHours()).padStart(2,'0')}:${String(time.getMinutes()).padStart(2,'0')}`;
    const dateStr = `${time.getFullYear()}.${String(time.getMonth()+1).padStart(2,'0')}.${String(time.getDate()).padStart(2,'0')}`;
    let divider = '';
    if (dateStr !== lastDate) { lastDate = dateStr; divider = `<div class="message-date-divider">${dateStr}</div>`; }
    return `${divider}<div class="message-wrap ${own}">
      <div class="message-content">
        <div class="message-sender sender-${msg.sender_role || 'etc'}">${escapeHtml(msg.sender_code || '')}</div>
        <div class="message-bubble role-${msg.sender_role || 'etc'}">${escapeHtml(msg.text || '')}</div>
      </div>
      <div class="message-time">${hm}</div>
    </div>`;
  }).join('');
  $msgList.scrollTop = $msgList.scrollHeight;
}

// ─── 방 열기/닫기 ────────────────────────────────────────────────────────────

function openRoom(roomId) {
  currentRoomId = roomId;
  if ($chatroom) $chatroom.hidden = false;
  document.body.classList.add('chat-m-open');
  // 현재 높이 고정 → 키보드 올라와도 레이아웃 안 흔들림
  const mainShell = document.querySelector('.main-shell--new');
  if (mainShell) mainShell.style.height = `${mainShell.offsetHeight}px`;
  history.pushState({ chatRoom: true }, '');

  // 읽음 처리
  markRoomRead(roomId, currentUser.uid, currentProfile.role).catch(() => {});

  // 메시지 구독
  if (unsubMessages) unsubMessages();
  unsubMessages = watchMessages(roomId, renderMessages);

  // 코드 표시
  const room = allRooms.find(r => r.room_id === roomId);
  if ($chatCode) $chatCode.textContent = room?.chat_code || '';

  // 목록 active 갱신
  $rooms?.querySelectorAll('.m-list-card').forEach(el => {
    el.classList.toggle('is-active', el.getAttribute('data-room-id') === roomId);
  });

  // 입력 포커스
  setTimeout(() => $msgInput?.focus(), 300);
}

function closeRoom() {
  if ($chatroom) $chatroom.hidden = true;
  document.body.classList.remove('chat-m-open');
  // 고정 높이 해제
  const mainShell = document.querySelector('.main-shell--new');
  if (mainShell) mainShell.style.height = '';
  if (unsubMessages) { unsubMessages(); unsubMessages = null; }
  currentRoomId = null;
}

// ─── 유틸 ────────────────────────────────────────────────────────────────────

function truncate(text, max) { return text.length > max ? text.slice(0, max) + '…' : text; }
function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  return `${d.getMonth()+1}/${d.getDate()}`;
}

// ─── 이벤트 ──────────────────────────────────────────────────────────────────

function bindEvents() {
  // 방 클릭
  $rooms?.addEventListener('click', (e) => {
    const card = e.target.closest('.m-list-card[data-room-id]');
    if (card) openRoom(card.getAttribute('data-room-id'));
  });

  // 메시지 전송 — 포커스 유지, 비동기 대기 안 함
  $msgForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!$msgInput) return;
    const text = $msgInput.value.trim();
    if (!text || !currentRoomId) return;
    $msgInput.value = '';
    sendMessage(currentRoomId, {
      sender_uid: currentUser.uid,
      sender_code: currentProfile.user_code || currentProfile.company_code || '-',
      sender_role: currentProfile.role,
      sender_partner_code: currentProfile.company_code || '',
      text
    }).catch(() => showToast('메시지 전송에 실패했습니다.', 'error'));
  });

  // 핸드폰 뒤로가기 → 채팅방 닫기
  window.addEventListener('popstate', () => {
    if (document.body.classList.contains('chat-m-open')) {
      closeRoom();
    }
  });
}

// ─── 초기화 ──────────────────────────────────────────────────────────────────

async function init() {
  const { user, profile } = await requireAuth({ roles: ['provider','agent','admin'] });
  currentUser = user;
  currentProfile = profile;

  // 필터 config (mobile-shell.js에서 사용)
  window._mobileFilterConfig = { sidebar: 'chatMFilterSidebar', overlay: 'chatMFilterOverlay', close: 'chatMFilterClose' };

  bindEvents();

  // 상품 맵 구축 (방 목록에 차량 정보 표시용)
  watchProducts((products) => {
    productMap = new Map(products.map(p => {
      const n = normalizeProduct(p);
      return [n.id, n];
    }));
    renderRooms(allRooms); // 상품 정보 갱신 시 방 목록도 재렌더
  });

  // 방 목록 구독
  watchRooms((rooms) => {
    // 숨긴 방 필터
    allRooms = rooms.filter(r => !r.hidden_by?.[user.uid]);
    renderRooms(allRooms);
  });
}

export function onHide() {
  document.body.classList.remove('page-chat', 'chat-m-open');
  window._mobileFilterConfig = null;
  if (window.clearMobileBackHandler) window.clearMobileBackHandler();
}
export function onShow() {
  document.body.classList.add('page-chat');
}

init().catch(e => console.error('[mobile/chat]', e));
