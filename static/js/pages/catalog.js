/**
 * catalog.js — B2C 영업자 카탈로그 스토어
 *
 * URL 파라미터:
 *   ?a={agentCode}        영업자 user_code (명함 표시)
 *   &id={productUid}      공유된 상품 uid → 단일 상세 뷰
 *
 * 레거시 호환:
 *   ?agent={agentCode}    구형 agent 파라미터
 *   ?car={carNumber}      구형 차량번호 기반 공유
 */

import { auth, db } from '../firebase/firebase-config.js';
import { signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';
import { formatPhone } from '../core/management-format.js';
import { open as openFullscreenViewer, close as closeFullscreenViewer, isOpen as isViewerOpen } from '../shared/fullscreen-photo-viewer.js';
import {
  esc, has, fmt,
  renderCatalogCard,
} from '../shared/catalog-card.js';
import { normalizeProduct } from '../shared/product-list-detail-data.js';
import { renderProductDetailMarkup } from '../shared/product-list-detail-markup.js';

// ─── DOM refs ──────────────────────────────────────────────────────────────

const qs = (id) => document.getElementById(id);

const agentName      = qs('catalog-agent-name');
const agentCompany   = qs('catalog-agent-company');
const agentPosition  = qs('catalog-agent-position');
const backBtn        = qs('catalog-back-btn');

const singleView     = qs('catalog-single');
const singleGallery  = qs('single-gallery');
const singleBody     = qs('single-body');
const browseAllBtn   = qs('browse-all-btn');

const catalogMain    = qs('catalog-main');
const searchInput    = qs('catalog-search');
const countText      = qs('catalog-count-text');
const filterResetBtn = qs('catalog-filter-reset');
const grid           = qs('catalog-grid');


// ─── URL 파라미터 ──────────────────────────────────────────────────────────

const params     = new URLSearchParams(window.location.search);
const agentCode  = params.get('a') || params.get('agent') || '';
const shareId    = params.get('id') || '';
const shareCar       = params.get('car') || '';
const providerParam  = params.get('provider') || '';
const hasShare       = !!(shareId || shareCar);

// ─── 상태 ──────────────────────────────────────────────────────────────────

let allProducts    = [];
let allPolicies    = {};

// ─── 필터 정의 ────────────────────────────────────────────────────────────

const RENT_BUCKETS  = ['50만원 이하','50만원~','60만원~','70만원~','80만원~','90만원~','100만원~','150만원~'];
const DEP_BUCKETS   = ['100만원 이하','100만원~','200만원~','300만원~','500만원~'];
const MILE_BUCKETS  = ['1만Km 이하','1만Km~','3만Km~','5만Km~','7만Km~','10만Km~','15만Km~'];
const PERIOD_OPTIONS = [
  { value: '1', label: '월렌트' },
  { value: '12', label: '12개월' },
  { value: '24', label: '24개월' },
  { value: '36', label: '36개월' },
  { value: '48', label: '48개월' },
  { value: '60', label: '60개월' },
];

function matchRangeBucket(buckets, value, n) {
  // 그룹별 분리 — '100만원~' 등 같은 라벨이 대여료/보증금에 동시 존재하기 때문
  const isDepositBucket = buckets === DEP_BUCKETS;
  const isMileageBucket = buckets === MILE_BUCKETS;
  let thresholds;
  if (isDepositBucket) {
    thresholds = {
      '100만원 이하': [0,        1000000],
      '100만원~':    [1000000,  2000000],
      '200만원~':    [2000000,  3000000],
      '300만원~':    [3000000,  5000000],
      '500만원~':    [5000000,  Infinity],
    };
  } else if (isMileageBucket) {
    thresholds = {
      '1만Km 이하': [0,      10000],
      '1만Km~':    [10000,  30000],
      '3만Km~':    [30000,  50000],
      '5만Km~':    [50000,  70000],
      '7만Km~':    [70000,  100000],
      '10만Km~':   [100000, 150000],
      '15만Km~':   [150000, Infinity],
    };
  } else {
    thresholds = {
      '50만원 이하': [0,       500000],
      '50만원~':    [500000,  600000],
      '60만원~':    [600000,  700000],
      '70만원~':    [700000,  800000],
      '80만원~':    [800000,  900000],
      '90만원~':    [900000,  1000000],
      '100만원~':   [1000000, 1500000],
      '150만원~':   [1500000, Infinity],
    };
  }
  const [min, max] = thresholds[value] || [0, Infinity];
  return n >= min && n < max;
}

const FILTER_GROUPS = [
  { key: 'rent',        title: '대여료',   type: 'range', buckets: RENT_BUCKETS, open: true },
  { key: 'deposit',     title: '보증금',   type: 'range', buckets: DEP_BUCKETS, open: true },
  { key: 'period',      title: '기간',     type: 'period', options: PERIOD_OPTIONS, open: true },
  { key: 'product_type', title: '상품구분', type: 'check', field: 'product_type', open: false },
  { key: 'maker',       title: '제조사',   type: 'check', field: 'maker', open: false },
  { key: 'model_name',  title: '모델명',   type: 'check', field: 'model_name', open: false },
  { key: 'sub_model',   title: '세부모델', type: 'check', field: 'sub_model', open: false },
  { key: 'options',     title: '선택옵션', type: 'search', field: 'options', open: false },
  { key: 'fuel_type',   title: '연료',     type: 'check', field: 'fuel_type', open: false },
  { key: 'ext_color',   title: '색상',     type: 'check', field: 'ext_color', open: false },
  { key: 'year',        title: '연식',     type: 'check', field: 'year', open: false, sort: 'desc' },
  { key: 'mileage',     title: '주행거리', type: 'range', buckets: MILE_BUCKETS, open: false },
  { key: 'vehicle_class', title: '차종구분', type: 'check', field: 'vehicle_class', open: false },
  { key: 'min_age',     title: '최저연령', type: 'check', open: false, policyField: 'basic_driver_age' },
  { key: 'screening',   title: '심사기준', type: 'check', open: false, policyField: 'screening_criteria' },
  { key: 'provider',    title: '공급사코드', type: 'check', field: 'provider', open: false, hidden: !!providerParam, labelField: 'code' },
];

// 필터 상태: { key: Set }
const filters = {};
FILTER_GROUPS.forEach(g => {
  filters[g.key] = new Set();
});
if (providerParam) filters.provider.add(providerParam);

// ─── 유틸 ──────────────────────────────────────────────────────────────────

function shortYear(text) {
  return String(text || '').replace(/\b(20)(\d{2})\b/g, '$2');
}

function fmtDate(v) {
  const d = String(v ?? '').replace(/[^\d]/g, '');
  if (!d) return null;
  if (d.length === 8) return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
  if (d.length === 6) return `20${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4, 6)}`;
  return String(v ?? '').trim() || null;
}

function getImages(p) {
  if (Array.isArray(p.image_urls) && p.image_urls.length) return p.image_urls.filter(Boolean);
  if (p.image_url) return [p.image_url];
  return [];
}

function getRent(p, months) {
  return Number(p[`rent_${months}`] || p[`rental_price_${months}`] || p?.price?.[months]?.rent || p?.price?.[String(months)]?.rent || 0);
}

function getDeposit(p, months) {
  return Number(p[`deposit_${months}`] || p?.price?.[months]?.deposit || p?.price?.[String(months)]?.deposit || 0);
}

function first(...vals) {
  for (const v of vals) { if (has(v)) return String(v).trim(); }
  return '-';
}

function ensurePercent(v) {
  const s = String(v ?? '').trim();
  if (!s || s === '-') return '-';
  return /%$/.test(s) ? s : `${s}%`;
}

function fmtDeductible(v) {
  const s = String(v ?? '').trim();
  if (!s || s === '-') return '-';
  if (/[만원]/.test(s)) return s;
  const n = Number(s.replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n)) return s;
  if (n >= 10000 && n % 10000 === 0) return `${(n / 10000).toLocaleString('ko-KR')}만원`;
  return `${n.toLocaleString('ko-KR')}원`;
}

// ─── 정책 필드 해석 ────────────────────────────────────────────────────────

function getPolicy(p) {
  const code = p.policy_code || p.term_code || '';
  // 1) 코드로 직접 매칭
  if (code && allPolicies[code]) return allPolicies[code];
  // 2) 전체 정책에서 term_code 필드 매칭
  const all = Object.values(allPolicies).filter(t => t && t.status !== 'deleted');
  if (code) {
    const byCode = all.find(t => t.term_code === code);
    if (byCode) return byCode;
  }
  // 3) term_name 매칭
  const termName = (p.term_name || '').trim();
  const providerCode = (p.provider_company_code || p.partner_code || '').trim();
  if (termName && providerCode) {
    const byNameProvider = all.find(t => t.term_name === termName && t.provider_company_code === providerCode);
    if (byNameProvider) return byNameProvider;
  }
  if (termName) {
    const byName = all.find(t => t.term_name === termName);
    if (byName) return byName;
  }
  // 4) 공급사코드로 해당 공급사의 첫 번째 활성 정책
  if (providerCode) {
    const byProvider = all.find(t => t.provider_company_code === providerCode);
    if (byProvider) return byProvider;
  }
  return {};
}

function parsePolicyCell(val) {
  const s = String(val ?? '').trim();
  if (!s || s === '-') return { limit: '-', deductible: '-' };
  const parts = s.split('/').map(x => x.trim()).filter(Boolean);
  return parts.length >= 2
    ? { limit: parts[0], deductible: parts.slice(1).join(' / ') || '-' }
    : { limit: s, deductible: '-' };
}

function buildPolicy(p) {
  const tf = getPolicy(p);
  const bodily   = parsePolicyCell(first(tf.injury_limit_deductible,   p.policy?.bodily));
  const property = parsePolicyCell(first(tf.property_limit_deductible, p.policy?.property));
  const selfB    = parsePolicyCell(first(tf.personal_injury_limit_deductible, p.policy?.selfBodily));
  const unins    = parsePolicyCell(first(tf.uninsured_limit_deductible, p.policy?.uninsured));
  const own      = parsePolicyCell(first(tf.own_damage_limit_deductible, p.policy?.ownDamage));

  return {
    screeningCriteria: first(tf.screening_criteria, p.reviewStatus),
    creditGrade: first(tf.credit_grade, p.creditGrade),
    minDriverAge: first(tf.basic_driver_age, p.baseAge),
    annualMileage: first(tf.annual_mileage, p.annualMileageDisplay),
    driverRange: first(tf.driver_range, tf.driver_scope, p.insuranceIncluded),
    insuranceIncluded: first(tf.insurance_included, p.insuranceIncluded),
    rentalGuideNote: first(tf.rental_guide_note, p.pricingBasis),
    mileageUpcharge: first(tf.mileage_upcharge_per_10000km),
    depositInstallment: first(tf.deposit_installment),
    paymentMethod: first(tf.payment_method, p.policy?.paymentMethod),
    penaltyCondition: first(tf.penalty_condition, p.condition?.penaltyRate),
    depositCardPayment: first(tf.deposit_card_payment),
    rentalRegion: first(tf.rental_region, p.condition?.rentalRegion),
    deliveryFee: first(tf.delivery_fee, p.condition?.deliveryFee),
    driverAgeLowering: first(tf.driver_age_lowering, p.policy?.ageLowering),
    ageLoweringCost: first(tf.age_lowering_cost, p.policy?.ageLoweringCost),
    personalDriverScope: first(tf.personal_driver_scope),
    businessDriverScope: first(tf.business_driver_scope),
    additionalDriverCount: first(tf.additional_driver_allowance_count),
    additionalDriverCost: first(tf.additional_driver_cost),
    maintenanceService: first(tf.maintenance_service, p.condition?.maintenance),
    injuryLimit: first(tf.injury_compensation_limit, bodily.limit),
    injuryDeductible: first(tf.injury_deductible, bodily.deductible),
    propertyLimit: first(tf.property_compensation_limit, property.limit),
    propertyDeductible: first(tf.property_deductible, property.deductible),
    selfBodyLimit: first(tf.personal_injury_compensation_limit, selfB.limit),
    selfBodyDeductible: first(tf.personal_injury_deductible, selfB.deductible),
    roadsideAssistance: first(tf.roadside_assistance),
    uninsuredLimit: first(tf.uninsured_compensation_limit, unins.limit),
    uninsuredDeductible: first(tf.uninsured_deductible, unins.deductible),
    ownDamageComp: first(tf.own_damage_compensation, own.limit),
    ownDamageRatio: first(tf.own_damage_repair_ratio),
    ownDamageMin: first(tf.own_damage_min_deductible, own.deductible),
    ownDamageMax: first(tf.own_damage_max_deductible),
  };
}

function fmtOwnDamageDeductible(pol) {
  const ratio = pol.ownDamageRatio;
  const min = pol.ownDamageMin;
  const max = pol.ownDamageMax;
  const parts = [];
  if (has(ratio)) parts.push(`차량수리비의 ${ensurePercent(ratio)}`);
  if (has(min) && has(max)) parts.push(`최소 ${fmtDeductible(min)} ~ 최대 ${fmtDeductible(max)}`);
  else if (has(min)) parts.push(`최소 ${fmtDeductible(min)}`);
  else if (has(max)) parts.push(`최대 ${fmtDeductible(max)}`);
  return parts.length ? parts.join(' / ') : '-';
}

function fmtRentalGuide(pol) {
  if (has(pol.rentalGuideNote) && pol.rentalGuideNote !== '-') return pol.rentalGuideNote;
  const bracket = [pol.screeningCriteria, pol.creditGrade].filter(v => has(v)).join(' / ');
  const parts = [pol.minDriverAge, pol.annualMileage, pol.insuranceIncluded].filter(v => has(v));
  const info = parts.join(', ');
  if (!bracket && !info) return null;
  return `${bracket ? `[${bracket}] ` : ''}${info}`.trim();
}

// ─── 상세 마크업 생성 ─────────────────────────────────────────────────────

function renderProductDetail(p) {
  const normalized = normalizeProduct(p);
  const termFields = getPolicy(p);
  const shareBtn = `<div class="md-actions"><button class="md-action-btn" id="cat-share-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg> 공유</button></div>`;
  return renderProductDetailMarkup(normalized, { termFields, actionsHtml: shareBtn, showGallery: false, showFee: false });
}

// ─── 뷰 전환 ──────────────────────────────────────────────────────────────

function showView(view) {
  singleView.hidden  = view !== 'single';
  catalogMain.hidden  = view !== 'catalog';
  // 뒤로가기: 카탈로그에서 진입한 경우만 표시 (공유 링크 직접 접속 시 숨김)
  backBtn.hidden      = view !== 'single' || !enteredFromCatalog;
  // 필터 버튼: 카탈로그 뷰에서만 표시 (모바일 CSS에서 display 제어)
  const fb = qs('catalog-filter-btn');
  if (fb) fb.hidden = view !== 'catalog';
  document.body.style.overflow = '';
}

// ─── 영업자 정보 로드 ──────────────────────────────────────────────────────

async function loadAgent() {
  let name = '', phone = '', position = '', companyName = '', ciUrl = '';
  try {
    // 사용자 정보
    if (agentCode) {
      const userSnap = await get(ref(db, 'users'));
      const users = userSnap.val() || {};
      const agent = Object.values(users).find((u) => u && u.user_code === agentCode);
      if (agent) {
        name     = agent.name || agent.user_name || '';
        phone    = agent.phone || agent.phone_number || '';
        position = agent.position || '';
        companyName = agent.company || agent.company_name || '';
        ciUrl    = agent.ci_file_url || '';
      }
    }

    // 공급사 링크면 파트너에서 회사명 가져오기
    if (providerParam) {
      try {
        const partnerSnap = await get(ref(db, `partners/${providerParam}`));
        const partner = partnerSnap.val();
        if (partner?.partner_name) companyName = partner.partner_name;
      } catch {}
    }

    // 헤더 에이전트 카드 (항상 표시)
    const ciEl = qs('catalog-agent-ci');
    if (ciUrl && ciEl) { ciEl.src = ciUrl; ciEl.hidden = false; }
    if (companyName) agentCompany.textContent = companyName;
    if (name) agentName.textContent = name;
    if (position && agentPosition) agentPosition.textContent = position;

    // 하단 전화하기 바
    if (phone) {
      const bottomBar = qs('catalog-bottom-bar');
      const bottomCall = qs('catalog-bottom-call');
      const bottomCallText = qs('catalog-bottom-call-text');
      if (bottomBar && bottomCall) {
        bottomCall.href = `tel:${phone}`;
        if (bottomCallText) bottomCallText.textContent = `${name || '담당자'}${position ? ' ' + position : ''}에게 전화하기`;
        bottomBar.hidden = false;
      }
      // 상단 전화 아이콘
      const headerCall = qs('catalog-header-call');
      if (headerCall) { headerCall.href = `tel:${phone}`; headerCall.hidden = false; }
    }
    // 상단 공유 아이콘 (전화 유무와 무관)
    const headerShare = qs('catalog-header-share');
    if (headerShare) {
      headerShare.hidden = false;
      headerShare.addEventListener('click', async () => {
        const url = location.href;
        try {
          if (navigator.share) await navigator.share({ url, title: document.title });
          else { await navigator.clipboard.writeText(url); alert('링크를 복사했어요'); }
        } catch (_) {}
      });
    }
  } catch (e) {
    console.warn('[catalog] agent load failed', e);
  }

  // 페이지 타이틀 설정 (try 밖에서 — 에러 나도 실행)
  const suffix = companyName ? ` | ${companyName}` : '';
  if (shareId || shareCar) {
    // 상세 링크 — renderSingleView에서 오버라이드
  } else if (providerParam) {
    document.title = `렌터카 ${providerParam} 상품${suffix}`;
  } else {
    document.title = `렌터카 전체 상품${suffix}`;
  }
}

// ─── 상품 + 정책 로드 ─────────────────────────────────────────────────────

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
      .filter((p) => p && p.status !== 'deleted' && p.vehicle_status !== '계약완료')
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

    // 공급사 전용 링크: 해당 공급사 상품만 남김
    if (providerParam) {
      allProducts = allProducts.filter((p) =>
        (p.provider_company_code || p.partner_code || '') === providerParam
      );
    }

    if (hasShare) {
      const target = shareId
        ? allProducts.find((p) => p._key === shareId || p.productUid === shareId || p.id === shareId)
        : allProducts.find((p) => p.car_number === shareCar);

      if (target) {
        renderSingleView(target);
        showView('single');
        return;
      }
    }

    renderAllFilters();
    renderGrid();
    showView('catalog');
  } catch (err) {
    grid.innerHTML = '<div class="catalog-empty">상품을 불러올 수 없습니다.</div>';
    showView('catalog');
    console.error('[catalog] loadData error', err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  VIEW 1: 단일 상품 상세
// ═══════════════════════════════════════════════════════════════════════════

let currentSingleProduct = null;

function renderSingleView(p) {
  currentSingleProduct = p;
  const model = [p.maker, p.model_name].filter(Boolean).join(' ');
  const carNo = p.car_number || '';
  const suffix = agentCompany?.textContent ? ` | ${agentCompany.textContent}` : '';
  document.title = `렌터카 ${carNo} ${model} 상품${suffix}`.trim();


  renderSingleGallery(getImages(p));
  singleBody.innerHTML = renderProductDetail(p);
}

let sGalleryIndex = 0;
let sGalleryImages = [];
let _sTouchStartX = 0;

function renderSingleGallery(images) {
  sGalleryImages = images;
  sGalleryIndex = 0;

  if (!images.length) {
    singleGallery.innerHTML = '<div class="catalog-gallery__empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>';
    return;
  }

  updateGallerySlide();

  // 스와이프 (스크롤 충돌 방지 + 클릭 오작동 방지)
  let _sTouchStartY = 0, _sSwiped = false, _sLocked = false;
  singleGallery.addEventListener('touchstart', (e) => {
    _sTouchStartX = e.touches[0].clientX; _sTouchStartY = e.touches[0].clientY;
    _sSwiped = false; _sLocked = false;
  }, { passive: true });
  singleGallery.addEventListener('touchmove', (e) => {
    if (_sLocked) return;
    const dx = Math.abs(e.touches[0].clientX - _sTouchStartX);
    const dy = Math.abs(e.touches[0].clientY - _sTouchStartY);
    if (dx > dy && dx > 10) { _sLocked = true; _sSwiped = true; e.preventDefault(); }
    else if (dy > dx && dy > 10) { _sLocked = true; }
  }, { passive: false });
  singleGallery.addEventListener('touchend', (e) => {
    if (!_sSwiped || !sGalleryImages.length) return;
    const dx = e.changedTouches[0].clientX - _sTouchStartX;
    if (Math.abs(dx) < 40) return;
    const total = sGalleryImages.length;
    sGalleryIndex = dx < 0 ? (sGalleryIndex + 1) % total : (sGalleryIndex - 1 + total) % total;
    updateGallerySlide();
  });
}

function updateGallerySlide() {
  const total = sGalleryImages.length;
  const navBtns = total > 1 ? `
    <button class="catalog-gallery__nav catalog-gallery__nav--prev" id="sg-prev" aria-label="이전"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m15 18-6-6 6-6"/></svg></button>
    <button class="catalog-gallery__nav catalog-gallery__nav--next" id="sg-next" aria-label="다음"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg></button>
    <div class="catalog-gallery__counter">${sGalleryIndex + 1} / ${total}</div>` : '';

  singleGallery.innerHTML = `
    <div class="catalog-gallery__track" id="gallery-track">
      <img class="catalog-gallery__img" src="${esc(sGalleryImages[sGalleryIndex])}" alt="차량 사진 ${sGalleryIndex + 1}" decoding="async" fetchpriority="high">
      ${navBtns}
      ${total > 0 ? `<div class="catalog-gallery__hint">사진을 눌러 ${total}장 모두 보기</div>` : ''}
    </div>`;

  // 사진 클릭 → 풀스크린 뷰어 (스와이프 후 클릭 방지)
  document.getElementById('gallery-track')?.addEventListener('click', (e) => {
    if (e.target.closest('.catalog-gallery__nav')) return;
    if (_sSwiped) { _sSwiped = false; return; }
    openPhotoViewer(sGalleryIndex);
  });

  if (total > 1) {
    document.getElementById('sg-prev')?.addEventListener('click', () => { sGalleryIndex = (sGalleryIndex - 1 + total) % total; updateGallerySlide(); });
    document.getElementById('sg-next')?.addEventListener('click', () => { sGalleryIndex = (sGalleryIndex + 1) % total; updateGallerySlide(); });
  }
}

// ─── 풀스크린 사진 뷰어 (공유 모듈 사용) ──────────────────────────────────

function openPhotoViewer(startIndex = 0) {
  if (!sGalleryImages.length) return;
  openFullscreenViewer(sGalleryImages, startIndex);
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (isViewerOpen()) { closeFullscreenViewer(); return; }
  if (!singleView.hidden) { history.back(); }
});

// ═══════════════════════════════════════════════════════════════════════════
//  VIEW 2: 카탈로그 그리드 — 아코디언 체크박스 필터
// ═══════════════════════════════════════════════════════════════════════════

// 상품에서 필터 값 추출
function getProductFilterValue(p, group) {
  if (group.key === 'provider') return p.provider_company_code || p.partner_code || '';
  if (group.key === 'year') return p.year ? String(p.year) : '';
  if (group.key === 'options') return (p.options || '').trim();
  if (group.policyField) {
    const pol = getPolicy(p);
    const v = (pol[group.policyField] || '').trim();
    return v && v !== '-' ? v : '';
  }
  if (group.field) return String(p[group.field] || '').trim();
  return '';
}

function getProductLabel(p, group) {
  if (group.key === 'provider') return p.provider_company_code || p.partner_code || '';
  if (group.key === 'sub_model') return shortYear(getProductFilterValue(p, group));
  return getProductFilterValue(p, group);
}

function getProductRangeValue(p, group) {
  if (group.key === 'mileage') return Number(p.mileage || 0);
  if (group.key === 'rent') {
    // 가장 저렴한 대여료
    let min = 0;
    for (const m of [1, 6, 12, 24, 36, 48, 60]) {
      const r = getRent(p, m);
      if (r && (!min || r < min)) min = r;
    }
    return min;
  }
  if (group.key === 'deposit') {
    // 가장 저렴한 기간의 보증금
    let bestRent = 0, bestDep = 0;
    for (const m of [1, 6, 12, 24, 36, 48, 60]) {
      const r = getRent(p, m);
      if (r && (!bestRent || r < bestRent)) { bestRent = r; bestDep = getDeposit(p, m); }
    }
    return bestDep;
  }
  return 0;
}

// 상품이 특정 필터 그룹을 통과하는지
function passesGroup(p, group) {
  const selected = filters[group.key];
  if (!selected || !selected.size) return true;

  if (group.type === 'period') {
    // 선택한 기간에 가격이 있는 상품만
    for (const m of selected) {
      if (getRent(p, Number(m)) > 0) return true;
    }
    return false;
  }

  if (group.type === 'range') {
    const n = getProductRangeValue(p, group);
    for (const bucket of selected) {
      if (matchRangeBucket(group.buckets, bucket, n)) return true;
    }
    return false;
  }

  if (group.type === 'search') {
    const val = getProductFilterValue(p, group).toLowerCase();
    for (const keyword of selected) {
      if (val.includes(keyword.toLowerCase())) return true;
    }
    return false;
  }

  // check 타입
  const val = getProductFilterValue(p, group);
  return selected.has(val);
}

// 검색 + 전체 필터 통과
function passesAllFilters(p, skipKey) {
  const q = (searchInput?.value || '').trim().toLowerCase();
  if (q) {
    const text = [p.car_number, p.maker, p.model_name, p.sub_model, p.trim_name, p.provider_name, p.options].join(' ').toLowerCase();
    if (!text.includes(q)) return false;
  }
  for (const group of FILTER_GROUPS) {
    if (group.key === skipKey) continue;
    if (!passesGroup(p, group)) return false;
  }
  return true;
}

function getFiltered() {
  return allProducts.filter((p) => passesAllFilters(p, null));
}

// 연동 필터: 해당 그룹을 제외한 나머지 필터 적용한 상품에서 옵션+카운트 계산
function computeFilterOptions(group) {
  if (group.type === 'period') {
    return group.options
      .map(({ value, label }) => {
        const count = allProducts.filter(p => passesAllFilters(p, group.key) && getRent(p, Number(value)) > 0).length;
        return { value, label, count };
      })
      .filter(o => o.count > 0 || filters[group.key]?.has(o.value));
  }

  if (group.type === 'range') {
    const counts = new Map();
    group.buckets.forEach(b => counts.set(b, 0));
    allProducts.forEach((p) => {
      if (!passesAllFilters(p, group.key)) return;
      const n = getProductRangeValue(p, group);
      for (const b of group.buckets) {
        if (matchRangeBucket(group.buckets, b, n)) { counts.set(b, (counts.get(b) || 0) + 1); break; }
      }
    });
    return group.buckets
      .map(b => ({ value: b, label: b, count: counts.get(b) || 0 }))
      .filter(o => o.count > 0 || filters[group.key]?.has(o.value));
  }

  // check 타입
  const map = new Map();
  allProducts.forEach((p) => {
    if (!passesAllFilters(p, group.key)) return;
    const value = getProductFilterValue(p, group);
    const label = getProductLabel(p, group);
    if (!value) return;
    if (!map.has(value)) map.set(value, { label, count: 0 });
    map.get(value).count++;
  });

  const result = [...map.entries()].map(([v, { label, count }]) => ({ value: v, label, count }));
  if (group.sort === 'desc') return result.sort((a, b) => b.value.localeCompare(a.value));
  return result.sort((a, b) => a.label.localeCompare(b.label, 'ko'));
}

// ─── 필터 UI 렌더링 ──────────────────────────────────────────────────────

const filterSectionsEl = qs('catalog-filter-sections');

function renderAllFilters() {
  if (!filterSectionsEl) return;

  let html = '';
  for (const group of FILTER_GROUPS) {
    if (group.hidden) continue;

    const selected = filters[group.key];
    const isOpen = group._open !== undefined ? group._open : group.open;
    const collapsedCls = isOpen ? '' : ' is-collapsed';
    const activeCount = selected.size;
    const badge = activeCount ? `<span class="filter-active-badge">${activeCount}</span>` : '';

    if (group.type === 'search') {
      const currentVal = [...selected][0] || '';
      html += `
        <div class="catalog-sidebar__section${collapsedCls}" data-filter-key="${group.key}">
          <div class="catalog-sidebar__title">${esc(group.title)}${badge}</div>
          <div class="catalog-filter-body">
            <input class="filter-search-input" type="text" placeholder="옵션 검색..." value="${esc(currentVal)}" data-filter-search="${group.key}">
          </div>
        </div>`;
      continue;
    }

    const options = computeFilterOptions(group);
    if (!options.length && !activeCount) continue;

    html += `
      <div class="catalog-sidebar__section${collapsedCls}" data-filter-key="${group.key}">
        <div class="catalog-sidebar__title">${esc(group.title)}${badge}</div>
        <div class="catalog-filter-body">
          ${options.map(({ value, label, count }) => {
            const checked = selected.has(value) ? 'checked' : '';
            const dimmed = count === 0 && !checked ? ' is-dimmed' : '';
            return `<label class="filter-check${dimmed}">
              <input type="checkbox" value="${esc(value)}" ${checked} data-filter-key="${group.key}">
              <span class="filter-check__label">${esc(label)}</span>
              <span class="filter-check__count">${count}</span>
            </label>`;
          }).join('')}
        </div>
      </div>`;
  }

  filterSectionsEl.innerHTML = html;
}

// 이벤트: 체크박스 변경
filterSectionsEl?.addEventListener('change', (e) => {
  const cb = e.target.closest('input[type="checkbox"]');
  if (!cb) return;
  const key = cb.dataset.filterKey;
  if (!key || !filters[key]) return;
  if (cb.checked) filters[key].add(cb.value);
  else filters[key].delete(cb.value);
  renderAllFilters();
  renderGrid();
});

// 이벤트: 옵션 검색
filterSectionsEl?.addEventListener('input', (e) => {
  const input = e.target.closest('[data-filter-search]');
  if (!input) return;
  const key = input.dataset.filterSearch;
  if (!key || !filters[key]) return;
  filters[key].clear();
  const val = input.value.trim();
  if (val) filters[key].add(val);
  renderGrid();
});

// 아코디언 상태 localStorage
const FILTER_OPEN_KEY = 'freepass.catalog.filterOpen';
function loadFilterOpenState() {
  try { const s = localStorage.getItem(FILTER_OPEN_KEY); if (s) { const map = JSON.parse(s); FILTER_GROUPS.forEach(g => { if (map[g.key] !== undefined) g._open = map[g.key]; }); } } catch {}
}
function saveFilterOpenState() {
  const map = {};
  FILTER_GROUPS.forEach(g => { map[g.key] = g._open !== undefined ? g._open : g.open; });
  try { localStorage.setItem(FILTER_OPEN_KEY, JSON.stringify(map)); } catch {}
}
loadFilterOpenState();

// 이벤트: 아코디언 토글
filterSectionsEl?.addEventListener('click', (e) => {
  const title = e.target.closest('.catalog-sidebar__title');
  if (!title) return;
  const section = title.closest('.catalog-sidebar__section');
  if (!section) return;
  const key = section.dataset.filterKey;
  const group = FILTER_GROUPS.find(g => g.key === key);
  if (group) {
    group._open = section.classList.contains('is-collapsed');
    section.classList.toggle('is-collapsed');
    saveFilterOpenState();
  }
});

function renderGrid() {
  const products = getFiltered();
  countText.textContent = products.length.toLocaleString();

  if (!products.length) {
    grid.innerHTML = '<div class="catalog-empty">조건에 맞는 상품이 없습니다.</div>';
    return;
  }

  grid.innerHTML = products.map((p, i) =>
    renderCatalogCard(p, { dataAttr: `data-index="${i}"` })
  ).join('');
}

// ─── 카드 클릭 → 단일 상품 뷰 전환 ──────────────────────────────────────

let catalogScrollY = 0;
let enteredFromCatalog = false;

function showDetailView(p) {
  catalogScrollY = window.scrollY;
  enteredFromCatalog = true;
  renderSingleView(p);
  showView('single');
  window.scrollTo({ top: 0 });
  history.pushState({ view: 'single' }, '');
}

// 브라우저 뒤로가기 → 카탈로그 메인
window.addEventListener('popstate', () => {
  if (isViewerOpen()) {
    closeFullscreenViewer();
    return;
  }
  if (!singleView.hidden) {
    showView('catalog');
    window.scrollTo({ top: catalogScrollY });
  }
});

// ─── 이벤트 ───────────────────────────────────────────────────────────────

// 공유하기 (링크 복사) — 상세 hero 내 공유 아이콘
document.addEventListener('click', (e) => {
  const btn = e.target.closest('#cat-share-btn');
  if (!btn) return;
  if (!currentSingleProduct) return;
  const p = currentSingleProduct;
  const pid = p._key || p.productUid || p.id || '';
  const carTitle = [p.car_number, p.maker, p.model_name].filter(Boolean).join(' ');
  const base = `${location.origin}/catalog`;
  const params = new URLSearchParams();
  if (agentCode) params.set('a', agentCode);
  if (pid) params.set('id', pid);
  if (carTitle) params.set('t', carTitle);
  const companyText = agentCompany?.textContent?.trim();
  if (companyText) params.set('c', companyText);
  const url = `${base}?${params.toString()}`;
  navigator.clipboard.writeText(url).then(() => {
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    setTimeout(() => { btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v13"/><path d="m16 6-4-4-4 4"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/></svg>'; }, 1500);
  }).catch(() => {
    const input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
  });
});

browseAllBtn.addEventListener('click', () => {
  renderAllFilters();
  renderGrid();
  showView('catalog');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

backBtn.addEventListener('click', () => {
  history.back();
});

grid.addEventListener('click', (e) => {
  const card = e.target.closest('.catalog-card');
  if (!card) return;
  const idx = Number(card.dataset.index);
  const products = getFiltered();
  if (products[idx]) showDetailView(products[idx]);
});

grid.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('.catalog-card');
  if (!card) return;
  e.preventDefault();
  card.click();
});

// 모바일 필터 패널
const filterBtn     = qs('catalog-filter-btn');
const sidebar       = qs('catalog-sidebar');
const sidebarOverlay = qs('catalog-sidebar-overlay');
const sidebarClose  = qs('catalog-sidebar-close');

function openFilter() {
  sidebar?.classList.add('is-open');
  sidebarOverlay?.classList.add('is-open');
  sidebarOverlay && (sidebarOverlay.hidden = false);
  document.body.style.overflow = 'hidden';
}
function closeFilter() {
  sidebar?.classList.remove('is-open');
  sidebarOverlay?.classList.remove('is-open');
  sidebarOverlay && (sidebarOverlay.hidden = true);
  document.body.style.overflow = '';
}

filterBtn?.addEventListener('click', () => {
  sidebar?.classList.contains('is-open') ? closeFilter() : openFilter();
});
sidebarClose?.addEventListener('click', closeFilter);
sidebarOverlay?.addEventListener('click', closeFilter);

// 선택 초기화
filterResetBtn?.addEventListener('click', () => {
  FILTER_GROUPS.forEach(g => {
    filters[g.key].clear();
    if (providerParam && g.key === 'provider') filters.provider.add(providerParam);
  });
  if (searchInput) searchInput.value = '';
  renderAllFilters();
  renderGrid();
});

let _searchTimer = null;
searchInput.addEventListener('input', () => {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => { renderAllFilters(); renderGrid(); }, 200);
});

// ─── 부트스트랩 ────────────────────────────────────────────────────────────

(async function bootstrap() {
  // 인증 상태를 먼저 확인 (Promise로 래핑) → loadAgent 전에 isLoggedIn 결정
  const currentUser = await new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });

  if (!currentUser) {
    // 미로그인 → 익명 로그인 시도
    try { await signInAnonymously(auth); } catch (e) { console.warn('[catalog] anonymous auth failed', e); }
  }


  await Promise.all([loadAgent(), loadData()]);
})();
