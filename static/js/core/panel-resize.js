/**
 * panel-resize.js — 패널 리사이즈 핸들
 * 50% 위치에서 스냅, 드래그로 좌우 비율 조절
 */

export function initPanelResize() {
  document.querySelectorAll('.work-page.layout-66').forEach(initPage);

  const observer = new MutationObserver(() => {
    document.querySelectorAll('.work-page.layout-66').forEach(page => {
      if (!page.querySelector('.panel-resize-handle')) initPage(page);
    });
  });
  const mainShell = document.querySelector('.main-shell');
  if (mainShell) observer.observe(mainShell, { childList: true, subtree: true });
}

function initPage(page) {
  const children = [...page.children].filter(el => el.matches('.panel, .panel-slot'));
  if (children.length < 2) return;
  if (page.querySelector('.panel-resize-handle')) return;

  const left = children[0];
  const handle = document.createElement('div');
  handle.className = 'panel-resize-handle';
  left.after(handle);

  const SNAP_THRESHOLD = 12;
  const STORAGE_KEY = 'fp.panel.ratio';
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) left.style.width = saved + '%';

  let dragging = false;
  let startX = 0;
  let startW = 0;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startW = left.offsetWidth;
    handle.classList.add('is-dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const pageW = page.offsetWidth;
    const gap = parseFloat(getComputedStyle(page).getPropertyValue('--panel-gap')) || 8;
    let newW = startW + (e.clientX - startX);
    let pct = (newW / (pageW - gap)) * 100;

    if (Math.abs(pct - 50) < SNAP_THRESHOLD / (pageW / 100)) pct = 50;
    pct = Math.max(20, Math.min(70, pct));
    left.style.width = pct + '%';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('is-dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    const pageW = page.offsetWidth;
    const gap = parseFloat(getComputedStyle(page).getPropertyValue('--panel-gap')) || 8;
    const pct = Math.round((left.offsetWidth / (pageW - gap)) * 100);
    localStorage.setItem(STORAGE_KEY, pct);
  });

  handle.addEventListener('dblclick', () => {
    left.style.width = '50%';
    localStorage.setItem(STORAGE_KEY, 50);
  });
}
