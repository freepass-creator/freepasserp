/**
 * mobile/settings.js — 모바일 전용 설정 페이지
 * 데스크탑 settings.js와 완전 분리.
 * 읽기 전용 프로필 + 카탈로그 링크 복사 + 로그아웃
 */
import { requireAuth } from '../core/auth-guard.js';
import { getUserProfile } from '../firebase/firebase-db.js';
import { logoutCurrentUser } from '../firebase/firebase-auth.js';
import { showToast } from '../core/toast.js';

const ROLE_LABELS = { admin: '관리자', provider: '공급사', agent: '영업자' };
const STATUS_LABELS = { active: '활성', pending: '승인대기', suspended: '정지' };

async function init() {
  const { user, profile } = await requireAuth();

  // 프로필 정보 표시
  const fields = {
    'ms-company': profile.company_name || profile.company || '-',
    'ms-code': profile.user_code || profile.company_code || '-',
    'ms-name': profile.name || profile.user_name || '-',
    'ms-position': profile.position || profile.rank || '-',
    'ms-email': user.email || '-',
    'ms-role': ROLE_LABELS[profile.role] || profile.role || '-',
    'ms-status': STATUS_LABELS[profile.status] || profile.status || '-',
    'ms-phone': profile.phone || '-',
  };
  for (const [id, value] of Object.entries(fields)) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  // 카탈로그 링크 생성
  const catalogUrl = `${location.origin}/catalog?a=${encodeURIComponent(profile.user_code || '')}`;
  const catalogInput = document.getElementById('ms-catalog-url');
  if (catalogInput) catalogInput.value = catalogUrl;

  // 카탈로그 링크 복사
  document.getElementById('ms-catalog-copy')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(catalogUrl);
      showToast('카탈로그 링크가 복사되었습니다.');
    } catch {
      // fallback
      catalogInput?.select();
      document.execCommand('copy');
      showToast('카탈로그 링크가 복사되었습니다.');
    }
  });

  // 카탈로그 공유 (Web Share API)
  document.getElementById('ms-catalog-share')?.addEventListener('click', async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'FREEPASS 렌터카 상품',
          text: `${profile.company_name || ''} ${profile.name || ''} 카탈로그`,
          url: catalogUrl,
        });
      } catch { /* 사용자 취소 */ }
    } else {
      // share 미지원 시 복사
      await navigator.clipboard.writeText(catalogUrl).catch(() => {});
      showToast('카탈로그 링크가 복사되었습니다.');
    }
  });

  // 로그아웃
  document.getElementById('ms-logout')?.addEventListener('click', async () => {
    await logoutCurrentUser();
    location.href = '/login';
  });
}

export function onHide() { document.body.classList.remove('page-settings'); }
export function onShow() { document.body.classList.add('page-settings'); }

init().catch((e) => console.error('[mobile/settings]', e));
