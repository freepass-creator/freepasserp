import { CODE_BOUND_FIELDS, DEFAULT_SELECT_VALUES, LINKED_SPEC_FIELDS, SELECT_PLACEHOLDER_TEXT, STATIC_SELECT_OPTIONS, YEAR_SELECT_OPTIONS } from './fields.js';

const PRIORITY_ORDER_MAX = 1000000;
const MAKER_PRIORITY = [
  '현대', '기아', '제네시스', 'KG모빌리티', '쉐보레', '르노코리아',
  'BMW', '벤츠', '아우디', '폭스바겐', '볼보', '렉서스', '토요타', '혼다', '닛산', '인피니티',
  '미니', '랜드로버', '포드', '링컨', '지프', '포르쉐', '테슬라', 'BYD', '폴스타'
];

const MAKER_PRIORITY_MAP = new Map(MAKER_PRIORITY.map((maker, index) => [String(maker || '').trim(), index + 1]));
const MODEL_PRIORITY_BY_MAKER = {
  '현대': ['아반떼', '쏘나타', '그랜저', '아이오닉5', '아이오닉6', '코나', '투싼', '싼타페', '팰리세이드', '스타리아', '캐스퍼'],
  '기아': ['K3', 'K5', 'K8', 'K9', '모닝', '레이', '니로', '셀토스', '스포티지', '쏘렌토', '카니발', 'EV3', 'EV6', 'EV9'],
  '제네시스': ['G70', 'G80', 'G90', 'GV60', 'GV70', 'GV80'],
  'KG모빌리티': ['티볼리', '코란도', '토레스', '렉스턴', '렉스턴 스포츠'],
  '쉐보레': ['스파크', '트랙스', '트레일블레이저', '말리부', '이쿼녹스', '트래버스'],
  '르노코리아': ['SM3', 'SM6', 'XM3', 'QM6', '그랑 콜레오스'],
  'BMW': ['1시리즈', '2시리즈', '3시리즈', '4시리즈', '5시리즈', '7시리즈', 'X1', 'X3', 'X5', 'X7', 'i4', 'i5', 'iX'],
  '벤츠': ['A클래스', 'C클래스', 'E클래스', 'S클래스', 'CLA', 'GLA', 'GLB', 'GLC', 'GLE', 'GLS', 'EQE', 'EQS'],
  '아우디': ['A3', 'A4', 'A6', 'A7', 'Q3', 'Q5', 'Q7', 'Q8', 'e-tron'],
  '폭스바겐': ['골프', '제타', '아테온', '티구안', '투아렉', 'ID.4'],
  '볼보': ['S60', 'S90', 'XC40', 'XC60', 'XC90', 'C40'],
  '렉서스': ['ES', 'LS', 'NX', 'RX', 'UX'],
  '토요타': ['캠리', '프리우스', '라브4', '시에나'],
  '혼다': ['어코드', 'CR-V', '파일럿'],
  '닛산': ['알티마', '패스파인더'],
  '인피니티': ['Q50', 'QX50'],
  '미니': ['쿠퍼', '클럽맨', '컨트리맨'],
  '랜드로버': ['레인지로버 이보크', '디스커버리 스포츠', '디펜더'],
  '포드': ['머스탱', '익스플로러', '레인저'],
  '링컨': ['노틸러스', '에비에이터'],
  '지프': ['레니게이드', '랭글러', '그랜드 체로키'],
  '포르쉐': ['마칸', '카이엔', '타이칸', '파나메라'],
  '테슬라': ['모델3', '모델Y', '모델S', '모델X'],
  'BYD': ['아토3', '씰', '씰 U'],
  '폴스타': ['폴스타 2', '폴스타 4']
};
const MODEL_PRIORITY_MAP_BY_MAKER = new Map(Object.entries(MODEL_PRIORITY_BY_MAKER).map(([maker, models]) => [maker, new Map(models.map((model, index) => [model, index + 1]))]));

function normalizeSelectItems(items = []) {
  const map = new Map();
  (items || []).forEach((item) => {
    if (item == null) return;
    const value = typeof item === 'object' ? String(item.value ?? '').trim() : String(item).trim();
    if (!value || map.has(value)) return;
    const label = typeof item === 'object' ? String(item.label ?? value).trim() || value : value;
    map.set(value, { value, label });
  });
  return [...map.values()];
}

function toCodeOption(item) {
  const value = String(item?.name || item?.code || '').trim();
  const label = String(item?.display_name || item?.name || item?.code || '').trim() || value;
  return { value, label };
}

function buildStaticOptions(fieldId, items = []) {
  const preferred = STATIC_SELECT_OPTIONS[fieldId] || [];
  const itemMap = new Map((items || []).map((item) => {
    const option = toCodeOption(item);
    return [option.value, option];
  }));
  const ordered = [];
  const seen = new Set();
  preferred.forEach((value) => {
    if (itemMap.has(value)) {
      ordered.push(itemMap.get(value));
      seen.add(value);
      return;
    }
    ordered.push({ value, label: value });
    seen.add(value);
  });
  [...itemMap.values()].forEach((option) => {
    if (seen.has(option.value)) return;
    ordered.push(option);
  });
  return ordered;
}

function normalizeMakerPriorityLabel(value = '') {
  return String(value || '').trim();
}

function getMakerPriority(value = '') {
  return MAKER_PRIORITY_MAP.get(normalizeMakerPriorityLabel(value)) || PRIORITY_ORDER_MAX;
}

function getModelPriority(maker = '', modelName = '') {
  const makerKey = normalizeMakerPriorityLabel(maker);
  const modelMap = MODEL_PRIORITY_MAP_BY_MAKER.get(makerKey);
  if (!modelMap) return PRIORITY_ORDER_MAX;
  return modelMap.get(String(modelName || '').trim()) || PRIORITY_ORDER_MAX;
}

export function createProductSelectController(deps = {}) {
  const {
    getField,
    registerPageCleanup,
    escapeHtml,
    currentProfile,
    setCurrentProfile,
    getAllProducts,
    getVehicleMasterEntries,
    getCodeGroupItems,
    watchCodeItemsByGroup,
    watchPartners,
    watchTermsByProvider,
    setReadOnlyByRole,
    syncProductCodePreview,
    onLinkedSpecChanged,
    onRefreshVehicleSpecSelects,
    enforceVehicleClassFieldOrder
  } = deps;

  let partnerNameByCode = new Map();
  let stopPolicyTermsWatch = null;

  function buildLinkedOptions(groupCode, productKey, filterFn = () => true) {
    const products = typeof getAllProducts === 'function' ? getAllProducts() : [];
    const normalized = [];
    const seen = new Set();
    products.filter(filterFn).forEach((product) => {
      const value = String(product?.[productKey] || '').trim();
      if (!value || seen.has(value)) return;
      seen.add(value);
      normalized.push({ value, label: value });
    });
    return normalized.sort((a, b) => a.value.localeCompare(b.value, 'ko'));
  }

  function getProductMetricMap(productKey, filterFn = () => true) {
    const metrics = new Map();
    const products = typeof getAllProducts === 'function' ? getAllProducts() : [];
    products.filter(filterFn).forEach((product) => {
      const value = String(product?.[productKey] || '').trim();
      if (!value) return;
      const current = metrics.get(value) || { count: 0, latestYear: 0 };
      current.count += 1;
      current.latestYear = Math.max(current.latestYear, Number(product?.year || 0) || 0);
      metrics.set(value, current);
    });
    return metrics;
  }

  function getFilteredVehicleMasterEntries(selections = {}) {
    const maker = String(selections.maker ?? getField('maker')?.value ?? '').trim();
    const modelName = String(selections.model_name ?? getField('model_name')?.value ?? '').trim();
    const subModel = String(selections.sub_model ?? getField('sub_model')?.value ?? '').trim();
    const entries = typeof getVehicleMasterEntries === 'function' ? getVehicleMasterEntries() : [];
    return (entries || []).filter((item) => {
      const makerMatched = !maker || String(item?.maker || '').trim() === maker;
      const modelMatched = !modelName || String(item?.model_name || '').trim() === modelName;
      const subModelMatched = !subModel || String(item?.sub_model || '').trim() === subModel;
      return makerMatched && modelMatched && subModelMatched;
    });
  }

  function buildColorOptionsFromEntries(list = [], key = 'exterior_colors') {
    const ordered = [];
    const seen = new Set();
    list.forEach((item) => {
      const values = Array.isArray(item?.[key]) ? item[key] : [];
      values.forEach((color) => {
        const value = String(color || '').trim();
        if (!value || seen.has(value)) return;
        seen.add(value);
        ordered.push({ value, label: value });
      });
    });
    return ordered;
  }

  function buildColorOptionsFromProducts(productKey, filterFn = () => true) {
    const ordered = [];
    const seen = new Set();
    const products = typeof getAllProducts === 'function' ? getAllProducts() : [];
    products.filter(filterFn).forEach((product) => {
      const value = String(product?.[productKey] || '').trim();
      if (!value || seen.has(value)) return;
      seen.add(value);
      ordered.push({ value, label: value });
    });
    return ordered.sort((a, b) => a.value.localeCompare(b.value, 'ko'));
  }

  function buildMasterOptions(list = [], options = {}) {
    const { valueKey = 'value', labelKey = 'label', rankKey = '', metrics = new Map(), yearKey = '', yearDesc = false, priorityFn = null, labelTransform = null } = options;
    const map = new Map();
    list.forEach((item, index) => {
      const value = String(item?.[valueKey] || '').trim();
      if (!value) return;
      const rawLabel = String(item?.[labelKey] || value).trim();
      const label = typeof labelTransform === 'function' ? labelTransform(rawLabel) : rawLabel;
      const rankValue = Number(item?.[rankKey] || 0) || 0;
      const yearValue = Number(item?.[yearKey] || 0) || 0;
      const priorityValue = typeof priorityFn === 'function' ? Number(priorityFn(item, value, label, index)) : PRIORITY_ORDER_MAX;
      const current = map.get(value) || { value, label, rank: rankValue, year: yearValue, priority: priorityValue, order: index + 1 };
      if (rankKey && rankValue) current.rank = current.rank ? Math.min(current.rank, rankValue) : rankValue;
      if (yearKey && yearValue) current.year = Math.max(current.year || 0, yearValue);
      if (Number.isFinite(priorityValue)) current.priority = Math.min(Number(current.priority || PRIORITY_ORDER_MAX), priorityValue);
      current.order = Math.min(current.order, index + 1);
      map.set(value, current);
    });
    return [...map.values()].sort((a, b) => {
      const priorityA = Number(a.priority || PRIORITY_ORDER_MAX);
      const priorityB = Number(b.priority || PRIORITY_ORDER_MAX);
      if (priorityA !== priorityB) return priorityA - priorityB;
      if (rankKey) {
        const rankA = Number(a.rank || 0);
        const rankB = Number(b.rank || 0);
        if (rankA || rankB) {
          if (!rankA) return 1;
          if (!rankB) return -1;
          if (rankA !== rankB) return rankA - rankB;
        }
      }
      if (yearKey) {
        const yearA = Number(a.year || 0);
        const yearB = Number(b.year || 0);
        if (yearA !== yearB) return yearDesc ? yearB - yearA : yearA - yearB;
      }
      const metricA = metrics.get(a.value) || { count: 0, latestYear: 0 };
      const metricB = metrics.get(b.value) || { count: 0, latestYear: 0 };
      if (metricB.count !== metricA.count) return metricB.count - metricA.count;
      if (metricB.latestYear !== metricA.latestYear) return metricB.latestYear - metricA.latestYear;
      if (a.order !== b.order) return a.order - b.order;
      return a.value.localeCompare(b.value, 'ko');
    }).map((item) => ({ value: item.value, label: item.label }));
  }

  function renderSelectOptions(fieldId, items = [], options = {}) {
    const field = getField(fieldId);
    if (!field) return;
    const placeholder = options.placeholder ?? SELECT_PLACEHOLDER_TEXT;
    const previousValue = String(options.selectedValue ?? field.value ?? '').trim();
    const defaultValue = String(options.defaultValue ?? DEFAULT_SELECT_VALUES[fieldId] ?? '').trim();
    const normalized = normalizeSelectItems(items);
    const valueSet = new Set(normalized.map((item) => item.value));
    if (previousValue && !valueSet.has(previousValue)) {
      normalized.unshift({ value: previousValue, label: previousValue });
    }
    field.innerHTML = [`<option value="">${escapeHtml(placeholder)}</option>`, ...normalized.map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label || item.value)}</option>`)].join('');
    field.value = previousValue && normalized.some((item) => item.value === previousValue) ? previousValue : '';
    if (!field.value && defaultValue && normalized.some((item) => item.value === defaultValue)) field.value = defaultValue;
    field.disabled = Boolean(options.disabled);
  }

  function renderYearSelectOptions(selectedValue = undefined) {
    renderSelectOptions('year', YEAR_SELECT_OPTIONS, { selectedValue: selectedValue ?? getField('year')?.value ?? '' });
  }

  function getLinkedVehicleClass(selections = {}) {
    const filteredEntries = getFilteredVehicleMasterEntries(selections);
    if (!filteredEntries.length) return '';
    const candidates = [...new Set(filteredEntries.map((item) => String(item?.vehicle_category || '').trim()).filter(Boolean))];
    if (!candidates.length) return '';
    return candidates[0] || '';
  }

  function syncLinkedVehicleClass(selections = {}, options = {}) {
    const field = getField('vehicle_class');
    if (!field) return '';
    const fallbackValue = String(options.fallbackValue ?? field.value ?? '').trim();
    const linkedValue = getLinkedVehicleClass(selections) || fallbackValue;
    field.value = linkedValue;
    return linkedValue;
  }

  function refreshVehicleColorSelects(selections = {}) {
    const extColorValue = selections.ext_color ?? getField('ext_color')?.value ?? '';
    const intColorValue = selections.int_color ?? getField('int_color')?.value ?? '';
    const vehicleMasterEntries = typeof getVehicleMasterEntries === 'function' ? getVehicleMasterEntries() : [];
    if (vehicleMasterEntries.length) {
      const extOptions = buildColorOptionsFromEntries(vehicleMasterEntries, 'exterior_colors');
      const intOptions = buildColorOptionsFromEntries(vehicleMasterEntries, 'interior_colors');
      renderSelectOptions('ext_color', extOptions, { selectedValue: extColorValue, placeholder: '선택', disabled: false });
      renderSelectOptions('int_color', intOptions, { selectedValue: intColorValue, placeholder: '선택', disabled: false });
      return;
    }
    const extOptions = buildColorOptionsFromProducts('ext_color', () => true);
    const intOptions = buildColorOptionsFromProducts('int_color', () => true);
    renderSelectOptions('ext_color', extOptions, { selectedValue: extColorValue, placeholder: '선택', disabled: false });
    renderSelectOptions('int_color', intOptions, { selectedValue: intColorValue, placeholder: '선택', disabled: false });
  }

  function refreshVehicleSpecSelects(selections = {}) {
    const makerValue = selections.maker ?? getField('maker')?.value ?? '';
    const modelValue = selections.model_name ?? getField('model_name')?.value ?? '';
    const subModelValue = selections.sub_model ?? getField('sub_model')?.value ?? '';
    const vehicleMasterEntries = typeof getVehicleMasterEntries === 'function' ? getVehicleMasterEntries() : [];

    if (vehicleMasterEntries.length) {
      const makerMetrics = getProductMetricMap('maker');
      renderSelectOptions('maker', buildMasterOptions(vehicleMasterEntries, { valueKey: 'maker', labelKey: 'maker', rankKey: 'maker_rank', metrics: makerMetrics, priorityFn: (item) => getMakerPriority(item?.maker) }), { selectedValue: makerValue, disabled: false });
      const currentMaker = getField('maker')?.value ?? makerValue;
      const modelMetrics = getProductMetricMap('model_name', (product) => String(product?.maker || '').trim() === currentMaker);
      const modelEntries = currentMaker ? vehicleMasterEntries.filter((item) => String(item?.maker || '').trim() === currentMaker) : [];
      renderSelectOptions('model_name', buildMasterOptions(modelEntries, { valueKey: 'model_name', labelKey: 'model_name', rankKey: 'model_rank', metrics: modelMetrics, priorityFn: (item) => getModelPriority(currentMaker, item?.model_name) }), { selectedValue: modelValue, placeholder: currentMaker ? '선택' : '제조사 먼저 선택', disabled: !currentMaker });
      const currentModel = getField('model_name')?.value ?? modelValue;
      const subModelMetrics = getProductMetricMap('sub_model', (product) => String(product?.maker || '').trim() === currentMaker && String(product?.model_name || '').trim() === currentModel);
      const subModelEntries = currentMaker && currentModel ? vehicleMasterEntries.filter((item) => String(item?.maker || '').trim() === currentMaker && String(item?.model_name || '').trim() === currentModel) : [];
      renderSelectOptions('sub_model', buildMasterOptions(subModelEntries, { valueKey: 'sub_model', labelKey: 'sub_model', yearKey: 'sub_model_year', yearDesc: true, metrics: subModelMetrics, labelTransform: (l) => l.replace(/20(\d{2})~/g, '$1~') }), { selectedValue: subModelValue, placeholder: currentModel ? '선택' : '모델명 먼저 선택', disabled: !currentModel });
    } else {
      renderSelectOptions('maker', buildLinkedOptions('PRODUCT_MAKER', 'maker'), { selectedValue: makerValue, disabled: false });
      const currentMaker = getField('maker')?.value ?? makerValue;
      const modelOptions = currentMaker ? buildLinkedOptions('PRODUCT_MODEL_NAME', 'model_name', (product) => String(product?.maker || '').trim() === currentMaker) : [];
      renderSelectOptions('model_name', modelOptions, { selectedValue: modelValue, placeholder: currentMaker ? '선택' : '제조사 먼저 선택', disabled: !currentMaker });
      const currentModel = getField('model_name')?.value ?? modelValue;
      const subModelOptions = currentMaker && currentModel ? buildLinkedOptions('PRODUCT_SUB_MODEL', 'sub_model', (product) => String(product?.maker || '').trim() === currentMaker && String(product?.model_name || '').trim() === currentModel) : [];
      renderSelectOptions('sub_model', subModelOptions, { selectedValue: subModelValue, placeholder: currentModel ? '선택' : '모델명 먼저 선택', disabled: !currentModel });
    }

    const finalMaker = getField('maker')?.value ?? makerValue;
    const finalModel = getField('model_name')?.value ?? modelValue;
    const finalSubModel = getField('sub_model')?.value ?? subModelValue;
    syncLinkedVehicleClass({ maker: finalMaker, model_name: finalModel, sub_model: finalSubModel }, { fallbackValue: vehicleMasterEntries.length ? '' : (getField('vehicle_class')?.value ?? '') });
    refreshVehicleColorSelects(selections);
    onRefreshVehicleSpecSelects?.();
  }

  function bindCodeSelects() {
    CODE_BOUND_FIELDS.forEach(([fieldId, groupCode]) => {
      const field = getField(fieldId);
      if (!field) return;
      registerPageCleanup(watchCodeItemsByGroup(groupCode, (items) => {
        const codeGroupItems = typeof getCodeGroupItems === 'function' ? getCodeGroupItems() : {};
        codeGroupItems[groupCode] = items || [];
        if (LINKED_SPEC_FIELDS.has(fieldId)) {
          onLinkedSpecChanged?.();
          refreshVehicleSpecSelects();
          return;
        }
        if (STATIC_SELECT_OPTIONS[fieldId]) {
          renderSelectOptions(fieldId, buildStaticOptions(fieldId, items), { defaultValue: DEFAULT_SELECT_VALUES[fieldId] || '' });
          return;
        }
        renderSelectOptions(fieldId, (items || []).map(toCodeOption));
      }));
    });
  }

  function getPartnerNameByCode(code = '') {
    return partnerNameByCode.get(String(code || '').trim()) || '';
  }

  function startPolicyTermWatch(selectedValue = undefined) {
    const profile = typeof currentProfile === 'function' ? currentProfile() : null;
    const providerCode = String(getField('partner_code')?.value || profile?.company_code || '').trim();
    stopPolicyTermsWatch?.();
    stopPolicyTermsWatch = null;
    if (!providerCode) {
      renderSelectOptions('policy_code', [], { selectedValue: selectedValue ?? '' });
      return;
    }
    stopPolicyTermsWatch = watchTermsByProvider(providerCode, (terms) => {
      renderSelectOptions('policy_code', terms.map((item) => ({
        value: item.term_code || item.term_name || '',
        label: item.term_name && item.term_code && item.term_name !== item.term_code ? `${item.term_code} · ${item.term_name}` : (item.term_code || item.term_name || '')
      })), { selectedValue: selectedValue ?? getField('policy_code')?.value ?? '' });
    });
  }

  function bindPartnerCodeSelect() {
    const field = getField('partner_code');
    if (!field) return;
    registerPageCleanup(watchPartners((partners) => {
      const profile = typeof currentProfile === 'function' ? currentProfile() : null;
      const providerPartners = (partners || []).filter((item) => (item?.partner_type || '') === 'provider');
      partnerNameByCode = new Map(providerPartners.map((item) => [String(item.partner_code || '').trim(), String(item.partner_name || '').trim()]));
      const visiblePartners = profile?.role === 'admin' ? providerPartners : providerPartners.filter((item) => (item.partner_code || '') === (profile?.company_code || ''));
      const forcedValue = profile?.role === 'admin' ? field.value : (profile?.company_code || field.value || '');
      renderSelectOptions('partner_code', visiblePartners.map((item) => ({ value: item.partner_code || '', label: item.partner_name ? `${item.partner_code} / ${item.partner_name}` : (item.partner_code || '') })), { selectedValue: forcedValue });
      if (forcedValue) field.value = forcedValue;
      setReadOnlyByRole?.();
      syncProductCodePreview?.();
      startPolicyTermWatch(getField('policy_code')?.value || '');
    }));
  }

  function bindPolicyCodeSelect() {
    const field = getField('policy_code');
    const partnerField = getField('partner_code');
    if (!field) return;
    startPolicyTermWatch();
    partnerField?.addEventListener('change', () => {
      startPolicyTermWatch('');
      syncProductCodePreview?.();
    });
    registerPageCleanup(() => stopPolicyTermsWatch?.());
  }

  function getSelectedPolicyMeta() {
    const field = getField('policy_code');
    const code = String(field?.value || '').trim();
    const selectedText = String(field?.selectedOptions?.[0]?.textContent || '').trim();
    if (!code) return { code: '', name: '' };
    const dotLabel = `${code} · `;
    if (selectedText.startsWith(dotLabel)) {
      return { code, name: selectedText.slice(dotLabel.length).trim() || code };
    }
    return { code, name: selectedText || code };
  }

  function bindVehicleSpecLinks() {
    const makerField = getField('maker');
    const modelField = getField('model_name');
    const subModelField = getField('sub_model');

    function resetSpecDependents() {
      const trimField = getField('trim_name');
      if (trimField) trimField.value = '';
      enforceVehicleClassFieldOrder?.();
    }

    makerField?.addEventListener('change', () => {
      resetSpecDependents();
      refreshVehicleSpecSelects({ maker: makerField.value, model_name: '', sub_model: '', ext_color: '', int_color: '' });
    });
    modelField?.addEventListener('change', () => {
      resetSpecDependents();
      refreshVehicleSpecSelects({ maker: makerField?.value || '', model_name: modelField.value, sub_model: '', ext_color: '', int_color: '' });
    });
    subModelField?.addEventListener('change', () => {
      resetSpecDependents();
      refreshVehicleSpecSelects({ maker: makerField?.value || '', model_name: modelField?.value || '', sub_model: subModelField.value, ext_color: getField('ext_color')?.value || '', int_color: getField('int_color')?.value || '' });
    });
  }

  return {
    refreshVehicleSpecSelects,
    renderYearSelectOptions,
    getLinkedVehicleClass,
    syncLinkedVehicleClass,
    bindCodeSelects,
    getPartnerNameByCode,
    bindPartnerCodeSelect,
    bindPolicyCodeSelect,
    getSelectedPolicyMeta,
    bindVehicleSpecLinks
  };
}
