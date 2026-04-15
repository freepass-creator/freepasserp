/**
 * firebase-messaging-sw.js — FCM 백그라운드 메시지 수신 전용 SW
 *
 * 루트 sw.js(앱쉘 캐시)와 별개 파일. scope는 /static/ 하위.
 * 등록은 firebase-messaging.js 에서 명시적으로 함.
 */

importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyA0q_6yo9YRkpNeNaawH1AFPZx1IMgj-dY',
  authDomain: 'freepasserp3.firebaseapp.com',
  projectId: 'freepasserp3',
  storageBucket: 'freepasserp3.firebasestorage.app',
  messagingSenderId: '172664197996',
  appId: '1:172664197996:web:91b7219f22eb68b5005949',
});

const messaging = firebase.messaging();

// 백그라운드 메시지 — Cloud Function에서 webpush.fcmOptions.link 넣어 보내면 자동 처리됨
// 커스텀 표시 원할 때만 여기서 showNotification 호출
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const notif = payload.notification || {};
  const title = notif.title || '알림';
  const body = notif.body || '';
  const link = data.link || '/';
  self.registration.showNotification(title, {
    body,
    icon: '/static/apple-touch-icon-180.png',
    badge: '/static/favicon.ico',
    tag: data.tag || `notif-${Date.now()}`,
    data: { link },
  });
});

// 알림 클릭 → 해당 페이지 오픈 (이미 열려있으면 포커스)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/';
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      try {
        const url = new URL(client.url);
        if (url.pathname + url.search === link) {
          await client.focus();
          return;
        }
      } catch (_) {}
    }
    await self.clients.openWindow(link);
  })());
});
