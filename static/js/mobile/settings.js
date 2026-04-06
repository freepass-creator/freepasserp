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
    if (!el) continue;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.value = value;
    else el.textContent = value;
  }

  // 카탈로그 링크 생성
  const catalogUrl = `${location.origin}/catalog?a=${encodeURIComponent(profile.user_code || '')}`;
  const catalogInput = document.getElementById('ms-catalog-url');
  if (catalogInput) catalogInput.textContent = catalogUrl;

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

  // 앱 설치
  const installSection = document.getElementById('ms-install-section');
  const installBtn = document.getElementById('ms-install-btn');
  const installHint = document.getElementById('ms-install-hint');
  if (window.__pwaInstalled) {
    // 이미 설치됨 — 섹션 숨김
  } else if (/iPhone|iPad/.test(navigator.userAgent) && !navigator.standalone) {
    // iOS — 수동 안내
    if (installSection) installSection.hidden = false;
    if (installHint) installHint.textContent = 'Safari 하단 공유 버튼 → "홈 화면에 추가"를 눌러주세요.';
    if (installBtn) installBtn.textContent = '설치 안내';
    installBtn?.addEventListener('click', () => {
      showToast('Safari 하단 공유 버튼(□↑)을 누른 후\n"홈 화면에 추가"를 선택하세요.', 'info');
    });
  } else {
    // Android — beforeinstallprompt 사용
    if (installSection) installSection.hidden = false;
    installBtn?.addEventListener('click', () => {
      const prompt = window.__pwaPrompt;
      if (prompt) {
        prompt.prompt();
        prompt.userChoice.then(() => {
          window.__pwaPrompt = null;
          if (installSection) installSection.hidden = true;
          showToast('설치 완료!', 'success');
        });
      } else {
        showToast('브라우저 메뉴에서 "앱 설치" 또는\n"홈 화면에 추가"를 선택하세요.', 'info');
      }
    });
  }

  // 로그아웃
  document.getElementById('ms-logout')?.addEventListener('click', async () => {
    await logoutCurrentUser();
    location.href = '/login';
  });
}

export function onHide() { document.body.classList.remove('page-settings'); }
export function onShow() { document.body.classList.add('page-settings'); }

init().catch((e) => console.error('[mobile/settings]', e));
