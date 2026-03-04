(function(){
  window.FP_PAGES = window.FP_PAGES || {};

  // Register page controller
  window.FP_PAGES.register = function(ctx){
    var $ = ctx.$;
    var data = ctx.data || {};
    var setTopbarCount = ctx.setTopbarCount;

    setTopbarCount && setTopbarCount(0);

    // Page-scoped styling hook (avoid global UI changes)
    try{ document.documentElement.setAttribute('data-active-page','register'); }catch(e){}

    
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
var list = $("#register-list");
    if(!list) return;

    // init policy editor (right panel)
    try{
      if(window.FP_REG && window.FP_REG.policy && typeof window.FP_REG.policy.initPolicyEditor === "function"){
        window.FP_REG.policy.initPolicyEditor(ctx);
      }
    }catch(e){}

    var els = {
      elMsg: $("#reg-msg"),
      elSave: $("#reg-save"),
      elReset: $("#reg-reset"),
      elLog: $("#reg-log"),
      elCarNo: $("#reg-carNo"),
      elPolicy: $("#reg-policy"),
      elStatusSel: $("#reg-status"),
      elSubStatus: $("#reg-subStatus"),
      elKindSel: $("#reg-kind"),
      elMaker: $("#reg-maker"),
      elModel: $("#reg-model"),
      elDetailModel: $("#reg-detailModel"),
      elTrim: $("#reg-trim"),
      elExColor: $("#reg-exColor"),
      elInColor: $("#reg-inColor"),
      elYear: $("#reg-year"),
      elNewCarPrice: $("#reg-newCarPrice"),
      elMileageKm: $("#reg-mileageKm"),
      elFuelSel: $("#reg-fuel"),
      elDisplacement: $("#reg-displacement"),
      elFirstReg: $("#reg-firstReg"),
      elExpire: $("#reg-expire"),
      elAge21Op: $("#reg-age21Op"),
      elAge23Op: $("#reg-age23Op"),
      elOptionsText: $("#reg-optionsText"),
      elPhotoLink: $("#reg-photoLink"),
      elCredit: $("#reg-credit"),
      elReview: $("#reg-review"),
      elSupplierBizWrap: $("#reg-supplierBiz-wrap"),
      elSupplierBiz: $("#reg-supplierBiz"),
      elSheetUrl: $("#reg-sheet-url"),
      elSheetImport: $("#reg-sheet-import"),
      elSheetMsg: $("#reg-sheet-msg"),
      elPhotoDrop: $("#reg-photo-drop"),
      elPhotoFile: $("#reg-photo-file"),
      elPhotoList: $("#reg-photo-list")
    };

    // Local UI state (kept out of DOM values)
    els.state = { photoUrls: [] };

    function renderPhotoList(urls){
      try{
        var listEl = els.elPhotoList;
        if(!listEl) return;
        var arr = Array.isArray(urls) ? urls : [];
        if(arr.length===0){
          listEl.innerHTML = "";
          return;
        }
        listEl.innerHTML = arr.map(function(url, idx){
          var u = String(url||"");
          return (
            '<div class="photo-item" data-idx="'+idx+'">' +
              '<div class="photo-thumb">' +
                '<img src="'+u.replace(/"/g,'&quot;')+'" alt="photo">' +
              '</div>' +
              '<div class="photo-actions">' +
                '<button type="button" class="btn-outline btn-sm" data-act="remove" data-idx="'+idx+'">삭제</button>' +
              '</div>' +
            '</div>'
          );
        }).join("");
      }catch(e){}
    }
    els.onPhotoChange = renderPhotoList;




    
    function wirePhotoUpload(){
      var drop = els.elPhotoDrop;
      var file = els.elPhotoFile;
      if(drop && file){
        drop.addEventListener("click", function(){ file.click(); });
        drop.addEventListener("dragover", function(e){ e.preventDefault(); drop.classList.add("dragover"); });
        drop.addEventListener("dragleave", function(){ drop.classList.remove("dragover"); });
        drop.addEventListener("drop", async function(e){
          e.preventDefault(); drop.classList.remove("dragover");
          var files = (e.dataTransfer && e.dataTransfer.files) ? Array.prototype.slice.call(e.dataTransfer.files) : [];
          await handlePhotoFiles(files);
        });
        file.addEventListener("change", async function(){
          var files = file.files ? Array.prototype.slice.call(file.files) : [];
          file.value = "";
          await handlePhotoFiles(files);
        });
      }
      if(els.elPhotoList){
        els.elPhotoList.addEventListener("click", function(e){
          var btn = e.target && e.target.closest ? e.target.closest('button[data-act="remove"]') : null;
          if(!btn) return;
          var idx = parseInt(btn.getAttribute("data-idx")||"-1",10);
          if(!(idx>=0)) return;
          els.state.photoUrls.splice(idx,1);
          renderPhotoList(els.state.photoUrls);
        });
      }
    }

    async function handlePhotoFiles(files){
      try{
        if(!files || files.length===0) return;
        if(!API.uploadVehiclePhotos) return;
        // filter to images only
        var imgs = files.filter(function(f){ return (f && f.type && f.type.indexOf("image/")===0); });
        if(imgs.length===0) return;
        try{ UI.setStatus && UI.setStatus(els.elMsg, "사진 업로드 중...", false); }catch(e){}
        var res = await API.uploadVehiclePhotos(imgs);
        var urls = (res && res.urls) ? res.urls : [];
        urls.forEach(function(u){ if(u && els.state.photoUrls.indexOf(u)===-1) els.state.photoUrls.push(u); });
        renderPhotoList(els.state.photoUrls);
        try{ UI.setStatus && UI.setStatus(els.elMsg, "사진 업로드 완료", false); }catch(e){}
      }catch(err){
        try{ UI.setStatus && UI.setStatus(els.elMsg, "사진 업로드 실패", true); }catch(e){}
      }
    }

// Vehicle master (maker/model/detail) from /api/vehicle_master
    var VEH_MASTER = null;
    var VEH_MASTER_MAP = null; // maker -> model -> details[]
    function buildMasterMap(data){
      var map = {};
      try{
        (data.makers||[]).forEach(function(m){
          var maker = String(m.name||"").trim();
          if(!maker) return;
          map[maker] = map[maker] || {};
          (m.models||[]).forEach(function(mm){
            var model = String(mm.name||"").trim();
            if(!model) return;
            map[maker][model] = (mm.details||[]).map(function(d){
              return {
                detail: d.detail || d.name || "",
                code: d.code || null,
                display: d.display || null,
                launch_year: d.launch_year || null,
                prod_period: d.prod_period || null,
                category: d.category || null
              };
            });
          });
        });
      }catch(e){}
      return map;
    }
    function setOptions(el, values, placeholder){
      if(!el) return;
      var opts = [];
      opts.push('<option value="">' + (placeholder||"선택") + '</option>');
      (values||[]).forEach(function(v){
        opts.push('<option value="'+ esc(v) +'">'+ esc(v) +'</option>');
      });
      el.innerHTML = opts.join("");
    }
    
// ---- Popularity ordering (admin heuristic) ----
// 제조사/모델은 '인기순'으로 상단 배치. 목록이 확장되면 이 리스트만 업데이트하면 됨.
var POP_MAKERS = ["현대","기아","제네시스","르노코리아","쉐보레","KG모빌리티","쌍용","BMW","벤츠","Mercedes-Benz","아우디","테슬라"];
var POP_MODELS = {
  "현대": ["그랜저","쏘나타","아반떼","싼타페","투싼","팰리세이드","코나","스타리아","아이오닉","캐스퍼"],
  "기아": ["K5","K8","K3","K7","스포티지","쏘렌토","카니발","셀토스","모닝","레이","EV6","EV9"],
  "제네시스": ["G80","GV80","GV70","G70","G90"],
  "BMW": ["3시리즈","5시리즈","X3","X5","X1"],
  "벤츠": ["E클래스","C클래스","GLC","GLE","S클래스"],
  "Mercedes-Benz": ["E클래스","C클래스","GLC","GLE","S클래스"]
};
function rankByList(name, list){
  name = String(name||"");
  list = list || [];
  // exact match first
  var exact = list.indexOf(name);
  if(exact >= 0) return exact;
  // contains match (token)
  for(var i=0;i<list.length;i++){
    if(name.indexOf(list[i])>=0) return i+0.5;
  }
  return 9999;
}
function extractDetailYearStart(label){
  var s = String(label||"").trim();
  // formats: "19~ xxx", "2021~ xxx", "20년~ xxx"
  var m = s.match(/^\s*(\d{2,4})\s*(?:년)?\s*~\s*/);
  if(!m) return null;
  var y = parseInt(m[1],10);
  if(!isFinite(y)) return null;
  if(m[1].length === 2) y = 2000 + y; // 19 -> 2019
  return y;
}

function getMakers(){
      if(!VEH_MASTER_MAP) return [];
      var keys = Object.keys(VEH_MASTER_MAP);
      keys.sort(function(a,b){
        var ra = rankByList(a, POP_MAKERS);
        var rb = rankByList(b, POP_MAKERS);
        if(ra !== rb) return ra - rb;
        // fallback: 가나다순
        return String(a).localeCompare(String(b), "ko");
      });
      return keys;
    }
    function getModels(maker){
      maker = String(maker||"").trim();
      if(!maker || !VEH_MASTER_MAP || !VEH_MASTER_MAP[maker]) return [];
      var keys = Object.keys(VEH_MASTER_MAP[maker]);
      var pref = POP_MODELS[maker] || null;
      keys.sort(function(a,b){
        if(pref){
          var ra = rankByList(a, pref);
          var rb = rankByList(b, pref);
          if(ra !== rb) return ra - rb;
        }
        return String(a).localeCompare(String(b), "ko");
      });
      return keys;
    }
    function getDetails(maker, model){
      maker = String(maker||"").trim();
      model = String(model||"").trim();
      if(!maker || !model || !VEH_MASTER_MAP || !VEH_MASTER_MAP[maker] || !VEH_MASTER_MAP[maker][model]) return [];
      var rows = (VEH_MASTER_MAP[maker][model]||[]).map(function(d){
        var label = d.display || d.detail || "";
        return { label: label, y: extractDetailYearStart(label) };
      }).filter(function(x){ return !!x.label; });

      rows.sort(function(a,b){
        // 최신 연식 prefix가 있으면 높은 게 위
        if(a.y != null || b.y != null){
          var ya = (a.y==null) ? -1 : a.y;
          var yb = (b.y==null) ? -1 : b.y;
          if(ya !== yb) return yb - ya;
        }
        return String(a.label).localeCompare(String(b.label), "ko");
      });
      return rows.map(function(x){ return x.label; });
    }
    function wireMasterDropdowns(){
      if(!els.elMaker || !els.elModel || !els.elDetailModel) return;
      // maker change -> rebuild models/details
      els.elMaker.addEventListener("change", function(){
        var mk = els.elMaker.value;
        setOptions(els.elModel, getModels(mk), "모델 선택");
        setOptions(els.elDetailModel, [], "세부모델 선택");
      });
      els.elModel.addEventListener("change", function(){
        var mk = els.elMaker.value;
        var md = els.elModel.value;
        setOptions(els.elDetailModel, getDetails(mk, md), "세부모델 선택");
      });
    }
    function applyMasterToForm(){
      // initial maker options
      setOptions(els.elMaker, getMakers(), "제조사 선택");
      setOptions(els.elModel, [], "모델 선택");
      setOptions(els.elDetailModel, [], "세부모델 선택");
    }
    async function loadVehicleMaster(){
      try{
        if(API.getVehicleMaster){
          VEH_MASTER = await API.getVehicleMaster();
          VEH_MASTER_MAP = buildMasterMap(VEH_MASTER||{});
          applyMasterToForm();
          wireMasterDropdowns();

          // Default selection (most-used): maker = 현대 if exists, else first.
          try{
            if(els.elMaker && !String(els.elMaker.value||"")){
              var makers = getMakers();
              var preferred = makers.indexOf("현대")>=0 ? "현대" : (makers[0]||"");
              if(preferred){
                els.elMaker.value = preferred;
                try{ els.elMaker.dispatchEvent(new Event("change")); }catch(e){}
                // auto-pick first model/detail if available
                setTimeout(function(){
                  try{
                    if(els.elModel && !els.elModel.value){
                      var models = getModels(preferred);
                      if(models[0]){
                        els.elModel.value = models[0];
                        try{ els.elModel.dispatchEvent(new Event("change")); }catch(e){}
                      }
                    }
                    if(els.elDetailModel && !els.elDetailModel.value){
                      var details = getDetails(preferred, els.elModel ? els.elModel.value : "");
                      if(details[0]) els.elDetailModel.value = details[0];
                    }
                  }catch(e){}
                }, 0);
              }
            }
          }catch(e){}
        }
      }catch(e){
        // ignore: allow manual typing fallback is removed; keep selects empty
      }
    }


    // Admin-only: assign vehicle to supplier business number
    async function loadAdminSupplierBiz(){
      try{
        var me = window.FP_CURRENT_USER || {};
        if(!els.elSupplierBizWrap || !els.elSupplierBiz) return;
        if(String(me.role||"") !== "ADMIN"){
          els.elSupplierBizWrap.style.display = "none";
          return;
        }
        els.elSupplierBizWrap.style.display = "block";
        if(API.listAdminPartners){
          var rows = await API.listAdminPartners();
          var opts = ['<option value="">사업자번호 선택</option>'];
          (rows||[]).forEach(function(r){
            var biz = String(r.businessNo||r.business_no||"").trim();
            var name = String(r.companyName||r.company_name||"").trim();
            if(!biz) return;
            var label = name ? (biz + " · " + name) : biz;
            opts.push('<option value="'+escHtml(biz)+'">'+escHtml(label)+'</option>');
          });
          els.elSupplierBiz.innerHTML = opts.join("");
        }
      }catch(e){
        // keep hidden on errors
        try{ if(els.elSupplierBizWrap) els.elSupplierBizWrap.style.display = "none"; }catch(_e){}
      }
    }


    var UI = (window.FP_REG && window.FP_REG.ui) || {};
    var API = (window.FP_CORE && window.FP_CORE.api) || {};

    var vehiclesAll = (data && data.vehicles) ? data.vehicles.slice() : [];
    var vehicles = vehiclesAll;
    var editingCarNo = null;
    var lastLoadedStr = null; // stable JSON of last loaded/saved payload for current car

    // ---- helpers ----
    function setActive(carNo){
      editingCarNo = carNo || null;
      UI.setActive && UI.setActive(list, editingCarNo);
    }

    function applyFilterAndRender(){
      vehicles = (window.FP_REG && window.FP_REG.applyKeywordFilter)
        ? window.FP_REG.applyKeywordFilter(vehiclesAll)
        : vehiclesAll;
      UI.renderList && UI.renderList(list, vehicles, editingCarNo);
      if(setTopbarCount) setTopbarCount((vehicles||[]).length);
      if(editingCarNo && UI.setActive) UI.setActive(list, editingCarNo);
    }

    function resetFormAll(){
      setActive(null);
      UI.resetForm && UI.resetForm(els);
      lastLoadedStr = null;
      try{ syncPolicyEditorFromRegister(true); }catch(e){}
      UI.renderLog && UI.renderLog(els.elLog, null);
      UI.setStatus && UI.setStatus(els.elMsg, "", false);
    }

    function fillByCarNo(carNo){
      var v = (vehiclesAll||[]).find(function(x){ return String(x.carNo||"")===String(carNo||""); });
      if(!v) return;
      setActive(carNo);
      UI.fillForm && UI.fillForm(els, v);
      // ensure cascading selects are populated for existing vehicle values
      try{
        if(VEH_MASTER_MAP && els.elMaker && els.elModel && els.elDetailModel){
          var mk = String(v.maker||"").trim();
          var md = String(v.model||"").trim();
          var dt = String(v.detailModel||"").trim();
          if(mk){
            els.elMaker.value = mk;
            setOptions(els.elModel, getModels(mk), "모델 선택");
            if(md) els.elModel.value = md;
            setOptions(els.elDetailModel, getDetails(mk, md), "세부모델 선택");
            if(dt) els.elDetailModel.value = dt;
          }
        }
      }catch(e){}
      try{ lastLoadedStr = stableStringify(UI.buildPayload ? UI.buildPayload(els) : {}); }catch(e){ lastLoadedStr = null; }
      // IMPORTANT: after setting value programmatically, force-sync policy editor
      try{ syncPolicyEditorFromRegister(true); }catch(e){}
      UI.renderLog && UI.renderLog(els.elLog, v);
      UI.setStatus && UI.setStatus(els.elMsg, "선택됨", false);
    }

    function syncPolicyEditorFromRegister(force){
      var polSel = document.getElementById("pol-id"); // policy editor select
      if(!els.elPolicy || !polSel) return;
      var v = String(els.elPolicy.value||"");
      if(!v) return;
      if(force || polSel.value !== v){
        polSel.value = v;
        try{ polSel.dispatchEvent(new Event("change")); }catch(e){}
      }
    }

    function syncRegisterFromPolicyEditor(){
      var polSel = document.getElementById("pol-id");
      if(!els.elPolicy || !polSel) return;
      var v = String(polSel.value||"");
      if(v && els.elPolicy.value !== v){
        els.elPolicy.value = v;
      }
    }

    async function reload(){
      if(!(window.FP_REG && window.FP_REG.reloadFromApi)) return;
      window.FP_REG.reloadFromApi(function(items){
        vehiclesAll = items || [];
        applyFilterAndRender();
        if(editingCarNo){
          fillByCarNo(editingCarNo);
        }
      }, function(){
        UI.setStatus && UI.setStatus(els.elMsg, "목록 불러오기 실패", true);
      });
    }

    async function onSave(){
      try{
        UI.setStatus && UI.setStatus(els.elMsg, "저장 중…", false);
        var payload = UI.buildPayload ? UI.buildPayload(els) : {};
        if(!payload.policyId) payload.policyId = "POL_01";

// Required fields validation
var missing = [];
if(!payload.carNo) missing.push("차량번호");
if(!payload.policyId) missing.push("적용약관");
if(!payload.status) missing.push("차량상태");
if(!payload.kind) missing.push("상품구분");
if(!payload.maker) missing.push("제조사");
if(!payload.model) missing.push("모델");
if(!payload.detailModel) missing.push("세부모델");
if(missing.length){
  var msg = "필수 항목을 입력해야 합니다: " + missing.join(", ");
  UI.setStatus && UI.setStatus(els.elMsg, "저장 실패: " + msg, true);
  try{ alert(msg); }catch(e){}
  return;
}
        if(editingCarNo && payload.carNo !== editingCarNo){
          UI.setStatus && UI.setStatus(els.elMsg, "차량번호는 변경 불가입니다. 삭제 후 신규 등록하세요.", true);
          return;
        }

        if(editingCarNo){
          var currStr = null;
          try{ currStr = stableStringify(payload); }catch(e){}
          if(lastLoadedStr && currStr === lastLoadedStr){
            UI.setStatus && UI.setStatus(els.elMsg, "변경사항이 없습니다.", false);
            return;
          }
          await API.updateVehicle(editingCarNo, payload);
          UI.setStatus && UI.setStatus(els.elMsg, "변경되었습니다.", false);
          (window.FP_CORE && window.FP_CORE.toast) && window.FP_CORE.toast("변경되었습니다.", false);
          try{ lastLoadedStr = stableStringify(payload); }catch(e){}
        }else{
          await API.createVehicle(payload);
          UI.setStatus && UI.setStatus(els.elMsg, "저장되었습니다.", false);
          (window.FP_CORE && window.FP_CORE.toast) && window.FP_CORE.toast("저장되었습니다.", false);
          // after create, mark as editing
          editingCarNo = payload.carNo;
          try{ lastLoadedStr = stableStringify(payload); }catch(e){}
        }
        await loadVehicleMaster();

    reload();
      }catch(e){
        UI.setStatus && UI.setStatus(els.elMsg, (UI.mapSaveError ? UI.mapSaveError(e) : "저장 실패"), true);
      }
    }

    async function onDelete(carNo){
      var target = String(carNo||"").trim();
      if(!target) return;
      if(!confirm(target + " 차량을 삭제할까요?")) return;
      try{
        UI.setStatus && UI.setStatus(els.elMsg, "삭제 중…", false);
        await API.deleteVehicle(target);
        if(editingCarNo === target) resetFormAll();
        UI.setStatus && UI.setStatus(els.elMsg, "삭제 완료", false);
        (window.FP_CORE && window.FP_CORE.toast) && window.FP_CORE.toast("삭제 완료", false);
        await reload();
      }catch(e){
        UI.setStatus && UI.setStatus(els.elMsg, "삭제 실패", true);
        (window.FP_CORE && window.FP_CORE.toast) && window.FP_CORE.toast("삭제 실패", true);
      }
    }

    async function onSheetImport(){
      try{
        var url = String((els.elSheetUrl && els.elSheetUrl.value) || "").trim();
        if(!url){
          if(els.elSheetMsg) els.elSheetMsg.textContent = "링크를 입력하세요.";
          return;
        }

        if(els.elSheetMsg) els.elSheetMsg.textContent = "가져오는 중…";
        var res = await fetch("/api/import/sheet", {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({url: url})
        });
        var j = await res.json();
        if(!j || !j.ok){
          if(els.elSheetMsg) els.elSheetMsg.textContent = "실패: " + String((j && j.error) || "오류");
          return;
        }
        if(els.elSheetMsg) els.elSheetMsg.textContent = "완료: 신규 " + (j.created||0) + "건 / 업데이트 " + (j.updated||0) + "건";
        await reload();
      }catch(e){
        if(els.elSheetMsg) els.elSheetMsg.textContent = "실패: 가져오기 오류";
      }
    }

function setOptions(selectEl, values, includeBlank){
      if(!selectEl) return;
      var html = "";
      if(includeBlank) html += '<option value="">-</option>';
      (values||[]).forEach(function(v){
        var s = String(v);
        html += '<option value="'+s.replace(/"/g,'&quot;')+'">'+s+'</option>';
      });
      selectEl.innerHTML = html;
    }

    function escHtml(s){
      return String(s)
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#39;");
    }

    function slotLabel(id){
      var m = /^POL_(\d{2})$/.exec(String(id||"").trim());
      if(!m) return null;
      var n = parseInt(m[1], 10);
      return isFinite(n) ? ("약관" + n) : null;
    }

    function mapToPolicyArray(map){
      var arr = [];
      try{
        Object.keys(map||{}).forEach(function(k){
          var p = map[k] || {};
          if(!p.id) p.id = k;
          arr.push(p);
        });
      }catch(e){}
      arr.sort(function(a,b){ return String(a.id||"").localeCompare(String(b.id||"")); });
      // prefer slots
      var slots = arr.filter(function(p){ return /^POL_\d{2}$/.test(String(p.id||"")); });
      return slots.length ? slots : arr;
    }

    function setPolicyOptions(){
      if(!els.elPolicy) return;
      var prev = String(els.elPolicy.value||""); // preserve current selection
      if(API && typeof API.getPolicies === "function"){
        API.getPolicies().then(function(map){
          var arr = mapToPolicyArray(map);
          window.FP_REG = window.FP_REG || {};
          window.FP_REG.POLICIES = arr;

          // NOTE:
          // - 약관은 POL_01~POL_05 슬롯을 기본으로 사용 (ID 고정)
          // - 등록/변경은 기본 약관1(POL_01)이 기본 선택되면 입력이 편함
          var html = arr.map(function(p){
            var id = String(p.id||"");
            var slot = slotLabel(id);
            var userName = (p.name!=null && String(p.name).trim()) ? String(p.name).trim() : "미설정";
            var label = slot ? (slot + " - " + userName) : (userName || id);
            return '<option value="'+escHtml(id)+'">'+escHtml(label)+'</option>';
          }).join("");
          els.elPolicy.innerHTML = html;

          // restore selection
          // - 기존에 선택된 값이 유효하면 유지
          // - 아니면 기본 약관1(POL_01)
          if(prev && arr.some(function(p){ return String(p.id)===prev; })){
            els.elPolicy.value = prev;
          }else if(arr.some(function(p){ return String(p.id)==="POL_01"; })){
            els.elPolicy.value = "POL_01";
          }else{
            els.elPolicy.value = (arr[0] && arr[0].id) ? String(arr[0].id) : "";
          }

          // keep policy editor in sync after options rebuild
          try{ syncPolicyEditorFromRegister(true); }catch(e){}
        }).catch(function(){
          // ignore
        });
      }
    }

    // expose refresh hook for policy editor
    window.FP_REG = window.FP_REG || {};
    window.FP_REG.ui = window.FP_REG.ui || UI;
    window.FP_REG.ui.refreshPolicyDropdown = setPolicyOptions;

    // ---- events ----
    list.addEventListener("click", function(ev){
      var btn = ev.target && ev.target.closest ? ev.target.closest("button[data-act]") : null;
      var row = ev.target && ev.target.closest ? ev.target.closest(".reg-row") : null;
      if(!row) return;
      var carNo = row.getAttribute("data-car") || "";
      if(btn){
        ev.preventDefault();
        ev.stopPropagation();
        if(btn.getAttribute("data-act")==="del") onDelete(carNo);
        return;
      }
      fillByCarNo(carNo);
    });

    window.addEventListener("fp:filter:apply", function(ev){
      if(!(ev && ev.detail && ev.detail.page === "register")) return;
      if(window.FP_REG && window.FP_REG.ensureFilterState){
        window.FP_REG.ensureFilterState();
        window.FP_FILTER_STATE.register.keyword = String(ev.detail.keyword||"").trim();
      }
      applyFilterAndRender();
    });

    window.addEventListener("fp:filter:reset", function(ev){
      if(!(ev && ev.detail && ev.detail.page === "register")) return;
      applyFilterAndRender();
    });

    if(els.elReset) els.elReset.addEventListener("click", resetFormAll);
    if(els.elSave) els.elSave.addEventListener("click", onSave);
    if(els.elSheetImport) els.elSheetImport.addEventListener("click", onSheetImport);

    if(els.elPolicy) els.elPolicy.addEventListener("change", function(){ syncPolicyEditorFromRegister(true); });
    try{
      var polSel = document.getElementById("pol-id");
      if(polSel) polSel.addEventListener("change", syncRegisterFromPolicyEditor);
    }catch(e){}

    // ---- init ----
    // Required dropdowns: default to most-used values (no empty placeholder)
    setOptions(els.elStatusSel, (window.FP_REG && window.FP_REG.STATUS_OPTIONS) || [], false);
    setOptions(els.elKindSel, (window.FP_REG && window.FP_REG.KIND_OPTIONS) || [], false);
    setOptions(els.elFuelSel, (window.FP_REG && window.FP_REG.FUEL_OPTIONS) || [], false);
    setOptions(els.elCredit, (window.FP_REG && window.FP_REG.CREDIT_OPTIONS) || [], true);

    try{ if(els.elStatusSel && !els.elStatusSel.value) els.elStatusSel.value = "출고가능"; }catch(e){}
    try{ if(els.elKindSel && !els.elKindSel.value) els.elKindSel.value = "신차렌트"; }catch(e){}
    try{ if(els.elFuelSel && !els.elFuelSel.value) els.elFuelSel.value = "가솔린"; }catch(e){}

    if(window.FP_REG && window.FP_REG.ensureFilterState) window.FP_REG.ensureFilterState();

    applyFilterAndRender();
    UI.renderLog && UI.renderLog(els.elLog, null);

    // load master data & wire UI
    try{ if(window.FP_REG && window.FP_REG.attachCommaFormat) window.FP_REG.attachCommaFormat(document); }catch(e){}
    try{ wirePhotoUpload(); }catch(e){}
    try{ loadVehicleMaster(); }catch(e){}
    try{ loadAdminSupplierBiz(); }catch(e){}

    // load policies & vehicles
    setPolicyOptions();
    reload();
  };
})();

