function formatMoney(value, { zeroAsDash = true } = {}) {
  if (value === null || value === undefined || value === '') return '-';
  const normalized = String(value).replace(/[^\d.-]/g, '');
  if (!normalized) return '-';
  const number = Number(normalized);
  if (!Number.isFinite(number)) return '-';
  if (number === 0 && zeroAsDash) return '-';
  return `${number.toLocaleString('ko-KR')}원`;
}

function formatMileage(value) {
  const normalized = String(value ?? '').replace(/[^\d.-]/g, '');
  if (!normalized) return '-';
  const number = Number(normalized);
  if (!Number.isFinite(number)) return '-';
  return `${number.toLocaleString('ko-KR')}km`;
}

function normalizePrice(raw) {
  const price = raw?.price || {};
  const pick = (month, key, fallback = 0) => Number(price?.[month]?.[key] || raw?.[`${key}_${month}`] || fallback || 0);
  return {
    '1': { rent: pick('1', 'rent'), deposit: pick('1', 'deposit'), fee: pick('1', 'fee') },
    '6': { rent: pick('6', 'rent'), deposit: pick('6', 'deposit'), fee: pick('6', 'fee') },
    '12': { rent: pick('12', 'rent'), deposit: pick('12', 'deposit'), fee: pick('12', 'fee') },
    '24': { rent: pick('24', 'rent'), deposit: pick('24', 'deposit'), fee: pick('24', 'fee') },
    '36': { rent: pick('36', 'rent'), deposit: pick('36', 'deposit'), fee: pick('36', 'fee') },
    '48': {
      rent: pick('48', 'rent', raw?.rental_price_48 || raw?.rental_price || 0),
      deposit: pick('48', 'deposit', raw?.deposit_48 || raw?.deposit || 0),
      fee: pick('48', 'fee')
    },
    '60': {
      rent: pick('60', 'rent', raw?.rental_price_60 || 0),
      deposit: pick('60', 'deposit', raw?.deposit_60 || 0),
      fee: pick('60', 'fee')
    }
  };
}

const TERM_LABELS = {
  '대인한도 및 면책금': 'injury_limit_deductible',
  '대물한도 및 면책금': 'property_limit_deductible',
  '자손한도 및 면책금': 'personal_injury_limit_deductible',
  '자기신체사고한도 및 면책금': 'personal_injury_limit_deductible',
  '무보험차상해한도 및 면책금': 'uninsured_limit_deductible',
  '자기차량손해한도 및 면책금': 'own_damage_limit_deductible',
  '심사기준': 'screening_criteria',
  '신용등급': 'credit_grade',
  '기본운전연령': 'basic_driver_age',
  '기본운전자연령': 'basic_driver_age',
  '운전연령상한': 'driver_age_upper_limit',
  '운전연령하향': 'driver_age_lowering',
  '연령하향비용': 'age_lowering_cost',
  '연간약정주행거리': 'annual_mileage',
  '결제방식': 'payment_method',
  '수수료환수조건': 'commission_clawback_condition',
  '보험료포함': 'insurance_included',
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
  return { ...(term || {}), ...parsed };
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
  const imageUrl = String(raw?.image_url || '').trim();
  const imageUrls = normalizeImageUrls(raw?.image_urls, imageUrl);
  const photoLink = String(raw?.photo_link || '').trim();
  return {
    id: raw?.product_code || raw?.id || raw?.product_uid || '',
    productUid: raw?.product_uid || raw?.id || raw?.product_code || '',
    productCode: raw?.product_code || raw?.id || raw?.product_uid || '',
    partnerCode: raw?.partner_code || raw?.provider_company_code || '',
    providerUid: raw?.provider_uid || '',
    providerName: raw?.provider_name || '',
    providerCompanyCode: raw?.provider_company_code || raw?.partner_code || '',
    policyCode: raw?.policy_code || raw?.term_code || '',
    termCode: raw?.term_code || raw?.policy_code || '',
    termName: raw?.term_name || raw?.term_type || '',
    vehicleStatus: raw?.vehicle_status || '-',
    productType: raw?.product_type || '-',
    carNo: raw?.car_number || '-',
    maker: raw?.maker || '-',
    model: raw?.model_name || '-',
    subModel: String(raw?.sub_model || '-').replace(/20(\d{2})~/g, '$1~'),
    trim: raw?.trim_name || '-',
    fuel: raw?.fuel_type || '-',
    vehiclePrice: raw?.vehicle_price || 0,
    vehiclePriceDisplay: formatMoney(raw?.vehicle_price, { zeroAsDash: true }),
    mileageValue: Number(raw?.mileage || 0),
    mileageDisplay: formatMileage(raw?.mileage),
    year: raw?.year || '-',
    engineCc: raw?.engine_cc || '-',
    extColor: raw?.ext_color || '-',
    intColor: raw?.int_color || '-',
    optionSummary: raw?.options || '-',
    vehicleClass: raw?.vehicle_class || '-',
    firstRegistrationDate: raw?.first_registration_date || '-',
    vehicleAgeExpiryDate: raw?.vehicle_age_expiry_date || '-',
    partnerMemo: raw?.partner_memo || raw?.note || '-',
    baseAge: raw?.base_age || '-',
    annualMileageDisplay: raw?.annual_mileage || '-',
    insuranceIncluded: raw?.insurance_included || '-',
    pricingBasis: raw?.pricing_basis || '-',
    buyoutMethod: raw?.buyout_method || raw?.pricing_comment || '-',
    ageText: raw?.min_age || '-',
    reviewStatus: raw?.review_status || '-',
    creditGrade: raw?.credit_grade || '-',
    photos: imageUrls,
    photoLink,
    price: normalizePrice(raw || {}),
    policy: {
      ageLowering: raw?.driver_age_lowering || raw?.age_lowering || '-',
      ageLoweringCost: raw?.age_lowering_cost || '-',
      annualMileage: raw?.annual_mileage || '-',
      bodily: raw?.bodily_limit || raw?.injury_limit_deductible || '-',
      property: raw?.property_limit || raw?.property_limit_deductible || '-',
      selfBodily: raw?.personal_injury_limit || raw?.personal_injury_limit_deductible || '-',
      uninsured: raw?.uninsured_limit || raw?.uninsured_limit_deductible || '-',
      ownDamage: raw?.own_damage || raw?.own_damage_limit_deductible || '-',
      paymentMethod: raw?.payment_method || '-'
    },
    condition: {
      detailStatus: raw?.vehicle_sub_status || '-',
      accident: raw?.accident_yn || '-',
      maintenance: raw?.maintenance_service || '-',
      immediate: raw?.ready_ship_yn || '-',
      delivery: raw?.delivery_yn || '-',
      emergency: raw?.emergency_service || raw?.roadside_assistance || raw?.emergency_count || '-',
      rentalRegion: raw?.rental_region || '-',
      deliveryFee: raw?.delivery_fee || '-',
      penaltyRate: raw?.penalty_rate || '-',
      note: raw?.note || raw?.partner_memo || '-'
    }
  };
}
