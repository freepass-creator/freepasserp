/**
 * contract-send.js — 계약서 발송 (관리자 전용)
 * 좌측 A4 계약서 (iframe) ↔ 우측 입력 폼 실시간 바인딩
 */
import { requireAuth } from '../core/auth-guard.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { qs } from '../core/utils.js';

const state = {};
let $form, $iframe, $zoomVal;
let zoom = 1;

// iframe 내부 data-field 치환
function applyField(key, value) {
  const doc = $iframe?.contentDocument;
  if (!doc) return;
  doc.querySelectorAll(`[data-field="${key}"]`).forEach(node => {
    if (value == null || value === '') {
      node.textContent = node.dataset.defaultText || '';
    } else {
      node.textContent = value;
    }
  });
}

function rehydrate() {
  const doc = $iframe?.contentDocument;
  if (!doc) return;
  doc.querySelectorAll('[data-field]').forEach(node => {
    if (!('defaultText' in node.dataset)) {
      node.dataset.defaultText = node.textContent.trim();
    }
  });
  Object.entries(state).forEach(([k, v]) => applyField(k, v));
  resizeIframe();
}

// iframe 내부 문서 전체 높이로 iframe 크기 확장 (내부 스크롤 제거)
function resizeIframe() {
  try {
    const doc = $iframe?.contentDocument;
    if (!doc || !$iframe) return;
    // 먼저 height를 초기화해야 scrollHeight가 정확함
    $iframe.style.height = '0';
    const h = Math.max(
      doc.documentElement?.scrollHeight || 0,
      doc.body?.scrollHeight || 0,
      2970 // 최소 10페이지분 mm→px 환산 폴백 불필요, scrollHeight가 정확
    );
    $iframe.style.height = `${h}px`;
  } catch (e) {
    // 크로스 오리진 등 에러 시 폴백
    if ($iframe) $iframe.style.height = '2970mm';
  }
}

// 조합 필드 — 여러 입력을 하나의 계약서 data-field 로 합침
const COMPOSITE_FIELDS = {
  emergency_contact: {
    parts: ['emergency_name', 'emergency_relation', 'emergency_phone'],
    compose: (s) => {
      const name = s.emergency_name || '';
      const rel = s.emergency_relation || '';
      const phone = s.emergency_phone || '';
      const parts = [];
      if (name) parts.push(name);
      if (rel) parts.push(`(${rel})`);
      if (phone) parts.push(phone);
      return parts.join(' ');
    },
  },
};
// 역-조회: 파트 필드명 → 조합 필드명
const PART_TO_COMPOSITE = {};
Object.entries(COMPOSITE_FIELDS).forEach(([composite, cfg]) => {
  cfg.parts.forEach(p => { PART_TO_COMPOSITE[p] = composite; });
});

function onInput(e) {
  const el = e.target;
  const key = el?.dataset?.bind;
  if (!key) return;
  state[key] = el.value;

  const compositeKey = PART_TO_COMPOSITE[key];
  if (compositeKey) {
    const composed = COMPOSITE_FIELDS[compositeKey].compose(state);
    state[compositeKey] = composed;
    applyField(compositeKey, composed);
  } else {
    applyField(key, el.value);
  }
  updateGroupCount(el);
}

// 각 섹션(details) summary 에 "N / M" 카운트 표시
function updateGroupCount(changedEl) {
  const group = changedEl?.closest?.('.cs-group');
  if (!group) {
    // 초기 전체 갱신
    document.querySelectorAll('.cs-group').forEach(countGroup);
    return;
  }
  countGroup(group);
}
function countGroup(group) {
  const fields = group.querySelectorAll('[data-bind]');
  let filled = 0;
  fields.forEach(f => { if (f.value && String(f.value).trim()) filled++; });
  const counter = group.querySelector('.cs-group__count');
  if (counter) counter.textContent = `${filled} / ${fields.length}`;
}

function setZoom(z) {
  zoom = Math.max(0.4, Math.min(1.6, z));
  if ($iframe) $iframe.style.transform = `scale(${zoom})`;
  if ($zoomVal) $zoomVal.textContent = `${Math.round(zoom * 100)}%`;
}

async function bootstrap() {
  let profile;
  try {
    const auth = await requireAuth({ roles: ['admin'] });
    profile = auth?.profile;
  } catch (e) {
    return;
  }

  // 사이드바 메뉴 강제 재렌더 — SPA 캐시/이전 페이지 상태로 인한 빈 사이드바 방지
  const sidebarMenu = qs('#sidebar-menu');
  if (sidebarMenu && profile?.role) {
    delete sidebarMenu.dataset.renderedRole;
    renderRoleMenu(sidebarMenu, profile.role);
  }

  $form = document.getElementById('cs-form-body');
  $iframe = document.getElementById('cs-preview-iframe');
  $zoomVal = document.getElementById('cs-zoom-val');

  $form?.addEventListener('input', onInput);
  $form?.addEventListener('change', onInput);

  document.querySelectorAll('.cs-zoom__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const dir = btn.dataset.zoom;
      setZoom(zoom + (dir === '+' ? 0.1 : -0.1));
    });
  });

  document.getElementById('cs-btn-reset')?.addEventListener('click', () => {
    if (!confirm('입력 내용을 모두 초기화할까요?')) return;
    Object.keys(state).forEach(k => delete state[k]);
    $form?.querySelectorAll('input,select,textarea').forEach(el => { el.value = ''; });
    if ($iframe) $iframe.src = $iframe.src;
    updateGroupCount();
  });

  document.getElementById('cs-btn-pdf')?.addEventListener('click', () => {
    try {
      $iframe?.contentWindow?.focus();
      $iframe?.contentWindow?.print();
    } catch (err) {
      console.error('[contract-send] PDF print failed', err);
      alert('PDF 인쇄를 실행할 수 없습니다.');
    }
  });

  document.getElementById('cs-btn-modusign')?.addEventListener('click', () => {
    alert('모두사인 전송 기능은 준비 중입니다.');
  });

  $iframe?.addEventListener('load', () => {
    rehydrate();
    // 폰트 로드 후 재측정
    setTimeout(resizeIframe, 150);
    setTimeout(resizeIframe, 600);
  });

  window.addEventListener('resize', resizeIframe);

  setZoom(1);
  updateGroupCount();
}

let _mounted = false;
export async function mount() { _mounted = false; await bootstrap(); _mounted = true; }
export function unmount() { _mounted = false; }
if (!import.meta.url.includes('?')) mount();
