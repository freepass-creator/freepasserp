export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeText(value) {
  return String(value ?? '').trim();
}

export function safeText(value, fallback = '-') {
  return normalizeText(value) || fallback;
}

function toValidDate(value) {
  const timestamp = Number(value);
  const date = Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function formatShortDate(value, fallback = '-') {
  const date = toValidDate(value);
  if (!date) return fallback;
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}.${mm}.${dd}`;
}

export function formatYearMonth(value, fallback = '') {
  const date = toValidDate(value);
  if (!date) return fallback;
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${yy}.${mm}`;
}

export function formatYmdDate(value, fallback = '-') {
  const date = toValidDate(value);
  if (!date) return fallback;
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatSequenceCodeDisplay(value, { prefix = '', minLength = 4, fallback = '-' } = {}) {
  const raw = normalizeText(value);
  if (!raw) return fallback;
  if (prefix && new RegExp(`^${prefix}\\d{${minLength},}$`, 'i').test(raw)) return raw.toUpperCase();
  if (/^\d+$/.test(raw)) return `${prefix}${raw.padStart(minLength, '0')}`;
  return raw;
}


export function formatMoney(value, { suffix = '', fallback = '-' } = {}) {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  if (!digits) return fallback;
  return `${Number(digits).toLocaleString('ko-KR')}${suffix}`;
}

export function formatMileageSummary(value, fallback = '-') {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  if (!digits) return fallback;
  return `${Number(digits).toLocaleString('ko-KR')}km`;
}
