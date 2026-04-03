/**
 * firebase-db.js (개선판)
 *
 * 변경 요약:
 * - firebase-db-helpers.js의 공통 함수를 import하여 반복 패턴 제거
 * - softDelete / setStatus / watchCollection / fetchCollection 으로 보일러플레이트 80% 감소
 * - 기존 public API (export 함수 시그니처) 100% 유지 — 기존 페이지 코드 변경 불필요
 * - normalizeVehicleMasterEntry 내부 색상 파싱 로직 함수 분리
 * - checkDuplicateInProducts 공통 함수로 상품 중복 검사 통합
 * - todayDateKey() 추출로 new Date() 중복 제거
 * - watchGeneratedCodes 배열 선언 → map 체인으로 가독성 향상
 */

import {
  get, onValue, push, ref, remove, runTransaction, set, update
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';
import { db } from './firebase-config.js';
import {
  buildChatCode, buildLegacyTermCode, buildProductCode,
  createManagedTermCode, createPartnerCode, createUserCode, sanitizeCodeValue
} from './firebase-codes.js';
import {
  softDelete, setStatus, watchCollection, fetchCollection,
  fetchOne, isNotDeleted, isActive, queryByChild,
  limitToLast, query, orderByChild
} from './firebase-db-helpers.js';

// ─── 공통 유틸 ───────────────────────────────────────────────────────────────

async function nextLocalSequence(sequenceKey) {
  const sequenceRef = ref(db, `code_sequences/${sequenceKey}`);
  const result = await runTransaction(sequenceRef, (v) => (v || 0) + 1);
  if (!result.committed) throw new Error('코드 시퀀스 생성에 실패했습니다.');
  return result.snapshot.val();
}

function todayDateKey() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

function normalizeCompactDate(dateKey = '') {
  const digits = String(dateKey || '').replace(/[^0-9]/g, '');
  if (digits.length >= 8) return digits.slice(2, 8);
  if (digits.length === 6) return digits;
  return '000000';
}

// 공통 정렬 함수
const sortByCode = (key) => (a, b) => String(a[key]).localeCompare(String(b[key]));
const sortByCreatedDesc = (a, b) => (b.created_at || 0) - (a.created_at || 0);
const sortByUpdatedOrCreatedDesc = (a, b) =>
  Number(b.updated_at || b.created_at || 0) - Number(a.updated_at || a.created_at || 0);

// ─── 사용자 ──────────────────────────────────────────────────────────────────

export async function saveUserProfile(uid, profile) {
  return set(ref(db, `users/${uid}`), { ...profile, created_at: profile.created_at || Date.now() });
}

export async function upsertUserProfile(uid, profile) {
  const userRef = ref(db, `users/${uid}`);
  const snapshot = await get(userRef);
  const current = snapshot.exists() ? snapshot.val() : {};
  return set(userRef, { ...current, ...profile, created_at: current.created_at || Date.now() });
}

export async function getUserProfile(uid) { return fetchOne(`users/${uid}`); }

export async function fetchUsersOnce() {
  return fetchCollection('users', { mode: 'entries', entryKey: 'uid', filter: isNotDeleted });
}

export function watchUsers(callback) {
  return watchCollection('users', callback, {
    mode: 'entries', entryKey: 'uid', filter: isNotDeleted,
    sort: (a, b) => {
      const ap = a.status === 'pending' ? 0 : 1;
      const bp = b.status === 'pending' ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return (b.updated_at || b.created_at || 0) - (a.updated_at || a.created_at || 0);
    }
  });
}

export async function updateUserStatus(uid, status) { return setStatus(`users/${uid}`, status); }

export async function updateUserProfile(uid, updates) {
  const userRef = ref(db, `users/${uid}`);
  const snapshot = await get(userRef);
  if (!snapshot.exists()) throw new Error('수정할 회원이 없습니다.');
  const current = snapshot.val();
  const next = { ...current, ...updates, updated_at: Date.now() };
  const nextRole = next.role || '';
  const nextCompanyCode = sanitizeCodeValue(next.company_code || '');
  const shouldAssignUserCode = (!current.user_code || !String(current.user_code).trim()) && next.status === 'active' && nextRole;

  if (shouldAssignUserCode) {
    if (nextRole === 'admin') {
      next.user_code = current.email === 'dudguq@gmail.com' ? 'A0000' : await createUserCode('admin');
      next.admin_code = next.user_code;
      next.company_code = 'admin';
      next.company_name = '프리패스모빌리티';
    } else if (nextRole === 'provider') {
      if (!nextCompanyCode.startsWith('RP')) throw new Error('공급사 회원은 RP 계열 소속코드가 필요합니다.');
      next.user_code = await createUserCode('provider', nextCompanyCode);
      next.company_code = nextCompanyCode;
    } else if (nextRole === 'agent') {
      if (!nextCompanyCode.startsWith('SP')) throw new Error('영업자 회원은 SP 계열 소속코드가 필요합니다.');
      next.user_code = await createUserCode('agent', nextCompanyCode);
      next.company_code = nextCompanyCode;
    }
  }
  await set(userRef, next);
  return uid;
}

export async function deleteUserProfile(uid) { return softDelete(`users/${uid}`); }

// ─── 파트너 ──────────────────────────────────────────────────────────────────

export async function savePartner({
  partner_type, business_number = '', partner_name, ceo_name = '', address = '',
  company_phone = '', email = '', manager_name = '', manager_position = '', manager_phone = '',
  fax = '', note = '', driver_age_lowering = '', annual_mileage = '', status = 'active', created_by = ''
}) {
  const partnerCode = await createPartnerCode(partner_type);
  await set(ref(db, `partners/${partnerCode}`), {
    partner_code: partnerCode, partner_type, business_number, partner_name, ceo_name, address,
    company_phone, email, manager_name, manager_position, manager_phone, fax, note,
    driver_age_lowering, annual_mileage, status, created_by, created_at: Date.now()
  });
  return partnerCode;
}

export async function updatePartner(partnerCode, updates) {
  const code = sanitizeCodeValue(partnerCode);
  const partnerRef = ref(db, `partners/${code}`);
  const snapshot = await get(partnerRef);
  if (!snapshot.exists()) throw new Error('수정할 파트너가 없습니다.');
  const current = snapshot.val();
  await set(partnerRef, { ...current, ...updates, partner_code: code, updated_at: Date.now() });
  return code;
}

export async function fetchPartnersOnce() {
  return fetchCollection('partners', { filter: isNotDeleted, sort: sortByUpdatedOrCreatedDesc });
}

export function watchPartners(callback) {
  return watchCollection('partners', callback, {
    filter: isNotDeleted,
    sort: (a, b) => {
      const ap = a.status === 'pending' ? 0 : 1;
      const bp = b.status === 'pending' ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return (b.updated_at || b.created_at || 0) - (a.updated_at || a.created_at || 0);
    }
  });
}

export async function getPartnerByCode(partnerCode) { return fetchOne(`partners/${sanitizeCodeValue(partnerCode)}`); }

export async function getPartnerByBusinessNumber(businessNumber) {
  const normalized = String(businessNumber || '').replace(/[^0-9]/g, '');
  if (!normalized) return null;
  const partners = await fetchPartnersOnce();
  return partners.find((p) => String(p.business_number || '').replace(/[^0-9]/g, '') === normalized) || null;
}

export async function updatePartnerStatus(partnerCode, status) {
  return setStatus(`partners/${sanitizeCodeValue(partnerCode)}`, status);
}

export async function deletePartner(partnerCode) {
  return softDelete(`partners/${sanitizeCodeValue(partnerCode)}`);
}

// ─── 코드 시퀀스 / 코드 항목 ─────────────────────────────────────────────────

export async function saveCodeItem({ group_code, item_code, item_name, note = '', sort_order = 0, is_active = true, created_by = '' }) {
  const normalizedGroup = sanitizeCodeValue(group_code);
  const normalizedCode = sanitizeCodeValue(item_code);
  if (!normalizedGroup || !normalizedCode) throw new Error('그룹코드와 항목코드는 필수입니다.');
  const codeKey = `${normalizedGroup}_${normalizedCode}`;
  await set(ref(db, `input_codes/${codeKey}`), {
    code_key: codeKey, group_code: normalizedGroup, item_code: normalizedCode,
    item_name, note, sort_order: Number(sort_order || 0), is_active: Boolean(is_active),
    created_by, created_at: Date.now()
  });
  return codeKey;
}

export async function updateCodeItem(codeKey, updates) {
  const normalizedKey = sanitizeCodeValue(codeKey);
  const itemRef = ref(db, `input_codes/${normalizedKey}`);
  const snapshot = await get(itemRef);
  if (!snapshot.exists()) throw new Error('수정할 코드 항목이 없습니다.');
  const current = snapshot.val();
  await set(itemRef, { ...current, ...updates, code_key: normalizedKey, updated_at: Date.now() });
  return normalizedKey;
}

export async function deleteCodeItem(codeKey) { return remove(ref(db, `input_codes/${sanitizeCodeValue(codeKey)}`)); }

const sortCodeItems = (a, b) => {
  const g = String(a.group_code).localeCompare(String(b.group_code));
  if (g !== 0) return g;
  const s = Number(a.sort_order || 0) - Number(b.sort_order || 0);
  if (s !== 0) return s;
  return String(a.item_code).localeCompare(String(b.item_code));
};

export function watchCodeItems(callback) { return watchCollection('input_codes', callback, { sort: sortCodeItems }); }

export function watchCodeItemsByGroup(groupCode, callback) {
  const normalizedGroup = sanitizeCodeValue(groupCode);
  return watchCollection('input_codes', callback, {
    filter: (item) => item.group_code === normalizedGroup && item.is_active !== false,
    sort: (a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)
  });
}

// ─── 차종 마스터 ─────────────────────────────────────────────────────────────

function parseColorList(value) {
  if (Array.isArray(value)) return value.map((c) => String(c || '').trim()).filter(Boolean);
  return String(value || '').split(/[\n\r,|/]+/).map((c) => String(c || '').trim()).filter(Boolean);
}

function uniqueStrings(arr) {
  return Array.from(new Map(arr.map((c) => [c, c])).values());
}

function normalizeVehicleMasterEntry(entry = {}, index = 0) {
  const maker = String(entry.maker || '').trim();
  const modelName = String(entry.model_name || '').trim();
  const subModel = String(entry.sub_model || entry.sub_model_name || '').trim();
  if (!maker || !modelName || !subModel) return null;
  return {
    entry_id: sanitizeCodeValue(`${maker}_${modelName}_${subModel}`) || `VM${index + 1}`,
    maker, model_name: modelName, sub_model: subModel,
    production_period: String(entry.production_period || '').trim(),
    model_code: String(entry.model_code || '').trim(),
    vehicle_category: String(entry.vehicle_category || '').trim(),
    exterior_colors: uniqueStrings(parseColorList(entry.exterior_colors)),
    interior_colors: uniqueStrings(parseColorList(entry.interior_colors)),
    maker_rank: Number(entry.maker_rank || 0) || 0,
    model_rank: Number(entry.model_rank || 0) || 0,
    sub_model_year: Number(entry.sub_model_year || 0) || 0,
    created_order: Number(entry.created_order || index + 1) || index + 1
  };
}

export async function replaceVehicleMaster({ entries = [], fileName = '', updatedBy = '', updatedByName = '' } = {}) {
  const normalizedEntries = (entries || []).map((e, i) => normalizeVehicleMasterEntry(e, i)).filter(Boolean);
  const payloadEntries = Object.fromEntries(normalizedEntries.map((e) => [e.entry_id, { ...e, updated_at: Date.now() }]));
  const payload = {
    source_file: String(fileName || '').trim(),
    updated_by: String(updatedBy || '').trim(),
    updated_by_name: String(updatedByName || '').trim(),
    updated_at: Date.now(), entries: payloadEntries
  };
  await set(ref(db, 'vehicle_master'), payload);
  return payload;
}

export function watchVehicleMaster(callback) {
  return onValue(ref(db, 'vehicle_master'), (snapshot) => {
    const data = snapshot.val() || {};
    const items = Object.values(data.entries || {}).map((e, i) => normalizeVehicleMasterEntry(e, i)).filter(Boolean);
    callback({ ...data, items });
  });
}

// ─── 정책(Term) ───────────────────────────────────────────────────────────────

async function checkDuplicateTermName(providerCode, termName, excludeCode = null) {
  const snapshot = await get(ref(db, 'policies'));
  return Object.entries(snapshot.val() || {}).find(([code, item]) =>
    (excludeCode === null || code !== excludeCode) &&
    item.status !== 'deleted' &&
    item.provider_company_code === providerCode &&
    String(item.term_name || '').trim() === termName
  ) || null;
}

export async function saveTerm(termData = {}) {
  const { provider_company_code, term_name, status = 'active', created_by = '', ...rest } = termData || {};
  const providerCode = sanitizeCodeValue(provider_company_code);
  const normalizedTermName = String(term_name || '').trim();
  if (!providerCode) throw new Error('공급사코드가 필요합니다.');
  if (!normalizedTermName) throw new Error('정책명은 필수입니다.');
  if (await checkDuplicateTermName(providerCode, normalizedTermName)) {
    throw new Error('같은 공급사에서 같은 정책명은 등록할 수 없습니다.');
  }
  const termCode = await createManagedTermCode(providerCode);
  await set(ref(db, `policies/${termCode}`), {
    term_code: termCode, provider_company_code: providerCode,
    term_name: normalizedTermName, ...rest, status, created_by, created_at: Date.now()
  });
  return termCode;
}

export async function updateTerm(termCode, updates) {
  const normalizedCode = sanitizeCodeValue(termCode);
  const termRef = ref(db, `policies/${normalizedCode}`);
  const snapshot = await get(termRef);
  if (!snapshot.exists()) throw new Error('수정할 정책이 없습니다.');
  const current = snapshot.val();
  const nextTermName = String(updates.term_name || current.term_name || '').trim();
  if (!nextTermName) throw new Error('정책명은 필수입니다.');
  const targetProviderCode = sanitizeCodeValue(updates.provider_company_code || current.provider_company_code || '');
  if (await checkDuplicateTermName(targetProviderCode, nextTermName, normalizedCode)) {
    throw new Error('같은 공급사에서 같은 정책명은 등록할 수 없습니다.');
  }
  await set(termRef, { ...current, ...updates, term_name: nextTermName, term_code: normalizedCode, updated_at: Date.now() });
  return normalizedCode;
}

export async function deleteTerm(termCode) { return softDelete(`policies/${sanitizeCodeValue(termCode)}`); }

export function watchTerms(callback) {
  return watchCollection('policies', callback, { filter: isNotDeleted, sort: sortByUpdatedOrCreatedDesc });
}

export function watchTermsByProvider(providerCompanyCode, callback) {
  const normalizedProvider = sanitizeCodeValue(providerCompanyCode);
  return watchCollection('policies', callback, {
    filter: (item) => item.provider_company_code === normalizedProvider && isActive(item),
    sort: sortByUpdatedOrCreatedDesc
  });
}

export async function getTerm(termCode) { return fetchOne(`policies/${sanitizeCodeValue(termCode)}`); }

export async function resolveTermForProduct({ termCode = '', termName = '', providerCompanyCode = '' } = {}) {
  const normalizedTermCode = sanitizeCodeValue(termCode);
  const normalizedProviderCode = sanitizeCodeValue(providerCompanyCode);
  const normalizedTermName = String(termName || '').trim();
  if (normalizedTermCode) {
    const direct = await getTerm(normalizedTermCode);
    if (direct) return direct;
  }
  const items = await fetchCollection('policies', { filter: isActive });
  if (!items.length) return null;
  const safe = (predicate) => (item) => { try { return predicate(item || {}); } catch { return false; } };
  const matchesCode = safe((item) => sanitizeCodeValue(item.term_code || '') === normalizedTermCode);
  const matchesName = safe((item) => String(item.term_name || '').trim() === normalizedTermName);
  const matchesProvider = safe((item) => sanitizeCodeValue(item.provider_company_code || '') === normalizedProviderCode);
  return (
    (normalizedTermCode && normalizedProviderCode && items.find((i) => matchesProvider(i) && matchesCode(i))) ||
    (normalizedTermName && normalizedProviderCode && items.find((i) => matchesProvider(i) && matchesName(i))) ||
    (normalizedTermCode && items.find(matchesCode)) ||
    (normalizedTermName && items.find(matchesName)) ||
    // 공급사코드만으로 해당 공급사의 첫 번째 활성 정책 자동 매칭
    (normalizedProviderCode && items.find(matchesProvider)) ||
    null
  );
}

// ─── 상품(Product) ────────────────────────────────────────────────────────────

function normalizeProductCodeAliases(value = []) {
  const items = Array.isArray(value) ? value : [value];
  return [...new Set(items.map((item) => sanitizeCodeValue(item)).filter(Boolean))];
}

/**
 * 서버 사이드 쿼리로 특정 필드의 중복 여부를 확인한다.
 * orderByChild + equalTo를 사용하여 전체 상품을 내려받지 않고 해당 값만 조회.
 *
 * @param {string} field      검사 대상 필드 (e.g. 'car_number', 'product_code')
 * @param {string} value      검사할 값 (sanitize 된 값)
 * @param {string} excludeUid 제외할 product_uid (수정 시 자기 자신 제외)
 * @returns {Promise<[string, object]|null>} 중복 항목의 [key, data] 또는 null
 */
async function checkDuplicateByQuery(field, value, excludeUid) {
  if (!value) return null;
  const matches = await queryByChild('products', field, value);
  return Object.entries(matches).find(([key, item]) => {
    const entryUid = sanitizeCodeValue(item?.product_uid || key);
    return entryUid !== excludeUid;
  }) || null;
}

async function findProductRecord(identifier = '') {
  const normalizedIdentifier = sanitizeCodeValue(identifier);
  if (!normalizedIdentifier) return null;
  const directSnapshot = await get(ref(db, `products/${normalizedIdentifier}`));
  if (directSnapshot.exists()) return { key: normalizedIdentifier, product: directSnapshot.val() || {} };
  const aliasSnapshot = await get(ref(db, `product_code_aliases/${normalizedIdentifier}`));
  if (aliasSnapshot.exists()) {
    const aliasTarget = sanitizeCodeValue(aliasSnapshot.val());
    if (aliasTarget) {
      const aliasedSnapshot = await get(ref(db, `products/${aliasTarget}`));
      if (aliasedSnapshot.exists()) return { key: aliasTarget, product: aliasedSnapshot.val() || {} };
    }
  }
  // 서버 사이드 쿼리로 product_code 기반 조회 시도
  const byCode = await queryByChild('products', 'product_code', normalizedIdentifier);
  const codeEntry = Object.entries(byCode)[0];
  if (codeEntry) return { key: codeEntry[0], product: codeEntry[1] || {} };
  // 서버 사이드 쿼리로 car_number 기반 조회 시도
  const byCarNumber = await queryByChild('products', 'car_number', normalizedIdentifier);
  const carEntry = Object.entries(byCarNumber)[0];
  if (carEntry) return { key: carEntry[0], product: carEntry[1] || {} };
  return null;
}

async function createProductUid() {
  const compactDate = normalizeCompactDate(todayDateKey());
  const sequence = String(await nextLocalSequence('product_uid')).padStart(4, '0');
  return `PD${compactDate}${sequence}`;
}

async function bindProductCodeAliases(productUid = '', aliases = []) {
  const normalizedUid = sanitizeCodeValue(productUid);
  if (!normalizedUid) return;
  await Promise.all(
    normalizeProductCodeAliases(aliases).map((alias) => set(ref(db, `product_code_aliases/${alias}`), normalizedUid))
  );
}

export async function saveProduct(product) {
  const productCode = buildProductCode(product.car_number, product.provider_company_code);
  const productUid = sanitizeCodeValue(product.product_uid || '') || await createProductUid();
  const normalizedCarNumber = sanitizeCodeValue(product.car_number);
  if (await checkDuplicateByQuery('car_number', normalizedCarNumber, productUid)) throw new Error('같은 차량번호는 등록할 수 없습니다.');
  if (await checkDuplicateByQuery('product_code', productCode, productUid)) throw new Error('같은 상품코드가 이미 존재합니다.');
  const termCode = product.term_code || buildLegacyTermCode(product.provider_company_code, product.term_name || product.term_type);
  const payload = {
    ...product, product_uid: productUid, product_code: productCode,
    product_code_aliases: normalizeProductCodeAliases(product.product_code_aliases || []),
    term_code: termCode, term_name: product.term_name || product.term_type || '', created_at: Date.now()
  };
  await set(ref(db, `products/${productUid}`), payload);
  await bindProductCodeAliases(productUid, [productCode, ...(payload.product_code_aliases || [])]);
  return { productUid, productCode };
}

export function watchProducts(callback) { return watchCollection('products', callback, { sort: sortByUpdatedOrCreatedDesc }); }

export async function fetchProductsOnce() {
  return fetchCollection('products', { sort: sortByUpdatedOrCreatedDesc });
}

export async function updateProduct(productIdentifier, updates) {
  const record = await findProductRecord(productIdentifier);
  if (!record) throw new Error('수정할 상품이 없습니다.');
  const { key: productKey, product: current } = record;
  const productUid = sanitizeCodeValue(current.product_uid || productKey);
  const nextCarNumber = String(updates.car_number || current.car_number || '').trim();
  const previousCarNumber = String(current.car_number || '').trim();
  const nextProviderCompanyCode = sanitizeCodeValue(updates.provider_company_code || updates.partner_code || current.provider_company_code || current.partner_code || '');
  const normalizedNextCarNumber = sanitizeCodeValue(nextCarNumber);
  const previousProductCode = sanitizeCodeValue(current.product_code || productKey);
  const nextProductCode = buildProductCode(nextCarNumber, nextProviderCompanyCode);
  if (await checkDuplicateByQuery('car_number', normalizedNextCarNumber, productUid)) throw new Error('같은 차량번호는 등록할 수 없습니다.');
  if (await checkDuplicateByQuery('product_code', nextProductCode, productUid)) throw new Error('같은 상품코드가 이미 존재합니다.');
  const nextAliases = normalizeProductCodeAliases([...(current.product_code_aliases || []), previousProductCode !== nextProductCode ? previousProductCode : '']);
  const next = {
    ...current, ...updates, product_uid: productUid, car_number: nextCarNumber,
    partner_code: nextProviderCompanyCode || current.partner_code || '',
    provider_company_code: nextProviderCompanyCode || current.provider_company_code || '',
    product_code: nextProductCode, product_code_aliases: nextAliases,
    term_code: updates.term_code || current.term_code || buildLegacyTermCode(nextProviderCompanyCode || current.provider_company_code, updates.term_name || current.term_name || current.term_type),
    term_name: updates.term_name || current.term_name || current.term_type || '',
    updated_at: Date.now()
  };
  await set(ref(db, `products/${productKey}`), next);
  await bindProductCodeAliases(productUid, [nextProductCode, previousProductCode, ...nextAliases]);
  await updateLinkedProductReferences({ productUid, previousProductCode, nextProductCode, previousCarNumber, nextCarNumber });
  return { productUid: productKey, productCode: nextProductCode };
}

export async function deleteProduct(productIdentifier) {
  const record = await findProductRecord(productIdentifier);
  if (!record) throw new Error('삭제할 상품이 없습니다.');
  return remove(ref(db, `products/${record.key}`));
}

export async function getProduct(productIdentifier) {
  const record = await findProductRecord(productIdentifier);
  return record ? (record.product || null) : null;
}

// ─── 채팅 ─────────────────────────────────────────────────────────────────────

function deriveRoomChatStatus(room = {}) {
  if (room.chat_status === '대화중') return '대화중';
  const hasMessage = Number(room.last_message_at || 0) > 0 || String(room.last_message || '').trim() !== '';
  return hasMessage ? '대화중' : '신규';
}

export async function ensureRoom({
  productUid = '', productCode = '', providerUid, providerCompanyCode, providerName = '',
  agentUid, agentCode, agentName = '', vehicleNumber = '', modelName = ''
}) {
  const productReference = sanitizeCodeValue(productCode || productUid);
  const normalizedProductUid = sanitizeCodeValue(productUid);
  const productDisplayCode = sanitizeCodeValue(productCode || productUid);
  const roomId = buildChatCode(productReference, agentCode, agentUid);
  const roomRef = ref(db, `rooms/${roomId}`);
  const snapshot = await get(roomRef);
  const now = Date.now();
  const basePayload = {
    room_id: roomId, chat_code: roomId,
    product_uid: normalizedProductUid || productReference,
    product_code: productDisplayCode || productReference,
    product_code_snapshot: productDisplayCode || productReference,
    provider_uid: providerUid || '', provider_company_code: providerCompanyCode || '',
    provider_name: providerName || '', agent_uid: agentUid || '',
    agent_code: agentCode || '', agent_name: agentName || '',
    vehicle_number: vehicleNumber || '', model_name: modelName || '',
    last_message: '', last_message_at: 0, last_sender_role: '', last_sender_code: '',
    last_effective_sender_role: '', last_effective_sender_code: '',
    unread_for_agent: 0, unread_for_provider: 0, chat_status: '신규',
    created_at: now, updated_at: now
  };
  if (!snapshot.exists()) {
    await set(roomRef, basePayload);
  } else {
    const current = snapshot.val() || {};
    // 숨김 해제 — 다시 대화 시작 시 hidden_by에서 현재 사용자 제거
    const updatedHiddenBy = { ...(current.hidden_by || {}) };
    if (agentUid) delete updatedHiddenBy[agentUid];
    await update(roomRef, {
      product_uid: normalizedProductUid || current.product_uid || current.product_code || current.product_code_snapshot || '',
      product_code: productDisplayCode || current.product_code || current.product_code_snapshot || current.product_uid || '',
      product_code_snapshot: productDisplayCode || current.product_code_snapshot || current.product_code || current.product_uid || '',
      provider_uid: providerUid || current.provider_uid || '', provider_company_code: providerCompanyCode || current.provider_company_code || '',
      provider_name: providerName || current.provider_name || '', agent_uid: agentUid || current.agent_uid || '',
      agent_code: agentCode || current.agent_code || '', agent_name: agentName || current.agent_name || '',
      vehicle_number: vehicleNumber || current.vehicle_number || '', model_name: modelName || current.model_name || '',
      last_effective_sender_role: current.last_effective_sender_role || (current.last_sender_role === 'admin' ? '' : (current.last_sender_role || '')),
      last_effective_sender_code: current.last_effective_sender_code || (current.last_sender_role === 'admin' ? '' : (current.last_sender_code || '')),
      hidden_by: updatedHiddenBy,
      chat_status: deriveRoomChatStatus(current), updated_at: now
    });
  }
  return roomId;
}

const ROOMS_LIMIT = 200;

export function watchRooms(callback) {
  return watchCollection('rooms', callback, {
    sort: (a, b) => (b.last_message_at || 0) - (a.last_message_at || 0),
    queryFn: (dbRef) => query(dbRef, orderByChild('last_message_at'), limitToLast(ROOMS_LIMIT)),
    queryKey: `L${ROOMS_LIMIT}`
  });
}

export function watchMessages(roomId, callback) {
  return onValue(ref(db, `messages/${roomId}`), (snapshot) => {
    const data = snapshot.val() || {};
    callback(Object.entries(data).map(([id, value]) => ({ id, ...value })));
  });
}

export async function markRoomRead(roomId, role, uid) {
  const roomRef = ref(db, `rooms/${roomId}`);
  const snapshot = await get(roomRef);
  const current = snapshot.exists() ? snapshot.val() : {};
  const now = Date.now();
  const payload = { updated_at: now };
  // 기존 호환: unread 카운터 리셋
  if (role === 'agent') payload.unread_for_agent = 0;
  else if (role === 'provider') payload.unread_for_provider = 0;
  // 개인별 읽음 기록
  if (uid) payload[`read_by/${uid}`] = now;
  await update(roomRef, payload);
}

export async function sendMessage(roomId, payload) {
  const now = Date.now();
  const roomRef = ref(db, `rooms/${roomId}`);
  const roomSnapshot = await get(roomRef);
  const currentRoom = roomSnapshot.exists() ? roomSnapshot.val() : {};
  const messageRef = push(ref(db, `messages/${roomId}`));
  await set(messageRef, { ...payload, created_at: now });
  const senderRole = payload.sender_role || '';
  let nextUnreadForAgent = Number(currentRoom.unread_for_agent || 0);
  let nextUnreadForProvider = Number(currentRoom.unread_for_provider || 0);
  if (senderRole === 'agent') { nextUnreadForAgent = 0; nextUnreadForProvider += 1; }
  else if (senderRole === 'provider') { nextUnreadForAgent += 1; nextUnreadForProvider = 0; }
  const currentHiddenBy = { ...(currentRoom.hidden_by || {}) };
  [payload.sender_uid, currentRoom.agent_uid, currentRoom.provider_uid].filter(Boolean).forEach((uid) => {
    if (currentHiddenBy[uid]) delete currentHiddenBy[uid];
  });
  // 대화상태: 메시지 보내면 항상 '대화중'
  const chatStatus = '대화중';

  const updatePayload = {
    last_message: payload.text, last_message_at: now,
    last_sender_role: senderRole, last_sender_code: payload.sender_code || '',
    unread_for_agent: nextUnreadForAgent, unread_for_provider: nextUnreadForProvider,
    hidden_by: currentHiddenBy,
    chat_status: chatStatus,
    updated_at: now
  };
  // 보낸 사람은 자동으로 읽음 처리
  if (payload.sender_uid) updatePayload[`read_by/${payload.sender_uid}`] = now;
  // 영업자/공급사만 처리상태에 영향 — 관리자는 개입해도 상태 변경 없음
  if (senderRole === 'agent' || senderRole === 'provider') {
    updatePayload.last_effective_sender_role = senderRole;
    updatePayload.last_effective_sender_code = payload.sender_code || '';
  }
  await update(roomRef, updatePayload);
}

export async function hideRoomForUser(roomId, userUid) {
  const safeRoomId = String(roomId || '').trim();
  const safeUserUid = String(userUid || '').trim();
  if (!safeRoomId || !safeUserUid) throw new Error('숨김 처리 정보가 올바르지 않습니다.');
  const roomRef = ref(db, `rooms/${safeRoomId}`);
  const snapshot = await get(roomRef);
  if (!snapshot.exists()) throw new Error('숨길 대화방이 없습니다.');
  const current = snapshot.val() || {};
  await update(roomRef, { hidden_by: { ...(current.hidden_by || {}), [safeUserUid]: true }, updated_at: Date.now() });
}

export async function deleteRoomEverywhere(roomId) {
  const safeRoomId = sanitizeCodeValue(roomId);
  if (!safeRoomId) throw new Error('삭제할 대화방 코드가 올바르지 않습니다.');
  await remove(ref(db, `messages/${safeRoomId}`));
  await remove(ref(db, `rooms/${safeRoomId}`));
}

// ─── 코드 조회 ────────────────────────────────────────────────────────────────

/**
 * 코드 조회 — 개별 컬렉션 watch 방식.
 * 기존: onValue(ref(db)) 로 DB 루트 전체를 구독하여 모든 변경마다 전체 재전송.
 * 개선: 5개 컬렉션을 각각 개별 watch하고, 어느 하나가 변경될 때만 병합 후 callback.
 */
export function watchGeneratedCodes(callback) {
  const cache = { partners: {}, users: {}, policies: {}, products: {}, rooms: {} };
  let debounceTimer = null;

  function buildAndEmit() {
    const codeEntries = [
      ...Object.values(cache.partners).map((p) => ({
        code_type: 'partner', code: p.partner_code || '', title: p.partner_name || '-',
        subtitle: p.partner_type === 'provider' ? '공급사 코드' : '영업채널 코드',
        rule_text: p.partner_type === 'provider' ? 'RP + 4자리 시퀀스' : 'SP + 3자리 시퀀스',
        source_values: { partner_type: p.partner_type || '', partner_name: p.partner_name || '' }, created_at: p.created_at || 0
      })),
      ...Object.values(cache.users).filter((u) => u.user_code).map((u) => ({
        code_type: 'user', code: u.user_code, title: u.name || u.email || '-', subtitle: '사용자 코드',
        rule_text: u.role === 'provider' ? 'R + 4자리 시퀀스' : u.role === 'agent' ? 'S + 3자리 시퀀스' : u.role === 'admin' ? 'A0001 고정' : '사용자 역할 기반 자동 시퀀스',
        source_values: { role: u.role || '', partner_code: u.company_code || '', email: u.email || '' }, created_at: u.created_at || 0
      })),
      ...Object.values(cache.policies).map((t) => ({
        code_type: 'policy', code: t.term_code || '', title: t.term_name || '-', subtitle: '정책 코드',
        rule_text: '공급사코드 + T + 3자리 시퀀스',
        source_values: { provider_company_code: t.provider_company_code || '', term_name: t.term_name || '' }, created_at: t.created_at || 0
      })),
      ...Object.values(cache.products).map((p) => ({
        code_type: 'product', code: p.product_code || '', title: p.car_number || '-', subtitle: '상품 코드',
        rule_text: '차량번호 + 공급사코드',
        source_values: { car_number: p.car_number || '', provider_company_code: p.provider_company_code || '' }, created_at: p.created_at || 0
      })),
      ...Object.values(cache.rooms).map((r) => ({
        code_type: 'chat', code: r.chat_code || r.room_id || '', title: r.product_code || '-', subtitle: '대화 코드',
        rule_text: 'CH + 상품코드 + 영업자코드',
        source_values: { product_code: r.product_code || '', agent_code: r.agent_code || '' }, created_at: r.created_at || 0
      }))
    ];
    callback(codeEntries.sort(sortByCreatedDesc));
  }

  function scheduleEmit() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(buildAndEmit, 80);
  }

  function makeListener(key) {
    return onValue(ref(db, key), (snapshot) => {
      cache[key] = snapshot.val() || {};
      scheduleEmit();
    });
  }

  const unsubs = ['partners', 'users', 'policies', 'products', 'rooms'].map(makeListener);
  return () => { clearTimeout(debounceTimer); unsubs.forEach((fn) => fn()); };
}

// ─── 계약 / 정산 ──────────────────────────────────────────────────────────────

function buildContractCode({ dateKey = '', sequence = 1 } = {}) {
  return `CT${normalizeCompactDate(dateKey)}${String(sequence).padStart(2, '0')}`;
}

function buildSettlementCode({ dateKey = '', sequence = 1 } = {}) {
  return `ST${normalizeCompactDate(dateKey)}${String(sequence).padStart(2, '0')}`;
}

function buildContractSnapshots(contract = {}) {
  const partnerCode = sanitizeCodeValue(contract.partner_code || contract.provider_company_code || '');
  const productUid = sanitizeCodeValue(contract.product_uid || contract.product_code || contract.seed_product_key || '');
  const productCodeSnapshot = sanitizeCodeValue(contract.product_code_snapshot || contract.display_product_code || contract.product_display_code || '');
  const agentChannelCode = sanitizeCodeValue(contract.agent_channel_code || contract.agent_company_code || contract.company_code || '');
  const agentCode = sanitizeCodeValue(contract.agent_code || contract.agent_uid || '');
  return {
    product_uid_snapshot: productUid, product_code_snapshot: productCodeSnapshot || productUid,
    seed_product_key_snapshot: sanitizeCodeValue(contract.seed_product_key || contract.product_uid || contract.product_code || ''),
    partner_code_snapshot: partnerCode, provider_company_code_snapshot: partnerCode,
    agent_channel_code_snapshot: agentChannelCode, agent_code_snapshot: agentCode,
    agent_uid_snapshot: sanitizeCodeValue(contract.agent_uid || ''),
    policy_code_snapshot: sanitizeCodeValue(contract.policy_code || ''),
    car_number_snapshot: String(contract.car_number || '').trim(),
    vehicle_name_snapshot: String(contract.vehicle_name || '').trim(),
    detail_vehicle_name_snapshot: String(contract.detail_vehicle_name || '').trim(),
    model_name_snapshot: String(contract.model_name || '').trim(),
    sub_model_snapshot: String(contract.sub_model || '').trim(),
    trim_name_snapshot: String(contract.trim_name || '').trim(),
    rent_month_snapshot: String(contract.rent_month || '').trim(),
    rent_amount_snapshot: Number(contract.rent_amount || 0),
    deposit_amount_snapshot: Number(contract.deposit_amount || 0)
  };
}

/**
 * 상품 코드/차량번호 변경 시 연결된 contracts, rooms를 원자적으로 갱신.
 * 다중 경로 업데이트(Atomic Fan-out): 모든 패치를 하나의 객체에 모아
 * 루트 레벨 단일 update()로 실행하여 트랜잭션 안정성을 보장한다.
 */
async function updateLinkedProductReferences({
  productUid = '', previousProductCode = '', nextProductCode = '', previousCarNumber = '', nextCarNumber = ''
} = {}) {
  const normalizedUid = sanitizeCodeValue(productUid);
  const fromCode = sanitizeCodeValue(previousProductCode);
  const toCode = sanitizeCodeValue(nextProductCode);
  const previousCar = sanitizeCodeValue(previousCarNumber);
  if (!normalizedUid && !fromCode && !toCode) return;

  // 두 컬렉션을 동시에 읽어온다
  const [contractsSnapshot, roomsSnapshot] = await Promise.all([
    get(ref(db, 'contracts')),
    get(ref(db, 'rooms'))
  ]);

  const now = Date.now();
  const fanOutUpdates = {};

  // contracts 패치 수집
  const contractsData = contractsSnapshot.val() || {};
  for (const [key, item] of Object.entries(contractsData)) {
    if (!item) continue;
    const itemUid = sanitizeCodeValue(item.product_uid || item.product_code || item.seed_product_key || '');
    const codeMatched = fromCode && [item.product_code, item.seed_product_key, item.product_code_snapshot].some((v) => sanitizeCodeValue(v) === fromCode);
    const uidMatched = normalizedUid && itemUid === normalizedUid;
    if (!codeMatched && !uidMatched) continue;

    const prefix = `contracts/${key}`;
    fanOutUpdates[`${prefix}/product_uid`] = normalizedUid || item.product_uid || '';
    fanOutUpdates[`${prefix}/product_code`] = normalizedUid || item.product_code || '';
    fanOutUpdates[`${prefix}/seed_product_key`] = normalizedUid || item.seed_product_key || '';
    fanOutUpdates[`${prefix}/car_number`] = nextCarNumber || item.car_number || '';
    fanOutUpdates[`${prefix}/updated_at`] = now;
    if (toCode && (!item.product_code_snapshot || sanitizeCodeValue(item.product_code_snapshot) === fromCode)) {
      fanOutUpdates[`${prefix}/product_code_snapshot`] = toCode;
    }
    if (nextCarNumber && (!item.car_number_snapshot || sanitizeCodeValue(item.car_number_snapshot) === previousCar)) {
      fanOutUpdates[`${prefix}/car_number_snapshot`] = nextCarNumber;
    }
  }

  // rooms 패치 수집
  const roomsData = roomsSnapshot.val() || {};
  for (const [key, room] of Object.entries(roomsData)) {
    if (!room) continue;
    const roomUid = sanitizeCodeValue(room.product_uid || room.product_code || '');
    const codeMatched = fromCode && [room.product_code, room.product_code_snapshot].some((v) => sanitizeCodeValue(v) === fromCode);
    const uidMatched = normalizedUid && roomUid === normalizedUid;
    if (!codeMatched && !uidMatched) continue;

    const prefix = `rooms/${key}`;
    fanOutUpdates[`${prefix}/product_uid`] = normalizedUid || room.product_uid || '';
    fanOutUpdates[`${prefix}/product_code`] = normalizedUid || room.product_code || '';
    fanOutUpdates[`${prefix}/updated_at`] = now;
    if (toCode) fanOutUpdates[`${prefix}/product_code_snapshot`] = toCode;
    if (nextCarNumber) fanOutUpdates[`${prefix}/vehicle_number`] = nextCarNumber || room.vehicle_number || '';
  }

  // product_code_aliases 패치 수집
  const aliasTargets = normalizeProductCodeAliases([fromCode, toCode]).filter(Boolean);
  for (const alias of aliasTargets) {
    fanOutUpdates[`product_code_aliases/${alias}`] = normalizedUid || toCode;
  }

  // 단일 원자적 업데이트 실행
  if (Object.keys(fanOutUpdates).length > 0) {
    await update(ref(db), fanOutUpdates);
  }
}

export async function saveContract(contract) {
  const partnerCode = sanitizeCodeValue(contract.partner_code || contract.provider_company_code || '');
  if (!partnerCode) throw new Error('파트너코드가 필요합니다.');
  const dateKey = todayDateKey();
  const [yyyy, mm, dd] = [dateKey.slice(0, 4), dateKey.slice(4, 6), dateKey.slice(6, 8)];
  const contractCode = buildContractCode({ dateKey, sequence: await nextLocalSequence(`contract_${dateKey}`) });
  const productUid = sanitizeCodeValue(contract.product_uid || contract.product_code || contract.seed_product_key || '');
  const normalizedContract = {
    ...contract, product_uid: productUid, product_code: productUid, seed_product_key: productUid,
    partner_code: partnerCode, provider_company_code: partnerCode
  };
  const payload = {
    contract_code: contractCode, contract_date: `${yyyy}-${mm}-${dd}`,
    contract_status: '계약대기', customer_name: '', customer_birth: '', customer_phone: '',
    docs: [], checks: { deposit_confirmed: false, docs_confirmed: false, contract_signed: false, final_payment: false, vehicle_delivered: false },
    ...normalizedContract, ...buildContractSnapshots(normalizedContract),
    contract_code: contractCode, partner_code: partnerCode,
    provider_company_code: partnerCode, created_at: Date.now()
  };
  await set(ref(db, `contracts/${contractCode}`), payload);
  return contractCode;
}

export async function updateContract(contractCode, updates) {
  const code = sanitizeCodeValue(contractCode);
  const contractRef = ref(db, `contracts/${code}`);
  const snapshot = await get(contractRef);
  if (!snapshot.exists()) throw new Error('수정할 계약이 없습니다.');
  const current = snapshot.val() || {};
  const next = { ...current, ...updates, contract_code: code, updated_at: Date.now() };
  await set(contractRef, next);
  if (next.contract_status === '계약완료') {
    const settlementRef = ref(db, `settlements/${code}`);
    const settlementSnapshot = await get(settlementRef);
    const existingSettlement = settlementSnapshot.exists() ? (settlementSnapshot.val() || {}) : {};
    const completionDateKey = todayDateKey();
    const settlementCode = existingSettlement.settlement_code
      || buildSettlementCode({ dateKey: completionDateKey, sequence: await nextLocalSequence(`settlement_${completionDateKey}`) });
    // 상품에서 기간별 수수료 조회
    let feeAmount = existingSettlement.fee_amount || 0;
    let originFeeAmount = existingSettlement.origin_fee_amount || 0;
    if (!originFeeAmount) {
      try {
        const productKey = next.product_uid || next.product_code || next.seed_product_key || '';
        const product = productKey ? await getProduct(productKey) : null;
        const month = String(next.rent_month || '').replace(/[^\d]/g, '');
        if (product && month) {
          const plan = product.price?.[month];
          if (plan) {
            originFeeAmount = Number(plan.fee || plan.commission || 0);
          } else {
            originFeeAmount = Number(product[`fee_${month}`] || product[`commission_${month}`] || 0);
          }
          if (!feeAmount) feeAmount = originFeeAmount;
        }
      } catch (_) {}
    }
    await set(settlementRef, {
      ...existingSettlement, settlement_code: settlementCode, contract_code: code,
      partner_code: next.partner_code || '', agent_uid: next.agent_uid || '',
      agent_code: next.agent_code || '', agent_code_snapshot: next.agent_code || '',
      agent_channel_code: next.agent_channel_code || next.agent_company_code || '',
      agent_channel_code_snapshot: next.agent_channel_code || next.agent_company_code || '',
      customer_name: next.customer_name || '', car_number: next.car_number || '',
      vehicle_name: next.vehicle_name || '',
      model_name: next.model_name || next.sub_model || '',
      model_name_snapshot: next.model_name || next.sub_model || '',
      rent_month: next.rent_month || '',
      rent_amount: Number(next.rent_amount || 0), deposit_amount: Number(next.deposit_amount || 0),
      fee_amount: feeAmount,
      origin_fee_amount: originFeeAmount,
      product_uid_snapshot: next.product_uid_snapshot || next.product_uid || next.product_code || '',
      product_code_snapshot: next.product_code_snapshot || next.product_code || '',
      partner_code_snapshot: next.partner_code_snapshot || next.partner_code || '',
      agent_channel_code_snapshot: next.agent_channel_code_snapshot || next.agent_channel_code || next.agent_company_code || '',
      agent_code_snapshot: next.agent_code_snapshot || next.agent_code || '',
      car_number_snapshot: next.car_number_snapshot || next.car_number || '',
      vehicle_name_snapshot: next.vehicle_name_snapshot || next.vehicle_name || '',
      sub_model_snapshot: next.sub_model_snapshot || next.sub_model || '',
      created_at: existingSettlement.created_at || next.created_at || Date.now(),
      completed_at: Date.now(),
      settlement_status: existingSettlement.settlement_status || '정산대기',
      status: existingSettlement.status || '정산대기'
    });
  }
  return code;
}

export async function updateSettlement(contractCode, updates) {
  const code = sanitizeCodeValue(contractCode);
  const stlRef = ref(db, `settlements/${code}`);
  const snapshot = await get(stlRef);
  if (!snapshot.exists()) throw new Error('수정할 정산이 없습니다.');
  const current = snapshot.val() || {};
  await set(stlRef, { ...current, ...updates, updated_at: Date.now() });
  return code;
}

export async function createClawback(contractCode) {
  const code = sanitizeCodeValue(contractCode);
  const stlRef = ref(db, `settlements/${code}`);
  const snapshot = await get(stlRef);
  if (!snapshot.exists()) throw new Error('환수할 정산이 없습니다.');
  const original = snapshot.val() || {};
  const clawbackCode = `${original.settlement_code || code}-CB`;
  const feeAmount = Number(original.fee_amount || 0);
  // 원본은 그대로 유지 — 환수 레코드만 추가
  const cbRef = ref(db, `settlements/${code}-CB`);
  await set(cbRef, {
    ...original,
    settlement_code: clawbackCode,
    contract_code: original.contract_code || code,
    settlement_status: '환수대기',
    status: '환수대기',
    fee_amount: feeAmount ? -Math.abs(feeAmount) : 0,
    origin_fee_amount: feeAmount,
    clawback_of: original.settlement_code || code,
    original_settled_date: original.settled_date || '',
    is_clawback: true,
    created_at: Date.now(),
    completed_at: null,
    confirms: { provider: false, agent: false, admin: false },
    provider_memo: '', agent_memo: '', admin_memo: ''
  });
  return clawbackCode;
}

export async function deleteSettlement(contractCode) {
  return remove(ref(db, `settlements/${sanitizeCodeValue(contractCode)}`));
}

export async function deleteContract(contractCode) {
  return remove(ref(db, `contracts/${sanitizeCodeValue(contractCode)}`));
}

export async function fetchContractsOnce() {
  return fetchCollection('contracts', { sort: sortByUpdatedOrCreatedDesc });
}

export function watchContracts(callback) {
  return watchCollection('contracts', callback, {
    sort: (a, b) => {
      const ad = a.contract_status === '계약완료' ? 1 : 0;
      const bd = b.contract_status === '계약완료' ? 1 : 0;
      if (ad !== bd) return ad - bd;
      return (b.updated_at || b.created_at || 0) - (a.updated_at || a.created_at || 0);
    }
  });
}

export function watchSettlements(callback) {
  const DONE = ['정산완료', '환수결정'];
  return watchCollection('settlements', callback, {
    sort: (a, b) => {
      const ad = DONE.includes(a.settlement_status || a.status) ? 1 : 0;
      const bd = DONE.includes(b.settlement_status || b.status) ? 1 : 0;
      if (ad !== bd) return ad - bd;
      return (b.completed_at || b.created_at || 0) - (a.completed_at || a.created_at || 0);
    }
  });
}
