/**
 * core/toast.js
 *
 * 통합 알림 시스템 — 브라우저 정중앙 모달 카드.
 *
 *   showToast('저장 완료', 'success')        → 아이콘 + 텍스트, 1.5초 후 자동 닫힘
 *   showToast('실패', 'error')               → 아이콘 + 텍스트, 3초 후 자동 닫힘
 *   showToast('업로드 중...', 'progress')     → 스피너 + 텍스트, 수동 dismiss
 *   showConfirm('삭제할까요?')               → 텍스트 + 확인/취소 버튼
 */

const DURATIONS = { success: 1000, info: 1000, error: 2000, progress: 0 };

// ─── 공통 오버레이/박스 생성 ───────────────────────────────────────────────

function createOverlay(cls = '') {
  const overlay = document.createElement('div');
  overlay.className = `fp-modal-overlay${cls ? ' ' + cls : ''}`;
  return overlay;
}

function createBox() {
  const box = document.createElement('div');
  box.className = 'fp-modal-box';
  return box;
}

function showOverlay(overlay) {
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('is-visible'));
}

function closeOverlay(overlay) {
  overlay.classList.remove('is-visible');
  overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  setTimeout(() => { if (overlay.isConnected) overlay.remove(); }, 300);
}

// ─── 아이콘 ────────────────────────────────────────────────────────────────

const ICONS = {
  success: '<svg class="fp-modal-icon fp-modal-icon--success" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  error: '<svg class="fp-modal-icon fp-modal-icon--error" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',
  info: '<svg class="fp-modal-icon fp-modal-icon--info" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
  progress: '<span class="fp-modal-spinner"></span>'
};

// ─── showToast (알림 모달) ──────────────────────────────────────────────────

function sanitizeErrorText(text) {
  // 한글 접두사(저장 실패: 등)는 유지하고, 뒤에 붙는 Firebase/영문 코드 제거
  const prefix = text.match(/^[가-힣\s·,.:!?]+/)?.[0]?.trim() || '';
  if (prefix) return prefix;
  return '처리 중 오류가 발생했습니다.';
}

export function showToast(text, tone = 'info', options = {}) {
  let normalizedText = String(text || '').trim();
  if (!normalizedText) return { dismiss() {}, update() {} };
  if (tone === 'error') normalizedText = sanitizeErrorText(normalizedText);

  const validTone = ['success', 'error', 'info', 'progress'].includes(tone) ? tone : 'info';
  const duration = options.duration !== undefined ? Number(options.duration) : (DURATIONS[validTone] || 1500);
  const isProgress = validTone === 'progress';

  const overlay = createOverlay(isProgress ? '' : 'fp-modal-overlay--no-bg');
  const box = createBox();
  box.classList.add('fp-modal-box--toast');
  box.dataset.tone = validTone;
  box.innerHTML = `
    <div class="fp-modal-icon-wrap">${ICONS[validTone] || ''}</div>
    <div class="fp-modal-text"></div>
  `;
  box.querySelector('.fp-modal-text').textContent = normalizedText;
  overlay.appendChild(box);
  showOverlay(overlay);

  let timer = null;
  if (duration > 0) {
    timer = setTimeout(() => closeOverlay(overlay), duration);
  }

  return {
    dismiss() {
      if (timer) clearTimeout(timer);
      closeOverlay(overlay);
    },
    update(newText) {
      const el = box.querySelector('.fp-modal-text');
      if (el) el.textContent = String(newText || '').trim();
    }
  };
}

// ─── dismissAllToasts ───────────────────────────────────────────────────────

export function dismissAllToasts() {
  document.querySelectorAll('.fp-modal-overlay').forEach(closeOverlay);
}

// ─── showConfirm (확인 모달) ────────────────────────────────────────────────

export function showConfirm(text, options = {}) {
  const { confirmText = '확인', cancelText = '취소' } = options;
  return new Promise((resolve) => {
    const overlay = createOverlay();
    const box = createBox();
    box.classList.add('fp-modal-box--confirm');
    box.innerHTML = `
      <div class="fp-modal-text"></div>
      <div class="fp-modal-actions">
        <button type="button" class="fp-modal-btn fp-modal-btn--cancel"></button>
        <button type="button" class="fp-modal-btn fp-modal-btn--ok"></button>
      </div>
    `;
    box.querySelector('.fp-modal-text').textContent = text;
    box.querySelector('.fp-modal-btn--cancel').textContent = cancelText;
    box.querySelector('.fp-modal-btn--ok').textContent = confirmText;
    overlay.appendChild(box);
    showOverlay(overlay);

    let resolved = false;
    function close(result) {
      if (resolved) return;
      resolved = true;
      closeOverlay(overlay);
      resolve(result);
    }

    box.querySelector('.fp-modal-btn--ok').addEventListener('click', () => close(true));
    box.querySelector('.fp-modal-btn--cancel').addEventListener('click', () => close(false));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });

    function onKey(e) {
      if (e.key === 'Escape') { close(false); document.removeEventListener('keydown', onKey); }
      if (e.key === 'Enter') { close(true); document.removeEventListener('keydown', onKey); }
    }
    document.addEventListener('keydown', onKey);
    box.querySelector('.fp-modal-btn--ok').focus();
  });
}

// 전역 노출 (비모듈 스크립트용)
window.showToast = showToast;
window.showConfirm = showConfirm;
