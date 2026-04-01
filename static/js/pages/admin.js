import { onValue, push, ref, remove, set } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';
import { requireAuth } from '../core/auth-guard.js';
import { qs, registerPageCleanup, runPageCleanup } from '../core/utils.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { showToast } from '../core/toast.js';
import { db } from '../firebase/firebase-config.js';
import { watchUsers, watchPartners, watchProducts, watchRooms, watchContracts, watchSettlements, watchTerms, watchCodeItems, watchVehicleMaster } from '../firebase/firebase-db.js';
import { createVehicleMasterController } from './settings/vehicle-master.js';
import { createCodeSettingsController } from './settings/code-settings.js';
import { createIntegrityController } from './settings/integrity.js';

let menu, adminMenu, workspaceTitle, dataOverview;
let currentProfile = null;
let ds = { users: [], partners: [], products: [], rooms: [], contracts: [], settlements: [], terms: [], codes: [] };

function bindDOM() {
  menu = qs('#sidebar-menu');
  adminMenu = document.getElementById('adminMenu');
  workspaceTitle = document.getElementById('adminWorkspaceTitle');
  dataOverview = document.getElementById('adminDataOverview');
}

function esc(v = '') { return String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }
function fmtMoney(v) { const n = Number(v || 0); return (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('ko-KR'); }
function fmtDate(v) {
  const d = new Date(Number(v || 0));
  if (Number.isNaN(d.getTime()) || d.getTime() <= 0) return '-';
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

// ─── 탭 전환 ────────────────────────────────────────────────────────────────

const TAB_TITLES = {
  'code-manage': '코드 관리',
  'vehicle-master': '차종 마스터',
  'integrity': '정합성 검사',
  'notice': '안내사항 관리',
  'data-overview': '데이터 현황',
};

function switchTab(tabKey) {
  adminMenu?.querySelectorAll('.admin-menu-item').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.tab === tabKey);
  });
  document.querySelectorAll('.admin-tab-panel').forEach(panel => {
    panel.hidden = panel.dataset.tabPanel !== tabKey;
  });
  if (workspaceTitle) workspaceTitle.textContent = TAB_TITLES[tabKey] || '';
  if (tabKey === 'data-overview') renderDataOverview();
}

// ─── 데이터 현황 ────────────────────────────────────────────────────────────

function gc(items, key) {
  const m = {};
  items.forEach(i => { const v = String(i[key] || '-').trim() || '-'; m[v] = (m[v] || 0) + 1; });
  return m;
}

function dataCard(title, total, rows) {
  return `<div class="admin-data-card">
    <div class="admin-data-card__title"><span>${esc(title)}</span><span>${esc(total)}</span></div>
    <div class="admin-data-card__body">${rows.join('')}</div>
  </div>`;
}

function dataRow(label, value) {
  return `<div class="admin-data-row"><span>${esc(label)}</span><span>${esc(String(value))}</span></div>`;
}

function renderDataOverview() {
  if (!dataOverview) return;

  const userByRole = gc(ds.users, 'role');
  const userByStatus = gc(ds.users, 'status');
  const partnerByStatus = gc(ds.partners, 'status');
  const prodByStatus = gc(ds.products, 'vehicle_status');
  const ctByStatus = gc(ds.contracts, 'contract_status');
  const stByStatus = gc(ds.settlements, 'settlement_status');
  const totalFee = ds.settlements.reduce((s, i) => s + Number(i.fee_amount || 0), 0);
  const activeRooms = ds.rooms.filter(r => Number(r.last_message_at || 0) > 0).length;
  const pendingRooms = ds.rooms.filter(r => {
    const eff = r.last_effective_sender_role || '';
    const last = r.last_sender_role || '';
    const sender = (eff === 'agent' || eff === 'provider') ? eff : ((last === 'agent' || last === 'provider') ? last : '');
    return sender === 'agent';
  }).length;
  const activeTerms = ds.terms.filter(t => t.status !== 'inactive').length;
  const codeGroups = {};
  ds.codes.forEach(c => { const g = c.group_code || 'etc'; codeGroups[g] = (codeGroups[g] || 0) + 1; });

  dataOverview.innerHTML = `<div class="admin-data-grid">${[
    dataCard('사용자', ds.users.length + '명', [
      dataRow('관리자', (userByRole['admin'] || 0) + '명'),
      dataRow('공급사', (userByRole['provider'] || 0) + '명'),
      dataRow('영업자', (userByRole['agent'] || 0) + '명'),
      dataRow('승인대기', (userByStatus['pending'] || 0) + '명'),
    ]),
    dataCard('파트너', ds.partners.length + '개', [
      dataRow('활성', (partnerByStatus['active'] || partnerByStatus['approved'] || 0) + '개'),
      dataRow('승인대기', (partnerByStatus['pending'] || 0) + '개'),
    ]),
    dataCard('상품', ds.products.length + '대', [
      ...Object.entries(prodByStatus).map(([k, v]) => dataRow(k, v + '대')),
    ]),
    dataCard('문의·응대', ds.rooms.length + '건', [
      dataRow('대화중', activeRooms + '건'),
      dataRow('신규', (ds.rooms.length - activeRooms) + '건'),
      dataRow('회신대기', pendingRooms + '건'),
    ]),
    dataCard('계약', ds.contracts.length + '건', [
      ...Object.entries(ctByStatus).map(([k, v]) => dataRow(k, v + '건')),
    ]),
    dataCard('정산', ds.settlements.length + '건', [
      dataRow('총 수수료', fmtMoney(totalFee) + '원'),
      ...Object.entries(stByStatus).map(([k, v]) => dataRow(k, v + '건')),
    ]),
    dataCard('정책', ds.terms.length + '건', [
      dataRow('활성', activeTerms + '건'),
      dataRow('비활성', (ds.terms.length - activeTerms) + '건'),
    ]),
    dataCard('입력코드', ds.codes.length + '건', [
      ...Object.entries(codeGroups).slice(0, 8).map(([k, v]) => dataRow(k, v + '건')),
    ]),
  ].join('')}</div>`;
}

// ─── 초기화 ─────────────────────────────────────────────────────────────────

function getAdminCodeField(id) { return document.querySelector(`#admin-${id}`); }

async function bootstrap() {
  try {
    const { user, profile } = await requireAuth({ roles: ['admin'] });
    currentProfile = { ...profile, uid: user.uid };
    renderRoleMenu(menu, profile.role);

    // 탭 전환
    adminMenu?.addEventListener('click', (e) => {
      const btn = e.target.closest('.admin-menu-item');
      if (btn) switchTab(btn.dataset.tab);
    });

    // 차종 마스터 컨트롤러
    const vehicleMasterController = createVehicleMasterController({
      getProfile: () => currentProfile,
      elements: {
        linkInput: document.getElementById('vehicle-master-link'),
        applyButton: document.getElementById('vehicle-master-apply-button'),
        clearButton: document.getElementById('vehicle-master-clear-button'),
        message: document.getElementById('vehicle-master-message'),
        sourceValue: document.getElementById('vehicle-master-source-file'),
        testMaker: document.getElementById('vehicle-master-test-maker'),
        testModel: document.getElementById('vehicle-master-test-model'),
        testSubModel: document.getElementById('vehicle-master-test-submodel'),
        testExtColor: document.getElementById('vehicle-master-test-ext-color'),
        testIntColor: document.getElementById('vehicle-master-test-int-color'),
        countMaker: document.getElementById('vehicle-master-maker-count'),
        countModel: document.getElementById('vehicle-master-model-count'),
        countSubModel: document.getElementById('vehicle-master-submodel-count'),
        countExtColor: document.getElementById('vehicle-master-ext-color-count'),
        countIntColor: document.getElementById('vehicle-master-int-color-count'),
        updatedAt: document.getElementById('vehicle-master-updated-at'),
        updatedBy: document.getElementById('vehicle-master-updated-by')
      }
    });

    // 코드 관리 컨트롤러
    const codeController = createCodeSettingsController({
      getProfile: () => currentProfile,
      elements: {
        list: document.getElementById('admin-code-item-list'),
        form: document.getElementById('admin-code-form'),
        message: document.getElementById('admin-code-message'),
        resetButton: document.getElementById('admin-code-form-reset'),
        submitButton: document.getElementById('admin-code-submit'),
        deleteButton: document.getElementById('admin-code-delete'),
        editingKeyInput: document.getElementById('admin-editing_code_key'),
        getField: getAdminCodeField
      }
    });

    // 정합성 검사 컨트롤러
    const integrityController = createIntegrityController({
      elements: {
        checkButton: document.getElementById('integrity-check-button'),
        cleanupButton: document.getElementById('integrity-cleanup-button'),
        message: document.getElementById('integrity-message'),
        dbCountEl: document.getElementById('integrity-db-count'),
        storageCountEl: document.getElementById('integrity-storage-count'),
        orphanCountEl: document.getElementById('integrity-orphan-count'),
        missingCountEl: document.getElementById('integrity-missing-count'),
        orphanListEl: document.getElementById('integrity-orphan-list')
      }
    });

    vehicleMasterController.bindEvents();
    codeController.bindEvents();
    integrityController.bindEvents();
    codeController.resetCodeForm({ keepMessage: true });

    // 실시간 감시
    registerPageCleanup(watchVehicleMaster((payload) => vehicleMasterController.applySnapshot(payload)));
    registerPageCleanup(watchCodeItems((items) => { ds.codes = items || []; codeController.applyItems(items); }));

    // 안내사항
    const noticeForm = document.getElementById('adminNoticeForm');
    const noticeMsg = document.getElementById('adminNoticeMessage');
    const noticeList = document.getElementById('adminNoticeList');

    noticeForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('admin_notice_title')?.value.trim();
      const body = document.getElementById('admin_notice_body')?.value.trim();
      if (!title || !body) { if (noticeMsg) noticeMsg.textContent = '제목과 내용을 모두 입력하세요.'; return; }
      try {
        await set(push(ref(db, 'home_notices')), {
          title, body, writer_uid: currentProfile.uid,
          writer_name: currentProfile.name || currentProfile.user_name || currentProfile.email || '관리자',
          created_at: Date.now()
        });
        document.getElementById('admin_notice_title').value = '';
        document.getElementById('admin_notice_body').value = '';
        if (noticeMsg) noticeMsg.textContent = '등록 완료';
      } catch (err) { if (noticeMsg) noticeMsg.textContent = err.message; }
    });

    noticeList?.addEventListener('click', async (e) => {
      const del = e.target.closest('.admin-notice-delete');
      if (!del) return;
      const id = del.closest('[data-notice-id]')?.dataset.noticeId;
      if (id) { try { await remove(ref(db, `home_notices/${id}`)); } catch (err) { if (noticeMsg) noticeMsg.textContent = err.message; } }
    });

    onValue(ref(db, 'home_notices'), (snap) => {
      const raw = snap.val() || {};
      const items = Object.entries(raw).map(([id, v]) => ({ id, ...(v || {}) }))
        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      if (!noticeList) return;
      if (!items.length) { noticeList.innerHTML = '<div class="admin-helper" style="padding:12px 0">등록된 안내사항이 없습니다.</div>'; return; }
      noticeList.innerHTML = items.map(n => `
        <div class="admin-notice-row" data-notice-id="${esc(n.id)}">
          <span class="admin-notice-title">${esc(n.title || '제목 없음')}</span>
          <span class="admin-notice-writer">${esc(n.writer_name || '관리자')}</span>
          <span class="admin-notice-date">${fmtDate(n.created_at)}</span>
          <button class="admin-notice-delete admin-btn admin-btn--danger" type="button">삭제</button>
        </div>
      `).join('');
    });

    // 데이터 현황용 감시
    watchUsers(items => { ds.users = items || []; });
    watchPartners(items => { ds.partners = items || []; });
    watchProducts(items => { ds.products = items || []; });
    watchRooms(items => { ds.rooms = items || []; });
    watchContracts(items => { ds.contracts = items || []; });
    watchSettlements(items => { ds.settlements = items || []; });
    watchTerms(items => { ds.terms = items || []; });

  } catch (error) {
    console.error('[admin] bootstrap error:', error);
    showToast('관리자 페이지 로드 실패: ' + error.message, 'error');
  }
}

let _mounted = false;
export async function mount() { bindDOM(); _mounted = false; await bootstrap(); _mounted = true; }
export function unmount() { runPageCleanup(); _mounted = false; }
if (!import.meta.url.includes('?')) mount();
