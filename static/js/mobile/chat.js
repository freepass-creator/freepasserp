/**
 * mobile/chat.js — 모바일 대화 목록
 */
import { requireAuth } from '../core/auth-guard.js';
import { watchRooms, watchProducts } from '../firebase/firebase-db.js';
import { escapeHtml } from '../core/management-format.js';
import { deriveReplyStatus } from '../pages/chat/room-list.js';
import { toggleFilter, applyFilter } from './filter-sheet.js';

const $list = document.getElementById('m-chat-list');
const $search = document.getElementById('m-chat-search');
const $filterBtn = document.getElementById('m-chat-filter-btn');

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

$list?.addEventListener('click', (e) => {
  const row = e.target.closest('.m-list-row[data-id]');
  if (!row) return;
  const id = row.dataset.id;
  if (id) location.href = `/m/chat/${encodeURIComponent(id)}`;
});

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
