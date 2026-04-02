import { onValue, ref } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';
import { escapeHtml } from '../core/management-format.js';
import { requireAuth } from '../core/auth-guard.js';
import { registerPageCleanup, runPageCleanup } from '../core/utils.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { db } from '../firebase/firebase-config.js';
import { watchContracts, watchPartners, watchProducts, watchRooms, watchSettlements, watchTerms, watchUsers } from '../firebase/firebase-db.js';

let menu, sectionsWrap, roleSummary;
let noticeMessage, noticeList, noticeMeta;

function bindDOM() {
  menu = document.getElementById('sidebar-menu');
  sectionsWrap = document.getElementById('homeSections');
  roleSummary = document.getElementById('homeRoleSummary');
  noticeMessage = document.getElementById('homeNoticeMessage');
  noticeList = document.getElementById('homeNoticeList');
  noticeMeta = document.getElementById('homeNoticeMeta');
}

let currentProfile = null;
let currentUid = '';
const ALL_SECTIONS = ['product', 'chat', 'contract', 'settlement', 'inventory', 'policy', 'partner', 'member'];
let openSections = loadOpenSections();

function loadOpenSections() {
  try {
    const saved = localStorage.getItem('fp.dashboard.open');
    if (saved) return new Set(JSON.parse(saved));
  } catch (_) {}
  return new Set(ALL_SECTIONS);
}

function saveOpenSections() {
  try { localStorage.setItem('fp.dashboard.open', JSON.stringify([...openSections])); } catch (_) {}
}
let ds = { products: [], rooms: [], contracts: [], settlements: [], terms: [], partners: [], users: [] };

function fmtDate(v) {
  const d = new Date(Number(v || 0));
  if (Number.isNaN(d.getTime()) || d.getTime() <= 0) return '-';
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}
function fmtMoney(v) { const n = Number(v || 0); return (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('ko-KR'); }
function roleName(r) { return r === 'admin' ? '관리자' : r === 'provider' ? '공급사' : r === 'agent' ? '영업자' : '사용자'; }

// ─── 필터 ───────────────────────────────────────────────────────────────────

function isPM(item) {
  const cc = String(currentProfile?.company_code || '').trim();
  return cc && [item.provider_company_code, item.partner_code, item.company_code].map(v => String(v || '').trim()).includes(cc);
}
function isAM(item) {
  const uc = String(currentProfile?.user_code || '').trim();
  return [item.agent_uid, item.user_uid].map(v => String(v || '').trim()).includes(String(currentUid || '').trim())
    || [item.agent_code, item.sales_code, item.user_code].map(v => String(v || '').trim()).includes(uc);
}
function vP(items) { return currentProfile?.role === 'provider' ? items.filter(isPM) : items; }
function vR(items) {
  // hidden 처리된 방 제외
  const visible = items.filter(r => {
    const hb = r.hidden_by;
    if (!hb) return true;
    if (typeof hb === 'object' && hb[currentUid]) return false;
    return true;
  });
  if (currentProfile?.role === 'admin') return visible;
  if (currentProfile?.role === 'provider') return visible.filter(i => isPM(i) || String(i.provider_uid || '').trim() === currentUid);
  if (currentProfile?.role === 'agent') return visible.filter(isAM);
  return [];
}
function vC(items) {
  if (currentProfile?.role === 'admin') return items;
  if (currentProfile?.role === 'provider') return items.filter(isPM);
  if (currentProfile?.role === 'agent') return items.filter(isAM);
  return [];
}
function vS(items) { return vC(items); }

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────

function gc(items, key) {
  const m = {};
  items.forEach(i => { const v = String(i[key] || '-').trim() || '-'; m[v] = (m[v] || 0) + 1; });
  return m;
}

// 공급사 시점 회신대기 판단: 영업자가 마지막 발송했거나, 공급사 미읽음이 있으면 회신대기
function isProviderPending(room) {
  const eff = room.last_effective_sender_role || '';
  const last = room.last_sender_role || '';
  const sender = (eff === 'agent' || eff === 'provider') ? eff : ((last === 'agent' || last === 'provider') ? last : '');
  if (sender === 'agent') return true;
  if (Number(room.unread_for_provider || 0) > 0) return true;
  return false;
}

// 영업자 시점 회신대기 판단: 공급사가 마지막 발송했거나, 영업자 미읽음이 있으면 회신대기
function isAgentPending(room) {
  const eff = room.last_effective_sender_role || '';
  const last = room.last_sender_role || '';
  const sender = (eff === 'agent' || eff === 'provider') ? eff : ((last === 'agent' || last === 'provider') ? last : '');
  if (sender === 'provider') return true;
  if (Number(room.unread_for_agent || 0) > 0) return true;
  return false;
}

function replyPending(room) {
  const role = currentProfile?.role;
  const hasMsg = Number(room.last_message_at || 0) > 0;
  if (!hasMsg) return false;
  if (role === 'admin' || role === 'provider') return isProviderPending(room);
  return isAgentPending(room);
}

function periodStamps() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayOfWeek = now.getDay() || 7; // 월=1 ... 일=7
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  return { today, weekStart, monthStart, lastMonthStart, lastMonthEnd: monthStart };
}

function periodFilter(items, key = 'created_at') {
  const { today, weekStart, monthStart, lastMonthStart, lastMonthEnd } = periodStamps();
  return {
    today: items.filter(i => Number(i[key] || 0) >= today),
    week: items.filter(i => Number(i[key] || 0) >= weekStart),
    month: items.filter(i => Number(i[key] || 0) >= monthStart),
    lastMonth: items.filter(i => { const t = Number(i[key] || 0); return t >= lastMonthStart && t < lastMonthEnd; }),
  };
}

function topModels(items, n = 5) {
  return topN(items, 'model_name', n).length ? topN(items, 'model_name', n) : topN(items, 'model', n);
}

// ─── 리포트 HTML ────────────────────────────────────────────────────────────

function row(label, value, accent = false) {
  const cls = accent ? ' rpt--accent' : '';
  return `<div class="rpt-row${cls}"><span class="rpt-label">${escapeHtml(label)}</span><span class="rpt-value">${escapeHtml(String(value))}</span></div>`;
}

function rptGroup(title, rows, totalLabel = '') {
  const filtered = rows.filter(Boolean);
  if (!filtered.length) return '';
  const titleHtml = totalLabel
    ? `<div class="rpt-group__title"><span>${escapeHtml(title)}</span><span class="rpt-group__total">${escapeHtml(totalLabel)}</span></div>`
    : `<div class="rpt-group__title"><span>${escapeHtml(title)}</span></div>`;
  return `<div class="rpt-group">${titleHtml}<div class="rpt-group__body">${filtered.join('')}</div></div>`;
}

// ─── 섹션 빌더 ──────────────────────────────────────────────────────────────

function topN(items, key, n = 5) {
  const m = {};
  items.forEach(i => { const v = String(i[key] || '').trim(); if (v && v !== '-') m[v] = (m[v] || 0) + 1; });
  return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function buildProductSection() {
  const items = vP(ds.products);
  const available = items.filter(i => i.vehicle_status === '출고가능' || i.vehicle_status === '출고협의');
  const byStatus = gc(items, 'vehicle_status');
  const byType = gc(items, 'product_type');
  const byClass = topN(items, 'vehicle_class', 5);
  const byFuel = topN(items, 'fuel_type', 5);
  const top5 = topModels(items);
  const byMaker = topN(items, 'maker', 5);

  const typeCount = Object.entries(byType).filter(([k]) => k !== '-').length;

  const body = [
    rptGroup('상품구분', Object.entries(byType).filter(([k]) => k !== '-').map(([k, v]) => row(k, v + '대')), items.length + '대'),
    rptGroup('제조사 TOP5', byMaker.map(([k, v]) => row(k, v + '대')), items.length + '대'),
    rptGroup('모델 TOP5', top5.map(([k, v]) => row(k, v + '대')), items.length + '대'),
    rptGroup('차종구분', byClass.map(([k, v]) => row(k, v + '대')), items.length + '대'),
    rptGroup('연료', byFuel.map(([k, v]) => row(k, v + '대')), items.length + '대'),
  ].filter(Boolean).join('');

  return { key: 'product', title: '상품', desc: '출고 가능 재고와 차량 분포', href: '/product-list', pending: 0, summary: `전체 ${items.length}대 · 출고가능 ${available.length}대`, body };
}

function buildChatSection() {
  const items = vR(ds.rooms);
  const role = currentProfile?.role;
  const newRooms = items.filter(r => !Number(r.last_message_at || 0)).length;
  const withMsg = items.filter(r => Number(r.last_message_at || 0) > 0);

  let pendingCount, repliedCount;
  if (role === 'admin' || role === 'provider') {
    pendingCount = withMsg.filter(isProviderPending).length;
    repliedCount = withMsg.length - pendingCount;
  } else {
    pendingCount = withMsg.filter(isAgentPending).length;
    repliedCount = withMsg.length - pendingCount;
  }

  const body = [
    rptGroup('대화상태', [
      row('대화중', withMsg.length + '건'),
      row('신규', newRooms + '건'),
    ], items.length + '건'),
    rptGroup('처리상태', [
      row('회신대기', pendingCount + '건', pendingCount > 0),
      row('회신완료', repliedCount + '건'),
    ], (pendingCount + repliedCount) + '건'),
  ].filter(Boolean).join('');

  const chatParts = [`전체 ${items.length}건`];
  if (pendingCount) chatParts.push(`회신대기 ${pendingCount}건`);
  chatParts.push(`대화중 ${withMsg.length}건`);
  return { key: 'chat', title: '문의·응대', desc: '답변 안 한 문의가 있는지 확인', href: '/chat', pending: pendingCount, summary: chatParts.join(' · '), body };
}

function buildContractSection() {
  const items = vC(ds.contracts);
  const byStatus = gc(items, 'contract_status');
  const pending = items.filter(c => c.contract_status !== '계약완료').length;
  const contractStatuses = ['계약대기', '계약요청', '계약발송', '계약완료'];
  const p = periodFilter(items, 'updated_at');

  function contractPeriodGroup(label, list) {
    const s = gc(list, 'contract_status');
    return rptGroup(label, contractStatuses.map(st => {
      const n = s[st] || 0;
      return row(st, n + '건', n > 0 && st !== '계약완료');
    }), list.length + '건');
  }

  const body = [
    contractPeriodGroup('오늘', p.today),
    contractPeriodGroup('이번주', p.week),
    contractPeriodGroup('이번달', p.month),
    contractPeriodGroup('지난달', p.lastMonth),
  ].filter(Boolean).join('');

  const ctParts = [`전체 ${items.length}건`];
  if (pending) ctParts.push(`계약대기 ${byStatus['계약대기'] || 0}건`);
  ctParts.push(`계약완료 ${byStatus['계약완료'] || 0}건`);
  return { key: 'contract', title: '계약', desc: '기간별 계약 현황', href: '/contract', pending, summary: ctParts.join(' · '), body };
}

function buildSettlementSection() {
  const items = vS(ds.settlements);
  const totalFee = items.reduce((s, i) => s + Number(i.fee_amount || 0), 0);
  const done = ['정산완료', '환수결정'];
  const pending = items.filter(s => !done.includes(s.settlement_status || s.status || '')).length;
  const settlementStatuses = ['정산대기', '정산완료', '환수대기', '환수결정'];
  const p = periodFilter(items, 'updated_at');

  function stlPeriodGroup(label, list) {
    const byS = {};
    list.forEach(i => {
      const st = i.settlement_status || i.status || '정산대기';
      if (!byS[st]) byS[st] = { count: 0, amount: 0 };
      byS[st].count++;
      byS[st].amount += Number(i.fee_amount || 0);
    });
    const totalAmt = list.reduce((s, i) => s + Number(i.fee_amount || 0), 0);
    return rptGroup(label, settlementStatuses.map(st => {
      const g = byS[st];
      if (!g) return row(st, '0건 / 0원');
      return row(st, g.count + '건 / ' + fmtMoney(g.amount) + '원', g.count > 0 && !done.includes(st));
    }), list.length + '건 / ' + fmtMoney(totalAmt) + '원');
  }

  const body = [
    stlPeriodGroup('오늘', p.today),
    stlPeriodGroup('이번주', p.week),
    stlPeriodGroup('이번달', p.month),
    stlPeriodGroup('지난달', p.lastMonth),
  ].filter(Boolean).join('');

  const byStatus = gc(items, 'settlement_status');
  const stParts = [`전체 ${items.length}건`, `${fmtMoney(totalFee)}원`];
  if (pending) stParts.push(`정산대기 ${byStatus['정산대기'] || 0}건`);
  return { key: 'settlement', title: '정산', desc: '기간별 정산 현황', href: '/settlement', pending, summary: stParts.join(' · '), body };
}

function buildPartnerSection() {
  if (currentProfile?.role !== 'admin') return null;
  const items = ds.partners;
  const byStatus = gc(items, 'status');
  const pending = byStatus['pending'] || 0;

  const body = [
    rptGroup('상태', [
      row('승인완료', (byStatus['approved'] || byStatus['active'] || 0) + '개'),
      row('승인대기', pending + '개', pending > 0),
      row('비활성', (byStatus['inactive'] || byStatus['disabled'] || 0) + '개'),
    ], items.length + '개'),
  ].filter(Boolean).join('');

  const ptParts = [`전체 ${items.length}개`];
  if (pending) ptParts.push(`승인대기 ${pending}개`);
  return { key: 'partner', title: '파트너', desc: '승인 안 한 입점 신청 확인', href: '/partner', pending, summary: ptParts.join(' · '), body };
}

function buildMemberSection() {
  if (currentProfile?.role !== 'admin') return null;
  const items = ds.users;
  const byStatus = gc(items, 'status');
  const byRole = gc(items, 'role');
  const pending = byStatus['pending'] || 0;

  const body = [
    rptGroup('상태', [
      row('활성', (byStatus['approved'] || byStatus['active'] || 0) + '명'),
      row('승인대기', pending + '명', pending > 0),
      row('비활성', (byStatus['inactive'] || byStatus['disabled'] || 0) + '명'),
    ], items.length + '명'),
    rptGroup('역할', [
      row('관리자', (byRole['admin'] || 0) + '명'),
      row('공급사', (byRole['provider'] || 0) + '명'),
      row('영업자', (byRole['agent'] || 0) + '명'),
    ], items.length + '명'),
  ].filter(Boolean).join('');

  const mbParts = [`전체 ${items.length}명`];
  if (pending) mbParts.push(`승인대기 ${pending}명`);
  return { key: 'member', title: '회원', desc: '가입 승인 대기자와 역할 분포', href: '/member', pending, summary: mbParts.join(' · '), body };
}

function buildInventorySection() {
  const role = currentProfile?.role;
  if (role !== 'provider' && role !== 'admin') return null;
  const items = vP(ds.products);
  const byStatus = gc(items, 'vehicle_status');
  const byType = gc(items, 'product_type');
  const byMaker = topN(items, 'maker', 5);
  const top5 = topModels(items);
  const byFuel = topN(items, 'fuel_type', 5);

  const body = [
    rptGroup('차량상태', [
      row('출고가능', (byStatus['출고가능'] || 0) + '대'),
      row('출고협의', (byStatus['출고협의'] || 0) + '대'),
      row('출고불가', (byStatus['출고불가'] || 0) + '대'),
      row('계약대기', (byStatus['계약대기'] || 0) + '대'),
      row('계약완료', (byStatus['계약완료'] || 0) + '대'),
    ], items.length + '대'),
    rptGroup('상품구분', Object.entries(byType).filter(([k]) => k !== '-').map(([k, v]) => row(k, v + '대')), items.length + '대'),
    rptGroup('제조사 TOP5', byMaker.map(([k, v]) => row(k, v + '대')), items.length + '대'),
    rptGroup('모델 TOP5', top5.map(([k, v]) => row(k, v + '대')), items.length + '대'),
    rptGroup('연료', byFuel.map(([k, v]) => row(k, v + '대')), items.length + '대'),
  ].filter(Boolean).join('');

  return { key: 'inventory', title: '재고', desc: '내 재고 상태와 출고 현황', href: '/product-new', pending: 0, summary: `전체 ${items.length}대 · 출고가능 ${byStatus['출고가능'] || 0}대`, body };
}

function buildPolicySection() {
  const role = currentProfile?.role;
  if (role !== 'provider' && role !== 'admin') return null;
  const items = ds.terms;
  const active = items.filter(t => t.status !== 'inactive').length;
  const inactive = items.filter(t => t.status === 'inactive').length;
  const byProvider = gc(items, 'provider_company_code');

  const providerCount = Object.entries(byProvider).filter(([k]) => k !== '-' && k).length;

  const body = [
    rptGroup('상태', [
      row('활성', active + '건'),
      row('비활성', inactive + '건'),
    ], items.length + '건'),
    rptGroup('공급사별', Object.entries(byProvider).filter(([k]) => k !== '-' && k).slice(0, 8).map(([k, v]) => row(k, v + '건')), providerCount + '개'),
  ].filter(Boolean).join('');

  return { key: 'policy', title: '정책', desc: '정책 등록 현황과 상태', href: '/terms', pending: 0, summary: `전체 ${items.length}건 · 활성 ${active}건`, body };
}

// ─── 렌더링 ─────────────────────────────────────────────────────────────────

function renderSection(sec) {
  const isOpen = openSections.has(sec.key);
  const badge = sec.pending > 0 ? `<span class="home-section-badge">${sec.pending}</span>` : '';
  const summary = sec.summary ? `<span class="home-section-summary">${escapeHtml(sec.summary)}</span>` : '';

  return `
    <div class="home-section${isOpen ? ' is-open' : ''}" data-section="${sec.key}">
      <div class="home-section-head" data-toggle="${sec.key}">
        <div class="home-section-head__left">
          <svg class="home-section-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          <span class="home-section-title">${escapeHtml(sec.title)}</span>
          ${badge}
          ${summary}
        </div>
        <div class="home-section-head__right">
          <span class="home-section-desc">${escapeHtml(sec.desc)}</span>
          <a class="home-section-link" href="${sec.href}">바로가기 →</a>
        </div>
      </div>
      <div class="home-section-body">${sec.body}</div>
    </div>`;
}

function renderDashboard() {
  if (!sectionsWrap) return;
  const sections = [
    buildProductSection(),
    buildChatSection(),
    buildContractSection(),
    buildSettlementSection(),
    buildInventorySection(),
    buildPolicySection(),
    buildPartnerSection(),
    buildMemberSection(),
  ].filter(Boolean);

  sectionsWrap.innerHTML = sections.map(renderSection).join('');

  sectionsWrap.querySelectorAll('[data-toggle]').forEach(head => {
    head.addEventListener('click', (e) => {
      if (e.target.closest('.home-section-link')) return;
      const key = head.dataset.toggle;
      const sec = head.closest('.home-section');
      if (openSections.has(key)) { openSections.delete(key); sec?.classList.remove('is-open'); }
      else { openSections.add(key); sec?.classList.add('is-open'); }
      saveOpenSections();
    });
  });
}

// ─── 공지 ───────────────────────────────────────────────────────────────────

function renderNotices(items = []) {
  const notices = [...items].sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));
  if (noticeMeta) noticeMeta.textContent = `${notices.length}건`;
  if (!noticeList) return;
  if (!notices.length) { noticeList.innerHTML = '<div class="home-notice-empty">등록된 공지가 없습니다.</div>'; return; }
  noticeList.replaceChildren(...notices.map(notice => {
    const wrap = document.createElement('article');
    wrap.className = 'home-notice-item'; wrap.dataset.noticeId = notice.id;
    wrap.innerHTML = `
      <button type="button" class="home-notice-trigger">
        <span class="home-notice-title">${notice.title || '제목 없음'}</span>
        <span class="home-notice-date">${fmtDate(notice.created_at)}</span>
      </button>
      <div class="home-notice-body">
        <div class="home-notice-copy">${String(notice.body || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
        ${notice.image_url ? `<img class="home-notice-img" src="${String(notice.image_url).replace(/"/g, '')}" alt="" loading="lazy">` : ''}
        <div class="home-notice-foot">
          <div class="home-notice-writer">${notice.writer_name || '관리자'}</div>
        </div>
      </div>`;
    return wrap;
  }));
}

function bindNoticeEvents() {
  if (!noticeList) return;
  noticeList.addEventListener('click', (e) => {
    const trigger = e.target.closest('.home-notice-trigger');
    if (trigger) { trigger.closest('.home-notice-item')?.classList.toggle('is-open'); }
  });
}

// ─── 초기화 ─────────────────────────────────────────────────────────────────

function mountWatchers() {
  registerPageCleanup(watchProducts(items => { ds.products = items || []; renderDashboard(); }));
  registerPageCleanup(watchRooms(items => { ds.rooms = items || []; renderDashboard(); }));
  registerPageCleanup(watchContracts(items => { ds.contracts = items || []; renderDashboard(); }));
  registerPageCleanup(watchSettlements(items => { ds.settlements = items || []; renderDashboard(); }));
  if (currentProfile?.role === 'provider' || currentProfile?.role === 'admin') {
    registerPageCleanup(watchTerms(items => { ds.terms = items || []; renderDashboard(); }));
  }
  if (currentProfile?.role === 'admin') {
    registerPageCleanup(watchPartners(items => { ds.partners = items || []; renderDashboard(); }));
    registerPageCleanup(watchUsers(items => { ds.users = items || []; renderDashboard(); }));
  } else { ds.partners = []; ds.users = []; }
}

async function bootstrap() {
  try {
    const { user, profile } = await requireAuth({ roles: ['provider', 'agent', 'admin'] });
    currentProfile = profile; currentUid = user.uid;
    renderRoleMenu(menu, profile.role);
    roleSummary.textContent = `${roleName(profile.role)} · 미처리 현황`;
    bindNoticeEvents();
    mountWatchers();
    registerPageCleanup(onValue(ref(db, 'home_notices'), snap => {
      const raw = snap.val() || {};
      renderNotices(Object.entries(raw).map(([id, v]) => ({ id, ...(v || {}) })));
    }));
    renderDashboard();
  } catch (err) {
    console.error(err);
    if (noticeMessage) noticeMessage.textContent = err.message || '홈을 불러오지 못했습니다.';
  }
}

let _mounted = false;
export async function mount() { bindDOM(); _mounted = false; await bootstrap(); _mounted = true; }
export function unmount() { runPageCleanup(); _mounted = false; }
if (!import.meta.url.includes('?')) mount();
