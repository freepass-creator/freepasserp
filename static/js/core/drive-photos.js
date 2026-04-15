/**
 * drive-photos.js — Google Drive 폴더 사진 지연 로드
 *
 * 상품 렌더링 시 image_urls 가 비어있고 photo_link 가 Drive 폴더면,
 * `<img data-drive-folder="URL">` 또는 `<div data-drive-folder="URL" data-drive-mode="gallery">`
 * 형태의 DOM 을 MutationObserver 가 자동으로 채운다.
 *
 * - 서버 엔드포인트: GET /api/drive-folder-images?folder=URL_OR_ID
 * - 서버·클라이언트 모두 캐시 (세션 10분).
 */

const SESSION_CACHE_KEY = 'fp_drive_folder_cache_v2';
const SESSION_CACHE_TTL = 60 * 60 * 1000;
const MEMORY = new Map(); // `${folderId}:${size}` → Promise<urls[]>

const SIZE_THUMB = 600;   // 카드 썸네일
const SIZE_FULL  = 1920;  // 상세 갤러리 (우리 업로드 리사이즈와 동일)

function loadSessionCache() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_CACHE_KEY) || '{}'); } catch { return {}; }
}
function saveSessionCache(obj) {
  try { sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(obj)); } catch {}
}

export function extractDriveFolderId(value) {
  if (!value) return '';
  const s = String(value).trim();
  let m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = s.match(/\/drive\/.*?\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;
  return '';
}

export function isDriveFolderLink(value) {
  return !!extractDriveFolderId(value);
}

/**
 * 서버가 처리할 수 있는 사진 소스인지 판별.
 * - Drive 폴더 URL
 * - moderentcar.co.kr 등 스크래핑 지원 사이트
 */
const SCRAPABLE_HOSTS = [
  'moderentcar.co.kr',
];
export function isSupportedPhotoSource(value) {
  if (!value) return false;
  if (extractDriveFolderId(value)) return true;
  try {
    const u = new URL(value);
    return SCRAPABLE_HOSTS.some((h) => u.hostname.includes(h));
  } catch { return false; }
}

export function fetchDriveFolderImages(sourceUrl, size = SIZE_FULL) {
  if (!sourceUrl || !isSupportedPhotoSource(sourceUrl)) return Promise.resolve([]);

  const cacheKey = `${sourceUrl}:${size}`;
  const cache = loadSessionCache();
  const entry = cache[cacheKey];
  if (entry && Date.now() - (entry.ts || 0) < SESSION_CACHE_TTL) {
    return Promise.resolve(entry.urls || []);
  }

  if (MEMORY.has(cacheKey)) return MEMORY.get(cacheKey);

  const p = fetch(`/api/extract-photos?url=${encodeURIComponent(sourceUrl)}&size=${size}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const urls = j && j.ok && Array.isArray(j.urls) ? j.urls : [];
      if (urls.length) {
        const next = loadSessionCache();
        next[cacheKey] = { ts: Date.now(), urls };
        saveSessionCache(next);
      } else {
        MEMORY.delete(cacheKey);
      }
      return urls;
    })
    .catch(() => {
      MEMORY.delete(cacheKey);
      return [];
    });

  MEMORY.set(cacheKey, p);
  return p;
}

export { SIZE_THUMB, SIZE_FULL };

/**
 * 상품 객체의 photo_link 가 Drive 폴더이면 그 사진들을 받아 image_urls 에 주입.
 * 기존 image_urls/image_url 이 있으면 건드리지 않음.
 *
 * @param {object} product — raw Firebase product (snake_case)
 * @returns {Promise<string[]>} 최종 사용 가능한 이미지 URL 배열
 */
export async function resolveProductPhotos(product) {
  if (!product) return [];
  const existing = Array.isArray(product.image_urls) ? product.image_urls.filter(Boolean) : [];
  if (existing.length) return existing;
  if (product.image_url) return [product.image_url];
  const photoLink = String(product.photo_link || product.photoLink || '').trim();
  if (!isSupportedPhotoSource(photoLink)) return [];
  const urls = await fetchDriveFolderImages(photoLink);
  if (urls.length) {
    product.image_urls = urls;
    product.image_url = urls[0];
    product._drive_folder_virtual = true;
  }
  return urls;
}

// ─── DOM 하이드레이션 ───────────────────────────────────────────────────────

function hydrateThumb(el, urls) {
  if (!urls.length) {
    el.dispatchEvent(new CustomEvent('drive-photos:empty', { bubbles: true }));
    return;
  }
  const img = el.tagName === 'IMG' ? el : el.querySelector('img');
  if (img) {
    img.src = urls[0];
    img.removeAttribute('data-pending');
  }
  el.dataset.drivePhotoCount = urls.length;
  el.dispatchEvent(new CustomEvent('drive-photos:loaded', { bubbles: true, detail: { urls, mode: 'thumb' } }));
}

function hydrateGallery(el, urls) {
  if (!urls.length) {
    el.dispatchEvent(new CustomEvent('drive-photos:empty', { bubbles: true }));
    return;
  }
  // 갤러리 컨테이너는 리스너 쪽에서 실제 렌더를 담당하도록 이벤트만 발행
  el.dispatchEvent(new CustomEvent('drive-photos:loaded', { bubbles: true, detail: { urls, mode: 'gallery' } }));
}

function hydrate(el) {
  if (!el || el.dataset._driveHydrated === '1') return;
  const folderUrl = el.dataset.driveFolder;
  if (!folderUrl) return;
  el.dataset._driveHydrated = '1';
  const mode = el.dataset.driveMode || 'thumb';
  const size = mode === 'gallery' ? SIZE_FULL : SIZE_THUMB;
  fetchDriveFolderImages(folderUrl, size).then((urls) => {
    if (mode === 'gallery') hydrateGallery(el, urls);
    else hydrateThumb(el, urls);
  }).catch(() => {});
}

function scanAndHydrate(root) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll('[data-drive-folder]').forEach(hydrate);
}

let _observer = null;
function startObserver() {
  if (_observer || typeof MutationObserver === 'undefined') return;
  const target = document.body || document.documentElement;
  if (!target) return;
  scanAndHydrate(target);
  _observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.hasAttribute?.('data-drive-folder')) hydrate(node);
        if (node.querySelectorAll) scanAndHydrate(node);
      }
    }
  });
  _observer.observe(target, { childList: true, subtree: true });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  } else {
    startObserver();
  }
}
