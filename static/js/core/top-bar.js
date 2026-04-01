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

requireAuth().then(({ user, profile }) => {
  const org  = getEl('topBarOrg');
  const name = getEl('topBarName');
  const rank = getEl('topBarRank');

  if (org)  org.textContent  = profile?.company_name || '-';
  if (name) name.textContent = profile?.name || user?.displayName || '-';
  if (rank) rank.textContent = ROLE_LABEL[profile?.role] || profile?.role || '-';
}).catch(() => {});
