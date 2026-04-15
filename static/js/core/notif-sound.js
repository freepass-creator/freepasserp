/**
 * notif-sound.js — 알림 소리 (실제 WAV/MP3 파일 재생)
 *
 * 음원 팩 선택:
 *   - 'freepass': 프리패스 전용 (freepass-msg.mp3 / freepass-contract.mp3)
 *   - 'default':  기본 알림음 (sound-msg.wav / sound-contract.wav)
 * localStorage: fp.sound.pack ('freepass' | 'default')
 * localStorage: fp.sound.enabled ('0' | '1')
 */

const STORAGE_KEY_ENABLED = 'fp.sound.enabled';
const STORAGE_KEY_PACK = 'fp.sound.pack';
let lastPlayedAt = 0;

const SOUND_PACKS = {
  native: {
    msg: null, // OS 기본 알림음 (Notification API)
    contract: null,
    label: '기본 알림음 (OS)',
  },
  freepass: {
    msg: '/static/freepass-msg.mp3',
    contract: '/static/freepass-msg.mp3',
    label: '프리패스 (한국어)',
  },
  'freepass-eng': {
    msg: '/static/freepass-msg-eng.mp3',
    contract: '/static/freepass-msg-eng.mp3',
    label: '프리패스 (영어)',
  },
};

export function getSoundPack() {
  try {
    const v = localStorage.getItem(STORAGE_KEY_PACK) || 'freepass';
    return SOUND_PACKS[v] ? v : 'freepass';
  } catch { return 'freepass'; }
}
export function setSoundPack(pack) {
  if (!SOUND_PACKS[pack]) pack = 'freepass';
  try { localStorage.setItem(STORAGE_KEY_PACK, pack); } catch {}
}
export function listSoundPacks() {
  return Object.entries(SOUND_PACKS).map(([k, v]) => ({ value: k, label: v.label }));
}

function currentSrc(type) {
  const pack = SOUND_PACKS[getSoundPack()] || SOUND_PACKS.freepass;
  return type === 'contract' ? pack.contract : pack.msg;
}

// 모바일 unlock — 첫 터치 시 무음 재생 (실제 src 있는 팩만)
let unlocked = false;
function unlock() {
  if (unlocked) return;
  const srcs = new Set();
  Object.values(SOUND_PACKS).forEach(p => {
    if (p.msg) srcs.add(p.msg);
    if (p.contract) srcs.add(p.contract);
  });
  srcs.forEach(src => {
    try {
      const a = new Audio(src);
      a.volume = 0;
      const p = a.play();
      if (p && typeof p.then === 'function') {
        p.then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
      }
    } catch (_) {}
  });
  unlocked = true;
}
['touchstart', 'click', 'keydown'].forEach(ev => {
  document.addEventListener(ev, unlock, { passive: true });
});

export function isSoundEnabled() {
  try { return localStorage.getItem(STORAGE_KEY_ENABLED) !== '0'; } catch { return true; }
}
export function setSoundEnabled(on) {
  try { localStorage.setItem(STORAGE_KEY_ENABLED, on ? '1' : '0'); } catch {}
}

export function playNotifSound(opts = {}) {
  if (!isSoundEnabled()) return;
  const now = Date.now();
  if (now - lastPlayedAt < 1500) return;
  lastPlayedAt = now;

  const src = currentSrc(opts.type);
  try {
    if (!src) {
      // 기본(OS) — Notification API로 OS 기본 알림음 트리거
      if ('Notification' in window && Notification.permission === 'granted') {
        const title = opts.title || (opts.type === 'contract' ? '새 계약 알림' : '새 메시지');
        const body = opts.body || '';
        try { new Notification(title, { body, silent: false, tag: opts.tag || 'fp-notif' }); } catch (_) {}
      }
    } else {
      const audio = new Audio(src);
      audio.volume = 0.5;
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(err => console.warn('[notif-sound]', err.name, err.message));
      }
    }
    // 진동 (Android Chrome 등 지원, iOS Safari 미지원)
    if ('vibrate' in navigator) {
      const pattern = opts.type === 'contract' ? [100, 50, 100, 50, 100] : [150, 80, 150];
      try { navigator.vibrate(pattern); } catch {}
    }
  } catch (e) {
    console.warn('[notif-sound] failed', e);
  }
}

// OS 알림 표시 — Service Worker 우선 (foreground에서도 확실히 뜸)
async function showOsNotification(title, body, silent) {
  if (!('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  // Service Worker로 띄우면 foreground/background 무관하게 OS 알림으로 표시됨
  try {
    let reg = await navigator.serviceWorker.getRegistration('/static/');
    if (!reg) reg = await navigator.serviceWorker.getRegistration();
    if (reg && typeof reg.showNotification === 'function') {
      await reg.showNotification(title, {
        body,
        silent: !!silent,
        tag: 'fp-preview',
        icon: '/static/apple-touch-icon-180.png',
        badge: '/static/favicon.ico',
        renotify: true,
      });
      return true;
    }
  } catch (_) {}
  // Fallback — 직접 Notification (백그라운드에서만 보일 가능성)
  try {
    new Notification(title, { body, silent: !!silent, tag: 'fp-preview' });
    return true;
  } catch (_) {}
  return false;
}

// 샘플 재생 (설정 페이지에서 미리듣기) — 알림창 + 소리 동시 출력
export async function playSampleSound(pack, type = 'msg') {
  const p = SOUND_PACKS[pack] || SOUND_PACKS.freepass;
  const src = type === 'contract' ? p.contract : p.msg;
  const title = '프리패스 알림 테스트';
  const body = type === 'contract' ? '새 계약 알림이 이렇게 표시됩니다.' : '새 메시지 알림이 이렇게 표시됩니다.';

  if (!src) {
    // native — OS 기본 알림음 (Service Worker로 띄움 → silent:false → OS 사운드 자동 재생)
    const ok = await showOsNotification(title, body, false);
    if (!ok) {
      alert('OS 기본 알림음은 웹 푸시 권한이 있어야 재생됩니다.\n먼저 "웹 푸시 알림"을 켜주세요.');
    }
    return;
  }
  // 커스텀 음원 — 알림창은 silent로 띄움(중복 사운드 방지) + Audio 직접 재생
  showOsNotification(title, body, true);
  const audio = new Audio(src);
  audio.volume = 0.5;
  audio.play().catch(err => console.warn('[sample]', err.name, err.message));
}

// 호환성 — 기존 export 이름 유지
export const playMessageSound = () => playNotifSound({ type: 'message' });
export const playContractSound = () => playNotifSound({ type: 'contract' });
