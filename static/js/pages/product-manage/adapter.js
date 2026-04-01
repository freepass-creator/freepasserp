export function buildProductPayload(context = {}) {
  const {
    FIELD_IDS = [],
    FIELD_NUMBERS,
    getField,
    currentProfile,
    getPartnerNameByCode,
    getSelectedPolicyMeta,
    getStoredImageUrls,
    normalizeDateText,
    inferYearFromDateText,
    getLinkedVehicleClass
  } = context;

  const payload = {};
  FIELD_IDS.forEach((id) => {
    const field = getField(id);
    if (!field) return;
    const raw = field.value ?? '';
    payload[id] = FIELD_NUMBERS?.has(id) ? Number(String(raw || '').replace(/[^\d.-]/g, '') || 0) : String(raw || '').trim();
  });

  payload.first_registration_date = normalizeDateText(payload.first_registration_date || '');
  payload.vehicle_age_expiry_date = normalizeDateText(payload.vehicle_age_expiry_date || '');
  const inferredYear = inferYearFromDateText(payload.first_registration_date || '');
  if (!String(payload.year || '').trim() && inferredYear) payload.year = inferredYear;
  payload.vehicle_class = getLinkedVehicleClass({ maker: payload.maker, model_name: payload.model_name, sub_model: payload.sub_model }) || payload.vehicle_class || '';

  const partnerCode = currentProfile?.role === 'provider'
    ? String(currentProfile?.company_code || '').trim()
    : String(payload.partner_code || currentProfile?.company_code || '').trim();
  const partnerName = currentProfile?.role === 'provider'
    ? String(currentProfile?.company_name || '').trim()
    : getPartnerNameByCode(partnerCode);
  const selectedPolicy = getSelectedPolicyMeta();
  const imageUrls = getStoredImageUrls();
  const imageUrl = imageUrls[0] || '';

  return {
    partner_code: partnerCode,
    provider_company_code: partnerCode,
    provider_uid: currentProfile?.role === 'provider' ? currentProfile.uid : '',
    provider_name: partnerName || currentProfile?.company_name || '',
    created_by_uid: currentProfile?.uid || '',
    created_by_role: currentProfile?.role || '',
    policy_code: selectedPolicy.code || payload.policy_code,
    term_code: selectedPolicy.code || payload.policy_code,
    term_name: selectedPolicy.name || payload.policy_code,
    vehicle_status: payload.vehicle_status,
    product_type: payload.product_type,
    car_number: payload.car_number,
    maker: payload.maker,
    model_name: payload.model_name,
    sub_model: payload.sub_model,
    trim_name: payload.trim_name,
    fuel_type: payload.fuel_type,
    vehicle_price: payload.vehicle_price,
    mileage: payload.mileage,
    year: payload.year,
    vehicle_class: payload.vehicle_class,
    first_registration_date: payload.first_registration_date,
    vehicle_age_expiry_date: payload.vehicle_age_expiry_date,
    partner_memo: payload.partner_memo,
    note: payload.partner_memo,
    ext_color: payload.ext_color,
    int_color: payload.int_color,
    options: payload.options,
    photo_link: payload.photo_link,
    rental_price_48: payload.rent_48,
    deposit_48: payload.deposit_48,
    rental_price_60: payload.rent_60,
    deposit_60: payload.deposit_60,
    rental_price: payload.rent_48,
    deposit: payload.deposit_48,
    image_url: imageUrl,
    image_urls: imageUrls,
    image_count: imageUrls.length,
    price: {
      '1': { rent: payload.rent_1, deposit: payload.deposit_1, fee: payload.fee_1 },
      '12': { rent: payload.rent_12, deposit: payload.deposit_12, fee: payload.fee_12 },
      '24': { rent: payload.rent_24, deposit: payload.deposit_24, fee: payload.fee_24 },
      '36': { rent: payload.rent_36, deposit: payload.deposit_36, fee: payload.fee_36 },
      '48': { rent: payload.rent_48, deposit: payload.deposit_48, fee: payload.fee_48 },
      '60': { rent: payload.rent_60, deposit: payload.deposit_60, fee: payload.fee_60 }
    }
  };
}

export function fillProductForm(product, context = {}) {
  const {
    setMode,
    editingCodeInput,
    setLastSelectedProductCode,
    setProductCodeDisplay,
    dedupeImageUrls,
    setStoredImageUrls,
    clearRemovedStoredImageUrls,
    FIELD_IDS = [],
    getField,
    inferYearFromDateText,
    normalizeDateText,
    ensureSelectValue,
    FIELD_NUMBERS,
    formatCommaNumber,
    startPolicyTermWatch,
    syncLinkedVehicleClass,
    refreshVehicleSpecSelects,
    setReadOnlyByRole,
    syncProductCodePreview,
    clearPendingFiles,
    renderCurrentPreview,
    renderFilteredList,
    syncSelectedSummaryRow,
    deleteButton,
    applyFormMode
  } = context;

  setMode?.('edit');
  editingCodeInput.value = product.product_uid || product.product_code || '';
  setLastSelectedProductCode?.(product.product_uid || product.product_code || '');
  setProductCodeDisplay(product.product_code || '');
  const existingUrls = dedupeImageUrls(product.image_urls || []).length
    ? dedupeImageUrls(product.image_urls || [])
    : dedupeImageUrls(product.image_url || '');
  const selectedPolicyCode = product.policy_code || product.term_code || '';
  setStoredImageUrls(existingUrls);
  clearRemovedStoredImageUrls();
  FIELD_IDS.forEach((id) => {
    const field = getField(id);
    if (!field) return;
    let value = '';
    if (id in product) value = product[id];
    if (!value && id === 'partner_code') value = product.partner_code || product.provider_company_code || '';
    if (!value && id === 'year') value = product.year || inferYearFromDateText(product.first_registration_date || '') || '';
    if (!value && id === 'policy_code') value = product.policy_code || product.term_code || '';
    if (!value && id === 'partner_memo') value = product.partner_memo || product.note || '';
    if (id === 'first_registration_date' || id === 'vehicle_age_expiry_date') value = normalizeDateText(value || '');
    if (!value && id === 'rent_48') value = product.rent_48 ?? product.rental_price_48 ?? product.rental_price ?? '';
    if (!value && id === 'deposit_48') value = product.deposit_48 ?? product.deposit_48 ?? product.deposit ?? '';
    if (!value && id.startsWith('rent_')) value = product.price?.[id.split('_')[1]]?.rent ?? '';
    if (!value && id.startsWith('deposit_')) value = product.price?.[id.split('_')[1]]?.deposit ?? '';
    if (!value && id.startsWith('fee_')) value = product.price?.[id.split('_')[1]]?.fee ?? '';
    if (field.tagName === 'SELECT') {
      ensureSelectValue(field, value ?? '');
    } else if (FIELD_NUMBERS?.has(id)) {
      const numericText = String(value ?? '').trim();
      field.value = field.type === 'number' ? numericText.replace(/[^\d.-]/g, '') : formatCommaNumber(numericText);
    } else {
      field.value = value ?? '';
    }
  });
  startPolicyTermWatch(selectedPolicyCode);
  syncLinkedVehicleClass({ maker: product.maker || '', model_name: product.model_name || '', sub_model: product.sub_model || '' }, { fallbackValue: product.vehicle_class || '' });
  refreshVehicleSpecSelects({
    maker: product.maker || '',
    model_name: product.model_name || '',
    sub_model: product.sub_model || '',
    ext_color: product.ext_color || '',
    int_color: product.int_color || '',
    trim_name: product.trim_name || ''
  });
  setReadOnlyByRole();
  syncProductCodePreview(product.product_code || '');
  clearPendingFiles();
  applyFormMode('view');
  renderCurrentPreview();
  renderFilteredList();
  syncSelectedSummaryRow();
  deleteButton.disabled = false;
}
