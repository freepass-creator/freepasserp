import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js';
import { storage } from './firebase-config.js';

// ─── 삭제 실패 재시도 로컬 큐 ─────────────────────────────────────────────────
// 네트워크 오류 등으로 스토리지 파일 삭제에 실패한 URL을 localStorage에 보관하고
// 주기적으로 재시도하여 고아 파일(orphaned files)이 누적되는 것을 방지한다.

const DELETION_QUEUE_KEY = 'firebase_storage_deletion_queue';
const RETRY_INTERVAL_MS = 60_000;      // 1분 간격 재시도
const MAX_RETRIES = 5;                  // 최대 재시도 횟수

function loadDeletionQueue() {
  try {
    return JSON.parse(localStorage.getItem(DELETION_QUEUE_KEY) || '[]');
  } catch { return []; }
}

function saveDeletionQueue(queue) {
  try {
    localStorage.setItem(DELETION_QUEUE_KEY, JSON.stringify(queue));
  } catch { /* localStorage 사용 불가 시 무시 */ }
}

/**
 * 삭제 실패 URL을 큐에 추가한다.
 * @param {string[]} urls 삭제 실패 URL 목록
 */
function enqueueDeletionRetry(urls) {
  if (!urls || !urls.length) return;
  const queue = loadDeletionQueue();
  const existingUrls = new Set(queue.map((item) => item.url));
  for (const url of urls) {
    if (!url || existingUrls.has(url)) continue;
    queue.push({ url, retries: 0, enqueuedAt: Date.now() });
  }
  saveDeletionQueue(queue);
}

/**
 * 큐에 있는 삭제 실패 항목들을 재시도한다.
 * 성공하거나 MAX_RETRIES 초과 시 큐에서 제거.
 */
async function processDeletionQueue() {
  const queue = loadDeletionQueue();
  if (!queue.length) return;

  const remaining = [];
  for (const item of queue) {
    try {
      const storageRef = ref(storage, item.url);
      await deleteObject(storageRef);
      // 삭제 성공 → 큐에서 제거 (remaining에 추가하지 않음)
    } catch (error) {
      const code = error?.code || '';
      // 이미 삭제된 파일이면 성공으로 처리
      if (code === 'storage/object-not-found') continue;
      // 재시도 횟수 초과 시 포기
      if (item.retries + 1 >= MAX_RETRIES) {
        console.warn(`[StorageQueue] 최대 재시도 초과로 삭제 포기: ${item.url}`);
        continue;
      }
      remaining.push({ ...item, retries: item.retries + 1, lastRetryAt: Date.now() });
    }
  }
  saveDeletionQueue(remaining);
}

// 페이지 로드 시 큐 처리 시작, 주기적 재시도
let _retryTimerId = null;

function startDeletionQueueProcessor() {
  if (_retryTimerId) return;
  // 초기 실행 (5초 지연)
  setTimeout(() => processDeletionQueue(), 5000);
  // 주기적 실행
  _retryTimerId = setInterval(() => processDeletionQueue(), RETRY_INTERVAL_MS);
}

// 모듈 로드 시 자동 시작
startDeletionQueueProcessor();

/**
 * 현재 큐 상태를 조회한다 (디버깅/모니터링용).
 */
export function getDeletionQueueStatus() {
  const queue = loadDeletionQueue();
  return { pending: queue.length, items: queue };
}

/**
 * 큐를 수동으로 즉시 처리한다.
 */
export async function flushDeletionQueue() {
  return processDeletionQueue();
}

function sanitizeFileName(name = '') {
  return String(name || 'file')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'image';
}

function getFileExtension(file) {
  const extension = String(file?.name || '').split('.').pop()?.toLowerCase?.() || '';
  if (extension === 'jpeg') return 'jpg';
  return extension;
}

function getContentType(file) {
  const type = String(file?.type || '').trim().toLowerCase();
  if (type) return type;
  const extension = getFileExtension(file);
  if (extension === 'jpg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'heic' || extension === 'heif') return 'image/heic';
  return 'application/octet-stream';
}

const DIRECT_UPLOAD_SIZE_LIMIT = Math.round(1.2 * 1024 * 1024);
const DIRECT_UPLOAD_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const OPTIMIZE_MAX_EDGE = 1920;
const OPTIMIZE_QUALITY = 0.80;
const OPTIMIZE_MIME_TYPE = 'image/webp';
const OPTIMIZE_EXTENSION = 'webp';
const PREPARED_UPLOAD_FILES = new WeakSet();

async function loadImageSource(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        drawTo(context, width, height) {
          context.drawImage(bitmap, 0, 0, width, height);
        },
        close() {
          try { bitmap.close(); } catch (error) {}
        }
      };
    } catch (error) {
      console.warn('image bitmap load fail', error);
    }
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.width,
        height: image.height,
        drawTo(context, width, height) {
          context.drawImage(image, 0, 0, width, height);
        },
        close() {
          try { URL.revokeObjectURL(objectUrl); } catch (error) {}
        }
      });
    };
    image.onerror = (error) => {
      try { URL.revokeObjectURL(objectUrl); } catch (revokeError) {}
      reject(error);
    };
    image.src = objectUrl;
  });
}

function markPreparedUploadFile(file) {
  if (file instanceof File) PREPARED_UPLOAD_FILES.add(file);
  return file;
}

function isPreparedUploadFile(file) {
  return file instanceof File && PREPARED_UPLOAD_FILES.has(file);
}

function shouldDirectUpload(file, mimeType) {
  if (!(file instanceof File)) return true;
  if (!mimeType.startsWith('image/')) return true;
  if (mimeType === 'image/gif' || mimeType === 'image/svg+xml') return true;
  if (DIRECT_UPLOAD_TYPES.has(mimeType) && file.size <= DIRECT_UPLOAD_SIZE_LIMIT) return true;
  return false;
}

async function optimizeImageFile(file, index = 0) {
  if (!(file instanceof File)) return file;
  if (isPreparedUploadFile(file)) return file;
  const mimeType = String(file.type || '').toLowerCase();
  if (shouldDirectUpload(file, mimeType)) return markPreparedUploadFile(file);

  let image;
  try {
    image = await loadImageSource(file);
  } catch (error) {
    console.warn('image load fail', error);
    return markPreparedUploadFile(file);
  }

  try {
    const { width, height } = image;
    const overSized = Math.max(width, height) > OPTIMIZE_MAX_EDGE;
    if (!overSized && file.size <= DIRECT_UPLOAD_SIZE_LIMIT * 1.15) return markPreparedUploadFile(file);

    const scale = Math.min(1, OPTIMIZE_MAX_EDGE / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return markPreparedUploadFile(file);
    image.drawTo(context, targetWidth, targetHeight);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, OPTIMIZE_MIME_TYPE, OPTIMIZE_QUALITY);
    });
    if (!blob) return markPreparedUploadFile(file);
    if (blob.size >= file.size * 0.98 && !overSized) return markPreparedUploadFile(file);

    return markPreparedUploadFile(new File(
      [blob],
      `${sanitizeFileName(file.name)}_${index + 1}.${OPTIMIZE_EXTENSION}`,
      { type: OPTIMIZE_MIME_TYPE, lastModified: Date.now() }
    ));
  } finally {
    image?.close?.();
  }
}

async function uploadProductImageAttempt(file, uid, stamp, index) {
  const safeUid = uid || 'unknown';
  const contentType = getContentType(file);
  const extension = contentType === 'image/jpeg' ? 'jpg' : (getFileExtension(file) || 'bin');
  const safeName = `${stamp}_${index}_${sanitizeFileName(file.name)}.${extension}`;
  const path = `product-images/${safeUid}/${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType });
  return getDownloadURL(storageRef);
}

export async function prepareProductImageFiles(files, options = {}) {
  const list = Array.from(files || []).filter((file) => file instanceof File);
  if (!list.length) return [];

  const total = list.length;
  const concurrency = Math.max(1, Math.min(Number(options?.concurrency || 4) || 4, total));
  const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null;
  const results = new Array(total);
  let cursor = 0;
  let completed = 0;

  const notify = (extra = {}) => {
    onProgress?.({ completed, total, ...extra });
  };

  notify({ phase: 'start' });

  async function runTask(index) {
    const originalFile = list[index];
    try {
      notify({ phase: 'optimizing', index, fileName: originalFile.name || `image_${index + 1}` });
      results[index] = await optimizeImageFile(originalFile, index);
    } catch (error) {
      results[index] = markPreparedUploadFile(originalFile);
    } finally {
      completed += 1;
      notify({ phase: 'done', index, fileName: originalFile.name || `image_${index + 1}` });
    }
  }

  async function worker() {
    while (cursor < total) {
      const index = cursor;
      cursor += 1;
      await runTask(index);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results.filter((item) => item instanceof File);
}

export async function uploadProductImagesDetailed(files, uid, options = {}) {
  const list = Array.from(files || []).filter((file) => file instanceof File);
  if (!list.length) return { urls: [], failedFiles: [] };

  const stamp = Date.now();
  const total = list.length;
  const concurrency = Math.max(1, Math.min(Number(options?.concurrency || 6) || 6, total));
  const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null;
  const results = new Array(total);
  let cursor = 0;
  let completed = 0;

  const notify = (extra = {}) => {
    onProgress?.({ completed, total, ...extra });
  };

  notify({ phase: 'start' });

  async function runTask(index) {
    const originalFile = list[index];
    let uploadFile = originalFile;

    try {
      if (!isPreparedUploadFile(originalFile)) {
        notify({ phase: 'optimizing', index, fileName: originalFile.name || `image_${index + 1}` });
        uploadFile = await optimizeImageFile(originalFile, index);
      }
    } catch (error) {
      uploadFile = originalFile;
    }

    try {
      notify({ phase: 'uploading', index, fileName: originalFile.name || `image_${index + 1}` });
      const url = await uploadProductImageAttempt(uploadFile, uid, stamp, index);
      results[index] = { success: true, url };
    } catch (primaryError) {
      if (uploadFile !== originalFile) {
        try {
          const fallbackUrl = await uploadProductImageAttempt(originalFile, uid, `${stamp}_raw`, index);
          results[index] = { success: true, url: fallbackUrl };
        } catch (fallbackError) {
          results[index] = { success: false, file: originalFile.name || `image_${index + 1}`, error: fallbackError };
        }
      } else {
        results[index] = { success: false, file: originalFile.name || `image_${index + 1}`, error: primaryError };
      }
    } finally {
      completed += 1;
      notify({ phase: 'done', index, fileName: originalFile.name || `image_${index + 1}` });
    }
  }

  async function worker() {
    while (cursor < total) {
      const index = cursor;
      cursor += 1;
      await runTask(index);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const urls = [];
  const failedFiles = [];

  results.forEach((item) => {
    if (!item) return;
    if (item.success) {
      urls.push(item.url);
      return;
    }
    failedFiles.push({ file: item.file, error: item.error });
  });

  return { urls, failedFiles };
}

export async function uploadProductImages(files, uid) {
  const { urls, failedFiles } = await uploadProductImagesDetailed(files, uid);
  if (failedFiles.length) {
    const names = failedFiles.map((item) => item.file).filter(Boolean).join(', ');
    throw new Error(names ? `사진 업로드 실패: ${names}` : '사진 업로드에 실패했습니다.');
  }
  return urls;
}

export async function uploadProductImage(file, uid) {
  const { urls, failedFiles } = await uploadProductImagesDetailed([file], uid);
  if (failedFiles.length) {
    const failed = failedFiles[0];
    throw failed?.error || new Error('사진 업로드에 실패했습니다.');
  }
  return urls[0] || '';
}

export async function deleteProductImagesByUrls(urls = []) {
  const uniqueUrls = [...new Set((Array.isArray(urls) ? urls : [urls]).map((item) => String(item || '').trim()).filter(Boolean))];
  if (!uniqueUrls.length) return { deletedUrls: [], failedUrls: [] };

  const settled = await Promise.allSettled(uniqueUrls.map(async (url) => {
    const storageRef = ref(storage, url);
    await deleteObject(storageRef);
    return url;
  }));

  const deletedUrls = [];
  const failedUrls = [];
  settled.forEach((result, index) => {
    const url = uniqueUrls[index];
    if (result.status === 'fulfilled') {
      deletedUrls.push(url);
      return;
    }
    failedUrls.push({ url, error: result.reason });
  });

  // 삭제 실패 URL을 로컬 큐에 등록하여 백그라운드 재시도
  if (failedUrls.length) {
    enqueueDeletionRetry(failedUrls.map((item) => item.url));
  }

  return { deletedUrls, failedUrls };
}

export async function uploadContractFile(file, uid) {
  const safeUid = uid || 'unknown';
  const path = `contract-files/${safeUid}/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

export async function uploadContractFilesDetailed(files, uid, options = {}) {
  const list = Array.from(files || []).filter((file) => file instanceof File);
  if (!list.length) return { results: [] };

  const stamp = Date.now();
  const total = list.length;
  const concurrency = Math.max(1, Math.min(Number(options?.concurrency || 6) || 6, total));
  const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null;
  const results = new Array(total);
  let cursor = 0;
  let completed = 0;

  const notify = (extra = {}) => onProgress?.({ completed, total, ...extra });
  notify({ phase: 'start' });

  async function runTask(index) {
    const file = list[index];
    try {
      notify({ phase: 'uploading', index, fileName: file.name });
      const safeUid = uid || 'unknown';
      const path = `contract-files/${safeUid}/${stamp}_${index}_${file.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      results[index] = { success: true, url, name: file.name, type: file.type || '' };
    } catch (error) {
      results[index] = { success: false, file: file.name, error };
    } finally {
      completed += 1;
      notify({ phase: 'done', index, fileName: file.name });
    }
  }

  async function worker() {
    while (cursor < total) {
      const index = cursor;
      cursor += 1;
      await runTask(index);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { results };
}
