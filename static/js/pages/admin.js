import { requireAuth } from '../core/auth-guard.js';
import { qs, registerPageCleanup, runPageCleanup } from '../core/utils.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { showConfirm } from '../core/toast.js';
import { watchSettlements, watchPartners, watchProducts, watchVehicleMaster, syncExternalProducts, addVehicleMasterEntry } from '../firebase/firebase-db.js';
import { renderSkeletonRows } from '../core/management-list.js';
import { createSettlementController } from './admin/settlement.js';
import { createStockController } from './admin/stock.js';
import { createNoticeController } from './admin/notice.js';
import { createVehicleMasterAdminController } from './admin/vehicle-master.js';
import { createColorAdminController } from './admin/colors.js';

let menu, adminMenu;
let currentProfile = null;
let partnerNameMap = new Map();
let productTypeMap = new Map();

const ADMIN_STL_COLS_PLACEHOLDER = [
  { key: 'status', label: '정산상태', w: 80 }, { key: 'code', label: '정산코드' },
  { key: 'partner', label: '공급사명' }, { key: 'date', label: '계약완료일' },
  { key: 'car', label: '차량번호' }, { key: 'model', label: '모델명' },
  { key: 'fee', label: '수수료' },
];

const settlement = createSettlementController({
  getPartnerNameMap: () => partnerNameMap,
  getProductTypeMap: () => productTypeMap,
});
const stock = createStockController({
  getPartnerNameMap: () => partnerNameMap,
});
const notice = createNoticeController({
  getCurrentProfile: () => currentProfile,
});
const vehicleMaster = createVehicleMasterAdminController({
  getCurrentProfile: () => currentProfile,
});
const colorAdmin = createColorAdminController();

function bindDOM() {
  menu = qs('#sidebar-menu');
  adminMenu = document.getElementById('adminMenu');
  const pageName = document.querySelector('.top-bar-page-name');
  const identity = document.getElementById('topBarIdentity');
  const sep = document.getElementById('topBarStateSep');
  const badge = document.getElementById('topBarWorkBadge');
  if (pageName) pageName.textContent = '관리자 페이지';
  if (identity) { identity.textContent = ''; identity.hidden = true; }
  if (sep) sep.hidden = true;
  if (badge) { badge.textContent = ''; delete badge.dataset.mode; }
}

const TAB_TITLES = {
  settlement: '정산서 관리',
  stock: '재고 일괄삭제',
  notice: '안내사항 관리',
  vehicle: '차종 관리',
  color: '색상 관리',
  upload: '상품업로드',
  sync: '외부시트 동기화',
};

let uploadFrameLoaded = false;

function switchTab(tabKey) {
  adminMenu?.querySelectorAll('.admin-menu-item').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.tab === tabKey);
  });
  document.querySelectorAll('[data-tab-panel]').forEach(panel => {
    panel.hidden = panel.dataset.tabPanel !== tabKey;
  });

  const panelTitle = document.getElementById('adminPanelTitle');
  if (panelTitle) panelTitle.textContent = TAB_TITLES[tabKey] || '';

  if (tabKey === 'settlement') settlement.onTabEnter();
  if (tabKey === 'stock') stock.onTabEnter();
  if (tabKey === 'notice') notice.onTabEnter();
  if (tabKey === 'vehicle') vehicleMaster.onTabEnter();
  if (tabKey === 'color') colorAdmin.onTabEnter();
  if (tabKey === 'upload' && !uploadFrameLoaded) {
    const frame = document.getElementById('adminUploadFrame');
    if (frame) {
      frame.src = '/upload-center?embed=1';
      uploadFrameLoaded = true;
    }
  }

  const identity = document.getElementById('topBarIdentity');
  const sep = document.getElementById('topBarStateSep');
  if (identity) { identity.textContent = TAB_TITLES[tabKey] || ''; identity.hidden = false; }
  if (sep) sep.hidden = false;
}

async function bootstrap() {
  try {
    const { user, profile } = await requireAuth({ roles: ['admin'] });
    currentProfile = { ...profile, uid: user.uid };
    renderRoleMenu(menu, profile.role);

    adminMenu?.addEventListener('click', async (e) => {
      const btn = e.target.closest('.admin-menu-item');
      if (!btn) return;
      switchTab(btn.dataset.tab);
    });

    settlement.bind();
    stock.bind();
    notice.bind();
    vehicleMaster.bind();
    colorAdmin.bind();

    renderSkeletonRows(document.getElementById('adminStlList'), ADMIN_STL_COLS_PLACEHOLDER, 8);

    registerPageCleanup(watchPartners((items) => {
      partnerNameMap = new Map((items || []).map(p => [p.partner_code, p.partner_name || p.partner_code]));
      settlement.renderFilterSelects();
      settlement.renderList();
    }));

    registerPageCleanup(watchProducts((items) => {
      const products = items || [];
      productTypeMap = new Map(products.filter(p => p.car_number).map(p => [p.car_number, p.product_type || '']));
      stock.setData(products);
      settlement.renderList();
    }));

    registerPageCleanup(watchSettlements((items) => {
      settlement.setData((items || []).sort((a, b) => (b.created_at || 0) - (a.created_at || 0)));
      settlement.renderFilterSelects();
      settlement.renderList();
    }));

    // ── 외부시트 동기화 ──
    let _syncProducts = null;
    let _vmEntries = [];
    let _vmModelToMaker = {};
    let _vmModelSubModels = {};
    let _vmModelsSet = [];

    registerPageCleanup(watchVehicleMaster((vmData) => {
      _vmEntries = vmData?.items || [];
      _vmModelToMaker = {};
      _vmModelSubModels = {};
      const modelsArr = [];
      for (const e of _vmEntries) {
        if (!e.maker || !e.model_name) continue;
        _vmModelToMaker[e.model_name] = e.maker;
        if (!modelsArr.includes(e.model_name)) modelsArr.push(e.model_name);
        if (!_vmModelSubModels[e.model_name]) _vmModelSubModels[e.model_name] = [];
        if (e.sub_model && !_vmModelSubModels[e.model_name].includes(e.sub_model)) {
          _vmModelSubModels[e.model_name].push(e.sub_model);
        }
      }
      _vmModelsSet = modelsArr.sort((a, b) => b.length - a.length);
    }));

    function matchVehicle(shortName, fullName, regDate = '') {
      // 등록일에서 연도 추출
      const regYear = regDate ? Number(String(regDate).slice(0, 4)) || 0 : 0;
      // 1단계: 제조사 + 모델 매칭
      let maker = '', model = '';

      // 차종이 마스터에 직접 있으면
      if (_vmModelToMaker[shortName]) {
        maker = _vmModelToMaker[shortName];
        model = shortName;
      } else {
        // 풀네임+차종에서 마스터 모델명 키워드 검색 (긴 이름 우선)
        const searchText = `${shortName} ${fullName}`;
        for (const m of _vmModelsSet) {
          if (searchText.includes(m)) {
            maker = _vmModelToMaker[m];
            model = m;
            break;
          }
        }
        // 수입차: "BMW 740d" → 차종에서 공백 앞이 제조사, 뒤가 모델
        if (!maker && shortName.includes(' ')) {
          const parts = shortName.split(/\s+/);
          // 첫 단어가 마스터 제조사명인지
          for (const e of _vmEntries) {
            if (e.maker === parts[0] || e.maker.includes(parts[0]) || parts[0].includes(e.maker)) {
              maker = e.maker;
              // 나머지 부분으로 모델 검색
              const rest = parts.slice(1).join(' ');
              if (_vmModelToMaker[rest]) { model = rest; break; }
              // 부분 매칭
              for (const m of _vmModelsSet) {
                if (_vmModelToMaker[m] === maker && (rest.includes(m) || m.includes(rest))) {
                  model = m; break;
                }
              }
              if (model) break;
            }
          }
        }
        // "더 뉴말리부" → "말리부" 매칭 (접두사 제거)
        if (!maker) {
          const cleaned = shortName.replace(/^(더\s*뉴|신형|올\s*뉴|디\s*올\s*뉴)\s*/g, '').trim();
          if (cleaned !== shortName && _vmModelToMaker[cleaned]) {
            maker = _vmModelToMaker[cleaned];
            model = cleaned;
          }
          // 풀네임에서도 시도
          if (!maker) {
            const cleanedFull = fullName.replace(/^(더\s*뉴|신형|올\s*뉴|디\s*올\s*뉴)\s*/g, '').trim();
            for (const m of _vmModelsSet) {
              if (cleanedFull.includes(m)) {
                maker = _vmModelToMaker[m]; model = m; break;
              }
            }
          }
        }
      }

      // 2단계: 세부모델 매칭 — 연식 기반
      let sub_model = '';
      if (model && _vmModelSubModels[model]) {
        const subs = _vmModelSubModels[model];

        // 방법1: 풀네임에서 세부모델 문자열 직접 포함 검색 (공백 무시 + 연도 제거)
        const sorted = [...subs].sort((a, b) => b.length - a.length);
        const fullNoSpace = fullName.replace(/\s/g, '').toLowerCase();
        const shortNoSpace = shortName.replace(/\s/g, '').toLowerCase();
        const searchNoSpace = `${shortNoSpace}${fullNoSpace}`;
        for (const s of sorted) {
          // 원문 포함
          if (fullName.includes(s)) { sub_model = s; break; }
          // 공백+연도 제거 후 비교
          const sClean = s.replace(/\s/g, '').replace(/\d+~?\d*$/g, '').toLowerCase().trim();
          if (sClean.length >= 2 && searchNoSpace.includes(sClean)) { sub_model = s; break; }
        }

        // 방법2: 풀네임에서 세대코드 검색 (CN7, DN8, MQ4, DL3, RJ 등)
        if (!sub_model) {
          for (const s of subs) {
            const codeMatch = s.match(/^([A-Za-z]{1,4}\d{0,2})/);
            if (codeMatch && codeMatch[1].length >= 2 && fullName.includes(codeMatch[1])) {
              sub_model = s; break;
            }
          }
        }

        // 방법3: 등록일 연도로 생산기간 매칭
        if (!sub_model && regYear) {
          // 세부모델의 production_period 또는 이름에서 연도 범위 추출
          // 예: "DN8 20~" → 2020~현재, "LF 14~19" → 2014~2019
          const entries = _vmEntries.filter(e => e.model_name === model);
          for (const e of entries) {
            const period = e.sub_model || '';
            // "XX YY~ZZ" 또는 "XX YY~" 패턴에서 연도 추출
            const yearMatch = period.match(/(\d{2})~(\d{2})?/);
            if (yearMatch) {
              const from = 2000 + Number(yearMatch[1]);
              const to = yearMatch[2] ? 2000 + Number(yearMatch[2]) : 2099;
              if (regYear >= from && regYear <= to) {
                sub_model = e.sub_model; break;
              }
            }
          }
        }

        // 방법4: 세부모델이 1개뿐이면 그걸로
        if (!sub_model && subs.length === 1) {
          sub_model = subs[0];
        }
      }

      // 3단계: 트림 — 풀네임에서 모델명 이후 전부
      let trim_name = '';
      if (fullName && model) {
        const idx = fullName.indexOf(model);
        if (idx >= 0) {
          trim_name = fullName.slice(idx + model.length).trim();
        }
        // 모델명 못 찾으면 차종 기준으로
        if (!trim_name && shortName) {
          const idx2 = fullName.indexOf(shortName);
          if (idx2 >= 0) {
            trim_name = fullName.slice(idx2 + shortName.length).trim();
          }
        }
        // 그래도 없으면 풀네임 전체
        if (!trim_name) trim_name = fullName;
      }

      // 차종구분 — 차량마스터에서 가져오기
      let vehicle_class = '';
      if (model) {
        const entry = _vmEntries.find(e => e.model_name === model);
        if (entry) vehicle_class = entry.vehicle_category || '';
      }

      return { maker, model, sub_model, trim_name, vehicle_class };
    }

    const syncFetchBtn = document.getElementById('adminSyncFetchBtn');
    const syncApplyBtn = document.getElementById('adminSyncApplyBtn');
    const syncMsg = document.getElementById('adminSyncMessage');
    const syncList = document.getElementById('adminSyncList');
    const syncCount = document.getElementById('adminSyncCount');
    const fmtPrice = (v) => v ? Number(v).toLocaleString('ko-KR') : '-';

    syncFetchBtn?.addEventListener('click', async () => {
      syncFetchBtn.disabled = true;
      syncApplyBtn.disabled = true;
      _syncProducts = null;
      if (syncMsg) syncMsg.textContent = '시트 데이터를 읽는 중...';
      if (syncList) syncList.innerHTML = '';
      try {
        const resp = await fetch('/api/sync/external-sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const data = await resp.json();
        if (!data.ok) throw new Error(data.message || '시트 읽기 실패');

        // 차량마스터 매칭 적용
        const products = data.products;
        for (const p of Object.values(products)) {
          const m = matchVehicle(p.raw_model_short || '', p.raw_model_full || '', p.first_registration_date || '');
          p.maker = m.maker;
          p.model_name = m.model;
          p.sub_model = m.sub_model;
          p.trim_name = m.trim_name;
          p.vehicle_class = m.vehicle_class;
        }

        _syncProducts = products;
        const items = Object.values(products);
        const matched = items.filter(p => p.maker && p.model_name).length;
        const unmatched = items.length - matched;
        if (syncCount) syncCount.textContent = `${items.length}건`;
        if (syncMsg) syncMsg.textContent = `${items.length}건 (매칭 ${matched}, 미매칭 ${unmatched}) — 확인 후 "동기화 적용"`;

        const esc = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
        const badge = (val, ok) => ok
          ? `<span style="color:#16a34a;font-weight:600">${esc(val)}</span>`
          : `<span style="color:#ef4444;font-weight:600">${val ? esc(val) : '❓'}</span>`;

        if (syncList) syncList.innerHTML = items.map(p => {
          const hasLink = p.photo_link ? `<a href="${esc(p.photo_link)}" target="_blank" style="color:#3b82f6">링크</a>` : '-';
          return `<tr style="border-bottom:1px solid #f1f5f9">
            <td style="vertical-align:top;padding:6px 8px">
              <div style="font-weight:600">${esc(p.car_number)}</div>
              <div style="font-size:10px;color:#94a3b8;margin-top:2px">${esc(p.raw_model_short)} / ${esc(p.raw_model_full)}</div>
            </td>
            <td style="vertical-align:top;padding:6px 4px">${badge(p.maker, !!p.maker)}</td>
            <td style="vertical-align:top;padding:6px 4px">${badge(p.model_name, !!p.maker)}</td>
            <td style="vertical-align:top;padding:6px 4px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(p.sub_model)}">${p.sub_model ? badge(p.sub_model, true) : '<span style="color:#f59e0b">-</span>'}</td>
            <td style="vertical-align:top;padding:6px 4px">${p.trim_name || '-'}</td>
            <td style="vertical-align:top;padding:6px 4px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(p.options)}">${esc(p.options) || '-'}</td>
            <td style="vertical-align:top;padding:6px 4px">${esc(p.ext_color)}</td>
            <td style="vertical-align:top;padding:6px 4px">${esc(p.fuel_type)}</td>
            <td style="vertical-align:top;padding:6px 4px">${esc(p.year)}</td>
            <td style="vertical-align:top;padding:6px 4px;text-align:right">${p.mileage ? p.mileage.toLocaleString('ko-KR') : '-'}</td>
            <td style="vertical-align:top;padding:6px 4px;font-size:11px;color:${p.vehicle_status === '출고가능' ? '#16a34a' : '#94a3b8'}">${esc(p.vehicle_status)}</td>
            <td style="vertical-align:top;padding:6px 4px">${esc(p.product_type)}</td>
            <td style="vertical-align:top;padding:6px 4px;text-align:right">${fmtPrice(p.price?.['12']?.rent)}</td>
            <td style="vertical-align:top;padding:6px 4px;text-align:right">${fmtPrice(p.price?.['24']?.rent)}</td>
            <td style="vertical-align:top;padding:6px 4px;text-align:right">${fmtPrice(p.price?.['36']?.rent)}</td>
            <td style="vertical-align:top;padding:6px 4px;text-align:center">${hasLink}</td>
          </tr>`;
        }).join('');
        syncApplyBtn.disabled = false;
      } catch (err) {
        if (syncMsg) syncMsg.textContent = `오류: ${err.message || err}`;
      } finally {
        syncFetchBtn.disabled = false;
      }
    });

    syncApplyBtn?.addEventListener('click', async () => {
      if (!_syncProducts) return;
      syncApplyBtn.disabled = true;
      syncFetchBtn.disabled = true;
      if (syncMsg) syncMsg.textContent = '미매칭 차종 자동 등록 중...';
      try {
        // 미매칭 차종 → 차량마스터에 자동 추가
        const unmatchedModels = new Map(); // model → maker 추정
        for (const p of Object.values(_syncProducts)) {
          if (!p.maker && p.raw_model_short) {
            const short = p.raw_model_short;
            if (!unmatchedModels.has(short)) {
              // MAKER_MAP 기반 추정
              const guessMap = {
                '말리부': '쉐보레', '트래버스': '쉐보레', '트랙스': '쉐보레', '이쿼녹스': '쉐보레',
                '골프': '폭스바겐', '티구안': '폭스바겐', '파사트': '폭스바겐',
              };
              let guessMaker = guessMap[short] || '';
              // 수입차: 공백 앞이 브랜드
              if (!guessMaker && short.includes(' ')) {
                const brand = short.split(/\s+/)[0];
                for (const e of _vmEntries) {
                  if (e.maker === brand || e.maker.includes(brand)) { guessMaker = e.maker; break; }
                }
              }
              if (guessMaker) unmatchedModels.set(short, guessMaker);
            }
          }
        }
        // 마스터에 등록 — 알려진 모델은 세대별 등록
        const KNOWN_MODELS = {
          '말리부': { maker: '쉐보레', subs: [
            { sub_model: '더 뉴 말리부 18~', production_period: '18~', vehicle_category: '중형' },
            { sub_model: '올 뉴 말리부 16~', production_period: '16~18', vehicle_category: '중형' },
            { sub_model: '말리부 11~', production_period: '11~16', vehicle_category: '중형' },
          ]},
          '트래버스': { maker: '쉐보레', subs: [
            { sub_model: '트래버스 19~', production_period: '19~', vehicle_category: '대형SUV' },
          ]},
          '볼트': { maker: '쉐보레', subs: [
            { sub_model: '볼트 EUV 22~', production_period: '22~', vehicle_category: '소형SUV' },
            { sub_model: '볼트 EV 17~', production_period: '17~', vehicle_category: '소형' },
          ]},
        };

        let vmAdded = 0;
        for (const [modelName, maker] of unmatchedModels) {
          const known = KNOWN_MODELS[modelName];
          if (known) {
            for (const sub of known.subs) {
              try {
                await addVehicleMasterEntry({
                  maker: known.maker, model_name: modelName, ...sub
                }, { updatedBy: currentProfile?.uid || '', updatedByName: currentProfile?.name || '' });
                vmAdded++;
              } catch (e) { /* 이미 있으면 무시 */ }
            }
          } else {
            // 미리 정의 안 된 모델 — 등록일 기반 추정
            let earliestYear = 0;
            for (const p of Object.values(_syncProducts)) {
              if ((p.raw_model_short || '') === modelName && p.first_registration_date) {
                const y = Number(String(p.first_registration_date).slice(0, 4));
                if (y && (!earliestYear || y < earliestYear)) earliestYear = y;
              }
            }
            const ys = earliestYear ? String(earliestYear).slice(2) : '';
            const subModel = ys ? `${modelName} ${ys}~` : modelName;
            try {
              await addVehicleMasterEntry({
                maker, model_name: modelName, sub_model: subModel,
                production_period: ys ? `${ys}~` : '', vehicle_category: ''
              }, { updatedBy: currentProfile?.uid || '', updatedByName: currentProfile?.name || '' });
              vmAdded++;
            } catch (e) { console.warn('마스터 추가 실패:', modelName, e); }
          }
        }
        if (vmAdded) {
          if (syncMsg) syncMsg.textContent = `차종 ${vmAdded}건 자동등록 완료. 재매칭 중...`;
          // 재매칭
          await new Promise(r => setTimeout(r, 1500)); // 마스터 반영 대기
          for (const p of Object.values(_syncProducts)) {
            const m = matchVehicle(p.raw_model_short || '', p.raw_model_full || '', p.first_registration_date || '');
            p.maker = m.maker; p.model_name = m.model; p.sub_model = m.sub_model; p.trim_name = m.trim_name; p.vehicle_class = m.vehicle_class;
          }
        }

        // 제조사/모델/세부모델 없는 건 제외
        const validProducts = {};
        let skippedCount = 0;
        for (const [uid, p] of Object.entries(_syncProducts)) {
          if (p.maker && p.model_name && p.sub_model) {
            validProducts[uid] = p;
          } else {
            skippedCount++;
          }
        }

        if (syncMsg) syncMsg.textContent = `Firebase 동기화 중... (${Object.keys(validProducts).length}건, 미매칭 ${skippedCount}건 제외)`;
        const result = await syncExternalProducts(validProducts, 'RP023');
        if (syncMsg) syncMsg.textContent = `동기화 완료 — 추가 ${result.added}, 업데이트 ${result.updated}, 삭제 ${result.deleted}, 제외 ${skippedCount}건 (${new Date().toLocaleString('ko-KR')})`;
        _syncProducts = null;
      } catch (err) {
        if (syncMsg) syncMsg.textContent = `동기화 오류: ${err.message || err}`;
      } finally {
        syncApplyBtn.disabled = true;
        syncFetchBtn.disabled = false;
      }
    });

    switchTab('settlement');
  } catch (error) {
    console.error('[admin] bootstrap error:', error);
  }
}

let _mounted = false;
export async function mount() {
  if (_mounted) return;
  runPageCleanup();
  bindDOM();
  await bootstrap();
  _mounted = true;
}
export function unmount() { runPageCleanup(); _mounted = false; }
if (!import.meta.url.includes('?')) mount();
