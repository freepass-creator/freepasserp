import { formatSequenceCodeDisplay, safeText } from '../../core/management-format.js';

export function formatContractCodeDisplay(value) {
  return formatSequenceCodeDisplay(value, { prefix: 'CT' });
}

export function parseMoneyValue(value) {
  return Number(String(value ?? '').replace(/[^\d.-]/g, '') || 0);
}

export function ensureSelectValue(node, value) {
  if (!node || node.tagName !== 'SELECT') return;
  const normalized = String(value ?? '').trim();
  if (!normalized) return;
  const hasOption = Array.from(node.options || []).some((option) => option.value === normalized);
  if (!hasOption) {
    const option = document.createElement('option');
    option.value = normalized;
    option.textContent = normalized;
    node.appendChild(option);
  }
  node.value = normalized;
}

export function buildVehicleName(seed) {
  return seed.vehicle_name || [seed.maker, seed.model_name, seed.sub_model, seed.trim_name].filter(Boolean).join(' ');
}

export function buildVehicleDetail(seed) {
  return seed.detail_vehicle_name || [seed.model_name, seed.sub_model, seed.trim_name].filter(Boolean).join(' ') || buildVehicleName(seed);
}

// 제조사 단독
export function deriveMakerDisplay(contract = {}) {
  return String(contract.maker || '').trim() || '-';
}

// 모델 단독 (예: 쏘렌토)
export function deriveModelDisplay(contract = {}) {
  return String(contract.model_name || '').trim() || '-';
}

// 세부모델 단독 (예: 1.6하이브리드 2WD)
export function deriveSubModelDisplay(contract = {}) {
  return String(contract.sub_model || '').trim() || '-';
}

// 세부트림 단독
export function deriveTrimDisplay(contract = {}) {
  return String(contract.trim_name || '').trim() || '-';
}

// 차량 종합 표시 (제조사+모델+세부+트림) — 부득이한 통짜 표시용
export function deriveVehicleDisplayName(contract = {}) {
  const parts = [contract.maker, contract.model_name, contract.sub_model, contract.trim_name]
    .map(v => String(v || '').trim()).filter(Boolean);
  if (parts.length) return parts.join(' ');
  const raw = String(contract.vehicle_name || contract.detail_vehicle_name || '').trim();
  return raw || '-';
}

export function deriveAgentChannelCode(contract = {}) {
  return contract.agent_channel_code || contract.agent_company_code || contract.company_code || contract.matched_partner_code || contract.agent_code || '';
}

export function normalizeRentMonth(value, fallback = '48') {
  const digits = String(value ?? '').match(/\d+/)?.[0] || '';
  return digits || fallback;
}

export function resolveTermPricing(product = {}, month = '') {
  const normalizedMonth = String(month || '').replace(/[^\d]/g, '');
  if (!normalizedMonth) return null;
  const plan = product?.price?.[normalizedMonth];
  if (plan) {
    return {
      rent: Number(plan.rent || 0),
      deposit: Number(plan.deposit || 0),
      fee: Number(plan.fee || plan.commission || 0)
    };
  }
  return {
    rent: Number(product?.[`rent_${normalizedMonth}`] || product?.[`rental_price_${normalizedMonth}`] || 0),
    deposit: Number(product?.[`deposit_${normalizedMonth}`] || 0),
    fee: Number(product?.[`fee_${normalizedMonth}`] || product?.[`commission_${normalizedMonth}`] || 0)
  };
}

export function seedToPayload(seed, currentProfile = {}) {
  return {
    partner_code: seed.partner_code || '',
    policy_code: seed.policy_code || '',
    product_uid: seed.product_uid || seed.product_code || seed.seed_product_key || '',
    product_code: seed.product_uid || seed.product_code || seed.seed_product_key || '',
    product_code_snapshot: seed.product_code_snapshot || '',
    car_number: seed.car_number || '',
    vehicle_name: buildVehicleName(seed),
    detail_vehicle_name: buildVehicleDetail(seed),
    maker: seed.maker || '',
    model_name: seed.model_name || '',
    sub_model: seed.sub_model || '',
    trim_name: seed.trim_name || '',
    rent_month: normalizeRentMonth(seed.rent_month || '48'),
    rent_amount: Number(seed.rent_amount || 0),
    deposit_amount: Number(seed.deposit_amount || 0),
    seed_product_key: seed.product_uid || seed.seed_product_key || seed.product_code || '',
    agent_uid: currentProfile?.uid || '',
    agent_code: currentProfile?.user_code || '',
    agent_channel_code: currentProfile?.company_code || currentProfile?.matched_partner_code || '',
    agent_name: currentProfile?.name || currentProfile?.user_name || '',
    contract_status: '계약대기'
  };
}

export function buildContractListTrailing(contract = {}) {
  return [
    safeText(contract.customer_name, '고객 미입력'),
    safeText(contract.car_number),
    deriveSubModelDisplay(contract)
  ];
}
