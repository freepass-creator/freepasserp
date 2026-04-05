/**
 * mobile/product-list.js — 모바일 전용 상품 목록
 * 웹 product-list.js와 완전 분리. Firebase 직접 조회.
 */
import { requireAuth } from '../core/auth-guard.js';
import { watchProducts, resolveTermForProduct, ensureRoom } from '../firebase/firebase-db.js';
import { normalizeProduct, extractTermFields } from '../shared/product-list-detail-view.js';
import { renderCatalogCard, esc } from '../shared/catalog-card.js';
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

function safe(v) { return String(v ?? '').trim() || '-'; }
function money(v) { const n = Number(v || 0); return n ? n.toLocaleString('ko-KR') + '원' : '-'; }
function sectionHead(title) { return `<div class="md-section-head">${esc(title)}</div>`; }
function row(label, value) { return `<div class="md-row"><span>${esc(label)}</span><strong>${esc(safe(value))}</strong></div>`; }

function renderDetailContent(product) {
  const photos = product.photos || [];
  const total = photos.length;
  const term = state.termCache[getTermCacheKey(product)] || {};
  const p = product.policy || {};
  const c = product.condition || {};
  const role = state.role;

  // ── 1. 차량사진 ──
  const galleryHtml = total
    ? `<div class="pls-mobile-detail-gallery" id="plsMGallery" data-photos='${JSON.stringify(photos).replace(/'/g,"&#39;")}'>
        <img class="pls-mobile-detail-gallery__img" id="plsMGalleryImg" src="${esc(photos[0])}" alt="" loading="eager" decoding="async">
        ${total > 1 ? `<button class="pls-mobile-detail-gallery__nav pls-mobile-detail-gallery__nav--prev" id="plsMGalleryPrev" type="button" aria-label="이전"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button><button class="pls-mobile-detail-gallery__nav pls-mobile-detail-gallery__nav--next" id="plsMGalleryNext" type="button" aria-label="다음"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>` : ''}
        <span class="pls-mobile-detail-gallery__counter" id="plsMGalleryCtr">1 / ${total}</span>
      </div>`
    : `<div class="md-no-photo">등록된 사진이 없습니다.</div>`;

  // ── 2. 차량정보 ──
  const badges = [product.vehicleStatus, product.productType].filter(v => v && v !== '-').map(v =>
    `<span class="md-badge">${esc(v)}</span>`).join('');
  const vehicleInfo = `
    ${sectionHead('차량정보')}
    <div class="md-card">
      <div class="md-vehicle-head">
        <div class="md-vehicle-carno">${esc(safe(product.carNo))}</div>
        <div class="md-vehicle-model">${esc(safe(product.maker))} ${esc(safe(product.model))}</div>
        ${badges ? `<div class="md-badges">${badges}</div>` : ''}
      </div>
      <div class="md-vehicle-sub">${esc(safe(product.subModel))} ${esc(safe(product.trim))}</div>
      ${product.optionSummary && product.optionSummary !== '-' ? `<div class="md-vehicle-sub">${esc(product.optionSummary)}</div>` : ''}
      <div class="md-vehicle-meta">${esc(safe(product.fuel))} · ${esc(safe(product.year))}년식 · ${esc(safe(product.mileageDisplay))} · ${esc(safe(product.extColor))}/${esc(safe(product.intColor))}</div>
    </div>`;

  // ── 3. 액션 버튼 ──
  const inquiryBtn = role === 'agent' ? `<button class="md-action-btn" id="plsMDetailInquiry"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/><path d="M8 12h8"/><path d="M12 8v8"/></svg> 문의</button>` : '';
  const contractBtn = role === 'agent' ? `<button class="md-action-btn" id="plsMDetailContract"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m9 15 2 2 4-4"/></svg> 계약</button>` : '';
  const shareBtn = `<button class="md-action-btn" id="plsMDetailShare"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg> 공유</button>`;
  const actionsHtml = `<div class="md-actions">${inquiryBtn}${contractBtn}${shareBtn}</div>`;

  // ── 4. 기간별 대여료 및 보증금 ──
  const months = ['1','12','24','36','48','60'];
  const priceRowsHtml = months.map(m => {
    const rent = Number(product.price[m]?.rent || 0);
    const dep = Number(product.price[m]?.deposit || 0);
    if (!rent && !dep) return '';
    return `<tr><td>${m}개월</td><td><strong>${rent ? rent.toLocaleString('ko-KR') + '원' : '-'}</strong></td><td>${dep ? dep.toLocaleString('ko-KR') + '원' : '-'}</td></tr>`;
  }).join('');
  const reviewNote = safe(product.reviewStatus) !== '-' ? `<div class="md-note">* ${esc(safe(product.reviewStatus))}</div>` : '';
  const priceSection = priceRowsHtml ? `
    ${sectionHead('기간별 대여료 및 보증금 안내')}
    <div class="md-card">
      <table class="md-table"><thead><tr><th>기간</th><th>대여료</th><th>보증금</th></tr></thead><tbody>${priceRowsHtml}</tbody></table>
      ${reviewNote}
    </div>` : '';

  // ── 5. 차량보험정보 ──
  const merged = {
    bodily: safe(p.bodily || term.injury_limit_deductible),
    property: safe(p.property || term.property_limit_deductible),
    selfBodily: safe(p.selfBodily || term.personal_injury_limit_deductible),
    uninsured: safe(p.uninsured || term.uninsured_limit_deductible),
    ownDamage: safe(p.ownDamage || term.own_damage_limit_deductible),
    emergency: safe(c.emergency || term.roadside_assistance),
  };
  function insRow(label, raw) {
    const parts = String(raw || '-').split('/').map(s => s.trim());
    return `<tr><td>${esc(label)}</td><td>${esc(parts[0] || '-')}</td><td>${esc(parts.slice(1).join('/') || '-')}</td></tr>`;
  }
  const insSection = `
    ${sectionHead('차량보험정보')}
    <div class="md-card">
      <table class="md-table"><thead><tr><th>항목</th><th>한도</th><th>면책금</th></tr></thead><tbody>
        ${insRow('대인', merged.bodily)}
        ${insRow('대물', merged.property)}
        ${insRow('자기신체사고', merged.selfBodily)}
        ${insRow('무보험차상해', merged.uninsured)}
        ${insRow('자기차량손해', merged.ownDamage)}
      </tbody></table>
      ${row('긴급출동', merged.emergency)}
    </div>`;

  // ── 6. 대여조건 ──
  const mg = {
    ageText: safe(product.ageText || term.basic_driver_age),
    ageLowering: safe(p.ageLowering || term.driver_age_lowering),
    ageLoweringCost: safe(p.ageLoweringCost || term.age_lowering_cost),
    annualMileage: safe(p.annualMileage || term.annual_mileage),
    paymentMethod: safe(p.paymentMethod || term.payment_method),
  };
  const rentalTerms = `
    ${sectionHead('대여조건')}
    <div class="md-card">
      ${row('1만Km추가비용', term.mileage_upcharge_per_10000km)}
      ${row('보증금분납', term.deposit_installment)}
      ${row('보증금카드결제', term.deposit_card_payment)}
      ${row('대여지역', c.rentalRegion || term.rental_region)}
      ${row('최소운전자연령', mg.ageText)}
      ${row('운전연령하향', mg.ageLowering)}
      ${row('운전연령하향비용', mg.ageLoweringCost)}
      ${row('개인운전자범위', term.personal_driver_scope)}
      ${row('사업자운전자범위', term.business_driver_scope)}
      ${row('추가운전자수', term.additional_driver_allowance_count)}
      ${row('추가운전자비용', term.additional_driver_cost)}
      ${row('연간약정주행거리', mg.annualMileage)}
      ${row('결제방식', mg.paymentMethod)}
      ${row('정비서비스', c.maintenance)}
      ${row('탁송가능', c.delivery)}
      ${row('탁송비용', c.deliveryFee || term.delivery_fee)}
    </div>`;

  // ── 7. 추가정보 ──
  const photoLink = String(product.photoLink || '').trim();
  const photoLinkHtml = photoLink ? `<div class="md-row"><span>사진링크</span><a href="${esc(photoLink)}" target="_blank" rel="noopener" class="md-link">사진보기</a></div>` : '';
  const extraInfo = `
    ${sectionHead('추가정보')}
    <div class="md-card">
      ${row('차량번호', product.carNo)}
      ${row('차종구분', product.vehicleClass)}
      ${row('차량가격', money(product.vehiclePrice))}
      ${row('배기량', product.engineCc ? product.engineCc + 'cc' : '-')}
      ${row('심사여부', product.reviewStatus)}
      ${row('신용등급', product.creditGrade)}
      ${row('차량세부상태', c.detailStatus)}
      ${row('사고여부', c.accident)}
      ${row('즉시출고', c.immediate)}
      ${row('특이사항', c.note || product.partnerMemo)}
      ${row('공급코드', product.partnerCode)}
      ${photoLinkHtml}
    </div>`;

  // ── 8. 기간별 수수료 ──
  const feeRowsHtml = months.map(m => {
    const fee = product.price[m]?.fee;
    if (!fee && fee !== 0) return '';
    return `<tr><td>${m}개월</td><td>${Number(fee || 0) ? Number(fee).toLocaleString('ko-KR') + '원' : '준비중'}</td></tr>`;
  }).join('');
  const clawback = safe(term.commission_clawback_condition);
  const feeSection = feeRowsHtml ? `
    ${sectionHead('기간별 수수료')}
    <div class="md-card">
      <table class="md-table"><thead><tr><th>기간</th><th>수수료</th></tr></thead><tbody>${feeRowsHtml}</tbody></table>
      ${clawback !== '-' ? `<div class="md-note">* ${esc(clawback)}</div>` : ''}
    </div>` : '';

  return galleryHtml + vehicleInfo + actionsHtml + priceSection + insSection + rentalTerms + extraInfo + feeSection;
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
  $detailContent.querySelector('#plsMDetailInquiry')?.addEventListener('click', (e) => handleInquiry(e.currentTarget, product));
  $detailContent.querySelector('#plsMDetailContract')?.addEventListener('click', () => handleContract(product));
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
      agentUid: state.profile?.uid || '',
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

function handleContract(product) {
  if (!product) return;
  if (!confirm('이 상품에 대해 계약을 생성하시겠습니까?')) return;
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
