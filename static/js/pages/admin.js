import { requireAuth } from '../core/auth-guard.js';
import { qs, registerPageCleanup, runPageCleanup } from '../core/utils.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { showConfirm } from '../core/toast.js';
import { watchSettlements, watchPartners, watchProducts, watchVehicleMaster, syncExternalProducts } from '../firebase/firebase-db.js';
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
  upload: '상품업로드',
  sync: '외부시트 동기화',
};

let uploadFrameLoaded = false;

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
  if (tabKey === 'upload' && !uploadFrameLoaded) {
    const frame = document.getElementById('adminUploadFrame');
    if (frame) {
      frame.src = '/upload-center?embed=1';
      uploadFrameLoaded = true;
    }
  }

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

    // ── 외부시트 동기화 ──
    let _syncProducts = null;
    let _vmModelToMaker = {};  // 차량마스터: 모델명→제조사
    let _vmModelsSet = [];     // 모델명 목록 (긴 이름 우선)

    // 차량마스터 로드
    registerPageCleanup(watchVehicleMaster((vmData) => {
      _vmModelToMaker = {};
      const modelsArr = [];
      for (const [makerKey, models] of Object.entries(vmData || {})) {
        if (makerKey === 'items' || !models || typeof models !== 'object') continue;
        for (const modelKey of Object.keys(models)) {
          const m = String(modelKey).trim();
          if (m && m !== 'undefined') {
            _vmModelToMaker[m] = makerKey;
            modelsArr.push(m);
          }
        }
      }
      _vmModelsSet = modelsArr.sort((a, b) => b.length - a.length); // 긴 이름 우선
    }));

    function matchVehicleMaster(shortName, fullName) {
      // 1) 차종이 마스터에 직접 있으면
      if (_vmModelToMaker[shortName]) return { maker: _vmModelToMaker[shortName], model: shortName };
      // 2) 풀네임에서 마스터 모델명 키워드 검색
      const searchText = `${shortName} ${fullName}`;
      for (const m of _vmModelsSet) {
        if (searchText.includes(m)) return { maker: _vmModelToMaker[m], model: m };
      }
      return { maker: '', model: shortName };
    }

    function parseVehicleName(shortName, fullName) {
      const { maker, model } = matchVehicleMaster(shortName, fullName);
      if (!fullName || fullName === shortName) return { maker, model, sub_model: '', trim_name: '' };
      let sub_model = fullName, trim_name = '';
      const trimKw = ['기본형','프레스티지','캘리그래피','인스퍼레이션','노블레스',
        '시그니처','그래비티','프리미엄','익스클루시브','럭셔리',
        '스페셜','베스트셀렉션','플래티넘','트렌디','모던','익스트림','스포츠','컴포트'];
      for (const kw of trimKw) {
        const idx = fullName.indexOf(kw);
        if (idx > 0) { sub_model = fullName.slice(0, idx).trim(); trim_name = fullName.slice(idx).trim(); break; }
      }
      return { maker, model, sub_model, trim_name };
    }

    const syncFetchBtn = document.getElementById('adminSyncFetchBtn');
    const syncApplyBtn = document.getElementById('adminSyncApplyBtn');
    const syncMsg = document.getElementById('adminSyncMessage');
    const syncList = document.getElementById('adminSyncList');
    const syncCount = document.getElementById('adminSyncCount');
    const fmtPrice = (v) => v ? Number(v).toLocaleString('ko-KR') : '-';

    syncFetchBtn?.addEventListener('click', async () => {
      syncFetchBtn.disabled = true;
      syncApplyBtn.disabled = true;
      _syncProducts = null;
      if (syncMsg) syncMsg.textContent = '시트 데이터를 읽는 중...';
      if (syncList) syncList.innerHTML = '';
      try {
        const resp = await fetch('/api/sync/external-sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const data = await resp.json();
        if (!data.ok) throw new Error(data.message || '시트 읽기 실패');

        // 차량마스터 매칭 적용
        const products = data.products;
        for (const p of Object.values(products)) {
          const parsed = parseVehicleName(p.raw_model_short || '', p.raw_model_full || '');
          p.maker = parsed.maker;
          p.model_name = parsed.model;
          p.sub_model = parsed.sub_model;
          p.trim_name = parsed.trim_name;
        }

        _syncProducts = products;
        const items = Object.values(products);
        const matched = items.filter(p => p.maker).length;
        const unmatched = items.length - matched;
        if (syncCount) syncCount.textContent = `${items.length}건`;
        if (syncMsg) syncMsg.textContent = `${items.length}건 (매칭 ${matched}, 미매칭 ${unmatched}) — 확인 후 "동기화 적용"`;
        if (syncList) syncList.innerHTML = items.map(p => {
          const hasLink = p.photo_link ? `<a href="${p.photo_link}" target="_blank" style="color:#3b82f6">✓</a>` : '-';
          const makerStyle = p.maker ? '' : ' style="color:#ef4444;font-weight:600"';
          return `<tr>
            <td>${p.car_number || ''}</td>
            <td${makerStyle}>${p.maker || '❓미매칭'}</td>
            <td>${p.model_name || ''}</td>
            <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(p.sub_model||'').replace(/"/g,'&quot;')}">${p.sub_model || '-'}</td>
            <td>${p.trim_name || '-'}</td>
            <td>${p.color_exterior || ''}</td>
            <td>${p.fuel_type || ''}</td>
            <td>${p.year_model || '-'}</td>
            <td style="text-align:right">${p.mileage ? p.mileage.toLocaleString('ko-KR') : '-'}</td>
            <td style="font-size:11px;color:${p.vehicle_status === '출고가능' ? '#16a34a' : '#94a3b8'}">${p.vehicle_status || '-'}</td>
            <td>${p.product_type || '-'}</td>
            <td style="text-align:right">${fmtPrice(p.price?.['12']?.rent)}</td>
            <td style="text-align:right">${fmtPrice(p.price?.['24']?.rent)}</td>
            <td style="text-align:right">${fmtPrice(p.price?.['36']?.rent)}</td>
            <td style="text-align:center">${hasLink}</td>
          </tr>`;
        }).join('');
        syncApplyBtn.disabled = false;
      } catch (err) {
        if (syncMsg) syncMsg.textContent = `오류: ${err.message || err}`;
      } finally {
        syncFetchBtn.disabled = false;
      }
    });

    syncApplyBtn?.addEventListener('click', async () => {
      if (!_syncProducts) return;
      syncApplyBtn.disabled = true;
      syncFetchBtn.disabled = true;
      if (syncMsg) syncMsg.textContent = 'Firebase 동기화 중...';
      try {
        const result = await syncExternalProducts(_syncProducts, 'RP023');
        if (syncMsg) syncMsg.textContent = `동기화 완료 — 추가 ${result.added}건, 업데이트 ${result.updated}건, 삭제 ${result.deleted}건 (${new Date().toLocaleString('ko-KR')})`;
        _syncProducts = null;
      } catch (err) {
        if (syncMsg) syncMsg.textContent = `동기화 오류: ${err.message || err}`;
      } finally {
        syncApplyBtn.disabled = true;
        syncFetchBtn.disabled = false;
      }
    });

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
