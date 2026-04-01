import { qs, roleLabel } from '../../core/utils.js';

const DOMESTIC_MAKER_ORDER = ['현대', '기아', '제네시스', 'KG모빌리티', '르노코리아', '쉐보레'];
const IMPORT_MAKER_ORDER = ['벤츠', 'BMW', '아우디', '렉서스', '테슬라', '볼보', '폭스바겐', '포르쉐', '랜드로버', '토요타', '미니', '포드', '지프', '혼다', '닛산', '푸조', '링컨', '캐딜락', '마세라티', '벤틀리', '롤스로이스', '람보르기니', '페라리', '맥라렌'];
const MAKER_PRIORITY_ALIASES = {
  '제네시스': '제네시스',
  genesis: '제네시스',
  'kg mobility': 'KG모빌리티',
  'kg모빌리티': 'KG모빌리티',
  kgm: 'KG모빌리티',
  '쌍용': 'KG모빌리티',
  '쌍용자동차': 'KG모빌리티',
  '르노': '르노코리아',
  '르노코리아': '르노코리아',
  renault: '르노코리아',
  'renault korea': '르노코리아',
  '한국gm': '쉐보레',
  gm: '쉐보레',
  chevrolet: '쉐보레',
  '메르세데스-벤츠': '벤츠',
  '메르세데스 벤츠': '벤츠',
  'mercedes-benz': '벤츠',
  'mercedes benz': '벤츠',
  mercedes: '벤츠',
  benz: '벤츠',
  audi: '아우디', lexus: '렉서스', tesla: '테슬라', volvo: '볼보', volkswagen: '폭스바겐', porsche: '포르쉐',
  'land rover': '랜드로버', landrover: '랜드로버', toyota: '토요타', mini: '미니', ford: '포드', jeep: '지프',
  honda: '혼다', nissan: '닛산', peugeot: '푸조', lincoln: '링컨', cadillac: '캐딜락', maserati: '마세라티',
  bentley: '벤틀리', 'rolls-royce': '롤스로이스', 'rolls royce': '롤스로이스', lamborghini: '람보르기니',
  ferrari: '페라리', mclaren: '맥라렌'
};
const MODEL_PRIORITY_BY_MAKER = {
  현대: ['아반떼', '쏘나타', '그랜저', '투싼', '싼타페', '팰리세이드', '코나', '캐스퍼', '스타리아', '아이오닉5', '아이오닉6', '베뉴'],
  기아: ['카니발', '쏘렌토', '스포티지', 'K5', 'K8', 'K3', '셀토스', '쏘울', '모닝', '레이', 'EV6', 'EV9'],
  제네시스: ['G80', 'GV80', 'G90', 'GV70', 'G70', 'GV60'],
  KG모빌리티: ['토레스', '렉스턴', '코란도', '티볼리', '무쏘'],
  르노코리아: ['그랑 콜레오스', 'QM6', 'SM6', 'XM3', '아르카나'],
  쉐보레: ['트랙스', '트레일블레이저', '스파크', '말리부', '이쿼녹스', '콜로라도'],
  벤츠: ['E클래스', 'S클래스', 'C클래스', 'GLC', 'GLE', 'GLS', 'A클래스', 'CLA', 'CLS', 'G클래스'],
  BMW: ['5시리즈', '3시리즈', '7시리즈', 'X5', 'X3', 'X7', 'X6', '4시리즈', '2시리즈', '1시리즈'],
  아우디: ['A6', 'A4', 'A8', 'Q5', 'Q7', 'Q8', 'A7', 'Q4 e-tron'],
  렉서스: ['ES', 'RX', 'NX', 'LS', 'UX'],
  테슬라: ['모델Y', '모델3', '모델X', '모델S'],
  볼보: ['XC60', 'XC90', 'S90', 'S60', 'XC40'],
  폭스바겐: ['티구안', '아테온', '골프', '투아렉', '제타'],
  포르쉐: ['카이엔', '파나메라', '마칸', '타이칸', '911'],
  랜드로버: ['레인지로버', '디펜더', '디스커버리', '레인지로버 스포츠', '레인지로버 벨라'],
  토요타: ['캠리', '라브4', '시에나', '크라운', '프리우스'],
  미니: ['쿠퍼', '컨트리맨', '클럽맨'],
  포드: ['익스플로러', '머스탱', '브롱코', '익스페디션'],
  지프: ['그랜드 체로키', '랭글러', '체로키', '컴패스'],
  혼다: ['어코드', 'CR-V', '오딧세이', '시빅'],
  닛산: ['알티마', '패스파인더', '로그'],
  푸조: ['3008', '5008', '508', '2008'],
  링컨: ['에비에이터', '노틸러스', '컨티넨탈'],
  캐딜락: ['에스컬레이드', 'XT5', 'XT6', 'CT5'],
  마세라티: ['기블리', '르반떼', '콰트로포르테', '그레칼레'],
  벤틀리: ['벤테이가', '플라잉스퍼', '컨티넨탈 GT'],
  롤스로이스: ['고스트', '컬리넌', '팬텀'],
  람보르기니: ['우루스', '우라칸', '아벤타도르'],
  페라리: ['로마', '푸로산게', '296 GTB', 'SF90 스트라달레'],
  맥라렌: ['720S', '750S', 'GT', '아투라']
};
const MAKER_PRIORITY_MAP = new Map([...DOMESTIC_MAKER_ORDER, ...IMPORT_MAKER_ORDER].map((value, index) => [value, index + 1]));
const MODEL_PRIORITY_MAP_BY_MAKER = new Map(Object.entries(MODEL_PRIORITY_BY_MAKER).map(([maker, models]) => [maker, new Map(models.map((model, index) => [model, index + 1]))]));
const PRIORITY_ORDER_MAX = Number.MAX_SAFE_INTEGER;

export const HEADER_ALIASES = {
  '제조사': 'maker', maker: 'maker', '브랜드': 'maker',
  '모델명': 'model_name', '모델': 'model_name', model: 'model_name', model_name: 'model_name',
  '세부모델명': 'sub_model', '세부모델명(erp등록용최종본)': 'sub_model', '세부모델명 (erp 등록용 최종본)': 'sub_model', '세부모델': 'sub_model', submodel: 'sub_model', sub_model: 'sub_model',
  '생산기간': 'production_period', '생산 기간': 'production_period', production_period: 'production_period',
  '코드명': 'model_code', model_code: 'model_code',
  '분류': 'vehicle_category', '차종분류': 'vehicle_category', vehicle_category: 'vehicle_category',
  '외부색상': 'exterior_colors', '외장색상': 'exterior_colors', exterior_colors: 'exterior_colors',
  '내부색상': 'interior_colors', '내장색상': 'interior_colors', interior_colors: 'interior_colors',
  '제조사인기순': 'maker_rank', '제조사순위': 'maker_rank', maker_rank: 'maker_rank',
  '모델인기순': 'model_rank', '모델순위': 'model_rank', model_rank: 'model_rank',
  '세부모델연식': 'sub_model_year', '연식순': 'sub_model_year', sub_model_year: 'sub_model_year'
};

export function normalizeMakerPriorityLabel(value = '') {
  const text = String(value || '').trim();
  const lowered = text.toLowerCase();
  return MAKER_PRIORITY_ALIASES[text] || MAKER_PRIORITY_ALIASES[lowered] || text;
}
export function getMakerPriority(value = '') { return MAKER_PRIORITY_MAP.get(normalizeMakerPriorityLabel(value)) || PRIORITY_ORDER_MAX; }
export function getModelPriority(maker = '', modelName = '') {
  const makerKey = normalizeMakerPriorityLabel(maker);
  const modelMap = MODEL_PRIORITY_MAP_BY_MAKER.get(makerKey);
  if (!modelMap) return PRIORITY_ORDER_MAX;
  return modelMap.get(String(modelName || '').trim()) || PRIORITY_ORDER_MAX;
}
export function escapeHtml(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
export function formatDateTime(value) {
  const timestamp = Number(value || 0);
  if (!timestamp) return '-';
  try { return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(timestamp)); } catch { return '-'; }
}
export function fillProfile(profile = {}) {
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.value = value || ''; };
  set('settings-account-status', statusLabel(profile.status));
  set('settings-account-role', roleLabel(profile.role));
  set('settings-company-code', profile.company_code);
  set('settings-company-name', profile.company_name);
  set('settings-user-code', profile.user_code || profile.admin_code);
  set('settings-email', profile.email);
  set('settings-name', profile.name);
  set('settings-position', profile.position);
  set('settings-phone', profile.phone);
  set('settings-note', profile.note);
}

function statusLabel(status) {
  if (status === 'active') return '승인';
  if (status === 'pending') return '대기';
  if (status === 'rejected') return '반려';
  return status || '-';
}
export function parseCsv(text = '') {
  const source = String(text || '').replace(/^﻿/, '');
  const rows = []; let row = []; let cell = ''; let insideQuotes = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]; const next = source[index + 1];
    if (char === '"') { if (insideQuotes && next === '"') { cell += '"'; index += 1; } else { insideQuotes = !insideQuotes; } continue; }
    if (!insideQuotes && char === ',') { row.push(cell); cell = ''; continue; }
    if (!insideQuotes && (char === '\n' || char === '\r')) { if (char === '\r' && next === '\n') index += 1; row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += char;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
export function normalizeHeader(value = '') {
  const text = String(value || '').trim(); if (!text) return '';
  const lowered = text.toLowerCase();
  const bracketMatch = text.match(/\(([^)]+)\)\s*$/);
  const bracketKey = bracketMatch ? String(bracketMatch[1] || '').trim() : '';
  const bracketLowered = bracketKey.toLowerCase();
  const prefixText = bracketMatch ? text.slice(0, bracketMatch.index).trim() : text;
  const prefixLowered = prefixText.toLowerCase();
  return HEADER_ALIASES[text] || HEADER_ALIASES[lowered] || HEADER_ALIASES[bracketKey] || HEADER_ALIASES[bracketLowered] || HEADER_ALIASES[prefixText] || HEADER_ALIASES[prefixLowered] || bracketKey || prefixText || text;
}
export function parseNumber(value, fallback = null) {
  const cleaned = String(value ?? '').replace(/[^0-9.-]/g, '').trim();
  if (!cleaned) return fallback;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : fallback;
}
export function splitColorValues(value = '') {
  return Array.from(new Map(String(value || '').replace(/[·ㆍ]/g, ',').split(/[,/|\n\r]+/).map((item) => String(item || '').trim()).filter(Boolean).map((item) => [item, item])).values());
}
export function extractProductionStartYear(value = '') {
  const text = String(value || '').trim(); if (!text) return null; const match = text.match(/(19|20)\d{2}/); return match ? Number(match[0]) : null;
}
export function buildDisplaySubModelName(row = {}) {
  const explicit = String(row.sub_model || row.sub_model_name || '').trim();
  const modelName = String(row.model_name || '').trim();
  const modelCode = String(row.model_code || '').trim();
  const baseName = explicit || [modelName, modelCode].filter(Boolean).join(' ').trim();
  const startYear = extractProductionStartYear(row.production_period || row.sub_model_year || '');
  return [baseName, startYear ? `${startYear}~` : ''].filter(Boolean).join(' ').trim();
}
export function normalizeVehicleMasterRows(rows = []) {
  const uniqueMap = new Map();
  rows.forEach((row, rowIndex) => {
    const maker = String(row.maker || '').trim();
    const modelName = String(row.model_name || '').trim();
    const subModel = buildDisplaySubModelName(row);
    if (!maker || !modelName || !subModel) return;
    const key = `${maker}__${modelName}__${subModel}`;
    const makerRank = parseNumber(row.maker_rank, null);
    const modelRank = parseNumber(row.model_rank, null);
    const productionPeriod = String(row.production_period || '').trim();
    const modelCode = String(row.model_code || '').trim();
    const vehicleCategory = String(row.vehicle_category || '').trim();
    const subModelYear = parseNumber(row.sub_model_year, extractProductionStartYear(productionPeriod));
    const exteriorColors = splitColorValues(row.exterior_colors);
    const interiorColors = splitColorValues(row.interior_colors);
    const current = uniqueMap.get(key);
    if (!current) {
      uniqueMap.set(key, { maker, model_name: modelName, sub_model: subModel, production_period: productionPeriod, model_code: modelCode, vehicle_category: vehicleCategory, exterior_colors: exteriorColors, interior_colors: interiorColors, maker_rank: makerRank, model_rank: modelRank, sub_model_year: subModelYear, created_order: rowIndex + 1 });
      return;
    }
    current.maker_rank = current.maker_rank == null ? makerRank : Math.min(current.maker_rank, makerRank ?? current.maker_rank);
    current.model_rank = current.model_rank == null ? modelRank : Math.min(current.model_rank, modelRank ?? current.model_rank);
    current.sub_model_year = Math.max(Number(current.sub_model_year || 0), Number(subModelYear || 0)) || null;
    current.production_period = current.production_period || productionPeriod;
    current.model_code = current.model_code || modelCode;
    current.vehicle_category = current.vehicle_category || vehicleCategory;
    current.exterior_colors = Array.from(new Map([...(current.exterior_colors || []), ...exteriorColors].map((item) => [item, item])).values());
    current.interior_colors = Array.from(new Map([...(current.interior_colors || []), ...interiorColors].map((item) => [item, item])).values());
  });
  return [...uniqueMap.values()];
}
export function renderSelectOptions(selectElement, options = [], placeholder = '선택') {
  if (!selectElement) return;
  const currentValue = String(selectElement.value || '').trim();
  const normalizedOptions = options.filter((item) => String(item?.value || '').trim());
  const exists = normalizedOptions.some((item) => String(item.value) === currentValue);
  selectElement.innerHTML = [`<option value="">${escapeHtml(placeholder)}</option>`, ...normalizedOptions.map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`)].join('');
  if (exists) selectElement.value = currentValue;
}
export function buildOptions(list = [], options = {}) {
  const { valueKey = 'value', labelKey = 'label', rankKey = '', yearKey = '', yearDesc = false, priorityFn = null } = options;
  const map = new Map();
  list.forEach((item, index) => {
    const value = String(item?.[valueKey] || '').trim(); if (!value) return;
    const label = String(item?.[labelKey] || value).trim();
    const rankValue = Number(item?.[rankKey] || 0) || 0;
    const yearValue = Number(item?.[yearKey] || 0) || 0;
    const priorityValue = typeof priorityFn === 'function' ? Number(priorityFn(item, value, label, index)) : PRIORITY_ORDER_MAX;
    const current = map.get(value) || { value, label, rank: rankValue, year: yearValue, priority: priorityValue, order: index + 1 };
    if (rankKey && rankValue) current.rank = current.rank ? Math.min(current.rank, rankValue) : rankValue;
    if (yearKey && yearValue) current.year = Math.max(current.year || 0, yearValue);
    current.priority = Math.min(current.priority || PRIORITY_ORDER_MAX, priorityValue);
    map.set(value, current);
  });
  return [...map.values()].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.rank && b.rank && a.rank !== b.rank) return a.rank - b.rank;
    if (a.rank && !b.rank) return -1;
    if (!a.rank && b.rank) return 1;
    if (yearKey && a.year !== b.year) return yearDesc ? b.year - a.year : a.year - b.year;
    return a.order - b.order;
  }).map(({ value, label }) => ({ value, label }));
}
export function buildColorOptions(list = [], key = 'exterior_colors') {
  return buildOptions(list.flatMap((item) => (item?.[key] || []).map((color) => ({ value: color, label: color, rank: Number(item?.maker_rank || 0) || 0, year: Number(item?.sub_model_year || 0) || 0 }))), { valueKey: 'value', labelKey: 'label', rankKey: 'rank', yearKey: 'year', yearDesc: true });
}
