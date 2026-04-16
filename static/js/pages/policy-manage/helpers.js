import { qs } from '../../core/utils.js';

export const MONEY_FIELD_IDS = [];
export const DIGIT_ONLY_FIELD_IDS = [];

export const FIELD_META = [
  { key: 'term_description', label: '정책설명' },
  { key: 'screening_criteria', label: '심사기준' },
  { key: 'credit_grade', label: '신용등급' },
  { key: 'basic_driver_age', label: '기본운전자연령' },
  { key: 'driver_age_upper_limit', label: '운전연령상한' },
  { key: 'driver_age_lowering', label: '운전연령하향' },
  { key: 'personal_driver_scope', label: '개인운전자범위' },
  { key: 'business_driver_scope', label: '사업자운전자범위' },
  { key: 'additional_driver_allowance_count', label: '추가운전자허용인원수' },
  { key: 'additional_driver_cost', label: '추가운전자1인당추가비용' },
  { key: 'age_lowering_cost', label: '운전연령하향비용' },
  { key: 'annual_mileage', label: '연간약정주행거리' },
  { key: 'mileage_upcharge_per_10000km', label: '1만Km 추가시 대여료 상향' },
  { key: 'deposit_installment', label: '보증금분납' },
  { key: 'payment_method', label: '결제방식' },
  { key: 'penalty_condition', label: '위약금' },
  { key: 'deposit_card_payment', label: '보증금카드결제' },
  { key: 'rental_region', label: '대여지역' },
  { key: 'delivery_fee', label: '탁송비' },
  { key: 'commission_clawback_condition', label: '수수료환수조건' },
  { key: 'maintenance_service', label: '정비서비스' },
  { key: 'injury_compensation_limit', label: '대인I, II 배상' },
  { key: 'injury_deductible', label: '대인면책금' },
  { key: 'property_compensation_limit', label: '대물배상' },
  { key: 'property_deductible', label: '대물면책금' },
  { key: 'self_body_accident', label: '자기신체사고' },
  { key: 'self_body_deductible', label: '자손면책금' },
  { key: 'uninsured_damage', label: '무보험차상해' },
  { key: 'uninsured_deductible', label: '무보험면책금' },
  { key: 'own_damage_compensation', label: '자기차량손해' },
  { key: 'own_damage_repair_ratio', label: '자차수리비율' },
  { key: 'own_damage_min_deductible', label: '자차최소면책금' },
  { key: 'own_damage_max_deductible', label: '자차최대면책금' },
  { key: 'annual_roadside_assistance', label: '연간긴급출동' },
  { key: 'insurance_included', label: '보험료포함' }
];

export function createPolicyFieldBindings() {
  const detailFields = Object.fromEntries(FIELD_META.map(({ key }) => [key, qs(`#${key}`)]));
  const contentLabels = Object.fromEntries(FIELD_META.map(({ key, label }) => [key, label]));
  const contentKeys = FIELD_META.map(({ key }) => key);
  const contentLabelToKey = Object.fromEntries(FIELD_META.map(({ key, label }) => [label, key]));

  Object.assign(contentLabelToKey, {
    '대인한도 및 면책금': 'injury_limit_deductible_legacy',
    '대물한도 및 면책금': 'property_limit_deductible_legacy',
    '자손한도 및 면책금': 'personal_injury_limit_deductible_legacy',
    '자기신체사고한도 및 면책금': 'personal_injury_limit_deductible_legacy',
    '무보험차상해한도 및 면책금': 'uninsured_limit_deductible_legacy',
    '자기차량손해한도 및 면책금': 'own_damage_limit_deductible_legacy',
    '기본운전연령': 'basic_driver_age_legacy',
    '긴급출동': 'annual_roadside_assistance_legacy',
    '연령하향비용': 'age_lowering_cost',
    '결제방식': 'payment_method',
    '대여지역': 'rental_region',
    '운전연령하향': 'driver_age_lowering',
    '연간약정주행거리': 'annual_mileage',
    '1만Km 추가시 대여료 상향': 'mileage_upcharge_per_10000km',
    '탁송비용': 'delivery_fee',
    '정비서비스': 'maintenance_service'
  });

  return { detailFields, CONTENT_LABELS: contentLabels, CONTENT_KEYS: contentKeys, CONTENT_LABEL_TO_KEY: contentLabelToKey };
}

export function normalizeFormValue(value) {
  return String(value ?? '').trim();
}

export function formatCommaNumber(value) {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  return digits ? Number(digits).toLocaleString('ko-KR') : '';
}

export function applyMoneyFieldFormatting(fieldIds, lookup = (id) => qs(`#${id}`)) {
  fieldIds.forEach((id) => {
    const field = lookup(id);
    if (!field) return;
    field.value = formatCommaNumber(field.value);
  });
}

export function bindMoneyFieldFormatting(fieldIds, lookup = (id) => qs(`#${id}`)) {
  fieldIds.forEach((id) => {
    const field = lookup(id);
    if (!field) return;
    field.addEventListener('input', () => {
      field.value = formatCommaNumber(field.value);
    });
    field.addEventListener('blur', () => {
      field.value = formatCommaNumber(field.value);
    });
  });
}

export function bindDigitOnlyFields(fieldIds, moneyFieldIds, lookup = (id) => qs(`#${id}`)) {
  fieldIds.forEach((id) => {
    const field = lookup(id);
    if (!field || moneyFieldIds.includes(id)) return;
    field.addEventListener('input', () => {
      field.value = String(field.value ?? '').replace(/[^\d]/g, '');
    });
    field.addEventListener('blur', () => {
      field.value = String(field.value ?? '').replace(/[^\d]/g, '');
    });
  });
}

function firstFilled(...values) {
  return values.map(normalizeFormValue).find(Boolean) || '';
}

function splitCombinedValue(value) {
  const raw = normalizeFormValue(value);
  if (!raw) return { left: '', right: '' };
  const slashIndex = raw.indexOf('/');
  if (slashIndex === -1) return { left: raw, right: '' };
  return {
    left: raw.slice(0, slashIndex).trim(),
    right: raw.slice(slashIndex + 1).trim()
  };
}

function normalizeAgeValue(value) {
  const raw = normalizeFormValue(value);
  const matched = raw.match(/(2[1-9]|3[0-5])/);
  return matched ? matched[1] : raw;
}

function normalizeBasicDriverAgeValue(value) {
  const raw = normalizeFormValue(value);
  if (!raw) return '';
  if (raw.includes('만') && raw.includes('세')) return raw;
  const normalizedAge = normalizeAgeValue(raw);
  return normalizedAge ? `만 ${normalizedAge}세 이상` : raw;
}

function normalizeAgeLoweringValue(value) {
  const raw = normalizeFormValue(value);
  if (!raw) return '불가';
  if (raw === '불가' || raw === '협의') return raw;
  const digits = raw.match(/2[1-5]/)?.[0];
  return digits ? `만${digits}세` : raw;
}

function normalizeRoadsideValue(value) {
  const raw = normalizeFormValue(value);
  if (!raw) return '';
  const digits = raw.replace(/[^\d]/g, '');
  return digits || raw;
}

function normalizeAnnualMileageValue(value) {
  const raw = normalizeFormValue(value);
  if (!raw) return '';
  const digits = raw.replace(/[^\d]/g, '');
  if (digits === '20000' || digits === '2') return '2만Km';
  if (digits === '30000' || digits === '3') return '3만Km';
  if (digits === '40000' || digits === '4') return '4만Km';
  return raw;
}

function normalizeOwnDamageCompensationValue(value) {
  const raw = normalizeFormValue(value);
  if (!raw) return '차량가액';
  if (raw.includes('차량가액')) return '차량가액';
  const digits = raw.replace(/[^\d]/g, '');
  if (digits === '300' || digits === '3000000') return '300만원';
  if (digits === '500' || digits === '5000000') return '500만원';
  if (digits === '1000' || digits === '10000000') return '1000만원';
  if (digits === '2000' || digits === '20000000') return '2000만원';
  return raw;
}

function normalizeDeductibleValue(value) {
  const raw = normalizeFormValue(value);
  if (!raw) return '';
  if (raw === '0' || raw === '0원' || raw === '없음') return '없음';
  const digits = raw.replace(/[^\d]/g, '');
  const map = {
    '0': '없음', '100000': '10만원', '200000': '20만원', '300000': '30만원', '400000': '40만원',
    '500000': '50만원', '600000': '60만원', '700000': '70만원', '800000': '80만원', '900000': '90만원',
    '1000000': '100만원', '2000000': '200만원', '3000000': '300만원', '4000000': '400만원', '5000000': '500만원'
  };
  return map[digits] || raw;
}

function normalizePropertyCompensationValue(value) {
  const raw = normalizeFormValue(value);
  if (!raw) return '';
  const digits = raw.replace(/[^\d]/g, '');
  const map = {
    '2000': '2천만원', '20000000': '2천만원', '3000': '3천만원', '30000000': '3천만원',
    '5000': '5천만원', '50000000': '5천만원', '7000': '7천만원', '70000000': '7천만원',
    '1': '1억원', '100000000': '1억원', '2': '2억원', '200000000': '2억원',
    '3': '3억원', '300000000': '3억원', '5': '5억원', '500000000': '5억원',
    '10': '10억원', '1000000000': '10억원'
  };
  return map[digits] || raw;
}

function normalizeSelfBodyAccidentValue(value) {
  const raw = normalizeFormValue(value);
  if (!raw) return '';
  const digits = raw.replace(/[^\d]/g, '');
  const map = {
    '1500': '1,500만원', '15000000': '1,500만원', '3000': '3,000만원', '30000000': '3,000만원',
    '5000': '5,000만원', '50000000': '5,000만원', '1': '1억원', '100000000': '1억원'
  };
  return map[digits] || raw;
}

function normalizeUninsuredDamageValue(value) {
  const raw = normalizeFormValue(value);
  if (!raw) return '2억원';
  const digits = raw.replace(/[^\d]/g, '');
  const map = { '2': '2억원', '200000000': '2억원', '3': '3억원', '300000000': '3억원', '5': '5억원', '500000000': '5억원' };
  return map[digits] || raw;
}

function normalizeRoadsideOptionValue(value) {
  const raw = normalizeFormValue(value);
  if (!raw) return '';
  if (raw === '없음') return '없음';
  const digits = raw.replace(/[^\d]/g, '');
  const map = { '1': '연 1회', '2': '연 2회', '3': '연 3회', '4': '연 4회', '5': '연 5회' };
  return map[digits] || raw;
}

function normalizeMaintenanceServiceValue(value) {
  const raw = normalizeFormValue(value);
  if (!raw) return '불포함';
  if (raw.includes('협의') || raw.includes('문의')) return '협의';
  if (raw.includes('불포함') || raw.includes('미포함')) return '불포함';
  if (raw.includes('포함')) return '포함';
  return raw;
}

function normalizeDepositInstallmentValue(value) {
  const raw = normalizeFormValue(value);
  if (!raw) return '불가능';
  if (raw.includes('가능')) return '가능';
  if (raw.includes('협의') || raw.includes('문의')) return '협의';
  return '불가능';
}

function normalizeDepositCardPaymentValue(value) {
  const raw = normalizeFormValue(value);
  if (!raw) return '가능';
  if (raw.includes('불가') || raw.includes('불가능')) return '불가';
  if (raw.includes('협의') || raw.includes('문의')) return '협의';
  return '가능';
}

function normalizeAgeLoweringCostValue(value) {
  const raw = normalizeFormValue(value);
  if (!raw) return '대여료의 10%';
  if (raw.includes('불가') || raw.includes('불가능')) return '불가';
  if (raw.includes('%')) return raw;
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return raw;
  const numeric = Number(digits);
  if (!Number.isFinite(numeric) || numeric <= 0) return raw;
  if (numeric <= 100) return `대여료의 ${numeric}%`;
  return `${formatCommaNumber(numeric)}원`;
}

function normalizeAdditionalDriverCountValue(value) {
  const raw = normalizeFormValue(value);
  if (!raw) return '불가';
  if (raw === '불가' || raw === '무제한') return raw;
  const digits = raw.replace(/[^\d]/g, '');
  if (digits === '1' || digits === '2' || digits === '3') return `${digits}인`;
  return raw;
}

function normalizeAdditionalDriverCostValue(value) {
  const raw = normalizeFormValue(value);
  if (!raw) return '불가';
  if (raw === '불가') return raw;
  return formatCommaNumber(raw) ? `${formatCommaNumber(raw)}원` : raw;
}

function normalizePersonalDriverScopeValue(value) {
  const raw = normalizeFormValue(value);
  if (!raw) return '계약자 본인+직계가족';
  if (raw.includes('본인만')) return '계약자 본인만';
  if (raw.includes('추가운전자')) return '계약자 본인+추가운전자';
  if (raw.includes('협의') || raw.includes('문의')) return '협의';
  return '계약자 본인+직계가족';
}

function normalizeBusinessDriverScopeValue(value) {
  const raw = normalizeFormValue(value);
  if (!raw) return '계약사업자 임직원 및 관계자';
  if (raw.includes('대표자 본인만')) return '대표자 본인만';
  if (raw.includes('추가운전자')) return '대표자 본인+추가운전자';
  if (raw.includes('협의') || raw.includes('문의')) return '협의';
  return '계약사업자 임직원 및 관계자';
}

function combineTwoValues(left, right) {
  const leftValue = normalizeFormValue(left);
  const rightValue = normalizeFormValue(right);
  if (!leftValue && !rightValue) return '';
  if (!rightValue) return leftValue;
  if (!leftValue) return rightValue;
  return `${leftValue} / ${rightValue}`;
}

function combineOwnDamageValue(compensation, ratio, min, max) {
  const parts = [normalizeFormValue(compensation), normalizeFormValue(ratio), normalizeFormValue(min), normalizeFormValue(max)].filter(Boolean);
  return parts.join(' / ');
}

function parseStructuredContent(content, contentLabelToKey) {
  const map = {};
  String(content || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const [label, ...rest] = line.split(':');
      const key = contentLabelToKey[normalizeFormValue(label)];
      if (!key) return;
      map[key] = rest.join(':').trim();
    });
  return map;
}

export function buildStructuredContent(detailFields, contentKeys, contentLabels) {
  return contentKeys
    .map((key) => `${contentLabels[key]}: ${normalizeFormValue(detailFields[key]?.value)}`)
    .join('\n');
}

export function buildDirectFieldPayload(detailFields) {
  return Object.fromEntries(Object.keys(detailFields).map((key) => [key, normalizeFormValue(detailFields[key]?.value)]));
}

export function buildLegacyFieldPayload(payload) {
  return {
    injury_limit_deductible_legacy: combineTwoValues(payload.injury_compensation_limit, payload.injury_deductible),
    property_limit_deductible_legacy: combineTwoValues(payload.property_compensation_limit, payload.property_deductible),
    personal_injury_limit_deductible_legacy: combineTwoValues(payload.self_body_accident, payload.self_body_deductible),
    uninsured_limit_deductible_legacy: combineTwoValues(payload.uninsured_damage, payload.uninsured_deductible),
    own_damage_limit_deductible_legacy: combineOwnDamageValue(payload.own_damage_compensation, payload.own_damage_repair_ratio, payload.own_damage_min_deductible, payload.own_damage_max_deductible),
    basic_driver_age_legacy: payload.basic_driver_age,
    annual_roadside_assistance_legacy: payload.annual_roadside_assistance
  };
}

export function clearDetailFields(detailFields) {
  Object.values(detailFields).forEach((field) => {
    if (!field) return;
    field.value = '';
  });
}

export function resolveFormValues(term, contentLabelToKey) {
  const parsed = parseStructuredContent(term?.content, contentLabelToKey);
  const injuryLegacy = splitCombinedValue(firstFilled(term?.injury_limit_deductible_legacy, parsed.injury_limit_deductible_legacy));
  const propertyLegacy = splitCombinedValue(firstFilled(term?.property_limit_deductible_legacy, parsed.property_limit_deductible_legacy));
  const selfBodyLegacy = splitCombinedValue(firstFilled(term?.personal_injury_limit_deductible_legacy, parsed.personal_injury_limit_deductible_legacy));
  const uninsuredLegacy = splitCombinedValue(firstFilled(term?.uninsured_limit_deductible_legacy, parsed.uninsured_limit_deductible_legacy));
  const ownDamageLegacy = String(firstFilled(term?.own_damage_limit_deductible_legacy, parsed.own_damage_limit_deductible_legacy)).split('/').map((part) => part.trim());

  return {
    term_description: firstFilled(term?.term_description, parsed.term_description),
    screening_criteria: firstFilled(term?.screening_criteria, parsed.screening_criteria, '무심사'),
    credit_grade: firstFilled(term?.credit_grade, parsed.credit_grade, '저신용'),
    basic_driver_age: firstFilled(normalizeBasicDriverAgeValue(term?.basic_driver_age), normalizeBasicDriverAgeValue(parsed.basic_driver_age), normalizeBasicDriverAgeValue(term?.basic_driver_age_legacy), normalizeBasicDriverAgeValue(parsed.basic_driver_age_legacy), '만 26세 이상'),
    driver_age_lowering: firstFilled(normalizeAgeLoweringValue(term?.driver_age_lowering), normalizeAgeLoweringValue(parsed.driver_age_lowering), '불가'),
    personal_driver_scope: firstFilled(normalizePersonalDriverScopeValue(term?.personal_driver_scope), normalizePersonalDriverScopeValue(parsed.personal_driver_scope), '계약자 본인+직계가족'),
    business_driver_scope: firstFilled(normalizeBusinessDriverScopeValue(term?.business_driver_scope), normalizeBusinessDriverScopeValue(parsed.business_driver_scope), '계약사업자 임직원 및 관계자'),
    additional_driver_allowance_count: firstFilled(normalizeAdditionalDriverCountValue(term?.additional_driver_allowance_count), normalizeAdditionalDriverCountValue(parsed.additional_driver_allowance_count), '불가'),
    additional_driver_cost: firstFilled(normalizeAdditionalDriverCostValue(term?.additional_driver_cost), normalizeAdditionalDriverCostValue(parsed.additional_driver_cost), '불가'),
    age_lowering_cost: firstFilled(normalizeAgeLoweringCostValue(term?.age_lowering_cost), normalizeAgeLoweringCostValue(parsed.age_lowering_cost), '대여료의 10%'),
    annual_mileage: firstFilled(normalizeAnnualMileageValue(term?.annual_mileage), normalizeAnnualMileageValue(parsed.annual_mileage), '3만Km'),
    mileage_upcharge_per_10000km: firstFilled(normalizeAgeLoweringCostValue(term?.mileage_upcharge_per_10000km), normalizeAgeLoweringCostValue(parsed.mileage_upcharge_per_10000km), '대여료의 10%'),
    deposit_installment: firstFilled(normalizeDepositInstallmentValue(term?.deposit_installment), normalizeDepositInstallmentValue(parsed.deposit_installment), '불가능'),
    payment_method: firstFilled(term?.payment_method, parsed.payment_method),
    penalty_condition: firstFilled(term?.penalty_condition, parsed.penalty_condition),
    deposit_card_payment: firstFilled(normalizeDepositCardPaymentValue(term?.deposit_card_payment), normalizeDepositCardPaymentValue(parsed.deposit_card_payment), '가능'),
    rental_region: firstFilled(term?.rental_region, parsed.rental_region, '전국'),
    delivery_fee: firstFilled(term?.delivery_fee, parsed.delivery_fee),
    commission_clawback_condition: firstFilled(term?.commission_clawback_condition, parsed.commission_clawback_condition),
    maintenance_service: firstFilled(normalizeMaintenanceServiceValue(term?.maintenance_service), normalizeMaintenanceServiceValue(parsed.maintenance_service), '불포함'),
    injury_compensation_limit: firstFilled(term?.injury_compensation_limit, parsed.injury_compensation_limit, injuryLegacy.left, '무한'),
    injury_deductible: firstFilled(normalizeDeductibleValue(term?.injury_deductible), normalizeDeductibleValue(parsed.injury_deductible), normalizeDeductibleValue(injuryLegacy.right), '없음'),
    property_compensation_limit: firstFilled(normalizePropertyCompensationValue(term?.property_compensation_limit), normalizePropertyCompensationValue(parsed.property_compensation_limit), normalizePropertyCompensationValue(propertyLegacy.left), '1억원'),
    property_deductible: firstFilled(normalizeDeductibleValue(term?.property_deductible), normalizeDeductibleValue(parsed.property_deductible), normalizeDeductibleValue(propertyLegacy.right), '30만원'),
    self_body_accident: firstFilled(normalizeSelfBodyAccidentValue(term?.self_body_accident), normalizeSelfBodyAccidentValue(parsed.self_body_accident), normalizeSelfBodyAccidentValue(selfBodyLegacy.left), '1억원'),
    self_body_deductible: firstFilled(normalizeDeductibleValue(term?.self_body_deductible), normalizeDeductibleValue(parsed.self_body_deductible), normalizeDeductibleValue(selfBodyLegacy.right), '없음'),
    uninsured_damage: firstFilled(normalizeUninsuredDamageValue(term?.uninsured_damage), normalizeUninsuredDamageValue(parsed.uninsured_damage), normalizeUninsuredDamageValue(uninsuredLegacy.left), '2억원'),
    uninsured_deductible: firstFilled(normalizeDeductibleValue(term?.uninsured_deductible), normalizeDeductibleValue(parsed.uninsured_deductible), normalizeDeductibleValue(uninsuredLegacy.right), '없음'),
    own_damage_compensation: firstFilled(normalizeOwnDamageCompensationValue(term?.own_damage_compensation), normalizeOwnDamageCompensationValue(parsed.own_damage_compensation), normalizeOwnDamageCompensationValue(ownDamageLegacy[0]), '차량가액'),
    own_damage_repair_ratio: firstFilled(normalizeRoadsideValue(term?.own_damage_repair_ratio), normalizeRoadsideValue(parsed.own_damage_repair_ratio), normalizeRoadsideValue(ownDamageLegacy[1]), '20'),
    own_damage_min_deductible: firstFilled(normalizeDeductibleValue(term?.own_damage_min_deductible), normalizeDeductibleValue(parsed.own_damage_min_deductible), normalizeDeductibleValue(ownDamageLegacy[2]), '50만원'),
    own_damage_max_deductible: firstFilled(normalizeDeductibleValue(term?.own_damage_max_deductible), normalizeDeductibleValue(parsed.own_damage_max_deductible), normalizeDeductibleValue(ownDamageLegacy[3]), '100만원'),
    annual_roadside_assistance: firstFilled(normalizeRoadsideOptionValue(term?.annual_roadside_assistance), normalizeRoadsideOptionValue(parsed.annual_roadside_assistance), normalizeRoadsideOptionValue(term?.roadside_assistance), normalizeRoadsideOptionValue(parsed.annual_roadside_assistance_legacy), '연 5회'),
    insurance_included: firstFilled(term?.insurance_included, parsed.insurance_included, '포함')
  };
}
