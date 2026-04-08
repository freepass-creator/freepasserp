/**
 * mobile/chat-room.js — 모바일 대화방
 */
import { requireAuth } from '../core/auth-guard.js';
import {
  watchMessages, watchRooms, sendMessage,
  markRoomRead, hideRoomForUser, deleteRoomEverywhere,
} from '../firebase/firebase-db.js';
import { escapeHtml } from '../core/management-format.js';
import { showToast, showConfirm } from '../core/toast.js';

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
    return dayMark + `<div class="m-cr__msg m-cr__msg--system"><div class="m-cr__msg-bubble">${escapeHtml(m.text || '')}</div></div>`;
  }
  return dayMark + `<div class="m-cr__msg m-cr__msg--${isMine ? 'mine' : 'other'}">
    ${!isMine ? `<div class="m-cr__msg-meta">${escapeHtml(m.sender_code || '')}</div>` : ''}
    <div class="m-cr__msg-bubble">${escapeHtml(m.text || '')}</div>
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

// 키보드 올라올 때 — 페이지 전체가 밀리지 않고 본문만 줄어들도록
function adjustForKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const $cr = document.querySelector('.m-cr');
  if (!$cr) return;
  // 상단바(.m-topbar) 높이 빼고 visualViewport 높이만큼만 차지
  const topbarH = document.querySelector('.m-topbar')?.offsetHeight || 0;
  const newH = vv.height - topbarH;
  $cr.style.height = newH + 'px';
  // 입력창이 보이도록 스크롤
  if ($messages) $messages.scrollTop = $messages.scrollHeight;
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', adjustForKeyboard);
  window.visualViewport.addEventListener('scroll', adjustForKeyboard);
}
window.addEventListener('load', adjustForKeyboard);
adjustForKeyboard();

$back?.addEventListener('click', () => {
  if (history.length > 1) history.back();
  else location.href = '/m/chat';
});

// ⚡ 핵심: 전송 버튼이 textarea 포커스를 뺏지 못하게
const $send = $form?.querySelector('button[type="submit"]');
if ($send) {
  // tabindex -1로 포커스 대상에서 제외
  $send.setAttribute('tabindex', '-1');
}

// ⚡ 메모리 검증 패턴: 단 한 줄 focus() — sync value='' → focus() → sendMessage() (fire-and-forget)
function doSend() {
  if (!$text) return;
  const text = ($text.value || '').trim();
  if (!text) return;
  $text.value = '';
  $text.style.height = 'auto';
  $text.focus(); // ← 이 한 줄이 핵심. await 전에 동기적으로.
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

// touchstart에서 preventDefault → 버튼이 포커스 가져가는 것 자체 차단
$send?.addEventListener('touchstart', (e) => {
  e.preventDefault();
  doSend();
}, { passive: false });

// 데스크탑/마우스: mousedown에서 preventDefault
$send?.addEventListener('mousedown', (e) => {
  e.preventDefault();
  doSend();
});

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

    // 방 정보 조회 (메타용)
    watchRooms((rooms) => {
      const room = (rooms || []).find(r => r.room_id === roomId || r.chat_code === roomId);
      if (room) currentRoom = room;
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
