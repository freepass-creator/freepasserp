/**
 * mobile/contract-form.js — 모바일 계약 상세/수정
 */
import { requireAuth } from '../core/auth-guard.js';
import { watchContracts, updateContract, deleteContract, watchProducts } from '../firebase/firebase-db.js';
import { escapeHtml } from '../core/management-format.js';
import { showToast, showConfirm } from '../core/toast.js';
import { maskName, maskPhone, maskBirth, decryptField, requestDecryptPassword } from '../core/crypto.js';

const $cf       = document.getElementById('m-cf');
const $back     = document.getElementById('m-cf-back');
const $edit     = document.getElementById('m-cf-edit');
const $save     = document.getElementById('m-cf-save');
const $delete   = document.getElementById('m-cf-delete');

let isEditMode = false;

const pathParts = location.pathname.split('/').filter(Boolean);
const contractCode = decodeURIComponent(pathParts[pathParts.length - 1] || '');

let currentContract = null;
let currentProfile = null;
let productMap = new Map();

const CHECK_FIELDS = [
  { key: 'deposit_confirmed',  label: '계약금 확인' },
  { key: 'docs_confirmed',     label: '서류 확인' },
  { key: 'approval_confirmed', label: '승인 확인' },
  { key: 'contract_confirmed', label: '계약서 확인' },
  { key: 'balance_confirmed',  label: '잔금 확인' },
  { key: 'delivery_confirmed', label: '인도 확인' },
];

const STATUS_OPTIONS = ['계약대기', '계약요청', '계약발송', '계약완료', '계약철회'];

const SVG = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const ICO = {
  check:  SVG('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'),
  doc:    SVG('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 12h4"/><path d="M10 16h4"/>'),
  car:    SVG('<path d="M21 8 17.65 2.65A2 2 0 0 0 15.94 2H8.06a2 2 0 0 0-1.71 1.65L3 8"/><rect width="18" height="13" x="3" y="8" rx="2"/>'),
  user:   SVG('<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>'),
};

function fmtMoney(v) {
  const n = Number(v || 0);
  return n ? n.toLocaleString('ko-KR') : '';
}

function render(c) {
  if (!$cf || !c) return;
  const checks = c.checks || {};

  $cf.innerHTML = `
    <!-- 계약 체크 -->
    <section class="m-cf-group">
      <div class="m-cf-group__head">
        <span class="m-cf-group__icon">${ICO.check}</span>
        <span class="m-cf-group__title">계약 진행</span>
      </div>
      <div class="m-cf-group__body">
        <div class="m-cf-checks">
          ${CHECK_FIELDS.map(f => `<label class="m-cf-check${checks[f.key] ? ' is-checked' : ''}">
            <input type="checkbox" data-check="${f.key}"${checks[f.key] ? ' checked' : ''}>
            <span>${escapeHtml(f.label)}</span>
          </label>`).join('')}
        </div>
      </div>
    </section>

    <!-- 기본 정보 -->
    <section class="m-cf-group">
      <div class="m-cf-group__head">
        <span class="m-cf-group__icon">${ICO.doc}</span>
        <span class="m-cf-group__title">기본 정보</span>
      </div>
      <div class="m-cf-group__body">
        <div class="m-cf-fields">
          <div class="m-cf-field">
            <span class="m-cf-field__label">계약상태</span>
            <select class="m-cf-field__select" data-field="contract_status">
              ${STATUS_OPTIONS.map(s => `<option value="${s}"${(c.contract_status || '계약대기') === s ? ' selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="m-cf-field m-cf-field--row">
            <span class="m-cf-field__label">계약코드</span>
            <input class="m-cf-field__input" value="${escapeHtml(c.contract_code || '')}" readonly>
          </div>
          <div class="m-cf-field m-cf-field--row">
            <span class="m-cf-field__label">공급사코드</span>
            <input class="m-cf-field__input" value="${escapeHtml(c.partner_code || c.provider_company_code || '')}" readonly>
          </div>
          <div class="m-cf-field m-cf-field--row">
            <span class="m-cf-field__label">영업채널코드</span>
            <input class="m-cf-field__input" value="${escapeHtml(c.agent_code || '')}" readonly>
          </div>
        </div>
      </div>
    </section>

    <!-- 차량 / 대여 -->
    <section class="m-cf-group">
      <div class="m-cf-group__head">
        <span class="m-cf-group__icon">${ICO.car}</span>
        <span class="m-cf-group__title">차량 / 대여</span>
      </div>
      <div class="m-cf-group__body">
        <div class="m-cf-fields">
          <div class="m-cf-field m-cf-field--row">
            <span class="m-cf-field__label">차량번호</span>
            <input class="m-cf-field__input" value="${escapeHtml(c.car_number || '')}" readonly>
          </div>
          <div class="m-cf-field m-cf-field--row">
            <span class="m-cf-field__label">세부모델</span>
            <input class="m-cf-field__input" value="${escapeHtml((() => {
              const p = productMap.get(c.product_uid) || productMap.get(c.product_code);
              return p?.sub_model || c.sub_model || '';
            })())}" readonly>
          </div>
          <div class="m-cf-field m-cf-field--row">
            <span class="m-cf-field__label">대여기간</span>
            <input class="m-cf-field__input" type="text" inputmode="numeric" value="${escapeHtml(c.rent_month || '')}" data-field="rent_month" placeholder="36">
          </div>
          <div class="m-cf-field m-cf-field--row">
            <span class="m-cf-field__label">월 대여료</span>
            <input class="m-cf-field__input" type="text" inputmode="numeric" value="${fmtMoney(c.rent_amount)}" data-field="rent_amount" placeholder="자동반영">
          </div>
          <div class="m-cf-field m-cf-field--row">
            <span class="m-cf-field__label">보증금</span>
            <input class="m-cf-field__input" type="text" inputmode="numeric" value="${fmtMoney(c.deposit_amount)}" data-field="deposit_amount" placeholder="자동반영">
          </div>
        </div>
      </div>
    </section>

    <!-- 고객 정보 -->
    <section class="m-cf-group">
      <div class="m-cf-group__head">
        <span class="m-cf-group__icon">${ICO.user}</span>
        <span class="m-cf-group__title">고객 정보</span>
      </div>
      <div class="m-cf-group__body">
        <div class="m-cf-fields">
          <div class="m-cf-field m-cf-field--row">
            <span class="m-cf-field__label">고객명</span>
            <input class="m-cf-field__input" value="${escapeHtml(isEditMode ? (c.customer_name || '') : maskName(c.customer_name || ''))}" data-field="customer_name" placeholder="이름" ${isEditMode ? '' : 'readonly'}>
          </div>
          <div class="m-cf-field m-cf-field--row">
            <span class="m-cf-field__label">생년월일</span>
            <input class="m-cf-field__input" inputmode="numeric" value="${escapeHtml(isEditMode ? (c.customer_birth || '') : maskBirth(c.customer_birth || ''))}" data-field="customer_birth" placeholder="예: 900101" ${isEditMode ? '' : 'readonly'}>
          </div>
          <div class="m-cf-field m-cf-field--row">
            <span class="m-cf-field__label">연락처</span>
            <input class="m-cf-field__input" inputmode="tel" value="${escapeHtml(isEditMode ? (c.customer_phone || '') : maskPhone(c.customer_phone || ''))}" data-field="customer_phone" placeholder="010-0000-0000" ${isEditMode ? '' : 'readonly'}>
          </div>
          ${!isEditMode ? `<button class="m-cf-reveal" id="m-cf-reveal" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="16" r="1"/><rect x="3" y="10" width="18" height="12" rx="2"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/></svg>
            개인정보 원본 열람
          </button>` : ''}
        </div>
      </div>
    </section>
  `;

  // 모드 클래스
  $cf.classList.toggle('is-readonly', !isEditMode);

  // 개인정보 열람
  $cf.querySelector('#m-cf-reveal')?.addEventListener('click', revealPII);

  // 체크박스 이벤트
  $cf.querySelectorAll('[data-check]').forEach(cb => {
    cb.addEventListener('change', () => {
      cb.closest('.m-cf-check')?.classList.toggle('is-checked', cb.checked);
    });
  });
  // 숫자 필드 콤마 포맷
  $cf.querySelectorAll('input[data-field="rent_amount"], input[data-field="deposit_amount"]').forEach(input => {
    input.addEventListener('input', () => {
      const cur = input.selectionStart;
      const before = input.value;
      const num = String(input.value).replace(/[^\d]/g, '');
      input.value = num ? Number(num).toLocaleString('ko-KR') : '';
      const diff = input.value.length - before.length;
      input.setSelectionRange(cur + diff, cur + diff);
    });
  });
}

function collectFormData() {
  const data = {};
  const checks = {};
  $cf.querySelectorAll('[data-check]').forEach(cb => {
    checks[cb.dataset.check] = !!cb.checked;
  });
  data.checks = checks;
  $cf.querySelectorAll('[data-field]').forEach(el => {
    const key = el.dataset.field;
    let val = el.value;
    if (key === 'rent_amount' || key === 'deposit_amount') {
      val = String(val).replace(/[^\d]/g, '');
    }
    data[key] = val;
  });
  return data;
}

async function revealPII() {
  const c = currentContract;
  if (!c) return;
  const secure = c._secure;
  if (!secure) { showToast('암호화된 개인정보가 없습니다.', 'error'); return; }
  try {
    const pw = await requestDecryptPassword();
    if (!pw) return;
    const name  = await decryptField(secure.customer_name, pw);
    if (name === null) { showToast('비밀번호가 올바르지 않습니다.', 'error'); return; }
    const birth = await decryptField(secure.customer_birth, pw);
    const phone = await decryptField(secure.customer_phone, pw);
    $cf.querySelector('[data-field="customer_name"]').value  = name  || '';
    $cf.querySelector('[data-field="customer_birth"]').value = birth || '';
    $cf.querySelector('[data-field="customer_phone"]').value = phone || '';
    showToast('30초 후 자동 마스킹', 'info');
    setTimeout(() => { if (currentContract) render(currentContract); }, 30000);
  } catch (e) {
    console.error(e);
    showToast('열람 실패', 'error');
  }
}

$back?.addEventListener('click', () => {
  if (history.length > 1) history.back();
  else location.href = '/m/contract';
});

$edit?.addEventListener('click', () => {
  isEditMode = true;
  $edit.hidden = true;
  $save.hidden = false;
  if (currentContract) render(currentContract);
});

$save?.addEventListener('click', async () => {
  if (!currentContract) return;
  $save.disabled = true;
  try {
    const updates = collectFormData();
    await updateContract(currentContract.contract_code, updates);
    showToast('저장 완료', 'success');
    isEditMode = false;
    $save.hidden = true;
    $edit.hidden = false;
  } catch (e) {
    console.error(e);
    showToast('저장 실패', 'error');
  } finally {
    $save.disabled = false;
  }
});

$delete?.addEventListener('click', async () => {
  if (!currentContract) return;
  const ok = await showConfirm('이 계약을 삭제하시겠습니까?');
  if (!ok) return;
  try {
    await deleteContract(currentContract.contract_code);
    showToast('삭제됨', 'success');
    location.href = '/m/contract';
  } catch (e) {
    console.error(e);
    showToast('삭제 실패', 'error');
  }
});

(async () => {
  try {
    const auth = await requireAuth();
    currentProfile = auth.profile;
    const role = currentProfile?.role || '';
    const canDelete = role === 'provider' || role === 'admin';
    if ($delete) $delete.hidden = !canDelete;

    watchContracts((contracts) => {
      const found = (contracts || []).find(c => c.contract_code === contractCode);
      if (found) {
        currentContract = found;
        render(found);
      }
    });
    watchProducts((products) => {
      const map = new Map();
      (products || []).forEach(p => {
        if (p?.product_uid) map.set(p.product_uid, p);
        if (p?.product_code) map.set(p.product_code, p);
      });
      productMap = map;
      if (currentContract) render(currentContract);
    });
  } catch (e) {
    console.error('[mobile/contract-form] init failed', e);
    if ($cf) $cf.innerHTML = '<div class="m-cf__loading">계약을 불러오지 못했습니다</div>';
  }
})();
