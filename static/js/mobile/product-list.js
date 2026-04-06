/**
 * mobile/product-list.js — 모바일 전용 상품 목록
 * 웹 product-list.js와 완전 분리. Firebase 직접 조회.
 */
import { requireAuth } from '../core/auth-guard.js';
import { watchProducts, resolveTermForProduct, ensureRoom } from '../firebase/firebase-db.js';
import { normalizeProduct, extractTermFields } from '../shared/product-list-detail-view.js';
import { renderProductDetailMarkup, esc as escMarkup } from '../shared/product-list-detail-markup.js';
import { renderCatalogCard, esc } from '../shared/catalog-card.js';
import { open as openFullscreenViewer, close as closePhotoViewer, isOpen as isPhotoViewerOpen } from '../shared/fullscreen-photo-viewer.js';
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

// ─── 상세 (공통 마크업은 product-list-detail-markup.js) ───────────────────────


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
  finally {
    delete state.termLoading[key];
    // 상세 열려있으면 term 데이터 반영하여 재렌더
    if ($detail && !$detail.hidden && state.selectedId === product.id) {
      renderAndBindDetail(product);
    }
  }
}

function buildMobileActionsHtml(product) {
  const role = state.role;
  const inquiryBtn = role === 'agent' ? `<button class="md-action-btn" id="plsMDetailInquiry"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/><path d="M8 12h8"/><path d="M12 8v8"/></svg> 문의</button>` : '';
  const contractBtn = role === 'agent' ? `<button class="md-action-btn" id="plsMDetailContract"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m9 15 2 2 4-4"/></svg> 계약</button>` : '';
  const shareBtn = `<button class="md-action-btn" id="plsMDetailShare"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg> 공유</button>`;
  return `<div class="md-actions">${inquiryBtn}${contractBtn}${shareBtn}</div>`;
}

function renderAndBindDetail(product) {
  const term = state.termCache[getTermCacheKey(product)] || {};
  $detailContent.innerHTML = renderProductDetailMarkup(product, {
    activePhotoIndex: 0,
    termFields: term,
    actionsHtml: buildMobileActionsHtml(product)
  });
  bindGallery($detailContent);
  $detailContent.querySelector('#plsMDetailInquiry')?.addEventListener('click', (e) => handleInquiry(e.currentTarget, product));
  $detailContent.querySelector('#plsMDetailContract')?.addEventListener('click', () => handleContract(product));
  $detailContent.querySelector('#plsMDetailShare')?.addEventListener('click', () => handleShare(product));
}

async function openDetail(id) {
  const product = state.filteredProducts.find(p => p.id === id);
  if (!product || !$detail || !$detailContent) return;
  state.selectedId = id;
  // 먼저 있는 데이터로 렌더
  renderAndBindDetail(product);
  $detail.hidden = false;
  document.body.classList.add('detail-open');
  history.pushState({ detail: true }, '');
  // 상단바 타이틀
  const backTitle = document.getElementById('m-back-title');
  if (backTitle) {
    backTitle.textContent = [product.carNo || product.car_number || '', product.model || product.model_name || ''].filter(Boolean).join(' ') || '';
  }
  // term 아직 없으면 로드 후 재렌더
  const key = getTermCacheKey(product);
  if (key && !state.termCache[key]) {
    await ensureTermLoaded(product);
    if (state.selectedId === id) renderAndBindDetail(product);
  }
}

function closeDetail() {
  if ($detail) $detail.hidden = true;
  document.body.classList.remove('detail-open');
  state.selectedId = null;
}

async function handleInquiry(btnEl, product) {
  if (!product) return;
  if (state.role !== 'agent') { showToast('영업자 계정에서만 문의할 수 있습니다.', 'error'); return; }
  if (!await showConfirm('이 상품에 대해 대화를 시작하시겠습니까?')) return;
  if (btnEl) btnEl.disabled = true;
  try {
    const roomId = await ensureRoom({
      productUid: product.productUid || '',
      productCode: product.productCode || product.id,
      providerUid: product.providerUid || '',
      providerCompanyCode: product.providerCompanyCode || product.partnerCode || '',
      providerName: product.providerName || '',
      agentUid: state.user?.uid || '',
      agentCode: state.profile?.user_code || '',
      agentName: state.profile?.name || '',
      vehicleNumber: product.carNo && product.carNo !== '-' ? product.carNo : '',
      modelName: [product.maker, product.model, product.subModel, product.trim].filter(v => v && v !== '-').join(' ')
    });
    localStorage.setItem('freepass_pending_chat_room', roomId);
    window.location.href = '/chat';
  } catch {
    if (btnEl) btnEl.disabled = false;
    showToast('채팅 연결에 실패했습니다.', 'error');
  }
}

async function handleContract(product) {
  if (!product) return;
  if (!await showConfirm('이 상품에 대해 계약을 생성하시겠습니까?')) return;
  const seed = {
    seed_product_key: product.id,
    product_uid: product.id,
    product_code: product.id,
    product_code_snapshot: product.productCode || product.id,
    partner_code: product.partnerCode || '',
    policy_code: product.policyCode || '',
    car_number: product.carNo || '',
    vehicle_name: [product.maker, product.model, product.subModel, product.trim].filter(Boolean).join(' '),
    maker: product.maker || '',
    model_name: product.model || '',
    sub_model: product.subModel || '',
    trim_name: product.trim || '',
    rent_month: '48',
    rent_amount: Number(product.price?.['48']?.rent || 0),
    deposit_amount: Number(product.price?.['48']?.deposit || 0)
  };
  localStorage.setItem('freepass_pending_contract_seed', JSON.stringify(seed));
  window.location.href = '/contract';
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
  // 사진 탭 → 확대 뷰어
  const galleryImg = container.querySelector('#plsMGalleryImg');
  if (galleryImg) {
    galleryImg.addEventListener('click', (e) => {
      e.stopPropagation();
      if (_swiped) { _swiped = false; return; }
      openFullscreenViewer(photos, idx);
    });
  }
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

function _passesOtherFilters(product, skipKey) {
  return FILTER_GROUPS.every(g => {
    if (g.key === skipKey) return true;
    const selected = state.filters[g.key];
    if (!selected || !selected.length) return true;
    const v = String(product[g.key] || '').trim();
    return selected.includes(v);
  });
}

function renderFilterSections() {
  if (!$filterSections) return;
  // faceted: 각 그룹의 옵션은 다른 필터를 통과한 상품에서 추출
  const optionSets = {};
  FILTER_GROUPS.forEach(g => {
    const counts = new Map();
    state.allProducts.forEach(p => {
      if (!_passesOtherFilters(p, g.key)) return;
      const v = String(p[g.key] || '').trim();
      if (v && v !== '-') counts.set(v, (counts.get(v) || 0) + 1);
    });
    optionSets[g.key] = counts;
  });
  $filterSections.innerHTML = FILTER_GROUPS.map(g => {
    const counts = optionSets[g.key];
    const options = [...counts.keys()].sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0));
    if (!options.length) return '';
    const selected = new Set(state.filters[g.key] || []);
    const body = options.map(opt => {
      const checked = selected.has(opt) ? ' checked' : '';
      const cnt = counts.get(opt) || 0;
      return `<label class="catalog-filter-option"><input type="checkbox" data-group="${esc(g.key)}" value="${esc(opt)}"${checked}><span>${esc(opt)}</span><span class="catalog-filter-count">(${cnt})</span></label>`;
    }).join('');
    const selectedCount = selected.size;
    const isOpen = selectedCount > 0 || g.key === 'maker';
    return `<div class="catalog-sidebar__section${isOpen ? '' : ' is-collapsed'}" data-filter-key="${esc(g.key)}">
      <button type="button" class="catalog-sidebar__title" data-toggle-filter="${esc(g.key)}">${esc(g.title)}${selectedCount ? ` <span class="catalog-filter-selected">${selectedCount}</span>` : ''}<svg class="catalog-sidebar__chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>
      <div class="catalog-filter-body"${isOpen ? '' : ' hidden'}>${body}</div>
    </div>`;
  }).join('');
}

function openFilter() {
  renderFilterSections();
  $sidebar?.classList.add('is-open');
  $overlay?.classList.add('is-open');
  document.body.classList.add('filter-open');
}
function closeFilter() {
  $sidebar?.classList.remove('is-open');
  $overlay?.classList.remove('is-open');
  document.body.classList.remove('filter-open');
}

// ─── 이벤트 바인딩 ───────────────────────────────────────────────────────────

function bindEvents() {
  // 필터 토글 (상단바 버튼 + 검색바 버튼)
  document.getElementById('mobile-filter-btn')?.addEventListener('click', () => {
    $sidebar?.classList.contains('is-open') ? closeFilter() : openFilter();
  });
  document.getElementById('plsMFilterBtn')?.addEventListener('click', () => {
    $sidebar?.classList.contains('is-open') ? closeFilter() : openFilter();
  });
  $close?.addEventListener('click', closeFilter);
  $overlay?.addEventListener('click', closeFilter);

  // 검색 (사이드바 검색 + 상단 검색바)
  let timer;
  const $topSearch = document.getElementById('plsMSearchInput');
  function onSearchInput(e) {
    state.searchQuery = e.target.value.trim();
    // 두 검색창 동기화
    if ($search && $search !== e.target) $search.value = e.target.value;
    if ($topSearch && $topSearch !== e.target) $topSearch.value = e.target.value;
    clearTimeout(timer);
    timer = setTimeout(applyFilters, 150);
  }
  $search?.addEventListener('input', onSearchInput);
  $topSearch?.addEventListener('input', onSearchInput);

  // 초기화
  $reset?.addEventListener('click', () => {
    state.searchQuery = '';
    state.filters = { periods: DEFAULT_PERIODS.slice() };
    if ($search) $search.value = '';
    renderFilterSections();
    applyFilters();
  });

  // 필터 섹션 접기/펼치기
  $filterSections?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-toggle-filter]');
    if (!btn) return;
    const section = btn.closest('.catalog-sidebar__section');
    if (!section) return;
    const body = section.querySelector('.catalog-filter-body');
    if (!body) return;
    const isHidden = body.hidden;
    body.hidden = !isHidden;
    section.classList.toggle('is-collapsed', !isHidden);
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
    renderFilterSections();
    applyFilters();
  });

  // 카드 클릭 → 상세
  $grid?.addEventListener('click', (e) => {
    const card = e.target.closest('.catalog-card[data-id]');
    if (card) openDetail(card.dataset.id);
  });

  // 뒤로가기는 mobile-shell.js에서 통합 관리
}

// ─── 초기화 ──────────────────────────────────────────────────────────────────

async function init() {
  const { user, profile } = await requireAuth({ roles: ['provider','agent','admin'] });
  state.user = user;
  state.profile = profile;
  state.role = profile.role;
  state.companyCode = profile.company_code || '';

  bindDOM();
  bindEvents();

  watchProducts((products) => {
    const items = products.map(normalizeProduct).filter(item => item.id);
    state.allProducts = items;
    items.forEach(item => ensureTermLoaded(item));
    applyFilters();
  });
}

export function onHide() { document.body.classList.remove('page-product', 'detail-open'); }
export function onShow() { document.body.classList.add('page-product'); }

init().catch(e => console.error('[mobile/product-list]', e));
