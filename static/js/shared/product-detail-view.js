import { renderBadge } from './badge.js';
import { safeText, escapeHtml } from '../core/management-format.js';

function hasContent(value) {
  return String(value ?? '').trim() !== '' && String(value ?? '').trim() !== '-';
}

function formatMileage(value) {
  const n = Number(value || 0);
  return n ? `${n.toLocaleString('ko-KR')}km` : '-';
}

function formatYearShort(value) {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  if (!digits) return '-';
  return `${digits.length >= 4 ? digits.slice(-2) : digits}년식`;
}

function formatEngineCc(value) {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  return digits ? `${Number(digits).toLocaleString('ko-KR')}cc` : '-';
}

function formatMoney(value, suffix = '원') {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  return digits ? `${Number(digits).toLocaleString('ko-KR')}${suffix}` : '-';
}

function inlineValue(left, right) {
  return `${safeText(left)} / ${safeText(right)}`;
}

function normalizePrice(raw) {
  const price = raw.price || {};
  const pick = (month, key, fallback = 0) => Number(price?.[month]?.[key] || raw[`${key}_${month}`] || fallback || 0);
  return {
    '1': { rent: pick('1', 'rent'), deposit: pick('1', 'deposit'), fee: pick('1', 'fee') },
    '6': { rent: pick('6', 'rent'), deposit: pick('6', 'deposit'), fee: pick('6', 'fee') },
    '12': { rent: pick('12', 'rent'), deposit: pick('12', 'deposit'), fee: pick('12', 'fee') },
    '24': { rent: pick('24', 'rent'), deposit: pick('24', 'deposit'), fee: pick('24', 'fee') },
    '36': { rent: pick('36', 'rent'), deposit: pick('36', 'deposit'), fee: pick('36', 'fee') },
    '48': { rent: pick('48', 'rent', raw.rental_price_48 || raw.rental_price || 0), deposit: pick('48', 'deposit', raw.deposit_48 || raw.deposit || 0), fee: pick('48', 'fee') },
    '60': { rent: pick('60', 'rent', raw.rental_price_60 || 0), deposit: pick('60', 'deposit', raw.deposit_60 || 0), fee: pick('60', 'fee') }
  };
}

const TERM_LABELS = {
  '대인한도 및 면책금': 'injury_limit_deductible',
  '대물한도 및 면책금': 'property_limit_deductible',
  '자손한도 및 면책금': 'personal_injury_limit_deductible',
  '자기신체사고한도 및 면책금': 'personal_injury_limit_deductible',
  '무보험차상해한도 및 면책금': 'uninsured_limit_deductible',
  '자기차량손해한도 및 면책금': 'own_damage_limit_deductible',
  '기본운전연령': 'basic_driver_age',
  '운전연령하향': 'driver_age_lowering',
  '연령하향비용': 'age_lowering_cost',
  '연간약정주행거리': 'annual_mileage',
  '결제방식': 'payment_method',
  '긴급출동': 'roadside_assistance'
};

function parseTermContent(content) {
  const fields = {};
  String(content || '').split(/\r?\n/).forEach((line) => {
    const raw = String(line || '').trim();
    if (!raw) return;
    const idx = raw.indexOf(':');
    if (idx === -1) return;
    const label = raw.slice(0, idx).trim();
    const value = raw.slice(idx + 1).trim();
    const key = TERM_LABELS[label];
    if (key && value) fields[key] = value;
  });
  return fields;
}

export function extractTermFields(term) {
  const parsed = parseTermContent(term?.content || '');
  const direct = {};
  Object.values(TERM_LABELS).forEach((key) => {
    const value = String(term?.[key] || '').trim();
    if (value) direct[key] = value;
  });
  return { ...parsed, ...direct };
}

function normalizeImageUrls(value, fallback = '') {
  const urls = [];
  const append = (input) => {
    if (Array.isArray(input)) {
      input.forEach(append);
      return;
    }
    const text = String(input || '').trim();
    if (!text) return;
    if (text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          parsed.forEach(append);
          return;
        }
      } catch (error) {}
    }
    urls.push(text);
  };
  append(value);
  append(fallback);
  return [...new Set(urls.filter(Boolean))];
}

export function normalizeProduct(raw) {
  const imageUrl = String(raw.image_url || '').trim();
  const imageUrls = normalizeImageUrls(raw.image_urls, imageUrl);
  const photoLink = String(raw.photo_link || '').trim();
  return {
    id: raw.product_uid || raw.product_code || raw.id || '',
    productUid: raw.product_uid || raw.id || raw.product_code || '',
    productCode: raw.product_code || raw.id || '',
    partnerCode: raw.partner_code || raw.provider_company_code || '',
    providerUid: raw.provider_uid || '',
    providerName: raw.provider_name || '',
    providerCompanyCode: raw.provider_company_code || raw.partner_code || '',
    policyCode: raw.policy_code || raw.term_code || '',
    vehicleStatus: raw.vehicle_status || '-',
    productType: raw.product_type || '-',
    carNo: raw.car_number || '-',
    maker: raw.maker || '-',
    model: raw.model_name || '-',
    subModel: String(raw.sub_model || '-').replace(/20(\d{2})~/g, '$1~'),
    trim: raw.trim_name || '-',
    fuel: raw.fuel_type || '-',
    vehiclePrice: raw.vehicle_price || 0,
    vehiclePriceDisplay: formatMoney(raw.vehicle_price),
    mileageValue: Number(raw.mileage || 0),
    mileageDisplay: formatMileage(raw.mileage),
    year: raw.year || '-',
    engineCc: raw.engine_cc || '-',
    extColor: raw.ext_color || '-',
    intColor: raw.int_color || '-',
    optionSummary: raw.options || '-',
    baseAge: raw.base_age || '-',
    annualMileageDisplay: raw.annual_mileage || '-',
    insuranceIncluded: raw.insurance_included || '-',
    pricingBasis: raw.pricing_basis || '-',
    buyoutMethod: raw.buyout_method || raw.pricing_comment || '-',
    ageText: raw.min_age || '-',
    reviewStatus: raw.review_status || '-',
    creditGrade: raw.credit_grade || '-',
    photos: imageUrls,
    photoLink,
    price: normalizePrice(raw),
    policy: {
      ageLowering: raw.driver_age_lowering || raw.age_lowering || '-',
      ageLoweringCost: raw.age_lowering_cost || '-',
      annualMileage: raw.annual_mileage || '-',
      bodily: raw.bodily_limit || raw.injury_limit_deductible || '-',
      property: raw.property_limit || raw.property_limit_deductible || '-',
      selfBodily: raw.personal_injury_limit || raw.personal_injury_limit_deductible || '-',
      uninsured: raw.uninsured_limit || raw.uninsured_limit_deductible || '-',
      ownDamage: raw.own_damage || raw.own_damage_limit_deductible || '-',
      paymentMethod: raw.payment_method || '-'
    },
    condition: {
      detailStatus: raw.vehicle_sub_status || '-',
      accident: raw.accident_yn || '-',
      maintenance: raw.maintenance_service || '-',
      immediate: raw.ready_ship_yn || '-',
      delivery: raw.delivery_yn || '-',
      emergency: raw.emergency_service || raw.roadside_assistance || raw.emergency_count || '-',
      rentalRegion: raw.rental_region || '-',
      deliveryFee: raw.delivery_fee || '-',
      penaltyRate: raw.penalty_rate || '-',
      note: raw.note || raw.partner_memo || '-'
    }
  };
}

function detailItem(label, value, modifier = '') {
  return `<div class="detail-item ${modifier}"><span class="detail-label">${escapeHtml(label)}</span><span class="detail-value">${escapeHtml(safeText(value))}</span></div>`;
}

function detailPair(labelLeft, valueLeft, labelRight, valueRight) {
  return detailItem(`${labelLeft} / ${labelRight}`, inlineValue(valueLeft, valueRight), 'detail-item--inline');
}

function detailLong(label, value) {
  return `<div class="detail-item detail-item--stack"><span class="detail-label">${escapeHtml(label)}</span><div class="detail-value detail-value--multiline">${escapeHtml(safeText(value)).replace(/\n/g, '<br>')}</div></div>`;
}


function splitOptionItems(value) {
  return [...new Set(
    String(value || '')
      .split(/(?:\r?\n|,|\||·)/)
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

function detailOptions(label, value) {
  const items = splitOptionItems(value);
  if (!items.length) return detailItem(label, '-');
  return `
    <div class="detail-item detail-item--options">
      <span class="detail-label">${escapeHtml(label)}</span>
      <div class="detail-value detail-value--options">${items.map((item) => `<span class="detail-option-chip">${escapeHtml(item)}</span>`).join('')}</div>
    </div>
  `;
}

function detailBadgePair(labelLeft, valueLeft, fieldLeft, labelRight, valueRight, fieldRight) {
  return `
    <div class="detail-item detail-item--inline">
      <span class="detail-label">${escapeHtml(`${labelLeft} / ${labelRight}`)}</span>
      <span class="detail-value detail-value--badges">
        ${renderBadge(fieldLeft, valueLeft)}
        ${renderBadge(fieldRight, valueRight)}
      </span>
    </div>
  `;
}

function detailLink(label, href) {
  const url = String(href || '').trim();
  if (!url) return detailItem(label, '없음');
  return `<div class="detail-item"><span class="detail-label">${escapeHtml(label)}</span><a class="detail-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">사진보기</a></div>`;
}

function sectionTitle(title) {
  return `<div class="detail-section-title">${escapeHtml(title)}</div>`;
}

function detailSection(content, extraClass = '', title = '') {
  if (!content) return '';
  return `<section class="detail-section ${extraClass}">${content}</section>`;
}

function parsePolicyCell(value) {
  const text = String(value ?? '').trim();
  if (!text || text === '-') return { limit: '-', deductible: '-' };
  const parts = text.split('/').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return { limit: parts[0], deductible: parts.slice(1).join(' / ') || '-' };
  return { limit: text, deductible: '-' };
}

function getMergedPolicy(product, termFields = {}) {
  return {
    ageText: hasContent(product.ageText) ? product.ageText : (termFields.basic_driver_age || '-'),
    ageLowering: hasContent(product.policy.ageLowering) ? product.policy.ageLowering : (termFields.driver_age_lowering || '-'),
    ageLoweringCost: hasContent(product.policy.ageLoweringCost) ? product.policy.ageLoweringCost : (termFields.age_lowering_cost || '-'),
    annualMileage: hasContent(product.policy.annualMileage) ? product.policy.annualMileage : (termFields.annual_mileage || '-'),
    paymentMethod: hasContent(product.policy.paymentMethod) ? product.policy.paymentMethod : (termFields.payment_method || '-'),
    bodily: hasContent(product.policy.bodily) ? product.policy.bodily : (termFields.injury_limit_deductible || '-'),
    property: hasContent(product.policy.property) ? product.policy.property : (termFields.property_limit_deductible || '-'),
    selfBodily: hasContent(product.policy.selfBodily) ? product.policy.selfBodily : (termFields.personal_injury_limit_deductible || '-'),
    uninsured: hasContent(product.policy.uninsured) ? product.policy.uninsured : (termFields.uninsured_limit_deductible || '-'),
    ownDamage: hasContent(product.policy.ownDamage) ? product.policy.ownDamage : (termFields.own_damage_limit_deductible || '-'),
    emergency: hasContent(product.condition.emergency) ? product.condition.emergency : (termFields.roadside_assistance || '-')
  };
}

function renderPhotoSection(product, activePhotoIndex) {
  const photos = Array.isArray(product.photos) ? product.photos.filter(Boolean) : [];
  const lastIndex = Math.max(photos.length - 1, 0);
  const currentIndex = Math.min(Math.max(Number(activePhotoIndex || 0), 0), lastIndex);
  const active = photos[currentIndex] || photos[0] || '';
  const navDisabledPrev = currentIndex <= 0 ? 'disabled' : '';
  const navDisabledNext = currentIndex >= lastIndex ? 'disabled' : '';
  const photoMain = photos.length
    ? `
      <div class="photo-viewer" data-active-photo-index="${currentIndex}" data-photo-count="${photos.length}">
        <div class="photo-main-wrap">
          <button type="button" class="photo-nav photo-nav--prev" data-photo-step="-1" ${navDisabledPrev} aria-label="이전 사진">‹</button>
          <div class="photo-main">${active ? `<img src="${escapeHtml(active)}" alt="차량사진 ${currentIndex + 1}">` : ''}</div>
          <button type="button" class="photo-nav photo-nav--next" data-photo-step="1" ${navDisabledNext} aria-label="다음 사진">›</button>
        </div>
        <div class="photo-meta-row">
          <span class="photo-counter">${currentIndex + 1} / ${photos.length}</span>
        </div>
      </div>
    `
    : `<div class="photo-main photo-main--empty"><div class="photo-empty-text">등록사진 없음</div></div>`;
  const thumbs = photos.length > 1
    ? `
      <div class="photo-thumb-strip" data-active-photo-index="${currentIndex}" data-photo-count="${photos.length}">
        <button type="button" class="photo-thumb-nav photo-thumb-nav--prev" data-photo-step="-1" ${navDisabledPrev} aria-label="이전 썸네일">‹</button>
        <div class="photo-thumbs">${photos.map((src, idx) => `<button type="button" class="photo-thumb ${idx === currentIndex ? 'is-active' : ''}" data-photo-index="${idx}" aria-label="${idx + 1}번 사진"><img src="${escapeHtml(src)}" alt="${idx + 1}"></button>`).join('')}</div>
        <button type="button" class="photo-thumb-nav photo-thumb-nav--next" data-photo-step="1" ${navDisabledNext} aria-label="다음 썸네일">›</button>
      </div>
    `
    : '';
  const photoMeta = `<div class="detail-grid">${detailItem('등록사진', photos.length ? `${photos.length}장` : '없음')}${detailLink('사진링크', product.photoLink)}</div>`;
  return detailSection(`${photoMain}${thumbs}${photoMeta}`, 'detail-section--photos', '사진');
}

function renderPriceTable(product) {
  const months = ['1', '6', '12', '24', '36', '48', '60'];
  return `<table class="price-table"><thead><tr><th>기간</th><th>대여료</th><th>보증금</th><th>수수료</th></tr></thead><tbody>${months.map((m) => `<tr><td>${m}개월</td><td>${Number(product.price[m]?.rent || 0).toLocaleString('ko-KR')}</td><td>${Number(product.price[m]?.deposit || 0).toLocaleString('ko-KR')}</td><td>${Number(product.price[m]?.fee || 0).toLocaleString('ko-KR')}</td></tr>`).join('')}</tbody></table>`;
}

function renderInsuranceTable(product, termFields) {
  const merged = getMergedPolicy(product, termFields);
  const rows = [
    { item: '대인배상', raw: merged.bodily },
    { item: '대물배상', raw: merged.property },
    { item: '자기신체사고', raw: merged.selfBodily },
    { item: '무보험차상해', raw: merged.uninsured },
    { item: '자기차량손해', raw: merged.ownDamage }
  ];
  return `<table class="price-table insurance-table"><thead><tr><th>항목</th><th>보상한도</th><th>면책금</th></tr></thead><tbody>${rows.map((row) => {
    const parsed = parsePolicyCell(row.raw);
    return `<tr><td>${escapeHtml(row.item)}</td><td>${escapeHtml(parsed.limit)}</td><td>${escapeHtml(parsed.deductible)}</td></tr>`;
  }).join('')}</tbody></table>`;
}

function formatBaseAgeText(value) {
  const text = String(value || '').trim();
  if (!text || text === '-') return '';
  const digits = text.replace(/[^\d]/g, '');
  if (digits && text === digits) return `만 ${Number(digits)}세 이상`;
  return text;
}

function formatAnnualMileageText(value) {
  const text = String(value || '').trim();
  if (!text || text === '-') return '';
  const digits = text.replace(/[^\d]/g, '');
  if (digits && text === digits) return `연 ${Number(digits).toLocaleString('ko-KR')}Km`;
  return text;
}

function formatInsuranceIncludedText(value) {
  const text = String(value || '').trim();
  if (!text || text === '-') return '';
  const lower = text.toLowerCase();
  if (text === 'Y' || lower === 'yes' || text === '포함') return '보험료 포함';
  if (text === 'N' || lower === 'no' || text === '별도') return '보험료 별도';
  return text.includes('보험료') ? text : `보험료 ${text}`;
}

function buildPricingBasisSummary(product) {
  const parts = [
    formatBaseAgeText(product.baseAge),
    formatAnnualMileageText(product.annualMileageDisplay),
    formatInsuranceIncludedText(product.insuranceIncluded)
  ].filter(Boolean);
  return parts.join(', ') || safeText(product.pricingBasis);
}

function renderSpecSection(product) {
  const rows = [
    detailBadgePair('차량상태', product.vehicleStatus, 'vehicle_status', '상품구분', product.productType, 'product_type'),
    detailPair('제조사', product.maker, '세부모델', product.subModel || product.model),
    detailItem('세부트림', product.trim),
    detailOptions('선택옵션', product.optionSummary),
    detailPair('연식', formatYearShort(product.year), '주행거리', product.mileageDisplay),
    detailPair('연료', product.fuel, '배기량', formatEngineCc(product.engineCc)),
    detailPair('외부색상', product.extColor, '내부색상', product.intColor),
    detailItem('차량가격', product.vehiclePriceDisplay)
  ];
  return detailSection(`<div class="detail-grid">${rows.join('')}</div>`, '', '차량정보');
}

function renderPricingSection(product) {
  const rows = [
    detailItem('대표 대여기준', buildPricingBasisSummary(product)),
    detailItem('만기인수방법', product.buyoutMethod || '-')
  ];
  return detailSection(`${renderPriceTable(product)}<div class="detail-grid">${rows.join('')}</div>`, '', '대여료정보');
}

function renderOperationSection(product, termFields) {
  const merged = getMergedPolicy(product, termFields);
  const rows = [
    detailPair('심사여부', product.reviewStatus, '신용등급', product.creditGrade),
    detailPair('정비서비스', product.condition.maintenance, '기본운전자연령', merged.ageText),
    detailPair('운전연령하향', merged.ageLowering, '연령하향비용', merged.ageLoweringCost),
    detailPair('연간약정주행거리', merged.annualMileage, '결제방식', merged.paymentMethod),
    detailPair('긴급출동', merged.emergency, '대여지역', product.condition.rentalRegion),
    detailPair('탁송가능', product.condition.delivery, '탁송비', product.condition.deliveryFee)
  ];
  return detailSection(`<div class="detail-grid">${rows.join('')}</div>`, '', '대여조건');
}

function renderInsuranceSection(product, termFields) {
  return detailSection(renderInsuranceTable(product, termFields), 'detail-section--insurance', '보험');
}

function renderEtcSection(product) {
  const rows = [
    detailPair('차량세부상태', product.condition.detailStatus, '사고여부', product.condition.accident),
    detailPair('즉시출고', product.condition.immediate, '위약금율', product.condition.penaltyRate),
    detailLong('기타사항', product.condition.note)
  ];
  return detailSection(`<div class="detail-grid">${rows.join('')}</div>`, '', '기타');
}

export function renderProductDetailMarkup(product, { activePhotoIndex = 0, termFields = {} } = {}) {
  if (!product) return '<div class="detail-empty">좌측 목록에서 차량을 선택하세요.</div>';
  return `<div class="detail-wrap">${renderSpecSection(product)}${renderPhotoSection(product, activePhotoIndex)}${renderPricingSection(product)}${renderOperationSection(product, termFields)}${renderInsuranceSection(product, termFields)}${renderEtcSection(product)}</div>`;
}

function scrollActiveThumbIntoStrip(root) {
  const thumbStrip = root.querySelector('.photo-thumbs');
  const activeThumb = thumbStrip?.querySelector('.photo-thumb.is-active');
  if (!thumbStrip || !activeThumb) return;

  const stripRect = thumbStrip.getBoundingClientRect();
  const activeRect = activeThumb.getBoundingClientRect();
  const currentLeft = thumbStrip.scrollLeft || 0;
  const targetLeft = currentLeft + (activeRect.left - stripRect.left) - ((stripRect.width - activeRect.width) / 2);

  thumbStrip.scrollTo({
    left: Math.max(0, targetLeft),
    behavior: 'auto'
  });
}

export function bindProductDetailPhotoEvents(root, onSelect) {
  root.querySelectorAll('[data-photo-index]').forEach((node) => {
    node.addEventListener('click', () => {
      const index = Number(node.dataset.photoIndex || 0);
      onSelect(index);
    });
  });
  root.querySelectorAll('[data-photo-step]').forEach((node) => {
    node.addEventListener('click', () => {
      const host = node.closest('[data-photo-count]');
      const count = Number(host?.dataset.photoCount || 0);
      const activeIndex = Number(host?.dataset.activePhotoIndex || 0);
      const step = Number(node.dataset.photoStep || 0);
      if (!count || !step) return;
      const nextIndex = Math.min(Math.max(activeIndex + step, 0), count - 1);
      if (nextIndex !== activeIndex) onSelect(nextIndex);
    });
  });
  scrollActiveThumbIntoStrip(root);
}
