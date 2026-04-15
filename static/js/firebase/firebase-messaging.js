/**
 * firebase-messaging.js — FCM 토큰 등록·갱신 + 포그라운드 수신
 *
 * 사용:
 *   import { registerFcmToken } from './firebase-messaging.js';
 *   await registerFcmToken(user.uid);  // 로그인 성공 후 호출
 *
 * 필요조건:
 *   1) Firebase Console → Cloud Messaging → Web Push certificates 에서 VAPID 키 발급 완료
 *   2) /static/firebase-messaging-sw.js 파일 배치 완료
 *   3) HTTPS 또는 localhost (Service Worker 요건)
 */

import {
  getMessaging, getToken, onMessage, isSupported,
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging.js';
import { ref, set } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';
import { app, db } from './firebase-config.js';

export const VAPID_KEY = 'BEzn7JeQVD6bj8W8Eib9jSJUztdmdo6UjQ8hEgCYyp9bK_PZw-xVwnZrOOydcru2k7nMxektniBF2CG3iCAVx-0';

let _messaging = null;
let _swReg = null;

async function ensureMessaging() {
  if (_messaging) return _messaging;
  const ok = await isSupported().catch(() => false);
  if (!ok) return null;
  _messaging = getMessaging(app);
  return _messaging;
}

async function ensureServiceWorker() {
  if (_swReg) return _swReg;
  if (!('serviceWorker' in navigator)) return null;
  try {
    _swReg = await navigator.serviceWorker.register('/static/firebase-messaging-sw.js', {
      scope: '/static/',
    });
    await navigator.serviceWorker.ready;
    return _swReg;
  } catch (e) {
    console.warn('[FCM] SW 등록 실패', e);
    return null;
  }
}

export function supportsWebPush() {
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

export function currentPermission() {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    const result = await Notification.requestPermission();
    return result; // 'granted' | 'denied' | 'default'
  } catch (e) {
    console.warn('[FCM] 권한 요청 실패', e);
    return 'denied';
  }
}

/**
 * FCM 토큰 등록 — 권한 요청 → 토큰 획득 → RTDB 저장
 * 반환: 토큰 문자열 or null
 */
export async function registerFcmToken(uid) {
  if (!uid) return null;
  if (!supportsWebPush()) {
    console.info('[FCM] 브라우저 미지원 — 스킵');
    return null;
  }
  const perm = await requestNotificationPermission();
  if (perm !== 'granted') {
    console.info('[FCM] 권한 없음:', perm);
    return null;
  }
  const messaging = await ensureMessaging();
  if (!messaging) return null;
  const swReg = await ensureServiceWorker();
  if (!swReg) return null;

  try {
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
    if (!token) {
      console.warn('[FCM] 토큰 없음');
      return null;
    }
    // RTDB에 저장 (uid/token 구조 — 같은 uid가 여러 기기 가능)
    await set(ref(db, `fcm_tokens/${uid}/${token}`), {
      created_at: Date.now(),
      user_agent: String(navigator.userAgent || '').slice(0, 200),
      platform: detectPlatform(),
    });
    return token;
  } catch (e) {
    console.warn('[FCM] getToken 실패', e);
    return null;
  }
}

/**
 * 포그라운드 메시지 수신 콜백 등록
 * (앱 열린 상태에서 FCM 수신 시 브라우저 알림이 자동 뜨지 않음 — 직접 처리 필요)
 */
export async function onForegroundMessage(callback) {
  const messaging = await ensureMessaging();
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    try { callback(payload); } catch (e) { console.warn('[FCM] foreground cb 오류', e); }
  });
}

function detectPlatform() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'web';
}
