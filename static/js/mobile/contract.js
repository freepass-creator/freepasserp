/**
 * mobile/contract.js — 모바일 계약 목록
 */
import { requireAuth } from '../core/auth-guard.js';
import { watchContracts, watchProducts } from '../firebase/firebase-db.js';
import { escapeHtml } from '../core/management-format.js';
import { toggleFilter, applyFilter } from './filter-sheet.js';

// 처리상태 도출 — 데스크탑과 동일 로직
const CHECK_FIELD_KEYS = ['deposit_confirmed', 'docs_confirmed', 'approval_confirmed', 'contract_confirmed', 'balance_confirmed', 'delivery_confirmed'];
function uncheckedCount(c) {
  const checks = c?.checks || {};
  return CHECK_FIELD_KEYS.filter(k => !checks[k]).length;
}
function getProcessStatus(c) {
  const checks = c?.checks || {};
  const allChecked = CHECK_FIELD_KEYS.every(k => !!checks[k]);
  const hasCustomer = !!(c?.customer_name && c?.customer_birth && c?.customer_phone);
  const hasPricing = !!(c?.rent_month && Number(c?.rent_amount || 0) > 0 && Number(c?.deposit_amount || 0) > 0);
  return (allChecked && hasCustomer && hasPricing) ? '처리완료' : '미완료';
}

const $list = document.getElementById('m-contract-list');
const $search = document.getElementById('m-contract-search');
const $filterBtn = document.getElementById('m-contract-filter-btn');

// ⚡ sessionStorage HTML 캐시 — 재방문 0ms 복원
const SS_HTML_KEY = 'fp_cl_html';
(function restoreLastHtml() {
  try {
    const cached = sessionStorage.getItem(SS_HTML_KEY);
    if (cached && $list) $list.innerHTML = cached;
  } catch {}
})();
window.addEventListener('pagehide', () => {
  try { if ($list) sessionStorage.setItem(SS_HTML_KEY, $list.innerHTML); } catch {}
});

const RENT_BUCKETS = [
  { value: '50만원 이하', label: '50만원 이하', range: [0,       500000] },
  { value: '50만원~',    label: '50만원~',    range: [500000,  600000] },
  { value: '60만원~',    label: '60만원~',    range: [600000,  700000] },
  { value: '70만원~',    label: '70만원~',    range: [700000,  800000] },
  { value: '80만원~',    label: '80만원~',    range: [800000,  900000] },
  { value: '90만원~',    label: '90만원~',    range: [900000,  1000000] },
  { value: '100만원~',   label: '100만원~',   range: [1000000, 1500000] },
  { value: '150만원~',   label: '150만원~',   range: [1500000, null] },
];
const DEP_BUCKETS = [
  { value: '100만원 이하', label: '100만원 이하', range: [0,        1000000] },
  { value: '100만원~',    label: '100만원~',    range: [1000000,  2000000] },
  { value: '200만원~',    label: '200만원~',    range: [2000000,  3000000] },
  { value: '300만원~',    label: '300만원~',    range: [3000000,  5000000] },
  { value: '500만원~',    label: '500만원~',    range: [5000000,  null] },
];
const DATE_OPTIONS = [
  { value: '1w',   label: '최근 1주',  days: 7 },
  { value: '1m',   label: '최근 1개월', days: 30 },
  { value: '3m',   label: '최근 3개월', days: 90 },
  { value: '6m',   label: '최근 6개월', days: 180 },
  { value: 'year', label: '올해',      ytd: true },
];

const FILTER_GROUPS = [
  { key: 'contract_status', title: '계약상태',  icon: 'list',     type: 'check', field: 'contract_status' },
  { key: 'process_status',  title: '처리상태',  icon: 'check',    type: 'check', field: '_process_status' },
  { key: 'partner_code',    title: '공급사',    icon: 'building', type: 'check', fields: ['partner_code', 'provider_company_code'] },
  { key: 'agent_channel',   title: '영업채널',  icon: 'shape',    type: 'check', fields: ['agent_channel_code', 'agent_company_code'] },
  { key: 'agent_code',      title: '영업자',    icon: 'user',     type: 'check', field: 'agent_code' },
  { key: 'date',            title: '계약월',    icon: 'calendar', type: 'dateRange', field: 'created_at', options: DATE_OPTIONS },
  { key: 'rent_month',      title: '약정기간',  icon: 'calendar', type: 'check', field: 'rent_month' },
  { key: 'rent',            title: '월 대여료', icon: 'money',    type: 'range', field: 'rent_amount', buckets: RENT_BUCKETS },
  { key: 'deposit',         title: '보증금',    icon: 'deposit',  type: 'range', field: 'deposit_amount', buckets: DEP_BUCKETS },
  { key: 'maker',           title: '제조사',    icon: 'car',      type: 'check', field: '_maker' },
  { key: 'model',           title: '모델',      icon: 'layers',   type: 'check', field: '_model' },
  { key: 'sub_model',       title: '세부모델',  icon: 'rows',     type: 'check', field: '_sub_model' },
];

let allContracts = [];
let productMap = new Map();
let searchQuery = '';
let activeFilters = { selected: {}, searchText: {} };
let currentRole = '';
let currentUser = null;
let currentProfile = null;

// 역할별 가시성 — 자기 것만
function isVisibleForRole(c) {
  if (!currentRole || currentRole === 'admin') return true;
  if (currentRole === 'agent') {
    return c.agent_uid === currentUser?.uid || c.agent_code === currentProfile?.user_code;
  }
  if (currentRole === 'provider') {
    const myCode = currentProfile?.company_code || '';
    return (c.partner_code || '') === myCode || (c.provider_company_code || '') === myCode;
  }
  return false;
}

function visibleGroupsForRole(role) {
  return FILTER_GROUPS.filter(g => {
    if (role === 'provider' && g.key === 'partner_code') return false;
    if (role === 'agent'    && g.key === 'agent_code')   return false;
    if (g.key === 'agent_channel' && role !== 'admin')   return false;
    return true;
  });
}

function enrichContract(c) {
  const p = productMap.get(c.product_uid) || productMap.get(c.product_code) || null;
  return {
    ...c,
    _process_status: getProcessStatus(c),
    _maker:    p?.maker || '',
    _model:    p?.model_name || '',
    _sub_model: p?.sub_model || c.sub_model || '',
  };
}

function fmtDate(ts) {
  const n = Number(ts || 0);
  if (!n) return '';
  const d = new Date(n);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}

function statusTone(s) {
  const v = String(s || '').trim();
  if (/완료/.test(v)) return 'success';
  if (/취소|반려/.test(v)) return 'danger';
  if (/진행/.test(v)) return 'info';
  if (/대기|신규/.test(v)) return 'warn';
  return 'neutral';
}

function fmtMoney(v) {
  const n = Number(v || 0);
  if (!n) return '';
  if (n >= 10000) return `${Math.round(n / 10000)}만원`;
  return `${n.toLocaleString('ko-KR')}원`;
}

function processTone(s) {
  return /처리완료/.test(s) ? 'success' : 'warn';
}

function render(contracts) {
  if (!$list) return;
  if (!contracts || !contracts.length) {
    $list.innerHTML = '<div class="m-list-empty">계약 내역이 없습니다</div>';
    return;
  }
  $list.innerHTML = contracts.map(c => {
    const status   = c.contract_status || '대기';
    const process  = c._process_status || getProcessStatus(c);
    const partner  = c.partner_code || c.provider_company_code || '';
    const agent    = c.agent_code || '';
    const carNo    = c.car_number || c.vehicle_number || '';
    const subModel = c._sub_model || c.sub_model || c.model_name || c.vehicle_name || '';
    const customer = c.customer_name || '고객 미입력';
    const month    = c.rent_month ? `${c.rent_month}개월` : '';
    const rent     = c.rent_amount ? fmtMoney(c.rent_amount) : '';
    const deposit  = c.deposit_amount ? `보증금 ${fmtMoney(c.deposit_amount)}` : '';
    const date     = fmtDate(c.updated_at || c.created_at);

    const idLine    = [partner, agent, carNo, subModel].filter(Boolean).join(' · ');
    const detailLine = [customer, month, rent, deposit].filter(Boolean).join(' · ');
    const isPending = process !== '처리완료';

    return `<div class="m-list-row" data-id="${escapeHtml(c.contract_code || '')}">
      <div class="m-list-row__top">
        <div class="m-list-row__badges">
          <span class="m-list-badge m-list-badge--${statusTone(status)}">${escapeHtml(status)}</span>
          <span class="m-list-badge m-list-badge--${processTone(process)}">${escapeHtml(process)}</span>
        </div>
        ${date ? `<span class="m-list-row__date">${date}</span>` : ''}
      </div>
      <div class="m-list-row__title">${escapeHtml(idLine || '-')}</div>
      <div class="m-list-row__sub">
        <span class="m-list-row__msg">${escapeHtml(detailLine)}</span>
        ${(() => {
          const remain = uncheckedCount(c);
          return remain > 0
            ? `<span class="m-list-row__pending"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>미입력 ${remain}</span>`
            : '';
        })()}
      </div>
    </div>`;
  }).join('');
}

let _applyRaf = 0;
function applyAll() {
  if (_applyRaf) cancelAnimationFrame(_applyRaf);
  _applyRaf = requestAnimationFrame(() => {
    _applyRaf = 0;
    // 역할별 자기 것만 필터
    const visible = allContracts.filter(isVisibleForRole);
    const enriched = visible.map(enrichContract);
    let result = applyFilter(enriched, activeFilters, FILTER_GROUPS);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(c => {
        const fields = [c.customer_name, c.vehicle_number, c.car_number, c.contract_code, c.model_name, c.product_model];
        return fields.some(f => String(f || '').toLowerCase().includes(q));
      });
    }
    render(result);
  });
}

let _searchTimer;
$search?.addEventListener('input', () => {
  searchQuery = $search.value;
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(applyAll, 200);
});

$filterBtn?.addEventListener('click', () => {
  toggleFilter({
    groups: visibleGroupsForRole(currentRole),
    items: allContracts.map(enrichContract),
    filterState: activeFilters,
    headerLabel: '계약건수',
    unit: '건',
    onApply: (fs) => { activeFilters = fs; applyAll(); }
  });
});

$list?.addEventListener('click', (e) => {
  const row = e.target.closest('.m-list-row[data-id]');
  if (!row) return;
  const id = row.dataset.id;
  if (id) location.href = `/m/contract/${encodeURIComponent(id)}`;
});

function _hydrateProductMap(products) {
  const map = new Map();
  (products || []).forEach(p => {
    if (p?.product_uid) map.set(p.product_uid, p);
    if (p?.product_code) map.set(p.product_code, p);
  });
  return map;
}

(async () => {
  try {
    // ⚡ 메모리 캐시 즉시 사용
    const cached = window.__appData || {};
    if (Array.isArray(cached.contracts) && cached.contracts.length) {
      allContracts = cached.contracts;
    }
    if (Array.isArray(cached.products) && cached.products.length) {
      productMap = _hydrateProductMap(cached.products);
    }

    const { user, profile } = await requireAuth();
    currentUser = user;
    currentProfile = profile;
    currentRole = profile?.role || '';
    if (allContracts.length) applyAll();

    watchContracts((contracts) => {
      allContracts = contracts || [];
      applyAll();
    });
    watchProducts((products) => {
      productMap = _hydrateProductMap(products);
      applyAll();
    });

    window.addEventListener('fp:data', (e) => {
      const t = e.detail?.type;
      if (t === 'contracts' && window.__appData.contracts) {
        allContracts = window.__appData.contracts;
        applyAll();
      } else if (t === 'products' && window.__appData.products) {
        productMap = _hydrateProductMap(window.__appData.products);
        applyAll();
      }
    });
  } catch (e) {
    console.error('[mobile/contract] init failed', e);
    if ($list) $list.innerHTML = '<div class="m-list-empty">계약 목록을 불러오지 못했습니다</div>';
  }
})();
