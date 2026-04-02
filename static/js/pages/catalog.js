/**
 * catalog.js
 *
 * 게스트/카탈로그 모드 — 인증 없이 공개 상품 목록을 카드 그리드로 표시.
 * URL 파라미터:
 *   ?agent=SP001&phone=01012345678  영업자 코드 + 연락처
 *   &maker=현대                      필터 프리셋
 */

import { db } from '../firebase/firebase-config.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';

document.addEventListener('contextmenu', (e) => e.preventDefault());

const grid = document.getElementById('catalog-grid');
const searchInput = document.getElementById('catalog-search');
const chipsContainer = document.getElementById('catalog-filter-chips');
const modal = document.getElementById('catalog-modal');
const modalBody = document.getElementById('catalog-modal-body');
const modalClose = document.getElementById('catalog-modal-close');
const ctaLink = document.getElementById('catalog-cta-link');

const params = new URLSearchParams(window.location.search);
const agentCode = params.get('agent') || '';
const agentPhone = params.get('phone') || '';
const presetMaker = params.get('maker') || '';

let allProducts = [];
let activeMaker = presetMaker;

// ─── CTA 설정 ─────────────────────────────────────────────────────────────

if (agentPhone) {
  ctaLink.href = `tel:${agentPhone}`;
} else {
  ctaLink.removeAttribute('href');
  ctaLink.querySelector('span').textContent = '상품 문의하기';
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatPrice(value) {
  const num = Number(value || 0);
  if (!num) return '-';
  return num.toLocaleString('ko-KR') + '원';
}

// ─── 데이터 로드 ──────────────────────────────────────────────────────────

async function loadProducts() {
  try {
    const snapshot = await get(ref(db, 'products'));
    const data = snapshot.val() || {};
    allProducts = Object.values(data)
      .filter((p) => p && p.status !== 'deleted')
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    renderChips();
    renderGrid();
  } catch (error) {
    grid.innerHTML = '<div class="catalog-empty">상품을 불러올 수 없습니다.</div>';
  }
}

// ─── 필터 칩 ──────────────────────────────────────────────────────────────

function getMakers() {
  const makers = new Set();
  allProducts.forEach((p) => { if (p.maker) makers.add(p.maker); });
  return [...makers].sort();
}

function renderChips() {
  const makers = getMakers();
  if (makers.length <= 1) { chipsContainer.innerHTML = ''; return; }
  const all = `<button class="catalog-chip${!activeMaker ? ' is-active' : ''}" data-maker="">전체</button>`;
  const chips = makers.map((m) =>
    `<button class="catalog-chip${activeMaker === m ? ' is-active' : ''}" data-maker="${escapeHtml(m)}">${escapeHtml(m)}</button>`
  ).join('');
  chipsContainer.innerHTML = all + chips;
}

chipsContainer.addEventListener('click', (e) => {
  const chip = e.target.closest('.catalog-chip');
  if (!chip) return;
  activeMaker = chip.dataset.maker || '';
  renderChips();
  renderGrid();
});

// ─── 그리드 렌더링 ────────────────────────────────────────────────────────

function getFilteredProducts() {
  const query = (searchInput.value || '').trim().toLowerCase();
  return allProducts.filter((p) => {
    if (activeMaker && p.maker !== activeMaker) return false;
    if (query) {
      const text = [p.car_number, p.maker, p.model_name, p.sub_model, p.trim_name].join(' ').toLowerCase();
      if (!text.includes(query)) return false;
    }
    return true;
  });
}

function renderGrid() {
  const products = getFilteredProducts();
  if (!products.length) {
    grid.innerHTML = '<div class="catalog-empty">조건에 맞는 상품이 없습니다.</div>';
    return;
  }

  grid.innerHTML = products.map((p, i) => {
    const imageUrl = (p.image_urls?.[0] || p.image_url || '').trim();
    const imageHtml = imageUrl
      ? `<img class="catalog-card__image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(p.model_name || '')}" loading="lazy">`
      : `<div class="catalog-card__image-placeholder">No Image</div>`;

    const model = [p.maker, p.model_name].filter(Boolean).join(' ');
    const sub = [p.sub_model, p.trim_name].filter(Boolean).join(' · ');
    const price = Number(p.rent_48 || p.rental_price_48 || p.rental_price || p.price?.['48']?.rent || 0);
    const deposit = Number(p.deposit_48 || p.deposit || p.price?.['48']?.deposit || 0);

    const tags = [
      p.fuel_type,
      p.year ? `${p.year}년` : '',
      p.mileage ? `${Number(p.mileage).toLocaleString()}km` : ''
    ].filter(Boolean);

    return `
      <article class="catalog-card" data-index="${i}">
        ${imageHtml}
        <div class="catalog-card__body">
          <div class="catalog-card__model">${escapeHtml(model || '차량')}</div>
          ${sub ? `<div class="catalog-card__sub">${escapeHtml(sub)}</div>` : ''}
          <div class="catalog-card__price">
            ${price ? `월 ${formatPrice(price)}` : '가격 문의'}
            ${deposit ? `<span class="catalog-card__price-sub">보증금 ${formatPrice(deposit)}</span>` : ''}
          </div>
          ${tags.length ? `<div class="catalog-card__tags">${tags.map((t) => `<span class="catalog-card__tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        </div>
      </article>
    `;
  }).join('');
}

// ─── 상세 모달 ────────────────────────────────────────────────────────────

grid.addEventListener('click', (e) => {
  const card = e.target.closest('.catalog-card');
  if (!card) return;
  const index = Number(card.dataset.index);
  const products = getFilteredProducts();
  const p = products[index];
  if (!p) return;
  openDetail(p);
});

function openDetail(p) {
  const imageUrl = (p.image_urls?.[0] || p.image_url || '').trim();
  const model = [p.maker, p.model_name].filter(Boolean).join(' ');
  const sub = [p.sub_model, p.trim_name].filter(Boolean).join(' · ');
  const price48 = Number(p.rent_48 || p.rental_price_48 || p.price?.['48']?.rent || 0);
  const dep48 = Number(p.deposit_48 || p.price?.['48']?.deposit || 0);

  const rows = [
    ['차량번호', p.car_number],
    ['연식', p.year ? `${p.year}년` : '-'],
    ['연료', p.fuel_type || '-'],
    ['주행거리', p.mileage ? `${Number(p.mileage).toLocaleString()}km` : '-'],
    ['외부색상', p.ext_color || '-'],
    ['내부색상', p.int_color || '-'],
    ['48개월 대여료', price48 ? formatPrice(price48) : '-'],
    ['48개월 보증금', dep48 ? formatPrice(dep48) : '-'],
    ['특이사항', p.partner_memo || p.note || '-']
  ].filter(([, v]) => v && v !== '-');

  modalBody.innerHTML = `
    ${imageUrl ? `<img class="catalog-detail__image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(model)}">` : ''}
    <div class="catalog-detail__title">${escapeHtml(model || '차량')}</div>
    ${sub ? `<div class="catalog-detail__subtitle">${escapeHtml(sub)}</div>` : ''}
    ${rows.map(([label, value]) => `
      <div class="catalog-detail__row">
        <span class="catalog-detail__label">${escapeHtml(label)}</span>
        <span class="catalog-detail__value">${escapeHtml(String(value))}</span>
      </div>
    `).join('')}
  `;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeDetail() {
  modal.hidden = true;
  document.body.style.overflow = '';
}

modalClose.addEventListener('click', closeDetail);
modal.addEventListener('click', (e) => { if (e.target === modal) closeDetail(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeDetail(); });

// ─── 검색 ─────────────────────────────────────────────────────────────────

let searchTimer = null;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderGrid, 200);
});

// ─── 공유 상세 보기 (?id=xxx) ─────────────────────────────────────────────

const shareProductId = params.get('id') || '';

async function loadShareDetail() {
  const detailEl = document.getElementById('catalog-share-detail');
  if (!shareProductId || !detailEl) return false;

  // 그리드/툴바/CTA/모달 숨기기
  document.getElementById('catalog-toolbar')?.setAttribute('hidden', '');
  grid.setAttribute('hidden', '');
  document.getElementById('catalog-cta')?.remove();
  document.getElementById('catalog-modal')?.remove();

  try {
    const snapshot = await get(ref(db, `products/${shareProductId}`));
    if (!snapshot.exists()) {
      detailEl.innerHTML = '<div class="catalog-empty">상품 정보를 찾을 수 없습니다.</div>';
      detailEl.hidden = false;
      return true;
    }
    const p = snapshot.val();

    // 상품 정보 구성
    const model = [p.maker, p.model_name].filter(Boolean).join(' ');
    const sub = [p.sub_model, p.trim_name].filter(Boolean).join(' · ');
    const imageUrl = (p.image_urls?.[0] || p.image_url || p.photo_link || '').trim();

    const infoRows = [
      ['차량번호', p.car_number],
      ['제조사', p.maker],
      ['모델명', p.model_name],
      ['세부모델', p.sub_model],
      ['트림', p.trim_name],
      ['연식', p.year ? `${p.year}년` : ''],
      ['연료', p.fuel_type],
      ['주행거리', p.mileage ? `${Number(p.mileage).toLocaleString()}km` : ''],
      ['차종구분', p.vehicle_class],
      ['외부색상', p.ext_color],
      ['내부색상', p.int_color],
      ['옵션', p.options],
      ['특이사항', p.partner_memo],
    ].filter(([, v]) => v && v !== '-');

    // 기간별 가격
    const periods = ['1', '12', '24', '36', '48', '60'];
    const priceRows = periods
      .filter(m => Number(p[`rent_${m}`] || p.price?.[m]?.rent || 0) > 0)
      .map(m => {
        const rent = Number(p[`rent_${m}`] || p.price?.[m]?.rent || 0).toLocaleString('ko-KR');
        const deposit = Number(p[`deposit_${m}`] || p.price?.[m]?.deposit || 0).toLocaleString('ko-KR');
        return `<tr><td>${m}개월</td><td>${rent}</td><td>${deposit}</td></tr>`;
      }).join('');

    detailEl.innerHTML = `
      <div class="catalog-share-card">
        ${imageUrl ? `<div class="catalog-share-photo"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(model)}"></div>` : ''}
        <div class="catalog-share-title">${escapeHtml(model)}</div>
        ${sub ? `<div class="catalog-share-subtitle">${escapeHtml(sub)}</div>` : ''}
        <div class="catalog-share-info">
          ${infoRows.map(([label, value]) => `
            <div class="catalog-share-row">
              <span class="catalog-share-label">${escapeHtml(label)}</span>
              <span class="catalog-share-value">${escapeHtml(String(value))}</span>
            </div>
          `).join('')}
        </div>
        ${priceRows ? `
          <div class="catalog-share-section-title">기간별 대여료 및 보증금</div>
          <table class="price-table catalog-share-price">
            <thead><tr><th>기간</th><th>대여료</th><th>보증금</th></tr></thead>
            <tbody>${priceRows}</tbody>
          </table>
        ` : ''}
      </div>
    `;
    detailEl.hidden = false;
  } catch (err) {
    detailEl.innerHTML = '<div class="catalog-empty">상품 정보를 불러올 수 없습니다.</div>';
    detailEl.hidden = false;
  }
  return true;
}

// ─── 시작 ─────────────────────────────────────────────────────────────────

if (shareProductId) {
  loadShareDetail();
} else {
  loadProducts();
}
