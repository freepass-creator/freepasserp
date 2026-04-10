import { watchAuth } from '../firebase/firebase-auth.js';
import { getUserProfile } from '../firebase/firebase-db.js';

const PROFILE_CACHE_KEY = 'fp.profile.cache';
const PROFILE_CACHE_TTL = 5 * 60 * 1000; // 5분

function getCachedProfile(uid) {
  try {
    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const { uid: cachedUid, profile, ts } = JSON.parse(raw);
    if (cachedUid !== uid) return null;
    if (Date.now() - ts > PROFILE_CACHE_TTL) return null;
    return profile;
  } catch { return null; }
}

function setCachedProfile(uid, profile) {
  try {
    sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ uid, profile, ts: Date.now() }));
  } catch {}
}

export function clearProfileCache() {
  try { sessionStorage.removeItem(PROFILE_CACHE_KEY); } catch {}
}

export async function requireAuth(options = {}) {
  const { roles = [] } = options;
  return new Promise((resolve, reject) => {
    const unsubscribe = watchAuth(async (user) => {
      if (!user) {
        clearProfileCache();
        window.location.href = '/login';
        unsubscribe?.();
        reject(new Error('로그인이 필요합니다.'));
        return;
      }
      // 1. 캐시에서 먼저 시도 (네트워크 호출 0)
      let profile = getCachedProfile(user.uid);
      // 2. 없으면 Firebase 조회 + 캐시 저장
      if (!profile) {
        profile = await getUserProfile(user.uid);
        if (profile) setCachedProfile(user.uid, profile);
      } else {
        // 백그라운드에서 최신 값 갱신 (await 안 함)
        getUserProfile(user.uid).then(fresh => { if (fresh) setCachedProfile(user.uid, fresh); }).catch(() => {});
      }
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
