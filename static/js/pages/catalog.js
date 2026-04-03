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

// 헤더
const agentAvatar    = qs('catalog-agent-avatar');
const agentName      = qs('catalog-agent-name');
const agentCompany   = qs('catalog-agent-company');
const headerCall     = qs('catalog-header-call');
const headerCallText = qs('catalog-header-call-text');
const backBtn        = qs('catalog-back-btn');

// 단일 상품 뷰
const singleView     = qs('catalog-single');
const singleGallery  = qs('single-gallery');
const singleInfo     = qs('single-info');
const singlePricing  = qs('single-pricing');
const singleSpecs    = qs('single-specs');
const singleCta      = qs('single-cta');
const singleCtaLink  = qs('single-cta-link');
const singleCtaText  = qs('single-cta-text');
const browseAllBtn   = qs('browse-all-btn');

// 카탈로그 뷰
const catalogMain    = qs('catalog-main');
const searchInput    = qs('catalog-search');
const chipsEl        = qs('catalog-filter-chips');
const countBar       = qs('catalog-count-bar');
const countText      = qs('catalog-count-text');
const grid           = qs('catalog-grid');

// 모달
const modal          = qs('catalog-modal');
const modalGallery   = qs('catalog-modal-gallery');
const modalBody      = qs('catalog-modal-body');
const modalClose     = qs('catalog-modal-close');
const modalCta       = qs('catalog-modal-cta');
const modalCtaText   = qs('catalog-modal-cta-text');

// 하단 CTA
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
let activeMaker   = '';
let galleryIndex  = 0;
let galleryImages = [];
let agentPhone    = '';
let agentNameStr  = '';
let currentView   = 'loading'; // 'single' | 'catalog'

// ─── 유틸 ──────────────────────────────────────────────────────────────────

function esc(text) {
  const d = document.createElement('div');
  d.textContent = String(text ?? '');
  return d.innerHTML;
}

function fmtPrice(v) {
  const n = Number(v || 0);
  if (!n) return null;
  return n.toLocaleString('ko-KR') + '원';
}

function getImages(p) {
  if (Array.isArray(p.image_urls) && p.image_urls.length) return p.image_urls.filter(Boolean);
  if (p.image_url) return [p.image_url];
  return [];
}

function getRent(p, months) {
  return Number(
    p[`rent_${months}`] ||
    p[`rental_price_${months}`] ||
    p?.price?.[months]?.rent ||
    p?.price?.[String(months)]?.rent ||
    0
  );
}

function getDeposit(p, months) {
  return Number(
    p[`deposit_${months}`] ||
    p?.price?.[months]?.deposit ||
    p?.price?.[String(months)]?.deposit ||
    0
  );
}

// ─── 뷰 전환 ──────────────────────────────────────────────────────────────

function showView(view) {
  currentView = view;
  singleView.hidden  = view !== 'single';
  catalogMain.hidden  = view !== 'catalog';
  backBtn.hidden      = !(view === 'catalog' && hasShare);
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

    agentNameStr = name;

    if (name) {
      agentName.textContent = name;
      const initial = name.charAt(0);
      agentAvatar.innerHTML = `<span class="catalog-agent-avatar__initial">${esc(initial)}</span>`;
    }
    if (company) agentCompany.textContent = company;

    if (phone) {
      agentPhone = phone;
      headerCall.href = `tel:${phone}`;
      headerCallText.textContent = phone;
      headerCall.hidden = false;

      // 카탈로그 하단 CTA
      ctaLink.href = `tel:${phone}`;
      ctaText.textContent = `${name || '영업자'}에게 전화하기`;

      // 모달 CTA
      modalCta.href = `tel:${phone}`;
      modalCtaText.textContent = '전화 문의하기';

      // 단일 뷰 CTA
      singleCtaLink.href = `tel:${phone}`;
      singleCtaText.textContent = `${name || '담당자'}에게 전화 문의`;
      singleCta.hidden = false;
    }
  } catch (e) {
    console.warn('[catalog] agent load failed', e);
  }
}

// ─── 상품 로드 ─────────────────────────────────────────────────────────────

async function loadProducts() {
  try {
    const snap = await get(ref(db, 'products'));
    const data = snap.val() || {};
    allProducts = Object.entries(data)
      .map(([key, p]) => ({ ...p, _key: key }))
      .filter((p) => p && p.status !== 'deleted' && p.vehicle_status !== '계약완료')
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

    // 공유 상품이 있으면 단일 뷰로 시작
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

    // 공유 상품 없으면 바로 카탈로그
    renderChips();
    renderGrid();
    showView('catalog');
  } catch (err) {
    grid.innerHTML = '<div class="catalog-empty">상품을 불러올 수 없습니다.</div>';
    showView('catalog');
    console.error('[catalog] loadProducts error', err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  VIEW 1: 단일 상품 상세
// ═══════════════════════════════════════════════════════════════════════════

function renderSingleView(p) {
  const model = [p.maker, p.model_name].filter(Boolean).join(' ');
  const sub   = [p.sub_model, p.trim_name].filter(Boolean).join(' · ');

  // 페이지 타이틀
  document.title = model || '렌트카 상품 안내';

  // 갤러리
  renderSingleGallery(getImages(p));

  // 기본 정보
  const status = p.vehicle_status || '';
  const badgeHtml = status && status !== '재고'
    ? `<span class="catalog-single__badge">${esc(status)}</span>` : '';

  singleInfo.innerHTML = `
    ${badgeHtml}
    <h1 class="catalog-single__title">${esc(model || '차량')}</h1>
    ${sub ? `<p class="catalog-single__subtitle">${esc(sub)}</p>` : ''}
    <div class="catalog-single__tags">
      ${[p.fuel_type, p.year ? `${p.year}년식` : '', p.mileage ? `${Number(p.mileage).toLocaleString()}km` : '']
        .filter(Boolean).map((t) => `<span class="catalog-single__tag">${esc(t)}</span>`).join('')}
    </div>
  `;

  // 가격표
  const periods = [36, 48, 60];
  const priceRows = periods.map((m) => {
    const rent = getRent(p, m);
    const dep  = getDeposit(p, m);
    if (!rent && !dep) return null;
    return { m, rent, dep };
  }).filter(Boolean);

  if (priceRows.length) {
    singlePricing.innerHTML = `
      <div class="catalog-single__section-title">렌트 요금</div>
      <div class="catalog-single__price-table">
        <div class="catalog-price-table__head">
          <span>기간</span><span>월 대여료</span><span>보증금</span>
        </div>
        ${priceRows.map(({ m, rent, dep }) => `
          <div class="catalog-price-table__row">
            <span class="catalog-price-table__period">${m}개월</span>
            <span class="catalog-price-table__rent">${fmtPrice(rent) || '-'}</span>
            <span class="catalog-price-table__dep">${fmtPrice(dep) || '-'}</span>
          </div>
        `).join('')}
      </div>
    `;
  } else {
    singlePricing.innerHTML = `
      <div class="catalog-single__inquiry">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        가격은 문의해 주세요
      </div>
    `;
  }

  // 차량 스펙
  const specs = [
    ['연식',     p.year ? `${p.year}년` : null],
    ['연료',     p.fuel_type || null],
    ['주행거리', p.mileage ? `${Number(p.mileage).toLocaleString()}km` : null],
    ['외부색상', p.ext_color || null],
    ['내부색상', p.int_color || null],
    ['차량번호', p.car_number || null],
    ['특이사항', p.partner_memo || p.note || null],
  ].filter(([, v]) => v);

  if (specs.length) {
    singleSpecs.innerHTML = `
      <div class="catalog-single__section-title">차량 정보</div>
      ${specs.map(([label, value]) =>
        `<div class="catalog-single__spec-row">
          <span class="catalog-single__spec-label">${esc(label)}</span>
          <span class="catalog-single__spec-value">${esc(value)}</span>
        </div>`
      ).join('')}
    `;
  } else {
    singleSpecs.innerHTML = '';
  }
}

// 단일 뷰 갤러리

let sGalleryIndex = 0;
let sGalleryImages = [];
let _sTouchStartX = 0;

function renderSingleGallery(images) {
  sGalleryImages = images;
  sGalleryIndex = 0;
  updateSingleGallery();

  // 스와이프
  singleGallery.addEventListener('touchstart', (e) => { _sTouchStartX = e.touches[0].clientX; }, { passive: true });
  singleGallery.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - _sTouchStartX;
    if (Math.abs(dx) < 40 || !sGalleryImages.length) return;
    sGalleryIndex = dx < 0
      ? (sGalleryIndex + 1) % sGalleryImages.length
      : (sGalleryIndex - 1 + sGalleryImages.length) % sGalleryImages.length;
    updateSingleGallery();
  }, { passive: true });
}

function updateSingleGallery() {
  if (!sGalleryImages.length) {
    singleGallery.innerHTML = '<div class="catalog-gallery__empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>';
    return;
  }

  const total = sGalleryImages.length;
  const navBtns = total > 1 ? `
    <button class="catalog-gallery__nav catalog-gallery__nav--prev" id="sg-prev" aria-label="이전">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
    </button>
    <button class="catalog-gallery__nav catalog-gallery__nav--next" id="sg-next" aria-label="다음">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
    </button>
    <div class="catalog-gallery__counter">${sGalleryIndex + 1} / ${total}</div>` : '';

  singleGallery.innerHTML = `
    <div class="catalog-single__gallery-track">
      <img class="catalog-single__gallery-img" src="${esc(sGalleryImages[sGalleryIndex])}" alt="차량 사진 ${sGalleryIndex + 1}">
      ${navBtns}
    </div>`;

  if (total > 1) {
    document.getElementById('sg-prev')?.addEventListener('click', () => {
      sGalleryIndex = (sGalleryIndex - 1 + total) % total;
      updateSingleGallery();
    });
    document.getElementById('sg-next')?.addEventListener('click', () => {
      sGalleryIndex = (sGalleryIndex + 1) % total;
      updateSingleGallery();
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  VIEW 2: 카탈로그 그리드
// ═══════════════════════════════════════════════════════════════════════════

// 필터 칩

function getMakers() {
  const set = new Set();
  allProducts.forEach((p) => { if (p.maker) set.add(p.maker); });
  return [...set].sort();
}

function renderChips() {
  const makers = getMakers();
  if (makers.length <= 1) { chipsEl.innerHTML = ''; return; }
  const btnAll = `<button class="catalog-chip${!activeMaker ? ' is-active' : ''}" data-maker="">전체</button>`;
  const btnMakers = makers.map((m) =>
    `<button class="catalog-chip${activeMaker === m ? ' is-active' : ''}" data-maker="${esc(m)}">${esc(m)}</button>`
  ).join('');
  chipsEl.innerHTML = btnAll + btnMakers;
}

chipsEl.addEventListener('click', (e) => {
  const chip = e.target.closest('.catalog-chip');
  if (!chip) return;
  activeMaker = chip.dataset.maker || '';
  renderChips();
  renderGrid();
});

// 그리드

function getFiltered() {
  const q = (searchInput.value || '').trim().toLowerCase();
  return allProducts.filter((p) => {
    if (activeMaker && p.maker !== activeMaker) return false;
    if (q) {
      const text = [p.car_number, p.maker, p.model_name, p.sub_model, p.trim_name].join(' ').toLowerCase();
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
      : `<div class="catalog-card__no-image"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;

    const badgeHtml = status && status !== '재고' && status !== '입고예정'
      ? `<span class="catalog-card__badge">${esc(status)}</span>` : '';

    const tags = [p.fuel_type, p.year ? `${p.year}년` : '', p.mileage ? `${Number(p.mileage).toLocaleString()}km` : ''].filter(Boolean);

    return `
      <article class="catalog-card" data-index="${i}" role="button" tabindex="0">
        <div class="catalog-card__image-wrap">
          ${imageHtml}
          ${badgeHtml}
          ${imgs.length > 1 ? `<span class="catalog-card__photo-count"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> ${imgs.length}</span>` : ''}
        </div>
        <div class="catalog-card__body">
          <div class="catalog-card__model">${esc(model || '차량')}</div>
          ${sub ? `<div class="catalog-card__sub">${esc(sub)}</div>` : ''}
          <div class="catalog-card__price-row">
            ${rent48
              ? `<span class="catalog-card__price">월 ${fmtPrice(rent48)}</span>${dep48 ? `<span class="catalog-card__dep">보증금 ${fmtPrice(dep48)}</span>` : ''}`
              : `<span class="catalog-card__price-inquiry">가격 문의</span>`
            }
          </div>
          ${tags.length ? `<div class="catalog-card__tags">${tags.map((t) => `<span class="catalog-card__tag">${esc(t)}</span>`).join('')}</div>` : ''}
        </div>
      </article>`;
  }).join('');
}

// ─── 상세 모달 (카탈로그 그리드에서 카드 클릭) ────────────────────────────

function openModal(p) {
  galleryImages = getImages(p);
  galleryIndex  = 0;
  renderModalGallery();
  renderModalBody(p);
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = '';
}

function renderModalGallery() {
  if (!galleryImages.length) {
    modalGallery.innerHTML = '<div class="catalog-gallery__empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>';
    return;
  }

  const total = galleryImages.length;
  const navBtns = total > 1 ? `
    <button class="catalog-gallery__nav catalog-gallery__nav--prev" id="gallery-prev" aria-label="이전">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
    </button>
    <button class="catalog-gallery__nav catalog-gallery__nav--next" id="gallery-next" aria-label="다음">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
    </button>
    <div class="catalog-gallery__counter">${galleryIndex + 1} / ${total}</div>` : '';

  modalGallery.innerHTML = `
    <div class="catalog-gallery__track">
      <img class="catalog-gallery__img" src="${esc(galleryImages[galleryIndex])}" alt="차량 사진 ${galleryIndex + 1}">
      ${navBtns}
    </div>`;

  if (total > 1) {
    document.getElementById('gallery-prev')?.addEventListener('click', () => {
      galleryIndex = (galleryIndex - 1 + total) % total;
      renderModalGallery();
    });
    document.getElementById('gallery-next')?.addEventListener('click', () => {
      galleryIndex = (galleryIndex + 1) % total;
      renderModalGallery();
    });
  }
}

function renderModalBody(p) {
  const model = [p.maker, p.model_name].filter(Boolean).join(' ');
  const sub   = [p.sub_model, p.trim_name].filter(Boolean).join(' · ');

  const specs = [
    ['연식',     p.year ? `${p.year}년` : null],
    ['연료',     p.fuel_type || null],
    ['주행거리', p.mileage ? `${Number(p.mileage).toLocaleString()}km` : null],
    ['외부색상', p.ext_color || null],
    ['내부색상', p.int_color || null],
    ['차량번호', p.car_number || null],
    ['특이사항', p.partner_memo || p.note || null],
  ].filter(([, v]) => v);

  const periods = [36, 48, 60];
  const priceRows = periods.map((m) => {
    const rent = getRent(p, m);
    const dep  = getDeposit(p, m);
    if (!rent && !dep) return null;
    return { m, rent, dep };
  }).filter(Boolean);

  const specsHtml = specs.length
    ? `<div class="catalog-modal__section">
        <div class="catalog-modal__section-title">차량 정보</div>
        ${specs.map(([label, value]) =>
          `<div class="catalog-detail__row"><span class="catalog-detail__label">${esc(label)}</span><span class="catalog-detail__value">${esc(value)}</span></div>`
        ).join('')}
      </div>` : '';

  const priceHtml = priceRows.length
    ? `<div class="catalog-modal__section">
        <div class="catalog-modal__section-title">렌트 요금</div>
        <div class="catalog-price-table">
          <div class="catalog-price-table__head"><span>기간</span><span>월 대여료</span><span>보증금</span></div>
          ${priceRows.map(({ m, rent, dep }) =>
            `<div class="catalog-price-table__row">
              <span class="catalog-price-table__period">${m}개월</span>
              <span class="catalog-price-table__rent">${fmtPrice(rent) || '-'}</span>
              <span class="catalog-price-table__dep">${fmtPrice(dep) || '-'}</span>
            </div>`
          ).join('')}
        </div>
      </div>`
    : `<div class="catalog-modal__section catalog-modal__inquiry">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        가격은 문의해 주세요.
      </div>`;

  modalBody.innerHTML = `
    <div class="catalog-modal__title">${esc(model || '차량')}</div>
    ${sub ? `<div class="catalog-modal__subtitle">${esc(sub)}</div>` : ''}
    ${priceHtml}
    ${specsHtml}
  `;
}

// ─── 이벤트 ───────────────────────────────────────────────────────────────

// 전체 상품 보기
browseAllBtn.addEventListener('click', () => {
  renderChips();
  renderGrid();
  showView('catalog');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// 뒤로가기 (카탈로그 → 단일 뷰)
backBtn.addEventListener('click', () => {
  showView('single');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// 카드 클릭 → 모달
grid.addEventListener('click', (e) => {
  const card = e.target.closest('.catalog-card');
  if (!card) return;
  const idx = Number(card.dataset.index);
  const products = getFiltered();
  if (products[idx]) openModal(products[idx]);
});

grid.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('.catalog-card');
  if (!card) return;
  e.preventDefault();
  card.click();
});

// 모달 닫기
modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

// 모달 갤러리 스와이프
let _touchStartX = 0;
modalGallery.addEventListener('touchstart', (e) => { _touchStartX = e.touches[0].clientX; }, { passive: true });
modalGallery.addEventListener('touchend', (e) => {
  const dx = e.changedTouches[0].clientX - _touchStartX;
  if (Math.abs(dx) < 40 || !galleryImages.length) return;
  const total = galleryImages.length;
  galleryIndex = dx < 0
    ? (galleryIndex + 1) % total
    : (galleryIndex - 1 + total) % total;
  renderModalGallery();
}, { passive: true });

// 검색
let _searchTimer = null;
searchInput.addEventListener('input', () => {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(renderGrid, 200);
});

// ─── 부트스트랩 ────────────────────────────────────────────────────────────

(async function bootstrap() {
  try {
    await signInAnonymously(auth);
  } catch (e) {
    console.warn('[catalog] anonymous auth failed', e);
  }

  await Promise.all([loadAgent(), loadProducts()]);
})();
