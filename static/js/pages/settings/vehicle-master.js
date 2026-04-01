import { replaceVehicleMaster } from '../../firebase/firebase-db.js';
import {
  buildColorOptions,
  buildOptions,
  escapeHtml,
  formatDateTime,
  getMakerPriority,
  getModelPriority,
  normalizeHeader,
  normalizeVehicleMasterRows,
  parseCsv,
  renderSelectOptions
} from './helpers.js';

export function createVehicleMasterController({ elements, getProfile }) {
  const {
    linkInput, applyButton, clearButton, message, sourceValue,
    testMaker, testModel, testSubModel, testExtColor, testIntColor,
    countMaker, countModel, countSubModel, countExtColor, countIntColor, updatedAt, updatedBy
  } = elements;

  let currentVehicleMasterItems = [];
  let eventsBound = false;

  function setVehicleMasterMeta(meta = {}) {
    countMaker.textContent = String(meta.makerCount || 0);
    countModel.textContent = String(meta.modelCount || 0);
    countSubModel.textContent = String(meta.subModelCount || 0);
    countExtColor.textContent = String(meta.extColorCount || 0);
    countIntColor.textContent = String(meta.intColorCount || 0);
    updatedAt.textContent = formatDateTime(meta.updatedAt);
    const sourceText = meta.sourceFile || '-';
    sourceValue.textContent = sourceText;
    sourceValue.title = sourceText;
    updatedBy.textContent = meta.updatedBy || '-';
  }

  function setVehicleMasterBusy(isBusy = false) {
    if (applyButton) applyButton.disabled = isBusy;
    if (clearButton) clearButton.disabled = isBusy;
    if (linkInput) linkInput.disabled = isBusy;
  }

  async function fetchVehicleMasterTextByLink(sourceUrl = '') {
    const response = await fetch('/api/vehicle-master/fetch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_url: sourceUrl })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) throw new Error(payload.message || '차종 마스터 링크를 읽지 못했습니다.');
    return payload;
  }

  function refreshVehicleMasterTestSelects(selections = {}) {
    const makerValue = String(selections.maker || testMaker?.value || '').trim();
    const modelValue = String(selections.model_name || testModel?.value || '').trim();
    const subModelValue = String(selections.sub_model || testSubModel?.value || '').trim();
    const makerOptions = buildOptions(currentVehicleMasterItems, { valueKey: 'maker', labelKey: 'maker', rankKey: 'maker_rank', priorityFn: (_, value) => getMakerPriority(value) });
    renderSelectOptions(testMaker, makerOptions, '제조사 선택');
    if (makerOptions.some((item) => item.value === makerValue)) testMaker.value = makerValue;
    const modelSource = currentVehicleMasterItems.filter((item) => !makerValue || item.maker === makerValue);
    const modelOptions = buildOptions(modelSource, { valueKey: 'model_name', labelKey: 'model_name', rankKey: 'model_rank', priorityFn: (item, value) => getModelPriority(item?.maker, value) });
    renderSelectOptions(testModel, modelOptions, makerValue ? '모델명 선택' : '제조사를 먼저 선택');
    if (modelOptions.some((item) => item.value === modelValue)) testModel.value = modelValue;
    const subModelSource = modelSource.filter((item) => !modelValue || item.model_name === modelValue);
    const subModelOptions = buildOptions(subModelSource, { valueKey: 'sub_model', labelKey: 'sub_model', rankKey: 'model_rank', yearKey: 'sub_model_year', yearDesc: true });
    renderSelectOptions(testSubModel, subModelOptions, modelValue ? '세부모델 선택' : '모델명을 먼저 선택');
    if (subModelOptions.some((item) => item.value === subModelValue)) testSubModel.value = subModelValue;
    const selectedSubModelItems = subModelSource.filter((item) => !subModelValue || item.sub_model === subModelValue);
    renderSelectOptions(testExtColor, buildColorOptions(selectedSubModelItems, 'exterior_colors'), '외부색상 선택');
    renderSelectOptions(testIntColor, buildColorOptions(selectedSubModelItems, 'interior_colors'), '내부색상 선택');
    const extValue = String(selections.ext_color || '').trim();
    const intValue = String(selections.int_color || '').trim();
    if ([...testExtColor.options].some((option) => option.value === extValue)) testExtColor.value = extValue;
    if ([...testIntColor.options].some((option) => option.value === intValue)) testIntColor.value = intValue;
  }

  async function handleVehicleMasterApply() {
    const sourceUrl = String(linkInput?.value || '').trim();
    if (!sourceUrl) throw new Error('차종 마스터 구글시트 링크를 입력하세요.');
    setVehicleMasterBusy(true);
    message.textContent = '차종 마스터를 불러오는 중입니다...';
    try {
      const payload = await fetchVehicleMasterTextByLink(sourceUrl);
      const rows = parseCsv(payload.text || '');
      if (!rows.length) throw new Error('차종 마스터 시트가 비어 있습니다.');
      const headers = rows[0].map((value) => normalizeHeader(value));
      const required = ['maker', 'model_name', 'sub_model', 'vehicle_category', 'exterior_colors', 'interior_colors'];
      const missing = required.filter((key) => !headers.includes(key));
      if (missing.length) throw new Error('필수 컬럼(제조사, 모델명, 세부모델명, 차종분류, 외부색상, 내부색상)을 확인하세요.');
      const entries = normalizeVehicleMasterRows(rows.slice(1).map((row) => {
        const item = {};
        headers.forEach((header, index) => { item[header] = row[index] ?? ''; });
        return item;
      }));
      if (!entries.length) throw new Error('반영 가능한 차종 데이터가 없습니다.');
      const profile = getProfile();
      await replaceVehicleMaster({ entries, fileName: payload.source_url || sourceUrl, updatedBy: profile?.uid || '', updatedByName: profile?.name || profile?.email || '' });
      message.textContent = `차종/색상 마스터 적용 완료: ${entries.length}건`;
    } finally {
      setVehicleMasterBusy(false);
    }
  }

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;
    applyButton?.addEventListener('click', async () => {
      try { await handleVehicleMasterApply(); } catch (error) { setVehicleMasterBusy(false); message.textContent = error.message; }
    });
    clearButton?.addEventListener('click', () => { if (linkInput) linkInput.value = ''; message.textContent = '입력한 링크를 비웠습니다.'; });
    linkInput?.addEventListener('input', () => { message.textContent = ''; });
    testMaker?.addEventListener('change', () => refreshVehicleMasterTestSelects({ maker: testMaker.value, model_name: '', sub_model: '', ext_color: '', int_color: '' }));
    testModel?.addEventListener('change', () => refreshVehicleMasterTestSelects({ maker: testMaker.value, model_name: testModel.value, sub_model: '', ext_color: '', int_color: '' }));
    testSubModel?.addEventListener('change', () => refreshVehicleMasterTestSelects({ maker: testMaker.value, model_name: testModel.value, sub_model: testSubModel.value, ext_color: testExtColor?.value || '', int_color: testIntColor?.value || '' }));
  }

  function applySnapshot(payload) {
    const items = payload?.items || [];
    currentVehicleMasterItems = items;
    setVehicleMasterMeta({
      makerCount: new Set(items.map((item) => item.maker)).size,
      modelCount: new Set(items.map((item) => `${item.maker}__${item.model_name}`)).size,
      subModelCount: items.length,
      extColorCount: new Set(items.flatMap((item) => item.exterior_colors || [])).size,
      intColorCount: new Set(items.flatMap((item) => item.interior_colors || [])).size,
      updatedAt: payload?.updated_at || 0,
      sourceFile: payload?.source_file || '-',
      updatedBy: payload?.updated_by_name || payload?.updated_by || '-'
    });
    refreshVehicleMasterTestSelects();
  }

  return { bindEvents, applySnapshot };
}
