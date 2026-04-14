/**
 * notif-sound.js — 알림 소리
 * HTMLAudioElement + data URL 기반 (외부 파일/AudioContext 불필요)
 */

const STORAGE_KEY = 'fp.sound.enabled';
let lastPlayedAt = 0;

// 짧은 WAV 비프음 (사인파) — 메시지/계약 구분
// 16-bit PCM, 44100Hz, mono
function makeBeepDataUrl(freq = 880, duration = 0.2) {
  const sampleRate = 44100;
  const samples = Math.floor(sampleRate * duration);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);

  // WAV 헤더
  const writeStr = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples * 2, true);

  // 사인파 데이터 + 페이드아웃
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 8); // 감쇠
    const v = Math.sin(2 * Math.PI * freq * t) * env * 0.4;
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7FFF, true);
  }

  // base64 인코딩
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return 'data:audio/wav;base64,' + btoa(binary);
}

let audioMsg = null;
let audioContract = null;
let audioUnlocked = false;

function getAudio(type) {
  if (type === 'contract') {
    if (!audioContract) { audioContract = new Audio(makeBeepDataUrl(660, 0.25)); audioContract.volume = 0.5; }
    return audioContract;
  }
  if (!audioMsg) { audioMsg = new Audio(makeBeepDataUrl(880, 0.2)); audioMsg.volume = 0.5; }
  return audioMsg;
}

// 모바일용 오디오 unlock — 첫 터치 시 무음 재생으로 권한 획득
function setupUnlock() {
  const unlock = () => {
    if (audioUnlocked) return;
    try {
      const msg = getAudio('message');
      const contract = getAudio('contract');
      // 무음으로 재생했다가 즉시 멈춤 → 브라우저가 이 오디오 객체를 unlock
      const origMsgVol = msg.volume;
      const origContractVol = contract.volume;
      msg.volume = 0;
      contract.volume = 0;
      Promise.all([msg.play().catch(() => {}), contract.play().catch(() => {})]).then(() => {
        msg.pause(); msg.currentTime = 0; msg.volume = origMsgVol;
        contract.pause(); contract.currentTime = 0; contract.volume = origContractVol;
        audioUnlocked = true;
      });
    } catch {}
  };
  ['touchstart', 'click', 'keydown'].forEach(ev => {
    document.addEventListener(ev, unlock, { once: false, passive: true });
  });
}
setupUnlock();

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
    const audio = getAudio(opts.type || 'message');
    audio.currentTime = 0;
    const p = audio.play();
    if (p && typeof p.catch === 'function') {
      p.catch(err => console.warn('[notif-sound] play blocked', err.name));
    }
  } catch (e) {
    console.warn('[notif-sound] play failed', e);
  }
}
