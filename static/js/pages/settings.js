import { requireAuth } from '../core/auth-guard.js';
import { qs, registerPageCleanup, runPageCleanup } from '../core/utils.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { logoutCurrentUser, sendPasswordReset, deleteCurrentUser } from '../firebase/firebase-auth.js';
import { showToast, showConfirm } from '../core/toast.js';
import { syncEditSaveButtonTone } from '../core/management-skeleton.js';
import { updateUserProfile } from '../firebase/firebase-db.js';
import { fillProfile } from './settings/helpers.js';

const LANDING_OPTIONS = [
  { href: '/home',         label: '대시보드',           roles: ['provider', 'agent', 'admin'] },
  { href: '/product-list', label: '전체 상품 검색',     roles: ['provider', 'agent', 'admin'] },
  { href: '/chat',         label: '실시간 문의·응대',   roles: ['provider', 'agent', 'admin'] },
  { href: '/contract',     label: '계약 관리',          roles: ['provider', 'agent', 'admin'] },
  { href: '/settlement',   label: '정산 · 수수료',      roles: ['provider', 'agent', 'admin'] },
  { href: '/product-new',  label: '재고 관리',          roles: ['provider', 'admin'] },
  { href: '/terms',        label: '운영 정책',          roles: ['provider', 'admin'] },
  { href: '/partner',      label: '파트너사 관리',      roles: ['admin'] },
  { href: '/member',       label: '사용자 관리',        roles: ['admin'] },
  { href: '/admin',        label: '관리자 페이지',      roles: ['admin'] },
];

let currentProfile = null;


let profileEditMode = false;
const editableFields = ['settings-name', 'settings-position', 'settings-phone', 'settings-note'];

function setProfileViewMode(isView) {
  profileEditMode = !isView;
  const form = document.getElementById('settings-profile-form');
  const btn = document.getElementById('settings-profile-submit');
  if (form) {
    form.classList.toggle('ui-mode-view', isView);
    form.classList.toggle('ui-mode-edit', !isView);
  }
  editableFields.forEach((id) => {
    const el = document.getElementById(id);
    if (el) { el.readOnly = isView; el.tabIndex = isView ? -1 : 0; }
  });
  if (btn) {
    btn.title = isView ? '수정' : '저장';
    syncEditSaveButtonTone(btn, isView);
  }
  const panel = form?.closest('.panel');
  if (panel) panel.dataset.panelMode = isView ? 'view' : 'edit';
}

async function saveProfile() {
  if (!currentProfile?.uid) return;
  const val = (id) => document.getElementById(id)?.value?.trim() || '';
  const updates = {
    name: val('settings-name'),
    position: val('settings-position'),
    phone: val('settings-phone'),
    note: val('settings-note')
  };
  try {
    await updateUserProfile(currentProfile.uid, updates);
    Object.assign(currentProfile, updates);
    showToast('저장 완료', 'success');
    setProfileViewMode(true);
  } catch (error) {
    showToast(`저장 실패: ${error.message}`, 'error');
  }
}

function bindCommonEvents() {
  document.getElementById('settings-profile-submit')?.addEventListener('click', async () => {
    if (!profileEditMode) { setProfileViewMode(false); return; }
    if (!await showConfirm('저장하시겠습니까?')) return;
    saveProfile();
  });

  const pwRow = document.querySelector('[data-action="password"]');
  const pwPanel = document.getElementById('password-change-panel');
  const delRow = document.querySelector('[data-action="delete"]');
  const delPanel = document.getElementById('delete-account-panel');
  const logoutRow = document.querySelector('[data-action="logout"]');

  function closeAll() {
    if (pwPanel) { pwPanel.hidden = true; pwRow?.classList.remove('is-open'); }
    if (delPanel) { delPanel.hidden = true; delRow?.classList.remove('is-open'); }
  }

  pwRow?.addEventListener('click', () => {
    const willOpen = pwPanel?.hidden;
    closeAll();
    if (willOpen && pwPanel) { pwPanel.hidden = false; pwRow.classList.add('is-open'); }
  });

  delRow?.addEventListener('click', () => {
    const willOpen = delPanel?.hidden;
    closeAll();
    if (willOpen && delPanel) { delPanel.hidden = false; delRow.classList.add('is-open'); }
  });

  logoutRow?.addEventListener('click', async () => {
    await logoutCurrentUser();
    window.location.href = '/login';
  });

  document.getElementById('send-password-reset-button')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const email = currentProfile?.email;
    if (!email) { showToast('이메일 정보가 없습니다.', 'error'); return; }
    try {
      await sendPasswordReset(email);
      showToast(`비밀번호 재설정 이메일을 ${email}로 발송했습니다.`, 'success');
      closeAll();
    } catch (error) {
      showToast(`발송 실패: ${error.message}`, 'error');
    }
  });

  document.getElementById('confirm-delete-button')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const confirmEmail = document.getElementById('delete-confirm-email')?.value?.trim();
    if (confirmEmail !== currentProfile?.email) {
      showToast('이메일이 일치하지 않습니다.', 'error');
      return;
    }
    try {
      await deleteCurrentUser();
      showToast('계정이 삭제되었습니다.', 'success');
      window.location.href = '/login';
    } catch (error) {
      showToast(`계정 삭제 실패: ${error.message}`, 'error');
    }
  });
}

const BADGE_PAGES = [
  { href: '/chat',       label: '실시간 문의·응대' },
  { href: '/contract',   label: '계약 관리' },
  { href: '/settlement', label: '정산 · 수수료' },
  { href: '/member',     label: '사용자 관리',     roles: ['admin'] },
  { href: '/partner',    label: '파트너사 관리',   roles: ['admin'] },
];

function bindAppSettings(profile) {
  const landingSelect = document.getElementById('settings-landing-page');
  const badgeList = document.getElementById('settings-badge-list');
  const msg = document.getElementById('settings-app-message');
  if (!landingSelect) return;

  function hrefToKey(href) { return href.replace(/\//g, '_'); }
  function keyToHref(key) { return key.replace(/^_/, '/'); }

  async function saveAppSettings() {
    try {
      const badge = {};
      badgeList?.querySelectorAll('input[data-badge-href]').forEach(input => {
        badge[hrefToKey(input.dataset.badgeHref)] = input.checked;
      });
      const newSettings = {
        ...(currentProfile.settings || {}),
        landing_page: landingSelect.value,
        badge,
      };
      await updateUserProfile(currentProfile.uid, { settings: newSettings });
      currentProfile.settings = newSettings;
      // href 기반으로 변환해서 반영
      const badgeByHref = {};
      Object.entries(badge).forEach(([k, v]) => { badgeByHref[keyToHref(k)] = v; });
      applyBadgeVisibility(badgeByHref);
      if (msg) msg.textContent = '저장 완료';
      setTimeout(() => { if (msg) msg.textContent = ''; }, 2000);
    } catch (err) {
      if (msg) msg.textContent = `저장 실패: ${err.message}`;
    }
  }

  // 초기 페이지
  const options = LANDING_OPTIONS.filter(o => o.roles.includes(profile.role));
  const savedLanding = profile.settings?.landing_page || '';
  landingSelect.innerHTML = options.map(o =>
    `<option value="${o.href}"${o.href === savedLanding ? ' selected' : ''}>${o.label}</option>`
  ).join('');
  landingSelect.addEventListener('change', saveAppSettings);

  // 알림 뱃지 — 페이지별 토글
  const badgeSettings = profile.settings?.badge || {};
  const visiblePages = BADGE_PAGES.filter(p => !p.roles || p.roles.includes(profile.role));
  if (badgeList) {
    badgeList.innerHTML = visiblePages.map(p => {
      const enabled = badgeSettings[hrefToKey(p.href)] !== false;
      return `<div class="settings-badge-row">
        <span class="settings-badge-label">${p.label}</span>
        <label class="toggle-switch">
          <input type="checkbox" data-badge-href="${p.href}" ${enabled ? 'checked' : ''}>
          <span class="toggle-switch-track"></span>
        </label>
      </div>`;
    }).join('');
    badgeList.addEventListener('change', saveAppSettings);
  }
}

function applyBadgeVisibility(badgeMap = {}) {
  Object.entries(badgeMap).forEach(([href, enabled]) => {
    const links = document.querySelectorAll(`.sidebar-link[href="${href}"]`);
    links.forEach(link => {
      const badge = link.querySelector('.sidebar-nav-badge');
      if (badge) badge.style.display = enabled ? '' : 'none';
      if (!enabled) link.classList.remove('has-new-event');
    });
  });
}

async function bootstrap() {
  try {
    const { user, profile } = await requireAuth({ roles: ['provider', 'agent', 'admin'] });
    currentProfile = { ...profile, uid: user.uid };
    renderRoleMenu(qs('#sidebar-menu'), profile.role);
    fillProfile(profile);
    setProfileViewMode(true);
    bindCommonEvents();

    bindAppSettings(profile);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

let _mounted = false;
export async function mount() {
  _mounted = false;
  await bootstrap();
  _mounted = true;
}
export function unmount() {
  runPageCleanup();
  _mounted = false;
}
// Auto-mount on first script load (server-rendered page)
if (!import.meta.url.includes('?')) mount();
