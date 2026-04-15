/**
 * shared/catalog-card.js
 *
 * 공유 카드 · 상세 HTML 렌더러
 *   — product-list.js (ERP 모바일 상품)
 *   — catalog.js (퍼블릭 카탈로그)
 *
 * 데이터 형식 양쪽 모두 처리:
 *   snake_case  : raw Firebase (catalog.js 기본)
 *   camelCase   : normalized product (product-list.js 기본)
 */

// ─── 유틸 ─────────────────────────────────────────────────────────────────

import { escapeHtml as esc } from '../core/management-format.js';
import { isSupportedPhotoSource } from '../core/drive-photos.js';
export { esc };

export function has(v) {
  const s = String(v ?? '').trim();
  return s !== '' && s !== '-';
}

export function fmt(v) {
  const n = Number(String(v || '').replace(/[^\d.-]/g, '') || 0);
  if (!n) return null;
  return n.toLocaleString('ko-KR') + '원';
}

function shortYear(text) {
  return String(text || '').replace(/\b(20)(\d{2})\b/g, '$2');
}

/** snake_case / camelCase 모두 읽기 */
function rf(p, ...keys) {
  for (const k of keys) {
    const v = p[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return '';
}

// ─── 뱃지 CSS 클래스 ──────────────────────────────────────────────────────

export function badgeClass(field, value) {
  const v = String(value || '').toLowerCase();
  if (field === 'productType' || field === 'product_type') {
    if (v.includes('신차렌트')) return 'cat-badge--rent-new';
    if (v.includes('리스'))     return 'cat-badge--lease';
    if (v.includes('중고렌트') || v.includes('재렌트')) return 'cat-badge--rent-used';
    if (v.includes('신차구독')) return 'cat-badge--sub-new';
    if (v.includes('중고구독') || v.includes('재구독')) return 'cat-badge--sub-used';
    return 'cat-badge--outline';
  }
  // vehicleStatus / vehicle_status
  if (v.includes('가능') || v.includes('판매')) return 'cat-badge--info';
  if (v.includes('완료'))                       return 'cat-badge--success';
  if (v.includes('대기') || v.includes('보류') || v.includes('예정')) return 'cat-badge--warning';
  if (v.includes('불가') || v.includes('취소')) return 'cat-badge--danger';
  return 'cat-badge--info';
}

// ─── 섹션 아이콘 & 제목 ───────────────────────────────────────────────────

const SECTION_ICONS = {
  price:     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>',
  insurance: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>',
  rental:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="m21 3-7 7"/><path d="M11 13H6a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1"/></svg>',
  extra:     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
};

export function sectionTitle(icon, text) {
  return `<div class="cat-section-title">${SECTION_ICONS[icon] || ''}<span>${esc(text)}</span></div>`;
}

// ─── 카드 ─────────────────────────────────────────────────────────────────

/**
 * renderCatalogCard(p, opts)
 *
 * @param {object} p         — raw product (snake_case 또는 camelCase)
 * @param {object} opts
 * @param {string[]} [opts.periods]   — 대표 가격 비교 기간 (기본: 전체)
 * @param {string}   [opts.dataAttr] — article 에 붙일 data 속성 문자열
 *                                     예: 'data-id="abc"' 또는 'data-index="0"'
 */
export function renderCatalogCard(p, { periods = ['1','6','12','24','36','48','60'], dataAttr = '' } = {}) {
  const photos = (Array.isArray(p.photos) && p.photos.length ? p.photos : null)
    || (Array.isArray(p.image_urls) && p.image_urls.length ? p.image_urls : null)
    || (p.image_url ? [p.image_url] : []);
  const thumb     = photos[0] || '';
  const maker     = rf(p, 'maker');
  const model     = rf(p, 'model', 'model_name');
  const modelText = [maker, model].filter(v => v && v !== '-').join(' ');
  const carNo     = rf(p, 'carNo', 'car_number');
  const subModel  = rf(p, 'subModel') || shortYear(rf(p, 'sub_model'));
  const trim      = rf(p, 'trim', 'trim_name');
  const sub       = [subModel, trim].filter(v => v && v !== '-').join(' · ');
  const vs        = rf(p, 'vehicleStatus', 'vehicle_status');
  const pt        = rf(p, 'productType', 'product_type');
  const fuel      = rf(p, 'fuel', 'fuel_type');
  const year      = rf(p, 'year');
  const mileage   = rf(p, 'mileageDisplay')
    || (p.mileageValue ? p.mileageValue.toLocaleString('ko-KR') + 'km' : '')
    || (p.mileage ? Number(p.mileage).toLocaleString('ko-KR') + 'km' : '');
  const extColor  = rf(p, 'extColor', 'ext_color');
  const intColor  = rf(p, 'intColor', 'int_color');

  // 대표 가격
  let cardRent = 0, cardDep = 0, cardMonth = '';
  for (const m of periods) {
    const r = Number(p.price?.[m]?.rent || p[`rent_${m}`] || 0);
    if (r && (!cardRent || r < cardRent)) {
      cardRent = r;
      cardDep  = Number(p.price?.[m]?.deposit || p[`deposit_${m}`] || 0);
      cardMonth = m;
    }
  }
  const monthLabel = cardMonth === '1' ? '월렌트' : cardMonth ? `${cardMonth}개월` : '';

  const photoLinkRaw = rf(p, 'photoLink', 'photo_link');
  const driveFolderUrl = (!thumb && isSupportedPhotoSource(photoLinkRaw)) ? photoLinkRaw : '';
  const imageHtml = thumb
    ? `<img class="catalog-card__image" src="${esc(thumb)}" alt="${esc(modelText)}" loading="lazy" decoding="async">`
    : driveFolderUrl
      ? `<img class="catalog-card__image" data-drive-folder="${esc(driveFolderUrl)}" alt="${esc(modelText)}" loading="lazy" decoding="async">`
      : `<div class="catalog-card__no-image"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;

  const cardBadges = [
    vs && vs !== '재고' && vs !== '-' ? { field: 'vehicleStatus', value: vs } : null,
    pt && pt !== '-'                  ? { field: 'productType',   value: pt } : null,
  ].filter(Boolean);
  const badgeHtml = cardBadges.map(b =>
    `<span class="catalog-card__badge ${badgeClass(b.field, b.value)}">${esc(b.value)}</span>`
  ).join('');

  const photoCountHtml = photos.length > 1
    ? `<span class="catalog-card__photo-count"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> ${photos.length}</span>`
    : '';

  const specs = [
    fuel && fuel !== '-' ? fuel : null,
    year && year !== '-' ? `${year}년` : null,
    mileage || null,
  ].filter(Boolean);

  const colors = [
    extColor && extColor !== '-' ? extColor : null,
    intColor && intColor !== '-' ? intColor : null,
  ].filter(Boolean);

  const carNoHtml = carNo && carNo !== '-'
    ? ` <span class="catalog-card__carno">${esc(carNo)}</span>` : '';

  return `<article class="catalog-card" ${dataAttr} role="button" tabindex="0">
  <div class="catalog-card__image-wrap">
    ${imageHtml}
    ${badgeHtml ? `<div class="catalog-card__badges">${badgeHtml}</div>` : ''}
    ${photoCountHtml}
  </div>
  <div class="catalog-card__body">
    <div class="catalog-card__model">${esc(modelText || '차량')}${carNoHtml}</div>
    ${subModel && subModel !== '-' ? `<div class="catalog-card__submodel">${esc(subModel)}</div>` : ''}
    ${trim && trim !== '-' ? `<div class="catalog-card__trim">${esc(trim)}</div>` : ''}
    ${cardRent
      ? `<div class="catalog-card__price">월 ${fmt(cardRent)}</div>
         <div class="catalog-card__dep-row">${cardDep ? `보증금 ${fmt(cardDep)}` : ''}${monthLabel ? ` <span>${monthLabel}</span>` : ''}</div>`
      : `<div class="catalog-card__price-inquiry">가격 문의</div>`}
    ${specs.length ? `<div class="catalog-card__specs">${specs.map(s => esc(s)).join(' · ')}</div>` : ''}
    ${colors.length ? `<div class="catalog-card__colors">${colors.map(c => esc(c)).join(' · ')}</div>` : ''}
  </div>
</article>`;
}

// ─── 상세: 히어로 섹션 ────────────────────────────────────────────────────

/**
 * renderCatalogDetailHero(p, actionsHtml)
 *
 * @param {object} p            — raw product
 * @param {string} actionsHtml  — 버튼 HTML (공유/문의/계약)
 */
export function renderCatalogDetailHero(p, actionsHtml = '') {
  const maker     = rf(p, 'maker');
  const model     = rf(p, 'model', 'model_name');
  const modelText = [maker, model].filter(v => v && v !== '-').join(' ');
  const carNo     = rf(p, 'carNo', 'car_number');
  const subModel  = rf(p, 'subModel') || shortYear(rf(p, 'sub_model'));
  const trim      = rf(p, 'trim', 'trim_name');
  const sub       = [subModel, trim].filter(v => v && v !== '-').join(' · ');
  const vs        = rf(p, 'vehicleStatus', 'vehicle_status');
  const pt        = rf(p, 'productType', 'product_type');
  const fuel      = rf(p, 'fuel', 'fuel_type');
  const year      = rf(p, 'year');
  const mileage   = rf(p, 'mileageDisplay')
    || (p.mileageValue ? p.mileageValue.toLocaleString('ko-KR') + 'km' : '')
    || (p.mileage ? Number(p.mileage).toLocaleString('ko-KR') + 'km' : '');
  const extColor  = rf(p, 'extColor', 'ext_color');
  const intColor  = rf(p, 'intColor', 'int_color');
  const optText   = String(p.options ?? '').trim();

  const badgesHtml = [
    vs && vs !== '-' && vs !== '재고' ? `<span class="cat-badge ${badgeClass('vehicleStatus', vs)}">${esc(vs)}</span>` : '',
    pt && pt !== '-'                  ? `<span class="cat-badge ${badgeClass('productType',   pt)}">${esc(pt)}</span>` : '',
  ].filter(Boolean).join('');

  const tags = [fuel, year && year !== '-' ? `${year}년식` : '', mileage].filter(v => has(v));

  return `<div class="cat-hero">
  <div class="cat-hero-top">
    <div>
      ${badgesHtml ? `<div class="cat-badges">${badgesHtml}</div>` : ''}
      <h2 class="cat-title">${esc(modelText || '차량')}${carNo && carNo !== '-' ? `<span class="cat-carno">${esc(carNo)}</span>` : ''}</h2>
      ${sub     ? `<p class="cat-subtitle">${esc(sub)}</p>`     : ''}
      ${optText ? `<p class="cat-options">${esc(optText)}</p>`  : ''}
    </div>
    ${actionsHtml ? `<div class="cat-hero-actions">${actionsHtml}</div>` : ''}
  </div>
  <div class="cat-meta">
    <span class="cat-meta-text">${tags.map(t => esc(t)).join(' · ') || '-'}</span>
    ${has(extColor) ? `<span class="cat-color-badge">외장 ${esc(extColor)}</span>` : ''}
    ${has(intColor) ? `<span class="cat-color-badge">내장 ${esc(intColor)}</span>` : ''}
  </div>
</div>`;
}

// ─── 상세: 가격표 ─────────────────────────────────────────────────────────

/**
 * renderCatalogPriceTable(priceRows, opts)
 *
 * @param {Array}  priceRows           — [{m, rent, dep, fee}, ...]
 * @param {object} opts
 * @param {boolean} [opts.showFee]      — 수수료 컬럼 표시 여부 (ERP only)
 * @param {string}  [opts.guideNote]    — 가격표 하단 안내 문구
 * @param {string}  [opts.clawbackNote] — 수수료 환수조건 (ERP only, 표 바로 아래)
 */
export function renderCatalogPriceTable(priceRows, { showFee = false, guideNote = '', clawbackNote = '' } = {}) {
  if (!priceRows.length) {
    return `<div class="cat-section cat-inquiry"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.65 3.4 2 2 0 0 1 3.62 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.8a16 16 0 0 0 6 6l.86-.86a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg> 가격은 문의해 주세요</div>`;
  }
  const hasFee = showFee && priceRows.some(r => Number(r.fee || 0) > 0);
  return `<div class="cat-section">
  ${sectionTitle('price', '기간별 대여료 및 보증금 안내')}
  <table class="cat-table">
    <thead><tr><th>기간</th><th>대여료</th><th>보증금</th>${hasFee ? '<th>수수료</th>' : ''}</tr></thead>
    <tbody>${priceRows.map(({ m, rent, dep, fee }) => `<tr>
      <td>${m}개월</td>
      <td class="cat-price-cell">${fmt(rent) || '-'}</td>
      <td>${fmt(dep) || '-'}</td>
      ${hasFee ? `<td>${fmt(fee) || '-'}</td>` : ''}
    </tr>`).join('')}</tbody>
  </table>
  ${guideNote ? `<div class="cat-note">* ${esc(guideNote)}</div>` : ''}
  ${clawbackNote ? `<div class="cat-note">* ${esc(clawbackNote)}</div>` : ''}
</div>`;
}

// ─── 상세: 보험정보 ───────────────────────────────────────────────────────

/**
 * renderCatalogInsuranceTable(insRows)
 *
 * @param {Array} insRows — [[label, limit, deductible], ...]
 */
export function renderCatalogInsuranceTable(insRows) {
  const rows = insRows.filter(([, l, d]) => has(l) || (has(d) && d !== '-'));
  if (!rows.length) return '';
  return `<div class="cat-section">
  ${sectionTitle('insurance', '차량보험정보')}
  <table class="cat-table cat-table--insurance">
    <thead><tr><th>항목</th><th>한도</th><th>면책금</th></tr></thead>
    <tbody>${rows.map(([label, limit, deduct]) =>
      `<tr><td>${esc(label)}</td><td>${esc(limit || '-')}</td><td>${esc(deduct || '-')}</td></tr>`
    ).join('')}</tbody>
  </table>
</div>`;
}

// ─── 상세: 대여조건 ───────────────────────────────────────────────────────

/**
 * renderCatalogConditions(condRows)
 *
 * @param {Array} condRows — [[label, value], ...]
 */
export function renderCatalogConditions(condRows) {
  const rows = condRows.filter(([, v]) => has(v));
  if (!rows.length) return '';
  return `<div class="cat-section">
  ${sectionTitle('rental', '대여조건')}
  <div class="cat-rows">${rows.map(([l, v]) =>
    `<div class="cat-row"><span class="cat-row-label">${esc(l)}</span><span class="cat-row-value">${esc(v)}</span></div>`
  ).join('')}</div>
</div>`;
}

// ─── 상세: 추가정보 ───────────────────────────────────────────────────────

/**
 * renderCatalogExtra(extraRows)
 *
 * @param {Array} extraRows — [[label, value], ...]
 */
export function renderCatalogExtra(extraRows) {
  const rows = extraRows.filter(([, v]) => has(v));
  if (!rows.length) return '';
  return `<div class="cat-section">
  ${sectionTitle('extra', '추가정보')}
  <div class="cat-rows">${rows.map(([l, v]) =>
    `<div class="cat-row"><span class="cat-row-label">${esc(l)}</span><span class="cat-row-value">${esc(v)}</span></div>`
  ).join('')}</div>
</div>`;
}

// ─── 상세: 수수료 환수조건 (ERP 전용) ────────────────────────────────────

/**
 * renderCatalogClawback(text)
 *
 * @param {string} text — 환수조건 문구
 */
export function renderCatalogClawback(text) {
  if (!has(text)) return '';
  return `<div class="cat-section">
  ${sectionTitle('extra', '수수료 환수조건')}
  <div class="cat-note">${esc(text)}</div>
</div>`;
}
