import { requireAuth } from '../core/auth-guard.js';
import { qs, registerPageCleanup, runPageCleanup, roleLabel } from '../core/utils.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { deleteRoomEverywhere, ensureRoom, hideRoomForUser, markRoomRead, resolveTermForProduct, sendMessage, watchContracts, watchMessages, watchProducts, watchRooms } from '../firebase/firebase-db.js';
import { extractTermFields, normalizeProduct } from '../shared/product-list-detail-view.js';
import { renderMobileProductDetail } from '../shared/mobile-product-detail-markup.js';
import { createChatRoomSelectionController } from './chat/room-selection.js';
import { escapeHtml, normalizeLookupKey, renderChatRoomList, syncSelectedRoomRow, truncate, deriveStatusLabel, deriveReplyStatus, formatDate, formatTime } from './chat/room-list.js';
import { renderSkeletonRows } from '../core/management-list.js';
import { showToast, showConfirm } from '../core/toast.js';
import { createChatContractPanel } from './chat/contract-panel.js';

let menu = qs('#sidebar-menu');
let roomList = qs('#room-list');
let messageList = qs('#message-list');
let messageForm = qs('#message-form');
let messageInput = qs('#message-input');
let chatCode = qs('#chat-code');
let feedback = qs('#chat-message');
let detailTitle = qs('#cc-title');
let filterToggleButton = qs('#openChatFilterBtn');
let filterOverlay = qs('#chatFilterOverlay');
let hideRoomBtn = qs('#hideRoomBtn');
let deleteRoomBtn = qs('#deleteRoomBtn');

function bindDOM() {
  menu = qs('#sidebar-menu');
  roomList = qs('#room-list');
  messageList = qs('#message-list');
  messageForm = qs('#message-form');
  messageInput = qs('#message-input');
  chatCode = qs('#chat-code');
  feedback = qs('#chat-message');
  detailTitle = qs('#cc-title');
  filterToggleButton = qs('#openChatFilterBtn');
  filterOverlay = qs('#chatFilterOverlay');
  hideRoomBtn = qs('#hideRoomBtn');
  deleteRoomBtn = qs('#deleteRoomBtn');
}

const params = new URLSearchParams(window.location.search);
const pendingChatRoom = localStorage.getItem('freepass_pending_chat_room');
if (pendingChatRoom) localStorage.removeItem('freepass_pending_chat_room');
const preferredRoomId = params.get('room_id') || pendingChatRoom || null;
const preferredProductCode = params.get('product_code');

// room_id가 있으면 즉시 채팅뷰 오픈 + 입력창 활성 (모듈 로드 직후 동기 실행)
if (preferredRoomId) {
  const _mf = document.getElementById('message-form');
  if (_mf) _mf.classList.remove('is-disabled');
  if (window.matchMedia('(max-width: 768px)').matches) {
    document.body.classList.add('chat-m-open');
  }
  const _mi = document.getElementById('message-input');
  if (_mi) _mi.focus();
}

let currentRoomId = preferredRoomId || null;
let currentProfile = null;
let currentUser = null;
let productsMap = new Map();
let _ensureRoomPending = false;
let roomMap = new Map();
let openedRoomId = null;
let visibleRoomsCache = [];
let localHiddenRoomIds = new Set();
let activePhotoIndex = 0;
let allContracts = [];

const termCache = {};
const termLoading = {};

// ── 모바일 채팅 ──────────────────────────────────────────────────────────────

const isMobileQuery = window.matchMedia('(max-width: 768px)');

function openMobileChatView() {
  if (!isMobileQuery.matches) return;
  document.body.classList.add('chat-m-open');
  history.pushState({ chatOpen: true }, '');
  if (window.showMobileBackBtn) window.showMobileBackBtn();
  const input = document.getElementById('message-input');
  if (input) input.focus();
}

function closeMobileChatView() {
  document.body.classList.remove('chat-m-open');
  if (window.hideMobileBackBtn) window.hideMobileBackBtn();
  // visualViewport 조정 초기화
  const panel = document.querySelector('.layout-633');
  if (panel) panel.style.bottom = '';
}

function renderMobileRooms(rooms) {
  const container = document.getElementById('chatMRooms');
  if (!container) return;
  if (!rooms.length) {
    container.innerHTML = '<div class="chat-m-empty">등록된 대화가 없습니다.</div>';
    return;
  }
  container.innerHTML = rooms.map(room => {
    const product = getRoomProductLookupKeys(room).map(k => productsMap.get(k)).find(Boolean) || null;
    const model = product?.subModel || product?.model || room.model_name || '';
    const carNo = product?.carNo || room.car_number || '';
    const mainLine = carNo ? `${carNo}${model ? ` ${model}` : ''}` : (model || '-');
    const at = room.last_message_at || room.created_at;
    const replyStatus = deriveReplyStatus(room);
    const isActive = room.room_id === currentRoomId;
    const badgeCls = replyStatus === '문의접수' ? 'm-list-badge--red' : 'm-list-badge--green';
    const badge = replyStatus ? `<span class="m-list-badge ${badgeCls}">${escapeHtml(replyStatus)}</span>` : '';
    const avatarCls = replyStatus === '문의접수' ? 'm-list-card__avatar--pending' : 'm-list-card__avatar--done';
    const avatarIcon = replyStatus === '문의접수'
      ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>'
      : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/><path d="m9 12 2 2 4-4"/></svg>';
    const providerCode = room.provider_company_code || '';
    const agentCode = room.agent_code || '';
    const msgText = room.last_message || '대화 시작 전';
    const subInfo = [providerCode, agentCode, truncate(msgText, 20)].filter(Boolean).join(' · ');
    return `<div class="m-list-card${isActive ? ' is-active' : ''}" data-room-id="${escapeHtml(room.room_id || '')}">
      <span class="m-list-card__avatar ${avatarCls}">${avatarIcon}</span>
      <div class="m-list-card__body">
        <div class="m-list-card__main">
          <span class="m-list-card__name">${escapeHtml(mainLine)}</span>
          ${badge}
        </div>
        <div class="m-list-card__sub">
          <span class="m-list-card__info">${escapeHtml(subInfo)}</span>
          <span class="m-list-card__date">${escapeHtml(formatDate(at))}</span>
        </div>
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.m-list-card').forEach(card => {
    card.addEventListener('click', () => {
      const roomId = card.dataset.roomId;
      const room = visibleRoomsCache.find(r => r.room_id === roomId);
      if (!room) return;
      currentRoomId = roomId;
      roomSelectionController.openRoom(room);
      openMobileChatView();
    });
  });
}

function getProductLookupKeys(product = {}) {
  return [...new Set([
    product.productCode,
    product.productUid,
    product.id
  ].map((item) => normalizeLookupKey(item)).filter(Boolean))];
}

function getRoomProductLookupKeys(room = {}) {
  return [...new Set([
    room.product_code,
    room.product_code_snapshot,
    room.product_uid
  ].map((item) => normalizeLookupKey(item)).filter(Boolean))];
}

function getTermCacheKey(product) {
  const code = String(product?.policyCode || product?.termCode || '').trim();
  if (code) return `code:${code}`;
  const providerCode = String(product?.providerCompanyCode || product?.partnerCode || '').trim();
  const termName = String(product?.termName || '').trim();
  if (providerCode || termName) return `lookup:${providerCode}:${termName}`;
  return '';
}

function getTermFields(product) {
  const cacheKey = getTermCacheKey(product);
  return cacheKey ? (termCache[cacheKey] || {}) : {};
}

function getCurrentRoom() {
  return currentRoomId ? roomMap.get(currentRoomId) || null : null;
}

function getCurrentProduct(targetRoom) {
  const room = targetRoom || getCurrentRoom();
  if (!room) return null;
  const keys = getRoomProductLookupKeys(room);
  for (const key of keys) {
    const product = productsMap.get(key);
    if (product) return product;
  }
  return null;
}

async function ensureChatTermLoaded(product) {
  const cacheKey = getTermCacheKey(product);
  if (!cacheKey || termCache[cacheKey] || termLoading[cacheKey]) return;
  termLoading[cacheKey] = true;
  try {
    const term = await resolveTermForProduct({
      termCode: product?.policyCode || product?.termCode || '',
      termName: product?.termName || '',
      providerCompanyCode: product?.providerCompanyCode || product?.partnerCode || ''
    });
    termCache[cacheKey] = term ? extractTermFields(term) : {};
  } catch (error) {
    console.error('[chat] resolveTermForProduct failed', error);
    termCache[cacheKey] = {};
  } finally {
    delete termLoading[cacheKey];
    const currentProduct = getCurrentProduct();
    if (currentProduct && currentProduct.id === product.id) {
      roomSelectionController?.renderCurrentDetail();
    }
  }
}

function roleName(role) { const l = roleLabel(role); return l === '-' ? '' : l; }

function formatMessageTime(ts) {
  try { return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }); } catch (_) { return ''; }
}

function formatRoleBadge() { return ''; }

function renderMessages(messages) {
  if (!messageList) return;
  if (!messages.length) {
    messageList.innerHTML = '<div class="empty-block">아직 메시지가 없습니다.</div>';
    return;
  }
  const sorted = messages.sort((a, b) => a.created_at - b.created_at || String(a.id || '').localeCompare(String(b.id || '')));
  // 상대방 읽음 시점 계산
  const room = getCurrentRoom();
  const readBy = room?.read_by || {};
  const myUid = currentUser?.uid;
  // 상대방들의 마지막 읽은 시점 (내가 아닌 사람들 중 가장 최근)
  let otherLastRead = 0;
  for (const [uid, ts] of Object.entries(readBy)) {
    if (uid !== myUid && Number(ts) > otherLastRead) otherLastRead = Number(ts);
  }

  let lastDate = '';
  const html = sorted.map((message) => {
    const own = message.sender_uid === myUid ? 'out' : 'in';
    const roleClass = `role-${message.sender_role || 'etc'}`;
    const senderLabel = `${escapeHtml(message.sender_code || roleName(message.sender_role))} ${formatRoleBadge(message.sender_role)}`;
    const time = formatMessageTime(message.created_at);
    // 내가 보낸 메시지 — 상대가 읽었는지
    const isRead = own === 'out' && otherLastRead >= message.created_at;
    const readMark = isRead ? '<span class="message-read">읽음</span>' : '';

    // 날짜 구분선
    const msgDate = new Date(message.created_at);
    const dateStr = `${msgDate.getFullYear()}.${String(msgDate.getMonth()+1).padStart(2,'0')}.${String(msgDate.getDate()).padStart(2,'0')}`;
    let divider = '';
    if (dateStr !== lastDate) {
      lastDate = dateStr;
      divider = `<div class="message-date-divider">${dateStr}</div>`;
    }

    return `${divider}
      <div class="message-wrap ${own}">
        <div class="message-content">
          <div class="message-sender sender-${message.sender_role || 'etc'}">${senderLabel}</div>
          <div class="message-bubble ${roleClass}">${escapeHtml(message.text || '')}</div>
        </div>
        <div class="message-time">${time}${readMark}</div>
      </div>
    `;
  }).join('');
  messageList.innerHTML = html;
  messageList.scrollTop = messageList.scrollHeight;
}

let chatContractPanel = null;

function findContractsForRoom(room) {
  if (!room || !allContracts.length) return [];
  const carNo = (room.vehicle_number || '').trim();
  const productUid = (room.product_uid || '').trim();
  return allContracts.filter(c => {
    if (productUid && (c.product_uid || '').trim() === productUid) return true;
    if (carNo && (c.car_number || '').trim() === carNo) return true;
    return false;
  });
}

// ── 상품 상세 슬라이드 패널 ──
const $pdPanel = document.getElementById('chatProductDetailPanel');
const $pdCard = document.getElementById('chatProductDetailCard');
const $pdTitle = document.getElementById('chatProductDetailTitle');

function openProductDetailSlide(room) {
  if (!$pdPanel || !$pdCard) return;
  const product = getCurrentProduct(room);
  if (!product) { showToast('상품 정보를 찾을 수 없습니다.', 'info'); return; }
  const rawProduct = product._raw || product;
  const carNo = String(room?.vehicle_number || product?.carNo || '').trim();
  if ($pdTitle) $pdTitle.textContent = carNo ? `상세정보 (${carNo})` : '상세정보';

  const termFields = extractTermFields(product);
  $pdCard.innerHTML = `<div class="m-pd m-pd--desktop">${renderMobileProductDetail(rawProduct, {
    activePhotoIndex: 0,
    policy: termFields,
    showFee: false,
  })}</div>`;

  $pdPanel.hidden = false;
  $pdPanel.classList.remove('is-open');
  requestAnimationFrame(() => { $pdPanel.classList.add('is-open'); });
}

function hideProductDetailSlide() {
  if (!$pdPanel || $pdPanel.hidden) return;
  $pdPanel.classList.remove('is-open');
  const onEnd = () => { $pdPanel.hidden = true; $pdPanel.removeEventListener('transitionend', onEnd); };
  $pdPanel.addEventListener('transitionend', onEnd);
  // fallback
  setTimeout(() => { if (!$pdPanel.hidden) $pdPanel.hidden = true; }, 300);
}

document.getElementById('chatCloseDetailBtn')?.addEventListener('pointerdown', hideProductDetailSlide);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $pdPanel && !$pdPanel.hidden) hideProductDetailSlide(); });

document.getElementById('chatDetailContractBtn')?.addEventListener('click', () => {
  const room = roomMap.get(currentRoomId);
  if (!room) return;
  if (currentProfile?.role !== 'agent') { showToast('영업자 계정에서만 계약을 생성할 수 있습니다.', 'error'); return; }
  const product = getCurrentProduct();
  const seed = {
    product_uid: room.product_uid || product?.productUid || product?.id || '',
    product_code: room.product_code || product?.productCode || '',
    partner_code: room.provider_company_code || product?.providerCompanyCode || '',
    car_number: room.vehicle_number || product?.carNo || '',
    model_name: room.model_name || product?.model || '',
    sub_model: product?.subModel || '',
    rent_month: '48',
    rent_amount: product?.price?.['48']?.rent || 0,
    deposit_amount: product?.price?.['48']?.deposit || 0
  };
  localStorage.setItem('freepass_pending_contract_seed', JSON.stringify(seed));
  window.location.href = '/contract';
});

document.getElementById('chatDetailShareBtn')?.addEventListener('click', async () => {
  const room = roomMap.get(currentRoomId);
  if (!room) return;
  const product = getCurrentProduct();
  const productId = product?.productUid || product?.id || room.product_uid || '';
  const carNo = room.vehicle_number || product?.carNo || '';
  const url = new URL(window.location.origin + '/catalog');
  if (currentProfile?.user_code) url.searchParams.set('a', currentProfile.user_code);
  if (productId) url.searchParams.set('id', productId);
  else if (carNo) url.searchParams.set('car', carNo);
  const shareUrl = url.toString();
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(shareUrl); showToast('공유 링크가 복사되었습니다.', 'success'); return; }
  } catch (e) { if (e?.name === 'AbortError') return; }
  window.prompt('아래 링크를 복사하세요.', shareUrl);
});

function renderContractForCurrentRoom() {
  if (!chatContractPanel) return;
  const room = roomMap.get(currentRoomId);
  if (!room) { chatContractPanel.resetForm(); return; }
  const contracts = findContractsForRoom(room);
  if (!contracts.length) {
    chatContractPanel.resetForm(room, { getCurrentProduct });
    return;
  }
  chatContractPanel.fillForm(contracts[0]);
}

const roomSelectionController = createChatRoomSelectionController({
  roomList,
  messageList,
  detailCard: null,
  detailTitle,
  chatCode,
  markRoomRead,
  watchMessages,
  renderMessages,
  ensureChatTermLoaded,
  getCurrentRoom,
  getCurrentProduct,
  getTermFields,
  getCurrentRoomId: () => currentRoomId,
  setCurrentRoomId: (value) => {
    currentRoomId = value;
    messageForm?.classList.toggle('is-disabled', !value);
  },
  getCurrentProfile: () => currentProfile,
  getCurrentUser: () => currentUser,
  getActivePhotoIndex: () => activePhotoIndex,
  setActivePhotoIndex: (value) => { activePhotoIndex = value; },
  getOpenedRoomId: () => openedRoomId,
  setOpenedRoomId: (value) => { openedRoomId = value; },
  onRoomOpened: () => renderContractForCurrentRoom()
});

async function bootstrap() {
  try {
    const { user, profile } = await requireAuth({ roles: ['provider', 'agent', 'agent_manager', 'admin'] });
    currentProfile = profile;
    currentUser = user;
    renderRoleMenu(menu, profile.role);
    // 입력칸에 계정코드 워터마크
    if (messageForm) {
      const codeEl = document.createElement('span');
      codeEl.className = 'message-form-code';
      codeEl.textContent = profile.user_code || profile.company_code || '';
      messageForm.appendChild(codeEl);
    }
    filterToggleButton?.addEventListener('click', () => {
      const isOpen = filterOverlay?.classList.contains('is-open');
      filterOverlay?.classList.toggle('is-open', !isOpen);
      filterOverlay?.setAttribute('aria-hidden', String(isOpen));
    });
    roomSelectionController.applyChatHeadActions({ deleteRoomBtn, hideRoomBtn, chatShareBtn: qs('#detailShareBtn'), chatContractBtn: qs('#detailContractBtn') });
    registerPageCleanup(() => roomSelectionController.cleanup());

    // ── 계약 패널 초기화 ──
    chatContractPanel = createChatContractPanel({ profile, user });
    registerPageCleanup(() => chatContractPanel?.destroy());

    // ── 계약 데이터 실시간 감시 ──
    registerPageCleanup(watchContracts((contracts) => {
      allContracts = contracts;
      renderContractForCurrentRoom();
    }));

    // 모바일 뒤로가기: 채팅창 → 대화목록
    document.getElementById('mobile-back-btn')?.addEventListener('click', async () => {
      const messageInput = document.getElementById('message-input');
      if (messageInput && messageInput.value.trim()) {
        const ok = await showConfirm('작성 중인 메시지가 있습니다.\n대화목록으로 돌아가시겠습니까?');
        if (!ok) return;
      }
      closeMobileChatView();
    });

    // 상세패널 버튼 이벤트
    qs('#detailShareBtn')?.addEventListener('click', async () => {
      const room = roomSelectionController.getCurrentRoom();
      if (!room) return;
      const product = getCurrentProduct();
      const productId = product?.productUid || product?.id || room.product_uid || '';
      const carNo = room.vehicle_number || product?.carNo || '';
      const url = new URL(window.location.origin + '/catalog');
      if (currentProfile?.user_code) url.searchParams.set('a', currentProfile.user_code);
      if (productId) url.searchParams.set('id', productId);
      else if (carNo) url.searchParams.set('car', carNo);
      const shareUrl = url.toString();
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(shareUrl);
          showToast('공유 링크가 복사되었습니다.', 'success');
          return;
        }
      } catch (e) {
        if (e?.name === 'AbortError') return;
      }
      window.prompt('아래 링크를 복사하세요.', shareUrl);
    });
    qs('#detailContractBtn')?.addEventListener('click', async () => {
      const room = roomSelectionController.getCurrentRoom();
      if (!room) return;
      const product = getCurrentProduct();
      if (!product && !room.product_uid) { showToast('상품 정보가 없습니다.', 'error'); return; }
      if (profile.role !== 'agent') { showToast('영업자 계정에서만 계약을 생성할 수 있습니다.', 'error'); return; }
      if (!await showConfirm('이 상품에 대해 계약을 생성하시겠습니까?')) return;
      const seed = {
        product_uid: room.product_uid || product?.productUid || product?.id || '',
        product_code: room.product_code || product?.productCode || product?.id || '',
        partner_code: room.provider_company_code || product?.partnerCode || '',
        car_number: room.vehicle_number || product?.carNo || '',
        model_name: room.model_name || product?.model || '',
        sub_model: product?.subModel || '',
        rent_month: '48',
        rent_amount: product?.price?.['48']?.rent || 0,
        deposit_amount: product?.price?.['48']?.deposit || 0
      };
      localStorage.setItem('freepass_pending_contract_seed', JSON.stringify(seed));
      window.location.href = '/contract';
    });

    registerPageCleanup(watchProducts((products) => {
      const normalizedProducts = products.map((p) => Object.assign(normalizeProduct(p), { _raw: p })).filter((item) => item.id);
      productsMap = new Map();
      normalizedProducts.forEach((item) => {
        getProductLookupKeys(item).forEach((key) => {
          productsMap.set(key, item);
        });
      });

      if (profile.role === 'agent' && preferredProductCode && !currentRoomId && !_ensureRoomPending) {
        const product = productsMap.get(normalizeLookupKey(preferredProductCode));
        if (product) {
          _ensureRoomPending = true;
          ensureRoom({
            productUid: product.productUid || '',
            productCode: product.productCode || preferredProductCode,
            providerUid: product.providerUid,
            providerCompanyCode: product.providerCompanyCode,
            providerName: product.providerName || '',
            agentUid: user.uid,
            agentCode: profile.user_code,
            agentName: profile.name || '',
            agentChannelCode: profile.company_code || '',
            vehicleNumber: product.carNo,
            modelName: [product.maker, product.model, product.subModel, product.trim].filter(Boolean).join(' ')
          }).then((roomId) => {
            currentRoomId = roomId;
            // 생성된 방 자동 오픈 + 입력칸 포커스
            const tryOpen = () => {
              const newRoom = visibleRoomsCache.find(r => r.room_id === roomId);
              if (newRoom) { roomSelectionController.openRoom(newRoom); openMobileChatView(); return; }
              setTimeout(tryOpen, 300);
            };
            tryOpen();
          }).catch((e) => {
            console.warn('[chat] ensureRoom failed', e);
          }).finally(() => {
            _ensureRoomPending = false;
          });
        }
      }

      if (currentRoomId && roomMap.has(currentRoomId)) {
        roomSelectionController.renderCurrentDetail();
      }
      // 상품 로드 후 room list 재렌더링 (세부모델 등 상품 매칭 데이터 반영)
      if (visibleRoomsCache && visibleRoomsCache.length) {
        renderChatRoomList({
          thead: document.getElementById('room-list-head'),
          container: roomList,
          rooms: visibleRoomsCache,
          selectedRoomId: currentRoomId || '',
          productsMap,
          getRoomProductLookupKeys,
          onSelect: (room) => roomSelectionController.openRoom(room),
          myRole: currentProfile?.role || '',
          myUid: currentUser?.uid || '',
        });
        renderMobileRooms(visibleRoomsCache);
        if (currentRoomId) syncSelectedRoomRow(roomList, currentRoomId);
      }
    }));

    renderSkeletonRows(roomList, [
      { key: 'status', label: '대화상태' },
      { key: 'carNo', label: '차량번호' },
      { key: 'model', label: '세부모델' },
      { key: 'partner', label: '공급사코드' },
      { key: 'agent', label: '영업자코드' },
      { key: 'message', label: '마지막메시지' },
      { key: 'date', label: '일자' },
      { key: 'time', label: '시간' },
    ], 8);
    registerPageCleanup(watchRooms((rooms) => {
      const visibleRooms = rooms.filter((room) => {
        if (localHiddenRoomIds.has(room.room_id)) return false;
        const hiddenBy = room.hidden_by || {};
        const isHiddenForMe = !!hiddenBy[user.uid];
        if (isHiddenForMe) return false;
        if (profile.role === 'admin') return true;
        if (profile.role === 'agent_manager') return (room.agent_channel_code || '') === (profile.company_code || '');
        if (profile.role === 'agent') return room.agent_uid === user.uid || room.agent_code === profile.user_code;
        if (profile.role === 'provider') return (room.provider_company_code || '') === (profile.company_code || '');
        return false;
      });

      visibleRoomsCache = visibleRooms;
      roomMap = new Map(visibleRooms.map((room) => [room.room_id, room]));
      if (roomList) roomList.innerHTML = '';

      if (!visibleRooms.length) {
        // preferredRoomId 대기 중이면 clearRoomSelection 하지 않음 (currentRoomId 보존)
        if (currentRoomId && currentRoomId === preferredRoomId) return;
        renderChatRoomList({
          thead: document.getElementById('room-list-head'),
          container: roomList,
          rooms: [],
          selectedRoomId: '',
          productsMap,
          getRoomProductLookupKeys,
          onSelect: () => {},
          myRole: currentProfile?.role || '',
          myUid: currentUser?.uid || '',
        });
        renderMobileRooms([]);
        roomSelectionController.clearRoomSelection('등록된 대화가 없습니다.', '등록된 대화가 없습니다.');
        return;
      }

      renderChatRoomList({
        thead: document.getElementById('room-list-head'),
        container: roomList,
        rooms: visibleRooms,
        selectedRoomId: currentRoomId || '',
        productsMap,
        getRoomProductLookupKeys,
        onSelect: (room) => roomSelectionController.openRoom(room),
        myRole: currentProfile?.role || '',
      });
      renderMobileRooms(visibleRooms);

      if (currentRoomId && roomMap.has(currentRoomId)) {
        const currentRoom = roomMap.get(currentRoomId);
        chatCode.textContent = currentRoom.chat_code || currentRoom.room_id;
        roomSelectionController.renderCurrentDetail();
        syncSelectedRoomRow(roomList, currentRoomId);
        if (openedRoomId !== currentRoomId) {
          roomSelectionController.openRoom(currentRoom);
          openMobileChatView();
        }
        return;
      }

      if (currentRoomId && !roomMap.has(currentRoomId)) {
        // URL로 전달된 방이 아직 Firebase에 전파 중이면 기다림 (clearRoomSelection 하지 않음)
        if (currentRoomId === preferredRoomId) return;
        roomSelectionController.clearRoomSelection();
        return;
      }

      roomSelectionController.clearRoomSelection();
    }));

    hideRoomBtn?.addEventListener('click', async () => {
      if (!currentRoomId) {
        showToast('먼저 대화방을 선택하세요.', 'info');
        return;
      }
      if (!await showConfirm('이 대화를 목록에서 숨기시겠습니까?')) return;
      try {
        const hidingId = currentRoomId;
        localHiddenRoomIds.add(hidingId);
        await hideRoomForUser(hidingId, user.uid);
        await roomSelectionController.moveToNextRoomAfterRemoval(visibleRoomsCache);
        showToast('대화를 숨겼습니다.', 'success');
      } catch (error) {
        showToast(`숨김 실패: ${error.message || '알 수 없는 오류'}`, 'error');
      }
    });

    deleteRoomBtn?.addEventListener('click', async () => {
      if (!currentRoomId) {
        showToast('먼저 대화방을 선택하세요.', 'info');
        return;
      }
      if (!await showConfirm('이 대화를 완전히 삭제하시겠습니까?')) return;
      try {
        const removingRoomId = currentRoomId;
        await deleteRoomEverywhere(removingRoomId);
        showToast('대화를 삭제했습니다.', 'success');
        currentRoomId = null;
        openedRoomId = null;
      } catch (error) {
        showToast(`삭제 실패: ${error.message || '알 수 없는 오류'}`, 'error');
      }
    });


    // ─── 대화 목록 우클릭 컨텍스트 메뉴 ──────────
    let _chatCtx = null;
    const removeChatCtx = () => { if (_chatCtx) { _chatCtx.remove(); _chatCtx = null; } };
    document.addEventListener('click', removeChatCtx);
    document.addEventListener('scroll', removeChatCtx, true);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') removeChatCtx(); });

    document.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('#room-list tr[data-key]');
      if (!row) return;
      e.preventDefault();
      removeChatCtx();
      const roomId = row.dataset.key;
      const room = visibleRoomsCache.find(r => r.room_id === roomId);
      if (!room) return;
      const isAdmin = currentProfile?.role === 'admin';

      const ctxMenu = document.createElement('div');
      ctxMenu.className = 'pm-ctx-menu';
      let html = `
        <button type="button" class="pm-ctx-item" data-action="detail">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          상세정보
        </button>
        <div class="pm-ctx-divider"></div>
        <button type="button" class="pm-ctx-item" data-action="hide">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          숨기기
        </button>`;
      if (isAdmin) {
        html += `
          <div class="pm-ctx-divider"></div>
          <button type="button" class="pm-ctx-item pm-ctx-item--danger" data-action="delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
            삭제
          </button>`;
      }
      ctxMenu.innerHTML = html;
      document.body.appendChild(ctxMenu);
      _chatCtx = ctxMenu;
      ctxMenu.style.cssText = `position:fixed;top:${e.clientY}px;left:${e.clientX}px;z-index:9999;`;
      requestAnimationFrame(() => {
        const rect = ctxMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) ctxMenu.style.left = `${window.innerWidth - rect.width - 8}px`;
        if (rect.bottom > window.innerHeight) ctxMenu.style.top = `${window.innerHeight - rect.height - 8}px`;
      });

      ctxMenu.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        if (action === 'detail') {
          removeChatCtx();
          openProductDetailSlide(room);
        }
        if (action === 'hide') {
          removeChatCtx();
          if (!await showConfirm('이 대화를 목록에서 숨기시겠습니까?')) return;
          try {
            localHiddenRoomIds.add(roomId);
            await hideRoomForUser(roomId, user.uid);
            if (currentRoomId === roomId) await roomSelectionController.moveToNextRoomAfterRemoval(visibleRoomsCache);
            showToast('대화를 숨겼습니다.', 'success');
          } catch (err) { showToast('숨김 실패: ' + (err.message || err), 'error'); }
        }
        if (action === 'delete') {
          removeChatCtx();
          if (!await showConfirm('이 대화를 완전히 삭제하시겠습니까?\n메시지도 모두 삭제됩니다.')) return;
          try {
            await deleteRoomEverywhere(roomId);
            if (currentRoomId === roomId) { currentRoomId = null; openedRoomId = null; }
            showToast('대화를 삭제했습니다.', 'success');
          } catch (err) { showToast('삭제 실패: ' + (err.message || err), 'error'); }
        }
      });
    });

    // 초기: 대화방 미선택 → 입력폼 비활성 (preferredRoomId 있으면 이미 선택된 상태)
    if (!currentRoomId) messageForm?.classList.add('is-disabled');

    messageForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!currentRoomId) {
        feedback.textContent = '먼저 대화방을 선택하세요.';
        return;
      }
      const text = messageInput.value.trim();
      if (!text) return;
      await sendMessage(currentRoomId, {
        sender_uid: user.uid,
        sender_code: profile.user_code || profile.company_code || '-',
        sender_role: profile.role,
        sender_partner_code: profile.company_code || '',
        text
      });
      messageInput.value = '';
      feedback.textContent = '';
    });
  } catch (error) {
    console.error('[chat] bootstrap error:', error);
    showToast(`대화 초기화 오류: ${error.message || '알 수 없는 오류'}`, 'error');
  }
}

function _registerMobileBack() {
  if (!window.setMobileBackHandler) return;
  window.setMobileBackHandler(async () => {
    if (document.body.classList.contains('chat-m-open')) {
      const messageInput = document.getElementById('message-input');
      if (messageInput && messageInput.value.trim()) {
        const ok = await showConfirm('작성 중인 메시지가 있습니다.\n대화목록으로 돌아가시겠습니까?');
        if (!ok) return true;
      }
      closeMobileChatView();
      return true;
    }
    return false;
  });
}

let _mounted = false;
export async function mount() {
  document.body.classList.add('page-chat');
  // 모바일 필터 설정
  window._mobileFilterConfig = { sidebar: 'chatMFilterSidebar', overlay: 'chatMFilterOverlay', close: 'chatMFilterClose' };
  _registerMobileBack();
  bindDOM();
  _mounted = false;
  await bootstrap();
  _mounted = true;
}
export function onHide() {
  document.body.classList.remove('page-chat');
  document.body.classList.remove('chat-m-open');
  window._mobileFilterConfig = null;
  if (window.clearMobileBackHandler) window.clearMobileBackHandler();
}
export function onShow() {
  document.body.classList.add('page-chat');
  if (window.hideMobileBackBtn) window.hideMobileBackBtn();
  _registerMobileBack();
}
export function unmount() {
  runPageCleanup();
  onHide();
  _mounted = false;
}
// Auto-mount on first script load (server-rendered page)
if (!import.meta.url.includes('?')) mount();
