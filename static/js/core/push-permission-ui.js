/**
 * push-permission-ui.js — 푸시 권한 요청 UI
 *
 * 동작:
 *   1) 로그인 후 권한이 'default'면 하단 배너 한 번 표시 (localStorage로 중복 방지)
 *   2) "알림 켜기" 클릭 → 브라우저 권한 요청 + FCM 토큰 등록
 *   3) "나중에" 클릭 → 24시간 잠금
 *
 * 사용:
 *   import { initPushPermissionFlow } from '../core/push-permission-ui.js';
 *   await initPushPermissionFlow(user.uid);
 */

import {
  registerFcmToken,
  supportsWebPush,
  currentPermission,
  onForegroundMessage,
} from '../firebase/firebase-messaging.js';

const SNOOZE_KEY = 'fp.push.snoozeUntil';
const PROMPTED_KEY = 'fp.push.prompted';

function snoozed() {
  const until = Number(localStorage.getItem(SNOOZE_KEY) || 0);
  return until > Date.now();
}

function showBanner(onAccept, onDismiss) {
  if (document.getElementById('push-perm-banner')) return;
  const el = document.createElement('div');
  el.id = 'push-perm-banner';
  el.innerHTML = `
    <div class="push-perm-banner__inner">
      <div class="push-perm-banner__icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
      </div>
      <div class="push-perm-banner__text">
        <strong>새 메시지 알림 받기</strong>
        <span>브라우저를 안 보고 있어도 알림이 옵니다.</span>
      </div>
      <div class="push-perm-banner__actions">
        <button type="button" class="push-perm-banner__btn push-perm-banner__btn--ghost" data-action="later">나중에</button>
        <button type="button" class="push-perm-banner__btn push-perm-banner__btn--primary" data-action="accept">알림 켜기</button>
      </div>
    </div>
  `;
  el.style.cssText = [
    'position:fixed',
    'right:16px',
    'bottom:16px',
    'z-index:9999',
    'background:#fff',
    'border:1px solid #e2e8f0',
    'border-radius:12px',
    'box-shadow:0 8px 24px rgba(0,0,0,0.14)',
    'padding:10px 14px',
    'max-width:min(92vw, 360px)',
    'font-family:inherit',
    'animation:push-banner-in 0.2s ease',
  ].join(';');
  document.body.appendChild(el);
  // 간단 인라인 스타일 보강
  const style = document.createElement('style');
  style.textContent = `
    @keyframes push-banner-in { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
    #push-perm-banner .push-perm-banner__inner { display:flex; align-items:center; gap:10px; }
    #push-perm-banner .push-perm-banner__icon { color:#3b82f6; flex-shrink:0; }
    #push-perm-banner .push-perm-banner__text { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
    #push-perm-banner .push-perm-banner__text strong { font-size:13px; font-weight:600; color:#1e293b; letter-spacing:-0.02em; }
    #push-perm-banner .push-perm-banner__text span { font-size:11px; color:#64748b; }
    #push-perm-banner .push-perm-banner__actions { display:flex; gap:6px; flex-shrink:0; }
    #push-perm-banner .push-perm-banner__btn { height:30px; padding:0 12px; border-radius:999px; border:none; font-size:12px; font-weight:600; cursor:pointer; letter-spacing:-0.02em; }
    #push-perm-banner .push-perm-banner__btn--ghost { background:transparent; color:#64748b; }
    #push-perm-banner .push-perm-banner__btn--ghost:hover { background:#f1f5f9; }
    #push-perm-banner .push-perm-banner__btn--primary { background:#1b2a4a; color:#fff; }
    #push-perm-banner .push-perm-banner__btn--primary:hover { background:#0f172a; }
  `;
  el.appendChild(style);
  el.querySelector('[data-action="accept"]')?.addEventListener('click', async () => {
    el.remove();
    localStorage.setItem(PROMPTED_KEY, '1');
    if (typeof onAccept === 'function') await onAccept();
  });
  el.querySelector('[data-action="later"]')?.addEventListener('click', () => {
    el.remove();
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
    if (typeof onDismiss === 'function') onDismiss();
  });
}

/**
 * 로그인 직후 호출 — 권한 상태에 따라 분기:
 *   granted → 토큰 등록
 *   default → 배너 표시 (24h snooze 없을 때만)
 *   denied  → 아무 것도 안 함
 */
export async function initPushPermissionFlow(uid) {
  if (!uid) return;
  if (!supportsWebPush()) return;

  // 포그라운드 메시지 리스너 (한 번만 등록)
  if (!window.__fcmForegroundBound) {
    window.__fcmForegroundBound = true;
    onForegroundMessage((payload) => {
      const n = payload.notification || {};
      const data = payload.data || {};
      const title = n.title || '알림';
      const body = n.body || '';
      // 토스트로 표시 (이미 열려있는 화면)
      import('../core/toast.js').then(({ showToast }) => {
        showToast(`${title}${body ? ' — ' + body : ''}`, 'info');
      }).catch(() => {});
      // 알림 소리 재생 (기존 notif-sound 모듈)
      import('./notif-sound.js').then((m) => {
        if (data.type === 'chat' && typeof m.playMessageSound === 'function') m.playMessageSound();
      }).catch(() => {});
    }).catch(() => {});
  }

  const perm = currentPermission();
  if (perm === 'granted') {
    await registerFcmToken(uid).catch((e) => console.warn('[FCM] 등록 실패', e));
    return;
  }
  if (perm === 'denied') return;
  if (snoozed()) return;

  // default — 배너 표시
  showBanner(async () => {
    await registerFcmToken(uid).catch((e) => console.warn('[FCM] 등록 실패', e));
  });
}

/**
 * 설정 페이지에서 수동 재요청용 — "알림 다시 켜기" 버튼
 */
export async function manualEnablePush(uid) {
  if (!uid) return { ok: false, reason: 'no-uid' };
  localStorage.removeItem(SNOOZE_KEY);
  const token = await registerFcmToken(uid);
  return token ? { ok: true, token } : { ok: false, reason: 'denied' };
}
