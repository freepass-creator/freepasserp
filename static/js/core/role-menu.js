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
  { href: '/home',         label: '대시보드',       pageTitle: '홈',         icon: 'home',      roles: ['provider', 'agent', 'agent_manager', 'admin'], group: 'top' },
  // 상품 · 대화
  { href: '/product-list', label: '전체 상품 검색', pageTitle: '상품목록',   icon: 'car-front', roles: ['provider', 'agent', 'agent_manager', 'admin'], group: 'g1' },
  { href: '/chat',         label: '실시간 문의·응대', pageTitle: '문의·응대',  icon: 'message',   roles: ['provider', 'agent', 'agent_manager', 'admin'], group: 'g1' },
  // 계약 · 정산
  { href: '/contract',     label: '계약 관리',      pageTitle: '계약관리',   icon: 'file-text', roles: ['provider', 'agent', 'agent_manager', 'admin'], group: 'g2' },
  { href: '/settlement',   label: '정산 · 수수료',  pageTitle: '정산관리',   icon: 'currency',  roles: ['provider', 'agent', 'agent_manager', 'admin'], group: 'g2' },
  // 재고 · 정책
  { href: '/product-new',  label: '재고 관리',      pageTitle: '재고관리',   icon: 'package',   roles: ['provider', 'admin'],          group: 'g3' },
  { href: '/terms',        label: '운영 정책',      pageTitle: '정책관리',   icon: 'shield',    roles: ['provider', 'admin'],          group: 'g3' },
  // 파트너 · 사용자 · 관리자
  { href: '/partner',      label: '파트너사 관리',  pageTitle: '파트너관리', icon: 'building',    roles: ['admin'],                      group: 'g4' },
  { href: '/member',       label: '사용자 관리',    pageTitle: '사용자관리', icon: 'users',       roles: ['admin', 'agent_manager'],     group: 'g4' },
  { href: '/admin',        label: '관리자 페이지',  pageTitle: '관리자',     icon: 'lock-keyhole', roles: ['admin'],                     group: 'g4' },
  // { href: '/upload-center',label: '상품업로드',      pageTitle: '상품업로드', icon: 'upload',       roles: ['admin'],                     group: 'g4' },
  { href: '/download-center', label: '다운로드센터',  pageTitle: '다운로드센터', icon: 'download',     roles: ['provider', 'agent', 'agent_manager', 'admin'], group: 'g2' },
  // 환경설정 (맨 하단)
  { href: '/settings',     label: '설정',           pageTitle: '설정',       icon: 'settings',  roles: ['provider', 'agent', 'agent_manager', 'admin'], group: 'bottom' },
];

// Phosphor Icons (regular weight, 256x256 viewBox, fill방식)
const ICON_PATHS = {
  home: `<path d="M104,40H56A16,16,0,0,0,40,56v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,104,40Zm0,64H56V56h48v48Zm96-64H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Zm0,64H152V56h48v48Zm-96,32H56a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,104,136Zm0,64H56V152h48v48Zm96-64H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,200,136Zm0,64H152V152h48v48Z"/>`,
  'car-front': `<path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"/>`,
  message: `<path d="M140,128a12,12,0,1,1-12-12A12,12,0,0,1,140,128ZM84,116a12,12,0,1,0,12,12A12,12,0,0,0,84,116Zm88,0a12,12,0,1,0,12,12A12,12,0,0,0,172,116Zm60,12A104,104,0,0,1,79.12,219.82L45.07,231.17a16,16,0,0,1-20.24-20.24l11.35-34.05A104,104,0,1,1,232,128Zm-16,0A88,88,0,1,0,51.81,172.06a8,8,0,0,1,.66,6.54L40,216,77.4,203.53a7.85,7.85,0,0,1,2.53-.42,8,8,0,0,1,4,1.08A88,88,0,0,0,216,128Z"/>`,
  'file-text': `<path d="M168,152a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,152Zm-8-40H96a8,8,0,0,0,0,16h64a8,8,0,0,0,0-16Zm56-64V216a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V48A16,16,0,0,1,56,32H92.26a47.92,47.92,0,0,1,71.48,0H200A16,16,0,0,1,216,48ZM96,64h64a32,32,0,0,0-64,0ZM200,48H173.25A47.93,47.93,0,0,1,176,64v8a8,8,0,0,1-8,8H88a8,8,0,0,1-8-8V64a47.93,47.93,0,0,1,2.75-16H56V216H200Z"/>`,
  currency: `<path d="M72,104a8,8,0,0,1,8-8h96a8,8,0,0,1,0,16H80A8,8,0,0,1,72,104Zm8,40h96a8,8,0,0,0,0-16H80a8,8,0,0,0,0,16ZM232,56V208a8,8,0,0,1-11.58,7.15L192,200.94l-28.42,14.21a8,8,0,0,1-7.16,0L128,200.94,99.58,215.15a8,8,0,0,1-7.16,0L64,200.94,35.58,215.15A8,8,0,0,1,24,208V56A16,16,0,0,1,40,40H216A16,16,0,0,1,232,56Zm-16,0H40V195.06l20.42-10.22a8,8,0,0,1,7.16,0L96,199.06l28.42-14.22a8,8,0,0,1,7.16,0L160,199.06l28.42-14.22a8,8,0,0,1,7.16,0L216,195.06Z"/>`,
  package: `<path d="M223.68,66.15,135.68,18a15.88,15.88,0,0,0-15.36,0l-88,48.17a16,16,0,0,0-8.32,14v95.64a16,16,0,0,0,8.32,14l88,48.17a15.88,15.88,0,0,0,15.36,0l88-48.17a16,16,0,0,0,8.32-14V80.18A16,16,0,0,0,223.68,66.15ZM128,32l80.34,44-29.77,16.3-80.35-44ZM128,120,47.66,76l33.9-18.56,80.34,44ZM40,90l80,43.78v85.79L40,175.82Zm176,85.78h0l-80,43.79V133.82l32-17.51V152a8,8,0,0,0,16,0V107.55L216,90v85.77Z"/>`,
  download: `<path d="M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,124.69V32a8,8,0,0,0-16,0v92.69L93.66,98.34a8,8,0,0,0-11.32,11.32Z"/>`,
  shield: `<path d="M208,40H48A16,16,0,0,0,32,56v56c0,52.72,25.52,84.67,46.93,102.19,23.06,18.86,46,25.26,47,25.53a8,8,0,0,0,4.2,0c1-.27,23.91-6.67,47-25.53C198.48,196.67,224,164.72,224,112V56A16,16,0,0,0,208,40Zm0,72c0,37.07-13.66,67.16-40.6,89.42A129.3,129.3,0,0,1,128,223.62a128.25,128.25,0,0,1-38.92-21.81C61.82,179.51,48,149.3,48,112l0-56,160,0ZM82.34,141.66a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32l-56,56a8,8,0,0,1-11.32,0Z"/>`,
  building: `<path d="M240,208H224V96a16,16,0,0,0-16-16H144V32a16,16,0,0,0-24.88-13.32L39.12,72A16,16,0,0,0,32,85.34V208H16a8,8,0,0,0,0,16H240a8,8,0,0,0,0-16ZM208,96V208H144V96ZM48,85.34,128,32V208H48ZM112,112v16a8,8,0,0,1-16,0V112a8,8,0,1,1,16,0Zm-32,0v16a8,8,0,0,1-16,0V112a8,8,0,1,1,16,0Zm0,56v16a8,8,0,0,1-16,0V168a8,8,0,0,1,16,0Zm32,0v16a8,8,0,0,1-16,0V168a8,8,0,0,1,16,0Z"/>`,
  users: `<path d="M244.8,150.4a8,8,0,0,1-11.2-1.6A51.6,51.6,0,0,0,192,128a8,8,0,0,1-7.37-4.89,8,8,0,0,1,0-6.22A8,8,0,0,1,192,112a24,24,0,1,0-23.24-30,8,8,0,1,1-15.5-4A40,40,0,1,1,219,117.51a67.94,67.94,0,0,1,27.43,21.68A8,8,0,0,1,244.8,150.4ZM190.92,212a8,8,0,1,1-13.84,8,57,57,0,0,0-98.16,0,8,8,0,1,1-13.84-8,72.06,72.06,0,0,1,33.74-29.92,48,48,0,1,1,58.36,0A72.06,72.06,0,0,1,190.92,212ZM128,176a32,32,0,1,0-32-32A32,32,0,0,0,128,176ZM72,120a8,8,0,0,0-8-8A24,24,0,1,1,87.24,82a8,8,0,1,0,15.5-4A40,40,0,1,0,37,117.51,67.94,67.94,0,0,0,9.6,139.19a8,8,0,1,0,12.8,9.61A51.6,51.6,0,0,1,64,128,8,8,0,0,0,72,120Z"/>`,
  'lock-keyhole': `<path d="M128,112a28,28,0,0,0-8,54.83V184a8,8,0,0,0,16,0V166.83A28,28,0,0,0,128,112Zm0,40a12,12,0,1,1,12-12A12,12,0,0,1,128,152Zm80-72H176V56a48,48,0,0,0-96,0V80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80ZM96,56a32,32,0,0,1,64,0V80H96ZM208,208H48V96H208V208Z"/>`,
  settings: `<path d="M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm109.94-52.79a8,8,0,0,0-3.89-5.4l-29.83-17-.12-33.62a8,8,0,0,0-2.83-6.08,111.91,111.91,0,0,0-36.72-20.67,8,8,0,0,0-6.46.59L128,41.85,97.88,25a8,8,0,0,0-6.47-.6A112.1,112.1,0,0,0,54.73,45.15a8,8,0,0,0-2.83,6.07l-.15,33.65-29.83,17a8,8,0,0,0-3.89,5.4,106.47,106.47,0,0,0,0,41.56,8,8,0,0,0,3.89,5.4l29.83,17,.12,33.62a8,8,0,0,0,2.83,6.08,111.91,111.91,0,0,0,36.72,20.67,8,8,0,0,0,6.46-.59L128,214.15,158.12,231a7.91,7.91,0,0,0,3.9,1,8.09,8.09,0,0,0,2.57-.42,112.1,112.1,0,0,0,36.68-20.73,8,8,0,0,0,2.83-6.07l.15-33.65,29.83-17a8,8,0,0,0,3.89-5.4A106.47,106.47,0,0,0,237.94,107.21Zm-15,34.91-28.57,16.25a8,8,0,0,0-3,3c-.58,1-1.19,2.06-1.81,3.06a7.94,7.94,0,0,0-1.22,4.21l-.15,32.25a95.89,95.89,0,0,1-25.37,14.3L134,199.13a8,8,0,0,0-3.91-1h-.19c-1.21,0-2.43,0-3.64,0a8.08,8.08,0,0,0-4.1,1l-28.84,16.1A96,96,0,0,1,67.88,201l-.11-32.2a8,8,0,0,0-1.22-4.22c-.62-1-1.23-2-1.8-3.06a8.09,8.09,0,0,0-3-3.06l-28.6-16.29a90.49,90.49,0,0,1,0-28.26L61.67,97.63a8,8,0,0,0,3-3c.58-1,1.19-2.06,1.81-3.06a7.94,7.94,0,0,0,1.22-4.21l.15-32.25a95.89,95.89,0,0,1,25.37-14.3L122,56.87a8,8,0,0,0,4.1,1c1.21,0,2.43,0,3.64,0a8.08,8.08,0,0,0,4.1-1l28.84-16.1A96,96,0,0,1,188.12,55l.11,32.2a8,8,0,0,0,1.22,4.22c.62,1,1.23,2,1.8,3.06a8.09,8.09,0,0,0,3,3.06l28.6,16.29A90.49,90.49,0,0,1,222.9,142.12Z"/>`,
};

function createMenuIcon(icon = 'home') {
  const paths = ICON_PATHS[icon] || ICON_PATHS.home;
  return `
    <svg class="sidebar-link-svg" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false">
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
