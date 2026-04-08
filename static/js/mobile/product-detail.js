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
import { watchProducts, watchTerms, ensureRoom } from '../firebase/firebase-db.js';
import { escapeHtml } from '../core/management-format.js';
import { open as openFullscreenViewer } from '../shared/fullscreen-photo-viewer.js';
import { showToast, showConfirm } from '../core/toast.js';
import { renderMobileProductDetail } from '../shared/mobile-product-detail-markup.js';

const $content   = document.getElementById('m-pd-content');
const $back      = document.getElementById('m-back-btn');
const $btnChat   = document.getElementById('m-pd-chat-top');
const $btnContract = document.getElementById('m-pd-contract');
const $btnShare  = document.getElementById('m-pd-share');

const pathParts = location.pathname.split('/').filter(Boolean);
const productId = decodeURIComponent(pathParts[pathParts.length - 1] || '');

let activePhotoIndex = 0;
let currentProduct = null;
let allPolicies = [];
let currentUser = null;
let currentProfile = null;

/* ── 아이콘 (Lucide 정통, stroke 2) ──────────────── */
const SVG = (paths) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const ICO = {
  // car-front
  car:    SVG('<path d="M21 8 17.65 2.65A2 2 0 0 0 15.94 2H8.06a2 2 0 0 0-1.71 1.65L3 8"/><path d="M7 10h0"/><path d="M17 10h0"/><rect width="18" height="13" x="3" y="8" rx="2"/><path d="M5 21v-2"/><path d="M19 21v-2"/>'),
  // banknote
  money:  SVG('<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>'),
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
  // milestone (주행거리 — 도로 표지)
  gauge:  SVG('<path d="M12 13v8"/><path d="M12 3v3"/><path d="M4 6a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z"/>'),
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
  // building-2
  bldg:   SVG('<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>'),
};

/* ── 유틸 ──────────────────────────────────────────── */
const has = (v) => v !== null && v !== undefined && String(v).trim() && String(v).trim() !== '-';
const dash = (v) => has(v) ? String(v) : '-';

// 색상 이름 → hex (어두운 색이면 흰 글자)
function colorToHex(name) {
  const s = String(name || '').toLowerCase().trim();
  if (!s || s === '-') return null;
  const map = [
    [/펄|화이트|흰|white/,    '#f8fafc'],
    [/블랙|검정|black/,        '#0f172a'],
    [/실버|silver/,            '#c0c0c0'],
    [/그레이|회색|gray|grey/,  '#6b7280'],
    [/레드|빨강|red/,          '#ef4444'],
    [/블루|파랑|navy|blue/,    '#1e3a8a'],
    [/그린|초록|green/,        '#16a34a'],
    [/옐로우|노랑|yellow/,     '#eab308'],
    [/오렌지|주황|orange/,     '#f97316'],
    [/브라운|갈색|brown/,      '#7c2d12'],
    [/베이지|beige/,           '#d6c8a8'],
    [/카키|khaki/,             '#78716c'],
    [/와인|버건디|wine/,       '#7f1d1d'],
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

function box(content) {
  return `<div class="m-pd-group__body">${content}</div>`;
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
function renderGallery(p) {
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

/* 차량상태/상품구분 → 톤 클래스 */
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
function renderVehicleGroup(p) {
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
  const colorBadges = (has(ext) || has(intc))
    ? `${colorBadge(ext)}${colorBadge(intc)}`
    : '';

  const optsRaw = p.options || p.option_summary || '';
  const opts = has(optsRaw) ? String(optsRaw).split(/[,/·•|\n]/).map(s => s.trim()).filter(Boolean) : [];

  return `<section class="m-pd-group">
    ${groupHead(ICO.car, '차량 정보')}
    <div class="m-pd-group__body">
    <div class="m-pd-vinfo">
      <!-- 제조사 / 모델 / 차량번호(보조) + 우측 뱃지 -->
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
      <!-- 세부모델 (좌우) -->
      <div class="m-pd-vinfo__row m-pd-vinfo__row--inline">
        <div class="m-pd-vinfo__label">세부모델</div>
        <div class="m-pd-vinfo__value">${escapeHtml(dash(subModel))}</div>
      </div>
      <!-- 세부트림 (좌우) -->
      <div class="m-pd-vinfo__row m-pd-vinfo__row--inline">
        <div class="m-pd-vinfo__label">세부트림</div>
        <div class="m-pd-vinfo__value">${escapeHtml(dash(trim))}</div>
      </div>
      <!-- 선택 옵션 (상하, 큼지막) -->
      <div class="m-pd-vinfo__row m-pd-vinfo__row--stack">
        <div class="m-pd-vinfo__label">선택 옵션</div>
        <div class="m-pd-vinfo__value m-pd-vinfo__value--block">${opts.length ? escapeHtml(opts.join(', ')) : '-'}</div>
      </div>
      <!-- 2x2 그리드: 연식·주행거리 / 연료·색상 -->
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

/* ─── 3. 대여료 (싼 순으로 정렬된 표 한 개) ───────── */
function renderPrice(p) {
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
// 면책금 포맷: 콤마로 줄바꿈, 최대/최소 제거
function formatDeductible(v) {
  if (!has(v)) return '-';
  const cleaned = String(v).replace(/\s*최[대소]\s*/g, '').trim();
  const parts = cleaned.split(/\s*,\s*/).filter(Boolean);
  return parts.map(escapeHtml).join('<br>');
}

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

/* ─── 6. 대여 조건 (5개 섹션으로 분할) ───────────── */
function renderPayment(policy) {
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

function renderMileage(policy) {
  const t = policy || {};
  return `<section class="m-pd-group">
    ${groupHead(ICO.gauge, '주행거리')}
    <div class="m-pd-group__body">${kvList([
      ['연주행거리',     t.annual_mileage],
      ['1만km 추가비용', t.mileage_upcharge_per_10000km],
    ])}</div>
  </section>`;
}

function renderDriver(policy) {
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

function renderService(policy) {
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

function renderScreening(policy) {
  const t = policy || {};
  return `<section class="m-pd-group">
    ${groupHead(ICO.check, '심사·신용')}
    <div class="m-pd-group__body">${kvList([
      ['심사기준', t.screening_criteria],
      ['신용등급', t.credit_grade],
    ])}</div>
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
    <div class="m-pd-group__body">${kvList([
      ...rows.map(r => [`${r.m}개월`, `${r.fee.toLocaleString('ko-KR')}원`]),
      ...(has(clawback) ? [['환수조건', clawback]] : []),
    ])}</div>
  </section>`;
}

/* ─── 7. 추가 정보 (3개 섹션으로 분할) ───────────── */
function renderProductMeta(p) {
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

function renderVehiclePrice(p) {
  return `<section class="m-pd-group">
    ${groupHead(ICO.tag, '차량 가격')}
    <div class="m-pd-group__body">${kvList([
      ['차량가격', p.vehicle_price ? fmtKRW(p.vehicle_price) + '원' : ''],
      ['가격기준', p.pricing_basis],
      ['인수방식', p.buyout_method || p.pricing_comment],
    ])}</div>
  </section>`;
}

function renderProvider(p) {
  return `<section class="m-pd-group">
    ${groupHead(ICO.bldg, '공급사')}
    <div class="m-pd-group__body">${kvList([
      ['공급사명',   p.provider_name || p.partner_name],
      ['공급사 메모', p.partner_memo || p.note],
    ])}</div>
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
  // 상단바 타이틀: 차량번호 세부모델명
  const $title = document.getElementById('m-pd-title');
  if ($title) {
    const carNo = p.car_number || '';
    const subModel = p.sub_model || '';
    $title.textContent = [carNo, subModel].filter(Boolean).join(' ') || '상품';
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
  // ⚡ 모든 사진 백그라운드 preload — 풀스크린 뷰어 진입 시 즉시 표시
  if (!window.__pdPreloadedFor || window.__pdPreloadedFor !== productId) {
    window.__pdPreloadedFor = productId;
    photos.forEach((url) => {
      if (!url) return;
      const img = new Image();
      img.decoding = 'async';
      img.loading = 'eager';
      img.src = url;
    });
  }
  $content.querySelector('#m-pd-prev')?.addEventListener('click', () => {
    activePhotoIndex = (activePhotoIndex - 1 + photos.length) % photos.length;
    render();
  });
  $content.querySelector('#m-pd-next')?.addEventListener('click', () => {
    activePhotoIndex = (activePhotoIndex + 1) % photos.length;
    render();
  });

  // 사진 클릭 → 풀스크린 세로 스크롤 뷰어
  const $img = $content.querySelector('.m-pd-gallery img');
  if ($img && photos.length) {
    $img.style.cursor = 'zoom-in';
    $img.addEventListener('click', (e) => {
      // 좌우 nav 버튼 클릭은 제외
      if (e.target.closest('.m-pd-gallery__nav')) return;
      openFullscreenViewer(photos, activePhotoIndex);
    });
  }
}

$back?.addEventListener('click', () => {
  if (history.length > 1) history.back();
  else location.href = '/m/product-list';
});

// ─── 액션: 문의(채팅) ────────────────────────────────────────────────────
$btnChat?.addEventListener('click', async (e) => {
  e.preventDefault();
  if (!currentProduct) { showToast('상품 정보를 불러오는 중입니다', 'info'); return; }
  if (currentProfile?.role !== 'agent') { showToast('영업자만 문의할 수 있습니다', 'error'); return; }
  const ok = await showConfirm('이 상품에 대해 문의를 시작하시겠습니까?');
  if (!ok) return;
  $btnChat.disabled = true;
  try {
    const p = currentProduct;
    const roomId = await ensureRoom({
      productUid: p.product_uid || '',
      productCode: p.product_code || p.product_uid || '',
      providerUid: p.provider_uid || '',
      providerCompanyCode: p.provider_company_code || p.partner_code || '',
      providerName: p.provider_name || '',
      agentUid: currentUser?.uid || '',
      agentCode: currentProfile?.user_code || '',
      agentName: currentProfile?.name || '',
      vehicleNumber: p.car_number || '',
      modelName: [p.maker, p.model_name, p.sub_model, p.trim_name].filter(v => v && v !== '-').join(' '),
    });
    // 채팅방으로 이동 → 입력칸 자동 포커스
    location.href = `/m/chat/${encodeURIComponent(roomId)}`;
  } catch (err) {
    console.error('[product-detail] chat failed', err);
    showToast('대화 연결 실패: ' + (err?.message || ''), 'error');
    $btnChat.disabled = false;
  }
});

// ─── 액션: 계약 ──────────────────────────────────────────────────────────
$btnContract?.addEventListener('click', async (e) => {
  e.preventDefault();
  if (!currentProduct) { showToast('상품 정보를 불러오는 중입니다', 'info'); return; }
  if (currentProfile?.role !== 'agent') { showToast('영업자만 계약을 생성할 수 있습니다', 'error'); return; }
  const ok = await showConfirm('이 상품으로 계약을 생성하시겠습니까?');
  if (!ok) return;
  const p = currentProduct;
  const seed = {
    seed_product_key: p.product_uid || p.product_code || '',
    product_uid: p.product_uid || p.product_code || '',
    product_code: p.product_code || p.product_uid || '',
    product_code_snapshot: p.product_code || p.product_uid || '',
    partner_code: p.partner_code || p.provider_company_code || '',
    provider_company_code: p.provider_company_code || p.partner_code || '',
    policy_code: p.policy_code || p.term_code || '',
    car_number: p.car_number || '',
    vehicle_name: [p.maker, p.model_name, p.sub_model, p.trim_name].filter(Boolean).join(' '),
    maker: p.maker || '',
    model_name: p.model_name || '',
    sub_model: p.sub_model || '',
    trim_name: p.trim_name || '',
    rent_month: '48',
    rent_amount: Number(p.price?.['48']?.rent || p.rental_price_48 || 0),
    deposit_amount: Number(p.price?.['48']?.deposit || p.deposit_48 || 0),
  };
  try {
    localStorage.setItem('freepass_pending_contract_seed', JSON.stringify(seed));
  } catch {}
  // 계약 페이지로 이동 → 빈 폼 자동 채움
  location.href = '/m/contract';
});

// ─── 액션: 공유 ──────────────────────────────────────────────────────────
$btnShare?.addEventListener('click', async (e) => {
  e.preventDefault();
  if (!currentProduct) { showToast('상품 정보를 불러오는 중입니다', 'info'); return; }
  const ok = await showConfirm('이 상품의 공유 링크를 만드시겠습니까?');
  if (!ok) return;
  const p = currentProduct;
  const url = new URL(location.origin + '/catalog');
  url.searchParams.set('id', p.product_uid || p.product_code || '');
  if (currentProfile?.user_code) url.searchParams.set('a', currentProfile.user_code);
  // 타이틀: "{상품유형} {차량번호} {차종} - {담당자 이름} {직급}"
  // 예: "신차렌트 113허0000 쏘렌토 - 홍길동 팀장"
  const carPart = [p.product_type, p.car_number, p.model_name || p.sub_model].filter(Boolean).join(' ');
  const agentPart = [currentProfile?.name, currentProfile?.position].filter(Boolean).join(' ');
  const company = currentProfile?.company_name || '';
  const carTitle = [carPart, agentPart && `- ${agentPart}`].filter(Boolean).join(' ');
  if (carTitle) url.searchParams.set('t', carTitle);
  if (company) url.searchParams.set('c', company);
  // 이미지 URL은 너무 길어서 query에 넣지 않음 — 서버가 OG 기본 이미지 사용
  const shareUrl = url.toString();
  const title = carTitle || [p.maker, p.model_name].filter(Boolean).join(' ') || '상품';
  // Web Share API 우선
  if (navigator.share) {
    try { await navigator.share({ title, url: shareUrl }); return; }
    catch (err) { if (err?.name === 'AbortError') return; }
  }
  // 클립보드 fallback
  try {
    await navigator.clipboard.writeText(shareUrl);
    showToast('링크가 복사되었습니다', 'success');
  } catch {
    window.prompt('아래 링크를 복사하세요', shareUrl);
  }
});

// ─── 버튼 항상 노출 — 클릭 시 핸들러에서 역할 체크 ─────────────────────
function applyRoleVisibility() {
  if ($btnChat)     $btnChat.hidden     = false;
  if ($btnContract) $btnContract.hidden = false;
  if ($btnShare)    $btnShare.hidden    = false;
}

// ⚡ 마지막으로 렌더된 HTML을 sessionStorage에 보관 → 재방문 시 즉시 복원 (체감 0ms)
const SS_HTML_KEY = 'fp_pd_html_' + productId;
(function restoreLastHtml() {
  try {
    const cached = sessionStorage.getItem(SS_HTML_KEY);
    if (cached && $content) $content.innerHTML = cached;
  } catch {}
})();
window.addEventListener('pagehide', () => {
  try { if ($content) sessionStorage.setItem(SS_HTML_KEY, $content.innerHTML); } catch {}
});

// ⚡ 캐시 즉시 사용 — Firebase 응답 기다리지 않고 첫 페인트 전에 렌더
function hydrateFromCache() {
  const cached = window.__appData || {};
  if (Array.isArray(cached.products)) {
    const found = cached.products.find(p => p.product_uid === productId || p.product_code === productId);
    if (found) currentProduct = found;
  }
  if (Array.isArray(cached.terms)) {
    allPolicies = cached.terms;
  }
  if (currentProduct) render();
}
hydrateFromCache();
// IDB 비동기 복원/Firebase 응답 도착 시 다시 hydrate
window.addEventListener('fp:data', (e) => {
  const t = e.detail?.type;
  if (t === 'products' || t === 'terms') hydrateFromCache();
});

(async () => {
  try {
    const auth = await requireAuth();
    currentUser = auth.user;
    currentProfile = auth.profile;
    applyRoleVisibility();
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
