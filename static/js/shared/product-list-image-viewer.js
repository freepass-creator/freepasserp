import { escapeHtml } from '../core/management-format.js';

let imageViewerRoot = null;
let imageViewerPhotos = [];
let imageViewerCurrentIndex = 0;
let imageViewerKeydownBound = false;

function ensureImageViewer() {
  if (imageViewerRoot) return imageViewerRoot;
  const wrapper = document.createElement('div');
  wrapper.className = 'plist-image-viewer-overlay';
  wrapper.hidden = true;
  wrapper.innerHTML = `
    <div class="plist-image-viewer-backdrop" data-viewer-close></div>
    <div class="plist-image-viewer-dialog" role="dialog" aria-modal="true" aria-label="상품 이미지 크게 보기">
      <button type="button" class="plist-image-viewer-close" data-viewer-close aria-label="닫기"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
      <div class="plist-image-viewer-count" data-viewer-count>0 / 0</div>
      <div class="plist-image-viewer-main-wrap">
        <button type="button" class="plist-image-viewer-nav plist-image-viewer-nav--prev" data-viewer-step="-1" aria-label="이전 사진">‹</button>
        <div class="plist-image-viewer-main"><img data-viewer-image alt="상품 이미지 크게 보기"></div>
        <button type="button" class="plist-image-viewer-nav plist-image-viewer-nav--next" data-viewer-step="1" aria-label="다음 사진">›</button>
      </div>
      <div class="image-viewer-thumbs" data-viewer-thumbs></div>
    </div>
  `;
  document.body.appendChild(wrapper);
  wrapper.addEventListener('click', (event) => {
    const closeTarget = event.target?.closest?.('[data-viewer-close]');
    if (closeTarget) {
      closeImageViewer();
      return;
    }
    const thumb = event.target?.closest?.('[data-viewer-thumb-index]');
    if (thumb) {
      openImageViewer(imageViewerPhotos, Number(thumb.dataset.viewerThumbIndex || 0));
      return;
    }
    const stepButton = event.target?.closest?.('[data-viewer-step]');
    if (stepButton) {
      const step = Number(stepButton.dataset.viewerStep || 0);
      if (step) openImageViewer(imageViewerPhotos, imageViewerCurrentIndex + step);
    }
  });
  if (!imageViewerKeydownBound) {
    document.addEventListener('keydown', handleImageViewerKeydown);
    imageViewerKeydownBound = true;
  }
  imageViewerRoot = wrapper;
  return imageViewerRoot;
}

function renderImageViewer() {
  const root = ensureImageViewer();
  if (!imageViewerPhotos.length) {
    closeImageViewer();
    return;
  }
  const nextIndex = Math.min(Math.max(Number(imageViewerCurrentIndex || 0), 0), imageViewerPhotos.length - 1);
  imageViewerCurrentIndex = nextIndex;
  const activeUrl = imageViewerPhotos[nextIndex] || '';
  const imageNode = root.querySelector('[data-viewer-image]');
  const countNode = root.querySelector('[data-viewer-count]');
  const thumbsNode = root.querySelector('[data-viewer-thumbs]');
  const prevButton = root.querySelector('.plist-image-viewer-nav--prev');
  const nextButton = root.querySelector('.plist-image-viewer-nav--next');
  if (imageNode) imageNode.src = activeUrl;
  if (countNode) countNode.textContent = `${nextIndex + 1} / ${imageViewerPhotos.length}`;
  if (prevButton) prevButton.disabled = nextIndex <= 0;
  if (nextButton) nextButton.disabled = nextIndex >= imageViewerPhotos.length - 1;
  if (thumbsNode) {
    thumbsNode.innerHTML = imageViewerPhotos.map((src, index) => `
      <button type="button" class="image-viewer-thumb ${index === nextIndex ? 'is-active' : ''}" data-viewer-thumb-index="${index}" aria-label="${index + 1}번 사진 보기">
        <img src="${escapeHtml(src)}" alt="${index + 1}">
      </button>
    `).join('');
    const activeThumb = thumbsNode.querySelector('.image-viewer-thumb.is-active');
    activeThumb?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }
}

import { open as openFullscreenViewer } from './fullscreen-photo-viewer.js';

export function openImageViewer(photos, index = 0) {
  const nextPhotos = Array.isArray(photos) ? photos.filter(Boolean) : [];
  if (!nextPhotos.length) return;
  openFullscreenViewer(nextPhotos, Math.min(Math.max(Number(index || 0), 0), nextPhotos.length - 1));
}

function closeImageViewer() {
  if (!imageViewerRoot) return;
  imageViewerRoot.hidden = true;
  document.body.classList.remove('image-viewer-open');
}

function handleImageViewerKeydown(event) {
  if (!imageViewerRoot || imageViewerRoot.hidden) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeImageViewer();
    return;
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    openImageViewer(imageViewerPhotos, imageViewerCurrentIndex - 1);
    return;
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    openImageViewer(imageViewerPhotos, imageViewerCurrentIndex + 1);
  }
}

function makeFilename(url, index, total) {
  const rawName = decodeURIComponent(url.split('/o/')[1] || url.split('/').pop() || '').split('?')[0].split('/').pop();
  const ext = rawName.match(/\.(jpe?g|png|webp|gif)$/i)?.[0] || '.jpg';
  return total > 1 ? `photo_${String(index + 1).padStart(2, '0')}${ext}` : `photo${ext}`;
}

async function downloadAllAsZip(urls, carNo) {
  const res = await fetch('/api/photos/zip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls, car_no: carNo })
  });
  if (!res.ok) throw new Error('zip 생성 실패');
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = `${carNo || 'photos'}_사진.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

async function downloadSinglePhoto(url, index, total) {
  const filename = makeFilename(url, index, total);
  try {
    const res = await fetch('/api/photos/zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [url], car_no: filename.replace(/\.[^.]+$/, '') })
    });
    if (!res.ok) throw new Error('failed');
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  } catch (_) {
    window.open(url, '_blank');
  }
}

export function bindProductDetailPhotoEvents(root, onSelect) {
  root.querySelectorAll('[data-open-photo-viewer]').forEach((node) => {
    node.addEventListener('click', () => {
      const detailRoot = node.closest('.plist-detail');
      const photoSources = detailRoot?.dataset.photoSources ? detailRoot.dataset.photoSources.split('|').filter(Boolean) : [];
      const startIndex = Number(node.dataset.photoStartIndex || 0);
      if (!photoSources.length) return;
      if (typeof onSelect === 'function') onSelect(startIndex);
      openImageViewer(photoSources, startIndex);
    });
  });

  root.querySelectorAll('[data-download-photos]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const detailRoot = btn.closest('.plist-detail');
      const photoSources = detailRoot?.dataset.photoSources ? detailRoot.dataset.photoSources.split('|').filter(Boolean) : [];
      if (!photoSources.length) return;
      const carNo = detailRoot?.dataset.carNo || '';
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = '다운로드 중...';
      try {
        if (photoSources.length > 1) {
          await downloadAllAsZip(photoSources, carNo);
        } else {
          await downloadSinglePhoto(photoSources[0], 0, 1);
        }
      } catch (e) {
        console.warn('[download] 실패:', e);
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  });
}
