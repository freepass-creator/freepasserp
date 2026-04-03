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
import { signInAnonymously } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';

document.addEventListener('contextmenu', (e) => e.preventDefault());

// ─── DOM refs ──────────────────────────────────────────────────────────────

const qs = (id) => document.getElementById(id);

const agentAvatar    = qs('catalog-agent-avatar');
const agentName      = qs('catalog-agent-name');
const agentCompany   = qs('catalog-agent-company');
const headerCall     = qs('catalog-header-call');
const headerCallText = qs('catalog-header-call-text');
const backBtn        = qs('catalog-back-btn');

const singleView     = qs('catalog-single');
const singleGallery  = qs('single-gallery');
const singleBody     = qs('single-body');
const singleCta      = qs('single-cta');
const singleCtaLink  = qs('single-cta-link');
const singleCtaText  = qs('single-cta-text');
const browseAllBtn   = qs('browse-all-btn');

const catalogMain    = qs('catalog-main');
const searchInput    = qs('catalog-search');
const chipsEl        = qs('catalog-filter-chips');
const providerChipsEl = qs('catalog-provider-chips');
const fuelChipsEl    = qs('catalog-fuel-chips');
const countBar       = qs('catalog-count-bar');
const countText      = qs('catalog-count-text');
const grid           = qs('catalog-grid');

const footer         = qs('catalog-footer');
const ctaLink        = qs('catalog-cta-link');
const ctaText        = qs('catalog-cta-text');

// ─── URL 파라미터 ──────────────────────────────────────────────────────────

const params     = new URLSearchParams(window.location.search);
const agentCode  = params.get('a') || params.get('agent') || '';
const shareId    = params.get('id') || '';
const shareCar   = params.get('car') || '';
const hasShare   = !!(shareId || shareCar);

// ─── 상태 ──────────────────────────────────────────────────────────────────

let allProducts   = [];
let allPolicies   = {};
let activeMaker   = '';
let activeProvider = '';
let activeFuel    = '';
let agentPhone    = '';

// ─── 유틸 ──────────────────────────────────────────────────────────────────

function esc(text) {
  const d = document.createElement('div');
  d.textContent = String(text ?? '');
  return d.innerHTML;
}

function safe(v) {
  const s = String(v ?? '').trim();
  return s || '-';
}

function has(v) {
  const s = String(v ?? '').trim();
  return s && s !== '-';
}

function fmtMoney(v) {
  const n = Number(String(v || '').replace(/[^\d.-]/g, '') || 0);
  if (!n) return null;
  return n.toLocaleString('ko-KR') + '원';
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

// ─── 섹션 아이콘 ──────────────────────────────────────────────────────────

const SECTION_ICONS = {
  price:     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  insurance: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>',
  rental:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="m21 3-7 7"/><path d="M11 13H6a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1"/></svg>',
  extra:     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
};

function sectionTitle(icon, text) {
  return `<div class="cat-section-title">${SECTION_ICONS[icon] || ''}<span>${esc(text)}</span></div>`;
}

// ─── 공유 상세 마크업 생성 (수수료 제외 전부) ─────────────────────────────

function renderProductDetail(p) {
  const model = [p.maker, p.model_name].filter(Boolean).join(' ');
  const sub   = [p.sub_model, p.trim_name].filter(Boolean).join(' · ');
  const pol   = buildPolicy(p);

  // ── 기본 정보 ──
  const status = p.vehicle_status || '';
  const productType = p.product_type || '';
  const badgeHtml = [status, productType].filter(v => v && v !== '재고')
    .map(v => `<span class="cat-badge">${esc(v)}</span>`).join('');
  const optText = String(p.options ?? '').trim();
  const tags = [p.fuel_type, p.year ? `${p.year}년식` : '', p.mileage ? `${Number(p.mileage).toLocaleString()}km` : ''].filter(Boolean);

  let html = `
    <div class="cat-hero">
      ${badgeHtml ? `<div class="cat-badges">${badgeHtml}</div>` : ''}
      <h1 class="cat-title">${esc(model || '차량')}</h1>
      ${sub ? `<p class="cat-subtitle">${esc(sub)}</p>` : ''}
      ${optText ? `<p class="cat-options">${esc(optText)}</p>` : ''}
      <div class="cat-meta">
        <span class="cat-meta-text">${tags.map(t => esc(t)).join(' · ') || '-'}</span>
        ${has(p.ext_color) ? `<span class="cat-color-badge">외장 ${esc(p.ext_color)}</span>` : ''}
        ${has(p.int_color) ? `<span class="cat-color-badge">내장 ${esc(p.int_color)}</span>` : ''}
      </div>
    </div>
  `;

  // ── 가격표 (1~60개월) ──
  const periods = ['1', '6', '12', '24', '36', '48', '60'];
  const priceRows = periods
    .filter(m => Number(p.price?.[m]?.rent || 0) > 0)
    .map(m => {
      const item = p.price?.[m] || {};
      return { m, rent: Number(item.rent || 0), dep: Number(item.deposit || 0) };
    });

  if (priceRows.length) {
    const guideText = fmtRentalGuide(pol);
    html += `
      <div class="cat-section">
        ${sectionTitle('price', '기간별 대여료 및 보증금 안내')}
        <table class="cat-table">
          <thead><tr><th>기간</th><th>대여료</th><th>보증금</th></tr></thead>
          <tbody>${priceRows.map(({ m, rent, dep }) => `
            <tr>
              <td>${m}개월</td>
              <td class="cat-price-cell">${fmtMoney(rent) || '-'}</td>
              <td>${fmtMoney(dep) || '-'}</td>
            </tr>
          `).join('')}</tbody>
        </table>
        ${guideText ? `<div class="cat-note">* ${esc(guideText)}</div>` : ''}
      </div>
    `;
  } else {
    html += `<div class="cat-section cat-inquiry"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg> 가격은 문의해 주세요</div>`;
  }

  // ── 차량보험정보 ──
  const insRows = [
    ['대인',         pol.injuryLimit,   pol.injuryDeductible],
    ['대물',         pol.propertyLimit, pol.propertyDeductible],
    ['자기신체사고', pol.selfBodyLimit,  pol.selfBodyDeductible],
    ['무보험차상해', pol.uninsuredLimit, pol.uninsuredDeductible],
    ['자기차량손해', pol.ownDamageComp,  fmtOwnDamageDeductible(pol)],
    ['긴급출동',     pol.roadsideAssistance, '-'],
  ];
  const hasInsurance = insRows.some(([, l, d]) => has(l) || (has(d) && d !== '-'));
  if (hasInsurance) {
    html += `
      <div class="cat-section">
        ${sectionTitle('insurance', '차량보험정보')}
        <table class="cat-table cat-table--insurance">
          <thead><tr><th>항목</th><th>한도</th><th>면책금</th></tr></thead>
          <tbody>${insRows.map(([label, limit, deduct]) => `
            <tr>
              <td>${esc(label)}</td>
              <td>${esc(safe(limit))}</td>
              <td>${esc(safe(deduct))}</td>
            </tr>
          `).join('')}</tbody>
        </table>
      </div>
    `;
  }

  // ── 대여조건 ──
  const rentalRows = [
    ['1만Km추가비용',     pol.mileageUpcharge],
    ['보증금분납',         pol.depositInstallment],
    ['결제방식',           pol.paymentMethod],
    ['위약금',             pol.penaltyCondition],
    ['보증금카드결제',     pol.depositCardPayment],
    ['대여지역',           pol.rentalRegion],
    ['탁송비',             pol.deliveryFee],
    ['운전연령하향',       pol.driverAgeLowering],
    ['운전연령하향비용',   pol.ageLoweringCost],
    ['개인운전자범위',     pol.personalDriverScope],
    ['사업자운전자범위',   pol.businessDriverScope],
    ['추가운전자수',       pol.additionalDriverCount],
    ['추가운전자비용',     pol.additionalDriverCost],
    ['정비서비스',         pol.maintenanceService],
  ].filter(([, v]) => has(v));

  if (rentalRows.length) {
    html += `
      <div class="cat-section">
        ${sectionTitle('rental', '대여조건')}
        <div class="cat-rows">${rentalRows.map(([label, value]) =>
          `<div class="cat-row"><span class="cat-row-label">${esc(label)}</span><span class="cat-row-value">${esc(value)}</span></div>`
        ).join('')}</div>
      </div>
    `;
  }

  // ── 추가정보 ──
  const extraRows = [
    ['차종구분',   p.vehicle_class],
    ['최초등록일', fmtDate(p.first_registration_date)],
    ['차령만료일', fmtDate(p.vehicle_age_expiry_date)],
    ['차량가격',   fmtMoney(p.vehicle_price)],
    ['차량번호',   p.car_number],
    ['특이사항',   p.partner_memo || p.note],
  ].filter(([, v]) => has(v));

  if (extraRows.length) {
    html += `
      <div class="cat-section">
        ${sectionTitle('extra', '추가정보')}
        <div class="cat-rows">${extraRows.map(([label, value]) =>
          `<div class="cat-row"><span class="cat-row-label">${esc(label)}</span><span class="cat-row-value">${esc(value)}</span></div>`
        ).join('')}</div>
      </div>
    `;
  }

  return html;
}

// ─── 뷰 전환 ──────────────────────────────────────────────────────────────

function showView(view) {
  singleView.hidden  = view !== 'single';
  catalogMain.hidden  = view !== 'catalog';
  // 뒤로가기: 단일뷰에서 카탈로그로 돌아갈 수 있을 때 표시
  backBtn.hidden      = view !== 'single' || !allProducts.length;
  footer.hidden       = view !== 'catalog' || !agentPhone;
  document.body.style.overflow = '';
}

// ─── 영업자 정보 로드 ──────────────────────────────────────────────────────

async function loadAgent() {
  if (!agentCode) return;
  try {
    const snap = await get(ref(db, 'users'));
    if (!snap.exists()) return;
    const users = snap.val();
    const agent = Object.values(users).find((u) => u && u.user_code === agentCode);
    if (!agent) return;

    const name    = agent.name || agent.user_name || '';
    const company = agent.company || agent.company_name || '';
    const phone   = agent.phone || agent.phone_number || '';

    if (name) {
      agentName.textContent = name;
      agentAvatar.innerHTML = `<span class="catalog-agent-avatar__initial">${esc(name.charAt(0))}</span>`;
    }
    if (company) agentCompany.textContent = company;

    if (phone) {
      agentPhone = phone;
      headerCall.href = `tel:${phone}`;
      headerCallText.textContent = phone;
      headerCall.hidden = false;
      ctaLink.href = `tel:${phone}`;
      ctaText.textContent = `${name || '영업자'}에게 전화하기`;
      // 모달 CTA 제거됨 — 단일 뷰로 통합
      singleCtaLink.href = `tel:${phone}`;
      singleCtaText.textContent = `${name || '담당자'}에게 전화 문의`;
      singleCta.hidden = false;
    }
  } catch (e) {
    console.warn('[catalog] agent load failed', e);
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

    renderAllChips();
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

function renderSingleView(p) {
  const model = [p.maker, p.model_name].filter(Boolean).join(' ');
  document.title = model || '렌트카 상품 안내';

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

  // 스와이프
  singleGallery.ontouchstart = (e) => { _sTouchStartX = e.touches[0].clientX; };
  singleGallery.ontouchend = (e) => {
    const dx = e.changedTouches[0].clientX - _sTouchStartX;
    if (Math.abs(dx) < 40 || !sGalleryImages.length) return;
    const total = sGalleryImages.length;
    sGalleryIndex = dx < 0 ? (sGalleryIndex + 1) % total : (sGalleryIndex - 1 + total) % total;
    updateGallerySlide();
  };
}

function updateGallerySlide() {
  const total = sGalleryImages.length;
  const navBtns = total > 1 ? `
    <button class="catalog-gallery__nav catalog-gallery__nav--prev" id="sg-prev" aria-label="이전"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m15 18-6-6 6-6"/></svg></button>
    <button class="catalog-gallery__nav catalog-gallery__nav--next" id="sg-next" aria-label="다음"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg></button>
    <div class="catalog-gallery__counter">${sGalleryIndex + 1} / ${total}</div>` : '';

  singleGallery.innerHTML = `
    <div class="catalog-gallery__track" id="gallery-track">
      <img class="catalog-gallery__img" src="${esc(sGalleryImages[sGalleryIndex])}" alt="차량 사진 ${sGalleryIndex + 1}">
      ${navBtns}
    </div>`;

  // 사진 클릭 → 풀스크린 뷰어
  document.getElementById('gallery-track')?.addEventListener('click', (e) => {
    if (e.target.closest('.catalog-gallery__nav')) return; // 네비 버튼 제외
    openPhotoViewer(sGalleryIndex);
  });

  if (total > 1) {
    document.getElementById('sg-prev')?.addEventListener('click', () => { sGalleryIndex = (sGalleryIndex - 1 + total) % total; updateGallerySlide(); });
    document.getElementById('sg-next')?.addEventListener('click', () => { sGalleryIndex = (sGalleryIndex + 1) % total; updateGallerySlide(); });
  }
}

// ─── 풀스크린 사진 뷰어 (세로 스크롤) ────────────────────────────────────

const photoViewer      = qs('photo-viewer');
const photoViewerClose = qs('photo-viewer-close');
const photoViewerScroll = qs('photo-viewer-scroll');
const photoViewerCounter = qs('photo-viewer-counter');

function openPhotoViewer(startIndex = 0) {
  if (!sGalleryImages.length) return;
  const total = sGalleryImages.length;
  photoViewerCounter.textContent = `${total}장`;

  photoViewerScroll.innerHTML = sGalleryImages.map((src, i) =>
    `<img class="photo-viewer__img" src="${esc(src)}" alt="사진 ${i + 1}" loading="${i <= startIndex + 1 ? 'eager' : 'lazy'}">`
  ).join('');

  photoViewer.hidden = false;
  document.body.style.overflow = 'hidden';

  // 해당 사진 위치로 스크롤
  if (startIndex > 0) {
    requestAnimationFrame(() => {
      const imgs = photoViewerScroll.querySelectorAll('.photo-viewer__img');
      imgs[startIndex]?.scrollIntoView({ behavior: 'instant' });
    });
  }
}

function closePhotoViewer() {
  photoViewer.hidden = true;
  document.body.style.overflow = '';
}

photoViewerClose.addEventListener('click', closePhotoViewer);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !photoViewer.hidden) closePhotoViewer(); });

// ═══════════════════════════════════════════════════════════════════════════
//  VIEW 2: 카탈로그 그리드
// ═══════════════════════════════════════════════════════════════════════════

function getUniqueValues(field) {
  const set = new Set();
  allProducts.forEach((p) => { const v = p[field]; if (v) set.add(v); });
  return [...set].sort();
}

function getProviders() {
  const map = new Map();
  allProducts.forEach((p) => {
    const code = p.provider_company_code || p.partner_code || '';
    const name = p.provider_name || '';
    if (code && !map.has(code)) map.set(code, name || code);
  });
  return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
}

function renderFilterChips(el, items, activeValue, dataAttr) {
  if (!el) return;
  if (items.length <= 1) { el.innerHTML = ''; el.closest('.catalog-filter-row')?.classList.add('is-hidden'); return; }
  el.closest('.catalog-filter-row')?.classList.remove('is-hidden');
  el.innerHTML = `<button class="catalog-chip${!activeValue ? ' is-active' : ''}" data-${dataAttr}="">전체</button>` +
    items.map(([value, label]) =>
      `<button class="catalog-chip${activeValue === value ? ' is-active' : ''}" data-${dataAttr}="${esc(value)}">${esc(label)}</button>`
    ).join('');
}

function renderAllChips() {
  const makers = getUniqueValues('maker').map(m => [m, m]);
  const providers = getProviders();
  const fuels = getUniqueValues('fuel_type').map(f => [f, f]);

  renderFilterChips(chipsEl, makers, activeMaker, 'maker');
  renderFilterChips(providerChipsEl, providers, activeProvider, 'provider');
  renderFilterChips(fuelChipsEl, fuels, activeFuel, 'fuel');
}

function bindChipClick(el, dataAttr, setter) {
  el?.addEventListener('click', (e) => {
    const chip = e.target.closest('.catalog-chip');
    if (!chip) return;
    setter(chip.dataset[dataAttr] || '');
    renderAllChips();
    renderGrid();
  });
}

bindChipClick(chipsEl, 'maker', (v) => { activeMaker = v; });
bindChipClick(providerChipsEl, 'provider', (v) => { activeProvider = v; });
bindChipClick(fuelChipsEl, 'fuel', (v) => { activeFuel = v; });

function getFiltered() {
  const q = (searchInput.value || '').trim().toLowerCase();
  return allProducts.filter((p) => {
    if (activeMaker && p.maker !== activeMaker) return false;
    if (activeProvider && (p.provider_company_code || p.partner_code || '') !== activeProvider) return false;
    if (activeFuel && p.fuel_type !== activeFuel) return false;
    if (q) {
      const text = [p.car_number, p.maker, p.model_name, p.sub_model, p.trim_name, p.provider_name].join(' ').toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });
}

function renderGrid() {
  const products = getFiltered();
  countText.textContent = `${products.length}대`;
  countBar.hidden = false;

  if (!products.length) {
    grid.innerHTML = '<div class="catalog-empty">조건에 맞는 상품이 없습니다.</div>';
    return;
  }

  grid.innerHTML = products.map((p, i) => {
    const imgs   = getImages(p);
    const thumb  = imgs[0] || '';
    const model  = [p.maker, p.model_name].filter(Boolean).join(' ');
    const sub    = [p.sub_model, p.trim_name].filter(Boolean).join(' · ');
    const rent48 = getRent(p, 48);
    const dep48  = getDeposit(p, 48);
    const status = p.vehicle_status || '';
    const imageHtml = thumb
      ? `<img class="catalog-card__image" src="${esc(thumb)}" alt="${esc(model)}" loading="lazy">`
      : `<div class="catalog-card__no-image"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;
    const badgeHtml = status && status !== '재고' && status !== '입고예정' ? `<span class="catalog-card__badge">${esc(status)}</span>` : '';
    const tags = [p.fuel_type, p.year ? `${p.year}년` : '', p.mileage ? `${Number(p.mileage).toLocaleString()}km` : ''].filter(Boolean);

    return `
      <article class="catalog-card" data-index="${i}" role="button" tabindex="0">
        <div class="catalog-card__image-wrap">${imageHtml}${badgeHtml}${imgs.length > 1 ? `<span class="catalog-card__photo-count"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> ${imgs.length}</span>` : ''}</div>
        <div class="catalog-card__body">
          ${p.car_number ? `<div class="catalog-card__carno">${esc(p.car_number)}</div>` : ''}
          <div class="catalog-card__model">${esc(model || '차량')}</div>
          ${sub ? `<div class="catalog-card__sub">${esc(sub)}</div>` : ''}
          ${p.provider_name ? `<div class="catalog-card__provider">${esc(p.provider_name)}</div>` : ''}
          <div class="catalog-card__price-row">
            ${rent48 ? `<span class="catalog-card__price">월 ${fmtMoney(rent48)}</span>${dep48 ? `<span class="catalog-card__dep">보증금 ${fmtMoney(dep48)}</span>` : ''}` : `<span class="catalog-card__price-inquiry">가격 문의</span>`}
          </div>
          ${tags.length ? `<div class="catalog-card__tags">${tags.map((t) => `<span class="catalog-card__tag">${esc(t)}</span>`).join('')}</div>` : ''}
        </div>
      </article>`;
  }).join('');
}

// ─── 카드 클릭 → 단일 상품 뷰 전환 ──────────────────────────────────────

let catalogScrollY = 0; // 카탈로그 스크롤 위치 저장

function showDetailView(p) {
  catalogScrollY = window.scrollY;
  renderSingleView(p);
  showView('single');
  window.scrollTo({ top: 0 });
}

// ─── 이벤트 ───────────────────────────────────────────────────────────────

browseAllBtn.addEventListener('click', () => {
  renderAllChips();
  renderGrid();
  showView('catalog');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

backBtn.addEventListener('click', () => {
  showView('catalog');
  window.scrollTo({ top: catalogScrollY });
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

let _searchTimer = null;
searchInput.addEventListener('input', () => {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(renderGrid, 200);
});

// ─── 부트스트랩 ────────────────────────────────────────────────────────────

(async function bootstrap() {
  try { await signInAnonymously(auth); } catch (e) { console.warn('[catalog] anonymous auth failed', e); }
  await Promise.all([loadAgent(), loadData()]);
})();
