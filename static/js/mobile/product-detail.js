/**
 * mobile/product-detail.js — 모바일 상품 상세 (그룹 구성)
 *
 * 1. 갤러리
 * 2. 차량 정보 (제조사·모델·차량번호·세부·트림·옵션·연료·연식·주행·색상)
 * 3. 가격 요약 (최저 대여료·보증금·기간)
 * 4. 대여료 상세 (전체 기간 표)
 * 5. 보험 상세
 * 6. 대여조건 상세
 * 7. 추가 정보
 */
import { requireAuth } from '../core/auth-guard.js';
import { watchProducts, watchTerms } from '../firebase/firebase-db.js';
import { escapeHtml } from '../core/management-format.js';

const $content = document.getElementById('m-pd-content');
const $back = document.getElementById('m-back-btn');

const pathParts = location.pathname.split('/').filter(Boolean);
const productId = decodeURIComponent(pathParts[pathParts.length - 1] || '');

let activePhotoIndex = 0;
let currentProduct = null;
let allPolicies = [];

/* ── 아이콘 (Lucide style — 1.5 stroke) ──────────── */
const SVG = (paths) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const ICO = {
  // car-front (lucide)
  car:    SVG('<path d="M21 8 17.65 2.65A2 2 0 0 0 15.94 2H8.06a2 2 0 0 0-1.71 1.65L3 8"/><path d="M7 10h0"/><path d="M17 10h0"/><rect width="18" height="13" x="3" y="8" rx="2"/><path d="M5 21v-2"/><path d="M19 21v-2"/>'),
  // wallet
  money:  SVG('<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>'),
  // table
  table:  SVG('<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>'),
  // shield-check
  shield: SVG('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>'),
  // file-text
  doc:    SVG('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>'),
  // info
  info:   SVG('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
  // percent
  fee:    SVG('<line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>'),
  // credit-card
  card:   SVG('<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>'),
  // gauge
  gauge:  SVG('<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>'),
  // user-round
  user:   SVG('<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>'),
  // truck
  truck:  SVG('<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>'),
  // clipboard-check
  check:  SVG('<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>'),
  // package
  pkg:    SVG('<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7"/><path d="m7.5 4.27 9 5.15"/>'),
  // tag
  tag:    SVG('<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>'),
  // building
  bldg:   SVG('<rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>'),
};

/* ── 유틸 ──────────────────────────────────────────── */
const has = (v) => v !== null && v !== undefined && String(v).trim() && String(v).trim() !== '-';
const dash = (v) => has(v) ? String(v) : '-';
const fmtKRW = (v) => {
  const n = Number(v || 0);
  return n ? n.toLocaleString('ko-KR') : '0';
};

function groupHead(icon, title, count) {
  return `<div class="m-pd-group__head">
    <div class="m-pd-group__icon">${icon}</div>
    <div class="m-pd-group__title">${title}</div>
    ${count != null ? `<div class="m-pd-group__count">${count}</div>` : ''}
  </div>`;
}

function kvList(rows) {
  return `<div class="m-pd-kv">${rows.map(([k, v, sub]) => `
    <div class="m-pd-kv__row">
      <span class="m-pd-kv__key">${escapeHtml(k)}</span>
      <span class="m-pd-kv__val${has(v) ? '' : ' m-pd-kv__val--empty'}">${escapeHtml(dash(v))}${sub ? `<span class="m-pd-kv__sub">${escapeHtml(sub)}</span>` : ''}</span>
    </div>
  `).join('')}</div>`;
}

/* ─── 1. 갤러리 ───────────────────────────────────── */
function renderGallery(p) {
  const photos = (Array.isArray(p.image_urls) && p.image_urls.length ? p.image_urls : null) || (p.image_url ? [p.image_url] : []);
  if (!photos.length) {
    return `<div class="m-pd-gallery m-pd-gallery--empty">사진이 등록되지 않았습니다</div>`;
  }
  const idx = Math.min(activePhotoIndex, photos.length - 1);
  // 차량상태 색상
  const statusTone = (v) => {
    const s = String(v || '').trim();
    if (/출고가능|즉시출고/.test(s)) return 'success';
    if (/출고불가|정비중|사고/.test(s)) return 'danger';
    if (/예약|대기/.test(s)) return 'warn';
    return 'neutral';
  };
  // 상품구분 색상
  const typeTone = (v) => {
    const s = String(v || '').trim();
    if (/신차/.test(s)) return 'info';
    if (/중고/.test(s)) return 'warn';
    if (/리스/.test(s)) return 'purple';
    if (/렌트/.test(s)) return 'info';
    return 'neutral';
  };
  const badges = [
    has(p.vehicle_status) ? `<span class="m-pd-gallery__badge m-pd-gallery__badge--${statusTone(p.vehicle_status)}">${escapeHtml(p.vehicle_status)}</span>` : '',
    has(p.product_type)   ? `<span class="m-pd-gallery__badge m-pd-gallery__badge--${typeTone(p.product_type)}">${escapeHtml(p.product_type)}</span>` : '',
  ].join('');
  const counter = photos.length > 1 ? `<div class="m-pd-gallery__counter">${idx + 1} / ${photos.length}</div>` : '';
  const navs = photos.length > 1 ? `
    <button class="m-pd-gallery__nav m-pd-gallery__nav--prev" id="m-pd-prev" type="button" aria-label="이전"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
    <button class="m-pd-gallery__nav m-pd-gallery__nav--next" id="m-pd-next" type="button" aria-label="다음"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
  ` : '';
  const dots = photos.length > 1
    ? `<div class="m-pd-gallery__dots">${photos.map((_, i) => `<span class="m-pd-gallery__dot${i === idx ? ' is-active' : ''}"></span>`).join('')}</div>`
    : '';

  return `<div class="m-pd-gallery">
    <img src="${escapeHtml(photos[idx])}" alt="">
    ${badges ? `<div class="m-pd-gallery__badges">${badges}</div>` : ''}
    ${counter}
    ${navs}
    ${dots}
  </div>`;
}

/* ─── 2. 차량 정보 그룹 ────────────────────────────── */
function renderVehicleGroup(p) {
  const maker = p.maker || '';
  const model = p.model_name || '';
  const carNo = p.car_number || '';
  const subModel = p.sub_model || '';
  const trim = p.trim_name || '';
  const fuel = p.fuel_type || '';
  const year = p.year || '';
  const mileage = p.mileage ? `${(Number(p.mileage) / 10000).toFixed(1)}만km` : '';
  const ext = p.ext_color || '';
  const intc = p.int_color || '';
  const color = (has(ext) || has(intc)) ? `${dash(ext)} / ${dash(intc)}` : '';

  const optsRaw = p.options || p.option_summary || '';
  const opts = has(optsRaw) ? String(optsRaw).split(/[,/·•|\n]/).map(s => s.trim()).filter(Boolean) : [];

  return `<section class="m-pd-group">
    ${groupHead(ICO.car, '차량 정보')}

    <!-- ① 제조사 모델 차량번호 (한 줄) -->
    <div class="m-pd-vh">
      <span class="m-pd-vh__title">${escapeHtml(dash([maker, model].filter(Boolean).join(' ')))}</span>
      <span class="m-pd-vh__carno">${escapeHtml(dash(carNo))}</span>
    </div>

    <!-- ② 세부모델 / 세부트림 / 제원 -->
    ${kvList([
      ['세부모델',  subModel],
      ['세부트림',  trim],
      ['연식',      year ? `${year}년` : ''],
      ['주행거리',  mileage],
      ['연료',      fuel],
      ['외장/내장', color],
    ])}

    <!-- ③ 선택 옵션 -->
    <div class="m-pd-block">
      <div class="m-pd-block__label">선택 옵션</div>
      <div class="m-pd-options">${opts.length ? opts.map(escapeHtml).join(', ') : '-'}</div>
    </div>
  </section>`;
}

/* ─── 가격 데이터 추출 (재고입력칸 6개) ───────────── */
function getPriceRows(p) {
  const months = [1, 12, 24, 36, 48, 60];
  const num = (v) => {
    const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const price = (p && p.price) || {};
  return months.map(m => {
    const slot = price[m] || price[String(m)] || {};
    let rent = num(slot.rent);
    let deposit = num(slot.deposit);
    if (!rent && m === 48) rent = num(p.rental_price_48) || num(p.rental_price);
    if (!rent && m === 60) rent = num(p.rental_price_60);
    if (!deposit && m === 48) deposit = num(p.deposit_48) || num(p.deposit);
    if (!deposit && m === 60) deposit = num(p.deposit_60);
    return { m, rent, deposit };
  }).filter(r => r.rent > 0);
}

/* ─── 3. 대여료 (요약 + 표 한 섹션) ───────────────── */
function renderPrice(p) {
  const rows = getPriceRows(p);
  if (!rows.length) {
    return `<section class="m-pd-group">
      ${groupHead(ICO.money, '대여료')}
      <div class="m-pd-empty">등록된 대여료가 없습니다</div>
    </section>`;
  }
  const cheapest = rows.reduce((a, b) => (a.rent <= b.rent ? a : b));
  return `<section class="m-pd-group">
    ${groupHead(ICO.money, '대여료')}
    <div class="m-pd-price-hero">
      <div class="m-pd-price-hero__label">${cheapest.m}개월 약정 기준 · 최저가</div>
      <div class="m-pd-price-hero__row">
        <div class="m-pd-price-hero__amount">월 ${fmtKRW(cheapest.rent)}<span class="m-pd-price-hero__amount-suffix">원~</span></div>
        ${cheapest.deposit ? `<div class="m-pd-price-hero__deposit">보증금 ${fmtKRW(cheapest.deposit)}원</div>` : ''}
      </div>
    </div>
    <div class="m-pd-price-table">
      <div class="m-pd-price-table__th">
        <span>기간</span><span>월 대여료</span><span>보증금</span>
      </div>
      ${rows.map(r => `<div class="m-pd-price-table__row${r.m === cheapest.m ? ' is-cheapest' : ''}">
        <span>${r.m}개월</span>
        <strong>${fmtKRW(r.rent)}원</strong>
        <span>${r.deposit ? fmtKRW(r.deposit) + '원' : '-'}</span>
      </div>`).join('')}
    </div>
  </section>`;
}

/* ─── 정책 매칭 ──────────────────────────────────── */
function findPolicy(p, policies) {
  if (!p || !Array.isArray(policies) || !policies.length) return null;
  const termCode = String(p.term_code || p.policy_code || '').trim();
  const termName = String(p.term_name || '').trim();
  const provider = String(p.provider_company_code || p.partner_code || '').trim();
  return (
    (termCode && policies.find(t => String(t.term_code || '').trim() === termCode)) ||
    (termName && policies.find(t => String(t.term_name || '').trim() === termName)) ||
    (provider && policies.find(t => String(t.provider_company_code || '').trim() === provider)) ||
    null
  );
}

/* ─── 5. 보험 상세 ───────────────────────────────── */
function renderInsurance(p, policy) {
  const src = { ...(policy || {}), ...p };
  const pick = (...keys) => {
    for (const k of keys) if (has(src[k])) return src[k];
    return '';
  };
  const items = [
    ['대인 배상',      pick('injury_compensation_limit', 'injury_limit_deductible'),     pick('injury_deductible')],
    ['대물 배상',      pick('property_compensation_limit', 'property_limit_deductible'), pick('property_deductible')],
    ['자기 신체사고',  pick('self_body_accident', 'personal_injury_limit_deductible'),   pick('self_body_deductible')],
    ['무보험차 상해',  pick('uninsured_damage', 'uninsured_limit_deductible'),           pick('uninsured_deductible')],
    ['자기차량 손해',  pick('own_damage_compensation', 'own_damage_limit_deductible'),   pick('own_damage_min_deductible')],
  ];

  return `<section class="m-pd-group">
    ${groupHead(ICO.shield, '보험 상세')}
    <div class="m-pd-tbl">
      <div class="m-pd-tbl__th">
        <span>구분</span><span>보장한도</span><span>면책금</span>
      </div>
      ${items.map(([k, limit, ded]) => `<div class="m-pd-tbl__row">
        <span>${escapeHtml(k)}</span>
        <strong>${escapeHtml(dash(limit))}</strong>
        <span>${escapeHtml(dash(ded))}</span>
      </div>`).join('')}
    </div>
  </section>`;
}

/* ─── 6. 대여 조건 (5개 섹션으로 분할) ───────────── */
function renderPayment(policy) {
  const t = policy || {};
  return `<section class="m-pd-group">
    ${groupHead(ICO.card, '결제·보증금')}
    ${kvList([
      ['보험포함',       t.insurance_included],
      ['결제방식',       t.payment_method],
      ['보증금분납',     t.deposit_installment],
      ['보증금카드결제', t.deposit_card_payment],
    ])}
  </section>`;
}

function renderMileage(policy) {
  const t = policy || {};
  return `<section class="m-pd-group">
    ${groupHead(ICO.gauge, '주행거리')}
    ${kvList([
      ['연주행거리',     t.annual_mileage],
      ['1만km 추가비용', t.mileage_upcharge_per_10000km],
    ])}
  </section>`;
}

function renderDriver(policy) {
  const t = policy || {};
  return `<section class="m-pd-group">
    ${groupHead(ICO.user, '운전자·연령')}
    ${kvList([
      ['기본운전연령',   t.basic_driver_age],
      ['연령하향',       t.driver_age_lowering],
      ['연령하향비용',   t.age_lowering_cost],
      ['추가운전자',     t.additional_driver_allowance_count],
      ['추가운전자비용', t.additional_driver_cost],
      ['개인운전범위',   t.personal_driver_scope],
      ['사업자운전범위', t.business_driver_scope],
    ])}
  </section>`;
}

function renderService(policy) {
  const t = policy || {};
  return `<section class="m-pd-group">
    ${groupHead(ICO.truck, '부가 서비스')}
    ${kvList([
      ['대여지역', t.rental_region],
      ['탁송비',   t.delivery_fee],
      ['긴급출동', t.annual_roadside_assistance || t.roadside_assistance],
    ])}
  </section>`;
}

function renderScreening(policy) {
  const t = policy || {};
  return `<section class="m-pd-group">
    ${groupHead(ICO.check, '심사·신용')}
    ${kvList([
      ['심사기준', t.screening_criteria],
      ['신용등급', t.credit_grade],
    ])}
  </section>`;
}

/* ─── 7. 수수료 안내 (ERP 전용) ──────────────────── */
function renderFee(p) {
  const months = [1, 12, 24, 36, 48, 60];
  const num = (v) => {
    const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const price = (p && p.price) || {};
  const rows = months.map(m => {
    const slot = price[m] || price[String(m)] || {};
    return { m, fee: num(slot.fee) || num(p[`fee_${m}`]) };
  }).filter(r => r.fee > 0);

  if (!rows.length) return '';

  const clawback = findPolicy(p, allPolicies)?.commission_clawback_condition || '';

  return `<section class="m-pd-group">
    ${groupHead(ICO.fee, '수수료 안내')}
    ${kvList([
      ...rows.map(r => [`${r.m}개월`, `${r.fee.toLocaleString('ko-KR')}원`]),
      ...(has(clawback) ? [['환수조건', clawback]] : []),
    ])}
  </section>`;
}

/* ─── 7. 추가 정보 (3개 섹션으로 분할) ───────────── */
function renderProductMeta(p) {
  return `<section class="m-pd-group">
    ${groupHead(ICO.pkg, '상품 등록')}
    ${kvList([
      ['상품코드',   p.product_code],
      ['상품유형',   p.product_type],
      ['차량상태',   p.vehicle_status],
      ['차종',       p.vehicle_class],
      ['최초등록일', p.first_registration_date],
      ['차령만료일', p.vehicle_age_expiry_date],
    ])}
  </section>`;
}

function renderVehiclePrice(p) {
  return `<section class="m-pd-group">
    ${groupHead(ICO.tag, '차량 가격')}
    ${kvList([
      ['차량가격', p.vehicle_price ? fmtKRW(p.vehicle_price) + '원' : ''],
      ['가격기준', p.pricing_basis],
      ['인수방식', p.buyout_method || p.pricing_comment],
    ])}
  </section>`;
}

function renderProvider(p) {
  return `<section class="m-pd-group">
    ${groupHead(ICO.bldg, '공급사')}
    ${kvList([
      ['공급사명',   p.provider_name || p.partner_name],
      ['공급사 메모', p.partner_memo || p.note],
    ])}
  </section>`;
}

/* ─── 메인 렌더 ─────────────────────────────────── */
function render() {
  if (!$content) return;
  const p = currentProduct;
  if (!p) {
    $content.innerHTML = '<div style="padding:48px 16px;text-align:center;color:#8b95a1;">상품을 찾을 수 없습니다</div>';
    return;
  }
  const policy = findPolicy(p, allPolicies);

  $content.innerHTML = `
    ${renderGallery(p)}
    ${renderVehicleGroup(p)}
    ${renderPrice(p)}
    ${renderInsurance(p, policy)}
    ${renderPayment(policy)}
    ${renderMileage(policy)}
    ${renderDriver(policy)}
    ${renderService(policy)}
    ${renderScreening(policy)}
    ${renderProductMeta(p)}
    ${renderVehiclePrice(p)}
    ${renderProvider(p)}
    ${renderFee(p)}
  `;

  // 갤러리 인터랙션
  const photos = (Array.isArray(p.image_urls) && p.image_urls.length ? p.image_urls : null) || (p.image_url ? [p.image_url] : []);
  $content.querySelector('#m-pd-prev')?.addEventListener('click', () => {
    activePhotoIndex = (activePhotoIndex - 1 + photos.length) % photos.length;
    render();
  });
  $content.querySelector('#m-pd-next')?.addEventListener('click', () => {
    activePhotoIndex = (activePhotoIndex + 1) % photos.length;
    render();
  });
}

$back?.addEventListener('click', () => {
  if (history.length > 1) history.back();
  else location.href = '/m/product-list';
});

(async () => {
  try {
    await requireAuth();
    watchProducts((products) => {
      currentProduct = products.find(p => p.product_uid === productId || p.product_code === productId);
      render();
    });
    watchTerms((terms) => {
      allPolicies = Array.isArray(terms) ? terms : [];
      render();
    });
  } catch (e) {
    console.error('[mobile/product-detail] init failed', e);
  }
})();
