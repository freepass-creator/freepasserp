/**
 * notif-sound.js — 알림 소리
 * Web Audio API로 간단한 '딩동' 톤 생성 (외부 파일 불필요)
 * 사용자가 한 번이라도 페이지와 상호작용한 후에만 재생 가능 (브라우저 정책)
 */

const STORAGE_KEY = 'fp.sound.enabled';
let audioCtx = null;
let userInteracted = false;
let lastPlayedAt = 0;

// 사용자 첫 인터랙션 이후 AudioContext 활성화 (브라우저 autoplay 정책)
function setupInteractionUnlock() {
  const unlock = () => {
    userInteracted = true;
    try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch {}
    if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
  };
  ['click', 'touchstart', 'keydown'].forEach(ev => {
    document.addEventListener(ev, unlock, { once: false, passive: true });
  });
}
setupInteractionUnlock();

export function isSoundEnabled() {
  try { return localStorage.getItem(STORAGE_KEY) !== '0'; } catch { return true; }
}
export function setSoundEnabled(on) {
  try { localStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch {}
}

/**
 * 알림 소리 재생 — '딩동' 2음 톤
 * @param {object} opts
 *   type: 'message' | 'contract' — 용도별 다른 톤
 */
export function playNotifSound(opts = {}) {
  if (!isSoundEnabled()) return;
  if (!userInteracted) return;
  // 과도한 연속 재생 방지 (1.5초 쿨다운)
  const now = Date.now();
  if (now - lastPlayedAt < 1500) return;
  lastPlayedAt = now;

  try {
    const ctx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    audioCtx = ctx;
    if (ctx.state === 'suspended') ctx.resume();

    const type = opts.type || 'message';
    const notes = type === 'contract'
      ? [{ f: 660, t: 0 }, { f: 880, t: 0.12 }]     // 낮음→높음 (계약)
      : [{ f: 880, t: 0 }, { f: 660, t: 0.12 }];    // 높음→낮음 (메시지)

    notes.forEach(({ f, t }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, ctx.currentTime + t);
      gain.gain.setValueAtTime(0, ctx.currentTime + t);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.2);
    });
  } catch (e) {
    console.warn('[notif-sound] play failed', e);
  }
}
