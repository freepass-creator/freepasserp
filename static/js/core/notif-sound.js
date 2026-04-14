/**
 * notif-sound.js — 알림 소리 (실제 WAV 파일 재생)
 */

const STORAGE_KEY = 'fp.sound.enabled';
let lastPlayedAt = 0;

const audioMsg = new Audio('/static/sound-msg.wav');
const audioContract = new Audio('/static/sound-contract.wav');
audioMsg.volume = 0.5;
audioContract.volume = 0.5;
audioMsg.preload = 'auto';
audioContract.preload = 'auto';

// 모바일 unlock — 첫 터치 시 무음 재생
let unlocked = false;
function unlock() {
  if (unlocked) return;
  [audioMsg, audioContract].forEach(a => {
    const v = a.volume;
    a.volume = 0;
    const p = a.play();
    if (p && typeof p.then === 'function') {
      p.then(() => { a.pause(); a.currentTime = 0; a.volume = v; }).catch(() => { a.volume = v; });
    }
  });
  unlocked = true;
}
['touchstart', 'click', 'keydown'].forEach(ev => {
  document.addEventListener(ev, unlock, { passive: true });
});

export function isSoundEnabled() {
  try { return localStorage.getItem(STORAGE_KEY) !== '0'; } catch { return true; }
}
export function setSoundEnabled(on) {
  try { localStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch {}
}

export function playNotifSound(opts = {}) {
  if (!isSoundEnabled()) return;
  const now = Date.now();
  if (now - lastPlayedAt < 1500) return;
  lastPlayedAt = now;

  try {
    const audio = opts.type === 'contract' ? audioContract : audioMsg;
    audio.currentTime = 0;
    const p = audio.play();
    if (p && typeof p.catch === 'function') {
      p.catch(err => console.warn('[notif-sound]', err.name, err.message));
    }
  } catch (e) {
    console.warn('[notif-sound] failed', e);
  }
}
