import { escapeHtml } from '../../core/management-format.js';

export function createContractDocsController({
  input,
  dropzone,
  list,
  summary,
  clearButton,
  getMode
}) {
  let storedDocs = [];
  let pendingDocFiles = [];
  let previewObjectUrls = [];
  let docViewerRoot = null;
  let currentDocPreviewEntries = [];
  let currentDocViewerIndex = 0;

  function clearPreviewObjectUrls() {
    previewObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    previewObjectUrls = [];
  }

  function dedupeDocFiles(files = []) {
    const seen = new Set();
    return Array.from(files || []).filter((file) => {
      if (!file) return false;
      const key = [file.name, file.size, file.lastModified, file.type].join('::');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function setStoredDocs(items = []) {
    storedDocs = Array.isArray(items) ? [...items] : [];
    return storedDocs;
  }

  function setPendingDocFiles(files = []) {
    pendingDocFiles = dedupeDocFiles(files);
    return pendingDocFiles;
  }

  function appendPendingDocFiles(files = []) {
    pendingDocFiles = dedupeDocFiles([...pendingDocFiles, ...Array.from(files || [])]);
    return pendingDocFiles;
  }

  function buildDocPreviewEntries() {
    const storedEntries = storedDocs.map((item, index) => ({
      source: 'stored',
      sourceIndex: index,
      name: item?.name || `서류${index + 1}`,
      url: item?.url || '',
      type: item?.type || ''
    }));

    const pendingEntries = pendingDocFiles.map((file, index) => {
      const objectUrl = URL.createObjectURL(file);
      previewObjectUrls.push(objectUrl);
      return {
        source: 'pending',
        sourceIndex: index,
        name: file.name || `서류${index + 1}`,
        url: objectUrl,
        type: file.type || ''
      };
    });

    return [...storedEntries, ...pendingEntries].map((entry, index) => {
      const type = String(entry.type || '').toLowerCase();
      const ext = String(entry.name || '').split('.').pop()?.toUpperCase() || 'FILE';
      const isImage = type.startsWith('image/');
      const isPdf = type === 'application/pdf' || ext === 'PDF';
      return {
        ...entry,
        label: `요청서류${index + 1}`,
        isImage,
        isPdf,
        extension: ext
      };
    });
  }

  function buildDocPreviewMedia(entry, entryIndex) {
    if (entry.isImage && entry.url) {
      return `
        <button type="button" class="image-preview-media" data-doc-preview-open="true" data-doc-preview-index="${entryIndex}" aria-label="${escapeHtml(entry.label)} 크게 보기">
          <img src="${escapeHtml(entry.url)}" alt="${escapeHtml(entry.name)}">
        </button>
      `;
    }

    if (entry.url && entry.source === 'stored') {
      return `
        <a class="image-preview-media" href="${escapeHtml(entry.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(entry.label)} 열기">
          <div class="image-preview-filebox">${escapeHtml(entry.extension)}</div>
        </a>
      `;
    }

    return `
      <div class="image-preview-media">
        <div class="image-preview-filebox">${escapeHtml(entry.extension)}</div>
      </div>
    `;
  }

  function updateDocSummary() {
    const storedCount = storedDocs.length;
    const pendingCount = pendingDocFiles.length;
    const totalCount = storedCount + pendingCount;
    const editable = getMode() !== 'view';
    if (summary) {
      if (!totalCount) {
        summary.textContent = '등록된 서류가 없습니다.';
      } else if (editable) {
        summary.textContent = `서류 ${totalCount}건 · 저장됨 ${storedCount}건 · 업로드 예정 ${pendingCount}건`;
      } else {
        summary.textContent = `서류 ${totalCount}건`;
      }
    }
    if (clearButton) clearButton.disabled = totalCount === 0 || getMode() === 'view';
  }

  function getCurrentDocPreviewEntries() {
    return Array.isArray(currentDocPreviewEntries) ? currentDocPreviewEntries : [];
  }

  function closeDocViewer() {
    if (!docViewerRoot) return;
    docViewerRoot.hidden = true;
    document.body.classList.remove('image-viewer-open');
  }

  function openDocViewer(index = 0) {
    const entries = getCurrentDocPreviewEntries().filter((entry) => entry.isImage && entry.url);
    if (!entries.length || !docViewerRoot) return;
    currentDocViewerIndex = ((Number(index) || 0) % entries.length + entries.length) % entries.length;
    const active = entries[currentDocViewerIndex];
    const imageNode = docViewerRoot.querySelector('[data-viewer-image]');
    const countNode = docViewerRoot.querySelector('[data-viewer-count]');
    const thumbsNode = docViewerRoot.querySelector('[data-viewer-thumbs]');
    const prevButton = docViewerRoot.querySelector('[data-viewer-step="-1"]');
    const nextButton = docViewerRoot.querySelector('[data-viewer-step="1"]');

    if (imageNode) {
      imageNode.src = active.url;
      imageNode.alt = active.name || active.label || '서류 이미지';
    }
    if (countNode) countNode.textContent = `${currentDocViewerIndex + 1} / ${entries.length}`;
    if (thumbsNode) {
      thumbsNode.innerHTML = entries.map((entry, thumbIndex) => `
        <button type="button" class="image-viewer-thumb${thumbIndex === currentDocViewerIndex ? ' is-active' : ''}" data-viewer-thumb-index="${thumbIndex}" aria-label="${escapeHtml(entry.label)} 선택">
          <img src="${escapeHtml(entry.url)}" alt="${escapeHtml(entry.label)}">
        </button>
      `).join('');
    }
    if (prevButton) prevButton.disabled = entries.length <= 1;
    if (nextButton) nextButton.disabled = entries.length <= 1;

    docViewerRoot.hidden = false;
    document.body.classList.add('image-viewer-open');
  }

  function ensureDocViewer() {
    if (docViewerRoot) return docViewerRoot;
    const wrapper = document.createElement('div');
    wrapper.className = 'image-viewer-overlay';
    wrapper.hidden = true;
    wrapper.innerHTML = `
      <div class="image-viewer-backdrop" data-viewer-close></div>
      <div class="image-viewer-dialog" role="dialog" aria-modal="true" aria-label="계약 서류 이미지 크게 보기">
        <button type="button" class="image-viewer-close" data-viewer-close aria-label="닫기"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
        <div class="image-viewer-count" data-viewer-count>0 / 0</div>
        <div class="image-viewer-main-wrap">
          <button type="button" class="image-viewer-nav image-viewer-nav--prev" data-viewer-step="-1" aria-label="이전 이미지">‹</button>
          <div class="image-viewer-main"><img data-viewer-image alt="계약 서류 이미지 크게 보기"></div>
          <button type="button" class="image-viewer-nav image-viewer-nav--next" data-viewer-step="1" aria-label="다음 이미지">›</button>
        </div>
        <div class="image-viewer-thumbs" data-viewer-thumbs></div>
      </div>
    `;
    document.body.appendChild(wrapper);
    wrapper.addEventListener('click', (event) => {
      const closeTarget = event.target?.closest?.('[data-viewer-close]');
      if (closeTarget) {
        closeDocViewer();
        return;
      }
      const thumb = event.target?.closest?.('[data-viewer-thumb-index]');
      if (thumb) {
        openDocViewer(Number(thumb.dataset.viewerThumbIndex || 0));
        return;
      }
      const stepButton = event.target?.closest?.('[data-viewer-step]');
      if (stepButton) {
        openDocViewer(currentDocViewerIndex + Number(stepButton.dataset.viewerStep || 0));
      }
    });
    document.addEventListener('keydown', handleDocViewerKeydown);
    docViewerRoot = wrapper;
    return docViewerRoot;
  }

  function handleDocViewerKeydown(event) {
    if (!docViewerRoot || docViewerRoot.hidden) return;
    if (event.key === 'Escape') closeDocViewer();
    if (event.key === 'ArrowLeft') openDocViewer(currentDocViewerIndex - 1);
    if (event.key === 'ArrowRight') openDocViewer(currentDocViewerIndex + 1);
  }

  function render() {
    clearPreviewObjectUrls();
    if (!list) return;
    const editable = getMode() !== 'view';
    const entries = buildDocPreviewEntries();
    currentDocPreviewEntries = entries.filter((entry) => entry.isImage && entry.url);
    ensureDocViewer();

    if (!entries.length) {
      list.innerHTML = '<div class="image-preview-empty">등록된 서류가 없습니다.</div>';
      updateDocSummary();
      return;
    }

    list.innerHTML = entries.map((entry, entryIndex) => {
      const removeButton = editable
        ? `<button type="button" class="img-thumb-remove" data-doc-action="remove" data-doc-source="${escapeHtml(entry.source)}" data-doc-index="${entry.sourceIndex}" aria-label="${escapeHtml(entry.label)} 삭제">&times;</button>`
        : '';
      return `
        <div class="img-thumb-item">
          ${removeButton}
          ${buildDocPreviewMedia(entry, entryIndex)}
        </div>
      `;
    }).join('');
    updateDocSummary();
  }

  function removeStoredDocAt(index) {
    setStoredDocs(storedDocs.filter((_, currentIndex) => currentIndex !== index));
  }

  function removePendingDocFileAt(index) {
    setPendingDocFiles(pendingDocFiles.filter((_, currentIndex) => currentIndex !== index));
  }

  function clearAllDocs() {
    setStoredDocs([]);
    setPendingDocFiles([]);
    render();
  }

  function syncInteraction(editable) {
    if (input) input.disabled = !editable;
    dropzone?.classList.toggle('is-disabled', !editable);
    if (!editable) dropzone?.classList.remove('is-dragover');
    updateDocSummary();
  }

  function handleListClick(event) {
    const previewButton = event.target.closest('[data-doc-preview-open="true"]');
    if (previewButton) {
      openDocViewer(Number(previewButton.dataset.docPreviewIndex || 0));
      return;
    }

    const button = event.target.closest('[data-doc-action="remove"]');
    if (!button || getMode() === 'view') return;
    const source = String(button.dataset.docSource || '');
    const index = Number(button.dataset.docIndex);
    if (!Number.isInteger(index) || index < 0) return;
    if (source === 'stored') removeStoredDocAt(index);
    if (source === 'pending') removePendingDocFileAt(index);
    render();
  }

  list?.addEventListener('click', handleListClick);

  return {
    reset() {
      setStoredDocs([]);
      setPendingDocFiles([]);
      render();
    },
    load(items = []) {
      setStoredDocs(items);
      setPendingDocFiles([]);
      if (input) input.value = '';
      render();
    },
    appendFiles(files = []) {
      appendPendingDocFiles(files);
      if (input) input.value = '';
      render();
    },
    clearAll: clearAllDocs,
    syncInteraction,
    render,
    getStoredDocs: () => [...storedDocs],
    getPendingDocFiles: () => [...pendingDocFiles],
    setStoredDocs(items = []) {
      setStoredDocs(items);
      return [...storedDocs];
    },
    setPendingDocFiles(files = []) {
      setPendingDocFiles(files);
      return [...pendingDocFiles];
    },
    destroy() {
      clearPreviewObjectUrls();
      closeDocViewer();
      list?.removeEventListener('click', handleListClick);
      document.removeEventListener('keydown', handleDocViewerKeydown);
      if (docViewerRoot?.parentNode) docViewerRoot.parentNode.removeChild(docViewerRoot);
      docViewerRoot = null;
    }
  };
}
