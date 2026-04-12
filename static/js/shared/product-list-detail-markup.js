import { safeText, escapeHtml } from '../core/management-format.js';

function safe(v) { return String(v ?? '').trim() || '-'; }
function esc(v) { return escapeHtml(String(v ?? '')); }

function money(v) {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, '') || 0);
  return n ? n.toLocaleString('ko-KR') + '원' : '-';
}

function first(...vs) {
  for (const v of vs) { const s = String(v ?? '').trim(); if (s && s !== '-') return s; }
  return '-';
}

function parsePol(raw) {
  const s = String(raw ?? '').trim();
  if (!s || s === '-') return { limit: '-', deductible: '-' };
  const parts = s.split('/').map(x => x.trim()).filter(Boolean);
  return parts.length >= 2 ? { limit: parts[0], deductible: parts.slice(1).join(' / ') } : { limit: s, deductible: '-' };
}

function fmtDate(v) {
  const d = String(v ?? '').replace(/[^\d]/g, '');
  if (!d) return '-';
  if (d.length === 8) return `${d.slice(0,4)}.${d.slice(4,6)}.${d.slice(6,8)}`;
  if (d.length === 6) return `20${d.slice(0,2)}.${d.slice(2,4)}.${d.slice(4,6)}`;
  return safe(v);
}

const COLOR_MAP = {
  '화이트': ['#fff', '#334155', '1px solid #e2e8f0'], '흰색': ['#fff', '#334155', '1px solid #e2e8f0'], '백색': ['#fff', '#334155', '1px solid #e2e8f0'],
  '화이트펄': ['#f8f8f0', '#334155', '1px solid #e2e8f0'], '펄화이트': ['#f8f8f0', '#334155', '1px solid #e2e8f0'], '스노우화이트': ['#f8f8f0', '#334155', '1px solid #e2e8f0'], '스노우화이트펄': ['#f8f8f0', '#334155', '1px solid #e2e8f0'], '폴라화이트': ['#f0f0e8', '#334155', '1px solid #e2e8f0'],
  '블랙': ['#1e293b', '#fff', 'none'], '검정': ['#1e293b', '#fff', 'none'], '어비스블랙': ['#0f172a', '#fff', 'none'], '블랙사파이어': ['#1a1a2e', '#fff', 'none'], '오로라블랙': ['#111827', '#fff', 'none'], '카본블랙': ['#1c1c1c', '#fff', 'none'], '옵시디언블랙': ['#0c0c0c', '#fff', 'none'],
  '실버': ['#c0c0c0', '#1e293b', 'none'], '은색': ['#c0c0c0', '#1e293b', 'none'], '플래티넘실버': ['#d0d0d0', '#1e293b', 'none'], '세라믹실버': ['#b8c0c8', '#1e293b', 'none'], '미드나이트실버': ['#6b7280', '#fff', 'none'],
  '그레이': ['#9ca3af', '#fff', 'none'], '회색': ['#9ca3af', '#fff', 'none'], '그라파이트': ['#6b7280', '#fff', 'none'], '마틱그레이': ['#78909c', '#fff', 'none'], '서빌레그레이': ['#8d99ae', '#fff', 'none'], '아마존그레이': ['#5c6b73', '#fff', 'none'], '마운틴그레이': ['#7b8794', '#fff', 'none'],
  '블루': ['#3b82f6', '#fff', 'none'], '파랑': ['#3b82f6', '#fff', 'none'], '데님블루': ['#1e40af', '#fff', 'none'], '그래비티블루': ['#1e3a5f', '#fff', 'none'],
  '레드': ['#ef4444', '#fff', 'none'], '빨강': ['#ef4444', '#fff', 'none'], '하이샤시레드': ['#dc2626', '#fff', 'none'],
  '브라운': ['#92400e', '#fff', 'none'], '갈색': ['#92400e', '#fff', 'none'], '코냑': ['#a0522d', '#fff', 'none'], '카멜': ['#c19a6b', '#1e293b', 'none'],
  '베이지': ['#f5f0e1', '#6b5b3e', 'none'], '아이보리': ['#fefce8', '#6b5b3e', '1px solid #e2e8f0'],
  '네이비': ['#1e3a5f', '#fff', 'none'], '남색': ['#1e3a5f', '#fff', 'none'],
  '버건디': ['#6b1a2a', '#fff', 'none'],
  '오렌지': ['#f97316', '#fff', 'none'], '주황': ['#f97316', '#fff', 'none'],
  '그린': ['#16a34a', '#fff', 'none'], '초록': ['#16a34a', '#fff', 'none'], '다크그린': ['#166534', '#fff', 'none'], '디지털틸그린': ['#0d9488', '#fff', 'none'],
  '그래비티골드': ['#b8860b', '#fff', 'none'],
};

function colorBadge(name) {
  const s = String(name ?? '').trim();
  if (!s || s === '-') return '';
  const match = COLOR_MAP[s];
  const bg = match ? match[0] : '#e2e8f0';
  const fg = match ? match[1] : '#475569';
  const border = match ? match[2] : 'none';
  return `<span class="md-color-badge" style="background:${bg};color:${fg};border:${border}">${esc(s)}</span>`;
}

const SECTION_ICONS = {
  '차량정보': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8"/><path d="M7 14h.01"/><path d="M17 14h.01"/><rect width="18" height="8" x="3" y="10" rx="2"/><path d="M5 18v2"/><path d="M19 18v2"/></svg>',
  '차량사진': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
  '기간별 대여료 및 보증금 안내': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>',
  '차량보험정보': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>',
  '대여조건': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6"/><path d="M9 16h6"/></svg>',
  '추가정보': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
  '기간별 수수료': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 17a5 5 0 0 0 10 0c0-2.76-2.5-5-5-3l5-10"/><path d="M12 17a5 5 0 0 0 10 0c0-2.76-2.5-5-5-3l5-10"/></svg>',
};

function sectionHead(title) {
  const icon = SECTION_ICONS[title] || '';
  return `<div class="md-section-head">${icon}${esc(title)}</div>`;
}

function row(label, value) {
  return `<div class="md-row"><span>${esc(label)}</span><strong>${esc(safe(value))}</strong></div>`;
}

function rowMaybe(label, value) {
  const text = String(value ?? '').trim();
  if (!text || text === '-') return '';
  return row(label, value);
}

export { safe, esc, first, money, fmtDate };

export function renderProductDetailMarkup(product, { activePhotoIndex = 0, termFields = {}, actionsHtml = '', showGallery = true, showFee = true } = {}) {
  if (!product) return '<div class="detail-empty">좌측 목록에서 차량을 선택하세요.</div>';

  const photos = Array.isArray(product.photos) ? product.photos.filter(Boolean) : [];
  const total = photos.length;
  const p = product.policy || {};
  const c = product.condition || {};

  // 사진 프리로드 — 상세 열릴 때 백그라운드로 미리 캐싱
  if (total > 0) {
    for (let i = 0; i < total; i++) {
      const img = new Image();
      img.decoding = 'async';
      img.src = photos[i];
    }
  }

  // ── 1. 차량사진 (사진 위에 출고가능/신차렌트 뱃지) ──
  const normalizedIndex = Math.min(Math.max(Number(activePhotoIndex || 0), 0), Math.max(total - 1, 0));
  const galleryBadges = [product.vehicleStatus, product.productType].filter(v => v && v !== '-').map(v =>
    `<span class="md-gallery-badge">${esc(v)}</span>`).join('');
  const galleryHtml = total
    ? `<div class="pls-mobile-detail-gallery" id="plsMGallery" data-photos='${JSON.stringify(photos).replace(/'/g,"&#39;")}'>
        <img class="pls-mobile-detail-gallery__img" id="plsMGalleryImg" src="${esc(photos[normalizedIndex] || photos[0])}" alt="" loading="eager" decoding="async">
        ${galleryBadges ? `<div class="md-gallery-badges">${galleryBadges}</div>` : ''}
        ${total > 1 ? `<button class="pls-mobile-detail-gallery__nav pls-mobile-detail-gallery__nav--prev" id="plsMGalleryPrev" type="button" aria-label="이전"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button><button class="pls-mobile-detail-gallery__nav pls-mobile-detail-gallery__nav--next" id="plsMGalleryNext" type="button" aria-label="다음"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>` : ''}
        <span class="pls-mobile-detail-gallery__counter" id="plsMGalleryCtr">${normalizedIndex + 1} / ${total}</span>
      </div>`
    : `<div class="md-no-photo">${galleryBadges ? `<div class="md-gallery-badges">${galleryBadges}</div>` : ''}등록된 사진이 없습니다.</div>`;

  // ── 2. 차량정보 ──
  // 순서: 제조사 모델명 차량번호 / 세부모델 / 세부트림 / 선택옵션 / 연료·연식·주행거리·색상
  const vehicleInfo = `
    ${sectionHead('차량정보')}
    <div class="md-card">
      <div class="md-vehicle-head">
        <div class="md-vehicle-model">${esc(safe(product.maker))} ${esc(safe(product.model))}</div>
        <div class="md-vehicle-carno">${esc(safe(product.carNo))}</div>
      </div>
      ${product.subModel && product.subModel !== '-' ? `<div class="md-vehicle-row"><span class="md-vehicle-label">세부모델</span><span class="md-vehicle-value">${esc(product.subModel)}</span></div>` : ''}
      ${product.trim && product.trim !== '-' ? `<div class="md-vehicle-row"><span class="md-vehicle-label">세부트림</span><span class="md-vehicle-value">${esc(product.trim)}</span></div>` : ''}
      ${product.optionSummary && product.optionSummary !== '-' ? `<div class="md-vehicle-row"><span class="md-vehicle-label">선택옵션</span><span class="md-vehicle-value">${esc(product.optionSummary)}</span></div>` : ''}
      <div class="md-vehicle-meta">${esc(safe(product.fuel))} · ${esc(safe(product.year))}년식 · ${esc(safe(product.mileageDisplay))} ${colorBadge(product.extColor)}${colorBadge(product.intColor)}</div>
    </div>`;

  // ── 3. 기간별 대여료 및 보증금 ──
  const months = ['1','12','24','36','48','60'];
  const priceRowsHtml = months.map(m => {
    const rent = Number(product.price?.[m]?.rent || 0);
    const dep = Number(product.price?.[m]?.deposit || 0);
    if (!rent && !dep) return '';
    return `<tr><td>${m}개월</td><td><strong>${rent ? rent.toLocaleString('ko-KR') + '원' : '-'}</strong></td><td>${dep ? dep.toLocaleString('ko-KR') + '원' : '-'}</td></tr>`;
  }).join('');

  const screeningNote = first(termFields.screening_criteria, product.reviewStatus);
  const creditGrade = first(termFields.credit_grade, product.creditGrade);
  const screeningDisplay = [screeningNote, creditGrade].filter(v => v && v !== '-').join('/');
  const basicAge = first(termFields.basic_driver_age, product.ageText);
  const annualMileage = first(termFields.annual_mileage, p.annualMileage);
  const insuranceIncluded = first(termFields.insurance_included, product.insuranceIncluded);
  const criteriaItems = [
    screeningDisplay || '',
    basicAge !== '-' ? `만 ${basicAge}` : '',
    annualMileage !== '-' ? annualMileage : '',
    insuranceIncluded !== '-' ? `보험료 ${insuranceIncluded}` : '',
  ].filter(Boolean);
  const priceNote = criteriaItems.length ? `* [${esc(criteriaItems[0])}] ${esc(criteriaItems.slice(1).join(', '))}` : '';
  const priceSection = priceRowsHtml ? `
    ${sectionHead('기간별 대여료 및 보증금 안내')}
    <div class="md-card">
      <table class="md-table md-table--price"><thead><tr><th>기간</th><th>대여료</th><th>보증금</th></tr></thead><tbody>${priceRowsHtml}</tbody></table>
      ${priceNote ? `<div class="md-note">${priceNote}</div>` : ''}
    </div>` : '';

  // ── 4. 차량보험정보 ──
  const bodilyLeg   = parsePol(first(termFields.injury_limit_deductible, p.bodily));
  const propertyLeg = parsePol(first(termFields.property_limit_deductible, p.property));
  const selfLeg     = parsePol(first(termFields.personal_injury_limit_deductible, p.selfBodily));
  const uninsLeg    = parsePol(first(termFields.uninsured_limit_deductible, p.uninsured));
  const ownLeg      = parsePol(first(termFields.own_damage_limit_deductible, p.ownDamage));
  const insRows = [
    ['대인', first(termFields.injury_compensation_limit, bodilyLeg.limit), first(termFields.injury_deductible, bodilyLeg.deductible)],
    ['대물', first(termFields.property_compensation_limit, propertyLeg.limit), first(termFields.property_deductible, propertyLeg.deductible)],
    ['자기신체사고', first(termFields.self_body_accident, selfLeg.limit), first(termFields.self_body_deductible, selfLeg.deductible)],
    ['무보험차상해', first(termFields.uninsured_damage, uninsLeg.limit), first(termFields.uninsured_deductible, uninsLeg.deductible)],
    ['자기차량손해', first(termFields.own_damage_compensation, ownLeg.limit), first(termFields.own_damage_min_deductible, ownLeg.deductible)],
    ['긴급출동', first(termFields.annual_roadside_assistance, termFields.roadside_assistance), '-'],
  ];
  const insSection = `
    ${sectionHead('차량보험정보')}
    <div class="md-card">
      <table class="md-table"><thead><tr><th>항목</th><th>한도</th><th>면책금</th></tr></thead><tbody>
        ${insRows.map(([label, limit, ded]) => `<tr><td>${esc(label)}</td><td>${esc(limit)}</td><td>${esc(ded)}</td></tr>`).join('')}
      </tbody></table>
    </div>`;

  // ── 5. 대여조건 ──
  const rentalTerms = `
    ${sectionHead('대여조건')}
    <div class="md-card">
      ${row('결제방식', first(termFields.payment_method, p.paymentMethod))}
      ${row('1만Km추가비용', first(termFields.mileage_upcharge_per_10000km))}
      ${row('보증금분납', first(termFields.deposit_installment))}
      ${row('보증금카드결제', first(termFields.deposit_card_payment))}
      ${row('연령하향', first(termFields.driver_age_lowering, p.ageLowering))}
      ${row('연령하향비용', first(termFields.age_lowering_cost, p.ageLoweringCost))}
      ${row('개인운전범위', first(termFields.personal_driver_scope))}
      ${row('사업자운전범위', first(termFields.business_driver_scope))}
      ${row('추가운전자수', first(termFields.additional_driver_allowance_count))}
      ${row('추가운전자비용', first(termFields.additional_driver_cost))}
      ${row('대여지역', first(termFields.rental_region, c.rentalRegion))}
      ${row('탁송비', first(termFields.delivery_fee, c.deliveryFee))}
      ${row('정비서비스', first(termFields.maintenance_service, c.maintenance))}
      ${row('위약금', first(termFields.penalty_condition, c.penaltyRate))}
    </div>`;

  // ── 6. 추가정보 ──
  const photoLink = String(product.photoLink ?? '').trim();
  const extraInfo = `
    ${sectionHead('추가정보')}
    <div class="md-card">
      ${row('차량번호', product.carNo)}
      ${row('차종구분', product.vehicleClass)}
      ${row('최초등록일', fmtDate(product.firstRegistrationDate))}
      ${row('차령만료일', fmtDate(product.vehicleAgeExpiryDate))}
      ${row('차량가격', money(product.vehiclePrice))}
      ${rowMaybe('특이사항', first(c.note, product.partnerMemo))}
      ${rowMaybe('공급코드', first(product.providerCompanyCode, product.partnerCode))}
      ${photoLink ? `<div class="md-row"><span>사진링크</span><strong><a href="${esc(photoLink)}" target="_blank" rel="noopener" class="md-link">사진보기</a></strong></div>` : ''}
    </div>`;

  // ── 7. 기간별 수수료 ──
  const feeRowsHtml = months.map(m => {
    const feeNum = Number(product.price?.[m]?.fee || 0);
    if (!feeNum) return '';
    return `<tr><td>${m}개월</td><td>${feeNum.toLocaleString('ko-KR')}원</td></tr>`;
  }).join('');
  const clawback = first(termFields.commission_clawback_condition);
  const feeSection = feeRowsHtml ? `
    ${sectionHead('기간별 수수료')}
    <div class="md-card">
      <table class="md-table md-table--price"><thead><tr><th>기간</th><th>수수료</th></tr></thead><tbody>${feeRowsHtml}</tbody></table>
      ${clawback !== '-' ? `<div class="md-note">* 수수료환수조건: ${esc(clawback)}</div>` : ''}
    </div>` : '';

  return `
    <div class="plist-detail" data-photo-sources="${photos.map(src => esc(src)).join('|')}" data-car-no="${esc(product.carNo || '')}">
      ${showGallery ? galleryHtml : ''}
      ${vehicleInfo}
      ${actionsHtml}
      ${priceSection}
      ${insSection}
      ${rentalTerms}
      ${extraInfo}
      ${showFee ? feeSection : ''}
    </div>
  `;
}
