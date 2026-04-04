import { loginWithEmail, watchAuth, isMasterAdminEmail, logoutCurrentUser } from '../firebase/firebase-auth.js';
import { getUserProfile, upsertUserProfile } from '../firebase/firebase-db.js';

const form = document.querySelector('#login-new-form');
const emailInput = document.querySelector('#login-new-email');
const passwordInput = document.querySelector('#login-new-password');
const message = document.querySelector('#login-new-message');

function setMessage(text = '') {
  if (message) message.textContent = text;
}

watchAuth(async (user) => {
  if (!user) return;

  if (isMasterAdminEmail(user.email)) {
    // 최초 생성 시에만 기본값 설정, 이후 DB 값 유지
    const existing = await getUserProfile(user.uid);
    if (!existing) {
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
  }

  const profile = await getUserProfile(user.uid);
  if (!profile) return;

  if (profile.role !== 'admin' && profile.status !== 'active') {
    await logoutCurrentUser();
    setMessage(`현재 계정 상태는 ${profile.status || 'pending'} 입니다. 관리자 승인 후 로그인할 수 있습니다.`);
    return;
  }

  window.location.href = '/product-list';
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = String(emailInput?.value || '').trim();
  const password = String(passwordInput?.value || '').trim();

  if (!email || !password) {
    setMessage('이메일과 비밀번호를 입력하세요.');
    return;
  }

  try {
    setMessage('로그인 중...');
    await loginWithEmail(email, password);
    setMessage('로그인 완료');
  } catch (error) {
    setMessage(`로그인 실패: ${error.message}`);
  }
});
