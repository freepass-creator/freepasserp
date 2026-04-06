/**
 * mobile-shell.js
 * 768px 이하 모바일 ERP 쉘
 * - 상단 타이틀바 좌측: 소속 · 이름 · 직급
 * - 하단 탭바: 상품 / 대화 / 계약 / 설정 / 필터(조건부)
 */

import { requireAuth } from './auth-guard.js';
import { showConfirm } from './toast.js';
import { isPageDirty } from './dirty-check.js';

const isMobile = document.documentElement.classList.contains('is-mobile');
const mq = window.matchMedia('(max-width: 768px)');
if (!isMobile) { /* 데스크탑/웹 브라우저 — 모바일 쉘 비활성화 */ }

// ─── 탭 정의 ──────────────────────────────────────────────────────────────────

const TABS = [
  { href: '/product-list', label: '상품',   icon: 'car' },
  { href: '/chat',         label: '대화',   icon: 'chat', badge: true },
  { href: '/contract',     label: '계약',   icon: 'contract' },
  { href: '/settings',     label: '설정',   icon: 'settings' },
];

// ─── SVG 아이콘 ───────────────────────────────────────────────────────────────

function icon(name, size = 22) {
  const paths = {
    car:      `<path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8"/><path d="M7 14h.01"/><path d="M17 14h.01"/><rect width="18" height="8" x="3" y="10" rx="2"/><path d="M5 18v2"/><path d="M19 18v2"/>`,
    chat:     `<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/><path d="M8 12h.01"/><path d="M12 12h.01"/><path d="M16 12h.01"/>`,
    contract: `<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-.5"/><path d="M16 4h2a2 2 0 0 1 1.73 1"/><path d="M8 18h1"/><path d="M21.378 12.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/>`,
    settings: `<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>`,
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
}

// ─── 탭 active 업데이트 ───────────────────────────────────────────────────────

const tabBar = document.getElementById('mobile-tab-bar');

function updateActiveTab() {
  const path = window.location.pathname;
  tabBar?.querySelectorAll('.mobile-tab[data-href]').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.href === path);
  });
}

window.addEventListener('popstate', updateActiveTab);
const _origPushState = history.pushState.bind(history);
history.pushState = function (...args) {
  _origPushState(...args);
  updateActiveTab();
};

// ─── 채팅 뱃지 미러링 ────────────────────────────────────────────────────────

function mirrorChatBadge() {
  function attach(src) {
    const dst = document.getElementById('mobile-chat-badge');
    if (!dst) return;
    const sync = () => { dst.textContent = src.textContent; dst.hidden = src.hidden; };
    sync();
    new MutationObserver(sync).observe(src, { attributes: true, childList: true, characterData: true, subtree: true });
  }
  const existing = document.getElementById('sidebar-chat-badge');
  if (existing) { attach(existing); return; }
  const waitObs = new MutationObserver((_, obs) => {
    const badge = document.getElementById('sidebar-chat-badge');
    if (!badge) return;
    obs.disconnect();
    attach(badge);
  });
  waitObs.observe(document.body, { childList: true, subtree: true });
}

// ─── 탭바 렌더링 ──────────────────────────────────────────────────────────────

function renderTabBar() {
  if (!tabBar) return;
  const path = window.location.pathname;

  // 일반 탭
  let html = TABS.map((t) => {
    const isActive = path === t.href;
    return `<a class="mobile-tab${isActive ? ' is-active' : ''}" href="${t.href}" data-href="${t.href}">
      ${icon(t.icon)}
      ${t.badge ? `<span class="mobile-tab__badge" id="mobile-chat-badge" hidden></span>` : ''}
      <span class="mobile-tab__label">${t.label}</span>
    </a>`;
  }).join('');

  tabBar.innerHTML = html;
  mirrorChatBadge();
}

// ─── 탑바 유저정보 ───────────────────────────────────────────────────────────

function renderTopbarUser(profile) {
  const company  = profile?.company_name || profile?.company || '';
  const name     = profile?.name || profile?.user_name || '';
  const rank     = profile?.position || profile?.rank || '';

  const companyEl = document.getElementById('mobile-topbar-company');
  const nameEl    = document.getElementById('mobile-topbar-name');
  const rankEl    = document.getElementById('mobile-topbar-rank');

  if (companyEl) companyEl.textContent = company;
  if (nameEl)    nameEl.textContent    = name;
  if (rankEl)    rankEl.textContent    = rank;
}

// ─── 모바일 뒤로가기 (핸드폰 뒤로가기 버튼 사용) ─────────────────────────────

let _mobileBackHandler = null;

/** 페이지별 뒤로가기 핸들러 등록. fn()이 true를 반환하면 "처리됨"으로 간주. */
window.setMobileBackHandler = (fn) => { _mobileBackHandler = fn; };
window.clearMobileBackHandler = () => { _mobileBackHandler = null; };

// 하위 호환: 더 이상 뒤로가기 버튼 UI 없음 (핸드폰 뒤로가기 사용)
window.showMobileBackBtn = () => {};
window.hideMobileBackBtn = () => {};

function navigateToProductList() {
  const tab = tabBar?.querySelector('.mobile-tab[data-href="/product-list"]');
  if (tab) tab.click();
  else window.location.href = '/product-list';
}

async function handleMobileBack() {
  const page = window.__currentPage || '';

  // 0. 사진 뷰어 열려있으면 뷰어만 닫기
  const photoViewer = document.querySelector('.fp-photo-viewer:not([hidden])');
  if (photoViewer) {
    photoViewer.hidden = true;
    document.body.style.overflow = '';
    return true;
  }

  // 1. 필터 사이드바 열려있으면 닫기
  const openFilter = document.querySelector('.m-filter-sidebar.is-open, .catalog-sidebar.is-open');
  if (openFilter) {
    openFilter.classList.remove('is-open');
    const overlay = document.querySelector('.m-filter-overlay.is-open, .catalog-sidebar-overlay.is-open');
    overlay?.classList.remove('is-open');
    updateFilterIcon(false);
    return true;
  }

  // 2. 모바일 드로어 열려있으면 닫기
  const drawer = document.querySelector('.mobile-drawer:not([hidden])');
  const drawerOverlay = document.querySelector('.mobile-drawer-overlay:not([hidden])');
  if (drawer && !drawer.hidden) {
    drawer.hidden = true;
    if (drawerOverlay) drawerOverlay.hidden = true;
    return true;
  }

  // 3. 상품 상세 → 상품 목록
  const productDetail = document.getElementById('plsMDetail');
  if (productDetail && !productDetail.hidden) {
    productDetail.hidden = true;
    document.body.classList.remove('detail-open');
    return true;
  }

  // 4. 채팅창 → 채팅 목록 (입력 중이면 확인)
  if (document.body.classList.contains('chat-m-open')) {
    const msgInput = document.getElementById('message-input');
    if (msgInput && msgInput.value.trim()) {
      const ok = await showConfirm('작성 중인 메시지가 있어요.\n대화 목록으로 돌아갈까요?');
      if (!ok) return true;
    }
    document.body.classList.remove('chat-m-open');
    return true;
  }

  // 5. 계약 상세 → 계약 목록
  const contractDetail = document.getElementById('contract-m-detail');
  if (contractDetail && !contractDetail.hidden) {
    contractDetail.hidden = true;
    document.body.classList.remove('detail-open');
    return true;
  }

  // 6. 모든 페이지 — 종료 확인
  const exit = await showConfirm('프리패스 ERP를 종료할까요?');
  if (exit) { history.go(-1); return false; }
  return true;
}

/** iOS 에지 스와이프 등으로 popstate 발생 시 모바일 뷰 클래스 잔류 방지 */
function cleanupMobileViewClasses() {
  const MOBILE_VIEW_CLASSES = ['chat-m-open', 'contract-m-open'];
  MOBILE_VIEW_CLASSES.forEach(cls => document.body.classList.remove(cls));
}

function initMobileBackTrap() {
  if (!mq.matches) return;
  history.pushState({ mobileBack: true }, '');

  window.addEventListener('popstate', async () => {
    const keepInApp = await handleMobileBack();
    if (keepInApp) {
      // 핸들러가 처리하지 못한 잔류 클래스 정리
      cleanupMobileViewClasses();
      history.pushState({ mobileBack: true }, '');
    }
  });
}

// ─── 공통 모바일 필터 토글 ───────────────────────────────────────────────────
// 각 페이지 JS에서 window._mobileFilterConfig = { sidebar, overlay, close } 설정
// 상품목록은 자체 처리, 대화·계약은 여기서 공통 처리

function updateFilterIcon(open) {
  const btn = document.getElementById('mobile-filter-btn');
  if (!btn) return;
  const svg = btn.querySelector('svg');
  if (!svg) return;
  // < 기본(닫힘) → > 열림
  svg.innerHTML = open ? '<path d="m9 18 6-6-6-6"/>' : '<path d="m15 18-6-6 6-6"/>';
}

function initMobileFilterToggle() {
  const btn = document.getElementById('mobile-filter-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    // 상품목록은 자체 핸들러가 먼저 바인딩되므로 여기서는 대화·계약만 처리
    const page = window.__currentPage || '';
    if (page === '/product-list') return; // product-list.js에서 처리

    const cfg = window._mobileFilterConfig;
    if (!cfg) return;
    const sidebar = document.getElementById(cfg.sidebar);
    const overlay = document.getElementById(cfg.overlay);
    if (!sidebar) return;

    const isOpen = sidebar.classList.contains('is-open');
    if (isOpen) {
      sidebar.classList.remove('is-open');
      overlay?.classList.remove('is-open');
      updateFilterIcon(false);
    } else {
      sidebar.classList.add('is-open');
      overlay?.classList.add('is-open');
      updateFilterIcon(true);
    }
  });
}

// 공통 필터 닫기 (오버레이 클릭, X 버튼)
document.addEventListener('click', (e) => {
  const cfg = window._mobileFilterConfig;
  if (!cfg) return;
  const closeBtn = e.target.closest(`#${cfg.close}`);
  const overlayEl = e.target.id === cfg.overlay ? e.target : null;
  if (!closeBtn && !overlayEl) return;
  const sidebar = document.getElementById(cfg.sidebar);
  const overlay = document.getElementById(cfg.overlay);
  sidebar?.classList.remove('is-open');
  overlay?.classList.remove('is-open');
  updateFilterIcon(false);
});

// ─── 초기화 ──────────────────────────────────────────────────────────────────

if (isMobile) {
  requireAuth().then(({ profile }) => {
    renderTabBar();
    renderTopbarUser(profile);
    updateActiveTab();
    initMobileBackTrap();
    initMobileFilterToggle();
  }).catch(() => {});
}
