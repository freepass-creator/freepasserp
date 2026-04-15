import { requireAuth } from './auth-guard.js';

const ROLE_LABEL = { admin: '관리자', provider: '공급사', agent: '영업자' };

const MODE_LABEL = { view: '보기', create: '신규', edit: '수정 중' };

function getEl(id) { return document.getElementById(id); }

export function setTopBarWorkState(mode) {
  const badge = getEl('topBarWorkBadge');
  const sep   = getEl('topBarStateSep');
  if (!badge || !sep) return;

  const label = MODE_LABEL[mode] || '';
  if (label) {
    badge.textContent = label;
    badge.dataset.mode = mode;
    sep.hidden = false;
  } else {
    badge.textContent = '';
    delete badge.dataset.mode;
    sep.hidden = true;
  }
}

import { logoutCurrentUser } from '../firebase/firebase-auth.js';

requireAuth().then(({ user, profile }) => {
  const org  = getEl('topBarOrg');
  const name = getEl('topBarName');
  const rank = getEl('topBarRank');

  if (org)  org.textContent  = profile?.company_name || '-';
  if (name) name.textContent = profile?.name || user?.displayName || '-';
  if (rank) {
    const position = String(profile?.position || '').trim();
    rank.textContent = position || ROLE_LABEL[profile?.role] || '-';
  }

  const logoutBtn = getEl('topBarLogoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await logoutCurrentUser();
        window.location.href = '/login';
      } catch (e) {
        console.warn('logout failed', e);
      }
    });
  }
}).catch(() => {});
