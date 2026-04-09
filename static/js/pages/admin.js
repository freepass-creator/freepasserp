import { requireAuth } from '../core/auth-guard.js';
import { qs, registerPageCleanup, runPageCleanup } from '../core/utils.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { showConfirm } from '../core/toast.js';
import { watchSettlements, watchPartners, watchProducts } from '../firebase/firebase-db.js';
import { renderSkeletonRows } from '../core/management-list.js';
import { createSettlementController } from './admin/settlement.js';
import { createStockController } from './admin/stock.js';
import { createNoticeController } from './admin/notice.js';
import { createVehicleMasterAdminController } from './admin/vehicle-master.js';
import { createColorAdminController } from './admin/colors.js';

let menu, adminMenu;
let currentProfile = null;
let partnerNameMap = new Map();
let productTypeMap = new Map();

const ADMIN_STL_COLS_PLACEHOLDER = [
  { key: 'status', label: '정산상태', w: 80 }, { key: 'code', label: '정산코드' },
  { key: 'partner', label: '공급사명' }, { key: 'date', label: '계약완료일' },
  { key: 'car', label: '차량번호' }, { key: 'model', label: '모델명' },
  { key: 'fee', label: '수수료' },
];

const settlement = createSettlementController({
  getPartnerNameMap: () => partnerNameMap,
  getProductTypeMap: () => productTypeMap,
});
const stock = createStockController({
  getPartnerNameMap: () => partnerNameMap,
});
const notice = createNoticeController({
  getCurrentProfile: () => currentProfile,
});
const vehicleMaster = createVehicleMasterAdminController({
  getCurrentProfile: () => currentProfile,
});
const colorAdmin = createColorAdminController();

function bindDOM() {
  menu = qs('#sidebar-menu');
  adminMenu = document.getElementById('adminMenu');
  const pageName = document.querySelector('.top-bar-page-name');
  const identity = document.getElementById('topBarIdentity');
  const sep = document.getElementById('topBarStateSep');
  const badge = document.getElementById('topBarWorkBadge');
  if (pageName) pageName.textContent = '관리자 페이지';
  if (identity) { identity.textContent = ''; identity.hidden = true; }
  if (sep) sep.hidden = true;
  if (badge) { badge.textContent = ''; delete badge.dataset.mode; }
}

const TAB_TITLES = {
  settlement: '정산서 관리',
  stock: '재고 일괄삭제',
  notice: '안내사항 관리',
  vehicle: '차종 관리',
  color: '색상 관리',
};

function switchTab(tabKey) {
  adminMenu?.querySelectorAll('.admin-menu-item').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.tab === tabKey);
  });
  document.querySelectorAll('[data-tab-panel]').forEach(panel => {
    panel.hidden = panel.dataset.tabPanel !== tabKey;
  });

  const panelTitle = document.getElementById('adminPanelTitle');
  if (panelTitle) panelTitle.textContent = TAB_TITLES[tabKey] || '';

  if (tabKey === 'settlement') settlement.onTabEnter();
  if (tabKey === 'stock') stock.onTabEnter();
  if (tabKey === 'notice') notice.onTabEnter();
  if (tabKey === 'vehicle') vehicleMaster.onTabEnter();
  if (tabKey === 'color') colorAdmin.onTabEnter();

  const identity = document.getElementById('topBarIdentity');
  const sep = document.getElementById('topBarStateSep');
  if (identity) { identity.textContent = TAB_TITLES[tabKey] || ''; identity.hidden = false; }
  if (sep) sep.hidden = false;
}

async function bootstrap() {
  try {
    const { user, profile } = await requireAuth({ roles: ['admin'] });
    currentProfile = { ...profile, uid: user.uid };
    renderRoleMenu(menu, profile.role);

    adminMenu?.addEventListener('click', async (e) => {
      const btn = e.target.closest('.admin-menu-item');
      if (!btn) return;
      switchTab(btn.dataset.tab);
    });

    settlement.bind();
    stock.bind();
    notice.bind();
    vehicleMaster.bind();
    colorAdmin.bind();

    renderSkeletonRows(document.getElementById('adminStlList'), ADMIN_STL_COLS_PLACEHOLDER, 8);

    registerPageCleanup(watchPartners((items) => {
      partnerNameMap = new Map((items || []).map(p => [p.partner_code, p.partner_name || p.partner_code]));
      settlement.renderFilterSelects();
      settlement.renderList();
    }));

    registerPageCleanup(watchProducts((items) => {
      const products = items || [];
      productTypeMap = new Map(products.filter(p => p.car_number).map(p => [p.car_number, p.product_type || '']));
      stock.setData(products);
      settlement.renderList();
    }));

    registerPageCleanup(watchSettlements((items) => {
      settlement.setData((items || []).sort((a, b) => (b.created_at || 0) - (a.created_at || 0)));
      settlement.renderFilterSelects();
      settlement.renderList();
    }));

    switchTab('settlement');
  } catch (error) {
    console.error('[admin] bootstrap error:', error);
  }
}

let _mounted = false;
export async function mount() {
  if (_mounted) return;
  runPageCleanup();
  bindDOM();
  await bootstrap();
  _mounted = true;
}
export function unmount() { runPageCleanup(); _mounted = false; }
if (!import.meta.url.includes('?')) mount();
