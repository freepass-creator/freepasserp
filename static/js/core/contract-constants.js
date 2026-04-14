/**
 * contract-constants.js
 * 계약 진행상황 체크 필드 — 단일 소스 (모든 페이지에서 import)
 */

export const AGENT_CHECK_KEYS = ['docs_attached', 'approval_requested', 'contract_proceed'];
export const AGENT_CHECK_LABELS = { docs_attached: '서류첨부', approval_requested: '승인요청', contract_proceed: '계약진행' };

export const PROVIDER_CHECK_KEYS = ['progress_approved', 'deposit_confirmed', 'contract_written', 'balance_confirmed', 'delivery_confirmed'];
export const PROVIDER_CHECK_LABELS = { progress_approved: '진행승인', deposit_confirmed: '계약금확인', contract_written: '계약서작성', balance_confirmed: '잔금확인', delivery_confirmed: '인도확인' };

export const CHECK_FIELD_KEYS = [...AGENT_CHECK_KEYS, ...PROVIDER_CHECK_KEYS];
export const CHECK_FIELD_LABELS = { ...AGENT_CHECK_LABELS, ...PROVIDER_CHECK_LABELS };

/** 모바일용 — [{key, label}] 형식 */
export const AGENT_CHECK_FIELDS = AGENT_CHECK_KEYS.map(key => ({ key, label: AGENT_CHECK_LABELS[key] }));
export const PROVIDER_CHECK_FIELDS = PROVIDER_CHECK_KEYS.map(key => ({ key, label: PROVIDER_CHECK_LABELS[key] }));
export const CHECK_FIELDS = [...AGENT_CHECK_FIELDS, ...PROVIDER_CHECK_FIELDS];

/** 빈 checks 객체 생성 */
export function createEmptyChecks() {
  return Object.fromEntries(CHECK_FIELD_KEYS.map(k => [k, false]));
}
