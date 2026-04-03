import { loginWithEmail, watchAuth, isMasterAdminEmail, logoutCurrentUser } from '../firebase/firebase-auth.js';
import { getUserProfile, upsertUserProfile } from '../firebase/firebase-db.js';
import { qs } from '../core/utils.js';

document.addEventListener('contextmenu', (e) => e.preventDefault());

const form = qs('#login-form');
const message = qs('#login-message');

watchAuth(async (user) => {
  if (!user) return;

  if (isMasterAdminEmail(user.email)) {
    await upsertUserProfile(user.uid, {
      email: user.email,
      role: 'admin',
      company_code: 'admin',
      company_name: '프리패스모빌리티',
      user_code: 'A0001',
      admin_code: 'A0001',
      status: 'active'
    });
  }

  const profile = await getUserProfile(user.uid);
  if (!profile) return;

  if (profile.role !== 'admin' && profile.status !== 'active') {
    await logoutCurrentUser();
    message.textContent = `현재 계정 상태는 ${profile.status || 'pending'} 입니다. 관리자 승인 후 로그인할 수 있습니다.`;
    return;
  }

  const landingPage = profile.settings?.landing_page;
  if (landingPage) { window.location.href = landingPage; return; }

  if (profile.role === 'admin') { window.location.href = '/partner'; return; }
  if (profile.role === 'provider') { window.location.href = '/product-new'; return; }
  window.location.href = '/product-list';
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = qs('#login-email').value.trim();
  const password = qs('#login-password').value.trim();
  try {
    await loginWithEmail(email, password);
    message.textContent = '로그인 완료';
  } catch (error) {
    message.textContent = `로그인 실패: ${error.message}`;
  }
});
