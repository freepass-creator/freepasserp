function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeLabel(value) {
  return String(value ?? '').trim() || '-';
}

function normalizeToken(value) {
  return normalizeLabel(value)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/_/g, '');
}

function includesAny(label, targets = []) {
  return targets.some((target) => label.includes(target));
}

function getBadgeTone(field, value) {
  const label = normalizeLabel(value).toLowerCase();
  const normalizedField = String(field || '').trim();

  if (['product_type', 'member_role', 'partner_type', 'contract_type', 'settlement_type', 'request_type'].includes(normalizedField)) {
    return 'outline';
  }

  if (label === '-' || includesAny(label, ['삭제'])) {
    return 'muted';
  }

  if (includesAny(label, ['비활성', '반려', '취소', '종료', '중지', '불가'])) {
    return 'muted';
  }

  if (includesAny(label, ['승인', '활성', '완료', '판매중', '가능', '정상'])) {
    return 'solid';
  }

  if (includesAny(label, ['대기', '신규', '검토', '진행', '계약중', '보류', '대화중', '회신'])) {
    return 'soft';
  }

  if (['vehicle_status', 'member_status', 'partner_status', 'contract_status', 'review_status', 'settlement_status', 'request_status', 'chat_status', 'reply_status'].includes(normalizedField)) {
    return 'soft';
  }

  return 'outline';
}

const BADGE_KIND_BY_LABEL = {
  '출고가능': 'status-info',
  '판매중': 'status-info',
  '가능': 'status-info',
  '출고대기': 'status-warning',
  '대기': 'status-warning',
  '검토중': 'status-warning',
  '보류': 'status-warning',
  '출고완료': 'status-success',
  '승인': 'status-success',
  '승인완료': 'status-success',
  '완료': 'status-success',
  '계약완료': 'status-success',
  '정산완료': 'status-success',
  '활성': 'status-success',
  '정상': 'status-success',
  '반려': 'status-danger',
  '불가': 'status-danger',
  '출고불가': 'status-danger',
  '거절': 'status-danger',
  '중지': 'status-danger',
  '취소': 'status-danger',
  '종료': 'status-danger',
  '비활성': 'status-neutral',
  '삭제': 'status-neutral',
  '대화중': 'status-info',
  '읽지않음': 'status-danger',
  '회신대기': 'status-danger',
  '회신완료': 'status-success',
  '신규': 'status-info',

  '신차렌트': 'category-product-rent-new',
  '리스': 'category-product-lease',
  '중고렌트': 'category-product-rent-used',
  
  '중고구독': 'category-product-subscription-used',
  '신차구독': 'category-product-subscription-new',

  '공급사': 'category-supply',
  '공급': 'category-supply',
  '영업채널': 'category-sales',
  '영업': 'category-sales',
  '관리자': 'category-member',
  '영업자': 'category-sales'
};

function getBadgeKind(field, value) {
  const label = normalizeLabel(value);
  const token = normalizeToken(label);
  const normalizedField = String(field || '').trim();

  if (BADGE_KIND_BY_LABEL[label]) return BADGE_KIND_BY_LABEL[label];

  if (normalizedField === 'partner_status') {
    if (token === 'active') return 'status-success';
    if (token === 'inactive') return 'status-neutral';
  }

  if (normalizedField === 'member_status') {
    if (token === 'active') return 'status-success';
    if (token === 'pending') return 'status-warning';
    if (token === 'rejected') return 'status-danger';
  }

  if (normalizedField === 'member_role' || normalizedField === 'partner_type') {
    if (includesAny(label, ['공급'])) return 'category-supply';
    if (includesAny(label, ['영업'])) return 'category-sales';
    if (token === 'provider') return 'category-supply';
    if (token === 'saleschannel') return 'category-sales';
    if (token === 'admin') return 'category-member';
    if (token === 'agent') return 'category-sales';
  }

  if (normalizedField === 'review_status') {
    if (includesAny(label, ['완료', '승인'])) return 'status-success';
    if (includesAny(label, ['대기', '검토', '심사'])) return 'status-warning';
    if (includesAny(label, ['반려', '불가'])) return 'status-danger';
  }

  if (normalizedField === 'vehicle_status') {
    if (includesAny(label, ['가능', '판매중'])) return 'status-info';
    if (includesAny(label, ['대기'])) return 'status-warning';
    if (includesAny(label, ['계약중'])) return 'status-info';
    if (includesAny(label, ['출고완료', '완료'])) return 'status-success';
    if (includesAny(label, ['보류'])) return 'status-warning';
    if (includesAny(label, ['불가'])) return 'status-danger';
  }

  if (normalizedField === 'product_type') {
    if (includesAny(label, ['신차렌트'])) return 'category-product-rent-new';
    if (includesAny(label, ['리스'])) return 'category-product-lease';
    if (includesAny(label, ['중고렌트', '재렌트', '재렌탈'])) return 'category-product-rent-used';
    if (includesAny(label, ['신차구독'])) return 'category-product-subscription-new';
    if (includesAny(label, ['중고구독', '재구독'])) return 'category-product-subscription-used';
  }

  if (normalizedField === 'settlement_status') {
    if (includesAny(label, ['정산대기'])) return 'status-warning';
    if (includesAny(label, ['정산완료'])) return 'status-success';
    if (includesAny(label, ['정산보류'])) return 'status-warning';
    if (includesAny(label, ['환수대기'])) return 'status-danger';
    if (includesAny(label, ['환수결정'])) return 'status-danger';
  }

  if (normalizedField === 'process_status') {
    if (includesAny(label, ['처리완료'])) return 'status-success';
    if (includesAny(label, ['미완료'])) return 'status-danger';
  }

  if (normalizedField === 'contract_status') {
    if (includesAny(label, ['대기'])) return 'status-warning';
    if (includesAny(label, ['계약요청'])) return 'status-info';
    if (includesAny(label, ['계약발송'])) return 'status-info';
    if (includesAny(label, ['계약완료'])) return 'status-success';
    if (includesAny(label, ['취소', '철회'])) return 'status-danger';
  }

  return '';
}

export function renderBadge(field, value, options = {}) {
  const rawLabel = normalizeLabel(value);
  const labelMap = {
    '재렌트': '중고렌트',
    '재렌탈': '중고렌트',
    '재구독': '중고구독'
  };
  const label = labelMap[rawLabel] || rawLabel;
  const tone = options.tone || getBadgeTone(field, label);
  const kind = options.kind || getBadgeKind(field, label);
  const extraClass = options.className ? ` ${options.className}` : '';
  const kindClass = kind ? ` fp-badge--kind-${kind}` : '';
  const kindAttr = kind ? ` data-badge-kind="${escapeHtml(kind)}"` : '';
  return `<span class="fp-badge fp-badge--${tone}${kindClass}${extraClass}" data-badge-field="${escapeHtml(field)}"${kindAttr}>${escapeHtml(label)}</span>`;
}

export function renderBadgeRow(items = [], options = {}) {
  const html = items
    .map((item) => {
      if (!item) return '';
      return renderBadge(item.field, item.value, { tone: item.tone, kind: item.kind, className: item.className });
    })
    .filter(Boolean)
    .join('');

  if (!html) return '';
  const extraClass = options.className ? ` ${options.className}` : '';
  return `<span class="fp-badge-row${extraClass}">${html}</span>`;
}
