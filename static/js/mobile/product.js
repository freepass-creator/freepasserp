/**
 * mobile/product.js — 모바일 상품목록
 * Firebase 직접 조회. 데스크탑 product-list.js와 완전 분리.
 */
import { requireAuth } from '../core/auth-guard.js';
import { watchProducts } from '../firebase/firebase-db.js';
import { escapeHtml } from '../core/management-format.js';

const $grid = document.getElementById('m-product-grid');
const $search = document.getElementById('m-product-search');

let allProducts = [];
let searchQuery = '';

// 색상 이름 → hex 매핑
function colorToHex(name) {
  const s = String(name || '').toLowerCase().trim();
  if (!s || s === '-') return null;
  const map = [
    [/펄|화이트|흰|white/,   '#f8fafc'],
    [/블랙|검정|black/,      '#0f172a'],
    [/실버|silver/,          '#c0c0c0'],
    [/그레이|회색|gray|grey/, '#6b7280'],
    [/레드|빨강|red/,        '#ef4444'],
    [/블루|파랑|navy|blue/,  '#1e3a8a'],
    [/그린|초록|green/,      '#16a34a'],
    [/옐로우|노랑|yellow/,   '#eab308'],
    [/오렌지|주황|orange/,   '#f97316'],
    [/브라운|갈색|brown/,    '#7c2d12'],
    [/베이지|beige/,         '#d6c8a8'],
    [/카키|khaki/,           '#78716c'],
    [/와인|버건디|wine/,     '#7f1d1d'],
  ];
  for (const [re, hex] of map) if (re.test(s)) return hex;
  return '#cbd5e1';
}

// 차량상태/상품구분 뱃지 톤
function statusTone(v) {
  const s = String(v || '');
  if (/출고가능|즉시/.test(s)) return 'success';
  if (/출고불가|정비|사고/.test(s)) return 'danger';
  if (/예약|대기/.test(s)) return 'warn';
  return 'neutral';
}
function typeTone(v) {
  const s = String(v || '');
  if (/신차/.test(s)) return 'info';
  if (/중고/.test(s)) return 'warn';
  if (/리스/.test(s)) return 'purple';
  if (/렌트/.test(s)) return 'info';
  return 'neutral';
}

function render(items) {
  if (!$grid) return;
  if (!items.length) {
    $grid.innerHTML = '<div style="grid-column:1/-1;padding:48px 0;text-align:center;color:var(--m-text-tertiary);">상품이 없습니다</div>';
    return;
  }
  $grid.innerHTML = items.map(p => {
    const photos = (Array.isArray(p.image_urls) && p.image_urls.length ? p.image_urls : null) || (p.image_url ? [p.image_url] : []);
    const thumb = photos[0] || '';
    const maker = p.maker || '';
    const model = p.model_name || '';
    const carNo = p.car_number || '';
    const subModel = p.sub_model || '';
    const trim = p.trim_name || '';
    const fuel = p.fuel_type || '';
    const year = p.year || '';
    // 주행거리: 만 단위 압축 (12,345 → 1.2만km)
    const mileageNum = Number(p.mileage || 0);
    const mileage = mileageNum
      ? (mileageNum >= 10000 ? `${(mileageNum / 10000).toFixed(1)}만km` : `${mileageNum.toLocaleString('ko-KR')}km`)
      : '';
    const ext = p.ext_color || '';
    const intc = p.int_color || '';
    const extHex = colorToHex(ext);
    const intHex = colorToHex(intc);

    // 뱃지 (출고가능 / 신차렌트 등)
    const badges = [
      p.vehicle_status && p.vehicle_status !== '-'
        ? `<span class="m-product-card__badge m-product-card__badge--${statusTone(p.vehicle_status)}">${escapeHtml(p.vehicle_status)}</span>` : '',
      p.product_type && p.product_type !== '-'
        ? `<span class="m-product-card__badge m-product-card__badge--${typeTone(p.product_type)}">${escapeHtml(p.product_type)}</span>` : '',
    ].join('');

    const imgInner = thumb
      ? `<img class="m-product-card__img" src="${escapeHtml(thumb)}" loading="lazy" alt="">`
      : `<div class="m-product-card__no-img"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;
    const imgHtml = `<div class="m-product-card__media">${imgInner}${badges ? `<div class="m-product-card__badges">${badges}</div>` : ''}</div>`;

    // ① 연식 · 주행거리
    const lineSpec = [year && year + '년', mileage].filter(Boolean).join(' · ');
    // ② 연료 · 색상박스
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

    return `<article class="m-product-card" data-id="${escapeHtml(p.product_uid || p.product_code || '')}">
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
    </article>`;
  }).join('');
}

function applySearch() {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return render(allProducts);
  const filtered = allProducts.filter(p => {
    const fields = [p.car_number, p.maker, p.model_name, p.sub_model, p.trim_name];
    return fields.some(f => String(f || '').toLowerCase().includes(q));
  });
  render(filtered);
}

// 카드 클릭 → 상세 페이지
$grid?.addEventListener('click', (e) => {
  const card = e.target.closest('.m-product-card[data-id]');
  if (!card) return;
  const id = card.dataset.id;
  if (id) {
    location.href = `/m/product-list/${encodeURIComponent(id)}`;
  }
});

(async () => {
  try {
    await requireAuth();
    watchProducts((products) => {
      allProducts = products.filter(p => p && p.product_uid);
      applySearch();
    });
    $search?.addEventListener('input', () => {
      searchQuery = $search.value;
      applySearch();
    });
  } catch (e) {
    console.error('[mobile/product] init failed', e);
  }
})();
