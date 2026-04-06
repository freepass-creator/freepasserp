/**
 * mobile/contract.js — 모바일 전용 계약 목록
 * 웹 contract-manage.js와 완전 분리. Firebase 직접 조회. 읽기 전용.
 */
import { requireAuth } from '../core/auth-guard.js';
import { watchContracts, watchProducts } from '../firebase/firebase-db.js';
import { normalizeProduct } from '../shared/product-list-detail-view.js';
import { escapeHtml } from '../core/management-format.js';

let currentProfile = null;
let allContracts = [];
let productMap = new Map();

const $list = document.getElementById('contract-m-list');

const STATUS_COLORS = {
  '계약대기': 'yellow', '계약요청': 'blue', '계약발송': 'blue',
  '계약완료': 'green', '계약철회': 'gray',
};
const STATUS_SHORT = {
  '계약대기': '대기', '계약요청': '요청', '계약발송': '발송',
  '계약완료': '완료', '계약철회': '철회',
};

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

function formatMoney(v) {
  const n = Number(v || 0);
  return n ? n.toLocaleString('ko-KR') + '원' : '-';
}

function formatMonth(v) { return v ? `${v}개월` : '-'; }
function safe(v) { return String(v || '').trim() || '-'; }

// ─── 목록 렌더링 ─────────────────────────────────────────────────────────────

function renderList(contracts) {
  if (!$list) return;
  if (!contracts.length) {
    $list.innerHTML = '<div class="m-list-empty">계약이 없습니다.</div>';
    return;
  }
  $list.innerHTML = contracts.map(c => {
    const status = c.contract_status || '계약대기';
    const color = STATUS_COLORS[status] || 'gray';
    const product = productMap.get(c.car_number) || productMap.get(c.product_uid) || productMap.get(c.product_code) || null;
    const carNo = c.car_number || product?.carNo || '';
    const vehicle = product?.subModel || String(c.sub_model || c.model_name || '').trim();
    const customer = c.customer_name || '';
    const rent = formatMoney(c.rent_amount);
    const date = formatDate(c.updated_at || c.created_at);
    const month = c.rent_month ? `${c.rent_month}개월` : '';

    const isDone = status === '계약완료';
    const cAvatarCls = isDone ? 'm-list-card__avatar--done' : 'm-list-card__avatar--pending';
    const cAvatarSvg = isDone
      ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m9 15 2 2 4-4"/></svg>'
      : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
    return `<div class="m-list-card" data-id="${escapeHtml(c.id || c.contract_code || '')}">
      <span class="m-list-card__avatar ${cAvatarCls}">${cAvatarSvg}</span>
      <div class="m-list-card__body">
        <div class="m-list-card__main">
          <span class="m-list-card__name">${escapeHtml([carNo, vehicle].filter(Boolean).join(' ') || '계약')}</span>
        </div>
        <div class="m-list-card__sub">
          <span class="m-list-card__info">${escapeHtml([c.partner_code || c.provider_company_code || '', c.agent_code || '', month, rent].filter(Boolean).join(' · '))}</span>
          <span class="m-list-card__date">${escapeHtml(date)}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ─── 필터 ────────────────────────────────────────────────────────────────────

function applyRoleFilter(contracts) {
  if (currentProfile.role === 'provider') {
    return contracts.filter(c => String(c.partner_code||c.provider_company_code||'') === String(currentProfile.company_code||''));
  }
  if (currentProfile.role === 'agent') {
    return contracts.filter(c => String(c.agent_code||'') === String(currentProfile.user_code||''));
  }
  return contracts;
}

// ─── 필터 사이드바 ───────────────────────────────────────────────────────────

function bindFilter() {
  const countEl = document.getElementById('contractMFilterCount');
  const search = document.getElementById('contractMFilterSearch');

  function updateCount() { if (countEl) countEl.textContent = allContracts.length; }

  // 필터 config (mobile-shell.js 공통 핸들러에서 사용)
  window._mobileFilterConfig = { sidebar: 'contractMFilterSidebar', overlay: 'contractMFilterOverlay', close: 'contractMFilterClose' };

  // 검색바 필터 버튼
  document.getElementById('contractMFilterBtn')?.addEventListener('click', () => {
    const sidebar = document.getElementById('contractMFilterSidebar');
    const overlay = document.getElementById('contractMFilterOverlay');
    if (sidebar) { sidebar.classList.toggle('is-open'); overlay?.classList.toggle('is-open'); }
  });

  // 검색바 입력 동기화
  const $topSearch = document.getElementById('contractMSearchInput');
  let timer;
  function onContractSearch(e) {
    if (search && search !== e.target) search.value = e.target.value;
    if ($topSearch && $topSearch !== e.target) $topSearch.value = e.target.value;
    clearTimeout(timer);
    const q = e.target.value.trim().toLowerCase();
    timer = setTimeout(() => {
      const filtered = q
        ? allContracts.filter(c => {
            const fields = [c.customer_name, c.car_number, c.vehicle_name, c.contract_code];
            return fields.some(f => String(f||'').toLowerCase().includes(q));
          })
        : allContracts;
      renderList(filtered);
    }, 150);
  }
  $topSearch?.addEventListener('input', onContractSearch);
  search?.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const q = search.value.trim().toLowerCase();
      const filtered = q
        ? allContracts.filter(c => {
            const fields = [c.customer_name, c.car_number, c.vehicle_name, c.contract_code];
            return fields.some(f => String(f||'').toLowerCase().includes(q));
          })
        : allContracts;
      renderList(filtered);
      if (countEl) countEl.textContent = filtered.length;
    }, 150);
  });

  return updateCount;
}

// ─── 초기화 ──────────────────────────────────────────────────────────────────

async function init() {
  const { user, profile } = await requireAuth({ roles: ['provider','agent','admin'] });
  currentProfile = profile;

  const updateCount = bindFilter();

  watchProducts((products) => {
    productMap = new Map();
    products.forEach(p => {
      const n = normalizeProduct(p);
      if (n.id) productMap.set(n.id, n);
      if (n.carNo) productMap.set(n.carNo, n);
      if (n.productCode) productMap.set(n.productCode, n);
    });
    if (allContracts.length) renderList(allContracts);
  });

  watchContracts((contracts) => {
    allContracts = applyRoleFilter(contracts);
    renderList(allContracts);
    updateCount();
  });

  // 카드 클릭 → 상세
  $list?.addEventListener('click', (e) => {
    const card = e.target.closest('.m-list-card[data-id]');
    if (card) openDetail(card.dataset.id);
  });

  // 핸드폰 뒤로가기 → 상세 닫기
  window.addEventListener('popstate', () => {
    const $detail = document.getElementById('contract-m-detail');
    if ($detail && !$detail.hidden) closeDetail();
  });
}

// ─── 상세 보기 ───────────────────────────────────────────────────────────────

function openDetail(id) {
  const c = allContracts.find(x => (x.id || x.contract_code) === id);
  if (!c) return;
  const $detail = document.getElementById('contract-m-detail');
  if (!$detail) return;

  const product = productMap.get(c.car_number) || productMap.get(c.product_uid) || productMap.get(c.product_code) || null;
  const subModel = product?.subModel || String(c.sub_model || c.model_name || '').trim();
  const status = c.contract_status || '계약대기';

  // 상단바 타이틀
  const backTitle = document.getElementById('m-back-title');
  if (backTitle) {
    const carNo = c.car_number || '';
    const model = subModel || '';
    backTitle.textContent = [carNo, model].filter(Boolean).join(' ') || c.contract_code || '';
  }

  const checkFields = [
    ['deposit_confirmed', '계약금'], ['docs_confirmed', '서류'],
    ['approval_confirmed', '승인'], ['contract_confirmed', '계약서'],
    ['balance_confirmed', '잔금'], ['delivery_confirmed', '인도'],
  ];
  const checksHtml = checkFields.map(([key, label]) =>
    `<label class="m-form-check"><input type="checkbox" data-field="${key}" ${c[key] ? 'checked' : ''}><span>${escapeHtml(label)}</span></label>`
  ).join('');

  const statusOptions = ['계약대기', '계약요청', '계약발송', '계약완료', '계약철회'].map(v =>
    `<option value="${v}"${v === status ? ' selected' : ''}>${v}</option>`
  ).join('');

  const monthOptions = ['', '1', '12', '24', '36', '48', '60'].map(v =>
    `<option value="${v}"${v === String(c.rent_month || '') ? ' selected' : ''}>${v ? v + '개월' : '선택'}</option>`
  ).join('');

  $detail.innerHTML = `
    <div class="m-form-card" data-contract-id="${escapeHtml(id)}">
      <div class="m-form-section">
        <div class="m-form-section-head"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>계약체크</div>
        <div class="m-form-checks">${checksHtml}</div>
      </div>

      <div class="m-form-section">
        <div class="m-form-section-head"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 12h4"/><path d="M10 16h4"/></svg>기본정보</div>
        <div class="m-form-fields">
          <label class="m-form-field"><span>계약상태</span><select data-field="contract_status">${statusOptions}</select></label>
          <label class="m-form-field"><span>계약코드</span><input value="${escapeHtml(c.contract_code || '')}" readonly></label>
          <label class="m-form-field"><span>공급사코드</span><input value="${escapeHtml(c.partner_code || c.provider_company_code || '')}" readonly></label>
          <label class="m-form-field"><span>영업채널코드</span><input value="${escapeHtml(c.agent_code || '')}" readonly></label>
        </div>
      </div>

      <div class="m-form-section">
        <div class="m-form-section-head"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18 10l-2.7-3.4A2 2 0 0 0 13.7 6H6.3a2 2 0 0 0-1.6.8L2 10l-1.5 1.1C.2 11.6 0 12.1 0 12.6V16c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>차량/대여</div>
        <div class="m-form-fields">
          <label class="m-form-field"><span>차량번호</span><input value="${escapeHtml(c.car_number || '')}" readonly></label>
          <label class="m-form-field"><span>세부모델</span><input value="${escapeHtml(subModel)}" readonly></label>
          <label class="m-form-field"><span>대여기간</span><select data-field="rent_month">${monthOptions}</select></label>
          <label class="m-form-field"><span>대여료</span><input data-field="rent_amount" inputmode="numeric" value="${c.rent_amount || ''}"></label>
          <label class="m-form-field"><span>보증금</span><input data-field="deposit_amount" inputmode="numeric" value="${c.deposit_amount || ''}"></label>
        </div>
      </div>

      <div class="m-form-section">
        <div class="m-form-section-head"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>고객정보</div>
        <div class="m-form-fields">
          <label class="m-form-field"><span>고객명</span><input data-field="customer_name" value="${escapeHtml(c.customer_name || '')}"></label>
          <label class="m-form-field"><span>생년월일</span><input data-field="customer_birth" value="${escapeHtml(c.customer_birth || '')}" placeholder="예: 900101"></label>
          <label class="m-form-field"><span>연락처</span><input data-field="customer_phone" value="${escapeHtml(c.customer_phone || '')}" placeholder="예: 010-0000-0000"></label>
        </div>
      </div>

      <div class="m-form-actions">
        <button type="button" class="m-form-btn m-form-btn--save" id="m-contract-save">저장</button>
      </div>
    </div>`;

  // 저장 버튼
  $detail.querySelector('#m-contract-save')?.addEventListener('click', async () => {
    const card = $detail.querySelector('.m-form-card');
    if (!card) return;
    const updates = {};
    card.querySelectorAll('[data-field]').forEach(el => {
      const key = el.dataset.field;
      if (el.type === 'checkbox') updates[key] = el.checked;
      else updates[key] = el.value;
    });
    try {
      const { update } = await import('../firebase/firebase-db.js').then(m => ({ update: m.guardedUpdate || m.updateContract }));
      // 직접 Firebase update
      const { ref, update: fbUpdate } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js');
      const { db } = await import('../firebase/firebase-config.js');
      const contractRef = ref(db, `contracts/${id}`);
      updates.updated_at = Date.now();
      await fbUpdate(contractRef, updates);
      closeDetail();
    } catch (err) {
      alert('저장 실패: ' + (err.message || ''));
    }
  });

  $detail.hidden = false;
  document.body.classList.add('detail-open');
  history.pushState({ contractDetail: true }, '');
}

function closeDetail() {
  const $detail = document.getElementById('contract-m-detail');
  if ($detail) $detail.hidden = true;
  document.body.classList.remove('detail-open');
}

export function onHide() {
  document.body.classList.remove('page-contract', 'detail-open');
  window._mobileFilterConfig = null;
}
export function onShow() {
  document.body.classList.add('page-contract');
}

init().catch(e => console.error('[mobile/contract]', e));
