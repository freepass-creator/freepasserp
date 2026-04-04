import { prepareProductImageFiles } from '../../firebase/firebase-storage.js';
import { open as fpOpen, close as fpClose } from '../../shared/fullscreen-photo-viewer.js';

export function createProductImageManager(options = {}) {
  const {
    imageInput,
    existingImageInput,
    existingImageListInput,
    previewList,
    previewSummary,
    previewClearButton,
    previewToolbar,
    uploadDropzone,
    MAX_PRODUCT_IMAGE_COUNT = 20,
    PREPARE_IMAGE_CONCURRENCY = 4,
    getMode = () => 'create',
    setStatus,
    waitForPaint,
    escapeHtml
  } = options;

  let previewObjectUrls = [];
  let pendingImageFiles = [];
  let currentPreviewEntries = [];
  let removedStoredImageUrls = new Set();
  let imagePrepareQueue = Promise.resolve();
  let imagePrepareActiveCount = 0;

  function normalizeImageUrls(value) {
    if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
    const text = String(value || '').trim();
    if (!text) return [];
    if (text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed.map((item) => String(item || '').trim()).filter(Boolean);
      } catch (error) {
        console.warn('image url parse fail', error);
      }
    }
    return text.split(/[\n,]/).map((item) => String(item || '').trim()).filter(Boolean);
  }

  function dedupeImageUrls(urls) {
    return [...new Set(normalizeImageUrls(urls))];
  }

  function getStoredImageUrls() {
    const list = dedupeImageUrls(existingImageListInput?.value || '');
    if (list.length) return list;
    const single = String(existingImageInput?.value || '').trim();
    return single ? [single] : [];
  }

  function setStoredImageUrls(urls) {
    const next = dedupeImageUrls(urls);
    if (existingImageListInput) existingImageListInput.value = JSON.stringify(next);
    if (existingImageInput) existingImageInput.value = next[0] || '';
    return next;
  }

  function clearPreviewObjectUrls() {
    previewObjectUrls.forEach((url) => {
      try { URL.revokeObjectURL(url); } catch (error) {}
    });
    previewObjectUrls = [];
  }

  function clearRemovedStoredImageUrls() {
    removedStoredImageUrls = new Set();
  }

  function queueStoredImageRemoval(urls = []) {
    dedupeImageUrls(urls).forEach((url) => removedStoredImageUrls.add(url));
  }

  function getQueuedStoredImageRemovalUrls() {
    return [...removedStoredImageUrls];
  }

  function setImagePrepareBusy(isBusy) {
    imagePrepareActiveCount = Math.max(0, imagePrepareActiveCount + (isBusy ? 1 : -1));
    const busy = imagePrepareActiveCount > 0;
    uploadDropzone?.classList.toggle('is-processing', busy);
    imageInput?.toggleAttribute('data-processing', busy);
  }

  function fileSignature(file) {
    return [file?.name || '', file?.size || 0, file?.lastModified || 0, file?.type || ''].join('::');
  }

  function dedupeFiles(files = []) {
    const seen = new Set();
    return Array.from(files || []).filter((file) => {
      if (!(file instanceof File)) return false;
      const signature = fileSignature(file);
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  }

  function clearPendingFiles() {
    pendingImageFiles = [];
    if (imageInput) imageInput.value = '';
  }

  function getPendingFiles() {
    return dedupeFiles(pendingImageFiles);
  }

  function setPendingFiles(files = []) {
    pendingImageFiles = dedupeFiles(files);
    return pendingImageFiles;
  }

  function appendPendingFiles(files = []) {
    const imageFiles = Array.from(files || []).filter((file) => String(file?.type || '').startsWith('image/'));
    pendingImageFiles = dedupeFiles([...pendingImageFiles, ...imageFiles]);
    return pendingImageFiles;
  }

  function replacePendingFilesWithPrepared(originalFiles = [], preparedFiles = []) {
    const preparedBySignature = new Map();
    originalFiles.forEach((originalFile, index) => {
      if (!(originalFile instanceof File)) return;
      const signature = fileSignature(originalFile);
      const preparedFile = preparedFiles[index] instanceof File ? preparedFiles[index] : originalFile;
      if (!preparedBySignature.has(signature)) preparedBySignature.set(signature, preparedFile);
    });
    if (!preparedBySignature.size) return getPendingFiles();
    const nextFiles = getPendingFiles().map((file) => preparedBySignature.get(fileSignature(file)) || file);
    setPendingFiles(nextFiles);
    return pendingImageFiles;
  }

  function buildPreviewEntries(storedUrls = [], files = []) {
    const storedEntries = dedupeImageUrls(storedUrls).map((url, storedIndex) => ({ url, source: 'stored', sourceIndex: storedIndex }));
    const pendingEntries = dedupeFiles(files).map((file, pendingIndex) => {
      const objectUrl = URL.createObjectURL(file);
      previewObjectUrls.push(objectUrl);
      return { url: objectUrl, source: 'pending', sourceIndex: pendingIndex };
    });
    return [...storedEntries, ...pendingEntries].map((entry, index) => ({
      ...entry,
      label: `사진${index + 1}`,
      isMain: false,
      canSetMain: false
    }));
  }

  function buildPreviewMarkup(entries = []) {
    if (!entries.length) return '<div class="image-preview-empty">등록된 사진이 없습니다.</div>';
    const editable = getMode() !== 'view';
    return entries.map((entry, entryIndex) => {
      const removeButton = editable
        ? `<button type="button" class="img-thumb-remove" data-preview-action="remove" data-preview-source="${escapeHtml(entry.source)}" data-preview-index="${entry.sourceIndex}" aria-label="${escapeHtml(entry.label)} 삭제">&times;</button>`
        : '';
      return `
        <div class="img-thumb-item">
          ${removeButton}
          <button type="button" class="img-thumb-media" data-preview-open="true" data-preview-entry-index="${entryIndex}" aria-label="${escapeHtml(entry.label)} 크게 보기">
            <img src="${entry.url}" alt="상품이미지">
          </button>
        </div>
      `;
    }).join('');
  }

  function updatePreviewSummary() {
    const storedCount = getStoredImageUrls().length;
    const pendingCount = getPendingFiles().length;
    const totalCount = storedCount + pendingCount;
    const editable = getMode() !== 'view';
    if (previewSummary) {
      if (!totalCount) previewSummary.textContent = '등록된 사진이 없습니다.';
      else if (editable) previewSummary.textContent = `사진 ${totalCount}장 · 저장됨 ${storedCount}장 · 업로드 예정 ${pendingCount}장`;
      else previewSummary.textContent = `사진 ${totalCount}장`;
    }
    if (previewClearButton) {
      previewClearButton.hidden = !editable;
      previewClearButton.disabled = totalCount === 0 || !editable;
    }
    previewToolbar?.classList.toggle('is-view-only', !editable);
  }

  function getCurrentPreviewEntries() { return Array.isArray(currentPreviewEntries) ? currentPreviewEntries : []; }

  function openImageViewer(index = 0) {
    const entries = getCurrentPreviewEntries();
    if (!entries.length) return;
    const urls = entries.map((e) => e.url);
    fpOpen(urls, index);
  }

  function closeImageViewer() {
    fpClose();
  }

  function handleImageViewerKeydown() {
    // fullscreen-photo-viewer가 키보드 이벤트 직접 처리
  }

  function syncImageInteraction(editable) {
    previewList?.classList.toggle('is-editable', !!editable);
    uploadDropzone?.classList.toggle('is-disabled', !editable);
    if (imageInput) imageInput.disabled = !editable;
    updatePreviewSummary();
  }

  function moveStoredImageToFront(index) {
    const current = getStoredImageUrls();
    if (index <= 0 || index >= current.length) return current;
    const [selected] = current.splice(index, 1);
    current.unshift(selected);
    return setStoredImageUrls(current);
  }

  function movePendingFileToFront(index) {
    const current = getPendingFiles();
    if (index <= 0 || index >= current.length) return current;
    const [selected] = current.splice(index, 1);
    current.unshift(selected);
    setPendingFiles(current);
    return pendingImageFiles;
  }

  function clearAllImages() {
    queueStoredImageRemoval(getStoredImageUrls());
    setStoredImageUrls([]);
    clearPendingFiles();
    renderCurrentPreview();
  }

  function renderCurrentPreview() {
    clearPreviewObjectUrls();
    currentPreviewEntries = buildPreviewEntries(getStoredImageUrls(), getPendingFiles());
    if (previewList) previewList.innerHTML = buildPreviewMarkup(currentPreviewEntries);
    updatePreviewSummary();
    // fullscreen-photo-viewer는 별도 상태 관리, 프리뷰 변경 시 자동 갱신 불필요
  }

  function removeStoredImageAt(index) {
    const current = getStoredImageUrls();
    if (index < 0 || index >= current.length) return current;
    queueStoredImageRemoval([current[index]]);
    const next = current.filter((_, currentIndex) => currentIndex !== index);
    return setStoredImageUrls(next);
  }

  function removePendingFileAt(index) {
    const next = getPendingFiles().filter((_, currentIndex) => currentIndex !== index);
    setPendingFiles(next);
    return next;
  }

  function renderSelectedFiles(files = imageInput?.files || []) {
    if (getMode() === 'view') {
      setStatus?.('수정 상태에서만 사진을 추가할 수 있습니다.', 'info');
      return;
    }
    const incomingFiles = Array.from(files || []).filter((file) => String(file?.type || '').startsWith('image/'));
    if (!incomingFiles.length) {
      setStatus?.('선택된 사진이 없습니다.', 'info');
      if (imageInput) imageInput.value = '';
      return;
    }
    const remainCount = Math.max(0, MAX_PRODUCT_IMAGE_COUNT - (getStoredImageUrls().length + getPendingFiles().length));
    if (remainCount <= 0) {
      setStatus?.(`사진은 최대 ${MAX_PRODUCT_IMAGE_COUNT}장까지 등록할 수 있습니다.`, 'error');
      if (imageInput) imageInput.value = '';
      return;
    }
    const acceptedFiles = incomingFiles.slice(0, remainCount);
    const droppedCount = Math.max(0, incomingFiles.length - acceptedFiles.length);
    appendPendingFiles(acceptedFiles);
    renderCurrentPreview();
    const totalQueued = getStoredImageUrls().length + getPendingFiles().length;
    const limitNotice = droppedCount ? ` · 초과 ${droppedCount}장은 제외됨` : '';
    setStatus?.(totalQueued ? `사진 ${totalQueued}장 선택됨 · 백그라운드 준비중입니다.${limitNotice}` : '선택된 사진이 없습니다.', 'progress');

    imagePrepareQueue = imagePrepareQueue.then(async () => {
      setImagePrepareBusy(true);
      try {
        const preparedFiles = await prepareProductImageFiles(acceptedFiles, {
          concurrency: PREPARE_IMAGE_CONCURRENCY,
          onProgress: ({ completed, total, phase }) => {
            if (phase === 'start') return setStatus?.(`사진 준비중입니다... 0/${total}`, 'progress');
            if (phase === 'done') return setStatus?.(`사진 준비 완료 ${total}/${total}`, 'info');
            setStatus?.(`사진 준비중입니다... ${completed}/${total}`, 'progress');
          }
        });
        replacePendingFilesWithPrepared(acceptedFiles, preparedFiles);
        renderCurrentPreview();
        await waitForPaint?.();
      } catch (error) {
        setStatus?.(`사진 준비 실패: ${error.message}`, 'error');
        if (imageInput) imageInput.value = '';
      } finally {
        setImagePrepareBusy(false);
      }
    }).catch((error) => {
      setStatus?.(`사진 준비 실패: ${error.message}`, 'error');
      if (imageInput) imageInput.value = '';
    });
  }

  function cleanup() {
    closeImageViewer();
    clearPreviewObjectUrls();
  }

  return {
    normalizeImageUrls,
    dedupeImageUrls,
    getStoredImageUrls,
    setStoredImageUrls,
    clearRemovedStoredImageUrls,
    getQueuedStoredImageRemovalUrls,
    getPendingFiles,
    clearPendingFiles,
    renderCurrentPreview,
    syncImageInteraction,
    moveStoredImageToFront,
    movePendingFileToFront,
    removeStoredImageAt,
    removePendingFileAt,
    clearAllImages,
    openImageViewer,
    closeImageViewer,
    handleImageViewerKeydown,
    renderSelectedFiles,
    cleanup,
    getImagePrepareActiveCount: () => imagePrepareActiveCount,
    getImagePrepareQueue: () => imagePrepareQueue
  };
}
