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
    'top:50%',
    'left:50%',
    'transform:translate(-50%, -50%)',
    'z-index:99999',
    'background:#fff',
    'border:1px solid #e2e8f0',
    'border-radius:14px',
    'box-shadow:0 16px 48px rgba(0,0,0,0.22)',
    'padding:18px 20px',
    'min-width:320px',
    'max-width:min(92vw, 420px)',
    'font-family:inherit',
    'animation:push-banner-in 0.18s ease',
  ].join(';');
  // 백드롭 추가
  const backdrop = document.createElement('div');
  backdrop.id = 'push-perm-backdrop';
  backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.45);z-index:99998;animation:push-backdrop-in 0.18s ease;';
  document.body.appendChild(backdrop);
  document.body.appendChild(el);
  // 간단 인라인 스타일 보강
  const style = document.createElement('style');
  style.textContent = `
    @keyframes push-banner-in { from { opacity:0; transform:translate(-50%, -50%) scale(0.94); } to { opacity:1; transform:translate(-50%, -50%) scale(1); } }
    @keyframes push-backdrop-in { from { opacity:0; } to { opacity:1; } }
    #push-perm-banner .push-perm-banner__inner { display:flex; flex-direction:column; align-items:center; text-align:center; gap:12px; }
    #push-perm-banner .push-perm-banner__icon { width:44px; height:44px; border-radius:50%; background:#dbeafe; display:flex; align-items:center; justify-content:center; }
    #push-perm-banner .push-perm-banner__icon svg { color:#3b82f6; }
    #push-perm-banner .push-perm-banner__text { display:flex; flex-direction:column; gap:4px; }
    #push-perm-banner .push-perm-banner__text strong { font-size:15px; font-weight:700; color:#1e293b; letter-spacing:-0.02em; }
    #push-perm-banner .push-perm-banner__text span { font-size:12px; color:#64748b; line-height:1.5; }
    #push-perm-banner .push-perm-banner__actions { display:flex; gap:8px; width:100%; margin-top:4px; }
    #push-perm-banner .push-perm-banner__btn { flex:1; height:38px; padding:0 16px; border-radius:8px; border:none; font-size:13px; font-weight:600; cursor:pointer; letter-spacing:-0.02em; transition:background 0.12s; }
    #push-perm-banner .push-perm-banner__btn--ghost { background:#f1f5f9; color:#64748b; }
    #push-perm-banner .push-perm-banner__btn--ghost:hover { background:#e2e8f0; }
    #push-perm-banner .push-perm-banner__btn--primary { background:#1b2a4a; color:#fff; }
    #push-perm-banner .push-perm-banner__btn--primary:hover { background:#0f172a; }
  `;
  el.appendChild(style);
  const closeBanner = () => {
    el.remove();
    document.getElementById('push-perm-backdrop')?.remove();
  };
  el.querySelector('[data-action="accept"]')?.addEventListener('click', async () => {
    closeBanner();
    localStorage.setItem(PROMPTED_KEY, '1');
    if (typeof onAccept === 'function') await onAccept();
  });
  el.querySelector('[data-action="later"]')?.addEventListener('click', () => {
    closeBanner();
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
      // 대화 페이지 + 포커스 상태면 UI 가 이미 반영 → 모든 알림 생략
      const onChatPage = /^\/(chat|m\/chat)(\/|$)/.test(location.pathname);
      const isFocused = document.visibilityState === 'visible' && document.hasFocus();
      if (onChatPage && isFocused) return;

      // 다방면 알림 — 토스트 + 소리 + OS 시스템 알림 (탭이 가려져 있어도 뜨게)
      import('../core/toast.js').then(({ showToast }) => {
        showToast(`${title}${body ? ' — ' + body : ''}`, 'info');
      }).catch(() => {});
      import('./notif-sound.js').then((m) => {
        if (data.type === 'chat' && typeof m.playMessageSound === 'function') m.playMessageSound();
      }).catch(() => {});
      // Service Worker 를 통해 OS 알림 (Windows/Mac 알림센터)
      try {
        if ('Notification' in window && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistration().then((reg) => {
            if (!reg || typeof reg.showNotification !== 'function') return;
            reg.showNotification(title, {
              body,
              icon: '/static/apple-touch-icon-180.png',
              badge: '/static/favicon.ico',
              tag: data.room_id ? `chat-${data.room_id}` : 'fp-notif',
              renotify: true,
              silent: true, // 소리는 위 playMessageSound 로 이미 처리
              data: { link: data.link || '/chat' },
            }).catch(() => {});
          }).catch(() => {});
        }
      } catch (_) {}
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
