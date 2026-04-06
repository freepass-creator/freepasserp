import { onValue, push, ref, remove, set } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';
import { requireAuth } from '../core/auth-guard.js';
import { qs, registerPageCleanup, runPageCleanup } from '../core/utils.js';
import { setDirtyCheck, clearDirtyCheck } from '../app.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { showToast, showConfirm } from '../core/toast.js';
import { db, storage } from '../firebase/firebase-config.js';
import { ref as sRef, uploadBytes, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js';
import { watchSettlements, watchPartners, watchProducts } from '../firebase/firebase-db.js';
import { renderBadge } from '../shared/badge.js';
import { renderTableGrid, renderSkeletonRows } from '../core/management-list.js';
import { escapeHtml, formatShortDate } from '../core/management-format.js';
import { createManagedFormModeApplier, applyManagementButtonTones } from '../core/management-skeleton.js';

let menu, adminMenu;
let currentProfile = null;
let allSettlements = [];
let partnerNameMap = new Map();  // partner_code → partner_name
let productTypeMap = new Map();  // car_number → product_type

function nowYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function prevYearMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
let stlFilterYear = '';
let stlFilterMonth = '';
let stlFilterPartner = '';
let stlFilterChannel = '';
let stlFilterAgent = '';

function getStlItemMonth(s) {
  const ts = s.completed_at || s.settled_at || s.created_at || 0;
  const d = new Date(Number(ts));
  if (!ts || isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getStlFiltered() {
  let items = allSettlements;
  if (stlFilterYear) items = items.filter(s => getStlItemMonth(s).startsWith(stlFilterYear));
  if (stlFilterMonth) {
    const ym = stlFilterYear ? `${stlFilterYear}-${stlFilterMonth}` : '';
    if (ym) items = items.filter(s => getStlItemMonth(s) === ym);
  }
  if (stlFilterPartner) items = items.filter(s => stlPartner(s) === stlFilterPartner);
  if (stlFilterChannel) items = items.filter(s => stlChannel(s) === stlFilterChannel);
  if (stlFilterAgent) items = items.filter(s => stlAgent(s) === stlFilterAgent);
  return items;
}

function bindDOM() {
  menu = qs('#sidebar-menu');
  adminMenu = document.getElementById('adminMenu');

  // 이전 페이지에서 남은 상단바 상태 초기화
  const pageName = document.querySelector('.top-bar-page-name');
  const identity = document.getElementById('topBarIdentity');
  const sep      = document.getElementById('topBarStateSep');
  const badge    = document.getElementById('topBarWorkBadge');
  if (pageName) pageName.textContent = '관리자 페이지';
  if (identity) { identity.textContent = ''; identity.hidden = true; }
  if (sep)      sep.hidden = true;
  if (badge)    { badge.textContent = ''; delete badge.dataset.mode; }
}

function fmtMoney(v) { const n = Number(v || 0); return n.toLocaleString('ko-KR'); }
function fmtDate(v) {
  const d = new Date(Number(v || 0));
  if (Number.isNaN(d.getTime()) || d.getTime() <= 0) return '-';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

// ─── 탭 전환 ────────────────────────────────────────────────────────────────

const TAB_TITLES = {
  'settlement': '정산서 관리',
  'stock':      '재고 일괄삭제',
  'notice':     '안내사항 관리',
};

function switchTab(tabKey) {
  adminMenu?.querySelectorAll('.admin-menu-item').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.tab === tabKey);
  });
  document.querySelectorAll('[data-tab-panel]').forEach(panel => {
    panel.hidden = panel.dataset.tabPanel !== tabKey;
  });
  const title = TAB_TITLES[tabKey] || '';

  // 정산서 탭 전환 시 필터 셀렉트 렌더링
  if (tabKey === 'settlement') {
    renderStlFilterSelects();
    renderStlList();
  }
  if (tabKey === 'stock') {
    renderStockPartnerSelect();
    renderStockList();
  }

  // 탭별 헤더 영역 토글 — 안내사항만 패널헤드 사용
  const isNotice = tabKey === 'notice';
  const workspaceHead  = document.getElementById('adminWorkspaceHead');
  const workspaceTitle = document.getElementById('adminWorkspaceTitle');
  if (workspaceHead) workspaceHead.hidden = !isNotice;
  const panel = workspaceHead?.closest('.panel');
  if (panel) panel.style.gridTemplateRows = isNotice ? '' : 'minmax(0, 1fr)';
  if (isNotice) setNoticeMode('idle');
  if (workspaceTitle && isNotice) workspaceTitle.textContent = title;

  // 상단바: 관리자 페이지 | {탭명}
  const identity = document.getElementById('topBarIdentity');
  const sep      = document.getElementById('topBarStateSep');
  if (identity) { identity.textContent = title; identity.hidden = false; }
  if (sep)      sep.hidden = false;
}

// ─── 정산서 관리 ─────────────────────────────────────────────────────────────

// 정산 항목에서 공통 필드 추출
function stlPartner(s)      { return s.partner_code || s.partner_code_snapshot || '-'; }
function stlPtype(s)        { return productTypeMap.get(stlCar(s)) || '-'; }
function stlPartnerName(s)  { const c = stlPartner(s); return partnerNameMap.get(c) || c; }
function stlChannel(s)  { return s.agent_channel_code_snapshot || s.agent_channel_code || s.agent_company_code || '-'; }
function stlAgent(s)    { return s.agent_code_snapshot || s.agent_code || '-'; }
function stlFee(s)      { return Number(s.fee_amount || s.origin_fee_amount || 0); }
function stlModel(s)    { return s.model_name || s.model_name_snapshot || s.sub_model_snapshot || s.vehicle_name || ''; }
function stlCar(s)      { return s.car_number || s.car_number_snapshot || ''; }
function stlCustomer(s) { return s.customer_name || s.customer_name_snapshot || ''; }
function stlStatus(s)   { return s.settlement_status || s.status || '정산대기'; }

const ADMIN_STL_COLS = [
  { key: 'status',   label: '정산상태',   align: 'c', filterable: true, w: 80 },
  { key: 'code',     label: '정산코드',   align: 'c', searchable: true  },
  { key: 'partner',  label: '공급사명',   align: 'c', filterable: true  },
  { key: 'date',     label: '계약완료일', align: 'c', filterable: true  },
  { key: 'ptype',    label: '상품구분',   align: 'c', filterable: true, w: 80 },
  { key: 'car',      label: '차량번호',   align: 'c', searchable: true  },
  { key: 'model',    label: '모델명',     align: 'c', filterable: true  },
  { key: 'customer', label: '고객명',     align: 'c', searchable: true  },
  { key: 'month',    label: '계약기간',   align: 'c', filterable: true  },
  { key: 'rent',     label: '대여료',     align: 'r'                    },
  { key: 'deposit',  label: '보증금',     align: 'r'                    },
  { key: 'fee',      label: '수수료',     align: 'r'                    },
  { key: 'channel',  label: '영업채널',   align: 'c', filterable: true  },
  { key: 'agent',    label: '영업자',     align: 'c', filterable: true  },
];


function renderStlList() {
  const thead = document.getElementById('adminStlHead');
  const tbody = document.getElementById('adminStlList');
  const countEl = document.getElementById('adminStlCount');
  if (!tbody) return;
  const items = getStlFiltered();
  if (countEl) countEl.textContent = items.length ? `${items.length}건` : '';
  renderTableGrid({
    thead,
    tbody,
    columns: ADMIN_STL_COLS,
    items,
    emptyText: '해당 월의 정산 내역이 없습니다.',
    getKey: s => s.id || s.settlement_code,
    getCellValue: (col, s) => {
      switch (col.key) {
        case 'code':     return escapeHtml(s.settlement_code || s.contract_code || '-');
        case 'status':   return renderBadge('settlement_status', stlStatus(s));
        case 'partner':  return escapeHtml(stlPartnerName(s));
        case 'date':     return escapeHtml(formatShortDate(s.completed_at));
        case 'ptype':    return renderBadge('product_type', stlPtype(s));
        case 'car':      return escapeHtml(stlCar(s));
        case 'model':    return escapeHtml(stlModel(s));
        case 'customer': return escapeHtml(stlCustomer(s));
        case 'month':    return escapeHtml(s.rent_month ? `${s.rent_month}개월` : '-');
        case 'rent':     return escapeHtml(fmtMoney(Number(s.rent_amount || 0)));
        case 'deposit':  return escapeHtml(fmtMoney(Number(s.deposit_amount || 0)));
        case 'fee':      return escapeHtml(fmtMoney(stlFee(s)));
        case 'channel':  return escapeHtml(stlChannel(s));
        case 'agent':    return escapeHtml(stlAgent(s));
        default: return '';
      }
    },
    getCellText: (col, s) => {
      switch (col.key) {
        case 'status':  return stlStatus(s);
        case 'partner': return stlPartnerName(s);
        case 'date':    return formatShortDate(s.completed_at);
        case 'ptype':   return stlPtype(s);
        case 'model':   return stlModel(s);
        case 'month':   return s.rent_month ? `${s.rent_month}개월` : '-';
        case 'channel': return stlChannel(s);
        case 'agent':   return stlAgent(s);
        default: return '';
      }
    },
  });
}


function exportStlCSV() {
  const items = getStlFiltered();
  if (!items.length) { showToast('조건에 맞는 정산 내역이 없습니다.', 'error'); return; }

  const headers = ['정산코드', '정산상태', '공급사명', '계약완료일', '상품구분', '차량번호', '세부모델', '고객명', '계약기간', '대여료', '보증금', '수수료', '영업채널', '영업자'];
  const rows = items.map(s => [
    s.settlement_code || s.contract_code || '',
    stlStatus(s),
    stlPartnerName(s),
    fmtDate(s.completed_at),
    stlPtype(s),
    stlCar(s),
    stlModel(s),
    stlCustomer(s),
    s.rent_month ? `${s.rent_month}개월` : '',
    Number(s.rent_amount || 0),
    Number(s.deposit_amount || 0),
    stlFee(s),
    stlChannel(s),
    stlAgent(s),
  ]);

  const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const label = [stlFilterYear, stlFilterMonth].filter(Boolean).join('-') || '전체';
  a.download = `정산서_${label}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function renderStlFilterSelects() {
  const yearEl = document.getElementById('adminStlYear');
  const monthEl = document.getElementById('adminStlMonth');
  const partnerEl = document.getElementById('adminStlPartner');
  const channelEl = document.getElementById('adminStlChannel');
  const agentEl = document.getElementById('adminStlAgent');

  // 연도
  if (yearEl) {
    const years = [...new Set(allSettlements.map(s => getStlItemMonth(s).split('-')[0]).filter(Boolean))].sort().reverse();
    const prev = yearEl.value;
    yearEl.innerHTML = '<option value="">전체 연도</option>' + years.map(y => `<option value="${y}">${y}년</option>`).join('');
    if (prev && years.includes(prev)) yearEl.value = prev;
    else if (!prev) { yearEl.value = prevYearMonth().split('-')[0]; stlFilterYear = yearEl.value; }
  }
  // 월
  if (monthEl) {
    const prev = monthEl.value;
    monthEl.innerHTML = '<option value="">전체 월</option>' + Array.from({ length: 12 }, (_, i) => {
      const m = String(i + 1).padStart(2, '0');
      return `<option value="${m}">${i + 1}월</option>`;
    }).join('');
    if (prev) monthEl.value = prev;
    else { monthEl.value = prevYearMonth().split('-')[1]; stlFilterMonth = monthEl.value; }
  }
  // 공급사
  if (partnerEl) {
    const codes = [...new Set(allSettlements.map(s => stlPartner(s)).filter(v => v && v !== '-'))].sort();
    const prev = partnerEl.value;
    partnerEl.innerHTML = '<option value="">전체 공급사</option>' + codes.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(partnerNameMap.get(c) || c)}</option>`).join('');
    if (prev && codes.includes(prev)) partnerEl.value = prev;
  }
  // 영업채널
  if (channelEl) {
    const codes = [...new Set(allSettlements.map(s => stlChannel(s)).filter(v => v && v !== '-'))].sort();
    const prev = channelEl.value;
    channelEl.innerHTML = '<option value="">전체 영업채널</option>' + codes.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    if (prev && codes.includes(prev)) channelEl.value = prev;
  }
  // 영업자
  if (agentEl) {
    const codes = [...new Set(allSettlements.map(s => stlAgent(s)).filter(v => v && v !== '-'))].sort();
    const prev = agentEl.value;
    agentEl.innerHTML = '<option value="">전체 영업자</option>' + codes.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    if (prev && codes.includes(prev)) agentEl.value = prev;
  }
}

function bindStlEvents() {
  const csvBtn = document.getElementById('adminStlExportCsv');
  csvBtn?.addEventListener('click', exportStlCSV);

  const onChange = () => {
    stlFilterYear = document.getElementById('adminStlYear')?.value || '';
    stlFilterMonth = document.getElementById('adminStlMonth')?.value || '';
    stlFilterPartner = document.getElementById('adminStlPartner')?.value || '';
    stlFilterChannel = document.getElementById('adminStlChannel')?.value || '';
    stlFilterAgent = document.getElementById('adminStlAgent')?.value || '';
    renderStlList();
  };
  ['adminStlYear', 'adminStlMonth', 'adminStlPartner', 'adminStlChannel', 'adminStlAgent'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', onChange);
  });
}

// ─── 재고 일괄삭제 ──────────────────────────────────────────────────────────

let allStockProducts = [];
let stockSelectedPartner = '';
const stockChecked = new Set();

function renderStockPartnerSelect() {
  const select = document.getElementById('adminStockPartner');
  if (!select) return;
  const codes = [...new Set(allStockProducts.map(p => p.provider_company_code || p.partner_code).filter(Boolean))].sort();
  const prev = select.value;
  select.innerHTML = '<option value="">전체 파트너</option>' + codes.map(c => {
    const name = partnerNameMap.get(c) || c;
    return `<option value="${escapeHtml(c)}">${escapeHtml(c)} / ${escapeHtml(name)}</option>`;
  }).join('');
  if (prev && codes.includes(prev)) select.value = prev;
}

function getStockFiltered() {
  if (!stockSelectedPartner) return allStockProducts;
  return allStockProducts.filter(p => (p.provider_company_code || p.partner_code) === stockSelectedPartner);
}

function renderStockList() {
  const container = document.getElementById('adminStockList');
  const countEl = document.getElementById('adminStockCount');
  if (!container) return;
  const items = getStockFiltered();
  if (countEl) countEl.textContent = items.length ? `${items.length}대` : '';
  if (!items.length) {
    container.innerHTML = '<div class="list-empty" style="padding:40px;text-align:center;color:#94a3b8;">등록된 재고가 없습니다.</div>';
    return;
  }
  container.innerHTML = `<table class="pls-table" style="min-width:800px;"><thead><tr>
    <th style="width:40px;text-align:center;"><input type="checkbox" id="adminStockCheckAll"></th>
    <th>공급사</th><th>차량번호</th><th>제조사</th><th>모델명</th><th>세부모델</th><th>상품구분</th><th>차량상태</th>
  </tr></thead><tbody>${items.map(p => {
    const key = p.product_uid || p.product_code || p._key || '';
    const checked = stockChecked.has(key) ? ' checked' : '';
    return `<tr data-stock-key="${escapeHtml(key)}">
      <td style="text-align:center;"><input type="checkbox" class="stock-check" data-key="${escapeHtml(key)}"${checked}></td>
      <td>${escapeHtml(p.provider_company_code || p.partner_code || '')}</td>
      <td>${escapeHtml(p.car_number || '')}</td>
      <td>${escapeHtml(p.maker || '')}</td>
      <td>${escapeHtml(p.model_name || '')}</td>
      <td>${escapeHtml(String(p.sub_model || '').replace(/20(\d{2})~/g, '$1~'))}</td>
      <td>${escapeHtml(p.product_type || '')}</td>
      <td>${escapeHtml(p.vehicle_status || '')}</td>
    </tr>`;
  }).join('')}</tbody></table>`;
  // 헤더 체크박스 동기화
  const headerCheck = document.getElementById('adminStockCheckAll');
  if (headerCheck) headerCheck.checked = items.every(p => stockChecked.has(p.product_uid || p.product_code || p._key || ''));
}

function bindStockEvents() {
  const select = document.getElementById('adminStockPartner');
  const container = document.getElementById('adminStockList');
  const selectAllBtn = document.getElementById('adminStockSelectAll');
  const deselectAllBtn = document.getElementById('adminStockDeselectAll');
  const deleteBtn = document.getElementById('adminStockDeleteSelected');

  select?.addEventListener('change', () => {
    stockSelectedPartner = select.value;
    stockChecked.clear();
    renderStockList();
  });

  container?.addEventListener('change', (e) => {
    const input = e.target.closest('.stock-check');
    if (input) {
      if (input.checked) stockChecked.add(input.dataset.key);
      else stockChecked.delete(input.dataset.key);
      // 헤더 체크박스 동기화
      const items = getStockFiltered();
      const headerCheck = document.getElementById('adminStockCheckAll');
      if (headerCheck) headerCheck.checked = items.length > 0 && items.every(p => stockChecked.has(p.product_uid || p.product_code || p._key || ''));
      return;
    }
    // 헤더 체크박스
    if (e.target.id === 'adminStockCheckAll') {
      const items = getStockFiltered();
      if (e.target.checked) items.forEach(p => stockChecked.add(p.product_uid || p.product_code || p._key || ''));
      else items.forEach(p => stockChecked.delete(p.product_uid || p.product_code || p._key || ''));
      renderStockList();
    }
  });

  selectAllBtn?.addEventListener('click', () => {
    getStockFiltered().forEach(p => stockChecked.add(p.product_uid || p.product_code || p._key || ''));
    renderStockList();
  });

  deselectAllBtn?.addEventListener('click', () => {
    stockChecked.clear();
    renderStockList();
  });

  deleteBtn?.addEventListener('click', async () => {
    if (!stockChecked.size) { showToast('삭제할 차량을 선택하세요.', 'error'); return; }
    const ok = await showConfirm(`선택한 ${stockChecked.size}대의 재고를 삭제할까요?\n\n삭제된 재고는 복구할 수 없습니다.`);
    if (!ok) return;
    const { deleteProduct } = await import('../firebase/firebase-db.js');
    let deleted = 0;
    for (const key of stockChecked) {
      try { await deleteProduct(key); deleted++; } catch (e) { console.warn('삭제 실패', key, e); }
    }
    stockChecked.clear();
    showToast(`${deleted}대 삭제 완료`, 'success');
  });
}

// ─── 안내사항 관리 ───────────────────────────────────────────────────────────

async function uploadNoticeImage(file) {
  const path = `notice-images/${currentProfile.uid}/${Date.now()}_${file.name}`;
  const r = sRef(storage, path);
  const metadata = { contentType: file.type || 'image/png' };
  await uploadBytes(r, file, metadata);
  return { url: await getDownloadURL(r), storageRef: r };
}

let noticeImgFile = null;   // 새로 선택한 파일
let noticeImgUrl  = null;   // 기존 이미지 URL (선택된 항목)
let noticeImgCleared = false;
let selectedNoticeId = null;
let noticeItems = [];       // 최신 목록 캐시
let noticeFormMode = 'idle'; // 'idle' | 'view' | 'edit' | 'create'
let _applyNoticeMode = null; // assigned in bindNoticeEvents

function renderNoticeThumb(src) {
  const thumbList = document.getElementById('adminNoticeThumbList');
  if (!thumbList) return;
  if (!src) { thumbList.innerHTML = ''; return; }
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  thumbList.innerHTML = `
    <div class="img-thumb-item">
      <div class="img-thumb-media"><img src="${url}" alt=""></div>
      <button type="button" class="img-thumb-remove" id="adminNoticeImgRemove" title="제거">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`;
}

function clearNoticeImg() {
  noticeImgFile = null; noticeImgUrl = null; noticeImgCleared = true;
  const imgInput = document.getElementById('admin_notice_img');
  if (imgInput) imgInput.value = '';
  renderNoticeThumb(null);
}

function setNoticeMode(mode) {
  // mode: 'idle' | 'view' | 'create' | 'edit'
  noticeFormMode = mode;
  const form    = document.getElementById('adminNoticeForm');
  const hint    = document.getElementById('adminNoticeIdleHint');
  const imgBtn  = document.getElementById('adminNoticeImgPickBtn');

  _applyNoticeMode?.(mode, { deleteEnabled: !!selectedNoticeId });

  // applyManagedFormMode가 .panel-head-title 을 덮어쓰므로 복원
  const workspaceTitle = document.getElementById('adminWorkspaceTitle');
  if (workspaceTitle) workspaceTitle.textContent = '안내사항 관리';

  if (hint)   hint.hidden   = mode !== 'idle';
  if (form)   form.hidden   = mode === 'idle';
  if (imgBtn) imgBtn.hidden = mode === 'view';

  // edit 모드일 때만 dirty 체크 (create는 dirty 체크 불필요)
  if (mode === 'edit') setDirtyCheck(() => noticeFormMode === 'edit');
  else clearDirtyCheck();
}

function selectNotice(notice) {
  selectedNoticeId = notice.id;
  document.querySelectorAll('#adminNoticeList .admin-notice-row').forEach(r => {
    r.classList.toggle('is-active', r.dataset.noticeId === notice.id);
  });
  document.getElementById('admin_notice_title').value = notice.title || '';
  document.getElementById('admin_notice_body').value  = notice.body  || '';
  noticeImgFile = null; noticeImgCleared = false;
  noticeImgUrl  = notice.image_url || null;
  renderNoticeThumb(noticeImgUrl || null);
  setNoticeMode('view');
}

function deselectNotice() {
  selectedNoticeId = null;
  document.querySelectorAll('#adminNoticeList .admin-notice-row').forEach(r => r.classList.remove('is-active'));
  document.getElementById('admin_notice_title').value = '';
  document.getElementById('admin_notice_body').value  = '';
  clearNoticeImg();
  setNoticeMode('idle');
}

function renderNoticeList() {
  const noticeList = document.getElementById('adminNoticeList');
  if (!noticeList) return;
  if (!noticeItems.length) {
    noticeList.innerHTML = '<div class="list-empty">등록된 안내사항이 없습니다.</div>';
    return;
  }
  noticeList.innerHTML = noticeItems.map(n => `
    <div class="admin-notice-row${selectedNoticeId === n.id ? ' is-active' : ''}" data-notice-id="${escapeHtml(n.id)}">
      ${n.image_url ? '<svg class="admin-notice-img-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" title="이미지 첨부"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>' : ''}
      <span class="admin-notice-title">${escapeHtml(n.title || '제목 없음')}</span>
      <span class="admin-notice-writer">${escapeHtml(n.writer_name || '관리자')}</span>
      <span class="admin-notice-date">${fmtDate(n.created_at)}</span>
    </div>
  `).join('');
}

function bindNoticeEvents() {
  const noticeForm  = document.getElementById('adminNoticeForm');
  const noticeMsg   = document.getElementById('adminNoticeMessage');
  const noticeList  = document.getElementById('adminNoticeList');
  const imgInput    = document.getElementById('admin_notice_img');
  const editSaveBtn = document.getElementById('adminNoticeEditSave');
  const deleteBtn   = document.getElementById('adminNoticeDelete');

  // createManagedFormModeApplier로 폼 모드 관리
  _applyNoticeMode = createManagedFormModeApplier({
    form: noticeForm,
    panelLabel: '안내사항',
    getIdentity: () => '',
    isSelected: () => !!selectedNoticeId,
    submitButtons: [editSaveBtn],
    deleteButtons: [deleteBtn],
  });
  applyManagementButtonTones({ submitButtons: [editSaveBtn], deleteButtons: [deleteBtn] });

  const onImgChange = () => {
    const file = imgInput.files?.[0];
    if (file) { noticeImgFile = file; noticeImgCleared = false; renderNoticeThumb(file); }
  };
  imgInput?.addEventListener('change', onImgChange);
  registerPageCleanup(() => imgInput?.removeEventListener('change', onImgChange));

  const thumbList = document.getElementById('adminNoticeThumbList');
  const onThumbClick = e => { if (e.target.closest('#adminNoticeImgRemove')) clearNoticeImg(); };
  thumbList?.addEventListener('click', onThumbClick);
  registerPageCleanup(() => thumbList?.removeEventListener('click', onThumbClick));

  // 목록 클릭 → 선택 (edit 중이면 확인)
  const onNoticeListClick = async (e) => {
    const row = e.target.closest('.admin-notice-row');
    if (!row) return;
    if (noticeFormMode === 'edit' && !await showConfirm('수정/등록을 중단하시겠습니까?\n저장하지 않은 내용은 사라집니다.')) return;
    const id = row.dataset.noticeId;
    const notice = noticeItems.find(n => n.id === id);
    if (notice) selectNotice(notice);
  };
  noticeList?.addEventListener('click', onNoticeListClick);
  registerPageCleanup(() => noticeList?.removeEventListener('click', onNoticeListClick));

  // 신규
  const noticeNewBtn = document.getElementById('adminNoticeNew');
  const onNoticeNew = async () => {
    if (noticeFormMode === 'edit' && !await showConfirm('수정/등록을 중단하시겠습니까?\n저장하지 않은 내용은 사라집니다.')) return;
    selectedNoticeId = null;
    document.querySelectorAll('#adminNoticeList .admin-notice-row').forEach(r => r.classList.remove('is-active'));
    noticeForm?.reset();
    clearNoticeImg();
    setNoticeMode('create');
    document.getElementById('admin_notice_title')?.focus();
    showToast('신규 등록 상태입니다.', 'info');
  };
  noticeNewBtn?.addEventListener('click', onNoticeNew);
  registerPageCleanup(() => noticeNewBtn?.removeEventListener('click', onNoticeNew));

  // 수정/저장 버튼 (2-step)
  const onEditSave = async () => {
    const currentMode = noticeFormMode; // confirm await 중 모드 변경 방지를 위해 스냅샷
    if (currentMode === 'view') {
      if (!await showConfirm('수정하시겠습니까?')) return;
      setNoticeMode('edit');
      if (noticeMsg) noticeMsg.textContent = '';
      return;
    }
    if (currentMode === 'edit' || currentMode === 'create') {
      if (!await showConfirm('저장하시겠습니까?')) return;
      noticeForm?.requestSubmit();
    }
  };
  editSaveBtn?.addEventListener('click', onEditSave);
  registerPageCleanup(() => editSaveBtn?.removeEventListener('click', onEditSave));

  // 저장 (신규/수정)
  let noticeSaving = false;
  const onNoticeSubmit = async (e) => {
    e.preventDefault();
    if (noticeSaving) return;
    noticeSaving = true;
    const title = document.getElementById('admin_notice_title')?.value.trim();
    const body  = document.getElementById('admin_notice_body')?.value.trim();
    if (!title || !body) { noticeSaving = false; if (noticeMsg) noticeMsg.textContent = '제목과 내용을 모두 입력하세요.'; return; }
    if (noticeMsg) noticeMsg.textContent = '';
    if (editSaveBtn) editSaveBtn.disabled = true;
    let _uploadedRef = null;
    try {
      let image_url;
      if (noticeImgFile) {
        if (noticeMsg) noticeMsg.textContent = '업로드 중…';
        const { url, storageRef } = await uploadNoticeImage(noticeImgFile);
        image_url = url;
        _uploadedRef = storageRef;
        if (noticeMsg) noticeMsg.textContent = '';
      } else if (!noticeImgCleared && noticeImgUrl) {
        image_url = noticeImgUrl;
      }
      if (selectedNoticeId) {
        const updates = { title, body };
        if (image_url !== undefined) updates.image_url = image_url;
        else if (noticeImgCleared) updates.image_url = null;
        const existing = noticeItems.find(n => n.id === selectedNoticeId) || {};
        const payload = { ...existing, ...updates };
        delete payload.id;
        await set(ref(db, `home_notices/${selectedNoticeId}`), payload);
        selectNotice({ ...existing, ...updates, id: selectedNoticeId });
      } else {
        const data = {
          title, body,
          writer_uid: currentProfile.uid,
          writer_name: currentProfile.name || currentProfile.user_name || currentProfile.email || '관리자',
          created_at: Date.now(),
        };
        if (image_url) data.image_url = image_url;
        await set(push(ref(db, 'home_notices')), data);
        deselectNotice();
      }
      showToast('저장 완료', 'success');
    } catch (err) {
      if (_uploadedRef) deleteObject(_uploadedRef).catch(() => {});
      if (noticeMsg) noticeMsg.textContent = err.message;
      showToast(`저장 실패: ${err.message}`, 'error');
      if (editSaveBtn) editSaveBtn.disabled = false;
    } finally {
      noticeSaving = false;
    }
  };
  noticeForm?.addEventListener('submit', onNoticeSubmit);
  registerPageCleanup(() => noticeForm?.removeEventListener('submit', onNoticeSubmit));

  // 삭제
  const onNoticeDelete = async () => {
    if (!selectedNoticeId) return;
    if (!await showConfirm('이 안내사항을 삭제하시겠습니까?')) return;
    try {
      await remove(ref(db, `home_notices/${selectedNoticeId}`));
      deselectNotice();
      showToast('삭제 완료', 'success');
    } catch (err) {
      if (noticeMsg) noticeMsg.textContent = err.message;
      showToast(`삭제 실패: ${err.message}`, 'error');
    }
  };
  deleteBtn?.addEventListener('click', onNoticeDelete);
  registerPageCleanup(() => deleteBtn?.removeEventListener('click', onNoticeDelete));

  const unsubNotice = onValue(ref(db, 'home_notices'), (snap) => {
    const raw = snap.val() || {};
    noticeItems = Object.entries(raw)
      .map(([id, v]) => ({ id, ...(v || {}) }))
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    renderNoticeList();
  });
  registerPageCleanup(unsubNotice);
  registerPageCleanup(() => clearDirtyCheck());
}

// ─── 초기화 ─────────────────────────────────────────────────────────────────

async function bootstrap() {
  try {
    // 매 마운트마다 상태 초기화
    allSettlements = [];
    stlFilterYear = ''; stlFilterMonth = '';
    stlFilterPartner = ''; stlFilterChannel = ''; stlFilterAgent = '';

    const { user, profile } = await requireAuth({ roles: ['admin'] });
    currentProfile = { ...profile, uid: user.uid };
    renderRoleMenu(menu, profile.role);

    const onAdminMenuClick = async (e) => {
      const btn = e.target.closest('.admin-menu-item');
      if (!btn) return;
      const panel = document.querySelector('.admin-workspace-panel');
      const isDirty = panel && (panel.dataset.panelMode === 'edit' || panel.dataset.panelMode === 'create');
      if (isDirty) {
        const ok = await showConfirm('수정/등록을 중단하시겠습니까?\n저장하지 않은 내용은 사라집니다.');
        if (!ok) return;
      }
      switchTab(btn.dataset.tab);
    };
    adminMenu?.addEventListener('click', onAdminMenuClick);
    registerPageCleanup(() => adminMenu?.removeEventListener('click', onAdminMenuClick));

    // 정산서 관리
    bindStlEvents();

    renderSkeletonRows(document.getElementById('adminStlList'), ADMIN_STL_COLS, 8);
    registerPageCleanup(watchPartners((items) => {
      partnerNameMap = new Map((items || []).map(p => [p.partner_code, p.partner_name || p.partner_code]));
      renderStlList();
    }));
    registerPageCleanup(watchProducts((items) => {
      const products = items || [];
      productTypeMap = new Map(products.filter(p => p.car_number).map(p => [p.car_number, p.product_type || '']));
      allStockProducts = products.filter(p => p.status !== 'deleted');
      renderStlList();
    }));
    registerPageCleanup(watchSettlements((items) => {
      allSettlements = (items || []).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      renderStlFilterSelects();
      renderStlList();
    }));

    // 재고 일괄삭제
    bindStockEvents();

    // 안내사항 관리
    bindNoticeEvents();

    // 초기 탭 상단바 반영
    switchTab('settlement');

  } catch (error) {
    console.error('[admin] bootstrap error:', error);
    showToast('관리자 페이지 로드 실패: ' + error.message, 'error');
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
