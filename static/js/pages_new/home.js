import { get, onValue, push, ref, remove, set } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';
import { requireAuth } from '../core/auth-guard.js';
import { runPageCleanup } from '../core/utils.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { db } from '../firebase/firebase-config.js';
import { watchContracts, watchPartners, watchProducts, watchRooms, watchSettlements, watchUsers } from '../firebase/firebase-db.js';

let menu = document.getElementById('sidebar-menu');
let summaryGrid = document.getElementById('homeSummaryGrid');
let widgetGrid = document.getElementById('homeWidgetGrid');
let progressList = document.getElementById('homeProgressList');
let updatedAt = document.getElementById('homeUpdatedAt');
let roleSummary = document.getElementById('homeRoleSummary');

let noticeForm = document.getElementById('homeNoticeForm');
let noticeTitleInput = document.getElementById('home_notice_title');
let noticeBodyInput = document.getElementById('home_notice_body');
let noticeMessage = document.getElementById('homeNoticeMessage');
let noticeList = document.getElementById('homeNoticeList');
let noticeMeta = document.getElementById('homeNoticeMeta');

function bindDOM() {
  menu = document.getElementById('sidebar-menu');
  summaryGrid = document.getElementById('homeSummaryGrid');
  widgetGrid = document.getElementById('homeWidgetGrid');
  progressList = document.getElementById('homeProgressList');
  updatedAt = document.getElementById('homeUpdatedAt');
  roleSummary = document.getElementById('homeRoleSummary');
  noticeForm = document.getElementById('homeNoticeForm');
  noticeTitleInput = document.getElementById('home_notice_title');
  noticeBodyInput = document.getElementById('home_notice_body');
  noticeMessage = document.getElementById('homeNoticeMessage');
  noticeList = document.getElementById('homeNoticeList');
  noticeMeta = document.getElementById('homeNoticeMeta');
}

let currentProfile = null;
let currentUid = '';
let dashboardState = {
  products: [],
  rooms: [],
  contracts: [],
  settlements: [],
  partners: [],
  users: []
};

function formatShortDate(value) {
  const date = new Date(Number(value || 0));
  if (Number.isNaN(date.getTime()) || date.getTime() <= 0) return '--/--/--';
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}/${mm}/${dd}`;
}

function formatRoleName(role) {
  if (role === 'admin') return '관리자';
  if (role === 'provider') return '공급사';
  if (role === 'agent') return '영업자';
  return role || '사용자';
}

function isProviderMatch(item = {}) {
  const companyCode = String(currentProfile?.company_code || '').trim();
  if (!companyCode) return false;
  return [item.provider_company_code, item.partner_code, item.company_code]
    .map((value) => String(value || '').trim())
    .includes(companyCode);
}

function isAgentMatch(item = {}) {
  const userCode = String(currentProfile?.user_code || '').trim();
  return [item.agent_uid, item.user_uid].map((value) => String(value || '').trim()).includes(String(currentUid || '').trim())
    || [item.agent_code, item.sales_code, item.user_code].map((value) => String(value || '').trim()).includes(userCode);
}

function visibleProducts(items = []) {
  if (currentProfile?.role === 'admin') return items;
  if (currentProfile?.role === 'provider') return items.filter((item) => isProviderMatch(item));
  return items;
}

function visibleRooms(items = []) {
  if (currentProfile?.role === 'admin') return items;
  if (currentProfile?.role === 'provider') return items.filter((item) => isProviderMatch(item) || String(item.provider_uid || '').trim() === currentUid);
  if (currentProfile?.role === 'agent') return items.filter((item) => isAgentMatch(item));
  return [];
}

function visibleContracts(items = []) {
  if (currentProfile?.role === 'admin') return items;
  if (currentProfile?.role === 'provider') return items.filter((item) => isProviderMatch(item));
  if (currentProfile?.role === 'agent') return items.filter((item) => isAgentMatch(item));
  return [];
}

function visibleSettlements(items = []) {
  if (currentProfile?.role === 'admin') return items;
  if (currentProfile?.role === 'provider') return items.filter((item) => isProviderMatch(item));
  if (currentProfile?.role === 'agent') return items.filter((item) => isAgentMatch(item));
  return [];
}

function buildDashboardCards() {
  const products = visibleProducts(dashboardState.products);
  const rooms = visibleRooms(dashboardState.rooms);
  const contracts = visibleContracts(dashboardState.contracts);
  const settlements = visibleSettlements(dashboardState.settlements);

  if (currentProfile?.role === 'admin') {
    return [
      { label: '회원', value: dashboardState.users.length, note: '전체 사용자', icon: 'user' },
      { label: '파트너', value: dashboardState.partners.length, note: '전체 업체', icon: 'partner' },
      { label: '계약', value: contracts.length, note: '등록 계약', icon: 'contract' },
      { label: '대화', value: rooms.length, note: '개설 대화방', icon: 'chat' }
    ];
  }

  return [
    { label: '상품', value: products.length, note: currentProfile?.role === 'provider' ? '내 재고 기준' : '조회 가능 상품', icon: 'product' },
    { label: '대화', value: rooms.length, note: '참여 중 대화', icon: 'chat' },
    { label: '계약', value: contracts.length, note: '진행 계약', icon: 'contract' },
    { label: '정산', value: settlements.length, note: '정산 항목', icon: 'settlement' }
  ];
}

function buildProgressRows() {
  const products = visibleProducts(dashboardState.products);
  const rooms = visibleRooms(dashboardState.rooms);
  const contracts = visibleContracts(dashboardState.contracts);
  const settlements = visibleSettlements(dashboardState.settlements);

  const rows = [
    {
      title: '상품',
      count: `${products.length}건`,
      stamp: formatShortDate(Math.max(...products.map((item) => Number(item.updated_at || item.created_at || 0)), 0))
    },
    {
      title: '대화',
      count: `${rooms.length}건`,
      stamp: formatShortDate(Math.max(...rooms.map((item) => Number(item.last_message_at || item.updated_at || item.created_at || 0)), 0))
    },
    {
      title: '계약',
      count: `${contracts.length}건`,
      stamp: formatShortDate(Math.max(...contracts.map((item) => Number(item.updated_at || item.created_at || 0)), 0))
    },
    {
      title: '정산',
      count: `${settlements.length}건`,
      stamp: formatShortDate(Math.max(...settlements.map((item) => Number(item.completed_at || item.updated_at || item.created_at || 0)), 0))
    }
  ];

  if (currentProfile?.role === 'admin') {
    rows.unshift(
      {
        title: '회원',
        count: `${dashboardState.users.length}건`,
        stamp: formatShortDate(Math.max(...dashboardState.users.map((item) => Number(item.updated_at || item.created_at || 0)), 0))
      },
      {
        title: '파트너',
        count: `${dashboardState.partners.length}건`,
        stamp: formatShortDate(Math.max(...dashboardState.partners.map((item) => Number(item.updated_at || item.created_at || 0)), 0))
      }
    );
  }

  return rows;
}

const ICON_MAP = {
  product: '📦', chat: '💬', contract: '📋', settlement: '💰', user: '👤', partner: '🏢'
};

function buildNewProductsWidget() {
  const products = visibleProducts(dashboardState.products)
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
    .slice(0, 8);
  return products.map((p) => ({
    title: [p.maker, p.model_name].filter(Boolean).join(' ') || p.car_number || '-',
    sub: p.car_number || '',
    date: formatShortDate(p.created_at)
  }));
}

function buildContractStatusWidget() {
  const contracts = visibleContracts(dashboardState.contracts)
    .sort((a, b) => (b.updated_at || b.created_at || 0) - (a.updated_at || a.created_at || 0))
    .slice(0, 8);
  return contracts.map((c) => ({
    title: c.customer_name || c.car_number || c.contract_code || '-',
    status: c.contract_status || '계약대기',
    date: formatShortDate(c.updated_at || c.created_at)
  }));
}

function statusBadgeClass(status) {
  if (status === '계약완료') return 'home-status-badge--done';
  if (status === '정산대기' || status === '정산완료') return 'home-status-badge--settle';
  return 'home-status-badge--waiting';
}

function renderWidgets() {
  if (!widgetGrid) return;
  const newProducts = buildNewProductsWidget();
  const contractStatuses = buildContractStatusWidget();

  widgetGrid.innerHTML = `
    <div class="home-widget">
      <div class="home-widget__head">
        <div class="home-widget__title">실시간 신규 매물</div>
        <div class="home-widget__badge">${newProducts.length}건</div>
      </div>
      <div class="home-widget__body">
        ${newProducts.length ? newProducts.map((p) => `
          <div class="home-widget__row">
            <div class="home-widget__row-title">${p.title}</div>
            <div class="home-widget__row-sub">${p.sub}</div>
            <div class="home-widget__row-date">${p.date}</div>
          </div>
        `).join('') : '<div class="home-widget__empty">신규 매물이 없습니다.</div>'}
      </div>
    </div>
    <div class="home-widget">
      <div class="home-widget__head">
        <div class="home-widget__title">진행 중인 계약 상태</div>
        <div class="home-widget__badge">${contractStatuses.length}건</div>
      </div>
      <div class="home-widget__body">
        ${contractStatuses.length ? contractStatuses.map((c) => `
          <div class="home-widget__row">
            <div class="home-widget__row-title">${c.title}</div>
            <span class="home-status-badge ${statusBadgeClass(c.status)}">${c.status}</span>
            <div class="home-widget__row-date">${c.date}</div>
          </div>
        `).join('') : '<div class="home-widget__empty">진행 중인 계약이 없습니다.</div>'}
      </div>
    </div>
  `;
}

function renderDashboard() {
  const cards = buildDashboardCards();
  summaryGrid.replaceChildren(...cards.map((card) => {
    const item = document.createElement('article');
    item.className = 'home-summary-card';
    item.innerHTML = `
      <div class="home-summary-card__icon home-summary-card__icon--${card.icon || 'product'}">${ICON_MAP[card.icon] || '📊'}</div>
      <div class="home-summary-card__label">${card.label}</div>
      <div class="home-summary-card__value">${card.value}</div>
      <div class="home-summary-card__note">${card.note}</div>
    `;
    return item;
  }));

  renderWidgets();

  const rows = buildProgressRows();
  progressList.replaceChildren(...rows.map((row) => {
    const item = document.createElement('div');
    item.className = 'home-progress-row';
    item.innerHTML = `
      <div class="home-progress-row__title">${row.title}</div>
      <div class="home-progress-row__count">${row.count}</div>
      <div class="home-progress-row__date">${row.stamp}</div>
    `;
    return item;
  }));

  updatedAt.textContent = `기준 ${formatShortDate(Date.now())}`;
}

function sortNotices(items = []) {
  return [...items].sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));
}

function renderNotices(items = []) {
  const notices = sortNotices(items);
  noticeMeta.textContent = `${notices.length}건`;
  if (!notices.length) {
    noticeList.innerHTML = '<div class="home-notice-empty">등록된 공지가 없습니다.</div>';
    return;
  }

  noticeList.replaceChildren(...notices.map((notice) => {
    const wrap = document.createElement('article');
    wrap.className = 'home-notice-item';
    wrap.dataset.noticeId = notice.id;
    wrap.innerHTML = `
      <button type="button" class="home-notice-trigger">
        <span class="home-notice-title">${notice.title || '제목 없음'}</span>
        <span class="home-notice-date">${formatShortDate(notice.created_at)}</span>
      </button>
      <div class="home-notice-body">
        <div class="home-notice-copy">${String(notice.body || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
        <div class="home-notice-foot">
          <div class="home-notice-writer">${notice.writer_name || '관리자'}</div>
          ${currentProfile?.role === 'admin' ? '<button type="button" class="inline-button home-notice-delete">삭제</button>' : ''}
        </div>
      </div>
    `;
    return wrap;
  }));
}

async function createNotice(title, body) {
  const nextRef = push(ref(db, 'home_notices'));
  await set(nextRef, {
    title,
    body,
    writer_uid: currentUid,
    writer_name: currentProfile?.name || currentProfile?.user_name || currentProfile?.email || '관리자',
    created_at: Date.now()
  });
}

async function deleteNotice(noticeId) {
  await remove(ref(db, `home_notices/${noticeId}`));
}

function bindNoticeEvents() {
  noticeList.addEventListener('click', async (event) => {
    const trigger = event.target.closest('.home-notice-trigger');
    if (trigger) {
      const item = trigger.closest('.home-notice-item');
      item?.classList.toggle('is-open');
      return;
    }

    const deleteButton = event.target.closest('.home-notice-delete');
    if (deleteButton && currentProfile?.role === 'admin') {
      const item = deleteButton.closest('.home-notice-item');
      const noticeId = item?.dataset.noticeId || '';
      if (!noticeId) return;
      try {
        await deleteNotice(noticeId);
        noticeMessage.textContent = '공지를 삭제했습니다.';
      } catch (error) {
        console.error(error);
        noticeMessage.textContent = error.message || '공지 삭제 중 오류가 발생했습니다.';
      }
    }
  });

  noticeForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = String(noticeTitleInput?.value || '').trim();
    const body = String(noticeBodyInput?.value || '').trim();
    if (!title || !body) {
      noticeMessage.textContent = '제목과 내용을 모두 입력하세요.';
      return;
    }
    try {
      await createNotice(title, body);
      noticeTitleInput.value = '';
      noticeBodyInput.value = '';
      noticeMessage.textContent = '공지를 등록했습니다.';
    } catch (error) {
      console.error(error);
      noticeMessage.textContent = error.message || '공지 등록 중 오류가 발생했습니다.';
    }
  });
}

function watchHomeNotices() {
  return onValue(ref(db, 'home_notices'), (snapshot) => {
    const raw = snapshot.val() || {};
    const items = Object.entries(raw).map(([id, value]) => ({ id, ...(value || {}) }));
    renderNotices(items);
  });
}

function mountWatchers() {
  watchProducts((items) => {
    dashboardState.products = items || [];
    renderDashboard();
  });
  watchRooms((items) => {
    dashboardState.rooms = items || [];
    renderDashboard();
  });
  watchContracts((items) => {
    dashboardState.contracts = items || [];
    renderDashboard();
  });
  watchSettlements((items) => {
    dashboardState.settlements = items || [];
    renderDashboard();
  });
  if (currentProfile?.role === 'admin') {
    watchPartners((items) => {
      dashboardState.partners = items || [];
      renderDashboard();
    });
    watchUsers((items) => {
      dashboardState.users = items || [];
      renderDashboard();
    });
  } else {
    dashboardState.partners = [];
    dashboardState.users = [];
  }
}

async function bootstrap() {
  try {
    const { user, profile } = await requireAuth({ roles: ['provider', 'agent', 'admin'] });
    currentProfile = profile;
    currentUid = user.uid;
    renderRoleMenu(menu, profile.role);
    roleSummary.textContent = `${formatRoleName(profile.role)} · 내가 진행하는 항목을 한눈에 봅니다.`;
    noticeForm.hidden = profile.role !== 'admin';
    bindNoticeEvents();
    mountWatchers();
    watchHomeNotices();
    renderDashboard();
  } catch (error) {
    console.error(error);
    if (noticeMessage) noticeMessage.textContent = error.message || '홈을 불러오지 못했습니다.';
  }
}

let _mounted = false;
export async function mount() {
  bindDOM();
  _mounted = false;
  await bootstrap();
  _mounted = true;
}
export function unmount() {
  runPageCleanup();
  _mounted = false;
}
// Auto-mount on first script load (server-rendered page)
if (!import.meta.url.includes('?')) mount();
