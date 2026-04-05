/**
 * app-mobile.js — 모바일 앱 전용 엔트리포인트
 * 데스크탑 app.js와 완전 분리. 탭 기반 SPA 네비게이션.
 * 사이드바/데스크탑 탑바/CSS 관리 로직 없음.
 */

import { showToast, showConfirm } from './core/toast.js';

const MAIN_SHELL_SELECTOR = '.main-shell';
let pendingNavigationPath = '';
let isPageNavigating = false;

const PAGE_MODULE_PATHS = {
  '/product-list': '/static/js/mobile/product-list.js',
  '/chat':         '/static/js/mobile/chat.js',
  '/contract':     '/static/js/mobile/contract.js',
  '/settings':     '/static/js/mobile/settings.js',
};

const pageCache = new Map();
let currentPageKey = '';

// ─── 작업 중 이탈 방지 (공통 모듈에서 가져옴) ────────────────────────────────
import { setDirtyCheck, clearDirtyCheck, isPageDirty } from './core/dirty-check.js';
export { setDirtyCheck, clearDirtyCheck, isPageDirty };

async function confirmLeave() {
  if (!isPageDirty()) return true;
  return showConfirm('수정/등록을 중단하시겠습니까?\n저장하지 않은 내용은 사라집니다.');
}

window.addEventListener('beforeunload', (e) => {
  if (isPageDirty()) { e.preventDefault(); e.returnValue = ''; }
});

// ─── 페이지 전환 ────────────────────────────────────────────────────────────

async function loadPage(url, options = {}) {
  const { pushState = true } = options;
  const nextPathname = new URL(url, window.location.origin).pathname;
  if (isPageNavigating && pendingNavigationPath === nextPathname) return;
  if (nextPathname === currentPageKey) return;

  isPageNavigating = true;
  pendingNavigationPath = nextPathname;

  try {
    const mainShell = document.querySelector(MAIN_SHELL_SELECTOR);
    if (!mainShell) { window.location.href = url; return; }

    // 이전 페이지 숨기기
    if (currentPageKey && currentPageKey !== nextPathname) {
      const cur = pageCache.get(currentPageKey);
      if (cur?.container) cur.container.style.display = 'none';
      if (cur?.module?.onHide) try { cur.module.onHide(); } catch (_) {}
      document.body.classList.remove('chat-m-open', 'contract-m-open');
      clearDirtyCheck();
    }

    let cached = pageCache.get(nextPathname);

    if (cached?.mounted) {
      cached.container.style.display = '';
      if (cached.module?.onShow) try { cached.module.onShow(); } catch (_) {}
    } else {
      const response = await fetch(url, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin'
      });
      if (!response.ok) { window.location.href = url; return; }

      const html = await response.text();
      const parser = new DOMParser();
      const nextDoc = parser.parseFromString(html, 'text/html');
      const nextMainShell = nextDoc.querySelector(MAIN_SHELL_SELECTOR);
      if (!nextMainShell) { window.location.href = url; return; }

      const modulePath = PAGE_MODULE_PATHS[nextPathname];
      const modulePromise = modulePath
        ? import(modulePath + '?v=' + (window.APP_VER || '1')).catch((e) => { console.error('[app-mobile] module error', e); return null; })
        : Promise.resolve(null);

      const container = document.createElement('div');
      container.className = 'page-tab';
      container.dataset.page = nextPathname;
      container.style.display = 'none';
      container.replaceChildren(...Array.from(nextMainShell.childNodes).map((n) => n.cloneNode(true)));
      mainShell.appendChild(container);

      const mod = await modulePromise;
      container.style.display = '';

      cached = {
        container,
        doc: nextDoc,
        bodyPage: nextDoc.body?.dataset?.page || '',
        module: mod,
        mounted: false
      };
      pageCache.set(nextPathname, cached);

      if (mod?.mount) {
        try { await mod.mount(); } catch (e) { console.error('[app-mobile] mount error', e); }
      }
      cached.mounted = true;
    }

    document.title = 'FREEPASS ERP';
    document.body.dataset.page = cached.bodyPage || '';
    currentPageKey = nextPathname;
    window.__currentPage = nextPathname;

    if (pushState) history.pushState({ page: nextPathname }, '', nextPathname);

  } finally {
    isPageNavigating = false;
    pendingNavigationPath = '';
  }
}

// ─── 초기 페이지 등록 ───────────────────────────────────────────────────────

function registerInitialPage() {
  const mainShell = document.querySelector(MAIN_SHELL_SELECTOR);
  if (!mainShell) return;
  const pathname = window.location.pathname;

  const container = document.createElement('div');
  container.className = 'page-tab';
  container.dataset.page = pathname;
  container.replaceChildren(...Array.from(mainShell.childNodes));
  mainShell.appendChild(container);

  pageCache.set(pathname, {
    container,
    doc: document,
    bodyPage: document.body.dataset.page || '',
    module: null,
    mounted: true
  });
  currentPageKey = pathname;
  window.__currentPage = pathname;
}

// ─── 탭 네비게이션 ─────────────────────────────────────────────────────────

function initTabNavigation() {
  document.addEventListener('click', async (event) => {
    const link = event.target.closest('.mobile-tab');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href || !href.startsWith('/')) return;

    const nextPathname = new URL(href, window.location.origin).pathname;
    if (nextPathname === currentPageKey || nextPathname === pendingNavigationPath) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    if (!await confirmLeave()) return;

    pendingNavigationPath = nextPathname;
    try {
      await loadPage(href);
    } catch (error) {
      console.error(error);
      window.location.href = href;
    }
  });

  window.addEventListener('popstate', async (event) => {
    const target = event.state?.page || window.location.pathname;
    if (!target || target === currentPageKey) return;
    if (!await confirmLeave()) {
      history.pushState({ page: currentPageKey }, '', currentPageKey);
      return;
    }
    try {
      await loadPage(target, { pushState: false });
    } catch (error) {
      console.error(error);
      window.location.href = target;
    }
  });
}

// ─── 초기화 ─────────────────────────────────────────────────────────────────

registerInitialPage();
const _initialPath = window.location.pathname;
history.replaceState({ page: _initialPath }, '', _initialPath);
initTabNavigation();

// 로그인 후 랜딩
const _landingTarget = localStorage.getItem('fp.landing_target');
if (_landingTarget) {
  localStorage.removeItem('fp.landing_target');
  if (_landingTarget !== _initialPath) {
    loadPage(_landingTarget).catch(() => { window.location.href = _landingTarget; });
  }
}

window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason;
  const raw = error?.message || String(error || '');
  if (!raw || raw.includes('auth/') || raw.includes('로그인')) return;
  const korean = raw.match(/[가-힣\s·,.:!?]+/g)?.join('').trim();
  showToast(korean || '처리 중 오류가 발생했습니다.', 'error');
});
