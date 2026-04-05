const SHEET_HEADER_ALIASES = {
  '공급사코드': 'partner_code',
  '파트너코드': 'partner_code',
  'partner_code': 'partner_code',
  '정책코드': 'policy_code',
  'policy_code': 'policy_code',
  '차량번호': 'car_number',
  'car_number': 'car_number',
  '차량상태': 'vehicle_status',
  'vehicle_status': 'vehicle_status',
  '상품구분': 'product_type',
  'product_type': 'product_type',
  '제조사': 'maker',
  'maker': 'maker',
  '모델명': 'model_name',
  'model_name': 'model_name',
  '세부모델': 'sub_model',
  'sub_model': 'sub_model',
  '세부트림': 'trim_name',
  'trim_name': 'trim_name',
  '선택옵션': 'options',
  'options': 'options',
  '차량가격': 'vehicle_price',
  '차량 가격': 'vehicle_price',
  'vehicle_price': 'vehicle_price',
  '외부색상': 'ext_color',
  'ext_color': 'ext_color',
  '내부색상': 'int_color',
  'int_color': 'int_color',
  '연식': 'year',
  '연 식': 'year',
  'year': 'year',
  '최초등록일': 'first_registration_date',
  '최초 등록일': 'first_registration_date',
  'first_registration_date': 'first_registration_date',
  '차령만료일': 'vehicle_age_expiry_date',
  '차령 만료일': 'vehicle_age_expiry_date',
  'vehicle_age_expiry_date': 'vehicle_age_expiry_date',
  '주행거리': 'mileage',
  '주행 거리': 'mileage',
  'mileage': 'mileage',
  '연료': 'fuel_type',
  'fuel_type': 'fuel_type',
  '차종구분': 'vehicle_class',
  '차종 구분': 'vehicle_class',
  '차종분류': 'vehicle_class',
  '차종 분류': 'vehicle_class',
  '차급구분': 'vehicle_class',
  '차급 구분': 'vehicle_class',
  'vehicle_class': 'vehicle_class',
  '배기량': 'engine_cc',
  'engine_cc': 'engine_cc',
  '사진링크': 'photo_link',
  '사진 링크': 'photo_link',
  'photo_link': 'photo_link',
  '기본연령': 'base_age',
  '기본 연령': 'base_age',
  'base_age': 'base_age',
  '약정주행거리': 'annual_mileage',
  '약정 주행거리': 'annual_mileage',
  'contract_mileage': 'annual_mileage',
  'annual_mileage': 'annual_mileage',
  '보험료포함': 'insurance_included',
  '보험료 포함': 'insurance_included',
  'insurance_included': 'insurance_included',
  '만기인수방법': 'buyout_method',
  '만기 인수방법': 'buyout_method',
  'buyout_method': 'buyout_method',
  '심사상태': 'review_status',
  'review_status': 'review_status',
  '신용등급': 'credit_grade',
  'credit_grade': 'credit_grade',
  '최소연령': 'min_age',
  '최소 연령': 'min_age',
  'min_age': 'min_age',
  '연령하향비용': 'age_lowering_cost',
  '연령 하향비용': 'age_lowering_cost',
  'age_lowering_cost': 'age_lowering_cost',
  '정비서비스': 'maintenance_service',
  'maintenance_service': 'maintenance_service',
  '긴급출동서비스': 'emergency_service',
  '긴급 출동서비스': 'emergency_service',
  'emergency_service': 'emergency_service',
  '대여지역': 'rental_region',
  'rental_region': 'rental_region',
  '탁송료': 'delivery_fee',
  'delivery_fee': 'delivery_fee',
  '중도해지위약금율': 'penalty_rate',
  '중도 해지 위약금율': 'penalty_rate',
  'penalty_rate': 'penalty_rate',
  '특이사항': 'note',
  'note': 'note',
  '1개월대여료': 'rent_1',
  'rent_1': 'rent_1',
  '1개월보증금': 'deposit_1',
  'deposit_1': 'deposit_1',
  '1개월수수료': 'fee_1',
  'fee_1': 'fee_1',
  '12개월대여료': 'rent_12',
  'rent_12': 'rent_12',
  '12개월보증금': 'deposit_12',
  'deposit_12': 'deposit_12',
  '12개월수수료': 'fee_12',
  'fee_12': 'fee_12',
  '24개월대여료': 'rent_24',
  'rent_24': 'rent_24',
  '24개월보증금': 'deposit_24',
  'deposit_24': 'deposit_24',
  '24개월수수료': 'fee_24',
  'fee_24': 'fee_24',
  '36개월대여료': 'rent_36',
  'rent_36': 'rent_36',
  '36개월보증금': 'deposit_36',
  'deposit_36': 'deposit_36',
  '36개월수수료': 'fee_36',
  'fee_36': 'fee_36',
  '48개월대여료': 'rent_48',
  'rent_48': 'rent_48',
  '48개월보증금': 'deposit_48',
  'deposit_48': 'deposit_48',
  '48개월수수료': 'fee_48',
  'fee_48': 'fee_48',
  '60개월대여료': 'rent_60',
  'rent_60': 'rent_60',
  '60개월보증금': 'deposit_60',
  'deposit_60': 'deposit_60',
  '60개월수수료': 'fee_60',
  'fee_60': 'fee_60'
};

const SHEET_VALUE_ALIASES = {
  product_type: {
    '장기렌트': '중고렌트',
    '재렌트': '중고렌트',
    '재렌탈': '중고렌트',
    '신차장기렌트': '신차렌트',
    '장기구독': '중고구독',
    '재구독': '중고구독',
    '신차장기구독': '신차구독'
  }
};

function parseHeaderKey(value) {
  const text = String(value || '').trim();
  const compactText = text.replace(/\s+/g, '');
  const labelText = text.replace(/\([^)]*\)\s*$/, '').trim();
  const compactLabelText = labelText.replace(/\s+/g, '');
  const match = text.match(/\(([^)]+)\)\s*$/);
  const rawKey = match ? match[1].trim() : text;

  return SHEET_HEADER_ALIASES[text]
    || SHEET_HEADER_ALIASES[compactText]
    || SHEET_HEADER_ALIASES[labelText]
    || SHEET_HEADER_ALIASES[compactLabelText]
    || SHEET_HEADER_ALIASES[rawKey]
    || rawKey;
}

function normalizeImportedValue(key, value) {
  const text = String(value || '').trim();
  const valueMap = SHEET_VALUE_ALIASES[key];
  if (valueMap && valueMap[text]) return valueMap[text];
  return text;
}

function parseCsv(text) {
  return Array.from((function* () {
    const rows = [];
    let cur = '';
    let row = [];
    let inQuotes = false;
    for (let i = 0; i < text.length; i += 1) {
      const c = text[i];
      const next = text[i + 1];
      if (c === '"') {
        if (inQuotes && next === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        row.push(cur);
        cur = '';
      } else if ((c === '\n' || c === '\r') && !inQuotes) {
        if (c === '\r' && next === '\n') i += 1;
        row.push(cur);
        rows.push(row);
        row = [];
        cur = '';
      } else {
        cur += c;
      }
    }
    if (cur.length || row.length) {
      row.push(cur);
      rows.push(row);
    }
    yield* rows;
  })());
}

function convertGoogleSheetUrlToCsv(url) {
  const match = String(url || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new Error('구글시트 주소 형식이 올바르지 않습니다.');
  const spreadsheetId = match[1];
  const gidMatch = String(url).match(/[?&#]gid=([0-9]+)/);
  const gid = gidMatch ? gidMatch[1] : '0';
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
}

export function createGoogleSheetImporter(config) {
  const {
    importAllowedFields,
    fieldNumbers,
    getLinkedVehicleClass,
    normalizeDateText,
    inferYearFromDateText,
    buildBasePayload,
    getPartnerNameByCode,
    currentProfile,
    saveProduct,
    setStatus
  } = config;

  const getCurrentProfile = typeof currentProfile === 'function' ? currentProfile : () => currentProfile;

  function normalizeImportedRow(rowObj) {
    const payload = {};
    Object.entries(rowObj).forEach(([key, value]) => {
      const normalizedKey = SHEET_HEADER_ALIASES[key] || key;
      if (!importAllowedFields.has(normalizedKey)) return;
      let clean = normalizeImportedValue(normalizedKey, value);
      if (normalizedKey === 'first_registration_date' || normalizedKey === 'vehicle_age_expiry_date') {
        clean = normalizeDateText(clean);
      }
      const nextValue = fieldNumbers.has(normalizedKey) ? Number(String(clean).replace(/[^\d.-]/g, '') || 0) : clean;
      payload[normalizedKey] = nextValue;
      if (normalizedKey === 'annual_mileage') {
        payload.contract_mileage = nextValue;
      }
    });
    const inferredYear = inferYearFromDateText(payload.first_registration_date || '');
    if (!String(payload.year || '').trim() && inferredYear) payload.year = inferredYear;
    payload.vehicle_class = getLinkedVehicleClass({ maker: payload.maker, model_name: payload.model_name, sub_model: payload.sub_model }) || payload.vehicle_class || '';
    const profile = getCurrentProfile() || null;
    if (profile?.role === 'provider') payload.partner_code = profile?.company_code || '';
    if (!payload.partner_code) payload.partner_code = profile?.company_code || '';
    if (!payload.policy_code) payload.policy_code = '';
    return payload;
  }

  const REQUIRED_HEADERS = ['car_number', 'maker', 'model_name'];

  function validateHeaders(headers) {
    const missing = REQUIRED_HEADERS.filter(req => !headers.includes(req));
    if (missing.length > 0) {
      const labels = missing.map(k => {
        const label = Object.entries(SHEET_HEADER_ALIASES).find(([, v]) => v === k);
        return label ? label[0] : k;
      });
      throw new Error(`필수 컬럼이 없습니다: ${labels.join(', ')}\n구글시트 규격을 확인하세요.`);
    }
  }

  async function fetchAndParseSheet(url) {
    const csvUrl = convertGoogleSheetUrlToCsv(url);
    const response = await fetch(csvUrl);
    if (!response.ok) throw new Error(`구글시트 데이터를 가져오지 못했습니다: ${url}`);
    const text = await response.text();
    const rows = parseCsv(text).filter((row) => row.some((cell) => String(cell || '').trim() !== ''));
    if (rows.length < 2) throw new Error('반영할 데이터가 없습니다.');
    const headers = rows[0].map(parseHeaderKey);
    validateHeaders(headers);
    return { headers, dataRows: rows.slice(1) };
  }

  return async function applyGoogleSheet(url) {
    const normalizedUrl = String(url || '').trim();
    if (!normalizedUrl) throw new Error('구글시트 주소를 입력하세요.');

    // 여러 URL 지원 (줄바꿈 또는 쉼표로 구분)
    const urls = normalizedUrl.split(/[\n,]+/).map(u => u.trim()).filter(Boolean);
    let allHeaders = null;
    let allDataRows = [];

    for (const sheetUrl of urls) {
      const { headers, dataRows } = await fetchAndParseSheet(sheetUrl);
      if (!allHeaders) allHeaders = headers;
      allDataRows = allDataRows.concat(dataRows.map(row => ({ headers, row })));
    }

    const headers = allHeaders;
    const dataRows = allDataRows;

    let importedCount = 0;
    for (const entry of dataRows) {
      const rowHeaders = entry.headers || headers;
      const row = entry.row || entry;
      const rowObj = {};
      rowHeaders.forEach((header, idx) => {
        rowObj[header] = row[idx] ?? '';
      });

      const payload = normalizeImportedRow(rowObj);
      if (!payload.car_number) continue;

      const profile = getCurrentProfile() || null;

      const savePayload = {
        ...buildBasePayload(),
        ...payload,
        partner_code: profile?.role === 'provider'
          ? (profile?.company_code || '')
          : (payload.partner_code || profile?.company_code || ''),
        provider_company_code: profile?.role === 'provider'
          ? (profile?.company_code || '')
          : (payload.partner_code || profile?.company_code || ''),
        provider_name: profile?.role === 'provider'
          ? (profile?.company_name || '')
          : (getPartnerNameByCode(payload.partner_code || profile?.company_code || '') || ''),
        policy_code: payload.policy_code || '',
        term_code: payload.policy_code || '',
        term_name: payload.policy_code || '',
        base_age: payload.base_age || '',
        annual_mileage: payload.annual_mileage || payload.contract_mileage || '',
        vehicle_class: payload.vehicle_class || '',
        contract_mileage: payload.contract_mileage || payload.annual_mileage || '',
        insurance_included: payload.insurance_included || '',
        buyout_method: payload.buyout_method || '',
        review_status: payload.review_status || '',
        credit_grade: payload.credit_grade || '',
        min_age: payload.min_age || '',
        age_lowering_cost: payload.age_lowering_cost || '',
        maintenance_service: payload.maintenance_service || '',
        emergency_service: payload.emergency_service || '',
        rental_region: payload.rental_region || '',
        delivery_fee: payload.delivery_fee || '',
        penalty_rate: payload.penalty_rate || '',
        note: payload.note || payload.partner_memo || '',
        rental_price_48: payload.rent_48 || 0,
        deposit_48: payload.deposit_48 || 0,
        rental_price_60: payload.rent_60 || 0,
        deposit_60: payload.deposit_60 || 0,
        rental_price: payload.rent_48 || 0,
        deposit: payload.deposit_48 || 0,
        price: {
          '1': { rent: payload.rent_1 || 0, deposit: payload.deposit_1 || 0, fee: payload.fee_1 || 0 },
          '12': { rent: payload.rent_12 || 0, deposit: payload.deposit_12 || 0, fee: payload.fee_12 || 0 },
          '24': { rent: payload.rent_24 || 0, deposit: payload.deposit_24 || 0, fee: payload.fee_24 || 0 },
          '36': { rent: payload.rent_36 || 0, deposit: payload.deposit_36 || 0, fee: payload.fee_36 || 0 },
          '48': { rent: payload.rent_48 || 0, deposit: payload.deposit_48 || 0, fee: payload.fee_48 || 0 },
          '60': { rent: payload.rent_60 || 0, deposit: payload.deposit_60 || 0, fee: payload.fee_60 || 0 }
        }
      };

      try {
        await saveProduct(savePayload);
        importedCount += 1;
      } catch (error) {
        console.warn('행 반영 실패', payload.car_number, error);
      }
    }

    setStatus(`구글시트 반영 완료: ${importedCount}건`, 'success');
  };
}
