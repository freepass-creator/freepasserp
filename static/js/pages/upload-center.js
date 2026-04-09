/**
 * upload-center.js — 일괄 업로드 (상품/차량)
 * - 구글시트 또는 CSV 업로드 → 검증 → 보완 → 업로드
 */
import { requireAuth } from '../core/auth-guard.js';
import { saveProduct, fetchProductsOnce, saveCodeItem, watchCodeItems, watchVehicleMaster, watchPartners, watchTerms, addVehicleMasterEntry } from '../firebase/firebase-db.js';
import { showToast, showConfirm } from '../core/toast.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { CAR_MODELS, getMakers, getModels, getSubModels, getCategory } from '../data/car-models.js';
import { getExtColors, getIntColors } from '../data/color-codes.js';
import { STATIC_SELECT_OPTIONS } from '../pages/product-manage/fields.js';

// jpkerp의 car-models.js를 그대로 사용 — 통일된 차종 마스터
const MAKER_ALIAS = {
  'hyundai': '현대', '현대자동차': '현대', '현대차': '현대',
  'kia': '기아', '기아자동차': '기아', '기아차': '기아',
  'genesis': '제네시스', '제네시스자동차': '제네시스',
  'kgm': 'KGM', 'ssangyong': 'KGM', '쌍용': 'KGM', '쌍용자동차': 'KGM',
  'gm': '쉐보레', 'gmkorea': '쉐보레', 'chevrolet': '쉐보레', 'gm대우': '쉐보레',
  'renault': '르노', '르노삼성': '르노', '르노코리아': '르노', 'rsm': '르노',
  '르노(삼성)': '르노', '르노 삼성': '르노',
  'bmw': 'BMW', '비엠더블유': 'BMW',
  // CAR_MODELS는 '벤츠'로 정의됨 — 모든 별칭이 '벤츠'로 통일
  'benz': '벤츠', 'mercedes': '벤츠', '메르세데스': '벤츠',
  '메르세데스-벤츠': '벤츠', '메르세데스벤츠': '벤츠',
  'mercedesbenz': '벤츠', 'mercedes-benz': '벤츠', 'mercedes benz': '벤츠',
  'audi': '아우디', 'volkswagen': '폭스바겐', 'vw': '폭스바겐',
  'porsche': '포르쉐', 'mini': '미니', 'tesla': '테슬라', 'volvo': '볼보',
  'lexus': '렉서스', 'toyota': '토요타', 'honda': '혼다',
};

function norm(s) { return String(s || '').trim(); }
function normLow(s) { return norm(s).toLowerCase().replace(/\s+/g, ''); }

// Levenshtein 거리 — 작을수록 비슷
function levenshtein(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = []; for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      m[i][j] = b[i - 1] === a[j - 1]
        ? m[i - 1][j - 1]
        : Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
    }
  }
  return m[b.length][a.length];
}

// 후보 중 가장 가까운 거 찾기 (입력 길이 대비 비율)
function fuzzyBest(input, candidates) {
  if (!input || !candidates?.length) return null;
  const inLow = normLow(input);
  let best = null; let bestScore = Infinity;
  for (const c of candidates) {
    if (!c) continue;
    const cLow = normLow(c);
    // 부분 포함은 가산점
    if (cLow.includes(inLow) || inLow.includes(cLow)) return { value: c, score: 0 };
    const dist = levenshtein(inLow, cLow);
    const ratio = dist / Math.max(inLow.length, cLow.length);
    if (ratio < bestScore) { best = c; bestScore = ratio; }
  }
  // 50% 이내 차이만 신뢰
  return bestScore <= 0.5 ? { value: best, score: bestScore } : null;
}

// 코드그룹 — input_codes 캐시
let codeItems = []; // [{group_code, item_name}, ...]
function getCodeNames(groupCode) {
  return [...new Set(codeItems.filter(c => c.group_code === groupCode && c.is_active !== false).map(c => c.item_name).filter(Boolean))];
}
async function ensureCode(groupCode, itemName) {
  if (!groupCode || !itemName) return;
  const exists = codeItems.some(c => c.group_code === groupCode && c.item_name === itemName);
  if (exists) return;
  try {
    await saveCodeItem({
      group_code: groupCode,
      item_code: itemName, // 한글 그대로 sanitize 후 키로
      item_name: itemName,
      sort_order: codeItems.filter(c => c.group_code === groupCode).length + 1,
      is_active: true,
      created_by: 'upload-center',
    });
    codeItems.push({ group_code: groupCode, item_name: itemName, is_active: true });
  } catch (e) {
    console.warn('ensureCode failed', groupCode, itemName, e);
  }
}

// freepass vehicle_master (구글시트에서 동기화된 진짜 마스터)
let vmEntries = []; // [{maker, model_name, sub_model, vehicle_category}]

// vehicle_master sub_model 정규화 — 끝의 'YYYY~', 'YY~', 'YY-' 모두 'YY~' 두자리로 통일
function normalizeSubYear(s) {
  if (!s) return '';
  let str = String(s).trim();
  // 끝에 4자리 (예: 2022~ / 2022-)
  str = str.replace(/\s*(\d{4})\s*[~-]\s*$/, (_, y) => ' ' + y.slice(-2) + '~');
  // 끝에 2자리 - 또는 ~
  str = str.replace(/\s*(\d{2})\s*[~-]\s*$/, ' $1~');
  return str.replace(/\s+/g, ' ').trim();
}
// 매칭용 — 끝 연도 떼기
function stripYear(s) {
  return String(s || '').replace(/\s*\d{2,4}\s*[~-]?\s*$/, '').trim();
}
function getVmMakers() {
  const arr = [...new Set(vmEntries.map(e => e.maker))].filter(Boolean);
  return sortByPopMaker(arr);
}
function getVmModels(maker) {
  const arr = [...new Set(vmEntries.filter(e => e.maker === maker).map(e => e.model_name))].filter(Boolean);
  return sortByPopModel(maker, arr);
}
function getVmSubs(maker, model) {
  // 연도 포함된 sub_model 그대로 — 최근 연식이 위로
  const arr = [...new Set(vmEntries.filter(e => e.maker === maker && e.model_name === model).map(e => e.sub_model))].filter(Boolean);
  return sortByRecentSub(arr);
}
function getVmCategory(maker, model, sub) {
  // 정확 매칭 → 연도 빼고 매칭 폴백
  let found = vmEntries.find(e => e.maker === maker && e.model_name === model && e.sub_model === sub);
  if (!found) {
    const subClean = stripYear(sub);
    found = vmEntries.find(e => e.maker === maker && e.model_name === model && stripYear(e.sub_model) === subClean);
  }
  return found?.vehicle_category || '';
}

// 공백/괄호/특수문자 기준으로 의미 있는 토큰 분리 (예: "320i LCI 2" → ["320i","lci","2"])
function splitTokens(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[\s()\[\]{}\-_/,.+]+/)
    .filter(t => t.length >= 2);
}
// 코드성 토큰만 (영숫자 ≥2자, 예: G20, F30, LCI, 320i)
function alnumCodeTokens(s) {
  return splitTokens(s).filter(t => /^[a-z0-9]+$/.test(t));
}

// 트림 텍스트에서 연식 추출 — "26MY", "23년형", "2024년식", "'24" 등
function extractYearFromText(s) {
  const t = String(s || '');
  // 1) 4자리 연도 (2019~2099)
  let m = t.match(/(20\d{2})\s*(?:년|년식|년형|MY|my)?/);
  if (m) return Number(m[1].slice(2, 4));
  // 2) 'YY 형식 (예: '24)
  m = t.match(/'(\d{2})\b/);
  if (m) return Number(m[1]);
  // 3) YY MY / YY년형 / YY년식 (예: 26MY, 23년형) — 단독 2자리는 제외
  m = t.match(/\b(\d{2})\s*(?:MY|my|년형|년식)/);
  if (m) return Number(m[1]);
  return null;
}

// 행 전체에서 추론 컨텍스트 추출 (연식·연료·트림·등록일자·cc·가격·옵션 등)
function buildRowContext(row, input) {
  // 연식 — year 우선, 없으면 first_registration_date, 그 다음 trim_name, input 순
  // (한국 번호판 앞 숫자는 차종분류번호이지 연도가 아님)
  let yy = null;
  const yearRaw = String(row.year || '').replace(/[^\d]/g, '');
  if (yearRaw.length >= 4) yy = Number(yearRaw.slice(2, 4));
  else if (yearRaw.length === 2) yy = Number(yearRaw);
  if (yy == null) {
    const reg = String(row.first_registration_date || '').replace(/[^\d]/g, '');
    if (reg.length === 8) yy = Number(reg.slice(2, 4));
    else if (reg.length === 6) yy = Number(reg.slice(0, 2));
  }
  // 트림에서 연식 단서 — "26MY", "23년형", "'24"
  if (yy == null) yy = extractYearFromText(row.trim_name);
  // 입력 sub_model에서도 추출 시도
  if (yy == null) yy = extractYearFromText(input);

  // 주행거리 → 참고용 약한 신호만 (편차 큼: 주행 적게/많게 타는 차 있음)
  // 1년 25,000km 기준 운행 연수 추정 — 다른 모든 연식 신호가 없을 때만 약하게 활용
  const mileage = Number(String(row.mileage || '').replace(/[^\d]/g, '')) || 0;
  const looksLikeNew = mileage > 0 && mileage < 5000;
  let mileageYy = null;
  if (mileage > 0) {
    const curYy = new Date().getFullYear() % 100;
    const years = Math.round(mileage / 25000);
    mileageYy = curYy - years;
  }
  // ⚠ yy fallback에는 사용 안 함 — 점수 계산 시 약한 가산으로만

  // 엔진 cc — sub_model의 배기량 토큰과 매칭용
  const engineCc = Number(String(row.engine_cc || '').replace(/[^\d]/g, '')) || 0;

  // 차량가격 — 같은 모델 후보들 가격 범위에서 트림 위치 추정
  const vehiclePrice = Number(String(row.vehicle_price || '').replace(/[^\d]/g, '')) || 0;

  // 연료 — fuel_type + trim + 입력 + sub_model 텍스트 종합
  const trim = String(row.trim_name || '');
  const fuel = String(row.fuel_type || '').toLowerCase();
  const blob = `${fuel} ${trim} ${input || ''}`.toLowerCase();
  const isEV = /전기|ev|electric/.test(blob);
  const isHybrid = /하이브리드|hybrid|hev/.test(blob);
  const isDiesel = /디젤|diesel/.test(blob);
  const isGasoline = /가솔린|gasoline|휘발/.test(blob);

  // 옵션 텍스트 → 트림 추정 키워드 (특정 트림 표식)
  const optionsText = String(row.options || row.option_summary || '').toLowerCase();
  const trimSignals = []; // sub에 이 키워드 있으면 가산
  if (/드라이브.*와이즈|adas|hda/.test(optionsText)) trimSignals.push('노블레스', '시그니처', '프레스티지');
  if (/12\.?3.*클러스터|디지털.*키|nappa|나파/.test(optionsText)) trimSignals.push('시그니처', '익스클루시브', '럭셔리');
  if (/통풍시트|레인보우|hud|헤드업/.test(optionsText)) trimSignals.push('프레스티지', '시그니처');
  if (/파노라마|파노/.test(optionsText)) trimSignals.push('프리미엄', '익스클루시브');

  const trimLow = normLow(`${trim} ${input || ''}`);
  const trimTokens = (trimLow.match(/[a-z0-9가-힣]+/g) || []).filter(t => t.length >= 2);
  return {
    yy, fuel, isEV, isHybrid, isDiesel, isGasoline,
    trimLow, trimTokens, looksLikeNew, engineCc, vehiclePrice, trimSignals,
    mileageYy,
  };
}

// 연식·연료·트림 컨텍스트로 sub_model 후보 점수
function suggestSubsByContext(input, maker, model, row) {
  const candidates = vmEntries.filter(e => e.maker === maker && e.model_name === model);
  if (!candidates.length) return [];

  const ctx = buildRowContext(row, input);
  const { yy, fuel, isEV, isHybrid, isDiesel, isGasoline, trimTokens } = ctx;

  const inLow = normLow(input || '');
  // 입력 + 트림에서 코드성 토큰 추출 (G20, F30, LCI, 320i 등) — 강한 식별자
  const inCodeTokens = [
    ...new Set([
      ...alnumCodeTokens(input || ''),
      ...alnumCodeTokens(row.trim_name || ''),
    ]),
  ];

  const scored = candidates.map(e => {
    const sub = e.sub_model;
    const subLow = normLow(sub);
    const subCodeTokens = alnumCodeTokens(sub);
    let score = 1.0;

    // 텍스트 유사도
    if (inLow) {
      if (subLow.includes(inLow) || inLow.includes(subLow)) score -= 0.5;
      else {
        const dist = levenshtein(inLow, subLow);
        const ratio = dist / Math.max(inLow.length, subLow.length, 1);
        score -= (1 - ratio) * 0.4;
      }
    }
    // 코드 토큰 매칭 — 입력의 코드 토큰이 sub에 등장하면 강한 가산점
    if (inCodeTokens.length && subCodeTokens.length) {
      const hits = inCodeTokens.filter(t => subCodeTokens.includes(t));
      if (hits.length) score -= Math.min(0.5, hits.length * 0.25);
    }

    // 연식 매칭 — sub_model 끝의 두자리 'XX~' 추출, yy에 가장 가까운 출시년이 최우선
    if (yy != null) {
      const m = sub.match(/(\d{2})~?$/);
      if (m) {
        const ys = Number(m[1]);
        const gap = yy - ys;
        if (gap >= 0) {
          // ys가 yy에 가까울수록 큰 보너스 (gap=0 → -0.5, gap=4 → -0.26, gap=10 → +0.1)
          score -= (0.5 - gap * 0.06);
        } else if (gap === -1) {
          score -= 0.1; // 1년 인접
        } else {
          score += 0.2; // 미래 출시 모델은 페널티
        }
      }
    }
    // EV/하이브리드/디젤/가솔린
    if (isEV && /ev/i.test(sub)) score -= 0.3;
    if (!isEV && /ev/i.test(sub) && fuel) score += 0.3;
    if (isHybrid && /(하이브리드|hev|hybrid)/i.test(sub)) score -= 0.25;
    if (isDiesel && /(디젤|diesel|tdi|crdi)/i.test(sub)) score -= 0.2;
    if (isGasoline && /(가솔린|gasoline|gdi)/i.test(sub)) score -= 0.15;
    // 트림 토큰이 sub에 포함되면 가산
    if (trimTokens.length) {
      const overlap = trimTokens.filter(t => subLow.includes(t)).length;
      if (overlap) score -= Math.min(0.3, overlap * 0.1);
    }

    return { value: sub, score };
  });

  return scored
    .filter(x => x.score <= 0.6)
    .sort((a, b) => a.score - b.score || subYear(b.value) - subYear(a.value));
}

// 공급사 코드 마스터
let partnerCodes = []; // ['RP001', 'RP002', ...]
let partnersFull = []; // [{partner_code, partner_name, account, ...}, ...]
// 정책 코드 마스터
let policyCodes = []; // ['T001', ...]

// 등록된 상품에서 maker/model/sub 추출 (실시간 마스터)
let registeredCars = []; // [{maker, model, sub, vehicle_class}]
// 인기/빈도 인덱스 (기존 products 기준)
let popMaker = new Map();              // maker → count
let popModel = new Map();              // `${maker}|${model}` → count
let popExtColor = new Map();           // color → count
let popIntColor = new Map();           // color → count
function rebuildRegisteredCars(products) {
  const set = new Map();
  popMaker = new Map();
  popModel = new Map();
  popExtColor = new Map();
  popIntColor = new Map();
  (products || []).forEach(p => {
    const maker = String(p?.maker || '').trim();
    const model = String(p?.model_name || '').trim();
    const sub = String(p?.sub_model || '').trim();
    const ext = String(p?.ext_color || '').trim();
    const int = String(p?.int_color || '').trim();
    if (ext) popExtColor.set(ext, (popExtColor.get(ext) || 0) + 1);
    if (int) popIntColor.set(int, (popIntColor.get(int) || 0) + 1);
    if (!maker || !model) return;
    popMaker.set(maker, (popMaker.get(maker) || 0) + 1);
    const mkey = `${maker}|${model}`;
    popModel.set(mkey, (popModel.get(mkey) || 0) + 1);
    const key = `${maker}|${model}|${sub}`;
    if (!set.has(key)) {
      set.set(key, { maker, model, sub, vehicle_class: String(p?.vehicle_class || '').trim() });
    }
  });
  registeredCars = [...set.values()];
}
// 정렬 헬퍼
function sortByPopMaker(arr) {
  return [...arr].sort((a, b) => (popMaker.get(b) || 0) - (popMaker.get(a) || 0) || a.localeCompare(b));
}
function sortByPopModel(maker, arr) {
  return [...arr].sort((a, b) =>
    (popModel.get(`${maker}|${b}`) || 0) - (popModel.get(`${maker}|${a}`) || 0) || a.localeCompare(b)
  );
}
// 세부모델 끝 'XX~' → 연도 추출, 큰 값(최근)이 먼저
function subYear(sub) {
  const m = String(sub || '').match(/(\d{2})~?\s*$/);
  return m ? Number(m[1]) : -1;
}
// vehicle_master 엔트리에서 출시 시작 연도(YY) 추출 — sub 끝 패턴 fallback
function entryStartYear(e) {
  if (!e) return -1;
  const ys = String(e.year_start || '').replace(/[^\d]/g, '');
  if (ys.length === 2) return Number(ys);
  if (ys.length === 4) return Number(ys.slice(2));
  return subYear(e.sub_model);
}
// vehicle_master 엔트리 종료 연도 ('현재' → 99)
function entryEndYear(e) {
  if (!e) return 99;
  const ye = String(e.year_end || '').trim();
  if (!ye || ye === '현재') return 99;
  const n = ye.replace(/[^\d]/g, '');
  if (n.length === 2) return Number(n);
  if (n.length === 4) return Number(n.slice(2));
  return 99;
}
function sortByRecentSub(arr) {
  return [...arr].sort((a, b) => subYear(b) - subYear(a) || String(a).localeCompare(String(b)));
}
function sortByPopColor(arr, map) {
  return [...arr].sort((a, b) => (map.get(b) || 0) - (map.get(a) || 0) || a.localeCompare(b));
}
function getRegMakers() {
  return [...new Set(registeredCars.map(c => c.maker))].filter(Boolean);
}
function getRegModels(maker) {
  return [...new Set(registeredCars.filter(c => c.maker === maker).map(c => c.model))].filter(Boolean);
}
function getRegSubs(maker, model) {
  return [...new Set(registeredCars.filter(c => c.maker === maker && c.model === model).map(c => c.sub))].filter(Boolean);
}
function getRegCategory(maker, model, sub) {
  const found = registeredCars.find(c => c.maker === maker && c.model === model && c.sub === sub);
  return found?.vehicle_class || '';
}

// input_codes (드랍다운 마스터) 기준
function getDropdownMakers() { return getCodeNames('PRODUCT_MAKER'); }
function getDropdownModels() { return getCodeNames('PRODUCT_MODEL_NAME'); }
function getDropdownSubs()   { return getCodeNames('PRODUCT_SUB_MODEL'); }

// 정확 일치 — vehicle_master 단일 source
function isExactMaker(v)              { return getVmMakers().includes(v); }
function isExactModel(maker, v)       { return getVmModels(maker).includes(v); }
function isExactSub(maker, model, v)  { return getVmSubs(maker, model).includes(v); }

// 강한 정규화 — 한/영 대소문자, 공백, 하이픈, 특수문자, 제조사 접두 모두 제거
function strongNorm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\s\-_·•‧／/]+/g, '') // 공백/하이픈/구분자
    .replace(/[()[\]{}]/g, '');     // 괄호
}
// maker 접두 제거: "BMW 3시리즈" → "3시리즈", "벤츠 E클래스" → "E클래스"
function stripMakerPrefix(makerLow, modelStr) {
  const m = String(modelStr || '').trim();
  if (!makerLow) return m;
  const pat = new RegExp('^' + makerLow + '[\\s\\-]*', 'i');
  return m.replace(pat, '').trim();
}
// maker 안에서 model 강한 매칭 (정규화 비교 + 접두 제거)
function findModelLoose(maker, modelStr) {
  if (!maker || !modelStr) return null;
  const all = getVmModels(maker);
  if (!all.length) return null;
  // 1차: 정확 일치
  if (all.includes(modelStr)) return modelStr;
  // 2차: 강한 정규화 일치
  const target = strongNorm(modelStr);
  for (const m of all) if (strongNorm(m) === target) return m;
  // 3차: maker 접두 제거 후 일치
  const stripped = strongNorm(stripMakerPrefix(maker.toLowerCase(), modelStr));
  if (stripped) {
    for (const m of all) if (strongNorm(m) === stripped) return m;
    // 4차: 부분 포함 (sub가 model을 감싸는 경우)
    const candidates = all
      .filter(m => strongNorm(m).includes(stripped) || stripped.includes(strongNorm(m)))
      .sort((a, b) => b.length - a.length);
    if (candidates.length) return candidates[0];
  }
  return null;
}
function mergedMakers()               { return getVmMakers(); }
function mergedModels(maker)          { return getVmModels(maker); }
function mergedSubs(maker, model)     { return getVmSubs(maker, model); }

// 최장 공통 부분문자열 길이 (Longest Common Substring)
function lcsLen(a, b) {
  if (!a || !b) return 0;
  const m = a.length, n = b.length;
  let best = 0;
  let prev = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    const curr = new Array(n + 1).fill(0);
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
        if (curr[j] > best) best = curr[j];
      }
    }
    prev = curr;
  }
  return best;
}

// 후보 추천 — fuzzy로 가까운 N개 (점수 낮을수록 비슷)
// 핵심 규칙: 공통 부분문자열이 너무 짧으면 절대 추천하지 않음
function suggestBest(input, candidates, limit = 3) {
  if (!input || !candidates?.length) return [];
  const inLow = normLow(input);
  if (!inLow) return [];
  // 영문/숫자 토큰 추출 (예: 'k8' → ['k8'])
  const inAlnumTokens = inLow.match(/[a-z0-9]+/g) || [];
  // 입력 길이에 따른 LCS 최소 요구 — 짧은 입력은 2자, 보통은 절반(최대 3)
  const minLcs = Math.min(3, Math.max(2, Math.ceil(inLow.length / 2)));
  return candidates
    .map(c => {
      const cLow = normLow(c);
      if (!cLow) return { value: c, score: 1 };
      // 1) 완전 부분 일치
      if (cLow === inLow) return { value: c, score: 0 };
      if (cLow.includes(inLow) || inLow.includes(cLow)) return { value: c, score: 0.05 };
      // 2) 영문/숫자 토큰 정확 매칭 — k8 → K8 ✓ / k8 → K3 ✗
      if (inAlnumTokens.length) {
        const cAlnumTokens = cLow.match(/[a-z0-9]+/g) || [];
        const allMatch = inAlnumTokens.every(t => cAlnumTokens.includes(t));
        if (allMatch) return { value: c, score: 0.1 };
        const anyMatch = inAlnumTokens.some(t => cAlnumTokens.includes(t));
        if (!anyMatch && inAlnumTokens.some(t => t.length >= 2)) {
          return { value: c, score: 1 }; // 영숫자 토큰 전혀 안 맞음 → 제외
        }
      }
      // 3) LCS 기반 — 최소 길이 못 채우면 제외
      const lcs = lcsLen(inLow, cLow);
      if (lcs < minLcs) return { value: c, score: 1 };
      // LCS 비율 (입력 대비)
      const lcsRatio = lcs / inLow.length;
      // Levenshtein 거리도 보조 점수로
      const dist = levenshtein(inLow, cLow);
      const ratio = dist / Math.max(inLow.length, cLow.length, 1);
      // 최종: LCS가 길수록 낮음, 거리도 반영
      const score = (1 - lcsRatio) * 0.5 + ratio * 0.3;
      return { value: c, score };
    })
    .filter(x => x.score <= 0.45)
    .sort((a, b) => a.score - b.score)
    .reduce((acc, cur) => {
      if (acc.length === 0) { acc.push(cur); return acc; }
      const top = acc[0];
      if (top.score <= 0.1) return acc; // 명확한 1순위면 더 안 추가
      if (cur.score - top.score <= 0.15 && acc.length < limit) acc.push(cur);
      return acc;
    }, [])
    .slice(0, limit);
}

// 행 컨텍스트(연식·연료·트림)로 세부모델 후보 가산점 부여
function suggestSubModelWithContext(input, maker, model, row, limit = 3) {
  if (!maker || !model) return [];
  const entries = CAR_MODELS.filter(m => m.maker === maker && m.model === model);
  if (!entries.length) return [];

  // 행에서 추출 가능한 컨텍스트
  const yearRaw = String(row.year || row.first_registration_date || '').replace(/[^\d]/g, '');
  const yy = yearRaw.length >= 4 ? Number(yearRaw.slice(2, 4)) : (yearRaw.length === 2 ? Number(yearRaw) : null);
  const fuel = String(row.fuel_type || '').toLowerCase();
  const isEV = /전기|ev/.test(fuel) || /전기|ev/i.test(input || '') || /전기|ev/i.test(row.trim_name || '');
  const isHybrid = /하이브리드|hybrid/.test(fuel) || /하이브리드|hybrid/i.test(input || '') || /하이브리드|hybrid/i.test(row.trim_name || '');
  const trimText = normLow(`${row.trim_name || ''} ${input || ''}`);

  const inLow = normLow(input || '');

  const scored = entries.map(e => {
    const subLow = normLow(e.sub);
    const codeLow = normLow(e.code || '');
    let score = 1.0;

    // 1) 입력 텍스트와 유사도 (-)
    if (inLow) {
      if (subLow.includes(inLow) || inLow.includes(subLow)) score -= 0.5;
      else {
        const dist = levenshtein(inLow, subLow);
        const ratio = dist / Math.max(inLow.length, subLow.length, 1);
        score -= (1 - ratio) * 0.4;
      }
      // 코드 매칭 (예: trim_name에 MQ4 같은 모델 코드 들어있으면 +)
      if (codeLow && trimText.includes(codeLow)) score -= 0.3;
    }

    // 2) 연식 범위 매칭
    if (yy != null && e.year_start) {
      const ys = Number(e.year_start);
      const ye = e.year_end === '현재' ? 99 : Number(e.year_end || 99);
      if (yy >= ys && yy <= ye) score -= 0.3;
      else if (Math.abs(yy - ys) <= 1 || Math.abs(yy - ye) <= 1) score -= 0.1; // 인접
    }

    // 3) EV / 하이브리드 가산점
    if (isEV && /ev/i.test(e.sub)) score -= 0.25;
    if (!isEV && /ev/i.test(e.sub) && fuel) score += 0.2; // EV 아닌데 EV 후보면 페널티
    if (isHybrid && /(하이브리드|hev|hybrid)/i.test(e.sub)) score -= 0.2;

    // 4) 트림 텍스트가 sub 토큰을 많이 포함하면 가산
    if (trimText) {
      const subTokens = subLow.split(/[\s\-_()]+/).filter(t => t.length >= 2);
      const hits = subTokens.filter(t => trimText.includes(t)).length;
      if (subTokens.length) score -= (hits / subTokens.length) * 0.2;
    }

    return { value: e.sub, score };
  });

  return scored
    .filter(x => x.score <= 0.7)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
}
function lookupCategory(maker, model, sub) {
  return getCategory(maker, model, sub) || '';
}

// ─── 스키마 — 사용자 지정 순서 ─────
// 필수: 공급사코드, 차량번호
// 필수 그룹(차량 식별): 제조사 모델 세부모델 세부트림 선택옵션 외부색상 내부색상 연식 주행거리 연료
const PRODUCT_SCHEMA = {
  required: [
    'partner_code', 'car_number',
    'maker', 'model_name', 'sub_model',
  ],
  optional: [
    // 차량 식별 묶음 (제조사~연료까지 쭉)
    'trim_name',              // 세부트림
    'options',                // 선택옵션
    'ext_color',              // 외부색상
    'int_color',              // 내부색상
    'year',                   // 연식
    'mileage',                // 주행거리
    'fuel_type',              // 연료
    // 그 외 메타
    'policy_code',            // 정책코드
    'vehicle_status',         // 차량상태
    'product_type',           // 상품구분
    'vehicle_class',          // 차종구분
    'vehicle_price',          // 차량가격
    'first_registration_date',// 최초등록일
    'vehicle_age_expiry_date',// 차령만료일
    'partner_memo',           // 특이사항
    'photo_link',             // 사진링크
    // 기간별 대여료/보증금/수수료
    'rent_1', 'deposit_1', 'fee_1',
    'rent_12', 'deposit_12', 'fee_12',
    'rent_24', 'deposit_24', 'fee_24',
    'rent_36', 'deposit_36', 'fee_36',
    'rent_48', 'deposit_48', 'fee_48',
    'rent_60', 'deposit_60', 'fee_60',
  ],
};

// 한글 라벨 — stock.html의 label과 동일
const KEY_TO_LABEL = {
  car_number: '차량번호', maker: '제조사', model_name: '모델명',
  partner_code: '공급사코드', policy_code: '정책코드',
  vehicle_status: '차량상태', product_type: '상품구분',
  sub_model: '세부모델', trim_name: '세부트림', options: '선택옵션',
  vehicle_price: '차량가격', fuel_type: '연료', year: '연식', mileage: '주행거리',
  ext_color: '외부색상', int_color: '내부색상', vehicle_class: '차종구분',
  first_registration_date: '최초등록일', vehicle_age_expiry_date: '차령만료일',
  partner_memo: '특이사항', photo_link: '사진링크',
  rent_1: '대여료1', deposit_1: '보증금1', fee_1: '수수료1',
  rent_12: '대여료12', deposit_12: '보증금12', fee_12: '수수료12',
  rent_24: '대여료24', deposit_24: '보증금24', fee_24: '수수료24',
  rent_36: '대여료36', deposit_36: '보증금36', fee_36: '수수료36',
  rent_48: '대여료48', deposit_48: '보증금48', fee_48: '수수료48',
  rent_60: '대여료60', deposit_60: '보증금60', fee_60: '수수료60',
};

const KO_TO_KEY = {
  '차량번호': 'car_number',
  '제조사': 'maker',
  '모델명': 'model_name',
  '모델': 'model_name',
  '세부모델': 'sub_model',
  '세부트림': 'trim_name',
  '트림': 'trim_name',
  '선택옵션': 'options',
  '옵션': 'options',
  '연료': 'fuel_type',
  '연식': 'year',
  '주행거리': 'mileage',
  '외장색상': 'ext_color',
  '내장색상': 'int_color',
  '외부색상': 'ext_color',
  '내부색상': 'int_color',
  '차종': 'vehicle_class',
  '차종구분': 'vehicle_class',
  '차량상태': 'vehicle_status',
  '상품구분': 'product_type',
  '차량가격': 'vehicle_price',
  '최초등록일': 'first_registration_date',
  '차령만료일': 'vehicle_age_expiry_date',
  '공급사코드': 'partner_code',
  '공급사': 'partner_code',
  '정책코드': 'policy_code',
  '특이사항': 'partner_memo',
  '메모': 'partner_memo',
  '대여료1': 'rent_1', '월대여료1': 'rent_1',
  '대여료12': 'rent_12', '월대여료12': 'rent_12',
  '대여료24': 'rent_24', '월대여료24': 'rent_24',
  '대여료36': 'rent_36', '월대여료36': 'rent_36',
  '대여료48': 'rent_48', '월대여료48': 'rent_48',
  '대여료60': 'rent_60', '월대여료60': 'rent_60',
  '보증금1': 'deposit_1', '보증금12': 'deposit_12', '보증금24': 'deposit_24',
  '보증금36': 'deposit_36', '보증금48': 'deposit_48', '보증금60': 'deposit_60',
  '수수료1': 'fee_1', '수수료12': 'fee_12', '수수료24': 'fee_24',
  '수수료36': 'fee_36', '수수료48': 'fee_48', '수수료60': 'fee_60',
};

// ─── DOM ───────────────────────────────────────────
const $previewHead = document.getElementById('upPreviewHead');
const $previewBody = document.getElementById('upPreviewBody');
const $previewEmpty = document.getElementById('upPreviewEmpty');
const $previewInfo = document.getElementById('upPreviewInfo');
const $summary = document.getElementById('upSummary');
const $schemaInfo = document.getElementById('upSchemaInfo');
const $copyHeadersBtn = document.getElementById('upCopyHeadersBtn');
const $sampleBtn = document.getElementById('upSampleBtn');
const $sourceTabs = document.querySelectorAll('.up-source-tab');
const $paneSheet = document.getElementById('upPaneSheet');
const $paneFile = document.getElementById('upPaneFile');
const $sheetUrl = document.getElementById('upSheetUrl');
const $sheetLoadBtn = document.getElementById('upSheetLoadBtn');
const $drop = document.getElementById('upDrop');
const $file = document.getElementById('upFile');
const $dropText = document.getElementById('upDropText');
const $resultSection = document.getElementById('upResultSection');
const $result = document.getElementById('upResult');
const $resetBtn = document.getElementById('upResetBtn');
const $applyAllBtn = document.getElementById('upApplyAllBtn');
const $confirmBtn = document.getElementById('upConfirmBtn');

// ─── 상태 ──────────────────────────────────────────
let parsedRows = [];
let originalRows = []; // 최초 파싱 직후 스냅샷 (셀별 되돌리기용)
let validatedRows = [];
let existingCarNumbers = new Set(); // DB + 이번 업로드 row 모두 포함
let assignedNewCarByRow = new Map(); // rowIndex → 임시번호 (재검증해도 동일 번호 유지)

// 사용 안 된 100신XXXX 번호 찾기
function nextNewCarNumber() {
  for (let n = 1; n <= 9999; n++) {
    const seq = String(n).padStart(4, '0');
    const candidate = `100신${seq}`;
    if (!existingCarNumbers.has(candidate)) {
      existingCarNumbers.add(candidate);
      return candidate;
    }
  }
  // 100신 다 차면 101신부터
  for (let prefix = 101; prefix <= 999; prefix++) {
    for (let n = 1; n <= 9999; n++) {
      const seq = String(n).padStart(4, '0');
      const candidate = `${prefix}신${seq}`;
      if (!existingCarNumbers.has(candidate)) {
        existingCarNumbers.add(candidate);
        return candidate;
      }
    }
  }
  return `100신9999`;
}

// ─── CSV 파서 (RFC 4180 최소 지원, 따옴표 이스케이프 처리) ──────
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQuote = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else { inQuote = false; }
      } else { cur += ch; }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\t') { row.push(cur); cur = ''; }
      else if (ch === '\r') { /* skip */ }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else { cur += ch; }
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  const filtered = rows.filter(r => r.some(c => String(c).trim() !== ''));
  if (!filtered.length) return { headers: [], rows: [] };
  return { headers: filtered[0].map(s => s.trim()), rows: filtered.slice(1).map(r => r.map(c => c.trim())) };
}

// 헤더(라벨/코드/라벨(코드)/코드(라벨)) → 영문 키 매핑
const ALL_KEYS = [...PRODUCT_SCHEMA.required, ...PRODUCT_SCHEMA.optional];
const LABEL_TO_KEY = Object.fromEntries(ALL_KEYS.map(k => [KEY_TO_LABEL[k] || k, k]));

function normalizeHeader(h) {
  const raw = String(h || '').trim();
  if (!raw) return null;
  // 1) 정확 일치 (영문 코드)
  if (ALL_KEYS.includes(raw)) return raw;
  // 2) 한글 라벨 일치
  if (LABEL_TO_KEY[raw]) return LABEL_TO_KEY[raw];
  // 3) 괄호 패턴 — "라벨(코드)" 또는 "코드(라벨)"
  const m = raw.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (m) {
    const a = m[1].trim();
    const b = m[2].trim();
    if (ALL_KEYS.includes(b)) return b;
    if (ALL_KEYS.includes(a)) return a;
    if (LABEL_TO_KEY[a]) return LABEL_TO_KEY[a];
    if (LABEL_TO_KEY[b]) return LABEL_TO_KEY[b];
  }
  // 4) 정규화 (공백·괄호·대소문자 무시)
  const norm = (s) => String(s).toLowerCase().replace(/\s+/g, '').replace(/\([^)]*\)/g, '');
  const nh = norm(raw);
  for (const k of ALL_KEYS) {
    if (norm(k) === nh) return k;
    const lab = KEY_TO_LABEL[k];
    if (lab && norm(lab) === nh) return k;
  }
  // 5) 보조 매핑 (KO_TO_KEY — 별칭)
  return KO_TO_KEY[raw] || null;
}

function normalizeHeaders(headers) {
  return headers.map(normalizeHeader);
}

// ─── 검증 + 보정 ────────────────────────────────────
function validateRow(rawRow, idx) {
  const row = { ...rawRow };
  const errors = [];
  const warnings = [];
  const suggestions = []; // [{col, candidates: [{value, score}]}]

  // 헬퍼: 정확 매칭 안 되면 fuzzy → 그래도 없으면 전체 톱5
  function suggestOrAll(input, allCandidates, max = 5) {
    // 의미 있는 후보만 — 공통 글자 없으면 아무것도 추천하지 않음
    return suggestBest(input || '', allCandidates, max);
  }

  // 1) 제조사 — alias + 강한 정규화 + 괄호 제거
  if (row.maker) {
    const raw = String(row.maker).trim();
    // 괄호 제거 (예: "르노(삼성)" → "르노")
    const noBrackets = raw.replace(/\s*\([^)]*\)\s*/g, '').trim();
    const lower = noBrackets.toLowerCase().replace(/\s+/g, '');
    if (MAKER_ALIAS[lower]) row.maker = MAKER_ALIAS[lower];
    else if (MAKER_ALIAS[noBrackets.toLowerCase()]) row.maker = MAKER_ALIAS[noBrackets.toLowerCase()];
    else {
      // 강한 정규화 후 maker 목록과 비교
      const target = strongNorm(noBrackets);
      const found = mergedMakers().find(m => strongNorm(m) === target);
      if (found) row.maker = found;
    }
    if (!isExactMaker(row.maker)) {
      const cands = suggestOrAll(row.maker, mergedMakers());
      if (cands.length) {
        suggestions.push({ col: 'maker', candidates: cands });
        warnings.push(`제조사 미매칭: ${row.maker}`);
      }
    }
  }
  // 2) 모델 — findModelLoose로 자동 보정 우선
  if (row.model_name) {
    const makerOk = row.maker && isExactMaker(row.maker);
    if (makerOk) {
      const looseMatch = findModelLoose(row.maker, row.model_name);
      if (looseMatch && looseMatch !== row.model_name) {
        row.model_name = looseMatch;
      }
    }
    const pool = makerOk
      ? mergedModels(row.maker)
      : [...new Set(vmEntries.map(e => e.model_name))].filter(Boolean);
    if (!makerOk || !isExactModel(row.maker, row.model_name)) {
      // ⚡ sub_model 입력에서 model 역추론 — 토큰 단위 비교 (한/영/공백 무시)
      let inferredFromSub = null;
      if (makerOk && row.sub_model) {
        // 모델명과 sub를 모두 토큰화: 공백/특수문자 제거 + 한영 분리
        const tokenize = (s) => {
          const t = String(s || '').toLowerCase().replace(/[^\w가-힣]/g, ' ').trim();
          return t.split(/\s+/).filter(Boolean);
        };
        const subTokens = new Set(tokenize(row.sub_model));
        const subNorm = strongNorm(row.sub_model);
        // pool의 각 모델에 대해 → 모델명 토큰이 sub 토큰에 모두 포함되는지 검사
        const scored = pool.map(m => {
          const mTokens = tokenize(m);
          let score = 0;
          let hasCodeMatch = false;
          for (const mt of mTokens) {
            if (subTokens.has(mt)) score += 2;
            if (/^[a-z0-9]+$/.test(mt) && subTokens.has(mt)) {
              hasCodeMatch = true;
              score += 1;
            }
          }
          // 강한 정규화 부분 포함 — 한/영/공백 다 무시
          // ex) model='3시리즈' 정규화 '3시리즈' / sub='BMW 320i' 정규화 'bmw320i'
          //     → 직접 매칭은 어렵지만 model='K5' '3시리즈' '카니발' 등은 sub에 그대로 들어있음
          if (subNorm.includes(strongNorm(m))) score += 4;
          return { model: m, score, hasCodeMatch, len: m.length };
        }).filter(x => x.score > 0);
        // 정렬: 코드매치 우선 → 점수 높은 순 → 모델명 긴 순
        scored.sort((a, b) =>
          (b.hasCodeMatch - a.hasCodeMatch) ||
          (b.score - a.score) ||
          (b.len - a.len)
        );
        if (scored.length) inferredFromSub = scored[0].model;
      }
      if (inferredFromSub) {
        // 모델 자동 보정
        row.model_name = inferredFromSub;
        warnings.push(`모델 자동보정: ${rawRow.model_name} → ${inferredFromSub}`);
      } else {
        const cands = suggestOrAll(row.model_name, pool);
        if (cands.length) {
          suggestions.push({ col: 'model_name', candidates: cands });
          warnings.push(`모델 미매칭: ${row.model_name}`);
        }
      }
    }
  }
  // 3) 세부모델 — 컨텍스트(연식·연료) 가중 추천 (maker/model 매칭 여부와 무관)
  {
    const makerOk = row.maker && isExactMaker(row.maker);
    const modelOk = makerOk && row.model_name && isExactModel(row.maker, row.model_name);
    const alreadyExact = modelOk && isExactSub(row.maker, row.model_name, row.sub_model);
    // ⚡ 신차렌트는 그 모델의 최신 sub를 1순위로 추천 (사용자 확정)
    const isNewCar = String(row.product_type || '').includes('신차');
    if (isNewCar && modelOk && !alreadyExact) {
      const subs = getVmSubs(row.maker, row.model_name);
      const newest = sortByRecentSub(subs)[0];
      if (newest) {
        suggestions.push({ col: 'sub_model', candidates: [{ value: newest, score: 0 }] });
        if (!row.sub_model) warnings.push('신차렌트 — 최신 모델 추천');
      }
    } else if (!alreadyExact && (row.sub_model || row.model_name)) {
      // 후보 풀 — 가능한 가장 좁은 범위로
      let pool;
      if (modelOk) pool = vmEntries.filter(e => e.maker === row.maker && e.model_name === row.model_name);
      else if (row.model_name) {
        // 모델명 fuzzy로 매칭되는 vm 엔트리들
        const modelLow = normLow(row.model_name);
        pool = vmEntries.filter(e => {
          const ml = normLow(e.model_name);
          return ml.includes(modelLow) || modelLow.includes(ml);
        });
        if (!pool.length) pool = vmEntries.slice();
      } else {
        pool = vmEntries.slice();
      }
      // 컨텍스트 점수 — sub_model 비어있으면 trim_name도 fuzzy 입력으로 사용
      const subInput = row.sub_model || row.trim_name || '';
      const inLow = normLow(subInput);
      const ctx = buildRowContext(row, subInput);
      const { yy, fuel, isEV, isHybrid, isDiesel, isGasoline, trimTokens, looksLikeNew, engineCc, trimSignals, mileageYy } = ctx;
      // 최초등록일 — 매칭에 약한 보정 (등록 후 신차로 출고할 수 있어 강제 X)
      const regRaw = String(row.first_registration_date || '').replace(/[^\d]/g, '');
      let regYy = null;
      if (regRaw.length === 8) regYy = Number(regRaw.slice(2, 4));
      else if (regRaw.length === 6) regYy = Number(regRaw.slice(0, 2));
      const inCodeTokens = [
        ...new Set([
          ...alnumCodeTokens(row.sub_model || ''),
          ...alnumCodeTokens(row.trim_name || ''),
        ]),
      ];
      const scored = pool.map(e => {
        const sub = e.sub_model;
        const subLow = normLow(sub);
        const subCodeTokens = alnumCodeTokens(sub);
        // 출시 연도 — entry의 year_start 우선, 없으면 sub 끝 패턴
        const ys = entryStartYear(e);
        const ye = entryEndYear(e);
        let score = 1.0;
        if (inLow) {
          if (subLow.includes(inLow) || inLow.includes(subLow)) score -= 0.5;
          else {
            const dist = levenshtein(inLow, subLow);
            const ratio = dist / Math.max(inLow.length, subLow.length, 1);
            score -= (1 - ratio) * 0.4;
          }
        } else {
          score -= 0.3; // 입력 없으면 컨텍스트만으로
        }
        if (inCodeTokens.length && subCodeTokens.length) {
          const hits = inCodeTokens.filter(t => subCodeTokens.includes(t));
          if (hits.length) score -= Math.min(0.5, hits.length * 0.25);
        }
        if (yy != null && ys >= 0) {
          // 입력 연식이 [ys, ye] 범위 안이면 강한 보너스, 밖이면 거리 비례 페널티
          if (yy >= ys && yy <= ye) score -= 0.5;
          else if (yy === ys - 1) score -= 0.1;
          else if (yy < ys) score += 0.3; // 입력이 모델 출시보다 과거 → 페널티
          else score -= Math.max(0, 0.3 - (yy - ye) * 0.1);
        }
        if (isEV && /ev/i.test(sub)) score -= 0.3;
        if (!isEV && /ev/i.test(sub) && fuel) score += 0.3;
        if (isHybrid && /(하이브리드|hev|hybrid)/i.test(sub)) score -= 0.25;
        if (isDiesel && /(디젤|diesel|tdi|crdi)/i.test(sub)) score -= 0.2;
        if (isGasoline && /(가솔린|gasoline|gdi)/i.test(sub)) score -= 0.15;
        if (trimTokens.length) {
          const overlap = trimTokens.filter(t => subLow.includes(t)).length;
          if (overlap) score -= Math.min(0.3, overlap * 0.1);
        }
        // 주행거리 5천km 이하 → 신차에 가까움 → 최신 모델(현재 진행 중) 가산
        if (looksLikeNew && ys >= 0) {
          const curYy = new Date().getFullYear() % 100;
          if (ye === 99 || ye >= curYy - 1) score -= 0.2;
        }
        // 엔진 cc 매칭 — sub_model에 1.6/2.0 등 배기량 토큰 있으면
        if (engineCc) {
          const ccM = sub.match(/(\d\.\d|\d{4})/);
          if (ccM) {
            const subCc = ccM[1].includes('.') ? Math.round(parseFloat(ccM[1]) * 1000) : Number(ccM[1]);
            if (subCc && Math.abs(subCc - engineCc) <= 100) score -= 0.2;
          }
        }
        // 옵션 키워드 → 트림 신호 매칭
        if (trimSignals && trimSignals.length) {
          const sigHit = trimSignals.some(sig => subLow.includes(normLow(sig)));
          if (sigHit) score -= 0.2;
        }
        // 최초등록일 보정 — 강력한 신호: 등록 연도가 모델 [ys, ye] 범위 안이면 큰 가산
        if (regYy != null && ys >= 0) {
          if (regYy >= ys && regYy <= ye) {
            score -= 0.6; // 등록일이 모델 판매 기간 안 — 매우 강함
          } else if (regYy === ys - 1) {
            score -= 0.2; // 출시 직전 한 해
          } else if (regYy < ys - 1) {
            score += 0.4; // 등록일이 모델 출시 한참 전 — 강한 페널티 (불가능)
          } else if (regYy > ye + 1) {
            score -= 0.05; // 단종 후 등록도 가능하긴 함
          }
        }
        // 주행거리 추정 연식 — 약한 참고용 (편차 큼)
        if (mileageYy != null && ys >= 0 && yy == null && regYy == null) {
          // 다른 강한 연식 신호가 전혀 없을 때만 작동
          if (mileageYy >= ys && mileageYy <= ye) score -= 0.1;
          else if (Math.abs(mileageYy - ys) <= 1) score -= 0.05;
        }
        return { value: sub, score };
      });
      let cands = scored
        .filter(x => x.score <= 0.9)
        .sort((a, b) => a.score - b.score || subYear(b.value) - subYear(a.value));
      // 중복 value 제거
      const seen = new Set();
      cands = cands.filter(c => (seen.has(c.value) ? false : (seen.add(c.value), true)));
      // 폴백 — 모델이 정확 매칭됐을 때만 그 모델의 sub들을 최근 연식순으로
      // (모델조차 fuzzy면 무관한 sub 덤프 금지)
      if (!cands.length && modelOk) {
        const allSubs = [...new Set(pool.map(e => e.sub_model))].filter(Boolean);
        cands = sortByRecentSub(allSubs).slice(0, 5).map(v => ({ value: v, score: 1 }));
      }
      // 1순위가 명확하면 1개만, 애매하면 같이
      const filtered = cands.reduce((acc, cur) => {
        if (acc.length === 0) { acc.push(cur); return acc; }
        if (acc[0].score <= 0.1) return acc;
        if (cur.score - acc[0].score <= 0.15 && acc.length < 5) acc.push(cur);
        return acc;
      }, []);
      if (filtered.length) {
        suggestions.push({ col: 'sub_model', candidates: filtered });
        warnings.push(row.sub_model ? `세부모델 미매칭: ${row.sub_model}` : '세부모델 미입력');
      }
    }
  }
  // 4) 차종구분 — vehicle_master 자동 채움
  if (row.maker && row.model_name && row.sub_model && isExactSub(row.maker, row.model_name, row.sub_model)) {
    const cat = getVmCategory(row.maker, row.model_name, row.sub_model);
    if (cat && cat !== row.vehicle_class) row.vehicle_class = cat;
  }
  // 4-2) 연료 alias — 명백한 동의어는 자동 변환
  if (row.fuel_type) {
    const f = String(row.fuel_type).trim().toLowerCase();
    const FUEL_ALIAS = {
      'ev': '전기', 'electric': '전기', '전기차': '전기',
      '경유': '디젤', 'diesel': '디젤',
      '휘발유': '가솔린', 'gasoline': '가솔린', 'petrol': '가솔린',
      'hybrid': '하이브리드', 'hev': '하이브리드',
      'phev': '플러그인하이브리드', '플러그인': '플러그인하이브리드',
      'lpg': 'LPG', 'lpi': 'LPG',
    };
    if (FUEL_ALIAS[f]) row.fuel_type = FUEL_ALIAS[f];
  }
  // 4-3) 차량상태 / 상품구분 / 연료 — 드랍다운 매칭 안 되면 무조건 추천
  ['vehicle_status', 'product_type', 'fuel_type'].forEach(key => {
    if (!row[key]) return;
    const opts = STATIC_SELECT_OPTIONS[key] || [];
    if (!opts.length || opts.includes(row[key])) return;
    const cands = suggestOrAll(row[key], opts);
    if (cands.length) {
      suggestions.push({ col: key, candidates: cands });
      warnings.push(`${KEY_TO_LABEL[key]} 미매칭: ${row[key]}`);
    }
  });
  // 4-6) 연식 — 4자리 정상이면 OK, 아니면 다른 필드에서 추론
  const yearCandidate = (() => {
    // 1) 최초등록일에서 추출 (예: 230315 → 23 → 2023, 20230315 → 2023, 26-3-13 → 2026)
    const reg = String(row.first_registration_date || '').replace(/[^\d]/g, '');
    if (reg.length === 8) return Number(reg.slice(0, 4));
    if (reg.length === 6) {
      const yy = Number(reg.slice(0, 2));
      return yy >= 50 ? 1900 + yy : 2000 + yy;
    }
    // 2) 차령만료일에서 역산 (보통 9년)
    const exp = String(row.vehicle_age_expiry_date || '').replace(/[^\d]/g, '');
    if (exp.length === 8) return Number(exp.slice(0, 4)) - 9;
    if (exp.length === 6) {
      const yy = Number(exp.slice(0, 2));
      return (yy >= 50 ? 1900 + yy : 2000 + yy) - 9;
    }
    // 3) 세부트림에서 'XX년식' / 'XXMY' 패턴
    const trim = String(row.trim_name || '');
    const myMatch = trim.match(/(\d{4})MY/i);
    if (myMatch) return Number(myMatch[1]);
    const yMatch = trim.match(/20(\d{2})/);
    if (yMatch) return Number('20' + yMatch[1]);
    return null;
  })();
  const yearRaw = String(row.year || '').trim();
  const yearNum = Number(yearRaw);
  if (!yearRaw || Number.isNaN(yearNum) || yearNum < 1900 || yearNum > 2100) {
    if (yearCandidate) {
      suggestions.push({ col: 'year', candidates: [{ value: String(yearCandidate), score: 0 }] });
      if (yearRaw) warnings.push(`연식 미매칭: ${yearRaw}`);
    }
  } else if (yearCandidate && Math.abs(yearCandidate - yearNum) > 1) {
    // 입력 연식이 등록일/만료일과 1년 이상 차이나면 추천
    suggestions.push({ col: 'year', candidates: [{ value: String(yearCandidate), score: 0 }] });
    warnings.push(`연식 불일치: ${yearRaw} (등록·만료일 기준 ${yearCandidate})`);
  }
  // 4-0) 공급사코드 — 매칭 안 되면 무조건 추천
  if (row.partner_code && partnerCodes.length && !partnerCodes.includes(row.partner_code)) {
    const cands = suggestOrAll(row.partner_code, partnerCodes);
    if (cands.length) {
      suggestions.push({ col: 'partner_code', candidates: cands });
      warnings.push(`공급사코드 미매칭: ${row.partner_code}`);
    }
  }
  // 4-0-2) 정책코드 — 매칭 안 되면 무조건 추천
  if (row.policy_code && policyCodes.length && !policyCodes.includes(row.policy_code)) {
    const cands = suggestOrAll(row.policy_code, policyCodes);
    if (cands.length) {
      suggestions.push({ col: 'policy_code', candidates: cands });
      warnings.push(`정책코드 미매칭: ${row.policy_code}`);
    }
  }
  // 4-1) 색상 — 키워드 룰 기반 카테고리 매핑
  function colorByKeyword(input, isExt = true) {
    const s = String(input || '').toLowerCase().replace(/\s+/g, '');
    if (!s) return null;
    const rules = [
      [/펄|화이트|흰|white|크림|아이보리|cream|ivory|스노우|snow|클라우드|cloud/, '화이트'],
      [/실버|silver|티타늄|titanium|플래티넘|platinum/, '실버'],
      [/그레이|회색|gray|grey|건메탈|gunmetal|차콜|charcoal|다크그레이/, '그레이'],
      [/블랙|검정|black|미드나잇|midnight|오닉스|onyx|에보니/, '블랙'],
      [/네이비|navy/, '네이비'],
      [/블루|파랑|blue|아쿠아|aqua|코발트|cobalt|시안/, '블루계열'],
      [/그린|초록|green|에메랄드|emerald|올리브|olive/, '그린계열'],
      [/레드|빨강|red|버건디|burgundy|와인|wine|마룬|maroon/, '레드계열'],
      [/브라운|갈색|brown|베이지|beige|모카|mocha|코퍼|copper|골드|gold|샴페인|champagne|선셋|sunset/, isExt ? '브라운계열' : '베이지'],
    ];
    for (const [re, name] of rules) {
      if (re.test(s)) return name;
    }
    return '기타';
  }
  if (row.ext_color && !getExtColors().includes(row.ext_color)) {
    const matched = colorByKeyword(row.ext_color, true);
    if (matched) {
      suggestions.push({ col: 'ext_color', candidates: [{ value: matched, score: 0 }] });
      warnings.push(`외부색상 카테고리: ${row.ext_color} → ${matched}`);
    }
  }
  if (row.int_color && !getIntColors().includes(row.int_color)) {
    const matched = colorByKeyword(row.int_color, false);
    if (matched) {
      suggestions.push({ col: 'int_color', candidates: [{ value: matched, score: 0 }] });
      warnings.push(`내부색상 카테고리: ${row.int_color} → ${matched}`);
    }
  }

  // 5) 신차 처리 — 차량번호 미정/미입력이면 신차
  const carNoRaw = String(row.car_number || '').trim();
  const isNewCar = !carNoRaw || /미정|미배정|없음|n\/?a|new/i.test(carNoRaw);
  if (isNewCar) {
    // 100신0001 형식 — 같은 행은 재검증해도 동일 번호 유지
    let tempNo = assignedNewCarByRow.get(idx);
    if (!tempNo) {
      tempNo = nextNewCarNumber();
      assignedNewCarByRow.set(idx, tempNo);
    }
    warnings.push(`신차 → 임시번호 ${tempNo}`);
    row.car_number = tempNo;
    if (!row.product_type || !/신차/.test(row.product_type)) {
      row.product_type = '신차렌트';
    }
    if (!row.vehicle_status) {
      row.vehicle_status = '출고대기';
    }
  } else {
    if (!/^\d{2,3}[가-힣]\d{4}$/.test(carNoRaw)) {
      warnings.push('차량번호 형식 확인');
    }
    // 하/허/호 → 렌트차량 → 상품구분 자동 (없거나 다를 때만)
    if (/[하허호]/.test(carNoRaw)) {
      // 신차/중고 구분은 다른 정보로 — 일단 렌트 계열이 아니면 자동 채움
      if (!row.product_type) {
        row.product_type = '중고렌트';
      } else if (!/렌트/.test(row.product_type)) {
        // 사용자 입력이 렌트 계열이 아니면 추천만 (덮어쓰지 않음)
        suggestions.push({
          col: 'product_type',
          candidates: [
            { value: '중고렌트', score: 0 },
            { value: '신차렌트', score: 0 },
          ],
        });
        warnings.push('차량번호 패턴(하·허·호) → 렌트 계열 추천');
      }
    }
    // 사용자가 직접 입력한 번호도 중복 추적에 추가
    existingCarNumbers.add(carNoRaw);
  }

  // 6) 필수 검증
  for (const k of PRODUCT_SCHEMA.required) {
    if (!row[k] || !String(row[k]).trim()) errors.push(`${KEY_TO_LABEL[k] || k} 누락`);
  }
  // 7) 숫자 필드
  ['year', 'mileage', 'vehicle_price'].forEach(k => {
    if (row[k] && Number.isNaN(Number(String(row[k]).replace(/[^\d]/g, '')))) {
      warnings.push(`${KEY_TO_LABEL[k] || k} 숫자 아님`);
    }
  });

  // 신규 차종 후보 마킹 — maker가 정확하고, model+sub가 모두 있는데 vehicle_master에 없을 때
  let isNewVehicle = false;
  if (row.maker && isExactMaker(row.maker) && row.model_name && row.sub_model) {
    if (!isExactSub(row.maker, row.model_name, row.sub_model)) {
      isNewVehicle = true;
    }
  }

  return {
    idx, row, errors, warnings, suggestions, isNewVehicle,
    status: errors.length ? 'error' : (warnings.length ? 'warn' : 'ok'),
  };
}

// ─── 렌더 ──────────────────────────────────────────
function renderSchema() {
  const req = PRODUCT_SCHEMA.required.map(k => KEY_TO_LABEL[k] || k);
  const opt = PRODUCT_SCHEMA.optional.map(k => KEY_TO_LABEL[k] || k);
  $schemaInfo.innerHTML = `
    <div><b style="color:#dc2626">필수 (${req.length}):</b> ${req.join(', ')}</div>
    <div style="margin-top:6px"><b>선택 (${opt.length}):</b> ${opt.join(', ')}</div>
  `;
}

function renderPreview(keys, rows) {
  if (!rows.length) {
    $previewHead.innerHTML = '';
    $previewBody.innerHTML = '';
    $previewEmpty.hidden = false;
    $previewInfo.textContent = '데이터를 불러와주세요';
    $summary.textContent = '';
    return;
  }
  $previewEmpty.hidden = true;
  // 헤더는 한글 라벨로 표시
  $previewHead.innerHTML = '<tr><th>#</th><th>상태</th>' + keys.map(k => `<th>${escapeHtml(KEY_TO_LABEL[k] || k)}</th>`).join('') + '</tr>';
  $previewBody.innerHTML = validatedRows.map((v, i) => {
    const cls = v.status === 'error' ? 'up-row-error' : v.status === 'warn' ? 'up-row-warn' : 'up-row-ok';
    let statusLabel;
    if (v.status === 'error') statusLabel = `오류 (${v.errors.length})`;
    else if (v.warnings.length) statusLabel = `경고 (${v.warnings.length})`;
    else statusLabel = 'OK';
    const tip = [...v.errors.map(e => '× ' + e), ...v.warnings.map(w => '! ' + w)].join('\n');
    // 키 → suggestion 매핑
    const sugByCol = {};
    (v.suggestions || []).forEach(s => { sugByCol[s.col] = s.candidates; });
    return `<tr class="${cls}" data-row="${i}" title="${escapeHtml(tip)}">
      <td>${i + 1}</td>
      <td>${statusLabel}</td>
      ${keys.map(k => {
        const sugs = sugByCol[k] || [];
        const sugHtml = sugs.length
          ? `<div class="up-cell-sugs">${sugs.map(s =>
              `<button type="button" class="up-sug-chip" data-row="${i}" data-key="${escapeHtml(k)}" data-val="${escapeHtml(s.value)}" title="${s.value}로 변경">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>${escapeHtml(s.value)}
              </button>`
            ).join('')}</div>`
          : '';
        const orig = originalRows[i]?.[k] ?? '';
        const cur = v.row[k] || '';
        const changed = String(orig) !== String(cur);
        const undoHtml = changed
          ? `<button type="button" class="up-undo-chip" data-row="${i}" data-key="${escapeHtml(k)}" title="원래 값(${escapeHtml(orig)})으로 되돌리기"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>되돌리기</button>`
          : '';
        return `<td data-key="${escapeHtml(k)}" data-row="${i}" class="up-cell-edit${changed ? ' is-changed' : ''}" tabindex="0"><div class="up-cell-wrap"><div class="up-cell-val">${escapeHtml(cur)}</div>${undoHtml}${sugHtml}</div></td>`;
      }).join('')}
    </tr>`;
  }).join('');

  // 추천 칩 클릭 → 셀 값 교체 + 재검증
  $previewBody.querySelectorAll('.up-sug-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      const rowIdx = Number(chip.dataset.row);
      const k = chip.dataset.key;
      const v = chip.dataset.val;
      parsedRows[rowIdx][k] = v;
      validatedRows[rowIdx] = validateRow(parsedRows[rowIdx], rowIdx);
      renderPreview(keys, parsedRows);
    });
  });

  // 되돌리기 칩 클릭 → 원본값 복원
  $previewBody.querySelectorAll('.up-undo-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      const rowIdx = Number(chip.dataset.row);
      const k = chip.dataset.key;
      const orig = originalRows[rowIdx]?.[k] ?? '';
      parsedRows[rowIdx][k] = orig;
      validatedRows[rowIdx] = validateRow(parsedRows[rowIdx], rowIdx);
      renderPreview(keys, parsedRows);
    });
  });

  // 셀 더블클릭(또는 클릭) → 인라인 수정
  $previewBody.querySelectorAll('.up-cell-edit').forEach(td => {
    const startEdit = () => {
      if (td.querySelector('input')) return;
      const rowIdx = Number(td.dataset.row);
      const key = td.dataset.key;
      const cur = parsedRows[rowIdx]?.[key] || '';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'up-cell-input';
      input.value = cur;
      td.innerHTML = '';
      td.appendChild(input);
      input.focus();
      input.select();
      const commit = () => {
        const next = input.value.trim();
        parsedRows[rowIdx][key] = next;
        // 재검증 (해당 행만)
        validatedRows[rowIdx] = validateRow(parsedRows[rowIdx], rowIdx);
        renderPreview(keys, parsedRows);
      };
      const cancel = () => { td.textContent = cur; };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        else if (e.key === 'Escape') { input.removeEventListener('blur', commit); cancel(); }
      });
    };
    td.addEventListener('dblclick', startEdit);
  });
  $previewInfo.textContent = `${rows.length}행 로드됨`;
  const okN = validatedRows.filter(v => v.status === 'ok').length;
  const warnN = validatedRows.filter(v => v.status === 'warn').length;
  const errN = validatedRows.filter(v => v.status === 'error').length;
  $summary.textContent = `OK ${okN} · 경고 ${warnN} · 오류 ${errN}`;
  $resultSection.hidden = false;
  // 신규 차종 후보 추출
  const newVehicleSet = new Set();
  validatedRows.forEach(v => {
    if (v.isNewVehicle) {
      const k = `${v.row.maker}|${v.row.model_name}|${v.row.sub_model}`;
      newVehicleSet.add(k);
    }
  });
  const newVehicles = [...newVehicleSet].map(k => {
    const [maker, model_name, sub_model] = k.split('|');
    return { maker, model_name, sub_model };
  });
  const newBanner = newVehicles.length
    ? `<div class="up-result-row is-new">
        신규 차종: ${newVehicles.length}건 발견
        <button type="button" class="up-btn-inline" id="upRegisterNewVm">차종마스터에 일괄 등록</button>
      </div>
      <div class="up-newvm-list">${newVehicles.map(v =>
        `<div class="up-newvm-item">[${escapeHtml(v.maker)}] ${escapeHtml(v.model_name)} / ${escapeHtml(v.sub_model)}</div>`
      ).join('')}</div>`
    : '';
  $result.innerHTML = `
    <div class="up-result-row is-ok">정상: ${okN}건</div>
    <div class="up-result-row is-warn">경고: ${warnN}건 (그대로 업로드 가능)</div>
    <div class="up-result-row is-error">오류: ${errN}건 (업로드 제외)</div>
    ${newBanner}
  `;
  $confirmBtn.disabled = (okN + warnN) === 0;
  // 신규 차종 일괄 등록 핸들러
  document.getElementById('upRegisterNewVm')?.addEventListener('click', async () => {
    if (!newVehicles.length) return;
    if (!confirm(`신규 차종 ${newVehicles.length}건을 차종마스터에 등록하시겠습니까?`)) return;
    let ok = 0, fail = 0;
    for (const v of newVehicles) {
      try {
        await addVehicleMasterEntry({
          maker: v.maker,
          model_name: v.model_name,
          sub_model: v.sub_model,
        }, { updatedBy: 'upload-center', updatedByName: '업로드센터' });
        ok++;
      } catch (e) { console.error('vm add fail', e); fail++; }
    }
    showToast(`등록 완료: ${ok}건${fail ? ` · 실패 ${fail}건` : ''}`, ok ? 'success' : 'error');
    // watchVehicleMaster가 자동으로 vmEntries 갱신 → validatedRows 재검증은 그 콜백에서 처리됨
  });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}


// ─── 파일/시트 → 행 ───────────────────────────────
async function loadCsv(text) {
  const { headers: rawHeaders, rows: rawRows } = parseCsv(text);
  const mapping = normalizeHeaders(rawHeaders); // [key|null,...]
  console.log('[upload-center] 헤더 매핑:', rawHeaders.map((h, i) => `${h} → ${mapping[i] || '(무시)'}`));

  // 인식 못한 컬럼 경고
  const unrecognized = rawHeaders
    .map((h, i) => ({ h, i, key: mapping[i] }))
    .filter(x => !x.key && String(x.h || '').trim());
  if (unrecognized.length) {
    showToast(`인식 못한 컬럼 ${unrecognized.length}개: ${unrecognized.map(x => `"${x.h}"`).slice(0, 3).join(', ')}${unrecognized.length > 3 ? ' …' : ''}`, 'error');
    console.warn('[upload-center] 인식 못한 헤더:', unrecognized);
  }

  parsedRows = rawRows.map(cells => {
    const obj = {};
    mapping.forEach((key, i) => {
      if (key) obj[key] = (cells[i] || '').trim();
    });
    return obj;
  });
  originalRows = parsedRows.map(r => ({ ...r }));
  assignedNewCarByRow.clear();
  validatedRows = parsedRows.map((row, i) => validateRow(row, i));
  // 디버그용 — 콘솔에서 확인
  window.__parsedRows = parsedRows;
  window.__validatedRows = validatedRows;
  console.log('[upload-center] 첫 행 검증:', validatedRows[0]);
  // 미리보기 컬럼 순서 = 스키마 순서 (재고 폼 순서)
  const schemaOrder = [...PRODUCT_SCHEMA.required, ...PRODUCT_SCHEMA.optional];
  const present = new Set(mapping.filter(Boolean));
  const orderedKeys = schemaOrder.filter(k => present.has(k));
  renderPreview(orderedKeys, parsedRows);
}

async function loadFromSheet(url) {
  if (!url) { showToast('시트 URL을 입력해주세요', 'error'); return; }
  try {
    const res = await fetch('/api/vehicle-master/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_url: url }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.message || '시트 로드 실패');
    await loadCsv(json.text || '');
    showToast('시트를 불러왔습니다', 'success');
  } catch (e) {
    console.error(e);
    showToast('시트 로드 실패: ' + (e?.message || ''), 'error');
  }
}

// ─── 이벤트 ────────────────────────────────────────
$sourceTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    $sourceTabs.forEach(t => t.classList.toggle('is-active', t === tab));
    const src = tab.dataset.source;
    $paneSheet.hidden = src !== 'sheet';
    $paneFile.hidden = src !== 'file';
  });
});

// 헤더 형식: "라벨(코드)" — jpkerp와 동일
function buildHeaderRow() {
  const keys = [...PRODUCT_SCHEMA.required, ...PRODUCT_SCHEMA.optional];
  return keys.map(k => `${KEY_TO_LABEL[k] || k}(${k})`);
}

$copyHeadersBtn?.addEventListener('click', async () => {
  const headers = buildHeaderRow();
  // 탭 구분 — 엑셀/구글시트에 붙여넣으면 칸별로 들어감
  await navigator.clipboard.writeText(headers.join('\t'));
  showToast('헤더 복사됨 (시트에 붙여넣기)', 'success');
});

$sampleBtn?.addEventListener('click', () => {
  const headers = buildHeaderRow();
  const sample = ['12가3456', '기아', '쏘렌토'].concat(new Array(headers.length - 3).fill(''));
  const csv = headers.join(',') + '\n' + sample.join(',');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'product-sample.csv';
  a.click();
});

$sheetLoadBtn?.addEventListener('click', () => loadFromSheet($sheetUrl.value.trim()));

$drop?.addEventListener('click', () => $file.click());
$drop?.addEventListener('dragover', (e) => { e.preventDefault(); $drop.style.background = '#f1f5f9'; });
$drop?.addEventListener('dragleave', () => { $drop.style.background = ''; });
$drop?.addEventListener('drop', async (e) => {
  e.preventDefault();
  $drop.style.background = '';
  const f = e.dataTransfer.files?.[0];
  if (f) handleFile(f);
});
$file?.addEventListener('change', () => {
  const f = $file.files?.[0];
  if (f) handleFile(f);
});
async function handleFile(f) {
  $dropText.textContent = f.name;
  const text = await f.text();
  await loadCsv(text);
}

$applyAllBtn?.addEventListener('click', () => {
  if (!parsedRows.length) { showToast('데이터를 먼저 불러오세요', 'error'); return; }
  let appliedCount = 0;
  // 추천이 사라질 때까지 반복 — maker → model → sub_model 단계별 의존성
  for (let pass = 0; pass < 8; pass++) {
    let changed = 0;
    for (let i = 0; i < parsedRows.length; i++) {
      const v = validatedRows[i];
      if (!v?.suggestions?.length) continue;
      // 1순위 무조건 적용 — 드랍다운 잘못된 값 다 보정
      for (const s of v.suggestions) {
        if (!s.candidates?.length) continue;
        const top = s.candidates[0];
        if (top && top.value && parsedRows[i][s.col] !== top.value) {
          parsedRows[i][s.col] = top.value;
          changed++;
          appliedCount++;
        }
      }
    }
    if (!changed) break;
    // 매 패스 후 모든 행 재검증 (다음 단계 추천 갱신)
    validatedRows = parsedRows.map((row, i) => validateRow(row, i));
  }
  // 최종 한 번 더 재검증 + 렌더
  validatedRows = parsedRows.map((row, i) => validateRow(row, i));
  const schemaOrder = [...PRODUCT_SCHEMA.required, ...PRODUCT_SCHEMA.optional];
  const present = new Set(Object.keys(parsedRows[0] || {}));
  const orderedKeys = schemaOrder.filter(k => present.has(k));
  renderPreview(orderedKeys, parsedRows);
  showToast(appliedCount ? `추천 ${appliedCount}건 적용` : '적용할 추천이 없습니다', appliedCount ? 'success' : 'info');
});

$resetBtn?.addEventListener('click', () => {
  parsedRows = [];
  validatedRows = [];
  originalRows = [];
  assignedNewCarByRow.clear();
  $sheetUrl.value = '';
  $file.value = '';
  $dropText.textContent = '파일 선택 또는 드래그';
  renderPreview([], []);
  $resultSection.hidden = true;
});

$confirmBtn?.addEventListener('click', async () => {
  const valid = validatedRows.filter(v => v.status !== 'error');
  if (!valid.length) { showToast('업로드할 데이터가 없습니다', 'error'); return; }
  const ok = await showConfirm(`${valid.length}건을 업로드하시겠습니까?`);
  if (!ok) return;
  $confirmBtn.disabled = true;
  let success = 0, fail = 0;
  const months = ['1', '12', '24', '36', '48', '60'];
  for (const v of valid) {
    try {
      // 평탄 필드 → price 객체 동시 저장 (상품목록·상세 호환)
      const row = { ...v.row };
      const num = (val) => Number(String(val ?? '').replace(/[^\d]/g, '')) || 0;
      const priceObj = {};
      let hasPrice = false;
      for (const m of months) {
        const r = num(row[`rent_${m}`]);
        const d = num(row[`deposit_${m}`]);
        const f = num(row[`fee_${m}`]);
        if (r || d || f) hasPrice = true;
        priceObj[m] = { rent: r, deposit: d, fee: f };
      }
      if (hasPrice) row.price = priceObj;
      // 공급사·정책 코드 매핑 (saveProduct에서 buildProductCode 사용)
      if (row.partner_code && !row.provider_company_code) row.provider_company_code = row.partner_code;
      if (row.policy_code && !row.term_code) row.term_code = row.policy_code;
      // 숫자 필드 변환
      ['vehicle_price', 'mileage', 'year'].forEach(k => {
        if (row[k]) row[k] = String(row[k]).replace(/[^\d]/g, '') || row[k];
      });
      // 날짜 필드 정규화 — 6자리(YYMMDD) 또는 8자리(YYYYMMDD)로 강제
      const normDate = (v) => {
        if (!v) return '';
        const d = String(v).replace(/[^\d]/g, '');
        if (d.length === 6 || d.length === 8) return d;
        // 26-3-13 같은 패턴 → 260313
        const parts = String(v).split(/[^\d]+/).filter(Boolean);
        if (parts.length === 3) {
          const yy = parts[0].length >= 4 ? parts[0].slice(-2) : parts[0].padStart(2, '0');
          const mm = parts[1].padStart(2, '0');
          const dd = parts[2].padStart(2, '0');
          return yy + mm + dd;
        }
        return ''; // 인식 못 하면 비움
      };
      if (row.first_registration_date) row.first_registration_date = normDate(row.first_registration_date);
      if (row.vehicle_age_expiry_date) row.vehicle_age_expiry_date = normDate(row.vehicle_age_expiry_date);

      // 코드그룹에 없는 maker/model/sub_model 자동 등록 → 재고폼 select에서 보이도록
      if (row.maker)      await ensureCode('PRODUCT_MAKER', row.maker);
      if (row.model_name) await ensureCode('PRODUCT_MODEL_NAME', row.model_name);
      if (row.sub_model)  await ensureCode('PRODUCT_SUB_MODEL', row.sub_model);
      if (row.fuel_type)  await ensureCode('PRODUCT_FUEL_TYPE', row.fuel_type);
      if (row.vehicle_status) await ensureCode('PRODUCT_VEHICLE_STATUS', row.vehicle_status);
      if (row.product_type)   await ensureCode('PRODUCT_TYPE', row.product_type);

      await saveProduct(row);
      success++;
    } catch (e) {
      console.error('upload row failed', e);
      fail++;
    }
  }
  showToast(`업로드 완료 — 성공 ${success}건, 실패 ${fail}건`, fail ? 'error' : 'success');
  $confirmBtn.disabled = false;
});

// ─── init ──────────────────────────────────────────
(async () => {
  try {
    const { profile } = await requireAuth({ roles: ['admin'] });
    renderRoleMenu(document.getElementById('sidebar-menu'), profile.role);
    renderSchema();

    // 기존 상품 로드 — 차량번호 중복 회피 + 차종 마스터 빌드
    try {
      const products = await fetchProductsOnce();
      (products || []).forEach(p => {
        const cn = String(p?.car_number || '').trim();
        if (cn) existingCarNumbers.add(cn);
      });
      rebuildRegisteredCars(products);
    } catch (e) { console.warn('product preload failed', e); }

    // 공급사 / 정책 마스터 구독
    watchPartners((items) => {
      partnersFull = items || [];
      partnerCodes = partnersFull.map(p => p?.partner_code || p?.code || '').filter(Boolean);
      console.log('[upload-center] partners:', partnersFull.length, '건', partnersFull[0]);
    });
    watchTerms((items) => {
      policyCodes = (items || []).map(t => t?.term_code || t?.policy_code || '').filter(Boolean);
    });

    // freepass 차종 마스터 구독 (vehicle_master)
    watchVehicleMaster((data) => {
      // CAR_MODELS lookup 인덱스 — (maker|model|sub) 정확 일치 + (maker|model) fuzzy
      const cmExact = new Map();
      const cmByModel = new Map(); // maker|model → 후보들
      CAR_MODELS.forEach(c => {
        const k = `${c.maker}|${c.model}|${c.sub}`;
        cmExact.set(k, c);
        const mk = `${c.maker}|${c.model}`;
        if (!cmByModel.has(mk)) cmByModel.set(mk, []);
        cmByModel.get(mk).push(c);
      });
      // sub_model 끝 연도를 두자리 'YY~' 형태로 통일 + CAR_MODELS year_start/year_end 머지
      vmEntries = (data?.items || []).map(e => {
        const merged = {
          ...e,
          sub_model: normalizeSubYear(e.sub_model),
        };
        // CAR_MODELS에서 일치하는 항목 찾아서 year_start/year_end 채우기 (없는 경우만)
        if (!merged.year_start || !merged.year_end) {
          const exact = cmExact.get(`${e.maker}|${e.model_name}|${e.sub_model}`);
          if (exact) {
            merged.year_start = merged.year_start || exact.year_start;
            merged.year_end = merged.year_end || exact.year_end;
            if (!merged.vehicle_category) merged.vehicle_category = exact.category;
          } else {
            // sub 부분일치 fallback
            const candidates = cmByModel.get(`${e.maker}|${e.model_name}`) || [];
            const partial = candidates.find(c => normLow(e.sub_model).includes(normLow(c.sub)) || normLow(c.sub).includes(normLow(e.sub_model)));
            if (partial) {
              merged.year_start = merged.year_start || partial.year_start;
              merged.year_end = merged.year_end || partial.year_end;
              if (!merged.vehicle_category) merged.vehicle_category = partial.category;
            }
          }
        }
        return merged;
      });
      console.log('[upload-center] vehicle_master 로드됨:', vmEntries.length, '건');
      console.log('[upload-center] makers:', getVmMakers());
      console.log('[upload-center] sample:', vmEntries.slice(0, 5));
      window.__vmEntries = vmEntries;
      // 마스터가 늦게 도착해도 이미 로드된 행 재검증
      if (parsedRows.length) {
        validatedRows = parsedRows.map((row, i) => validateRow(row, i));
        const schemaOrder = [...PRODUCT_SCHEMA.required, ...PRODUCT_SCHEMA.optional];
        const present = new Set(Object.keys(parsedRows[0] || {}));
        const orderedKeys = schemaOrder.filter(k => present.has(k));
        renderPreview(orderedKeys, parsedRows);
      }
    });

    // 코드그룹 구독 — 자동 등록용 캐시
    watchCodeItems((items) => {
      codeItems = (items || []).map(c => ({
        group_code: c.group_code,
        item_name: c.item_name,
        is_active: c.is_active !== false,
      }));
      // 디버그 — 어떤 그룹이 있고 몇 개씩인지
      const groups = {};
      codeItems.forEach(c => {
        if (!groups[c.group_code]) groups[c.group_code] = [];
        groups[c.group_code].push(c.item_name);
      });
      console.log('[upload-center] input_codes 로드됨:', groups);
      window.__codeItems = codeItems;
      window.__codeGroups = groups;
    });
  } catch (e) {
    console.error('[upload-center] init failed', e);
  }
})();
