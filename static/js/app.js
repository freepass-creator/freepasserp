import { runPageCleanup } from './core/utils.js'; // logout/unload 시 사용
import { savePageState } from './core/page-state.js';
import { showToast, showConfirm } from './core/toast.js';

const PAGE_STYLE_SELECTOR = 'link[data-page-style], link[href*="/static/css/pages/"], link[href*="/static/css/shared_new/"]';
const DASHBOARD_SELECTOR = '.dashboard-shell';
const MAIN_SHELL_SELECTOR = '.main-shell';
let pendingNavigationPath = '';
let isPageNavigating = false;

// ═══════════════════════════════════════════════════════════════════════════
// 탭 전환 + 모듈 재실행 하이브리드
//
// - DOM: 컨테이너를 유지(hide/show)하여 뼈대가 즉시 보임
// - JS: ?v=N으로 매번 새 모듈 인스턴스 (이벤트 바인딩 재실행)
// - CSS: modulepreload로 코드 HTTP 캐시 → 네트워크 0ms
// - 재방문: 캐시된 HTML 컨테이너 재활용 + 모듈만 새로 실행
// ═══════════════════════════════════════════════════════════════════════════

const PAGE_MODULE_PATHS = {
  '/home':         '/static/js/pages/home.js',
  '/product-list': '/static/js/pages/product-list.js',
  '/chat':         '/static/js/pages/chat.js',
  '/contract':     '/static/js/pages/contract-manage.js',
  '/settlement':   '/static/js/pages/settlement-manage.js',
  '/product-new':  '/static/js/pages/product-manage.js',
  '/terms':        '/static/js/pages/policy-manage.js',
  '/partner':      '/static/js/pages/partner-manage.js',
  '/member':       '/static/js/pages/member-manage.js',
  '/admin':        '/static/js/pages/admin.js',
  '/settings':     '/static/js/pages/settings.js',
};

// 페이지별 캐시: { container, styles[], doc, title, bodyPage, module }
const pageCache = new Map();
let currentPageKey = '';

// ─── 우클릭 방지 ────────────────────────────────────────────────────────────
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ─── 작업 중 이탈 방지 ──────────────────────────────────────────────────────
let _dirtyCheck = null;

/** 페이지 모듈이 호출: 수정/등록 중이면 true를 반환하는 함수 등록 */
export function setDirtyCheck(fn) { _dirtyCheck = typeof fn === 'function' ? fn : null; }
export function clearDirtyCheck() { _dirtyCheck = null; }

function isPageDirty() { return typeof _dirtyCheck === 'function' && _dirtyCheck(); }

async function confirmLeave() {
  if (!isPageDirty()) return true;
  return showConfirm('수정/등록을 중단하시겠습니까?\n저장하지 않은 내용은 사라집니다.');
}

window.addEventListener('beforeunload', (e) => {
  if (isPageDirty()) { e.preventDefault(); e.returnValue = ''; }
});

// ─── 프리패치 ───────────────────────────────────────────────────────────────
const prefetched = new Set();

function prefetchModule(pathname) {
  if (prefetched.has(pathname)) return;
  const modulePath = PAGE_MODULE_PATHS[pathname];
  if (!modulePath) return;
  prefetched.add(pathname);
  const link = document.createElement('link');
  link.rel = 'modulepreload';
  link.href = modulePath;
  document.head.appendChild(link);
}

// ─── 유틸 ───────────────────────────────────────────────────────────────────

function isDashboardPage() {
  return Boolean(document.querySelector(DASHBOARD_SELECTOR));
}

function normalizeRequiredFields(root = document) {
  root.querySelectorAll('.field label').forEach((label) => {
    label.textContent = String(label.textContent || '').replace(/\s*\*+\s*$/, '').trim();
  });
  root.querySelectorAll('.field').forEach((field) => {
    const requiredControl = field.querySelector('input[required], select[required], textarea[required]');
    field.classList.toggle('is-required', Boolean(requiredControl));
  });
}

function setActiveSidebar(pathname) {
  document.querySelectorAll('.sidebar-link').forEach((link) => {
    const isActive = link.getAttribute('href') === pathname;
    link.classList.toggle('active', isActive);
  });
}

// ─── CSS 관리 ───────────────────────────────────────────────────────────────

function collectStyleHrefs(doc) {
  return [...doc.querySelectorAll(PAGE_STYLE_SELECTOR)].map((l) => l.href);
}

function ensureStyles(hrefs) {
  const currentHrefs = [...document.querySelectorAll(PAGE_STYLE_SELECTOR)].map((l) => l.href);
  const promises = hrefs
    .filter((href) => !currentHrefs.includes(href))
    .map((href) => new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.pageStyle = 'true';
      link.onload = resolve;
      link.onerror = resolve;
      document.head.appendChild(link);
    }));
  return Promise.all(promises);
}

// ─── 상단바 ─────────────────────────────────────────────────────────────────

function syncTopBar(nextDoc) {
  const curPageName = document.querySelector('.top-bar-page-name');
  const nextPageName = nextDoc?.querySelector('.top-bar-page-name');
  if (curPageName && nextPageName) curPageName.textContent = nextPageName.textContent;
}

// ─── 페이지 전환 ────────────────────────────────────────────────────────────

async function loadPage(url, options = {}) {
  const { pushState = true } = options;
  const nextPathname = new URL(url, window.location.origin).pathname;
  if (isPageNavigating && pendingNavigationPath === nextPathname) return;
  if (nextPathname === window.location.pathname && pushState) return;

  isPageNavigating = true;
  pendingNavigationPath = nextPathname;

  try {
    const mainShell = document.querySelector(MAIN_SHELL_SELECTOR);
    if (!mainShell) { window.location.href = url; return; }

    // ── 이전 페이지 숨기기 (Firebase 구독 유지 — cleanup 없음) ──
    if (currentPageKey && currentPageKey !== nextPathname) {
      const cur = pageCache.get(currentPageKey);
      if (cur?.container) {
        savePageState(currentPageKey, { scrollTop: cur.container.scrollTop || 0, _autoSaved: true });
        cur.container.style.display = 'none';
      }
      clearDirtyCheck();
    }

    let cached = pageCache.get(nextPathname);

    if (cached?.mounted) {
      // ── 재방문: 컨테이너 즉시 표시 (구독 살아있음, DOM 최신) ──
      cached.container.style.display = '';
      if (cached.doc) syncTopBar(cached.doc);
      // top-bar-actions 교체 후 이벤트 재바인딩
      if (cached.module && typeof cached.module.onShow === 'function') {
        try { cached.module.onShow(); } catch (_) {}
      }
    } else {
      // ── 처음 방문: HTML fetch + mount (1회) ──
      prefetchModule(nextPathname);
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

      const styleHrefs = collectStyleHrefs(nextDoc);
      await ensureStyles(styleHrefs);

      const container = document.createElement('div');
      container.className = 'page-tab';
      container.dataset.page = nextPathname;
      container.replaceChildren(...Array.from(nextMainShell.childNodes).map((n) => n.cloneNode(true)));
      mainShell.appendChild(container);

      cached = {
        container,
        styles: styleHrefs,
        doc: nextDoc,
        title: nextDoc.title || '',
        bodyPage: nextDoc.body?.dataset?.page || '',
        module: null,
        mounted: false
      };
      pageCache.set(nextPathname, cached);
      syncTopBar(nextDoc);

      // 기존 script 태그 제거
      document.querySelectorAll('script[data-page-script]').forEach((n) => n.remove());

      const modulePath = PAGE_MODULE_PATHS[nextPathname];
      if (modulePath) {
        try {
          if (!cached.module) cached.module = await import(modulePath + '?t=' + Date.now());
          if (typeof cached.module.mount === 'function') await cached.module.mount();
        } catch (e) {
          console.error('[app] module error', e);
        }
      }
      cached.mounted = true;
    }

    normalizeRequiredFields(cached.container);
    document.title = 'FREEPASS ERP';
    document.body.dataset.page = cached.bodyPage || '';
    setActiveSidebar(nextPathname);
    currentPageKey = nextPathname;

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
    styles: collectStyleHrefs(document),
    doc: null,
    title: document.title,
    bodyPage: document.body.dataset.page || '',
    module: null,
    mounted: true   // script 태그로 이미 mount됨
  });
  currentPageKey = pathname;
}

// ─── 네비게이션 ─────────────────────────────────────────────────────────────

function getSidebarPath(link) {
  if (!link) return '';
  const href = link.getAttribute('href') || '';
  if (!href.startsWith('/')) return '';
  return new URL(href, window.location.origin).pathname;
}

function shouldIntercept(link, event) {
  if (!link) return false;
  if (event.defaultPrevented) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (link.target && link.target !== '_self') return false;
  const pathname = getSidebarPath(link);
  if (!pathname) return false;
  if (pathname === pendingNavigationPath) return false;
  return true;
}

function closeFilterOverlay(overlay) {
  if (!overlay) return;
  overlay.classList.remove('is-open');
  overlay.setAttribute('aria-hidden', 'true');
}

function initGlobalFilterOverlayClose() {
  document.addEventListener('click', (event) => {
    const closeButton = event.target.closest('[data-filter-close], #closeFilterBtn');
    if (!closeButton) return;
    event.preventDefault();
    event.stopPropagation();
    const overlay = closeButton.closest('.filter-overlay');
    closeFilterOverlay(overlay);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('.filter-overlay.is-open').forEach((overlay) => closeFilterOverlay(overlay));
  });
}

function initShellNavigation() {
  if (!isDashboardPage()) return;

  document.addEventListener('pointerenter', (event) => {
    const link = event.target.closest?.('.sidebar-link');
    if (!link) return;
    const pathname = getSidebarPath(link);
    if (pathname) prefetchModule(pathname);
  }, true);

  document.addEventListener('click', async (event) => {
    const link = event.target.closest('.sidebar-link');
    if (!link) return;
    const nextPathname = getSidebarPath(link);
    if (!nextPathname) return;
    if (nextPathname === window.location.pathname || nextPathname === pendingNavigationPath) {
      event.preventDefault();
      setActiveSidebar(window.location.pathname);
      return;
    }
    if (!shouldIntercept(link, event)) return;
    event.preventDefault();
    if (!await confirmLeave()) {
      setActiveSidebar(window.location.pathname);
      return;
    }
    pendingNavigationPath = nextPathname;
    setActiveSidebar(nextPathname);
    try {
      await loadPage(link.href);
    } catch (error) {
      console.error(error);
      window.location.href = link.href;
    }
  });

}

function initKeyboardListNavigation() {
  const ROW_SELECTOR = '.summary-row, .product-row, #room-list .room-item';
  document.addEventListener('keydown', (event) => {
    const { key } = event;
    if (key !== 'ArrowUp' && key !== 'ArrowDown') return;
    const active = document.activeElement;
    if (!active || !active.matches(ROW_SELECTOR)) return;
    const parent = active.parentElement;
    if (!parent) return;
    const rows = [...parent.querySelectorAll(ROW_SELECTOR)];
    const idx = rows.indexOf(active);
    if (idx === -1) return;
    event.preventDefault();
    const next = key === 'ArrowDown' ? rows[idx + 1] : rows[idx - 1];
    if (next) { next.focus(); next.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  });
}

function initSidebarCollapse() {
  const btn = document.getElementById('sidebarToggleBtn');
  const sidebar = document.querySelector('.sidebar--new');
  if (!btn || !sidebar) return;
  const STORAGE_KEY = 'fp.sidebar.collapsed';
  btn.title = sidebar.classList.contains('sidebar-collapsed') ? '메뉴 펼치기' : '메뉴 접기';
  btn.setAttribute('aria-label', btn.title);
  btn.addEventListener('click', () => {
    const collapsed = sidebar.classList.toggle('sidebar-collapsed');
    localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    btn.title = collapsed ? '메뉴 펼치기' : '메뉴 접기';
    const label = btn.querySelector('.sidebar-toggle-label');
    if (label) label.textContent = collapsed ? '메뉴 펼치기' : '메뉴 접기';
    btn.setAttribute('aria-label', btn.title);
  });
}

// ─── 초기화 ─────────────────────────────────────────────────────────────────

normalizeRequiredFields(document);
initGlobalFilterOverlayClose();
initKeyboardListNavigation();
initShellNavigation();
initSidebarCollapse();
registerInitialPage();
const _initialPath = window.location.pathname;
if (_initialPath !== '/') history.replaceState(null, '', '/');

// 로그인 후 랜딩: 사이드바 버튼 클릭으로 SPA 네비게이션
const _landingTarget = localStorage.getItem('fp.landing_target');
if (_landingTarget) {
  localStorage.removeItem('fp.landing_target');
  // renderRoleMenu가 비동기로 실행되므로 메뉴 생성 감시
  const _menuEl = document.getElementById('sidebar-menu');
  if (_menuEl) {
    const _observer = new MutationObserver(() => {
      const link = _menuEl.querySelector(`.sidebar-link[href="${_landingTarget}"]`);
      if (link) { _observer.disconnect(); link.click(); }
    });
    _observer.observe(_menuEl, { childList: true, subtree: true });
    // 이미 있으면 바로 클릭
    const _existing = _menuEl.querySelector(`.sidebar-link[href="${_landingTarget}"]`);
    if (_existing) { _observer.disconnect(); _existing.click(); }
    // 3초 후 정리
    setTimeout(() => _observer.disconnect(), 3000);
  }
}

window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason;
  const raw = error?.message || String(error || '');
  // 인증/로그인/Firebase 내부 코드는 무시
  if (!raw || raw.includes('auth/') || raw.includes('로그인')) return;
  // 사용자에게 보여줄 메시지: 한글만 추출, 없으면 기본 메시지
  const korean = raw.match(/[가-힣\s·,.:!?]+/g)?.join('').trim();
  showToast(korean || '처리 중 오류가 발생했습니다.', 'error');
});
