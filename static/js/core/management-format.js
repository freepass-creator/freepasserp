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

/** 전화번호 포맷: 01012345678 → 010-1234-5678 */
export function formatPhone(value) {
  const d = String(value ?? '').replace(/[^0-9]/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  return d;
}

/** 사업자등록번호 포맷: 1234567890 → 123-45-67890 */
export function formatBizNumber(value) {
  const d = String(value ?? '').replace(/[^0-9]/g, '');
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  return d;
}

/** 입력 중 자동 포맷 바인딩 */
export function bindAutoFormat(input, formatter) {
  if (!input) return;
  input.addEventListener('input', () => {
    const pos = input.selectionStart;
    const before = input.value;
    const digits = before.replace(/[^0-9]/g, '');
    const formatted = formatter(digits);
    if (formatted !== before) {
      input.value = formatted;
      // 커서 위치 보정
      const diff = formatted.length - before.length;
      input.setSelectionRange(pos + diff, pos + diff);
    }
  });
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
