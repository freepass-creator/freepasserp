/**
 * mobile/product-detail.js — 모바일 상품 상세
 */
import { requireAuth } from '../core/auth-guard.js';
import { watchProducts } from '../firebase/firebase-db.js';
import { escapeHtml } from '../core/management-format.js';

const $content = document.getElementById('m-pd-content');
const $title = document.getElementById('m-pd-title');
const $back = document.getElementById('m-back-btn');

const params = new URLSearchParams(location.search);
const productId = params.get('id') || '';

let allProducts = [];
let activePhotoIndex = 0;
let currentProduct = null;

function fmtMoney(v) {
  const n = Number(v || 0);
  return n ? n.toLocaleString('ko-KR') + '원' : '-';
}

function renderGallery(p) {
  const photos = (Array.isArray(p.image_urls) && p.image_urls.length ? p.image_urls : null) || (p.image_url ? [p.image_url] : []);
  if (!photos.length) {
    return `<div class="m-pd-gallery" style="display:flex;align-items:center;justify-content:center;color:#fff;">사진 없음</div>`;
  }
  const idx = Math.min(activePhotoIndex, photos.length - 1);
  const badges = [p.vehicle_status, p.product_type].filter(v => v && v !== '-').map(v => `<span class="m-pd-gallery__badge">${escapeHtml(v)}</span>`).join('');
  const navs = photos.length > 1 ? `
    <button class="m-pd-gallery__nav m-pd-gallery__nav--prev" id="m-pd-prev" type="button"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
    <button class="m-pd-gallery__nav m-pd-gallery__nav--next" id="m-pd-next" type="button"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
  ` : '';
  return `<div class="m-pd-gallery">
    <img src="${escapeHtml(photos[idx])}" alt="">
    ${badges ? `<div class="m-pd-gallery__badges">${badges}</div>` : ''}
    ${navs}
    ${photos.length > 1 ? `<div class="m-pd-gallery__counter">${idx + 1} / ${photos.length}</div>` : ''}
  </div>`;
}

function render(p) {
  if (!$content) return;
  if (!p) {
    $content.innerHTML = '<div style="padding:48px 0;text-align:center;color:#8b95a1;">상품을 찾을 수 없습니다</div>';
    return;
  }
  const maker = p.maker || '';
  const model = p.model_name || '';
  const carNo = p.car_number || '';
  const subModel = p.sub_model || '';
  const trim = p.trim_name || '';
  const options = p.option_summary || '';
  const fuel = p.fuel_type || '';
  const year = p.year || '';
  const mileage = p.mileage ? Number(p.mileage).toLocaleString('ko-KR') + 'km' : '';
  const ext = p.ext_color || '';
  const intc = p.int_color || '';
  const colors = [ext, intc].filter(v => v && v !== '-').join(' / ');

  // 가격
  const months = ['1', '12', '24', '36', '48', '60'];
  const priceRows = months.map(m => {
    const r = Number(p[`rent_${m}`] || 0);
    const d = Number(p[`deposit_${m}`] || 0);
    if (!r && !d) return '';
    return `<tr><td>${m}개월</td><td><strong>${r ? r.toLocaleString('ko-KR') + '원' : '-'}</strong></td><td>${d ? d.toLocaleString('ko-KR') + '원' : '-'}</td></tr>`;
  }).join('');

  $title.textContent = `${maker} ${model}`.trim() || '상품 상세';

  $content.innerHTML = `
    ${renderGallery(p)}

    <div class="m-pd-section">
      <div class="m-pd-section__head">
        <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8"/><path d="M7 14h.01"/><path d="M17 14h.01"/><rect width="18" height="8" x="3" y="10" rx="2"/></svg>
        차량정보
      </div>
      <div class="m-pd-vehicle-title">${escapeHtml(maker)} ${escapeHtml(model)}</div>
      <div class="m-pd-vehicle-carno">${escapeHtml(carNo)}</div>
      ${subModel ? `<div class="m-pd-row"><span class="m-pd-row__label">세부모델</span><span class="m-pd-row__value">${escapeHtml(subModel)}</span></div>` : ''}
      ${trim ? `<div class="m-pd-row"><span class="m-pd-row__label">세부트림</span><span class="m-pd-row__value">${escapeHtml(trim)}</span></div>` : ''}
      ${options ? `<div class="m-pd-row"><span class="m-pd-row__label">선택옵션</span><span class="m-pd-row__value">${escapeHtml(options)}</span></div>` : ''}
      ${fuel || year || mileage ? `<div class="m-pd-row"><span class="m-pd-row__label">제원</span><span class="m-pd-row__value">${[fuel, year && year + '년', mileage].filter(Boolean).map(escapeHtml).join(' · ')}</span></div>` : ''}
      ${colors ? `<div class="m-pd-row"><span class="m-pd-row__label">색상</span><span class="m-pd-row__value">${escapeHtml(colors)}</span></div>` : ''}
    </div>

    ${priceRows ? `<div class="m-pd-section">
      <div class="m-pd-section__head">
        <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        기간별 대여료/보증금
      </div>
      <table class="m-pd-price-table"><thead><tr><th>기간</th><th>월 대여료</th><th>보증금</th></tr></thead><tbody>${priceRows}</tbody></table>
    </div>` : ''}
  `;

  // 갤러리 네비
  $content.querySelector('#m-pd-prev')?.addEventListener('click', () => {
    const photos = (Array.isArray(p.image_urls) && p.image_urls.length ? p.image_urls : null) || (p.image_url ? [p.image_url] : []);
    activePhotoIndex = (activePhotoIndex - 1 + photos.length) % photos.length;
    render(p);
  });
  $content.querySelector('#m-pd-next')?.addEventListener('click', () => {
    const photos = (Array.isArray(p.image_urls) && p.image_urls.length ? p.image_urls : null) || (p.image_url ? [p.image_url] : []);
    activePhotoIndex = (activePhotoIndex + 1) % photos.length;
    render(p);
  });
}

$back?.addEventListener('click', () => {
  if (history.length > 1) history.back();
  else location.href = '/product-list';
});

(async () => {
  try {
    await requireAuth();
    watchProducts((products) => {
      allProducts = products;
      currentProduct = products.find(p => p.product_uid === productId || p.product_code === productId);
      render(currentProduct);
    });
  } catch (e) {
    console.error('[mobile/product-detail] init failed', e);
  }
})();
