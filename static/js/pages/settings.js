import { requireAuth } from '../core/auth-guard.js';
import { qs, registerPageCleanup, runPageCleanup } from '../core/utils.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { logoutCurrentUser, sendPasswordReset, deleteCurrentUser } from '../firebase/firebase-auth.js';
import { showToast, showConfirm } from '../core/toast.js';
import { syncEditSaveButtonTone } from '../core/management-skeleton.js';
import { updateUserProfile, fetchProductsOnce } from '../firebase/firebase-db.js';
import { storage } from '../firebase/firebase-config.js';
import { ref as sRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js';
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

  // 카탈로그 링크
  const catalogUrlInput = document.getElementById('settings-catalog-url');
  const catalogCopyBtn = document.getElementById('settings-catalog-copy');
  if (catalogUrlInput && profile.user_code) {
    const catalogUrl = `${location.origin}/catalog?a=${encodeURIComponent(profile.user_code)}`;
    catalogUrlInput.value = catalogUrl;
  }
  catalogCopyBtn?.addEventListener('click', () => {
    const url = catalogUrlInput?.value;
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      showToast('링크가 복사되었습니다.', 'success');
    }).catch(() => {
      catalogUrlInput.select();
      document.execCommand('copy');
      showToast('링크가 복사되었습니다.', 'success');
    });
  });

  function hrefToKey(href) { return href.replace(/\//g, '_'); }
  function keyToHref(key) { return key.replace(/^_/, '/'); }

  const ALL_PERIODS = ['1', '12', '24', '36', '48', '60'];
  const periodList = document.getElementById('settings-period-list');

  async function saveAppSettings() {
    try {
      const badge = {};
      badgeList?.querySelectorAll('input[data-badge-href]').forEach(input => {
        badge[hrefToKey(input.dataset.badgeHref)] = input.checked;
      });
      const periods = [];
      periodList?.querySelectorAll('input[data-period]').forEach(input => {
        if (input.checked) periods.push(input.dataset.period);
      });
      const newSettings = {
        ...(currentProfile.settings || {}),
        landing_page: landingSelect.value,
        badge,
        periods: periods.length ? periods : null,
      };
      await updateUserProfile(currentProfile.uid, { settings: newSettings });
      currentProfile.settings = newSettings;
      window.dispatchEvent(new CustomEvent('fp:settings-saved', { detail: { periods: periods.length ? periods : null } }));
      const badgeByHref = {};
      Object.entries(badge).forEach(([k, v]) => { badgeByHref[keyToHref(k)] = v; });
      applyBadgeVisibility(badgeByHref);
      if (msg) { msg.textContent = '저장 완료'; msg.classList.add('is-show'); setTimeout(() => msg.classList.remove('is-show'), 1500); }
    } catch (err) {
      if (msg) { msg.textContent = `저장 실패: ${err.message}`; msg.classList.add('is-show'); setTimeout(() => msg.classList.remove('is-show'), 3000); }
    }
  }

  // 초기 페이지
  const options = LANDING_OPTIONS.filter(o => o.roles.includes(profile.role));
  const savedLanding = profile.settings?.landing_page || '';
  landingSelect.innerHTML = options.map(o =>
    `<option value="${o.href}"${o.href === savedLanding ? ' selected' : ''}>${o.label}</option>`
  ).join('');
  landingSelect.addEventListener('change', saveAppSettings);

  // 상품목록 기간
  const savedPeriods = currentProfile.settings?.periods || null;
  if (periodList) {
    periodList.innerHTML = `<div class="settings-period-checks">${ALL_PERIODS.map(p => {
      const checked = !savedPeriods || savedPeriods.includes(p);
      return `<label class="settings-period-check">
        <input type="checkbox" data-period="${p}" ${checked ? 'checked' : ''}>
        <span>${p}개월</span>
      </label>`;
    }).join('')}</div>`;
    periodList.addEventListener('change', saveAppSettings);
  }

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

// ─── 데이터 다운로드 ────────────────────────────────────────────────────────

const DOWNLOAD_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>';

function toCsvString(headers, rows) {
  const escape = (v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(',')];
  rows.forEach(row => lines.push(row.map(escape).join(',')));
  return '\uFEFF' + lines.join('\r\n');
}

function downloadCsv(filename, csvString) {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const PRODUCT_CSV_COLS = [
  { key: 'car_number', label: '차량번호' },
  { key: 'vehicle_status', label: '차량상태' },
  { key: 'product_type', label: '상품구분' },
  { key: 'maker', label: '제조사' },
  { key: 'model_name', label: '모델명' },
  { key: 'sub_model', label: '세부모델' },
  { key: 'trim_name', label: '트림' },
  { key: 'year', label: '연식' },
  { key: 'fuel_type', label: '연료' },
  { key: 'vehicle_class', label: '차종구분' },
  { key: 'ext_color', label: '외부색상' },
  { key: 'int_color', label: '내부색상' },
  { key: 'mileage', label: '주행거리' },
  { key: 'vehicle_price', label: '차량가격' },
  { key: 'provider_company_code', label: '공급사코드' },
  { key: 'policy_code', label: '정책코드' },
  { key: 'options', label: '옵션' },
  { key: 'partner_memo', label: '특이사항' },
];

const PERIOD_KEYS = ['1', '12', '24', '36', '48', '60'];

async function downloadProducts() {
  const progress = showToast('상품 데이터 준비 중...', 'progress', { duration: 0 });
  try {
    const products = await fetchProductsOnce();
    const headers = [
      ...PRODUCT_CSV_COLS.map(c => c.label),
      ...PERIOD_KEYS.flatMap(p => [`${p}개월 대여료`, `${p}개월 보증금`, `${p}개월 수수료`]),
    ];
    const rows = products.map(item => {
      const base = PRODUCT_CSV_COLS.map(c => item[c.key] ?? '');
      const prices = PERIOD_KEYS.flatMap(p => {
        const rent = item[`rent_${p}`] ?? item.price?.[p]?.rent ?? '';
        const deposit = item[`deposit_${p}`] ?? item.price?.[p]?.deposit ?? '';
        const fee = item[`fee_${p}`] ?? item.price?.[p]?.fee ?? '';
        return [rent, deposit, fee];
      });
      return [...base, ...prices];
    });
    const csv = toCsvString(headers, rows);
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    downloadCsv(`상품목록_${today}.csv`, csv);
    progress.dismiss();
    showToast(`${products.length}건 다운로드 완료`, 'success');
  } catch (err) {
    progress.dismiss();
    showToast('다운로드 실패', 'error');
  }
}

function bindDownloadSection(profile) {
  const list = document.getElementById('settings-download-list');
  if (!list) return;

  const items = [
    { label: '상품 목록', fn: downloadProducts, roles: ['provider', 'agent', 'admin'] },
  ];

  list.innerHTML = items
    .filter(item => item.roles.includes(profile.role))
    .map(item => `
      <div class="settings-download-row">
        <span class="settings-download-label">${item.label}</span>
        <button class="settings-download-btn" data-dl="${item.label}" type="button" title="다운로드">${DOWNLOAD_ICON}</button>
      </div>
    `).join('');

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('.settings-download-btn');
    if (!btn) return;
    const label = btn.dataset.dl;
    const item = items.find(i => i.label === label);
    if (item) item.fn();
  });
}

function bindDocUploads() {
  const ciFileInput = document.getElementById('settings_ci_file');
  const cardFileInput = document.getElementById('settings_card_file');
  document.getElementById('settings_ci_upload')?.addEventListener('click', () => {
    if (!profileEditMode) return;
    ciFileInput?.click();
  });
  document.getElementById('settings_card_upload')?.addEventListener('click', () => {
    if (!profileEditMode) return;
    cardFileInput?.click();
  });

  // 기존 URL 표시
  const ciUrl = currentProfile?.ci_file_url;
  const cardUrl = currentProfile?.card_file_url;
  const ciLink = document.getElementById('settings_ci_link');
  const cardLink = document.getElementById('settings_card_link');
  if (ciUrl && ciLink) { ciLink.href = ciUrl; ciLink.hidden = false; }
  if (cardUrl && cardLink) { cardLink.href = cardUrl; cardLink.hidden = false; }

  async function uploadDoc(file, type) {
    if (!currentProfile?.uid) { showToast('로그인이 필요합니다.', 'error'); return; }
    const path = `user-docs/${currentProfile.uid}/${type}_${Date.now()}_${file.name}`;
    const fileRef = sRef(storage, path);
    const progress = showToast('업로드 중...', 'progress', { duration: 0 });
    try {
      await uploadBytes(fileRef, file, { contentType: file.type || 'application/octet-stream' });
      const url = await getDownloadURL(fileRef);
      const field = type === 'ci' ? 'ci_file_url' : 'card_file_url';
      await updateUserProfile(currentProfile.uid, { [field]: url });
      currentProfile[field] = url;
      progress.dismiss();
      showToast('업로드 완료', 'success');
      const linkEl = type === 'ci' ? ciLink : cardLink;
      if (linkEl) { linkEl.href = url; linkEl.hidden = false; }
    } catch (err) {
      progress.dismiss();
      showToast('업로드 실패', 'error');
    }
  }

  ciFileInput?.addEventListener('change', () => {
    if (ciFileInput.files?.[0]) uploadDoc(ciFileInput.files[0], 'ci');
    ciFileInput.value = '';
  });
  cardFileInput?.addEventListener('change', () => {
    if (cardFileInput.files?.[0]) uploadDoc(cardFileInput.files[0], 'card');
    cardFileInput.value = '';
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
    bindDownloadSection(profile);
    bindDocUploads();
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
