/**
 * mobile/chat-room.js — 모바일 대화방
 */
import { requireAuth } from '../core/auth-guard.js';
import {
  watchMessages, watchRooms, watchProducts, sendMessage,
  markRoomRead, hideRoomForUser, deleteRoomEverywhere,
} from '../firebase/firebase-db.js';
import { escapeHtml } from '../core/management-format.js';
import { showToast, showConfirm } from '../core/toast.js';

// URL을 클릭 가능한 링크로 변환 (escape 후 적용 — XSS 안전)
function linkify(text) {
  const escaped = escapeHtml(text || '');
  // http(s)://... 또는 www.... 패턴 매칭
  return escaped.replace(
    /(\bhttps?:\/\/[^\s<]+|\bwww\.[^\s<]+)/g,
    (m) => {
      const href = m.startsWith('www.') ? 'https://' + m : m;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="m-cr__link">${m}</a>`;
    }
  );
}

const $messages = document.getElementById('m-cr-messages');
const $title    = document.getElementById('m-cr-title');
const $back     = document.getElementById('m-cr-back');
const $hide     = document.getElementById('m-cr-hide');
const $delete   = document.getElementById('m-cr-delete');
const $form     = document.getElementById('m-cr-form');
const $text     = document.getElementById('m-cr-text');

const pathParts = location.pathname.split('/').filter(Boolean);
const roomId = decodeURIComponent(pathParts[pathParts.length - 1] || '');

let currentUser = null;
let currentProfile = null;
let currentRoom = null;
let unsubscribeMessages = null;

function fmtTime(ts) {
  const d = new Date(Number(ts || 0));
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mi}`;
}
function fmtDay(ts) {
  const d = new Date(Number(ts || 0));
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${'일월화수목금토'[d.getDay()]})`;
}
function sameDay(a, b) {
  const da = new Date(Number(a)), db = new Date(Number(b));
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

// 렌더된 마지막 timestamp — 새 메시지만 append
let lastRenderedTs = 0;
let lastRenderedDay = 0;

function buildMessageHtml(m, prevDayTs) {
  const isMine = m.sender_uid === currentUser?.uid || (m.sender_role === currentProfile?.role && m.sender_code === currentProfile?.user_code);
  const isSystem = m.sender_role === 'system';
  let dayMark = '';
  if (!prevDayTs || !sameDay(prevDayTs, m.created_at)) {
    dayMark = `<div class="m-cr__day">${fmtDay(m.created_at)}</div>`;
  }
  if (isSystem) {
    return dayMark + `<div class="m-cr__msg m-cr__msg--system"><div class="m-cr__msg-bubble">${linkify(m.text || '')}</div></div>`;
  }
  return dayMark + `<div class="m-cr__msg m-cr__msg--${isMine ? 'mine' : 'other'}">
    ${!isMine ? `<div class="m-cr__msg-meta">${escapeHtml(m.sender_code || '')}</div>` : ''}
    <div class="m-cr__msg-bubble">${linkify(m.text || '')}</div>
    <div class="m-cr__msg-meta">${fmtTime(m.created_at)}</div>
  </div>`;
}

function renderMessages(messages) {
  if (!$messages) return;
  if (!messages || !messages.length) {
    $messages.innerHTML = '<div class="m-cr__empty">아직 대화가 없습니다</div>';
    lastRenderedTs = 0;
    lastRenderedDay = 0;
    return;
  }
  const sorted = [...messages].sort((a, b) => Number(a.created_at || 0) - Number(b.created_at || 0));
  const wasAtBottom = $messages.scrollTop + $messages.clientHeight >= $messages.scrollHeight - 30;

  // 첫 렌더 또는 데이터 리셋(마지막 ts가 더 작아진 경우)
  if (!lastRenderedTs || sorted[sorted.length - 1].created_at < lastRenderedTs) {
    let html = '';
    let prevDay = 0;
    for (const m of sorted) {
      html += buildMessageHtml(m, prevDay);
      prevDay = m.created_at;
    }
    $messages.innerHTML = html;
    lastRenderedTs = sorted[sorted.length - 1].created_at;
    lastRenderedDay = prevDay;
  } else {
    // 새 메시지만 append (scroll/focus 유지)
    const fresh = sorted.filter(m => m.created_at > lastRenderedTs);
    if (!fresh.length) return;
    let html = '';
    let prevDay = lastRenderedDay;
    for (const m of fresh) {
      html += buildMessageHtml(m, prevDay);
      prevDay = m.created_at;
    }
    $messages.insertAdjacentHTML('beforeend', html);
    lastRenderedTs = fresh[fresh.length - 1].created_at;
    lastRenderedDay = prevDay;
  }

  if (wasAtBottom) {
    requestAnimationFrame(() => { $messages.scrollTop = $messages.scrollHeight; });
  }
}

// 키보드 올라올 때 메시지 영역만 자동 스크롤 (CSS dvh가 레이아웃 담당)
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    if ($messages) $messages.scrollTop = $messages.scrollHeight;
  });
}

// 입력 중인 텍스트가 있으면 뒤로가기 시 확인
async function confirmLeaveIfDirty() {
  const dirty = $text && ($text.value || '').trim().length > 0;
  if (!dirty) return true;
  return await showConfirm('작성 중인 메시지가 있습니다. 나가시겠습니까?');
}
$back?.addEventListener('click', async () => {
  const ok = await confirmLeaveIfDirty();
  if (!ok) return;
  if (history.length > 1) history.back();
  else location.href = '/m/chat';
});
// 하드웨어 뒤로가기(popstate) 가드
history.pushState({ chatRoom: true }, '', location.href);
let _leaveConfirming = false;
window.addEventListener('popstate', async () => {
  if (_leaveConfirming) return;
  _leaveConfirming = true;
  history.pushState({ chatRoom: true }, '', location.href);
  const ok = await confirmLeaveIfDirty();
  _leaveConfirming = false;
  if (ok) history.go(-2);
});

// ⚡ 메모리 검증 패턴: value='' → focus() → sendMessage() (fire-and-forget, await 없음)
function doSend() {
  if (!$text) return;
  const text = ($text.value || '').trim();
  if (!text) return;
  $text.value = '';
  $text.style.height = 'auto';
  $text.focus();
  sendMessage(roomId, {
    text,
    sender_uid: currentUser?.uid || '',
    sender_role: currentProfile?.role || '',
    sender_code: currentProfile?.user_code || '',
    sender_name: currentProfile?.name || '',
  }).catch((err) => {
    console.error('[mobile/chat-room] send failed', err);
    showToast('전송 실패', 'error');
  });
}

// 전송 버튼 — touchstart preventDefault로 포커스 도둑질 차단
const $send = $form?.querySelector('.m-cr__send');
$send?.addEventListener('touchstart', (e) => {
  e.preventDefault();
  // touchstart에서 preventDefault하면 click이 안 가서 글로벌 햅틱이 안 울림 → 직접 호출
  if (navigator.vibrate) navigator.vibrate(8);
  doSend();
}, { passive: false });

// textarea 자동 높이
$text?.addEventListener('input', () => {
  $text.style.height = 'auto';
  $text.style.height = Math.min($text.scrollHeight, 128) + 'px';
});
// Enter = 줄바꿈 X, Shift+Enter = 줄바꿈 (모바일에서는 Enter는 줄바꿈)
// 모바일은 send 버튼으로 보내는 게 자연스러움 — Enter는 줄바꿈 유지

$hide?.addEventListener('click', async () => {
  const ok = await showConfirm('이 대화를 목록에서 숨기시겠습니까?');
  if (!ok) return;
  try {
    await hideRoomForUser(roomId, currentUser?.uid);
    location.href = '/m/chat';
  } catch (e) {
    console.error(e);
    showToast('숨김 실패', 'error');
  }
});

$delete?.addEventListener('click', async () => {
  const ok = await showConfirm('이 대화를 영구 삭제하시겠습니까?');
  if (!ok) return;
  try {
    await deleteRoomEverywhere(roomId);
    location.href = '/m/chat';
  } catch (e) {
    console.error(e);
    showToast('삭제 실패', 'error');
  }
});

// ⚡ 페이지 진입 즉시 textarea 포커스 (Android Chrome은 autofocus 속성 + 동기 focus()로 키보드 자동 오픈)
// iOS Safari는 정책상 페이지 이동 후 프로그램 focus가 키보드를 띄우지 못함 → 첫 사용자 탭에서 활성화
function autoFocusTextarea() {
  if (!$text) return;
  try { $text.focus({ preventScroll: true }); } catch { $text.focus(); }
}
// 1) 모듈 로드 직후 즉시 (await 전 — gesture 컨텍스트 잔존 시도)
autoFocusTextarea();
// 2) DOMContentLoaded 시점에 한 번 더
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoFocusTextarea, { once: true });
}
// 3) 첫 touch/click에서 한 번 더 (iOS Safari 대응 — 사용자가 화면 어디든 한 번 탭하면 키보드 오픈)
const _onFirstGesture = () => {
  autoFocusTextarea();
  document.removeEventListener('touchstart', _onFirstGesture);
  document.removeEventListener('click', _onFirstGesture);
};
document.addEventListener('touchstart', _onFirstGesture, { once: true, passive: true });
document.addEventListener('click', _onFirstGesture, { once: true });

(async () => {
  try {
    const auth = await requireAuth();
    currentUser = auth.user;
    currentProfile = auth.profile;

    // 역할별 버튼 노출: 공급사·관리자만 삭제 가능, 영업자는 숨김만
    const role = currentProfile?.role || '';
    const canDelete = role === 'provider' || role === 'admin';
    if ($delete && !canDelete) $delete.hidden = true;

    // 방 정보 + 상품 매칭 → 상단바 제목: "차량번호 세부모델명"
    const $titleEl = document.getElementById('m-cr-title');
    let _productMap = new Map();
    function updateTitle() {
      if (!currentRoom || !$titleEl) return;
      const carNo = currentRoom.vehicle_number || currentRoom.car_number || '';
      const p = _productMap.get(currentRoom.product_uid) || _productMap.get(currentRoom.product_code);
      const subModel = p?.sub_model || '';
      $titleEl.textContent = [carNo, subModel].filter(Boolean).join(' ') || '대화방';
    }
    watchRooms((rooms) => {
      const room = (rooms || []).find(r => r.room_id === roomId || r.chat_code === roomId);
      if (!room) return;
      currentRoom = room;
      updateTitle();
    });
    watchProducts((products) => {
      _productMap = new Map();
      (products || []).forEach(p => {
        if (p?.product_uid) _productMap.set(p.product_uid, p);
        if (p?.product_code) _productMap.set(p.product_code, p);
      });
      updateTitle();
    });

    // 메시지 구독
    unsubscribeMessages = watchMessages(roomId, (messages) => {
      renderMessages(messages || []);
      // 읽음 처리
      if (currentProfile?.role && currentUser?.uid) {
        markRoomRead(roomId, currentProfile.role, currentUser.uid).catch(() => {});
      }
    });
  } catch (e) {
    console.error('[mobile/chat-room] init failed', e);
    if ($messages) $messages.innerHTML = '<div class="m-cr__empty">대화방을 불러오지 못했습니다</div>';
  }
})();
