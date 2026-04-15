/**
 * mobile/catalog.js — 모바일 카탈로그 (공개 상품 페이지)
 * 모바일 ERP(product.js)와 동일한 UI, 차이점:
 * - 로그인 불필요 (signInAnonymously)
 * - 하단 탭바 대신 "연락하기" CTA
 * - 수수료 섹션 없음
 */
import { auth, db } from '../firebase/firebase-config.js';
import { signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';
import { escapeHtml } from '../core/management-format.js';
import { toggleFilter, applyFilter } from './filter-sheet.js';
import { renderMobileProductCard } from '../shared/mobile-product-card.js';
import { renderMobileProductDetail } from '../shared/mobile-product-detail-markup.js';
import { open as openViewer, close as closeViewer, isOpen as isViewerOpen } from '../shared/fullscreen-photo-viewer.js';

// ─── DOM ──────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const $grid       = $('m-catalog-grid');
const $search     = $('m-catalog-search');
const $filterBtn  = $('m-catalog-filter-btn');
const $detail     = $('m-catalog-detail');
const $gallery    = $('m-catalog-gallery');
const $body       = $('m-catalog-body');
const $topLeft    = document.querySelector('.m-topbar__left');
const $topRight   = document.querySelector('.m-topbar__right');
let _topLeftHtml  = '';
let _topRightHtml = '';
// CTA 바는 .m-page 밖에 동적 삽입 (CSS 형제 선택자 호환)
let $cta, $ctaCall, $ctaText;
function ensureCta() {
  if ($cta) return;
  const html = `<div class="m-catalog-cta" id="m-catalog-cta" hidden>
    <a class="m-catalog-cta__btn" id="m-catalog-call" href="tel:">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
      <span id="m-catalog-call-text">연락하기</span>
    </a>
  </div>`;
  const tabbar = document.getElementById('m-tabbar');
  if (tabbar) tabbar.insertAdjacentHTML('beforebegin', html);
  else document.body.insertAdjacentHTML('beforeend', html);
  $cta = $('m-catalog-cta');
  $ctaCall = $('m-catalog-call');
  $ctaText = $('m-catalog-call-text');
}

// ─── URL 파라미터 ─────────────────────────────────
const params      = new URLSearchParams(location.search);
const agentCode   = params.get('a') || params.get('agent') || '';
const shareId     = params.get('id') || '';
const shareCar    = params.get('car') || '';
const providerParam = params.get('provider') || '';
const hasShare    = !!(shareId || shareCar);

// ─── 상태 ─────────────────────────────────────────
let allProducts = [];
let allPolicies = [];
let searchQuery = '';
let activeFilters = { selected: {}, searchText: {} };

// ─── 필터 ─────────────────────────────────────────
const RENT_BUCKETS = [
  { value: '50만원 이하', label: '50만원 이하', range: [0, 500000] },
  { value: '50만원~', label: '50만원~', range: [500000, 600000] },
  { value: '60만원~', label: '60만원~', range: [600000, 700000] },
  { value: '70만원~', label: '70만원~', range: [700000, 800000] },
  { value: '80만원~', label: '80만원~', range: [800000, 900000] },
  { value: '90만원~', label: '90만원~', range: [900000, 1000000] },
  { value: '100만원~', label: '100만원~', range: [1000000, 1500000] },
  { value: '150만원~', label: '150만원~', range: [1500000, null] },
];
const DEP_BUCKETS = [
  { value: '100만원 이하', label: '100만원 이하', range: [0, 1000000] },
  { value: '100만원~', label: '100만원~', range: [1000000, 2000000] },
  { value: '200만원~', label: '200만원~', range: [2000000, 3000000] },
  { value: '300만원~', label: '300만원~', range: [3000000, 5000000] },
  { value: '500만원~', label: '500만원~', range: [5000000, null] },
];
const MILE_BUCKETS = [
  { value: '1만Km 이하', label: '1만km 이하', range: [0, 10000] },
  { value: '1만Km~', label: '1만km~', range: [10000, 30000] },
  { value: '3만Km~', label: '3만km~', range: [30000, 50000] },
  { value: '5만Km~', label: '5만km~', range: [50000, 70000] },
  { value: '7만Km~', label: '7만km~', range: [70000, 100000] },
  { value: '10만Km~', label: '10만km~', range: [100000, 150000] },
  { value: '15만Km~', label: '15만km~', range: [150000, null] },
];
// ERP 모바일(product.js)과 완전 동일한 필터 그룹
const FILTER_GROUPS = [
  { key: 'rent', title: '월 대여료', icon: 'money', type: 'range', buckets: RENT_BUCKETS },
  { key: 'deposit', title: '보증금', icon: 'deposit', type: 'range', buckets: DEP_BUCKETS },
  { key: 'periods', title: '기간', icon: 'calendar', type: 'periods', options: ['1','12','24','36','48','60'] },
  { key: 'maker', title: '제조사', icon: 'car', type: 'check', field: 'maker' },
  { key: 'model_name', title: '모델', icon: 'layers', type: 'check', field: 'model_name' },
  { key: 'sub_model', title: '세부모델', icon: 'rows', type: 'check', field: 'sub_model' },
  { key: 'trim_name', title: '세부트림', icon: 'award', type: 'search', field: 'trim_name', placeholder: '트림명 검색' },
  { key: 'options', title: '선택옵션', icon: 'list', type: 'search', field: 'options', placeholder: '옵션명 검색' },
  { key: 'year', title: '연식', icon: 'hash', type: 'check', field: 'year', sort: 'desc' },
  { key: 'mileage', title: '주행거리', icon: 'road', type: 'range', buckets: MILE_BUCKETS },
  { key: 'fuel_type', title: '연료', icon: 'fuel', type: 'check', field: 'fuel_type' },
  { key: 'color', title: '색상', icon: 'palette', type: 'check', fields: ['ext_color', 'int_color'] },
  { key: 'vehicle_class', title: '차종구분', icon: 'shape', type: 'check', field: 'vehicle_class' },
  { key: 'screening_criteria', title: '심사기준', icon: 'shield', type: 'policyCheck', field: 'screening_criteria' },
  { key: 'basic_driver_age', title: '최저연령', icon: 'user', type: 'policyCheck', field: 'basic_driver_age' },
  { key: 'provider_company_code', title: '공급코드', icon: 'building', type: 'check', field: 'provider_company_code' },
];

// ─── 렌더 ─────────────────────────────────────────
let _lastRendered = [];
function renderGrid(items) {
  _lastRendered = items;
  if (!$grid) return;
  if (!items.length) {
    $grid.innerHTML = '<div style="grid-column:1/-1;padding:48px 0;text-align:center;color:#94a3b8;">상품이 없습니다</div>';
    return;
  }
  $grid.innerHTML = items.map((p, i) =>
    renderMobileProductCard(p, { href: `#detail-${i}` })
  ).join('');
  $grid.querySelectorAll('.m-product-card').forEach((el, i) => { el.dataset.index = i; });
}

let _renderRaf = 0;
function applySearch() {
  if (_renderRaf) cancelAnimationFrame(_renderRaf);
  _renderRaf = requestAnimationFrame(() => {
    _renderRaf = 0;
    let result = allProducts;
    result = applyFilter(result, activeFilters, FILTER_GROUPS, allPolicies);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(p => {
        const fields = [p.car_number, p.maker, p.model_name, p.sub_model, p.trim_name];
        return fields.some(f => String(f || '').toLowerCase().includes(q));
      });
    }
    renderGrid(result);
  });
}

function getFiltered() {
  let result = allProducts;
  result = applyFilter(result, activeFilters, FILTER_GROUPS, allPolicies);
  const q = searchQuery.trim().toLowerCase();
  if (q) {
    result = result.filter(p => {
      const fields = [p.car_number, p.maker, p.model_name, p.sub_model, p.trim_name];
      return fields.some(f => String(f || '').toLowerCase().includes(q));
    });
  }
  return result;
}

// ─── 상세 뷰 ─────────────────────────────────────
let detailProduct = null;
let galleryIndex = 0;

function getPhotos(p) {
  return (Array.isArray(p.image_urls) && p.image_urls.length ? p.image_urls : null) || (p.image_url ? [p.image_url] : []);
}

function renderDetailGallery(p) {
  const photos = getPhotos(p);
  if (!photos.length) {
    $gallery.innerHTML = `<div class="m-catalog-detail__gallery-empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" style="color:rgba(255,255,255,0.15)"><path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8"/><path d="M7 14h.01"/><path d="M17 14h.01"/><rect width="18" height="8" x="3" y="10" rx="2"/><path d="M5 18v2"/><path d="M19 18v2"/></svg>
      <span style="margin-top:8px">등록된 사진이 없습니다</span>
    </div>`;
    return;
  }
  const idx = Math.min(galleryIndex, photos.length - 1);
  const navs = photos.length > 1 ? `
    <button class="m-catalog-detail__nav m-catalog-detail__nav--prev" id="cat-gal-prev" type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m15 18-6-6 6-6"/></svg></button>
    <button class="m-catalog-detail__nav m-catalog-detail__nav--next" id="cat-gal-next" type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg></button>
  ` : '';
  const counter = photos.length > 1 ? `<div class="m-catalog-detail__counter">${idx + 1} / ${photos.length}</div>` : '';
  $gallery.innerHTML = `<img src="${escapeHtml(photos[idx])}" alt="">${navs}${counter}`;

  // 갤러리 nav 이벤트
  $('cat-gal-prev')?.addEventListener('click', () => { galleryIndex = (galleryIndex - 1 + photos.length) % photos.length; renderDetailGallery(p); });
  $('cat-gal-next')?.addEventListener('click', () => { galleryIndex = (galleryIndex + 1) % photos.length; renderDetailGallery(p); });
  // 이미지 클릭 → 풀스크린
  $gallery.querySelector('img')?.addEventListener('click', () => openViewer(photos, idx));
}

// ─── 상단바 전환 ──────────────────────────────────
function switchTopbarToDetail(p) {
  if (!_topLeftHtml && $topLeft) _topLeftHtml = $topLeft.innerHTML;
  if (!_topRightHtml && $topRight) _topRightHtml = $topRight.innerHTML;
  const carNo = p.car_number || '';
  const sub = p.sub_model || p.model_name || '';
  const title = [carNo, sub].filter(Boolean).join(' ');
  if ($topLeft) $topLeft.innerHTML = `
    <button class="m-icon-btn" id="m-cat-back" type="button" aria-label="뒤로">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
    </button>
    <div class="m-page-title">${escapeHtml(title)}</div>`;
  if ($topRight) $topRight.innerHTML = `
    <button class="m-icon-btn" id="m-cat-share" type="button" aria-label="공유">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>
    </button>`;
  $('m-cat-back')?.addEventListener('click', () => { history.back(); });
  $('m-cat-share')?.addEventListener('click', () => shareCurrent());
}
function switchTopbarToList() {
  if (_topLeftHtml && $topLeft) $topLeft.innerHTML = _topLeftHtml;
  if (_topRightHtml && $topRight) $topRight.innerHTML = _topRightHtml;
  // 검색 이벤트 재바인딩
  const newSearch = $('m-catalog-search');
  if (newSearch) {
    newSearch.value = searchQuery;
    newSearch.addEventListener('input', () => {
      searchQuery = newSearch.value;
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(applySearch, 200);
    });
  }
  $('m-catalog-filter-btn')?.addEventListener('click', handleFilterClick);
}
function shareCurrent() {
  if (!detailProduct) return;
  const p = detailProduct;
  const pid = p._key || p.product_uid || '';
  const carTitle = [p.car_number, p.maker, p.model_name].filter(Boolean).join(' ');
  const url = new URL(location.origin + '/catalog');
  if (agentCode) url.searchParams.set('a', agentCode);
  if (pid) url.searchParams.set('id', pid);
  if (carTitle) url.searchParams.set('t', carTitle);
  navigator.clipboard?.writeText(url.toString())
    .then(() => { /* TODO: toast */ })
    .catch(() => { window.prompt('링크를 복사하세요', url.toString()); });
}

function showDetail(p) {
  detailProduct = p;
  galleryIndex = 0;
  switchTopbarToDetail(p);
  const policiesArr = allPolicies && typeof allPolicies === 'object'
    ? (Array.isArray(allPolicies) ? allPolicies : Object.values(allPolicies))
    : [];
  // 갤러리+본문 모두 renderMobileProductDetail에서 통합 렌더 (ERP 모바일과 동일)
  // $gallery 요소는 비우고 숨김 — 갤러리는 renderMobileProductDetail이 처리
  $gallery.innerHTML = '';
  $gallery.hidden = true;
  $body.innerHTML = `<div class="m-pd">${renderMobileProductDetail(p, {
    policies: policiesArr,
    showGallery: true,
    showFee: false,
  })}</div>`;
  $grid.hidden = true;
  $detail.hidden = false;
  const page = document.querySelector('.m-page');
  if (page) page.scrollTop = 0;
  history.pushState({ view: 'detail' }, '');
}

function hideDetail() {
  $detail.hidden = true;
  $grid.hidden = false;
  detailProduct = null;
  switchTopbarToList();
}

// ─── 이벤트 ───────────────────────────────────────
// 카드 클릭 → 상세
$grid?.addEventListener('click', (e) => {
  const card = e.target.closest('.m-product-card');
  if (!card) return;
  e.preventDefault();
  const idx = Number(card.dataset.index);
  if (_lastRendered[idx]) showDetail(_lastRendered[idx]);
});

// 필터 버튼
function handleFilterClick() {
  toggleFilter({
    groups: FILTER_GROUPS,
    items: allProducts,
    policies: allPolicies,
    filterState: activeFilters,
    headerLabel: '상품차량',
    unit: '대',
    onApply: (fs) => {
      activeFilters = fs;
      applySearch();
    }
  });
}
$filterBtn?.addEventListener('click', handleFilterClick);

// 검색
let _searchTimer;
$search?.addEventListener('input', () => {
  searchQuery = $search.value;
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(applySearch, 200);
});

// 뒤로가기 (상세 → 목록)
window.addEventListener('popstate', () => {
  if (isViewerOpen()) { closeViewer(); return; }
  if (!$detail.hidden) { hideDetail(); return; }
});

// ─── 에이전트 로드 ────────────────────────────────
async function loadAgent() {
  let name = '', phone = '', position = '', companyName = '';
  try {
    if (agentCode) {
      const snap = await get(ref(db, 'users'));
      const users = snap.val() || {};
      const agent = Object.values(users).find(u => u && u.user_code === agentCode);
      if (agent) {
        name = agent.name || agent.user_name || '';
        phone = agent.phone || agent.phone_number || '';
        position = agent.position || '';
        companyName = agent.company || agent.company_name || '';
      }
    }
    if (providerParam) {
      try {
        const pSnap = await get(ref(db, `partners/${providerParam}`));
        const partner = pSnap.val();
        if (partner?.partner_name) companyName = partner.partner_name;
      } catch {}
    }
    // 하단 CTA
    if (phone) {
      ensureCta();
      if ($ctaCall) $ctaCall.href = `tel:${phone}`;
      if ($ctaText) $ctaText.textContent = `${name || '담당자'}${position ? ' ' + position : ''}에게 전화하기`;
      if ($cta) $cta.hidden = false;
    }
  } catch (e) {
    console.warn('[catalog] agent load failed', e);
  }
}

// ─── 데이터 로드 ──────────────────────────────────
async function loadData() {
  try {
    const [prodSnap, polSnap] = await Promise.all([
      get(ref(db, 'products')),
      get(ref(db, 'policies')),
    ]);
    allPolicies = polSnap.val() || {};
    const data = prodSnap.val() || {};
    allProducts = Object.entries(data)
      .map(([key, p]) => ({ ...p, _key: key }))
      .filter(p => p && p.status !== 'deleted' && p.vehicle_status !== '계약완료')
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    if (providerParam) {
      allProducts = allProducts.filter(p =>
        (p.provider_company_code || p.partner_code || '') === providerParam
      );
    }
    // 공유 링크 → 바로 상세
    if (hasShare) {
      const target = shareId
        ? allProducts.find(p => p._key === shareId || p.product_uid === shareId)
        : allProducts.find(p => p.car_number === shareCar);
      if (target) { showDetail(target); return; }
    }
    applySearch();
  } catch (err) {
    if ($grid) $grid.innerHTML = '<div style="grid-column:1/-1;padding:48px 0;text-align:center;color:#94a3b8;">상품을 불러올 수 없습니다</div>';
    console.error('[catalog] loadData', err);
  }
}

// ─── 부트스트랩 ───────────────────────────────────
(async () => {
  // 익명 인증
  const user = await new Promise(resolve => {
    const unsub = onAuthStateChanged(auth, u => { unsub(); resolve(u); });
  });
  if (!user) {
    try { await signInAnonymously(auth); } catch (e) { console.warn('[catalog] anon auth failed', e); }
  }
  await Promise.all([loadAgent(), loadData()]);
})();
