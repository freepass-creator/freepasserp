import { watchAuth } from '../firebase/firebase-auth.js';
import { getUserProfile } from '../firebase/firebase-db.js';

export async function requireAuth(options = {}) {
  const { roles = [] } = options;
  return new Promise((resolve, reject) => {
    const unsubscribe = watchAuth(async (user) => {
      if (!user) {
        window.location.href = '/login';
        unsubscribe?.();
        reject(new Error('로그인이 필요합니다.'));
        return;
      }
      const profile = await getUserProfile(user.uid);
      if (!profile) {
        window.location.href = '/settings';
        unsubscribe?.();
        reject(new Error('사용자 정보가 없습니다.'));
        return;
      }
      if (profile.role !== 'admin' && profile.status !== 'active') {
        window.location.href = '/settings';
        unsubscribe?.();
        reject(new Error('활성 상태의 계정만 사용할 수 있습니다.'));
        return;
      }
      if (roles.length > 0 && !roles.includes(profile.role)) {
        window.location.href = '/product-list';
        unsubscribe?.();
        reject(new Error('권한이 없습니다.'));
        return;
      }
      unsubscribe?.();
      resolve({ user, profile });
    });
  });
}
