/**
 * role-menu.js (개선판)
 *
 * 변경:
 * - ALL_MENUS → ROUTE_REGISTRY 로 확장: label 외에 pageTitle 추가
 * - getPageTitle(pathname) 공개 API 추가 → 페이지 헤더 타이틀을 JS에서도 재활용 가능
 * - setMenuActive: 정확히 일치하는 pathname 우선, 없으면 prefix 매칭으로 fallback
 *   (예: /product-list?foo=bar 도 /product-list 항목을 active로 처리)
 * - renderRoleMenu: 기존 시그니처 100% 유지
 */

const ROUTE_REGISTRY = [
  // 대시보드
  { href: '/home',         label: '대시보드',       pageTitle: '홈',         icon: 'home',      roles: ['provider', 'agent', 'admin'], group: 'top' },
  // 상품 · 대화
  { href: '/product-list', label: '전체 상품 검색', pageTitle: '상품목록',   icon: 'car-front', roles: ['provider', 'agent', 'admin'], group: 'g1' },
  { href: '/chat',         label: '실시간 문의·응대', pageTitle: '문의·응대',  icon: 'message',   roles: ['provider', 'agent', 'admin'], group: 'g1' },
  // 계약 · 정산
  { href: '/contract',     label: '계약 관리',      pageTitle: '계약관리',   icon: 'file-text', roles: ['provider', 'agent', 'admin'], group: 'g2' },
  { href: '/settlement',   label: '정산 · 수수료',  pageTitle: '정산관리',   icon: 'currency',  roles: ['provider', 'agent', 'admin'], group: 'g2' },
  // 재고 · 정책
  { href: '/product-new',  label: '재고 관리',      pageTitle: '재고관리',   icon: 'package',   roles: ['provider', 'admin'],          group: 'g3' },
  { href: '/terms',        label: '운영 정책',      pageTitle: '정책관리',   icon: 'shield',    roles: ['provider', 'admin'],          group: 'g3' },
  // 파트너 · 사용자 · 관리자
  { href: '/partner',      label: '파트너사 관리',  pageTitle: '파트너관리', icon: 'building',    roles: ['admin'],                      group: 'g4' },
  { href: '/member',       label: '사용자 관리',    pageTitle: '사용자관리', icon: 'users',       roles: ['admin'],                      group: 'g4' },
  { href: '/admin',        label: '관리자 페이지',  pageTitle: '관리자',     icon: 'lock-keyhole', roles: ['admin'],                     group: 'g4' },
  // 환경설정 (맨 하단)
  { href: '/settings',     label: '설정',           pageTitle: '설정',       icon: 'settings',  roles: ['provider', 'agent', 'admin'], group: 'bottom' },
];

const ICON_STROKE_WIDTH = 1.2;

const ICON_PATHS = {
  home: `
    <rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>
  `,
  'car-front': `
    <path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8"/>
    <path d="M7 14h.01"/><path d="M17 14h.01"/>
    <rect width="18" height="8" x="3" y="10" rx="2"/>
    <path d="M5 18v2"/><path d="M19 18v2"/>
  `,
  message: `
    <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/>
    <path d="M8 12h.01"/><path d="M12 12h.01"/><path d="M16 12h.01"/>
  `,
  'file-text': `
    <rect width="8" height="4" x="8" y="2" rx="1"/>
    <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-.5"/>
    <path d="M16 4h2a2 2 0 0 1 1.73 1"/>
    <path d="M8 18h1"/>
    <path d="M21.378 12.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/>
  `,
  currency: `
    <path d="M12 17V7"/><path d="M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8"/>
    <path d="M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z"/>
  `,
  package: `
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
    <path d="m3.3 7 8.7 5 8.7-5"/>
    <path d="M12 22V12"/>
  `,
  shield: `
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
    <path d="m9 12 2 2 4-4"/>
  `,
  building: `
    <path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M12 6h.01"/>
    <path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M16 6h.01"/>
    <path d="M8 10h.01"/><path d="M8 14h.01"/><path d="M8 6h.01"/>
    <path d="M9 22v-3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/>
    <rect x="4" y="2" width="16" height="20" rx="2"/>
  `,
  users: `
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
    <path d="M16 3.128a4 4 0 0 1 0 7.744"/>
    <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
    <circle cx="9" cy="7" r="4"/>
  `,
  'lock-keyhole': `
    <circle cx="12" cy="16" r="1"/>
    <rect x="3" y="10" width="18" height="12" rx="2"/>
    <path d="M7 10V7a5 5 0 0 1 10 0v3"/>
  `,
  settings: `
    <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/>
    <circle cx="12" cy="12" r="3"/>
  `,
};

function createMenuIcon(icon = 'home') {
  const paths = ICON_PATHS[icon] || ICON_PATHS.home;
  return `
    <svg class="sidebar-link-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      ${paths}
    </svg>
  `;
}

/**
 * 현재 pathname에 해당하는 pageTitle을 반환한다.
 * 일치하는 항목이 없으면 null을 반환.
 */
export function getPageTitle(pathname = window.location.pathname) {
  const entry = ROUTE_REGISTRY.find((item) => pathname === item.href || pathname.startsWith(item.href + '/') || pathname.startsWith(item.href + '?'));
  return entry ? entry.pageTitle : null;
}

/**
 * sidebar 링크 중 현재 경로와 일치하는 항목에 active 클래스를 적용한다.
 * - 정확히 일치하는 항목 우선
 * - 없으면 현재 pathname이 href로 시작하는 항목(prefix 매칭)으로 fallback
 */
export function setMenuActive(container, pathname = window.location.pathname) {
  const normalizedPathname = pathname === '/' ? '/product-list' : pathname.split('?')[0];

  // 정확 일치 우선
  const exactMatch = [...container.querySelectorAll('.sidebar-link')]
    .find((link) => link.getAttribute('href') === normalizedPathname);

  container.querySelectorAll('.sidebar-link').forEach((link) => {
    const href = link.getAttribute('href');
    const isActive = exactMatch
      ? link === exactMatch
      : normalizedPathname.startsWith(href + '/') || normalizedPathname === href;
    link.classList.toggle('active', isActive);
  });
}

/**
 * role에 허용된 메뉴 항목을 container에 렌더링하고 active 상태를 설정한다.
 */
const GROUP_ORDER = ['top', 'g1', 'g2', 'g3', 'g4', 'g5', 'bottom'];

function createLink(item) {
  const link = document.createElement('a');
  link.className = 'sidebar-link';
  link.href = item.href;
  link.title = item.label;
  link.dataset.label = item.label;

  const icon = document.createElement('span');
  icon.className = 'sidebar-link-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = createMenuIcon(item.icon);

  const label = document.createElement('span');
  label.className = 'sidebar-link-label';
  label.textContent = item.label;

  if (item.href === '/chat') {
    const badge = document.createElement('span');
    badge.className = 'sidebar-nav-badge';
    badge.id = 'sidebar-chat-badge';
    badge.hidden = true;
    link.append(icon, label, badge);
  } else {
    link.append(icon, label);
  }
  return link;
}

export function renderRoleMenu(container, role) {
  if (!container) return;
  if (container.dataset.renderedRole === role) {
    setMenuActive(container.closest('.sidebar') || container);
    return;
  }
  const items = ROUTE_REGISTRY.filter((item) => item.roles.includes(role));
  const frag = document.createDocumentFragment();

  // 기존 bottom footer 제거
  const sidebar = container.closest('.sidebar');
  sidebar?.querySelector('.sidebar-bottom')?.remove();

  GROUP_ORDER.filter((k) => k !== 'bottom').forEach((groupKey) => {
    const groupItems = items.filter((item) => item.group === groupKey);
    if (!groupItems.length) return;

    const group = document.createElement('div');
    group.className = `sidebar-group sidebar-group--${groupKey}`;

    groupItems.forEach((item) => group.appendChild(createLink(item)));
    frag.appendChild(group);
  });

  container.replaceChildren(frag);

  // bottom 그룹은 sidebar 직접 자식으로 (menu 밖, 바닥 고정)
  const bottomItems = items.filter((item) => item.group === 'bottom');
  if (bottomItems.length && sidebar) {
    const bottomWrap = document.createElement('div');
    bottomWrap.className = 'sidebar-bottom';
    bottomItems.forEach((item) => bottomWrap.appendChild(createLink(item)));
    sidebar.appendChild(bottomWrap);
  }

  container.dataset.renderedRole = role;
  setMenuActive(sidebar || container);
}
