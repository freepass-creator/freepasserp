/**
 * mobile/chat.js — 모바일 대화 목록
 */
import { requireAuth } from '../core/auth-guard.js';
import {
  watchRooms, watchProducts, watchMessages, sendMessage,
  markRoomRead, hideRoomForUser, deleteRoomEverywhere,
} from '../firebase/firebase-db.js';
import { escapeHtml } from '../core/management-format.js';
import { deriveReplyStatus } from '../pages/chat/room-list.js';
import { toggleFilter, applyFilter } from './filter-sheet.js';
import { showToast, showConfirm } from '../core/toast.js';

const $root = document.getElementById('m-chat-root');
const $list = document.getElementById('m-chat-list');
const $search = document.getElementById('m-chat-search');
const $filterBtn = document.getElementById('m-chat-filter-btn');

// 대화방 뷰 요소
const $room      = document.getElementById('m-chat-room');
const $messages  = document.getElementById('m-cr-messages');
const $form      = document.getElementById('m-cr-form');
const $text      = document.getElementById('m-cr-text');
const $back      = document.getElementById('m-cr-back');
const $hideBtn   = document.getElementById('m-cr-hide');
const $deleteBtn = document.getElementById('m-cr-delete');

const DATE_OPTIONS = [
  { value: '1w',   label: '최근 1주',  days: 7 },
  { value: '1m',   label: '최근 1개월', days: 30 },
  { value: '3m',   label: '최근 3개월', days: 90 },
  { value: '6m',   label: '최근 6개월', days: 180 },
  { value: 'year', label: '올해',      ytd: true },
];

const FILTER_GROUPS = [
  { key: 'chat_status',   title: '대화상태', icon: 'message',  type: 'check', field: 'chat_status' },
  { key: 'reply_status',  title: '처리상태', icon: 'reply',    type: 'check', field: '_reply_status' },
  { key: 'provider_company_code', title: '공급사', icon: 'building', type: 'check', field: 'provider_company_code' },
  { key: 'agent_code',    title: '영업자',   icon: 'user',     type: 'check', field: 'agent_code' },
  { key: 'date',          title: '기간',     icon: 'calendar', type: 'dateRange', field: 'last_message_at', options: DATE_OPTIONS },
  { key: 'maker',         title: '제조사',   icon: 'car',      type: 'check', field: '_maker' },
  { key: 'model',         title: '모델',     icon: 'layers',   type: 'check', field: '_model' },
  { key: 'sub_model',     title: '세부모델', icon: 'rows',     type: 'check', field: '_sub_model' },
];

let allRooms = [];
let productMap = new Map();
let searchQuery = '';
let activeFilters = { selected: {}, searchText: {} };
let currentRole = '';
let currentUser = null;
let currentProfile = null;

// 역할별 가시성 필터 — 자기 것만
function isVisibleForRole(room) {
  if (!currentRole || currentRole === 'admin') return true;
  if (currentRole === 'agent') {
    return room.agent_uid === currentUser?.uid || room.agent_code === currentProfile?.user_code;
  }
  if (currentRole === 'provider') {
    return (room.provider_company_code || '') === (currentProfile?.company_code || '');
  }
  return false;
}

function visibleGroupsForRole(role) {
  return FILTER_GROUPS.filter(g => {
    if (role === 'provider' && g.key === 'provider_company_code') return false;
    if (role === 'agent'    && g.key === 'agent_code')             return false;
    return true;
  });
}

function enrichRoom(r) {
  const p = productMap.get(r.product_uid) || productMap.get(r.product_code) || null;
  return {
    ...r,
    _reply_status: deriveReplyStatus(r) || '',
    _maker:    p?.maker || '',
    _model:    p?.model_name || '',
    _sub_model: p?.sub_model || '',
    _car_no:   p?.car_number || r.vehicle_number || '',
  };
}

function fmtDate(ts) {
  const n = Number(ts || 0);
  if (!n) return '';
  const d = new Date(n);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}
function fmtTime(ts) {
  const n = Number(ts || 0);
  if (!n) return '';
  const d = new Date(n);
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mi}`;
}

function statusTone(s) {
  const v = String(s || '').trim();
  if (/완료|종료/.test(v)) return 'success';
  if (/응대|진행/.test(v)) return 'info';
  if (/신규|대기/.test(v)) return 'warn';
  return 'neutral';
}
function replyTone(s) {
  const v = String(s || '').trim();
  if (/회신완료/.test(v)) return 'success';
  if (/문의접수/.test(v)) return 'warn';
  return 'neutral';
}

function render(rooms) {
  if (!$list) return;
  if (!rooms || !rooms.length) {
    $list.innerHTML = '<div class="m-list-empty">대화 내역이 없습니다</div>';
    return;
  }
  $list.innerHTML = rooms.map(r => {
    const status   = r.chat_status || '신규';
    const reply    = r._reply_status || deriveReplyStatus(r);
    const provider = r.provider_company_code || '';
    const agent    = r.agent_code || '';
    const carNo    = r._car_no || r.vehicle_number || '';
    const subModel = r._sub_model || '';
    const ts       = r.last_message_at || r.updated_at || r.created_at;
    const date     = fmtDate(ts);
    const time     = fmtTime(ts);
    const lastMsg  = r.last_message || '';
    const unread   = Number(r.unread_for_agent || r.unread_for_provider || 0);

    const idLine = [provider, agent, carNo, subModel].filter(Boolean).join(' · ');
    const subLine = [time, lastMsg].filter(Boolean).join(' · ');

    return `<div class="m-list-row" data-id="${escapeHtml(r.room_id || r.chat_code || '')}">
      <div class="m-list-row__top">
        <div class="m-list-row__badges">
          <span class="m-list-badge m-list-badge--${statusTone(status)}">${escapeHtml(status)}</span>
          ${reply ? `<span class="m-list-badge m-list-badge--${replyTone(reply)}">${escapeHtml(reply)}</span>` : ''}
        </div>
        ${date ? `<span class="m-list-row__date">${date}</span>` : ''}
      </div>
      <div class="m-list-row__title">${escapeHtml(idLine || '-')}</div>
      ${subLine || unread ? `<div class="m-list-row__sub">
        <span class="m-list-row__msg">${escapeHtml(subLine)}</span>
        ${unread > 0 ? `<span class="m-list-row__pending"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>미확인 ${unread > 99 ? '99+' : unread}</span>` : ''}
      </div>` : ''}
    </div>`;
  }).join('');
}

let _applyRaf = 0;
function applyAll() {
  if (_applyRaf) cancelAnimationFrame(_applyRaf);
  _applyRaf = requestAnimationFrame(() => {
    _applyRaf = 0;
    // 역할별 자기것만 필터
    const visible = allRooms.filter(isVisibleForRole);
    const enriched = visible.map(enrichRoom);
    let result = applyFilter(enriched, activeFilters, FILTER_GROUPS);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(r => {
        const fields = [r.vehicle_number, r.model_name, r.last_message, r.provider_company_code, r.agent_code, r.provider_name, r.agent_name];
        return fields.some(f => String(f || '').toLowerCase().includes(q));
      });
    }
    render(result);
  });
}

let _searchTimer;
$search?.addEventListener('input', () => {
  searchQuery = $search.value;
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(applyAll, 200);
});

$filterBtn?.addEventListener('click', () => {
  toggleFilter({
    groups: visibleGroupsForRole(currentRole),
    items: allRooms.map(enrichRoom),
    filterState: activeFilters,
    headerLabel: '대화건수',
    unit: '건',
    onApply: (fs) => { activeFilters = fs; applyAll(); }
  });
});

// ─── SPA: 목록 ↔ 대화방 전환 ───────────────────────────────────────────
let currentRoomId = null;
let unsubscribeMessages = null;
let lastRenderedTs = 0;
let lastRenderedDay = 0;

function setView(view) {
  if (!$root) return;
  $root.dataset.view = view;
  // ⚡ hidden 사용 금지: iOS는 직전까지 display:none이었던 요소에 focus() 시 키보드 안 띄움
  // 항상 렌더 트리에 두고 CSS(transform/opacity)로만 토글
  if ($list) $list.hidden = false;
  if ($room) $room.hidden = false;
  // 토스트바 토글: 클래스 셀렉터 기반
  document.querySelectorAll('.m-chat-list-only').forEach(el => { el.hidden = (view !== 'list'); });
  document.querySelectorAll('.m-chat-room-only').forEach(el => {
    if (el.dataset.roleHidden === '1') { el.hidden = true; return; }
    el.hidden = (view !== 'room');
  });
  // 하단 탭바도 대화방에서는 숨김
  const $tabbar = document.querySelector('.m-tabbar');
  if ($tabbar) $tabbar.style.display = (view === 'room') ? 'none' : '';
}

function fmtTime2(ts) {
  const d = new Date(Number(ts || 0));
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function fmtDay2(ts) {
  const d = new Date(Number(ts || 0));
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} (${'일월화수목금토'[d.getDay()]})`;
}
function sameDay2(a, b) {
  const da = new Date(Number(a)), db = new Date(Number(b));
  return da.getFullYear()===db.getFullYear() && da.getMonth()===db.getMonth() && da.getDate()===db.getDate();
}
function buildMsgHtml(m, prevDayTs) {
  const isMine = m.sender_uid === currentUser?.uid || (m.sender_role === currentProfile?.role && m.sender_code === currentProfile?.user_code);
  const isSystem = m.sender_role === 'system';
  let dayMark = '';
  if (!prevDayTs || !sameDay2(prevDayTs, m.created_at)) {
    dayMark = `<div class="m-cr__day">${fmtDay2(m.created_at)}</div>`;
  }
  if (isSystem) {
    return dayMark + `<div class="m-cr__msg m-cr__msg--system"><div class="m-cr__msg-bubble">${escapeHtml(m.text || '')}</div></div>`;
  }
  return dayMark + `<div class="m-cr__msg m-cr__msg--${isMine ? 'mine' : 'other'}">
    ${!isMine ? `<div class="m-cr__msg-meta">${escapeHtml(m.sender_code || '')}</div>` : ''}
    <div class="m-cr__msg-bubble">${escapeHtml(m.text || '')}</div>
    <div class="m-cr__msg-meta">${fmtTime2(m.created_at)}</div>
  </div>`;
}
function renderMessages(messages) {
  if (!$messages) return;
  if (!messages || !messages.length) {
    $messages.innerHTML = '<div class="m-cr__empty">아직 대화가 없습니다</div>';
    lastRenderedTs = 0; lastRenderedDay = 0;
    return;
  }
  const sorted = [...messages].sort((a,b) => Number(a.created_at||0) - Number(b.created_at||0));
  const wasAtBottom = $messages.scrollTop + $messages.clientHeight >= $messages.scrollHeight - 30;
  if (!lastRenderedTs || sorted[sorted.length-1].created_at < lastRenderedTs) {
    let html = ''; let prevDay = 0;
    for (const m of sorted) { html += buildMsgHtml(m, prevDay); prevDay = m.created_at; }
    $messages.innerHTML = html;
    lastRenderedTs = sorted[sorted.length-1].created_at;
    lastRenderedDay = prevDay;
  } else {
    const fresh = sorted.filter(m => m.created_at > lastRenderedTs);
    if (!fresh.length) return;
    let html = ''; let prevDay = lastRenderedDay;
    for (const m of fresh) { html += buildMsgHtml(m, prevDay); prevDay = m.created_at; }
    $messages.insertAdjacentHTML('beforeend', html);
    lastRenderedTs = fresh[fresh.length-1].created_at;
    lastRenderedDay = prevDay;
  }
  if (wasAtBottom) requestAnimationFrame(() => { $messages.scrollTop = $messages.scrollHeight; });
}

function openRoom(roomId, { push = true } = {}) {
  if (!roomId) return;
  currentRoomId = roomId;
  // 메시지 영역 초기화
  if ($messages) $messages.innerHTML = '<div class="m-cr__loading">대화를 불러오는 중…</div>';
  lastRenderedTs = 0; lastRenderedDay = 0;
  setView('room');
  // focus는 click 핸들러 첫 라인에서 이미 호출됨 (gesture 컨텍스트 보존)
  // URL 동기화
  if (push) {
    try { history.pushState({ roomId }, '', `/m/chat/${encodeURIComponent(roomId)}`); } catch {}
  }
  // 이전 구독 해제
  if (typeof unsubscribeMessages === 'function') { try { unsubscribeMessages(); } catch {} }
  unsubscribeMessages = watchMessages(roomId, (messages) => {
    renderMessages(messages || []);
    if (currentProfile?.role && currentUser?.uid) {
      markRoomRead(roomId, currentProfile.role, currentUser.uid).catch(() => {});
    }
  });
}

function closeRoom({ push = true } = {}) {
  if (typeof unsubscribeMessages === 'function') { try { unsubscribeMessages(); } catch {} }
  unsubscribeMessages = null;
  currentRoomId = null;
  setView('list');
  if (push) {
    try { history.pushState({}, '', '/m/chat'); } catch {}
  }
}

$list?.addEventListener('click', (e) => {
  const row = e.target.closest('.m-list-row[data-id]');
  if (!row) return;
  const id = row.dataset.id;
  if (!id) return;
  // ⚡ 순서가 중요: setView('room') 먼저 → textarea가 viewport 안으로 들어옴
  //                 → 같은 gesture tick에서 즉시 focus() → 키보드 오픈
  openRoom(id);
  try { $text?.focus({ preventScroll: true }); } catch { $text?.focus(); }
});

$back?.addEventListener('click', () => { closeRoom(); });

window.addEventListener('popstate', (e) => {
  // URL 패턴으로 판단
  const m = location.pathname.match(/^\/m\/chat\/(.+)$/);
  if (m) openRoom(decodeURIComponent(m[1]), { push: false });
  else closeRoom({ push: false });
});

// ⚡ 전송 버튼이 textarea 포커스를 빼앗지 못하게 — touchstart/mousedown 단계에서 차단
function doSendKeepFocus() {
  if (!$text || !currentRoomId) return;
  const text = ($text.value || '').trim();
  if (!text) return;
  $text.value = '';
  $text.style.height = 'auto';
  // textarea가 이미 포커스를 잃었을 수도 있으니 다시 박아넣기 (동기)
  if (document.activeElement !== $text) {
    try { $text.focus({ preventScroll: true }); } catch { $text.focus(); }
  }
  sendMessage(currentRoomId, {
    text,
    sender_uid: currentUser?.uid || '',
    sender_role: currentProfile?.role || '',
    sender_code: currentProfile?.user_code || '',
    sender_name: currentProfile?.name || '',
  }).catch((err) => {
    console.error('[mobile/chat] send failed', err);
    showToast('전송 실패', 'error');
  });
}

const $sendBtn = $form?.querySelector('button[type="submit"]');
let _sendTouchHandled = false;
// touchstart 단계에서 preventDefault → 버튼이 포커스 가져가는 것 자체를 막음
$sendBtn?.addEventListener('touchstart', (e) => {
  e.preventDefault();
  _sendTouchHandled = true;
  if (document.activeElement !== $text) {
    try { $text?.focus({ preventScroll: true }); } catch { $text?.focus(); }
  }
  doSendKeepFocus();
}, { passive: false });
// 데스크탑/마우스용
$sendBtn?.addEventListener('mousedown', (e) => {
  if (_sendTouchHandled) { _sendTouchHandled = false; return; }
  e.preventDefault();
  if (document.activeElement !== $text) {
    try { $text?.focus({ preventScroll: true }); } catch { $text?.focus(); }
  }
  doSendKeepFocus();
});
// form submit (Enter키 / iOS Send 키)
$form?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (_sendTouchHandled) { _sendTouchHandled = false; return; }
  doSendKeepFocus();
});

// textarea 자동 높이
$text?.addEventListener('input', () => {
  $text.style.height = 'auto';
  $text.style.height = Math.min($text.scrollHeight, 128) + 'px';
});

$hideBtn?.addEventListener('click', async () => {
  if (!currentRoomId) return;
  const ok = await showConfirm('이 대화를 목록에서 숨기시겠습니까?');
  if (!ok) return;
  try {
    await hideRoomForUser(currentRoomId, currentUser?.uid);
    closeRoom();
  } catch (e) { console.error(e); showToast('숨김 실패', 'error'); }
});
$deleteBtn?.addEventListener('click', async () => {
  if (!currentRoomId) return;
  const ok = await showConfirm('이 대화를 영구 삭제하시겠습니까?');
  if (!ok) return;
  try {
    await deleteRoomEverywhere(currentRoomId);
    closeRoom();
  } catch (e) { console.error(e); showToast('삭제 실패', 'error'); }
});

// 키보드 올라올 때 본문만 줄어들도록
function adjustForKeyboard() {
  if ($root?.dataset.view !== 'room') return;
  const vv = window.visualViewport; if (!vv) return;
  const topbarH = document.querySelector('.m-topbar')?.offsetHeight || 0;
  $room.style.height = (vv.height - topbarH) + 'px';
  if ($messages) $messages.scrollTop = $messages.scrollHeight;
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', adjustForKeyboard);
  window.visualViewport.addEventListener('scroll', adjustForKeyboard);
}

function _hydrateProductMap(products) {
  const map = new Map();
  (products || []).forEach(p => {
    if (p?.product_uid) map.set(p.product_uid, p);
    if (p?.product_code) map.set(p.product_code, p);
  });
  return map;
}

(async () => {
  try {
    // ⚡ 메모리 캐시 즉시 사용
    const cached = window.__appData || {};
    if (Array.isArray(cached.rooms) && cached.rooms.length) {
      allRooms = cached.rooms.filter(r => r && !(r.hidden_by && Object.keys(r.hidden_by).length));
    }
    if (Array.isArray(cached.products) && cached.products.length) {
      productMap = _hydrateProductMap(cached.products);
    }

    const { user, profile } = await requireAuth();
    currentUser = user;
    currentProfile = profile;
    currentRole = profile?.role || '';
    if (allRooms.length) applyAll();

    // 역할별 삭제 버튼 노출 (provider/admin만)
    const canDelete = currentRole === 'provider' || currentRole === 'admin';
    if ($deleteBtn && !canDelete) $deleteBtn.dataset.roleHidden = '1';

    // 초기 진입 시 URL이 /m/chat/<id>면 바로 방 열기
    const initialRoom = $root?.dataset.initialRoom || '';
    if (initialRoom) openRoom(initialRoom, { push: false });

    watchRooms((rooms) => {
      allRooms = (rooms || []).filter(r => r && !(r.hidden_by && Object.keys(r.hidden_by).length));
      applyAll();
    });
    watchProducts((products) => {
      productMap = _hydrateProductMap(products);
      applyAll();
    });

    // 글로벌 prefetcher 이벤트
    window.addEventListener('fp:data', (e) => {
      const t = e.detail?.type;
      if (t === 'rooms' && window.__appData.rooms) {
        allRooms = window.__appData.rooms.filter(r => r && !(r.hidden_by && Object.keys(r.hidden_by).length));
        applyAll();
      } else if (t === 'products' && window.__appData.products) {
        productMap = _hydrateProductMap(window.__appData.products);
        applyAll();
      }
    });
  } catch (e) {
    console.error('[mobile/chat] init failed', e);
    if ($list) $list.innerHTML = '<div class="m-list-empty">대화 목록을 불러오지 못했습니다</div>';
  }
})();
