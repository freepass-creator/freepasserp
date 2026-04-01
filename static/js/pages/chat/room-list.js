import { renderTableGrid } from '../../core/management-list.js';
import { renderBadgeRow } from '../../shared/badge.js';

export function normalizeLookupKey(value = '') {
  return String(value || '').trim().replace(/\s+/g, '').replace(/[.#$\[\]\/]/g, '').toUpperCase();
}

export function formatTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${String(date.getFullYear()).slice(-2)}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

export function truncate(text = '', max = 26) {
  const source = String(text || '').trim();
  if (!source) return '-';
  return source.length > max ? `${source.slice(0, max)}...` : source;
}

export function escapeHtml(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export function deriveStatusLabel(room, myUid) {
  if (!room) return '-';
  const hasMessage = Number(room.last_message_at || 0) > 0 || String(room.last_message || '').trim() !== '';
  if (!hasMessage) return '신규';
  if (myUid) {
    const readBy = room.read_by || {};
    const lastRead = Number(readBy[myUid] || 0);
    const lastMsg = Number(room.last_message_at || 0);
    if (lastMsg > lastRead) return '읽지않음';
  }
  return '대화중';
}

export function deriveReplyStatus(room, myRole) {
  if (!room || !myRole) return '';
  const hasMessage = Number(room.last_message_at || 0) > 0 || String(room.last_message || '').trim() !== '';
  if (!hasMessage) return '';
  // admin은 제외하고 마지막 agent/provider만 판단
  const eff = room.last_effective_sender_role || '';
  const last = room.last_sender_role || '';
  const sender = (eff === 'agent' || eff === 'provider') ? eff : ((last === 'agent' || last === 'provider') ? last : '');
  if (!sender) return '';
  // 관리자/공급사: 공급사가 마지막 = 회신완료, 영업자가 마지막 = 회신대기
  if (myRole === 'admin' || myRole === 'provider') return sender === 'provider' ? '회신완료' : '회신대기';
  // 영업자: 영업자가 마지막 = 회신완료, 공급사가 마지막 = 회신대기
  return sender === 'agent' ? '회신완료' : '회신대기';
}

export function isReplyPending(room, myRole) {
  return deriveReplyStatus(room, myRole) === '회신대기';
}

const ROOM_COLS = [
  { key: 'status',   label: '대화상태',     align: 'c', filterable: true, w: 64 },
  { key: 'reply',    label: '처리상태',     align: 'c', filterable: true, w: 72 },
  { key: 'carNo',    label: '차량번호',     align: 'c', searchable: true },
  { key: 'model',    label: '세부모델',     searchable: true },
  { key: 'partner',  label: '공급사코드',   align: 'c', filterable: true },
  { key: 'agent',    label: '영업자코드',   align: 'c', filterable: true },
  { key: 'message',  label: '마지막메시지', searchable: true },
  { key: 'datetime', label: '일자 및 시간', align: 'c' },
];

export function renderChatRoomList({ thead, container, rooms, selectedRoomId, productsMap, getRoomProductLookupKeys, onSelect, myRole, myUid }) {
  renderTableGrid({
    thead,
    tbody: container,
    columns: ROOM_COLS,
    items: rooms,
    emptyText: '등록된 대화가 없습니다.',
    selectedKey: selectedRoomId || '',
    getKey: (room) => room.room_id || '',
    onSelect,
    getRowClass: (room) => isReplyPending(room, myRole) ? 'is-reply-pending' : '',
    getCellValue: (col, room) => {
      const product = getRoomProductLookupKeys(room).map((key) => productsMap.get(key)).find(Boolean) || null;
      const at = room.last_message_at || room.created_at;
      switch (col.key) {
        case 'status': return renderBadgeRow([{ field: 'chat_status', value: deriveStatusLabel(room, myUid) }]);
        case 'reply': {
          const reply = deriveReplyStatus(room, myRole);
          return reply ? renderBadgeRow([{ field: 'reply_status', value: reply }]) : '';
        }
        case 'carNo': return escapeHtml(product?.carNo || room.car_number || '-');
        case 'model': return escapeHtml(String(product?.subModel || product?.model || room.model_name || '-').replace(/20(\d{2})~/g, '$1~'));
        case 'partner': return escapeHtml(product?.partnerCode || room.provider_company_code || room.partner_code || '');
        case 'agent': return escapeHtml(room.agent_code || room.agent_uid || '');
        case 'message': return escapeHtml(truncate(room.last_message || '대화 시작 전', 30));
        case 'datetime': return escapeHtml(`${formatDate(at)} ${formatTime(at)}`);
        default: return '';
      }
    },
    getCellText: (col, room) => {
      const product = getRoomProductLookupKeys(room).map((key) => productsMap.get(key)).find(Boolean) || null;
      const at = room.last_message_at || room.created_at;
      switch (col.key) {
        case 'status': return deriveStatusLabel(room, myUid);
        case 'reply': return deriveReplyStatus(room, myRole);
        case 'carNo': return product?.carNo || room.car_number || '';
        case 'model': return String(product?.subModel || product?.model || room.model_name || '').replace(/20(\d{2})~/g, '$1~');
        case 'partner': return product?.partnerCode || room.provider_company_code || room.partner_code || '';
        case 'agent': return room.agent_code || room.agent_uid || '';
        case 'message': return room.last_message || '';
        case 'datetime': return `${formatDate(at)} ${formatTime(at)}`;
        default: return '';
      }
    }
  });

}

export function syncSelectedRoomRow(container, currentRoomId) {
  container?.querySelectorAll('.pls-row').forEach((row) => {
    const isSelected = (row.dataset.key || '') === (currentRoomId || '');
    row.classList.toggle('is-active', isSelected);
  });
}
