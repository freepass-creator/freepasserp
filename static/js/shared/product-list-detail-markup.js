import { renderBadgeRow } from './badge.js';

const _COLOR_MAP = {
  '흰색':{ h:'#f0f0f0', d:true }, '화이트':{ h:'#f0f0f0', d:true }, '순백색':{ h:'#f8f8f8', d:true },
  '크리스탈화이트':{ h:'#f2f2f0', d:true }, '오로라화이트':{ h:'#f5f3ee', d:true }, '펄화이트':{ h:'#f0ede6', d:true },
  '검은색':{ h:'#1c1c1c', d:false }, '블랙':{ h:'#1c1c1c', d:false }, '검정':{ h:'#1c1c1c', d:false }, '어반그레이블랙':{ h:'#2a2a2a', d:false },
  '은색':{ h:'#b0b0b0', d:true }, '실버':{ h:'#b0b0b0', d:true }, '문라이트':{ h:'#9baab8', d:false }, '샤이닝실버':{ h:'#c8c8c8', d:true },
  '회색':{ h:'#7a7a7a', d:false }, '그레이':{ h:'#7a7a7a', d:false }, '다크그레이':{ h:'#404040', d:false },
  '스틸그레이':{ h:'#6a7480', d:false }, '팬텀블랙':{ h:'#2d2d2d', d:false }, '그라파이트':{ h:'#4a4a4a', d:false },
  '파란색':{ h:'#1565c0', d:false }, '블루':{ h:'#1565c0', d:false }, '네이비':{ h:'#1a237e', d:false }, '남색':{ h:'#1a237e', d:false },
  '하늘색':{ h:'#5bacd8', d:false }, '스카이블루':{ h:'#5bacd8', d:false }, '세룰리안블루':{ h:'#3a7eca', d:false }, '미드나잇블루':{ h:'#1c2d50', d:false },
  '빨간색':{ h:'#c0392b', d:false }, '레드':{ h:'#c0392b', d:false }, '빨강':{ h:'#c0392b', d:false },
  '와인':{ h:'#7d1f2a', d:false }, '버건디':{ h:'#800020', d:false }, '첼리레드':{ h:'#cc2222', d:false },
  '갈색':{ h:'#7a5c3c', d:false }, '브라운':{ h:'#7a5c3c', d:false }, '카키':{ h:'#7a6a3c', d:false }, '샴페인':{ h:'#c8ac7a', d:true },
  '베이지':{ h:'#cdc09a', d:true }, '아이보리':{ h:'#f5edda', d:true }, '크림':{ h:'#f0e6c8', d:true },
  '금색':{ h:'#c8a832', d:true }, '골드':{ h:'#c8a832', d:true }, '샴페인골드':{ h:'#d4b870', d:true },
  '진주색':{ h:'#ddd8cc', d:true }, '펄':{ h:'#ddd8cc', d:true }, '크리스탈':{ h:'#e0dbd4', d:true },
  '녹색':{ h:'#2d7034', d:false }, '그린':{ h:'#2d7034', d:false }, '올리브':{ h:'#6b7530', d:false },
  '주황색':{ h:'#e05c10', d:false }, '오렌지':{ h:'#e05c10', d:false }, '노란색':{ h:'#e0b800', d:true }, '옐로우':{ h:'#e0b800', d:true },
  '보라색':{ h:'#6a1b9a', d:false }, '퍼플':{ h:'#6a1b9a', d:false },
};
function _colorInfo(name) {
  const n = String(name || '').trim();
  if (!n || n === '-') return null;
  const lower = n.toLowerCase();
  for (const [k, v] of Object.entries(_COLOR_MAP)) {
    if (k.toLowerCase() === lower) return v;
  }
  for (const [k, v] of Object.entries(_COLOR_MAP)) {
    if (lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower)) return v;
  }
  return null;
}
function renderColorBadge(label, colorName) {
  const n = String(colorName || '').trim();
  if (!n || n === '-') return `<span class="color-badge color-badge--empty" title="색상미등록">${label}</span>`;
  const info = _colorInfo(n);
  if (!info) return `<span class="color-badge color-badge--empty" style="border-style:dashed" title="${n}">${label}</span>`;
  return `<span class="color-badge ${info.d ? 'color-badge--on-light' : 'color-badge--on-dark'}" style="background:${info.h}" title="${n}">${label}</span>`;
}

function safeText(value, fallback = '-') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function ensurePercentSuffix(value) {
  const text = String(value ?? '').trim();
  if (!text || text === '-') return '-';
  return /%$/.test(text) ? text : `${text}%`;
}

function formatDeductibleAmount(value) {
  const text = String(value ?? '').trim();
  if (!text || text === '-') return '-';
  if (/[만원원]/.test(text)) return text;
  const digits = text.replace(/[^\d.-]/g, '');
  if (!digits) return text;
  const num = Number(digits);
  if (!Number.isFinite(num)) return text;
  if (num >= 10000 && num % 10000 === 0) return `${(num / 10000).toLocaleString('ko-KR')}만원`;
  return `${num.toLocaleString('ko-KR')}원`;
}

function hasContent(value) {
  return String(value ?? '').trim() !== '' && String(value ?? '').trim() !== '-';
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoneyShort(value) {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(String(value).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n) || n === 0) return '-';
  return Math.round(n / 1000).toLocaleString('ko-KR') + ',';
}

function formatMoney(value, { zeroAsDash = true } = {}) {
  if (value === null || value === undefined || value === '') return '-';
  const normalized = String(value).replace(/[^\d.-]/g, '');
  if (!normalized) return '-';
  const number = Number(normalized);
  if (!Number.isFinite(number)) return '-';
  if (number === 0 && zeroAsDash) return '-';
  return `${number.toLocaleString('ko-KR')}원`;
}

function formatYear(value) {
  const text = String(value ?? '').replace(/[^\d]/g, '');
  if (!text) return '-';
  return `${text}년식`;
}

function normalizeDate(value) {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  if (!digits) return '-';
  if (digits.length === 8) return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
  if (digits.length === 6) return `20${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4, 6)}`;
  return String(value ?? '').trim() || '-';
}

function uniqueTexts(values = []) {
  return [...new Set(values.map((item) => String(item ?? '').trim()).filter(Boolean))];
}

function firstContent(...values) {
  for (const value of values) {
    if (hasContent(value)) return String(value).trim();
  }
  return '-';
}

function parsePolicyCell(value) {
  const text = String(value ?? '').trim();
  if (!text || text === '-') return { limit: '-', deductible: '-' };
  const parts = text.split('/').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { limit: parts[0], deductible: parts.slice(1).join(' / ') || '-' };
  }
  return { limit: text, deductible: '-' };
}

function splitListValue(value) {
  return uniqueTexts(
    String(value ?? '')
      .split(/(?:\r?\n|,|\||·|\/)/)
      .map((item) => item.trim())
  );
}

function renderValueBadges(values = []) {
  const items = uniqueTexts(values);
  if (!items.length) return '<span class="plist-detail__value">-</span>';
  return `<div class="plist-detail__chips">${items.map((item) => `<span class="plist-detail__chip">${escapeHtml(item)}</span>`).join('')}</div>`;
}

function rowMaybe(label, value, opts = {}) {
  const text = String(value ?? '').trim();
  if (!text || text === '-') return '';
  return renderRow(label, value, opts);
}

function renderRow(label, value, { multiline = false, chips = false, link = false } = {}) {
  let renderedValue = '';
  if (chips) {
    renderedValue = renderValueBadges(Array.isArray(value) ? value : splitListValue(value));
  } else if (link) {
    const href = String(value ?? '').trim();
    renderedValue = href
      ? `<a class="plist-detail__value plist-detail__link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">링크보기</a>`
      : '<span class="plist-detail__value">링크없음</span>';
  } else if (multiline) {
    renderedValue = `<div class="plist-detail__value plist-detail__value--multiline">${escapeHtml(safeText(value)).replace(/\n/g, '<br>')}</div>`;
  } else {
    renderedValue = `<span class="plist-detail__value">${escapeHtml(safeText(value))}</span>`;
  }
  return `<div class="plist-detail__row"><span class="plist-detail__label">${escapeHtml(label)}</span>${renderedValue}</div>`;
}

function renderSection(title, body, { extraClass = '', card = true } = {}) {
  if (!body) return '';
  const inner = card
    ? `<div class="plist-detail__card plist-detail__card--flat"><div class="plist-detail__card-body">${body}</div></div>`
    : body;
  return `
    <section class="plist-detail__section ${extraClass}">
      <div class="plist-detail__section-title">${escapeHtml(title)}</div>
      ${inner}
    </section>
  `;
}

function renderHeroLine(className, content) {
  if (!content) return '';
  return `<div class="${className}">${content}</div>`;
}

function renderSummaryTop(product) {
  const badges = [
    { field: 'vehicle_status', value: product.vehicleStatus },
    { field: 'product_type',   value: product.productType   }
  ].filter((item) => item.value && item.value !== '-');

  const carNoText = safeText(product.carNo);
  const makerModel = [product.maker, product.model].filter(v => v && v !== '-').join(' ');

  const modelLine = [product.subModel, product.trim]
    .map((item) => safeText(item, ''))
    .filter((s) => s && s !== '-')
    .join(' ');

  const optText = safeText(product.optionSummary, '');

  const metaParts = [formatYear(product.year), product.mileageDisplay, product.fuel]
    .map((item) => safeText(item, ''))
    .filter((s) => s && s !== '-')
    .join(' · ');
  const extBadge = renderColorBadge('외장', product.extColor);
  const intBadge = renderColorBadge('내장', product.intColor);

  return `
    <section class="plist-detail__summary-top">
      <div class="plist-detail__summary-line plist-detail__summary-line--top">
        <div class="plist-detail__summary-main">${escapeHtml(carNoText)}${makerModel ? ` <span class="plist-detail__summary-maker-model">${escapeHtml(makerModel)}</span>` : ''}</div>
        <div class="plist-detail__summary-badges">${renderBadgeRow(badges)}</div>
      </div>
      ${modelLine ? `<div class="plist-detail__summary-line plist-detail__summary-line--model">${escapeHtml(modelLine)}</div>` : ''}
      ${(optText && optText !== '-') ? `<div class="plist-detail__summary-line plist-detail__summary-line--options">${escapeHtml(optText)}</div>` : ''}
      <div class="plist-detail__summary-line plist-detail__summary-line--meta">
        <span class="plist-detail__meta-text">${escapeHtml(metaParts || '-')}</span>
        <span class="plist-detail__color-badges">${extBadge}${intBadge}</span>
      </div>
    </section>
  `;
}

function renderPhotoSection(product, activePhotoIndex = 0) {
  const photos = Array.isArray(product.photos) ? product.photos.filter(Boolean) : [];
  const photoLink = String(product.photoLink ?? '').trim();
  const photoLinkRow = photoLink
    ? `<div class="plist-detail__row"><span class="plist-detail__label">사진링크</span><a class="plist-detail__value plist-detail__link" href="${escapeHtml(photoLink)}" target="_blank" rel="noopener noreferrer">사진보기</a></div>`
    : renderRow('사진링크', '링크없음');

  if (!photos.length) {
    const body = renderRow('등록사진', '사진없음') + photoLinkRow;
    return renderSection('차량사진', body);
  }

  const normalizedIndex = Math.min(Math.max(Number(activePhotoIndex || 0), 0), photos.length - 1);
  const primary = photos[normalizedIndex] || photos[0] || '';
  const downloadBtn = `<button type="button" class="plist-detail__photo-download-link" data-download-photos>사진다운로드</button>`;
  const photoHtml = `
    <button type="button" class="plist-detail__photo-main" data-open-photo-viewer data-photo-start-index="${normalizedIndex}" aria-label="차량 사진 크게 보기">
      <img src="${escapeHtml(primary)}" alt="차량 사진">
    </button>
  `;
  const body = photoHtml + renderRow('등록사진', `${photos.length}장`) + photoLinkRow;
  const sectionHead = `<div class="plist-detail__section-head"><div class="plist-detail__section-title">차량사진</div>${downloadBtn}</div>`;
  return `
    <section class="plist-detail__section">
      ${sectionHead}
      <div class="plist-detail__card plist-detail__card--flat"><div class="plist-detail__card-body">${body}</div></div>
    </section>
  `;
}

function formatRentalGuideText(policy) {
  const screening = safeText(policy.screeningCriteria);
  const credit = safeText(policy.creditGrade);
  const age = safeText(policy.minDriverAge);
  const mileage = safeText(policy.annualContractMileage);
  const insuranceIncluded = safeText(policy.insuranceIncluded);
  const custom = safeText(policy.rentalGuideNote);
  if (custom !== '-') return custom;
  const bracket = [screening, credit].filter((v) => v !== '-').join(' / ');
  const parts = [];
  if (age !== '-') parts.push(age);
  if (mileage !== '-') parts.push(mileage);
  if (insuranceIncluded !== '-') parts.push(insuranceIncluded);
  const info = parts.join(', ');
  if (!bracket && !info) return '-';
  return `${bracket ? `[${bracket}] ` : ''}${info}`.trim();
}

function renderPriceSummarySection(policy) {
  const guideText = formatRentalGuideText(policy);
  const clawbackText = safeText(policy.commissionClawbackCondition);
  const notes = [];
  if (guideText !== '-') {
    notes.push(`<div class="plist-detail__price-note">* ${escapeHtml(guideText)}</div>`);
  }
  if (clawbackText !== '-') {
    notes.push(`<div class="plist-detail__price-note">* 수수료환수조건: ${escapeHtml(clawbackText)}</div>`);
  }
  if (!notes.length) return '';
  return `<div class="plist-detail__price-summary">${notes.join('')}</div>`;
}

function renderPriceSection(product, termFields = {}) {
  const periods = ['1', '6', '12', '24', '36', '48', '60'];
  const rows = periods
    .filter((month) => Number(product.price?.[month]?.rent || 0) > 0)
    .map((month) => {
      const item = product.price?.[month] || {};
      return `
      <tr>
        <td>${month}개월</td>
        <td class="price-cell"><span class="price-full">${escapeHtml(formatMoney(item.rent, { zeroAsDash: false }))}</span><span class="price-short">${escapeHtml(formatMoneyShort(item.rent))}</span></td>
        <td class="price-cell"><span class="price-full">${escapeHtml(formatMoney(item.deposit))}</span><span class="price-short">${escapeHtml(formatMoneyShort(item.deposit))}</span></td>
        <td class="price-cell"><span class="price-full">${escapeHtml(formatMoney(item.fee))}</span><span class="price-short">${escapeHtml(formatMoneyShort(item.fee))}</span></td>
      </tr>
    `;
    }).join('');
  if (!rows) return '';

  const policy = buildPolicyValues(product, termFields);

  return renderSection('기간별 대여료 및 보증금 안내', `
    <div class="plist-detail__table-wrap">
      <table class="price-table plist-detail__table">
        <thead>
          <tr><th>기간</th><th>대여료</th><th>보증금</th><th>수수료</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${renderPriceSummarySection(policy)}
  `, { card: false });
}

function buildPolicyValues(product, termFields = {}) {
  const bodilyLegacy = parsePolicyCell(firstContent(termFields.injury_limit_deductible, product.policy?.bodily));
  const propertyLegacy = parsePolicyCell(firstContent(termFields.property_limit_deductible, product.policy?.property));
  const selfLegacy = parsePolicyCell(firstContent(termFields.personal_injury_limit_deductible, product.policy?.selfBodily));
  const uninsuredLegacy = parsePolicyCell(firstContent(termFields.uninsured_limit_deductible, product.policy?.uninsured));
  const ownLegacy = parsePolicyCell(firstContent(termFields.own_damage_limit_deductible, product.policy?.ownDamage));

  return {
    screeningCriteria: firstContent(termFields.screening_criteria, product.reviewStatus),
    creditGrade: firstContent(termFields.credit_grade, product.creditGrade),
    minDriverAge: firstContent(termFields.basic_driver_age, product.baseAge, product.ageText),
    annualContractMileage: firstContent(termFields.annual_mileage, product.annualMileageDisplay),
    driverRange: firstContent(termFields.driver_range, termFields.driver_scope, product.insuranceIncluded),
    rentalGuideNote: firstContent(termFields.rental_guide_note, product.pricingBasis),
    insuranceIncluded: firstContent(termFields.insurance_included, product.insuranceIncluded),
    mileageUpchargePer10000km: firstContent(termFields.mileage_upcharge_per_10000km),
    depositInstallment: firstContent(termFields.deposit_installment),
    paymentMethod: firstContent(termFields.payment_method, product.policy?.paymentMethod),
    penaltyCondition: firstContent(termFields.penalty_condition, product.condition?.penaltyRate),
    commissionClawbackCondition: firstContent(termFields.commission_clawback_condition),
    depositCardPayment: firstContent(termFields.deposit_card_payment),
    rentalRegion: firstContent(termFields.rental_region, product.condition?.rentalRegion),
    deliveryFee: firstContent(termFields.delivery_fee, product.condition?.deliveryFee),
    driverAgeLowering: firstContent(termFields.driver_age_lowering, product.policy?.ageLowering),
    ageLoweringCost: firstContent(termFields.age_lowering_cost, product.policy?.ageLoweringCost),
    personalDriverScope: firstContent(termFields.personal_driver_scope),
    businessDriverScope: firstContent(termFields.business_driver_scope),
    additionalDriverAllowanceCount: firstContent(termFields.additional_driver_allowance_count),
    additionalDriverCost: firstContent(termFields.additional_driver_cost),
    maintenanceService: firstContent(termFields.maintenance_service, product.condition?.maintenance),
    injuryCompensationLimit: firstContent(termFields.injury_compensation_limit, bodilyLegacy.limit),
    injuryDeductible: firstContent(termFields.injury_deductible, bodilyLegacy.deductible),
    propertyCompensationLimit: firstContent(termFields.property_compensation_limit, propertyLegacy.limit),
    propertyDeductible: firstContent(termFields.property_deductible, propertyLegacy.deductible),
    selfBodyAccident: firstContent(termFields.personal_injury_compensation_limit, selfLegacy.limit),
    selfBodyDeductible: firstContent(termFields.personal_injury_deductible, selfLegacy.deductible),
    annualRoadsideAssistance: firstContent(termFields.roadside_assistance),
    uninsuredDamage: firstContent(termFields.uninsured_compensation_limit, uninsuredLegacy.limit),
    uninsuredDeductible: firstContent(termFields.uninsured_deductible, uninsuredLegacy.deductible),
    ownDamageCompensation: firstContent(termFields.own_damage_compensation, ownLegacy.limit),
    ownDamageRepairRatio: firstContent(termFields.own_damage_repair_ratio),
    ownDamageMinDeductible: firstContent(termFields.own_damage_min_deductible, ownLegacy.deductible),
    ownDamageMaxDeductible: firstContent(termFields.own_damage_max_deductible)
  };
}

function renderVehicleInfoSection(product) {
  const rows = [
    rowMaybe('차종구분', product.vehicleClass),
    rowMaybe('최초등록일', normalizeDate(product.firstRegistrationDate)),
    rowMaybe('차령만료일', normalizeDate(product.vehicleAgeExpiryDate)),
    rowMaybe('차량가격', formatMoney(product.vehiclePrice, { zeroAsDash: true })),
    rowMaybe('특이사항', product.partnerMemo, { multiline: true })
  ].join('');

  if (!rows) return '';
  return renderSection('추가정보', rows);
}

function renderRentalSection(product, termFields = {}) {
  const policy = buildPolicyValues(product, termFields);
  const rows = [
    rowMaybe('1만Km추가비용', policy.mileageUpchargePer10000km),
    rowMaybe('보증금분납', policy.depositInstallment),
    rowMaybe('결제방식', policy.paymentMethod),
    rowMaybe('위약금', policy.penaltyCondition, { multiline: true }),
    rowMaybe('보증금카드결제', policy.depositCardPayment),
    rowMaybe('대여지역', policy.rentalRegion),
    rowMaybe('탁송비', policy.deliveryFee),
    rowMaybe('운전연령하향', policy.driverAgeLowering),
    rowMaybe('운전연령하향비용', policy.ageLoweringCost),
    rowMaybe('개인운전자범위', policy.personalDriverScope, { multiline: true }),
    rowMaybe('사업자운전자범위', policy.businessDriverScope, { multiline: true }),
    rowMaybe('추가운전자수', policy.additionalDriverAllowanceCount),
    rowMaybe('추가운전자비용', policy.additionalDriverCost),
    rowMaybe('정비서비스', policy.maintenanceService),
  ].join('');

  if (!rows) return '';
  return renderSection('대여조건', rows);
}

function formatOwnDamageDeductible(policy) {
  const ratio = safeText(policy.ownDamageRepairRatio);
  const min = safeText(policy.ownDamageMinDeductible);
  const max = safeText(policy.ownDamageMaxDeductible);
  const hasRatio = ratio !== '-';
  const hasMin = min !== '-';
  const hasMax = max !== '-';

  if (!hasRatio && !hasMin && !hasMax) return '-';

  const lines = [];
  if (hasRatio) lines.push(`차량수리비의 ${ensurePercentSuffix(ratio)}`);
  if (hasMin || hasMax) {
    const minText = hasMin ? formatDeductibleAmount(min) : '-';
    const maxText = hasMax ? formatDeductibleAmount(max) : '-';
    if (hasMin && hasMax) lines.push(`최소 ${minText}~ 최대 ${maxText}`);
    else if (hasMin) lines.push(`최소 ${minText}`);
    else lines.push(`최대 ${maxText}`);
  }
  return lines.join('\n') || '-';
}

function renderInsuranceSection(product, termFields = {}) {
  const policy = buildPolicyValues(product, termFields);
  const rows = [
    ['대인 I, II 배상', policy.injuryCompensationLimit, policy.injuryDeductible],
    ['대물배상', policy.propertyCompensationLimit, policy.propertyDeductible],
    ['자기신체사고', policy.selfBodyAccident, policy.selfBodyDeductible],
    ['무보험차상해', policy.uninsuredDamage, policy.uninsuredDeductible],
    ['자기차량손해', policy.ownDamageCompensation, formatOwnDamageDeductible(policy)],
    ['긴급출동', policy.annualRoadsideAssistance, '-']
  ].filter(([, limit, deductible]) => {
    const l = String(limit ?? '').trim();
    const d = String(deductible ?? '').trim();
    return (l && l !== '-') || (d && d !== '-');
  }).map(([label, limit, deductible]) => `
      <tr>
        <td>${escapeHtml(label)}</td>
        <td>${escapeHtml(safeText(limit)).replace(/\n/g, '<br>')}</td>
        <td>${escapeHtml(safeText(deductible)).replace(/\n/g, '<br>')}</td>
      </tr>
    `).join('');

  if (!rows) return '';
  return renderSection('차량보험정보', `
    <div class="plist-detail__table-wrap">
      <table class="price-table plist-detail__table plist-detail__table--insurance-summary">
        <thead>
          <tr><th>항목</th><th>한도</th><th>면책금</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `, { card: false });
}

export function renderProductDetailMarkup(product, { activePhotoIndex = 0, termFields = {} } = {}) {
  if (!product) return '<div class="detail-empty">좌측 목록에서 차량을 선택하세요.</div>';
  return `
    <div class="plist-detail" data-photo-sources="${(Array.isArray(product.photos) ? product.photos.filter(Boolean) : []).map((src) => escapeHtml(src)).join('|')}" data-car-no="${escapeHtml(product.carNo || '')}">
      ${renderSection('차량정보', renderSummaryTop(product))}
      ${renderPhotoSection(product, activePhotoIndex)}
      ${renderPriceSection(product, termFields)}
      ${renderInsuranceSection(product, termFields)}
      ${renderRentalSection(product, termFields)}
      ${renderVehicleInfoSection(product)}
    </div>
  `;
}
