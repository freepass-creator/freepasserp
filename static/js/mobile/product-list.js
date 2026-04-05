/**
 * mobile/product-list.js — 모바일 전용 상품 목록
 * 웹 product-list.js와 완전 분리. Firebase 직접 조회.
 */
import { requireAuth } from '../core/auth-guard.js';
import { watchProducts, resolveTermForProduct } from '../firebase/firebase-db.js';
import { normalizeProduct, extractTermFields } from '../shared/product-list-detail-view.js';
import { renderCatalogCard, renderCatalogDetailHero, renderCatalogPriceTable,
  renderCatalogInsuranceTable, renderCatalogConditions, renderCatalogExtra,
  renderCatalogClawback, esc } from '../shared/catalog-card.js';
import { open as openFullscreenViewer } from '../shared/fullscreen-photo-viewer.js';
import { showToast, showConfirm } from '../core/toast.js';
import { escapeHtml } from '../core/management-format.js';

const DEFAULT_PERIODS = ['12','24','36','48','60'];

const state = {
  allProducts: [],
  filteredProducts: [],
  selectedId: null,
  searchQuery: '',
  filters: { periods: DEFAULT_PERIODS.slice() },
  role: '',
  companyCode: '',
  profile: null,
  termCache: {},
  termLoading: {},
};

// DOM refs
let $grid, $count, $search, $sidebar, $overlay, $close, $reset, $filterSections;
let $detail, $detailContent;

function bindDOM() {
  $grid = document.getElementById('plsMCatalogGrid');
  $count = document.getElementById('plsMCatalogCount');
  $search = document.getElementById('plsMCatalogSearch');
  $sidebar = document.getElementById('plsMCatalogSidebar');
  $overlay = document.getElementById('plsMCatalogOverlay');
  $close = document.getElementById('plsMCatalogClose');
  $reset = document.getElementById('plsMCatalogReset');
  $filterSections = document.getElementById('plsMCatalogFilterSections');
  $detail = document.getElementById('plsMDetail');
  $detailContent = document.getElementById('plsMDetailContent');
}

// ─── 필터링 ──────────────────────────────────────────────────────────────────

function passesSearch(item, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const fields = [item.maker, item.model, item.subModel, item.trim, item.carNo, item.providerName, item.extColor];
  return fields.some(f => String(f || '').toLowerCase().includes(q));
}

function applyFilters() {
  let result = state.allProducts.filter(item => passesSearch(item, state.searchQuery));
  FILTER_GROUPS.forEach(g => {
    const selected = state.filters[g.key];
    if (!selected || !selected.length) return;
    const set = new Set(selected);
    const filtered = result.filter(item => set.has(String(item[g.key] || '').trim()));
    if (filtered.length) result = filtered;
  });
  state.filteredProducts = result;
  if ($count) $count.textContent = result.length;
  renderGrid();
}

// ─── 그리드 렌더링 ───────────────────────────────────────────────────────────

function renderGrid() {
  if (!$grid) return;
  const products = state.filteredProducts;
  if (!products.length) {
    $grid.innerHTML = '<div class="catalog-empty">조건에 맞는 상품이 없습니다.</div>';
    return;
  }
  const periods = state.filters.periods.length ? state.filters.periods : DEFAULT_PERIODS;
  $grid.innerHTML = products.map(p =>
    renderCatalogCard(p, { periods, dataAttr: `data-id="${esc(p.id)}"` })
  ).join('');
}

// ─── 상세 ────────────────────────────────────────────────────────────────────

function renderDetailContent(product) {
  const photos = product.photos || [];
  const total = photos.length;
  const galleryHtml = total
    ? `<div class="pls-mobile-detail-gallery" id="plsMGallery" data-photos='${JSON.stringify(photos).replace(/'/g,"&#39;")}'>
        <img class="pls-mobile-detail-gallery__img" id="plsMGalleryImg" src="${esc(photos[0])}" alt="차량 사진" loading="eager" decoding="async">
        ${total > 1 ? `<button class="pls-mobile-detail-gallery__nav pls-mobile-detail-gallery__nav--prev" id="plsMGalleryPrev" type="button" aria-label="이전"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button><button class="pls-mobile-detail-gallery__nav pls-mobile-detail-gallery__nav--next" id="plsMGalleryNext" type="button" aria-label="다음"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>` : ''}
        <span class="pls-mobile-detail-gallery__counter" id="plsMGalleryCtr">1 / ${total}</span>
      </div>` : '';

  const priceRows = ['1','12','24','36','48','60'].map(m => ({
    m, rent: product.price[m]?.rent, dep: product.price[m]?.deposit, fee: product.price[m]?.fee
  })).filter(r => r.rent || r.dep);

  const term = state.termCache[getTermCacheKey(product)] || {};
  const merged = {
    ageText: product.ageText || term.basic_driver_age || '-',
    ageLowering: product.policy?.ageLowering || term.driver_age_lowering || '-',
    annualMileage: product.policy?.annualMileage || term.annual_mileage || '-',
    paymentMethod: product.policy?.paymentMethod || term.payment_method || '-',
    bodily: product.policy?.bodily || term.injury_limit_deductible || '-',
    property: product.policy?.property || term.property_limit_deductible || '-',
    selfBodily: product.policy?.selfBodily || term.personal_injury_limit_deductible || '-',
    uninsured: product.policy?.uninsured || term.uninsured_limit_deductible || '-',
    ownDamage: product.policy?.ownDamage || term.own_damage_limit_deductible || '-',
  };

  const insRows = [
    ['대인배상', merged.bodily], ['대물배상', merged.property],
    ['자기신체사고', merged.selfBodily], ['무보험차상해', merged.uninsured],
    ['자기차량손해', merged.ownDamage]
  ].map(([label, raw]) => {
    const parts = String(raw || '-').split('/').map(s => s.trim());
    return [label, parts[0] || '-', parts.slice(1).join('/') || '-'];
  });

  const condRows = [
    ['차량상태', product.condition?.detailStatus],
    ['사고여부', product.condition?.accident],
    ['즉시출고', product.condition?.immediate],
    ['탁송가능', product.condition?.delivery],
    ['정비서비스', product.condition?.maintenance],
  ].filter(([, v]) => v && v !== '-');

  const extraRows = [
    ['특이사항', product.condition?.note],
  ].filter(([, v]) => v && v !== '-');

  const role = state.role;
  const actionsHtml = `${role === 'agent' ? `<button class="cat-share-btn" id="plsMDetailShare" title="공유"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg></button>` : ''}`;

  return galleryHtml
    + renderCatalogDetailHero(product, actionsHtml)
    + renderCatalogPriceTable(priceRows)
    + renderCatalogInsuranceTable(insRows)
    + renderCatalogConditions(condRows)
    + renderCatalogExtra(extraRows);
}

function getTermCacheKey(product) {
  const code = String(product?.policyCode || product?.termCode || '').trim();
  if (code) return `code:${code}`;
  const pc = String(product?.providerCompanyCode || product?.partnerCode || '').trim();
  const tn = String(product?.termName || '').trim();
  if (pc || tn) return `lookup:${pc}:${tn}`;
  return '';
}

async function ensureTermLoaded(product) {
  const key = getTermCacheKey(product);
  if (!key || state.termCache[key] || state.termLoading[key]) return;
  state.termLoading[key] = true;
  try {
    const term = await resolveTermForProduct({
      termCode: product?.policyCode || product?.termCode || '',
      termName: product?.termName || '',
      providerCompanyCode: product?.providerCompanyCode || product?.partnerCode || ''
    });
    state.termCache[key] = term ? extractTermFields(term) : {};
  } catch { state.termCache[key] = {}; }
  finally { delete state.termLoading[key]; }
}

function openDetail(id) {
  const product = state.filteredProducts.find(p => p.id === id);
  if (!product || !$detail || !$detailContent) return;
  state.selectedId = id;
  $detailContent.innerHTML = renderDetailContent(product);
  bindGallery($detailContent);
  $detailContent.querySelector('#plsMDetailShare')?.addEventListener('click', () => handleShare(product));
  $detail.hidden = false;
  document.body.classList.add('detail-open');
  history.pushState({ detail: true }, '');
}

function closeDetail() {
  if ($detail) $detail.hidden = true;
  document.body.classList.remove('detail-open');
  state.selectedId = null;
}

function handleShare(product) {
  const p = state.profile || {};
  const url = `${location.origin}/catalog?id=${product.id}&a=${encodeURIComponent(p.user_code || '')}`;
  if (navigator.share) {
    navigator.share({ title: product.model || '상품', url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(url).then(() => showToast('링크가 복사되었습니다.')).catch(() => {});
  }
}

// ─── 갤러리 스와이프 ─────────────────────────────────────────────────────────

function bindGallery(container) {
  const wrap = container.querySelector('#plsMGallery');
  if (!wrap) return;
  let photos;
  try { photos = JSON.parse(wrap.dataset.photos || '[]'); } catch { return; }
  if (!photos.length) return;
  let idx = 0;
  const img = container.querySelector('#plsMGalleryImg');
  const ctr = container.querySelector('#plsMGalleryCtr');
  const update = () => { if (img) img.src = photos[idx]; if (ctr) ctr.textContent = `${idx+1} / ${photos.length}`; };

  container.querySelector('#plsMGalleryPrev')?.addEventListener('click', (e) => { e.stopPropagation(); idx = (idx-1+photos.length)%photos.length; update(); });
  container.querySelector('#plsMGalleryNext')?.addEventListener('click', (e) => { e.stopPropagation(); idx = (idx+1)%photos.length; update(); });

  // 스와이프
  let _tx=0, _ty=0, _swiped=false, _locked=false;
  wrap.addEventListener('touchstart', e => { _tx=e.touches[0].clientX; _ty=e.touches[0].clientY; _swiped=false; _locked=false; }, {passive:true});
  wrap.addEventListener('touchmove', e => {
    if(_locked)return;
    const dx=Math.abs(e.touches[0].clientX-_tx), dy=Math.abs(e.touches[0].clientY-_ty);
    if(dx>dy&&dx>10){_locked=true;_swiped=true;e.preventDefault();}
    else if(dy>dx&&dy>10){_locked=true;}
  }, {passive:false});
  wrap.addEventListener('touchend', e => {
    if(!_swiped)return;
    const dx=e.changedTouches[0].clientX-_tx;
    if(Math.abs(dx)<40)return;
    idx=dx<0?(idx+1)%photos.length:(idx-1+photos.length)%photos.length;
    update();
  });
  wrap.addEventListener('click', (e) => {
    if(e.target.closest('.pls-mobile-detail-gallery__nav'))return;
    if(_swiped){_swiped=false;return;}
    openFullscreenViewer(photos, idx);
  });
}

// ─── 필터 사이드바 ───────────────────────────────────────────────────────────

// ─── 필터 사이드바 ───────────────────────────────────────────────────────────

const FILTER_GROUPS = [
  { key: 'maker', title: '제조사' },
  { key: 'model', title: '모델' },
  { key: 'fuel', title: '연료' },
  { key: 'vehicleClass', title: '차종구분' },
  { key: 'productType', title: '상품구분' },
  { key: 'extColor', title: '색상' },
];

function renderFilterSections() {
  if (!$filterSections) return;
  const optionSets = {};
  FILTER_GROUPS.forEach(g => { optionSets[g.key] = new Set(); });
  state.allProducts.forEach(p => {
    FILTER_GROUPS.forEach(g => {
      const v = String(p[g.key] || '').trim();
      if (v && v !== '-') optionSets[g.key].add(v);
    });
  });
  $filterSections.innerHTML = FILTER_GROUPS.map(g => {
    const options = [...optionSets[g.key]].sort();
    if (!options.length) return '';
    const selected = new Set(state.filters[g.key] || []);
    const body = options.map(opt => {
      const checked = selected.has(opt) ? ' checked' : '';
      return `<label class="catalog-filter-option"><input type="checkbox" data-group="${esc(g.key)}" value="${esc(opt)}"${checked}><span>${esc(opt)}</span></label>`;
    }).join('');
    return `<div class="catalog-sidebar__section" data-filter-key="${esc(g.key)}">
      <div class="catalog-sidebar__title">${esc(g.title)}</div>
      <div class="catalog-filter-body">${body}</div>
    </div>`;
  }).join('');
}

function openFilter() {
  renderFilterSections();
  $sidebar?.classList.add('is-open');
  $overlay?.classList.add('is-open');
}
function closeFilter() {
  $sidebar?.classList.remove('is-open');
  $overlay?.classList.remove('is-open');
}

// ─── 이벤트 바인딩 ───────────────────────────────────────────────────────────

function bindEvents() {
  // 필터 토글
  document.getElementById('mobile-filter-btn')?.addEventListener('click', () => {
    $sidebar?.classList.contains('is-open') ? closeFilter() : openFilter();
  });
  $close?.addEventListener('click', closeFilter);
  $overlay?.addEventListener('click', closeFilter);

  // 검색
  let timer;
  $search?.addEventListener('input', () => {
    state.searchQuery = $search.value.trim();
    clearTimeout(timer);
    timer = setTimeout(applyFilters, 150);
  });

  // 초기화
  $reset?.addEventListener('click', () => {
    state.searchQuery = '';
    state.filters = { periods: DEFAULT_PERIODS.slice() };
    if ($search) $search.value = '';
    renderFilterSections();
    applyFilters();
  });

  // 필터 체크박스
  $filterSections?.addEventListener('change', (e) => {
    const input = e.target.closest('input[type="checkbox"][data-group]');
    if (!input) return;
    const key = input.dataset.group;
    if (!state.filters[key]) state.filters[key] = [];
    const set = new Set(state.filters[key]);
    if (input.checked) set.add(input.value); else set.delete(input.value);
    state.filters[key] = [...set];
    applyFilters();
  });

  // 카드 클릭 → 상세
  $grid?.addEventListener('click', (e) => {
    const card = e.target.closest('.catalog-card[data-id]');
    if (card) openDetail(card.dataset.id);
  });

  // 핸드폰 뒤로가기 → 상세 닫기
  window.addEventListener('popstate', (e) => {
    if ($detail && !$detail.hidden) {
      closeDetail();
    }
  });
}

// ─── 초기화 ──────────────────────────────────────────────────────────────────

async function init() {
  const { user, profile } = await requireAuth({ roles: ['provider','agent','admin'] });
  state.profile = profile;
  state.role = profile.role;
  state.companyCode = profile.company_code || '';

  bindDOM();
  bindEvents();

  watchProducts((products) => {
    let items = products.map(normalizeProduct).filter(item => item.id);
    if (state.role === 'provider') {
      items = items.filter(item => String(item.partnerCode||'') === String(state.companyCode||''));
    }
    state.allProducts = items;
    items.forEach(item => ensureTermLoaded(item));
    applyFilters();
  });
}

export function onHide() { document.body.classList.remove('page-product', 'detail-open'); }
export function onShow() { document.body.classList.add('page-product'); }

init().catch(e => console.error('[mobile/product-list]', e));
