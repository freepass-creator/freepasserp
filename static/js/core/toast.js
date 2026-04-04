/**
 * core/toast.js — 커스텀 알림 시스템
 *
 *   showToast('저장 완료', 'success')        → 아이콘 + 텍스트, 자동 닫힘
 *   showToast('오류', 'error')               → 아이콘 + 텍스트, 자동 닫힘
 *   showToast('처리중...', 'progress')       → 스피너 + 텍스트, 수동 dismiss
 *   showConfirm('삭제할까요?')               → 확인/취소 모달
 */

const DURATIONS = { success: 1200, info: 1200, error: 2500, progress: 0 };

const ICONS = {
  success: '<svg class="fp-modal-icon fp-modal-icon--success" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  error:   '<svg class="fp-modal-icon fp-modal-icon--error"   width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',
  info:    '<svg class="fp-modal-icon fp-modal-icon--info"    width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
  progress:'<span class="fp-modal-spinner"></span>'
};

function sanitizeErrorText(text) {
  const prefix = text.match(/^[가-힣\s·,.:!?()\-]+/)?.[0]?.trim() || '';
  return prefix || '처리 중 오류가 발생했습니다.';
}

function makeOverlay(noBg = false) {
  const el = document.createElement('div');
  el.className = 'fp-modal-overlay' + (noBg ? ' fp-modal-overlay--no-bg' : '');
  return el;
}

function open(overlay) {
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('is-visible'));
}

function close(overlay) {
  overlay.classList.remove('is-visible');
  overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  setTimeout(() => { if (overlay.isConnected) overlay.remove(); }, 300);
}

// ─── showToast ──────────────────────────────────────────────────────────────

export function showToast(text, tone = 'info', options = {}) {
  let normalizedText = String(text || '').trim();
  if (!normalizedText) return { dismiss() {}, update() {} };
  if (tone === 'error') normalizedText = sanitizeErrorText(normalizedText);

  const validTone = ['success', 'error', 'info', 'progress'].includes(tone) ? tone : 'info';
  const duration = options.duration !== undefined ? Number(options.duration) : DURATIONS[validTone];

  const overlay = makeOverlay(validTone !== 'progress');
  const box = document.createElement('div');
  box.className = 'fp-modal-box fp-modal-box--toast';
  box.dataset.tone = validTone;
  box.innerHTML = `<div class="fp-modal-icon-wrap">${ICONS[validTone]}</div><div class="fp-modal-text"></div>`;
  box.querySelector('.fp-modal-text').textContent = normalizedText;
  overlay.appendChild(box);
  open(overlay);

  let timer = duration > 0 ? setTimeout(() => close(overlay), duration) : null;

  return {
    dismiss() { if (timer) clearTimeout(timer); close(overlay); },
    update(newText) {
      const el = box.querySelector('.fp-modal-text');
      if (el) el.textContent = String(newText || '').trim();
    }
  };
}

// ─── dismissAllToasts ───────────────────────────────────────────────────────

export function dismissAllToasts() {
  document.querySelectorAll('.fp-modal-overlay').forEach(close);
}

// ─── showConfirm ────────────────────────────────────────────────────────────

export function showConfirm(text) {
  return new Promise((resolve) => {
    const overlay = makeOverlay(false);
    const box = document.createElement('div');
    box.className = 'fp-modal-box fp-modal-box--confirm';
    box.innerHTML = `<div class="fp-modal-text"></div><div class="fp-modal-actions"><button type="button" class="fp-modal-btn fp-modal-btn--cancel">취소</button><button type="button" class="fp-modal-btn fp-modal-btn--ok">확인</button></div>`;
    box.querySelector('.fp-modal-text').textContent = String(text || '');
    overlay.appendChild(box);
    open(overlay);

    const onKey = (e) => {
      if (e.key === 'Escape') done(false);
      if (e.key === 'Enter')  done(true);
    };

    let resolved = false;
    function done(result) {
      if (resolved) return;
      resolved = true;
      document.removeEventListener('keydown', onKey);
      close(overlay);
      resolve(result);
    }

    box.querySelector('.fp-modal-btn--ok').addEventListener('click', () => done(true));
    box.querySelector('.fp-modal-btn--cancel').addEventListener('click', () => done(false));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) done(false); });
    document.addEventListener('keydown', onKey);
    box.querySelector('.fp-modal-btn--ok').focus();
  });
}

// 전역 노출 (비모듈 스크립트용)
window.showToast = showToast;
window.showConfirm = showConfirm;
