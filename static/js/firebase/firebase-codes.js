import { ref, runTransaction } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';
import { db } from './firebase-config.js';
import { MASTER_ADMIN_EMAIL, isMasterAdminEmail } from './firebase-auth.js';

function sanitizeValue(value = '') {
  return String(value).trim().replace(/\s+/g, '').replace(/[.#$\[\]\/]/g, '').toUpperCase();
}

function padNumber(value, width) {
  return String(value).padStart(width, '0');
}

async function nextSequence(sequenceKey) {
  const sequenceRef = ref(db, `code_sequences/${sequenceKey}`);
  const result = await runTransaction(sequenceRef, (currentValue) => (currentValue || 0) + 1);
  if (!result.committed) {
    throw new Error('코드 시퀀스 생성에 실패했습니다.');
  }
  return result.snapshot.val();
}

async function reserveCode(sequenceKey, prefix, width) {
  const number = await nextSequence(sequenceKey);
  return `${prefix}${padNumber(number, width)}`;
}

export function sanitizeCodeValue(value = '') {
  return sanitizeValue(value);
}

export function normalizeCarNumber(carNumber = '') {
  return sanitizeValue(carNumber);
}

export function buildProductCode(carNumber = '', providerCompanyCode = '') {
  const normalizedCarNumber = normalizeCarNumber(carNumber);
  const normalizedProviderCode = sanitizeValue(providerCompanyCode);
  return `${normalizedCarNumber}_${normalizedProviderCode}`;
}

export function buildLegacyTermCode(providerCompanyCode = '', termType = '') {
  const normalizedProviderCode = sanitizeValue(providerCompanyCode);
  const normalizedTermType = sanitizeValue(termType) || 'TERM';
  return `${normalizedProviderCode}_${normalizedTermType}`;
}

export async function createManagedTermCode(providerCompanyCode = '') {
  const normalizedProviderCode = sanitizeValue(providerCompanyCode);
  if (!normalizedProviderCode) throw new Error('공급사코드가 없습니다.');
  const sequence = await nextSequence(`term_${normalizedProviderCode}`);
  return `${normalizedProviderCode}_T${padNumber(sequence, 3)}`;
}

export function buildChatCode(productCode = '', agentCode = '', agentUid = '') {
  const normalizedProductCode = sanitizeValue(productCode);
  const normalizedAgentCode = sanitizeValue(agentCode) || sanitizeValue(agentUid).slice(0, 6) || 'AGENT';
  return `CH_${normalizedProductCode}_${normalizedAgentCode}`;
}

export async function createPartnerCode(partnerType) {
  if (partnerType === 'provider') {
    return reserveCode('provider_company', 'RP', 4);
  }
  if (partnerType === 'sales_channel') {
    return reserveCode('agent_company', 'SP', 3);
  }
  if (partnerType === 'operator') {
    return reserveCode('operator_company', 'OP', 3);
  }
  throw new Error('지원하지 않는 파트너 유형입니다.');
}

export async function createUserCode(role, companyCode = '') {
  const normalizedCompanyCode = sanitizeValue(companyCode);
  if (role === 'provider') {
    if (!normalizedCompanyCode) throw new Error('공급사코드가 필요합니다.');
    return `R${padNumber(await nextSequence('provider_user'), 4)}`;
  }
  if (role === 'agent') {
    if (!normalizedCompanyCode) throw new Error('영업채널코드가 필요합니다.');
    return `S${padNumber(await nextSequence('agent_user'), 4)}`;
  }
  if (role === 'admin') {
    return `A${padNumber(await nextSequence('admin_user'), 4)}`;
  }
  throw new Error('지원하지 않는 사용자 역할입니다.');
}

export async function buildSignupCodes({ email = '', role = '', companyCode = '' }) {
  if (isMasterAdminEmail(email)) {
    return {
      role: 'admin',
      admin_code: 'A0001',
      user_code: 'A0001',
      company_code: 'MASTER',
      company_name: 'FREEPASS'
    };
  }

  const normalizedCompanyCode = sanitizeValue(companyCode);
  if (!normalizedCompanyCode) {
    throw new Error('파트너사 코드는 반드시 입력해야 합니다.');
  }

  return {
    role,
    company_code: normalizedCompanyCode,
    user_code: await createUserCode(role, normalizedCompanyCode)
  };
}

export { MASTER_ADMIN_EMAIL };
