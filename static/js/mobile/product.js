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
    const mileage = p.mileage ? Number(p.mileage).toLocaleString('ko-KR') + 'km' : '';
    const ext = p.ext_color || '';
    const intc = p.int_color || '';

    const imgHtml = thumb
      ? `<img class="m-product-card__img" src="${escapeHtml(thumb)}" loading="lazy" alt="">`
      : `<div class="m-product-card__no-img"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;

    return `<article class="m-product-card" data-id="${escapeHtml(p.product_uid || p.product_code || '')}">
      ${imgHtml}
      <div class="m-product-card__body">
        <div style="font-size:13px;font-weight:600;color:var(--m-text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(maker)} ${escapeHtml(model)} <span style="font-size:11px;color:var(--m-text-tertiary);">${escapeHtml(carNo)}</span></div>
        ${subModel ? `<div style="font-size:12px;color:var(--m-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(subModel)}</div>` : ''}
        ${trim ? `<div style="font-size:11px;color:var(--m-text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(trim)}</div>` : ''}
        ${[fuel, year && year + '년', mileage].filter(Boolean).length ? `<div style="font-size:11px;color:var(--m-text-tertiary);margin-top:4px;">${[fuel, year && year + '년', mileage].filter(Boolean).join(' · ')}</div>` : ''}
        ${[ext, intc].filter(v => v && v !== '-').length ? `<div style="font-size:11px;color:var(--m-text-tertiary);">${[ext, intc].filter(v => v && v !== '-').join(' · ')}</div>` : ''}
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
