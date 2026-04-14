/**
 * mobile/settings.js — 모바일 설정
 */
import { requireAuth } from '../core/auth-guard.js';
import { updateUserProfile } from '../firebase/firebase-db.js';
import { logoutCurrentUser, sendPasswordReset } from '../firebase/firebase-auth.js';
import { escapeHtml } from '../core/management-format.js';
import { showToast, showConfirm } from '../core/toast.js';
import { wireHtmlCache } from './page-cache.js';
import { playNotifSound, setSoundEnabled } from '../core/notif-sound.js';

const $st = document.getElementById('m-settings');
const $help = document.getElementById('m-st-help');
const $notice = document.getElementById('m-st-notice');

const HELP_SECTIONS = [
  {
    title: '상품 보기',
    items: [
      '상단 검색창에서 차량번호·모델로 빠르게 찾기',
      '필터 버튼으로 가격·기간·제조사 등 다중 선택',
      '카드를 누르면 상세 정보, 사진 누르면 풀스크린',
    ],
  },
  {
    title: '대화',
    items: [
      '대화 목록의 미확인 표시는 안 읽은 메시지 수',
      '대화방 진입 시 자동 읽음 처리',
      '숨김 = 내 목록에서만 사라짐 / 삭제 = 영구',
    ],
  },
  {
    title: '계약',
    items: [
      '미입력 N = 계약 진행 6단계 중 안 누른 갯수',
      '카드 클릭 → 폼에서 수정 버튼 → 저장',
      '고객 정보는 기본 마스킹, 원본 열람은 비밀번호 필요',
    ],
  },
  {
    title: '계정',
    items: [
      '내 정보의 [수정] 버튼으로 직급·연락처 변경',
      '카탈로그 링크는 손님에게 공유',
      '비밀번호 재설정 메일은 가입한 이메일로 발송',
    ],
  },
];

let currentUser = null;
let currentProfile = null;
let isEditMode = false;

const SVG = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const ICO = {
  user:    SVG('<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>'),
  shield:  SVG('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>'),
  link:    SVG('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
  cog:     SVG('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  bell:    SVG('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
  info:    SVG('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
  chevron: SVG('<path d="m9 18 6-6-6-6"/>'),
};

// 로컬 설정 (localStorage)
const PREF_KEY = 'freepass.mobile.prefs';
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; }
}
function savePrefs(prefs) {
  localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
}
const DEFAULTS = {
  notify_chat: true,
  notify_contract: true,
  sound: true,
};
let prefs = { ...DEFAULTS, ...loadPrefs() };

function toggleRow(label, key) {
  return `<label class="m-st-toggle">
    <span class="m-st-toggle__label">${escapeHtml(label)}</span>
    <input type="checkbox" data-pref="${key}"${prefs[key] ? ' checked' : ''}>
    <span class="m-st-toggle__switch"></span>
  </label>`;
}

// 영문 값 → 한글 라벨
const ROLE_KO = { admin: '관리자', provider: '공급사', agent: '영업자', user: '일반회원' };
const STATUS_KO = { active: '활성', pending: '승인대기', suspended: '정지', deleted: '삭제됨', inactive: '비활성' };
function roleKo(v) { return ROLE_KO[String(v || '').toLowerCase()] || v || ''; }
function statusKo(v) { return STATUS_KO[String(v || '').toLowerCase()] || v || ''; }

function field(label, value, key, readonly = false, isEdit = false) {
  return `<div class="m-st-field">
    <span class="m-st-field__label">${escapeHtml(label)}</span>
    <input class="m-st-field__input" data-field="${key}" value="${escapeHtml(value || '')}"${(readonly || !isEdit) ? ' readonly' : ''}>
  </div>`;
}

// 내 카탈로그 URL 빌더
function buildMyCatalogUrl(p) {
  const url = new URL(location.origin + '/catalog');
  if (p.user_code) url.searchParams.set('a', p.user_code);
  if (p.role === 'provider' && p.company_code) {
    url.searchParams.set('provider', p.company_code);
  }
  // OG 타이틀용
  const agent = [p.name, p.position].filter(Boolean).join(' ');
  if (agent) url.searchParams.set('t', `전체상품 - ${agent}`);
  if (p.company_name) url.searchParams.set('c', p.company_name);
  return url.toString();
}

function render() {
  if (!$st || !currentProfile) return;
  const p = currentProfile;
  $st.classList.toggle('is-readonly', !isEditMode);

  $st.innerHTML = `
    <!-- 프로필 -->
    <section class="m-st-group">
      <div class="m-st-group__head">
        <span class="m-st-group__icon">${ICO.user}</span>
        <span class="m-st-group__title">내 정보</span>
        ${isEditMode
          ? `<button class="m-st-group__action" id="m-st-save" type="button">저장</button>`
          : `<button class="m-st-group__action" id="m-st-edit" type="button">수정</button>`}
      </div>
      <div class="m-st-group__body">
        <div class="m-st-fields">
          ${field('소속회사', p.company_name, 'company_name', true, false)}
          ${field('이름',     p.name,         'name',         false, isEditMode)}
          ${field('직급',     p.position,     'position',     false, isEditMode)}
          ${field('연락처',   p.phone,        'phone',        false, isEditMode)}
          ${field('기타정보', p.note,         'note',         false, isEditMode)}
        </div>
      </div>
    </section>

    <!-- 계정 -->
    <section class="m-st-group">
      <div class="m-st-group__head">
        <span class="m-st-group__icon">${ICO.shield}</span>
        <span class="m-st-group__title">계정 정보</span>
      </div>
      <div class="m-st-group__body">
        <div class="m-st-fields">
          ${field('이메일',   currentUser?.email, 'email',     true, false)}
          ${field('회원구분', roleKo(p.role),     'role',      true, false)}
          ${field('계정코드', p.user_code,        'user_code', true, false)}
          ${field('계정상태', statusKo(p.status), 'status',    true, false)}
        </div>
      </div>
    </section>

    <!-- 알림 -->
    <section class="m-st-group">
      <div class="m-st-group__head">
        <span class="m-st-group__icon">${ICO.bell}</span>
        <span class="m-st-group__title">알림</span>
      </div>
      <div class="m-st-group__body">
        <div class="m-st-toggles">
          ${toggleRow('새 대화 알림', 'notify_chat')}
          ${toggleRow('새 계약 알림', 'notify_contract')}
          ${toggleRow('알림 효과음', 'sound')}
        </div>
      </div>
    </section>

    <!-- 카탈로그 링크 -->
    <section class="m-st-group">
      <div class="m-st-group__head">
        <span class="m-st-group__icon">${ICO.link}</span>
        <span class="m-st-group__title">내 카탈로그</span>
      </div>
      <div class="m-st-group__body">
        <div class="m-st-link">
          <span class="m-st-link__url" id="m-st-catalog-url">${escapeHtml(buildMyCatalogUrl(p))}</span>
          <button class="m-st-link__btn" id="m-st-catalog-copy" type="button" aria-label="복사">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          </button>
          <button class="m-st-link__btn" id="m-st-catalog-share" type="button" aria-label="공유">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>
          </button>
        </div>
      </div>
    </section>

    <!-- 계정 관리 -->
    <section class="m-st-group">
      <div class="m-st-group__head">
        <span class="m-st-group__icon">${ICO.cog}</span>
        <span class="m-st-group__title">계정 관리</span>
      </div>
      <div class="m-st-group__body">
        <button class="m-st-action" id="m-st-pwreset" type="button">
          비밀번호 재설정
          ${ICO.chevron}
        </button>
        <button class="m-st-action is-danger" id="m-st-logout" type="button">
          로그아웃
          ${ICO.chevron}
        </button>
      </div>
    </section>

    <!-- 정보 -->
    <section class="m-st-group">
      <div class="m-st-group__head">
        <span class="m-st-group__icon">${ICO.info}</span>
        <span class="m-st-group__title">앱 정보</span>
      </div>
      <div class="m-st-group__body">
        <div class="m-st-fields">
          <div class="m-st-field">
            <span class="m-st-field__label">버전</span>
            <input class="m-st-field__input" value="${escapeHtml(window.APP_VER || '1.0.0')}" readonly>
          </div>
        </div>
        <button class="m-st-action" id="m-st-install" type="button">
          앱 설치하기
          ${ICO.chevron}
        </button>
      </div>
    </section>
  `;

  // 수정/저장
  $st.querySelector('#m-st-edit')?.addEventListener('click', () => {
    isEditMode = true;
    render();
  });
  $st.querySelector('#m-st-save')?.addEventListener('click', async () => {
    if (!currentUser) return;
    try {
      const updates = {};
      $st.querySelectorAll('[data-field]').forEach(el => {
        if (!el.readOnly) updates[el.dataset.field] = el.value;
      });
      await updateUserProfile(currentUser.uid, updates);
      Object.assign(currentProfile, updates);
      isEditMode = false;
      render();
      showToast('저장 완료', 'success');
    } catch (e) {
      console.error(e);
      showToast('저장 실패', 'error');
    }
  });

  // 알림 토글
  $st.querySelectorAll('[data-pref]').forEach(el => {
    el.addEventListener('change', () => {
      prefs[el.dataset.pref] = el.checked;
      savePrefs(prefs);
      // sound 토글은 notif-sound.js 공용 키와 동기화 + 즉시 테스트 재생 (user gesture 유지)
      if (el.dataset.pref === 'sound') {
        setSoundEnabled(el.checked);
        if (el.checked) {
          try {
            const a = new Audio('/static/sound-msg.wav');
            a.volume = 0.8;
            a.muted = false;
            showToast(`재생 시도 (볼륨 확인: 미디어 볼륨 켜짐?)`, 'info');
            const p = a.play();
            if (p && typeof p.then === 'function') {
              p.then(() => {
                showToast(`재생 성공 (duration: ${a.duration?.toFixed(2) || '?'}s)`, 'success');
              }).catch(err => {
                showToast(`실패: ${err.name} - ${err.message}`, 'error');
              });
            }
          } catch (err) {
            showToast(`에러: ${err.message}`, 'error');
          }
        }
      }
    });
  });

  // 페이지 로드 시 sound 상태 동기화
  try {
    const soundEnabled = localStorage.getItem('fp.sound.enabled') !== '0';
    const soundToggle = $st.querySelector('[data-pref="sound"]');
    if (soundToggle) soundToggle.checked = soundEnabled;
  } catch {}

  // 카탈로그 복사
  $st.querySelector('#m-st-catalog-copy')?.addEventListener('click', async () => {
    const url = $st.querySelector('#m-st-catalog-url')?.textContent || '';
    try {
      await navigator.clipboard.writeText(url);
      showToast('링크 복사됨', 'success');
    } catch (e) {
      showToast('복사 실패', 'error');
    }
  });

  // 카탈로그 공유 (Web Share API → 카톡 등)
  $st.querySelector('#m-st-catalog-share')?.addEventListener('click', async () => {
    const url = $st.querySelector('#m-st-catalog-url')?.textContent || '';
    if (!url) return;
    const agentPart = [currentProfile?.name, currentProfile?.position].filter(Boolean).join(' ');
    const company = currentProfile?.company_name || '';
    const title = `전체상품${agentPart ? ` - ${agentPart}` : ''}${company ? ` | ${company}` : ''}`;
    if (navigator.share) {
      try { await navigator.share({ title, url }); return; }
      catch (err) { if (err?.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('링크 복사됨', 'success');
    } catch { window.prompt('아래 링크를 복사하세요', url); }
  });

  // 비밀번호 재설정
  $st.querySelector('#m-st-pwreset')?.addEventListener('click', async () => {
    if (!currentUser?.email) return;
    const ok = await showConfirm('비밀번호 재설정 메일을 받으시겠습니까?');
    if (!ok) return;
    try {
      await sendPasswordReset(currentUser.email);
      showToast('재설정 메일을 보냈습니다', 'success');
    } catch (e) {
      console.error(e);
      showToast('메일 발송 실패', 'error');
    }
  });

  // 로그아웃
  $st.querySelector('#m-st-logout')?.addEventListener('click', async () => {
    const ok = await showConfirm('로그아웃 하시겠습니까?');
    if (!ok) return;
    try {
      await logoutCurrentUser();
      location.href = '/login';
    } catch (e) {
      console.error(e);
      showToast('로그아웃 실패', 'error');
    }
  });

  // 앱 설치
  $st.querySelector('#m-st-install')?.addEventListener('click', async () => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      showToast('이미 설치되어 있습니다', 'info');
      return;
    }
    const p = window.__fpInstallPrompt;
    if (!p) {
      showToast('이 브라우저에서는 직접 설치해주세요 (메뉴 → 홈 화면에 추가)', 'info');
      return;
    }
    try {
      p.prompt();
      await p.userChoice;
      window.__fpInstallPrompt = null;
    } catch (e) { console.error(e); }
  });
}

// 도움말 모달
function showHelp() {
  const html = HELP_SECTIONS.map(s => `
    <div class="m-st-help__section">
      <div class="m-st-help__section-title">${escapeHtml(s.title)}</div>
      <ul>${s.items.map(it => `<li>${escapeHtml(it)}</li>`).join('')}</ul>
    </div>`).join('');
  openSheet('도움말', html);
}

function showNotice() {
  openSheet('공지사항', '<div class="m-st-help__empty">등록된 공지사항이 없습니다</div>');
}

function openSheet(title, contentHtml) {
  const existing = document.querySelector('.m-st-sheet');
  if (existing) existing.remove();
  const sheet = document.createElement('div');
  sheet.className = 'm-st-sheet';
  sheet.innerHTML = `
    <div class="m-st-sheet__backdrop"></div>
    <div class="m-st-sheet__panel">
      <div class="m-st-sheet__head">
        <div class="m-st-sheet__title">${escapeHtml(title)}</div>
        <button class="m-st-sheet__close" type="button" aria-label="닫기"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
      </div>
      <div class="m-st-sheet__body">${contentHtml}</div>
    </div>
  `;
  document.body.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add('is-open'));
  const close = () => {
    sheet.classList.remove('is-open');
    setTimeout(() => sheet.remove(), 220);
  };
  sheet.querySelector('.m-st-sheet__backdrop').addEventListener('click', close);
  sheet.querySelector('.m-st-sheet__close').addEventListener('click', close);
}

$help?.addEventListener('click', showHelp);
$notice?.addEventListener('click', showNotice);

wireHtmlCache('fp_st_html', $st);

// ⚡ 뒤로가기 → 상품목록(홈)으로
history.pushState({ tabPage: true }, '', location.href);
window.addEventListener('popstate', () => {
  location.href = '/m/product-list';
});

(async () => {
  try {
    const auth = await requireAuth();
    currentUser = auth.user;
    currentProfile = auth.profile;
    render();
  } catch (e) {
    console.error('[mobile/settings] init failed', e);
    if ($st) $st.innerHTML = '<div class="m-st__loading">설정을 불러오지 못했습니다</div>';
  }
})();
