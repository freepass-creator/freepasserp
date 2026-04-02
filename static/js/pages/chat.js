import { requireAuth } from '../core/auth-guard.js';
import { qs, registerPageCleanup, runPageCleanup } from '../core/utils.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { deleteRoomEverywhere, ensureRoom, hideRoomForUser, markRoomRead, resolveTermForProduct, sendMessage, watchMessages, watchProducts, watchRooms } from '../firebase/firebase-db.js';
import { extractTermFields, normalizeProduct } from '../shared/product-list-detail-view.js';
import { createChatRoomSelectionController } from './chat/room-selection.js';
import { escapeHtml, normalizeLookupKey, renderChatRoomList, syncSelectedRoomRow } from './chat/room-list.js';
import { renderSkeletonRows } from '../core/management-list.js';
import { showToast, showConfirm } from '../core/toast.js';

let menu = qs('#sidebar-menu');
let roomList = qs('#room-list');
let messageList = qs('#message-list');
let messageForm = qs('#message-form');
let messageInput = qs('#message-input');
let chatCode = qs('#chat-code');
let feedback = qs('#chat-message');
let detailCard = qs('#chat-product-detail-card');
let detailTitle = qs('#chatDetailPanelTitle');
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
  detailCard = qs('#chat-product-detail-card');
  detailTitle = qs('#chatDetailPanelTitle');
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

const termCache = {};
const termLoading = {};

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

function getCurrentProduct() {
  const room = getCurrentRoom();
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

function roleName(role) {
  if (role === 'admin') return '관리자';
  if (role === 'provider') return '공급사';
  if (role === 'agent') return '영업자';
  return '';
}

function formatTime(ts) {
  try { return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }); } catch (_) { return ''; }
}

function formatRoleBadge() { return ''; }

function renderMessages(messages) {
  if (!messages.length) {
    messageList.innerHTML = '<div class="empty-block">아직 메시지가 없습니다.</div>';
    return;
  }
  const sorted = messages.sort((a, b) => a.created_at - b.created_at);
  let lastDate = '';
  const html = sorted.map((message) => {
    const own = message.sender_uid === currentUser.uid ? 'out' : 'in';
    const roleClass = `role-${message.sender_role || 'etc'}`;
    const senderLabel = `${escapeHtml(message.sender_code || roleName(message.sender_role))} ${formatRoleBadge(message.sender_role)}`;
    const time = formatTime(message.created_at);

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
        <div class="message-time">${time}</div>
      </div>
    `;
  }).join('');
  messageList.innerHTML = html;
  messageList.scrollTop = messageList.scrollHeight;
}

const roomSelectionController = createChatRoomSelectionController({
  roomList,
  messageList,
  detailCard,
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
  setOpenedRoomId: (value) => { openedRoomId = value; }
});

async function bootstrap() {
  try {
    const { user, profile } = await requireAuth({ roles: ['provider', 'agent', 'admin'] });
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
      const normalizedProducts = products.map(normalizeProduct).filter((item) => item.id);
      productsMap = new Map();
      normalizedProducts.forEach((item) => {
        getProductLookupKeys(item).forEach((key) => {
          productsMap.set(key, item);
        });
      });

      if (profile.role === 'agent' && preferredProductCode && !currentRoomId && !_ensureRoomPending) {
        const product = productsMap.get(preferredProductCode);
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
            vehicleNumber: product.carNo,
            modelName: [product.maker, product.model, product.subModel, product.trim].filter(Boolean).join(' ')
          }).then((roomId) => {
            currentRoomId = roomId;
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
        if (profile.role === 'agent') return room.agent_uid === user.uid || room.agent_code === profile.user_code;
        if (profile.role === 'provider') return room.provider_company_code === profile.company_code;
        return true;
      });

      visibleRoomsCache = visibleRooms;
      roomMap = new Map(visibleRooms.map((room) => [room.room_id, room]));
      roomList.innerHTML = '';

      if (!visibleRooms.length) {
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

      if (currentRoomId && roomMap.has(currentRoomId)) {
        const currentRoom = roomMap.get(currentRoomId);
        chatCode.textContent = currentRoom.chat_code || currentRoom.room_id;
        roomSelectionController.renderCurrentDetail();
        syncSelectedRoomRow(roomList, currentRoomId);
        if (openedRoomId !== currentRoomId) {
          roomSelectionController.openRoom(currentRoom);
        }
        return;
      }

      if (currentRoomId && !roomMap.has(currentRoomId)) {
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
        showToast(`숨김 실패: ${error.message}`, 'error');
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
        showToast(`삭제 실패: ${error.message}`, 'error');
      }
    });


    // 초기: 대화방 미선택 → 입력폼 비활성
    messageForm?.classList.add('is-disabled');

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
    showToast(`대화 초기화 오류: ${error.message}`, 'error');
  }
}

let _mounted = false;
export async function mount() {
  bindDOM();
  _mounted = false;
  await bootstrap();
  _mounted = true;
}
export function unmount() {
  runPageCleanup();
  _mounted = false;
}
// Auto-mount on first script load (server-rendered page)
if (!import.meta.url.includes('?')) mount();
