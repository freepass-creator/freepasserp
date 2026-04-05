/**
 * mobile/contract.js — 모바일 전용 계약 목록
 * 웹 contract-manage.js와 완전 분리. Firebase 직접 조회. 읽기 전용.
 */
import { requireAuth } from '../core/auth-guard.js';
import { watchContracts } from '../firebase/firebase-db.js';
import { escapeHtml } from '../core/management-format.js';

let currentProfile = null;
let allContracts = [];

const $list = document.getElementById('contract-m-list');

const STATUS_COLORS = {
  '계약대기': 'yellow', '계약요청': 'blue', '계약발송': 'blue',
  '계약완료': 'green', '계약철회': 'gray',
};

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

function formatMoney(v) {
  const n = Number(v || 0);
  return n ? n.toLocaleString('ko-KR') + '원' : '-';
}

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
    const carNo = c.car_number || '';
    const vehicle = c.vehicle_name || c.model_name || '';
    const customer = c.customer_name || '';
    const rent = formatMoney(c.rent_amount);
    const date = formatDate(c.updated_at || c.created_at);
    const month = c.rent_month ? `${c.rent_month}개월` : '';

    return `<div class="m-list-card" data-id="${escapeHtml(c.id || c.contract_code || '')}">
      <div class="m-list-card__avatar" style="background:#f0f4ff;color:#1b2a4a;font-size:11px;font-weight:700">${escapeHtml(status.slice(0,2))}</div>
      <div class="m-list-card__body">
        <div class="m-list-card__main">
          <span class="m-list-card__name">${escapeHtml(carNo || vehicle || '계약')}</span>
          <span class="m-list-badge m-list-badge--${color}">${escapeHtml(status)}</span>
        </div>
        <div class="m-list-card__sub">
          <span class="m-list-card__info">${escapeHtml([customer, month, rent].filter(Boolean).join(' · '))}</span>
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
  const btn = document.getElementById('mobile-filter-btn');
  const sidebar = document.getElementById('contractMFilterSidebar');
  const overlay = document.getElementById('contractMFilterOverlay');
  const close = document.getElementById('contractMFilterClose');
  const countEl = document.getElementById('contractMFilterCount');
  const search = document.getElementById('contractMFilterSearch');

  function updateCount() { if (countEl) countEl.textContent = allContracts.length; }

  function toggleFilter() {
    const open = sidebar?.classList.toggle('is-open');
    overlay?.classList.toggle('is-open', open);
    const svg = btn?.querySelector('svg');
    if (svg) svg.innerHTML = open ? '<path d="m9 18 6-6-6-6"/>' : '<path d="m15 18-6-6 6-6"/>';
  }

  btn?.addEventListener('click', toggleFilter);
  close?.addEventListener('click', toggleFilter);
  overlay?.addEventListener('click', toggleFilter);

  let timer;
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

  watchContracts((contracts) => {
    allContracts = applyRoleFilter(contracts);
    renderList(allContracts);
    updateCount();
  });
}

export function onHide() {
  document.body.classList.remove('page-contract', 'contract-m-open');
}
export function onShow() {
  document.body.classList.add('page-contract');
}

init().catch(e => console.error('[mobile/contract]', e));
