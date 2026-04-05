/**
 * mobile-shell.js
 * 768px 이하 모바일 ERP 쉘
 * - 상단 타이틀바 우측: 소속 · 이름 · 직급
 * - 하단 탭바: 상품 / 대화 / 계약 (3개)
 */

import { requireAuth } from './auth-guard.js';
import { logoutCurrentUser } from '../firebase/firebase-auth.js';
import { getPageTitle } from './role-menu.js';
import { showConfirm } from './toast.js';
import { isPageDirty } from '../app.js';

const mq = window.matchMedia('(max-width: 768px)');
if (!mq.matches) { /* 데스크탑 — 아무 작업 없음 */ }

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
  // sidebar-chat-badge는 페이지 JS가 renderRoleMenu() 호출 후 생성되므로 대기
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
  tabBar.innerHTML = TABS.map((t) => {
    const isActive = path === t.href;
    return `<a class="mobile-tab${isActive ? ' is-active' : ''}" href="${t.href}" data-href="${t.href}">
      ${icon(t.icon)}
      ${t.badge ? `<span class="mobile-tab__badge" id="mobile-chat-badge" hidden></span>` : ''}
      <span class="mobile-tab__label">${t.label}</span>
    </a>`;
  }).join('');
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

// ─── 모바일 뒤로가기 ──────────────────────────────────────────────────────────

let _mobileBackHandler = null;

/** 페이지별 뒤로가기 핸들러 등록. fn()이 true를 반환하면 "처리됨"으로 간주. */
window.setMobileBackHandler = (fn) => { _mobileBackHandler = fn; };
window.clearMobileBackHandler = () => { _mobileBackHandler = null; };

function navigateToProductList() {
  const tab = tabBar?.querySelector('.mobile-tab[data-href="/product-list"]');
  if (tab) tab.click();
  else window.location.href = '/product-list';
}

async function handleMobileBack() {
  // 1. 페이지별 핸들러 (채팅방 닫기, 계약폼 닫기)
  if (_mobileBackHandler) {
    const handled = await _mobileBackHandler();
    if (handled) return true; // 앱 안에서 처리됨
  }

  // 2. 상품목록 → 종료 확인
  const page = window.__currentPage || '';
  if (page === '/product-list') {
    const exit = await showConfirm('앱을 종료하시겠습니까?');
    if (exit) {
      // 확인: 트랩 entry가 이미 pop됐으므로 한 번 더 뒤로가기
      history.go(-1);
      return false;
    }
    return true; // 취소: 트랩 유지
  }

  // 3. 나머지 페이지 → 편집 중이면 확인 후 상품목록으로
  if (isPageDirty()) {
    const ok = await showConfirm('수정/등록을 중단하시겠습니까?\n저장하지 않은 내용은 사라집니다.');
    if (!ok) return true;
  }
  navigateToProductList();
  return true;
}

/** 뒤로가기 버튼 표시/숨김 — chat.js, contract-manage.js에서 호출 */
window.showMobileBackBtn = () => {
  const btn = document.getElementById('mobile-back-btn');
  if (btn) btn.hidden = false;
};
window.hideMobileBackBtn = () => {
  const btn = document.getElementById('mobile-back-btn');
  if (btn) btn.hidden = true;
};

/** visualViewport: 키보드 올라올 때 채팅 패널 bottom 조정 */
function initKeyboardAdjust() {
  if (!window.visualViewport) return;
  const TAB_H = 56;
  window.visualViewport.addEventListener('resize', () => {
    if (!document.body.classList.contains('chat-m-open')) return;
    const panel = document.querySelector('.layout-633');
    if (!panel) return;
    const kbHeight = window.innerHeight - window.visualViewport.height;
    panel.style.bottom = kbHeight > 50
      ? `${kbHeight}px`                                    // 키보드 열림: 탭바 무시
      : `calc(${TAB_H}px + env(safe-area-inset-bottom))`; // 키보드 닫힘: 원래대로
  });
}

function initMobileBackTrap() {
  if (!mq.matches) return;
  history.pushState({ mobileBack: true }, '');

  window.addEventListener('popstate', async () => {
    const keepInApp = await handleMobileBack();
    if (keepInApp) {
      history.pushState({ mobileBack: true }, '');
    }
  });
}

// ─── 초기화 ──────────────────────────────────────────────────────────────────

requireAuth().then(({ profile }) => {
  renderTabBar();
  renderTopbarUser(profile);
  updateActiveTab();
  initMobileBackTrap();
  initKeyboardAdjust();
}).catch(() => {});
