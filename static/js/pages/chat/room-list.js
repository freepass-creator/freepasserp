import { renderTableGrid } from '../../core/management-list.js';
import { escapeHtml } from '../../core/management-format.js';
export { escapeHtml };
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

export function deriveStatusLabel(room, myUid) {
  if (!room) return '-';
  const hasMessage = Number(room.last_message_at || 0) > 0 || String(room.last_message || '').trim() !== '';
  if (!hasMessage) return '신규';
  if (myUid) {
    const lastRead = Number((room.read_by || {})[myUid] || 0);
    const lastMsg = Number(room.last_message_at || 0);
    if (lastMsg > lastRead) return '읽지않음';
  }
  return '대화중';
}

export function deriveReplyStatus(room) {
  if (!room) return '';
  const hasMessage = Number(room.last_message_at || 0) > 0 || String(room.last_message || '').trim() !== '';
  if (!hasMessage) return '';
  const eff = room.last_effective_sender_role || '';
  const last = room.last_sender_role || '';
  const sender = (eff === 'agent' || eff === 'provider') ? eff : ((last === 'agent' || last === 'provider') ? last : '');
  if (!sender) return '';
  // 영업자가 마지막 = 문의접수, 공급사/관리자가 마지막 = 회신완료
  return sender === 'agent' ? '문의접수' : '회신완료';
}

export function isReplyPending(room) {
  return deriveReplyStatus(room) === '문의접수';
}

const ROOM_COLS = [
  { key: 'carNo',    label: '차량번호',     align: 'c', searchable: true, w: 95, pinned: 'left' },
  { key: 'status',   label: '문의구분',     align: 'c', filterable: true, w: 80 },
  { key: 'reply',    label: '처리상태',     align: 'c', filterable: true, w: 80 },
  { key: 'partner',  label: '공급사코드',   align: 'c', filterable: true },
  { key: 'agent',    label: '영업자코드',   align: 'c', filterable: true },
  { key: 'model',    label: '세부모델',     searchable: true, w: 180 },
  { key: 'message',  label: '마지막메시지', searchable: true },
  { key: 'datetime', label: '일자 시간',    align: 'c' },
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
    getRowClass: (room) => isReplyPending(room) ? 'is-reply-pending' : '',
    getCellValue: (col, room) => {
      const product = getRoomProductLookupKeys(room).map((key) => productsMap.get(key)).find(Boolean) || null;
      const at = room.last_message_at || room.created_at;
      switch (col.key) {
        case 'status': return renderBadgeRow([{ field: 'chat_status', value: deriveStatusLabel(room, myUid) }]);
        case 'reply': {
          const reply = deriveReplyStatus(room);
          return reply ? renderBadgeRow([{ field: 'reply_status', value: reply }]) : '';
        }
        case 'carNo': return escapeHtml(product?.carNo || room.vehicle_number || room.car_number || '-');
        case 'model': {
          const sub = String(product?.subModel || '').trim();
          const pick = (sub && sub !== '-') ? sub
            : (String(room.sub_model || '').trim() || String(product?.model || '').trim() || '-');
          return escapeHtml(pick.replace(/20(\d{2})~/g, '$1~'));
        }
        case 'partner': return escapeHtml(product?.partnerCode || room.provider_company_code || room.partner_code || '');
        case 'agent': return escapeHtml(room.agent_code || room.agent_uid || '');
        case 'message': return escapeHtml(truncate(room.last_message || '대화 시작 전', 18));
        case 'datetime': return escapeHtml(`${formatDate(at)} ${formatTime(at)}`);
        default: return '';
      }
    },
    getCellText: (col, room) => {
      const product = getRoomProductLookupKeys(room).map((key) => productsMap.get(key)).find(Boolean) || null;
      const at = room.last_message_at || room.created_at;
      switch (col.key) {
        case 'status': return deriveStatusLabel(room, myUid);
        case 'reply': return deriveReplyStatus(room);
        case 'carNo': return product?.carNo || room.vehicle_number || room.car_number || '';
        case 'model': {
          const sub = String(product?.subModel || '').trim();
          const pick = (sub && sub !== '-') ? sub
            : (String(room.sub_model || '').trim() || String(product?.model || '').trim() || '');
          return pick.replace(/20(\d{2})~/g, '$1~');
        }
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
