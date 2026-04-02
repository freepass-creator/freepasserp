/**
 * core/validators.js
 *
 * 클라이언트 사이드 데이터 검증(Schema Validation) 레이어.
 * firebase-db.js 쓰기 작업 전에 호출하여 데이터 무결성을 보장한다.
 *
 * 사용법:
 *   import { validateProduct, validateContract, validatePartner } from '../core/validators.js';
 *   const errors = validateProduct(payload);
 *   if (errors.length) throw new Error(errors[0]);
 */

// ─── 유틸 ────────────────────────────────────────────────────────────────────

function isBlank(value) {
  return !String(value ?? '').trim();
}

function isNonNegativeNumber(value) {
  const num = Number(value);
  return !isNaN(num) && num >= 0;
}

/**
 * 차량번호 형식 검증.
 * 한국 차량번호: 숫자2~3 + 한글1~2 + 숫자4 (예: 12가3456, 서울12가3456)
 * 또는 임시/영업용 등 예외 허용 — 최소 4자 이상이면 통과.
 */
function isValidCarNumber(value) {
  const text = String(value || '').replace(/\s/g, '');
  if (text.length < 2) return false;
  // 기본 패턴: 지역명(0~2자) + 숫자(2~3자) + 한글(1~2자) + 숫자(4자)
  if (/^[가-힣]{0,2}\d{2,3}[가-힣]{1,2}\d{4}$/.test(text)) return true;
  // 느슨한 허용: 최소 4자 이상 + 숫자 포함
  return text.length >= 4 && /\d/.test(text);
}

/**
 * 날짜 텍스트 검증 (YYYYMMDD 또는 YYMMDD 형식).
 */
function isValidDateText(value) {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  if (digits.length === 6) {
    const month = Number(digits.slice(2, 4));
    const day = Number(digits.slice(4, 6));
    return month >= 1 && month <= 12 && day >= 1 && day <= 31;
  }
  if (digits.length === 8) {
    const year = Number(digits.slice(0, 4));
    const month = Number(digits.slice(4, 6));
    const day = Number(digits.slice(6, 8));
    return year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
  }
  return false;
}

/**
 * 전화번호 형식 검증 (한국 휴대폰/일반).
 */
function isValidPhone(value) {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  return digits.length >= 9 && digits.length <= 12;
}

/**
 * 사업자등록번호 형식 검증 (10자리 숫자).
 */
function isValidBusinessNumber(value) {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  return digits.length === 10;
}

// ─── 엔터티별 검증기 ─────────────────────────────────────────────────────────

/**
 * 상품(Product) 데이터 검증.
 * @param {object} payload  buildProductPayload() 결과
 * @returns {string[]}      오류 메시지 배열 (비어있으면 유효)
 */
export function validateProduct(payload = {}) {
  const errors = [];

  if (isBlank(payload.car_number)) {
    errors.push('차량번호는 필수입니다.');
  } else if (!isValidCarNumber(payload.car_number)) {
    errors.push('차량번호 형식이 올바르지 않습니다.');
  }

  if (isBlank(payload.partner_code) && isBlank(payload.provider_company_code)) {
    errors.push('공급사(파트너) 코드는 필수입니다.');
  }

  if (isBlank(payload.policy_code) && isBlank(payload.term_code)) errors.push('정책코드는 필수입니다.');
  if (isBlank(payload.maker)) errors.push('제조사는 필수입니다.');
  if (isBlank(payload.model_name)) errors.push('모델명은 필수입니다.');

  if (payload.first_registration_date && !isValidDateText(payload.first_registration_date)) {
    errors.push('최초등록일 형식이 올바르지 않습니다. (YYMMDD 또는 YYYYMMDD)');
  }

  if (payload.vehicle_age_expiry_date && !isValidDateText(payload.vehicle_age_expiry_date)) {
    errors.push('차령만료일 형식이 올바르지 않습니다. (YYMMDD 또는 YYYYMMDD)');
  }

  // 금액 범위 검증 (입력된 경우에만)
  const priceFields = [
    ['rent_48', '48개월 대여료'], ['deposit_48', '48개월 보증금'],
    ['rent_60', '60개월 대여료'], ['deposit_60', '60개월 보증금']
  ];
  for (const [key, label] of priceFields) {
    const val = payload[key] ?? payload.price?.[key.split('_')[1]]?.[key.startsWith('rent') ? 'rent' : 'deposit'];
    if (val !== undefined && val !== '' && !isNonNegativeNumber(val)) {
      errors.push(`${label}은(는) 0 이상의 숫자여야 합니다.`);
    }
  }

  return errors;
}

/**
 * 계약(Contract) 데이터 검증.
 * @param {object} payload  계약 데이터 객체
 * @returns {string[]}      오류 메시지 배열
 */
export function validateContract(payload = {}) {
  const errors = [];

  if (isBlank(payload.partner_code) && isBlank(payload.provider_company_code)) {
    errors.push('파트너코드는 필수입니다.');
  }

  if (isBlank(payload.product_uid) && isBlank(payload.product_code) && isBlank(payload.seed_product_key)) {
    errors.push('연결된 상품이 없습니다.');
  }

  if (payload.customer_phone && !isValidPhone(payload.customer_phone)) {
    errors.push('고객 연락처 형식이 올바르지 않습니다.');
  }

  if (payload.rent_amount !== undefined && payload.rent_amount !== '' && !isNonNegativeNumber(payload.rent_amount)) {
    errors.push('대여료는 0 이상의 숫자여야 합니다.');
  }

  if (payload.deposit_amount !== undefined && payload.deposit_amount !== '' && !isNonNegativeNumber(payload.deposit_amount)) {
    errors.push('보증금은 0 이상의 숫자여야 합니다.');
  }

  return errors;
}

/**
 * 파트너(Partner) 데이터 검증.
 * @param {object} payload  파트너 데이터 객체
 * @returns {string[]}      오류 메시지 배열
 */
export function validatePartner(payload = {}) {
  const errors = [];

  if (isBlank(payload.partner_type)) {
    errors.push('파트너 유형(공급사/영업채널)은 필수입니다.');
  } else if (!['provider', 'sales_channel'].includes(payload.partner_type)) {
    errors.push('파트너 유형은 provider 또는 sales_channel이어야 합니다.');
  }

  if (isBlank(payload.partner_name)) errors.push('파트너명은 필수입니다.');

  if (payload.business_number && !isValidBusinessNumber(payload.business_number)) {
    errors.push('사업자등록번호는 10자리 숫자여야 합니다.');
  }

  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    errors.push('이메일 형식이 올바르지 않습니다.');
  }

  if (payload.manager_phone && !isValidPhone(payload.manager_phone)) {
    errors.push('담당자 연락처 형식이 올바르지 않습니다.');
  }

  return errors;
}

/**
 * 정책(Term) 데이터 검증.
 * @param {object} payload  정책 데이터 객체
 * @returns {string[]}      오류 메시지 배열
 */
export function validateTerm(payload = {}) {
  const errors = [];

  if (isBlank(payload.provider_company_code)) errors.push('공급사코드는 필수입니다.');
  if (isBlank(payload.term_name)) errors.push('정책명은 필수입니다.');

  return errors;
}

/**
 * 범용 필수 필드 검증 헬퍼.
 * @param {object} data          검증 대상 객체
 * @param {Array<[string,string]>} rules  [필드명, 라벨] 배열
 * @returns {string[]}           오류 메시지 배열
 */
export function validateRequired(data = {}, rules = []) {
  return rules
    .filter(([field]) => isBlank(data[field]))
    .map(([, label]) => `${label}은(는) 필수입니다.`);
}

// ─── 유틸 export ─────────────────────────────────────────────────────────────

export { isBlank, isValidCarNumber, isValidDateText, isValidPhone, isValidBusinessNumber, isNonNegativeNumber };
