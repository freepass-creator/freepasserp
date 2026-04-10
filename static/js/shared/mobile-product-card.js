/**
 * shared/mobile-product-card.js
 * 모바일 상품 카드(m-product-card) 마크업 공유 렌더러
 * — mobile/product.js (모바일 ERP)
 * — catalog.js (퍼블릭 카탈로그)
 */
import { escapeHtml } from '../core/management-format.js';

export function colorToHex(name) {
  const s = String(name || '').toLowerCase().trim();
  if (!s || s === '-') return null;
  const map = [
    [/펄|화이트|흰|white/, '#f8fafc'],
    [/블랙|검정|black/, '#0f172a'],
    [/실버|silver/, '#c0c0c0'],
    [/그레이|회색|gray|grey/, '#6b7280'],
    [/레드|빨강|red/, '#ef4444'],
    [/블루|파랑|navy|blue/, '#1e3a8a'],
    [/그린|초록|green/, '#16a34a'],
    [/옐로우|노랑|yellow/, '#eab308'],
    [/오렌지|주황|orange/, '#f97316'],
    [/브라운|갈색|brown/, '#7c2d12'],
    [/베이지|beige/, '#d6c8a8'],
    [/카키|khaki/, '#78716c'],
    [/와인|버건디|wine/, '#7f1d1d'],
  ];
  for (const [re, hex] of map) if (re.test(s)) return hex;
  return '#cbd5e1';
}

function statusTone(v) {
  const s = String(v || '').trim();
  if (/출고가능|즉시출고/.test(s)) return 'success';
  if (/출고불가|정비중|사고/.test(s)) return 'danger';
  if (/예약|대기/.test(s)) return 'warn';
  return 'neutral';
}

function typeTone(v) {
  const s = String(v || '').trim();
  if (/신차/.test(s)) return 'info';
  if (/중고/.test(s)) return 'warn';
  if (/리스/.test(s)) return 'purple';
  if (/렌트/.test(s)) return 'info';
  return 'neutral';
}

/**
 * @param {object} p — raw Firebase product (snake_case)
 * @param {object} opts
 * @param {string} opts.href — 카드 클릭 시 이동 경로 (기본: /m/product-list/{pid})
 * @returns {string} HTML
 */
export function renderMobileProductCard(p, { href } = {}) {
  const photos = (Array.isArray(p.image_urls) && p.image_urls.length ? p.image_urls : null) || (p.image_url ? [p.image_url] : []);
  const thumb = photos[0] || '';
  const maker = p.maker || '';
  const model = p.model_name || '';
  const carNo = p.car_number || '';
  const subModel = p.sub_model || '';
  const trim = p.trim_name || '';
  const fuel = p.fuel_type || '';
  const year = p.year || '';
  const mileageNum = Number(p.mileage || 0);
  const mileage = mileageNum
    ? (mileageNum >= 10000 ? `${(mileageNum / 10000).toFixed(1)}만km` : `${mileageNum.toLocaleString('ko-KR')}km`)
    : '';
  const ext = p.ext_color || '';
  const intc = p.int_color || '';
  const extHex = colorToHex(ext);
  const intHex = colorToHex(intc);

  const badges = [
    p.vehicle_status && p.vehicle_status !== '-'
      ? `<span class="m-product-card__badge m-product-card__badge--${statusTone(p.vehicle_status)}">${escapeHtml(p.vehicle_status)}</span>` : '',
    p.product_type && p.product_type !== '-'
      ? `<span class="m-product-card__badge m-product-card__badge--${typeTone(p.product_type)}">${escapeHtml(p.product_type)}</span>` : '',
  ].join('');

  const imgInner = thumb
    ? `<img class="m-product-card__img" src="${escapeHtml(thumb)}" loading="lazy" decoding="async" fetchpriority="low" alt="">`
    : `<div class="m-product-card__no-img"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;
  const imgHtml = `<div class="m-product-card__media">${imgInner}${badges ? `<div class="m-product-card__badges">${badges}</div>` : ''}</div>`;

  const lineSpec = [year && year + '년', mileage].filter(Boolean).join(' · ');
  const colorSwatches = (extHex || intHex) ? `<span class="m-product-card__swatches">${
    extHex ? `<span class="m-product-card__swatch" style="background:${extHex}" title="외장: ${escapeHtml(ext)}"><em>외</em></span>` : ''
  }${
    intHex ? `<span class="m-product-card__swatch" style="background:${intHex}" title="내장: ${escapeHtml(intc)}"><em>내</em></span>` : ''
  }</span>` : '';
  const lineFuelColor = (fuel || colorSwatches)
    ? `<span class="m-product-card__line">${fuel ? escapeHtml(fuel) : ''}${fuel && colorSwatches ? ' ' : ''}${colorSwatches}</span>`
    : '';

  const pr = p.price || {};
  const num = (v) => Number(String(v ?? '').replace(/[^\d.-]/g, '')) || 0;
  const months = ['1', '12', '24', '36', '48', '60'];
  const priceRows = months.map(m => ({
    m: Number(m),
    rent: num(pr[m]?.rent) || (m === '48' ? num(p.rental_price_48) || num(p.rental_price) : (m === '60' ? num(p.rental_price_60) : 0)),
    deposit: num(pr[m]?.deposit) || (m === '48' ? num(p.deposit_48) || num(p.deposit) : (m === '60' ? num(p.deposit_60) : 0)),
  })).filter(r => r.rent > 0);
  const cheapest = priceRows.length ? priceRows.reduce((a, b) => (a.rent <= b.rent ? a : b)) : null;
  const priceLabel = cheapest ? `월 ${cheapest.rent.toLocaleString('ko-KR')}원` : '';
  const depositMan = cheapest && cheapest.deposit ? Math.round(cheapest.deposit / 10000) + '만원' : '-';
  const priceSub = cheapest ? `보증금 ${depositMan} ${cheapest.m}개월` : '';

  const pid = p.product_uid || p.product_code || '';
  if (!pid) return '';
  const cardHref = href || `/m/product-list/${encodeURIComponent(pid)}`;

  return `<a class="m-product-card" data-id="${escapeHtml(pid)}" href="${escapeHtml(cardHref)}">
    ${imgHtml}
    <div class="m-product-card__body">
      <div class="m-product-card__title">${escapeHtml(maker)} ${escapeHtml(model)}${carNo ? `<span class="m-product-card__carno">${escapeHtml(carNo)}</span>` : ''}</div>
      ${subModel ? `<div class="m-product-card__sub">${escapeHtml(subModel)}</div>` : ''}
      ${trim ? `<div class="m-product-card__meta">${escapeHtml(trim)}</div>` : ''}
      ${lineSpec ? `<div class="m-product-card__meta">${escapeHtml(lineSpec)}</div>` : ''}
      ${lineFuelColor ? `<div class="m-product-card__meta">${lineFuelColor}</div>` : ''}
      ${priceLabel ? `<div class="m-product-card__price">${escapeHtml(priceLabel)}</div>` : ''}
      ${priceSub ? `<div class="m-product-card__price-sub">${escapeHtml(priceSub)}</div>` : ''}
    </div>
  </a>`;
}
