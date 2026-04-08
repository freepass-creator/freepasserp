/**
 * shared/mobile-product-detail-markup.js
 *
 * 모바일 상품 상세(.m-pd) 마크업을 생성하는 순수 함수 모음.
 * mobile/product-detail.js 와 pages/catalog.js 가 같이 사용한다.
 *
 * 사용 예:
 *   import { renderMobileProductDetail } from '../shared/mobile-product-detail-markup.js';
 *   container.innerHTML = renderMobileProductDetail(product, {
 *     policy,
 *     activePhotoIndex: 0,
 *     showFee: false,        // 카탈로그(공개)에선 수수료 숨김
 *     showProductMeta: true, // 상품 등록 정보
 *     showProvider: true,    // 공급사 정보
 *   });
 */
import { escapeHtml } from '../core/management-format.js';

/* ── 아이콘 (Lucide, stroke 2) ─────────────────────── */
const SVG = (paths) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
export const ICO = {
  car:    SVG('<path d="M21 8 17.65 2.65A2 2 0 0 0 15.94 2H8.06a2 2 0 0 0-1.71 1.65L3 8"/><path d="M7 10h0"/><path d="M17 10h0"/><rect width="18" height="13" x="3" y="8" rx="2"/><path d="M5 21v-2"/><path d="M19 21v-2"/>'),
  money:  SVG('<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>'),
  table:  SVG('<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>'),
  shield: SVG('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>'),
  doc:    SVG('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>'),
  info:   SVG('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
  fee:    SVG('<line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>'),
  card:   SVG('<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>'),
  gauge:  SVG('<path d="M12 13v8"/><path d="M12 3v3"/><path d="M4 6a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z"/>'),
  user:   SVG('<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>'),
  truck:  SVG('<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>'),
  check:  SVG('<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>'),
  pkg:    SVG('<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7"/><path d="m7.5 4.27 9 5.15"/>'),
  tag:    SVG('<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>'),
  bldg:   SVG('<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>'),
};

/* ── 유틸 ─────────────────────────────────────────── */
const has = (v) => v !== null && v !== undefined && String(v).trim() && String(v).trim() !== '-';
const dash = (v) => has(v) ? String(v) : '-';

function colorToHex(name) {
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
function isLightColor(hex) {
  if (!hex) return true;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}
function colorBadge(name) {
  if (!has(name)) return '';
  const hex = colorToHex(name);
  const fg = isLightColor(hex) ? '#0f172a' : '#fff';
  return `<span class="m-pd-color" style="background:${hex};color:${fg}">${escapeHtml(name)}</span>`;
}
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
  return `<div class="m-pd-kv">${rows.map(([k, v, sub, raw]) => `
    <div class="m-pd-kv__row">
      <span class="m-pd-kv__key">${escapeHtml(k)}</span>
      <span class="m-pd-kv__val${has(v) ? '' : ' m-pd-kv__val--empty'}">${raw ? v : escapeHtml(dash(v))}${sub ? `<span class="m-pd-kv__sub">${escapeHtml(sub)}</span>` : ''}</span>
    </div>
  `).join('')}</div>`;
}

/* ─── 1. 갤러리 ───────────────────────────────────── */
export function renderGallery(p, activePhotoIndex = 0) {
  const photos = (Array.isArray(p.image_urls) && p.image_urls.length ? p.image_urls : null) || (p.image_url ? [p.image_url] : []);
  if (!photos.length) {
    return `<div class="m-pd-gallery m-pd-gallery--empty">사진이 등록되지 않았습니다</div>`;
  }
  const idx = Math.min(activePhotoIndex, photos.length - 1);
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
    ${counter}
    ${navs}
    ${dots}
  </div>`;
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

/* ─── 2. 차량 정보 그룹 ────────────────────────────── */
export function renderVehicleGroup(p) {
  const maker = p.maker || '';
  const model = p.model_name || '';
  const carNo = p.car_number || '';
  const subModel = p.sub_model || '';
  const trim = p.trim_name || '';
  const fuel = p.fuel_type || '';
  const yearRaw = String(p.year || '').trim();
  const year = yearRaw ? `${yearRaw.slice(-2)}년식` : '';
  const mileage = p.mileage ? `${Number(p.mileage).toLocaleString('ko-KR')}km` : '';
  const ext = p.ext_color || '';
  const intc = p.int_color || '';
  const colorBadges = (has(ext) || has(intc)) ? `${colorBadge(ext)}${colorBadge(intc)}` : '';
  const optsRaw = p.options || p.option_summary || '';
  const opts = has(optsRaw) ? String(optsRaw).split(/[,/·•|\n]/).map(s => s.trim()).filter(Boolean) : [];

  return `<section class="m-pd-group">
    ${groupHead(ICO.car, '차량 정보')}
    <div class="m-pd-group__body">
    <div class="m-pd-vinfo">
      <div class="m-pd-vinfo__row m-pd-vinfo__row--head">
        <div class="m-pd-vinfo__head-title">
          ${[maker, model].filter(has).map(escapeHtml).join(' ')}
          ${has(carNo) ? `<span class="m-pd-vinfo__head-sub">${escapeHtml(carNo)}</span>` : ''}
        </div>
        <div class="m-pd-vinfo__head-badges">
          ${has(p.vehicle_status) ? `<span class="m-pd-badge m-pd-badge--${statusTone(p.vehicle_status)}">${escapeHtml(p.vehicle_status)}</span>` : ''}
          ${has(p.product_type)   ? `<span class="m-pd-badge m-pd-badge--${typeTone(p.product_type)}">${escapeHtml(p.product_type)}</span>` : ''}
        </div>
      </div>
      <div class="m-pd-vinfo__row m-pd-vinfo__row--inline">
        <div class="m-pd-vinfo__label">세부모델</div>
        <div class="m-pd-vinfo__value">${escapeHtml(dash(subModel))}</div>
      </div>
      <div class="m-pd-vinfo__row m-pd-vinfo__row--inline">
        <div class="m-pd-vinfo__label">세부트림</div>
        <div class="m-pd-vinfo__value">${escapeHtml(dash(trim))}</div>
      </div>
      <div class="m-pd-vinfo__row m-pd-vinfo__row--stack">
        <div class="m-pd-vinfo__label">선택 옵션</div>
        <div class="m-pd-vinfo__value m-pd-vinfo__value--block">${opts.length ? escapeHtml(opts.join(', ')) : '-'}</div>
      </div>
      <div class="m-pd-vinfo__row m-pd-vinfo__row--grid2">
        <div class="m-pd-vinfo__cell">
          <div class="m-pd-vinfo__label">연식</div>
          <div class="m-pd-vinfo__value">${escapeHtml(dash(year))}</div>
        </div>
        <div class="m-pd-vinfo__cell">
          <div class="m-pd-vinfo__label">주행거리</div>
          <div class="m-pd-vinfo__value">${escapeHtml(dash(mileage))}</div>
        </div>
        <div class="m-pd-vinfo__cell">
          <div class="m-pd-vinfo__label">연료</div>
          <div class="m-pd-vinfo__value">${escapeHtml(dash(fuel))}</div>
        </div>
        <div class="m-pd-vinfo__cell">
          <div class="m-pd-vinfo__label">색상 (외 / 내)</div>
          <div class="m-pd-vinfo__value">${colorBadges || '-'}</div>
        </div>
      </div>
    </div>
    </div>
  </section>`;
}

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

export function renderPrice(p) {
  const rows = getPriceRows(p);
  if (!rows.length) {
    return `<section class="m-pd-group">
      ${groupHead(ICO.money, '대여료')}
      <div class="m-pd-group__body"><div class="m-pd-empty">등록된 대여료가 없습니다</div></div>
    </section>`;
  }
  const sorted = [...rows].sort((a, b) => a.rent - b.rent);
  return `<section class="m-pd-group">
    ${groupHead(ICO.money, '대여료')}
    <div class="m-pd-group__body">
    <div class="m-pd-price-table">
      <div class="m-pd-price-table__th">
        <span>기간</span><span>월 대여료</span><span>보증금</span>
      </div>
      ${sorted.map((r, i) => `<div class="m-pd-price-table__row${i === 0 ? ' is-cheapest' : ''}">
        <span>${r.m}개월</span>
        <strong>${fmtKRW(r.rent)}원</strong>
        <span>${r.deposit ? fmtKRW(r.deposit) + '원' : '-'}</span>
      </div>`).join('')}
    </div>
    </div>
  </section>`;
}

export function findPolicy(p, policies) {
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

function formatDeductible(v) {
  if (!has(v)) return '-';
  const cleaned = String(v).replace(/\s*최[대소]\s*/g, '').trim();
  const parts = cleaned.split(/\s*,\s*/).filter(Boolean);
  return parts.map(escapeHtml).join('<br>');
}

export function renderInsurance(p, policy) {
  const src = { ...(policy || {}), ...p };
  const pick = (...keys) => {
    for (const k of keys) if (has(src[k])) return src[k];
    return '';
  };
  const items = [
    ['대인 배상',     pick('injury_compensation_limit', 'injury_limit_deductible'),     pick('injury_deductible')],
    ['대물 배상',     pick('property_compensation_limit', 'property_limit_deductible'), pick('property_deductible')],
    ['자기 신체사고', pick('self_body_accident', 'personal_injury_limit_deductible'),   pick('self_body_deductible')],
    ['무보험차 상해', pick('uninsured_damage', 'uninsured_limit_deductible'),           pick('uninsured_deductible')],
    ['자기차량 손해', pick('own_damage_compensation', 'own_damage_limit_deductible'),   pick('own_damage_min_deductible')],
  ];
  const roadside = pick('annual_roadside_assistance', 'roadside_assistance');

  return `<section class="m-pd-group">
    ${groupHead(ICO.shield, '보험 상세')}
    <div class="m-pd-group__body">
    <div class="m-pd-tbl">
      <div class="m-pd-tbl__th">
        <span>구분</span><span>보장한도</span><span>면책금</span>
      </div>
      ${items.map(([k, limit, ded]) => `<div class="m-pd-tbl__row">
        <span>${escapeHtml(k)}</span>
        <strong>${escapeHtml(dash(limit))}</strong>
        <span>${formatDeductible(ded)}</span>
      </div>`).join('')}
      <div class="m-pd-tbl__row m-pd-tbl__row--single">
        <span>긴급출동</span>
        <strong class="m-pd-tbl__span2">${escapeHtml(dash(roadside))}</strong>
      </div>
    </div>
    </div>
  </section>`;
}

export function renderPayment(policy) {
  const t = policy || {};
  return `<section class="m-pd-group">
    ${groupHead(ICO.card, '결제·보증금')}
    <div class="m-pd-group__body">${kvList([
      ['보험포함',       t.insurance_included],
      ['결제방식',       t.payment_method],
      ['보증금분납',     t.deposit_installment],
      ['보증금카드결제', t.deposit_card_payment],
    ])}</div>
  </section>`;
}

export function renderMileage(policy) {
  const t = policy || {};
  return `<section class="m-pd-group">
    ${groupHead(ICO.gauge, '주행거리')}
    <div class="m-pd-group__body">${kvList([
      ['연주행거리',     t.annual_mileage],
      ['1만km 추가비용', t.mileage_upcharge_per_10000km],
    ])}</div>
  </section>`;
}

export function renderDriver(policy) {
  const t = policy || {};
  return `<section class="m-pd-group">
    ${groupHead(ICO.user, '운전자·연령')}
    <div class="m-pd-group__body">${kvList([
      ['기본운전연령',   t.basic_driver_age],
      ['연령하향',       t.driver_age_lowering],
      ['연령하향비용',   t.age_lowering_cost],
      ['추가운전자',     t.additional_driver_allowance_count],
      ['추가운전자비용', t.additional_driver_cost],
      ['개인운전범위',   t.personal_driver_scope],
      ['사업자운전범위', t.business_driver_scope],
    ])}</div>
  </section>`;
}

export function renderService(policy) {
  const t = policy || {};
  return `<section class="m-pd-group">
    ${groupHead(ICO.truck, '부가 서비스')}
    <div class="m-pd-group__body">${kvList([
      ['대여지역', t.rental_region],
      ['탁송비',   t.delivery_fee],
      ['긴급출동', t.annual_roadside_assistance || t.roadside_assistance],
    ])}</div>
  </section>`;
}

export function renderScreening(policy) {
  const t = policy || {};
  return `<section class="m-pd-group">
    ${groupHead(ICO.check, '심사·신용')}
    <div class="m-pd-group__body">${kvList([
      ['심사기준', t.screening_criteria],
      ['신용등급', t.credit_grade],
    ])}</div>
  </section>`;
}

export function renderFee(p, policies) {
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
  const clawback = findPolicy(p, policies)?.commission_clawback_condition || '';
  return `<section class="m-pd-group">
    ${groupHead(ICO.fee, '수수료 안내')}
    <div class="m-pd-group__body">${kvList([
      ...rows.map(r => [`${r.m}개월`, `${r.fee.toLocaleString('ko-KR')}원`]),
      ...(has(clawback) ? [['환수조건', clawback]] : []),
    ])}</div>
  </section>`;
}

export function renderProductMeta(p) {
  return `<section class="m-pd-group">
    ${groupHead(ICO.pkg, '상품 등록')}
    <div class="m-pd-group__body">${kvList([
      ['상품코드',   p.product_code],
      ['상품유형',   p.product_type],
      ['차량상태',   p.vehicle_status],
      ['차종',       p.vehicle_class],
      ['최초등록일', p.first_registration_date],
      ['차령만료일', p.vehicle_age_expiry_date],
    ])}</div>
  </section>`;
}

export function renderVehiclePrice(p) {
  return `<section class="m-pd-group">
    ${groupHead(ICO.tag, '차량 가격')}
    <div class="m-pd-group__body">${kvList([
      ['차량가격', p.vehicle_price ? fmtKRW(p.vehicle_price) + '원' : ''],
      ['가격기준', p.pricing_basis],
      ['인수방식', p.buyout_method || p.pricing_comment],
    ])}</div>
  </section>`;
}

export function renderProvider(p) {
  return `<section class="m-pd-group">
    ${groupHead(ICO.bldg, '공급사')}
    <div class="m-pd-group__body">${kvList([
      ['공급사명',   p.provider_name || p.partner_name],
      ['공급사 메모', p.partner_memo || p.note],
    ])}</div>
  </section>`;
}

/* ─── 종합 렌더러 ─────────────────────────────────── */
export function renderMobileProductDetail(p, opts = {}) {
  const {
    policies = [],
    activePhotoIndex = 0,
    showGallery = true,
    showPrice = true,
    showInsurance = true,
    showPayment = true,
    showMileage = true,
    showDriver = true,
    showService = true,
    showScreening = true,
    showProductMeta = true,
    showVehiclePrice = true,
    showProvider = true,
    showFee = true,
  } = opts;
  const policy = findPolicy(p, policies);
  return `
    ${showGallery ? renderGallery(p, activePhotoIndex) : ''}
    ${renderVehicleGroup(p)}
    ${showPrice ? renderPrice(p) : ''}
    ${showInsurance ? renderInsurance(p, policy) : ''}
    ${showPayment ? renderPayment(policy) : ''}
    ${showMileage ? renderMileage(policy) : ''}
    ${showDriver ? renderDriver(policy) : ''}
    ${showService ? renderService(policy) : ''}
    ${showScreening ? renderScreening(policy) : ''}
    ${showProductMeta ? renderProductMeta(p) : ''}
    ${showVehiclePrice ? renderVehiclePrice(p) : ''}
    ${showProvider ? renderProvider(p) : ''}
    ${showFee ? renderFee(p, policies) : ''}
  `;
}
