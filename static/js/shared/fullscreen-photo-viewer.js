/**
 * fullscreen-photo-viewer.js — 풀스크린 세로 스크롤 사진 뷰어
 * 카탈로그 + ERP 공통
 */

let viewerEl = null;

function esc(text) {
  const d = document.createElement('div');
  d.textContent = String(text ?? '');
  return d.innerHTML;
}

function ensureViewer() {
  if (viewerEl) return viewerEl;
  viewerEl = document.createElement('div');
  viewerEl.className = 'fp-photo-viewer';
  viewerEl.hidden = true;
  viewerEl.innerHTML = `
    <button class="fp-photo-viewer__close" data-fp-photo-close type="button" aria-label="닫기">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
    </button>
    <div class="fp-photo-viewer__counter" data-fp-photo-counter></div>
    <div class="fp-photo-viewer__scroll" data-fp-photo-scroll></div>
  `;
  document.body.appendChild(viewerEl);

  viewerEl.querySelector('[data-fp-photo-close]').addEventListener('click', close);
  viewerEl.querySelector('[data-fp-photo-scroll]').addEventListener('click', (e) => {
    if (e.target.closest('.fp-photo-viewer__img')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !viewerEl.hidden) close();
  });
  return viewerEl;
}

export function open(photos = [], startIndex = 0) {
  if (!photos.length) return;
  const el = ensureViewer();
  const scroll = el.querySelector('[data-fp-photo-scroll]');
  const counter = el.querySelector('[data-fp-photo-counter]');

  counter.textContent = `${photos.length}장`;
  scroll.innerHTML =
    `<div class="fp-photo-viewer__hint">스크롤하여 사진 ${photos.length}장을 확인하세요</div>` +
    photos.map((src, i) =>
      `<img class="fp-photo-viewer__img" src="${esc(src)}" alt="사진 ${i + 1}" loading="${i <= startIndex + 1 ? 'eager' : 'lazy'}" decoding="async">`
    ).join('');

  el.hidden = false;
  document.body.style.overflow = 'hidden';

  if (startIndex > 0) {
    requestAnimationFrame(() => {
      scroll.querySelectorAll('.fp-photo-viewer__img')[startIndex]?.scrollIntoView({ behavior: 'instant' });
    });
  }
}

export function close() {
  if (!viewerEl) return;
  viewerEl.hidden = true;
  document.body.style.overflow = '';
}

export function isOpen() {
  return viewerEl && !viewerEl.hidden;
}
