
(function(){
  const CORE = window.FP_CORE || {};
  const api = CORE.api || {};
  const $ = CORE.$ || ((sel,root)=> (root||document).querySelector(sel));
  const fmtNum = CORE.fmtNum || (n=>n==null?"":String(n));
  const esc = CORE.esc || (s=>String(s==null?"":s));

  let POLICIES = {};   // map id -> policy
  let CURRENT_ID = null;

  const LAST_SAVED_BY_ID = {}; // id -> stable payload snapshot
  const EDITED_ONCE_BY_ID = {};

  function stableStringify(obj){
    const seen = new WeakSet();
    const sorter = (a,b)=> a< b ? -1 : a> b ? 1 : 0;
    return JSON.stringify(obj, function(key, value){
      if(value && typeof value === "object"){
        if(seen.has(value)) return;
        seen.add(value);
        if(Array.isArray(value)) return value;
        const out = {};
        Object.keys(value).sort(sorter).forEach(k=>{ out[k]=value[k]; });
        return out;
      }
      return value;
    });
  }

  function minPayloadFromPolicyObj(p){
    p = p || {};
    const ins = p.insurance || {};
    const bod = ins.liability_bodily || {};
    const col = ins.collision || {};
    const colDed = col.deductible || {};
    const colLim = col.limit || {};
    return {
      id: p.id,
      name: p.name || "",
      insurance: {
        liability_bodily: {
          type: bod.type || "UNLIMITED",
          deductible_amount: bod.deductible_amount ?? null
        },
        collision: {
          limit: {
            type: colLim.type || "UP_TO_VEHICLE_VALUE",
            amount_won: colLim.amount_won ?? null
          },
          deductible: {
            percent: colDed.percent ?? null,
            min_won: colDed.min_won ?? null,
            max_won: colDed.max_won ?? null
          }
        }
      }
    };
  }

  function digitsOnly(s){
    return String(s==null?"":s).replace(/[^\d]/g,'');
  }

  function parseIntOrNull(v){
    const s = String(v==null?"":v).trim();
    if(!s) return null;
    const n = parseInt(s.replace(/,/g,''), 10);
    return Number.isFinite(n) ? n : null;
  }

  // 콤마 자동 포맷(타이핑 중에도)
  function bindCommaInput(el){
    if(!el) return;
    el.addEventListener("input", ()=>{
      const raw = el.value;
      // keep caret position relative to digits
      const start = el.selectionStart || 0;
      const left = raw.slice(0, start);
      const leftDigits = digitsOnly(left).length;

      const digits = digitsOnly(raw);
      if(digits === ""){
        el.value = "";
        return;
      }
      const num = Number(digits);
      if(!Number.isFinite(num)){
        el.value = digits;
        return;
      }
      const formatted = num.toLocaleString("ko-KR");
      el.value = formatted;

      // restore caret near same digit index
      let pos = 0, seen = 0;
      while(pos < formatted.length && seen < leftDigits){
        if(/\d/.test(formatted[pos])) seen++;
        pos++;
      }
      try{ el.setSelectionRange(pos, pos); }catch(e){}
    });
  }

  function ensureCommaInputs(){
    document.querySelectorAll(".js-comma").forEach(bindCommaInput);
  }

  function renderPolicySelect(){
    const sel = $("#pol-id");
    if(!sel) return;
    const ids = Object.keys(POLICIES).sort();
    sel.innerHTML = ids.map(id=>{
      const p = POLICIES[id] || {};
      const name = p.name ? ` — ${esc(p.name)}` : "";
      return `<option value="${esc(id)}">${esc(id)}${name}</option>`;
    }).join("");
    if(!CURRENT_ID){
      CURRENT_ID = ids[0] || null;
    }
    if(CURRENT_ID && POLICIES[CURRENT_ID]){
      sel.value = CURRENT_ID;
    }
  }

  function bodilyDisplay(obj){
    obj = obj || {};
    if(obj.type === "UNLIMITED") return "무한";
    if(obj.amount!=null) return fmtNum(obj.amount);
    return "";
  }

  function setInputsFromPolicy(p){
    p = p || {};
    const ins = p.insurance || {};
    const bod = ins.liability_bodily || {};
    const col = ins.collision || {};
    const colDed = col.deductible || {};

    const setVal = (id,val)=>{
      const el = $(id);
      if(!el) return;
      el.value = (val==null ? "" : String(val));
      // if comma input, re-run formatting once
      if(el.classList.contains("js-comma")){
        const digits = digitsOnly(el.value);
        if(digits){
          el.value = Number(digits).toLocaleString("ko-KR");
        }
      }
    };

    setVal("#pol-name", p.name || "");
        setVal("#ins-bodily-ded", fmtNum(bod.deductible_amount));

    // other insurance (limit/deductible)
    const prop = ins.liability_property || {};
    const pinj = ins.personal_injury || {};
    const unins = ins.uninsured || {};
    setVal("#ins-prop-limit", fmtNum(prop.amount));
    setVal("#ins-prop-ded", fmtNum(prop.deductible_amount));
    setVal("#ins-pinj-limit", fmtNum(pinj.amount));
    setVal("#ins-pinj-ded", fmtNum(pinj.deductible_amount));
    setVal("#ins-unins-limit", fmtNum(unins.amount));
    setVal("#ins-unins-ded", fmtNum(unins.deductible_amount));

    // driver rules
    const drv = p.driver || {};
    const a21 = drv.age_surcharge_21 || {};
    const a23 = drv.age_surcharge_23 || {};
    const exp = drv.driving_exp || "any";
    setVal("#drv-21-mode", a21.mode || "fixed");
    setVal("#drv-21-val", fmtNum(a21.value));
    setVal("#drv-23-mode", a23.mode || "fixed");
    setVal("#drv-23-val", fmtNum(a23.value));
    setVal("#drv-exp", exp);

    // mileage rules
    const mil = p.mileage || {};
    setVal("#mil-contract", fmtNum(mil.contract_km_per_year));
    setVal("#mil-plus10k-mode", (mil.plus_10k_rule && mil.plus_10k_rule.mode) ? mil.plus_10k_rule.mode : "fixed");
    setVal("#mil-plus10k-val", fmtNum((mil.plus_10k_rule && mil.plus_10k_rule.value!=null) ? mil.plus_10k_rule.value : mil.plus_10k_fee));
setVal("#mil-over1km", fmtNum(mil.over_km_fee));

    // service: emergency
    const svc = p.service || {};
    setVal("#svc-emergency-per-year", fmtNum(svc.emergency_per_year));

    // penalty rules
    const pen = p.penalty || {};
    setVal("#pen-lt1y", (pen.lt_1y_pct!=null ? pen.lt_1y_pct : ""));
    setVal("#pen-gte1y", (pen.gte_1y_pct!=null ? pen.gte_1y_pct : ""));

    setVal("#col-ded-percent", colDed.percent ?? "");

// collision limit (차량가액/금액)
const lim = (col.limit || {}) || {};
const limType = String(lim.type || "UP_TO_VEHICLE_VALUE").toUpperCase();
const elLimType = $("#col-limit-type");
const elLimAmt = $("#col-limit-amount-won");
if(elLimType){
  elLimType.value = (limType === "AMOUNT") ? "AMOUNT" : "UP_TO_VEHICLE_VALUE";
}
if(elLimAmt){
  const amt = (limType === "AMOUNT") ? (lim.amount_won!=null ? lim.amount_won : null) : null;
  elLimAmt.style.display = (limType === "AMOUNT") ? "" : "none";
  elLimAmt.value = (amt==null? "" : fmtNum(amt));
  if(elLimAmt.classList.contains("js-comma") && elLimAmt.value){
    const digits = digitsOnly(elLimAmt.value);
    if(digits) elLimAmt.value = Number(digits).toLocaleString("ko-KR");
  }
}

    // NEW: won fields (fallback to old million fields)
    const minWon = (colDed.min_won!=null) ? colDed.min_won : (colDed.min_million!=null ? (colDed.min_million*1000000) : null);
    const maxWon = (colDed.max_won!=null) ? colDed.max_won : (colDed.max_million!=null ? (colDed.max_million*1000000) : null);
    setVal("#col-ded-min-won", fmtNum(minWon));
    setVal("#col-ded-max-won", fmtNum(maxWon));

    renderLog(p.changeLog || []);
  }

  function normBodilyLimit(input, deductible){
    const s = String(input==null?"":input).trim();
    const ded = parseIntOrNull(deductible);
    if(!s){
      return { type: null, amount: null, deductible_amount: ded };
    }
    if(s === "무한" || s.toUpperCase() === "UNLIMITED" || s === "0"){
      return { type: "UNLIMITED", amount: null, deductible_amount: ded };
    }
    const amt = parseIntOrNull(s);
    if(amt==null){
      return { type: null, amount: null, deductible_amount: ded };
    }
    return { type: "AMOUNT", amount: amt, deductible_amount: ded };
  }

  
  function buildLimitAmountFromInputs(limitVal, dedVal){
    const amt = parseIntOrNull(limitVal);
    const ded = parseIntOrNull(dedVal);
    if(amt==null){
      return { type: null, amount: null, deductible_amount: ded };
    }
    return { type: "AMOUNT", amount: amt, deductible_amount: ded };
  }

function collectPayload(id){
    const name = ($("#pol-name")||{}).value || "";
    const payload = {
      id,
      name,
      // 최소 MVP: DOMESTIC 유지
      category: (POLICIES[id] && POLICIES[id].category) ? POLICIES[id].category : "DOMESTIC",
      driver: (POLICIES[id] && POLICIES[id].driver) ? POLICIES[id].driver : { base_min_age: 26 },
      mileage: (POLICIES[id] && POLICIES[id].mileage) ? POLICIES[id].mileage : {},
      penalty: (POLICIES[id] && POLICIES[id].penalty) ? POLICIES[id].penalty : {},
      service: (POLICIES[id] && POLICIES[id].service) ? POLICIES[id].service : {},
      review: (POLICIES[id] && POLICIES[id].review) ? POLICIES[id].review : {},
      insurance: (POLICIES[id] && POLICIES[id].insurance) ? JSON.parse(JSON.stringify(POLICIES[id].insurance)) : {}
    };

    payload.insurance = payload.insurance || {};
    // business rule: 대인 보상한도는 항상 '무한' (고정)
payload.insurance.liability_bodily = {
  type: "UNLIMITED",
  amount: null,
  deductible_amount: parseIntOrNull(($("#ins-bodily-ded")||{}).value)
};

// 대물/자손/무보험차: 금액 입력시 AMOUNT로 저장
payload.insurance.liability_property = buildLimitAmountFromInputs(($("#ins-prop-limit")||{}).value, ($("#ins-prop-ded")||{}).value);
payload.insurance.personal_injury = buildLimitAmountFromInputs(($("#ins-pinj-limit")||{}).value, ($("#ins-pinj-ded")||{}).value);
payload.insurance.uninsured = buildLimitAmountFromInputs(($("#ins-unins-limit")||{}).value, ($("#ins-unins-ded")||{}).value);

// driver: base age fixed 26, plus surcharges + driving exp
payload.driver = payload.driver || {};
payload.driver.base_min_age = 26;
payload.driver.driving_exp = String((($("#drv-exp")||{}).value) || "any");

function readSurcharge(modeEl, valEl){
  const mode = String((modeEl||{}).value || "fixed");
  const raw = (valEl||{}).value;
  const v = parseIntOrNull(raw);
  if(mode==="none"){ return { mode: "none", value: null }; }
  return { mode: (mode==="percent"?"percent":"fixed"), value: (v==null? null : v) };
}
payload.driver.age_surcharge_21 = readSurcharge($("#drv-21-mode"), $("#drv-21-val"));
payload.driver.age_surcharge_23 = readSurcharge($("#drv-23-mode"), $("#drv-23-val"));

// mileage
payload.mileage = payload.mileage || {};
payload.mileage.contract_km_per_year = parseIntOrNull(($("#mil-contract")||{}).value);
const p10mode = String((($("#mil-plus10k-mode")||{}).value) || "fixed");
payload.mileage.plus_10k_rule = { mode: (p10mode==="percent"?"percent":(p10mode==="none"?"none":"fixed")), value: parseIntOrNull(($("#mil-plus10k-val")||{}).value) };
// backward compat
payload.mileage.plus_10k_fee = (payload.mileage.plus_10k_rule.mode==="fixed") ? payload.mileage.plus_10k_rule.value : null;
payload.mileage.over_km_fee = parseIntOrNull(($("#mil-over1km")||{}).value);

// service
payload.service = payload.service || {};
payload.service.emergency_per_year = parseIntOrNull(($("#svc-emergency-per-year")||{}).value);

// penalty
payload.penalty = payload.penalty || {};
payload.penalty.lt_1y_pct = parseIntOrNull(($("#pen-lt1y")||{}).value);
payload.penalty.gte_1y_pct = parseIntOrNull(($("#pen-gte1y")||{}).value);


    payload.insurance.collision = payload.insurance.collision || {};
const limTypeSel = ($("#col-limit-type")||{}).value;
payload.insurance.collision.limit = payload.insurance.collision.limit || {};
payload.insurance.collision.limit.type = (String(limTypeSel).toUpperCase()==="AMOUNT") ? "AMOUNT" : "UP_TO_VEHICLE_VALUE";
payload.insurance.collision.limit.amount_won = (payload.insurance.collision.limit.type==="AMOUNT")
  ? parseIntOrNull(($("#col-limit-amount-won")||{}).value)
  : null;

    payload.insurance.collision.deductible = payload.insurance.collision.deductible || {};
    payload.insurance.collision.deductible.percent = parseIntOrNull(($("#col-ded-percent")||{}).value);
    payload.insurance.collision.deductible.min_won = parseIntOrNull(($("#col-ded-min-won")||{}).value);
    payload.insurance.collision.deductible.max_won = parseIntOrNull(($("#col-ded-max-won")||{}).value);

    payload._logFields = ["insurance.liability_bodily", "insurance.collision.deductible", "name"];
    return payload;
  }

  function renderLog(rows){
    const box = $("#pol-log");
    if(!box) return;
    if(!rows || !rows.length){
      box.innerHTML = `<div class="center-muted">변경 로그가 없습니다.</div>`;
      return;
    }
    const items = rows.slice().reverse().slice(0, 50);
    box.innerHTML = items.map(r=>{
      const at = esc(r.at || "");
      const act = esc(r.action || "");
      const fields = Array.isArray(r.fields) ? r.fields.join(", ") : "";
      return `<div class="reg-log-row"><div>${at}</div><div class="muted">${act}${fields?(" — "+esc(fields)):""}</div></div>`;
    }).join("");
  }

  async function loadAll(){
    if(!api.getPolicies){
      console.warn("api.getPolicies missing");
      return;
    }
    const data = await api.getPolicies();
    POLICIES = data || {};
    try{ Object.keys(POLICIES).forEach(function(pid){ LAST_SAVED_BY_ID[pid] = stableStringify(minPayloadFromPolicyObj(POLICIES[pid])); }); }catch(e){}
    // pick default
    if(!CURRENT_ID || !POLICIES[CURRENT_ID]){
      CURRENT_ID = (POLICIES["POL_01"] ? "POL_01" : Object.keys(POLICIES)[0]) || null;
    }
    renderPolicySelect();
    if(CURRENT_ID) setInputsFromPolicy(POLICIES[CURRENT_ID] || {});
  }

  function bindEvents(){
    const sel = $("#pol-id");
    if(sel){
      sel.addEventListener("change", ()=>{
        CURRENT_ID = sel.value;
        setInputsFromPolicy(POLICIES[CURRENT_ID] || {});
      });
    }
const limType = $("#col-limit-type");
if(limType){
  limType.addEventListener("change", ()=>{
    const elAmt = $("#col-limit-amount-won");
    if(!elAmt) return;
    elAmt.style.display = (String(limType.value)==="AMOUNT") ? "" : "none";
    if(String(limType.value)!=="AMOUNT") elAmt.value = "";
  });
}

    const reload = $("#pol-reload");
    if(reload){
      reload.addEventListener("click", ()=> loadAll());
    }
    const save = $("#pol-save");
    if(save){
      save.addEventListener("click", async ()=>{
        const id = ($("#pol-id")||{}).value;
        if(!id) return;
        if(!api.updatePolicy){
          (window.FP_CORE && window.FP_CORE.toast) && window.FP_CORE.toast("정책 저장 API가 없습니다.", true);
          return;
        }
        const payload = collectPayload(id);
        const currStr = stableStringify(payload);
        const prevStr = LAST_SAVED_BY_ID[id];
        if(prevStr && currStr === prevStr){
          (window.FP_CORE && window.FP_CORE.toast) && window.FP_CORE.toast("변경사항이 없습니다.", false);
          return;
        }
        try{
          const res = await api.updatePolicy(id, payload);
          POLICIES[id] = res || payload;
          setInputsFromPolicy(POLICIES[id] || {});
          try{ LAST_SAVED_BY_ID[id] = stableStringify(collectPayload(id)); }catch(e){}
          // 등록패널 정책 드롭다운 갱신
          try{
            if(window.FP_REG && window.FP_REG.ui && typeof window.FP_REG.ui.refreshPolicyDropdown === "function"){
              window.FP_REG.ui.refreshPolicyDropdown();
            }
          }catch(e){}
          if(!EDITED_ONCE_BY_ID[id]){ EDITED_ONCE_BY_ID[id]=true; (window.FP_CORE && window.FP_CORE.toast) && window.FP_CORE.toast("저장되었습니다.", false); }
          else{ (window.FP_CORE && window.FP_CORE.toast) && window.FP_CORE.toast("변경되었습니다.", false); }
        }catch(e){
          console.error(e);
          (window.FP_CORE && window.FP_CORE.toast) && window.FP_CORE.toast("저장 실패", true);
        }
      });
    }
  }

  function initPolicyEditor(){
    if(!$("#policy-panel")) return;
    ensureCommaInputs();
    bindEvents();
    loadAll();
  }

  window.FP_REG = window.FP_REG || {};
  window.FP_REG.policy = window.FP_REG.policy || {};
  window.FP_REG.policy.initPolicyEditor = initPolicyEditor;
  // backward init hook
  window.FP_REGISTER_POLICY = window.FP_REGISTER_POLICY || { init: initPolicyEditor };

  // auto init (safe): if register page loads but other scripts fail, still bind policy editor
  try{
    if(document.readyState === "loading"){
      document.addEventListener("DOMContentLoaded", initPolicyEditor);
    }else{
      initPolicyEditor();
    }
  }catch(e){}

})();
