import { renderMobileProductDetail } from '../../shared/mobile-product-detail-markup.js';
import { open as openFullscreenViewer } from '../../shared/fullscreen-photo-viewer.js';
import { escapeHtml } from './room-list.js';

function bindChatDetailGallery(container) {
  const wrap = container.querySelector('#plsMGallery') || container.querySelector('.pls-mobile-detail-gallery');
  if (!wrap) return;
  let photos;
  try { photos = JSON.parse(wrap.dataset.photos || '[]'); } catch { return; }
  if (!photos.length) return;
  let idx = 0;
  const img = container.querySelector('#plsMGalleryImg');
  const ctr = container.querySelector('#plsMGalleryCtr');
  const update = () => {
    if (img) img.src = photos[idx];
    if (ctr) ctr.textContent = `${idx + 1} / ${photos.length}`;
  };
  if (photos.length > 1) {
    container.querySelector('#plsMGalleryPrev')?.addEventListener('click', (e) => { e.stopPropagation(); idx = (idx - 1 + photos.length) % photos.length; update(); });
    container.querySelector('#plsMGalleryNext')?.addEventListener('click', (e) => { e.stopPropagation(); idx = (idx + 1) % photos.length; update(); });
  }
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('.pls-mobile-detail-gallery__nav')) return;
    openFullscreenViewer(photos, idx);
  });
}

export function createChatRoomSelectionController({
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
  getCurrentRoomId,
  setCurrentRoomId,
  getCurrentProfile,
  getCurrentUser,
  getActivePhotoIndex,
  setActivePhotoIndex,
  getOpenedRoomId,
  setOpenedRoomId
}) {
  let unsubscribeMessages = null;

  function renderCurrentDetail() {
    const product = getCurrentProduct();
    if (!product) {
      if (detailTitle) detailTitle.textContent = '상세정보';
      detailCard.innerHTML = '<div class="detail-empty">선택된 대화의 상품정보가 없습니다.</div>';
      return;
    }
    const carNo = String(product.carNo || '').trim();
    if (detailTitle) detailTitle.textContent = carNo && carNo !== '-' ? `상세정보(${carNo})` : '상세정보';
    const rawProduct = product._raw || product;
    const termFields = getTermFields(product);
    detailCard.innerHTML = `<div class="m-pd m-pd--desktop">${renderMobileProductDetail(rawProduct, {
      activePhotoIndex: getActivePhotoIndex(),
      policy: termFields,
      showFee: false,
    })}</div>`;
    // 갤러리 이벤트
    bindChatDetailGallery(detailCard);
    ensureChatTermLoaded(product);
  }

  function clearRoomSelection(messageText = '좌측 목록에서 대화를 선택하세요.', detailText = '좌측 목록에서 대화를 선택하세요.') {
    setCurrentRoomId(null);
    setOpenedRoomId(null);
    setActivePhotoIndex(0);
    unsubscribeMessages?.();
    unsubscribeMessages = null;
    if (chatCode) chatCode.textContent = '대화코드 없음';
    if (detailTitle) detailTitle.textContent = '상세정보';
    roomList?.querySelectorAll('[data-management-key]').forEach((element) => {
      element.classList.remove('is-selected');
      element.classList.remove('active');
    });
    if (messageList) messageList.innerHTML = `<div class="empty-block">${escapeHtml(messageText)}</div>`;
    if (detailCard) detailCard.innerHTML = `<div class="detail-empty">${escapeHtml(detailText)}</div>`;
  }

  async function openRoom(room) {
    if (!room) return;
    setCurrentRoomId(room.room_id);
    setOpenedRoomId(room.room_id);
    setActivePhotoIndex(0);
    if (chatCode) chatCode.textContent = room.chat_code || room.room_id;
    renderCurrentDetail();
    roomList?.querySelectorAll('[data-management-key]').forEach((element) => {
      const isSelected = (element.dataset.managementKey || '') === room.room_id;
      element.classList.toggle('is-selected', isSelected);
      element.classList.toggle('active', isSelected);
    });

    // 입력칸 포커스 — await 전에 호출해야 모바일 gesture context 유지
    const input = document.getElementById('message-input');
    if (input) input.focus();

    const _profile = getCurrentProfile();
    const _user = getCurrentUser();
    await markRoomRead(room.room_id, _profile?.role, _user?.uid);

    unsubscribeMessages?.();
    unsubscribeMessages = watchMessages(room.room_id, (messages) => {
      renderMessages(messages);
    });

    // 상단바 업데이트
    const sep = document.getElementById('topBarStateSep');
    const identEl = document.getElementById('topBarIdentity');
    const badge = document.getElementById('topBarWorkBadge');
    if (sep && identEl) {
      const roomLabel = room.vehicle_number || room.chat_code || room.room_id;
      identEl.textContent = roomLabel;
      identEl.hidden = false;
      sep.hidden = false;
      if (badge) badge.textContent = '채팅';
    }
  }

  async function moveToNextRoomAfterRemoval(visibleRoomsCache = []) {
    const nextRoom = visibleRoomsCache.find((room) => room.room_id !== getCurrentRoomId()) || null;
    if (nextRoom) {
      await openRoom(nextRoom);
    } else {
      clearRoomSelection('등록된 대화가 없습니다.', '상품을 선택하세요.');
    }
  }

  function applyChatHeadActions({ deleteRoomBtn, hideRoomBtn, chatInquiryBtn, chatShareBtn, chatContractBtn }) {
    const currentProfile = getCurrentProfile();
    if (!currentProfile) return;
    // 대화 패널 헤드 버튼: 숨김/삭제는 역할별, 상세 버튼은 상품 연결 시 표시
    if (currentProfile.role === 'agent') {
      if (deleteRoomBtn) deleteRoomBtn.style.display = 'none';
      if (hideRoomBtn) hideRoomBtn.style.display = '';
    } else if (currentProfile.role === 'provider' || currentProfile.role === 'admin') {
      if (deleteRoomBtn) deleteRoomBtn.style.display = '';
      if (hideRoomBtn) hideRoomBtn.style.display = '';
    } else {
      if (deleteRoomBtn) deleteRoomBtn.style.display = 'none';
      if (hideRoomBtn) hideRoomBtn.style.display = 'none';
    }
    // 상세 패널 버튼: 모든 역할 동일 (상품 연결 시 표시)
    [chatInquiryBtn, chatShareBtn, chatContractBtn].forEach((btn) => {
      if (btn) btn.classList.remove('detail-actions-hidden');
    });
  }

  function cleanup() {
    unsubscribeMessages?.();
    unsubscribeMessages = null;
  }

  return {
    renderCurrentDetail,
    clearRoomSelection,
    openRoom,
    moveToNextRoomAfterRemoval,
    applyChatHeadActions,
    cleanup,
    getOpenedRoomId,
    getCurrentRoom,
    getCurrentUser
  };
}
