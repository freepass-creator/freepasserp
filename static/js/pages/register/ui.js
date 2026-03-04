(function(){
  window.FP_REG = window.FP_REG || {};
  var CORE = window.FP_CORE || {};
  var esc = CORE.esc || function(v){ return String(v==null?"":v); };

  function setStatus(elMsg, msg, isError){
    if(!elMsg) return;
    elMsg.textContent = msg || "";
    elMsg.style.color = isError ? "#b00020" : "#6b7280";
  }

  function renderList(listEl, vehicles, editingCarNo){
    if(!listEl) return;
    if(!vehicles || vehicles.length===0){
      listEl.innerHTML = '<div class="center-muted" style="padding:12px;">등록된 차량이 없습니다.</div>';
      return;
    }
    listEl.innerHTML = vehicles.map(function(v){ return window.FP_REG.rowHtml(v, editingCarNo); }).join("");
  }

  function setActive(listEl, carNo){
    if(!listEl) return;
    listEl.querySelectorAll(".row.reg-row").forEach(function(el){
      var c = el.getAttribute("data-car") || "";
      if(carNo && c === carNo) el.classList.add("active");
      else el.classList.remove("active");
    });
  }

  function fillForm(els, v){
    if(!v) return;
    if(els.elCarNo) els.elCarNo.value = v.carNo || "";
    // 정책이 비어있으면 기본 약관1(POL_01)
    if(els.elPolicy) els.elPolicy.value = v.policyId || v.policy || "POL_01";
    if(els.elStatusSel) els.elStatusSel.value = v.status || v.vehicleStatus || "";
    if(els.elSubStatus) els.elSubStatus.value = v.subStatus || v.detailStatus || "";
    if(els.elKindSel) els.elKindSel.value = v.kind || v.productType || "";
    if(els.elMaker) els.elMaker.value = v.maker || "";
    if(els.elModel) els.elModel.value = v.model || "";
    if(els.elDetailModel){
  var dv = v.detailModel || "";
  els.elDetailModel.value = dv;
  // If dropdown options include year-prefix labels (e.g., "19~"), match by normalized name.
  try{
    if(dv && els.elDetailModel.options && !els.elDetailModel.value){
      var norm = (window.FP_REG.normalizeDetailName||function(x){return String(x||"").trim();});
      for(var i=0;i<els.elDetailModel.options.length;i++){
        var opt = els.elDetailModel.options[i];
        if(norm(opt.value) === norm(dv)){
          els.elDetailModel.value = opt.value;
          break;
        }
      }
    }
  }catch(e){}
}

    if(els.elTrim) els.elTrim.value = v.trim || "";
    if(els.elExColor) els.elExColor.value = v.exColor || v.exteriorColor || "";
    if(els.elInColor) els.elInColor.value = v.inColor || v.interiorColor || "";
    if(els.elYear) els.elYear.value = (v.year!=null) ? String(v.year) : "";
    if(els.elNewCarPrice) els.elNewCarPrice.value = (v.newCarPrice!=null) ? String(v.newCarPrice) : (v.newCarPriceWon!=null ? String(v.newCarPriceWon) : "");
    if(els.elMileageKm) els.elMileageKm.value = (v.mileageKm!=null) ? String(v.mileageKm) : "";
    if(els.elFuelSel) els.elFuelSel.value = v.fuel || "";
    if(els.elDisplacement) els.elDisplacement.value = (v.displacementCc!=null) ? String(v.displacementCc) : "";
    if(els.elFirstReg) els.elFirstReg.value = v.firstRegDate || "";
    if(els.elExpire) els.elExpire.value = v.expireDate || "";
    if(els.elAge21Op) els.elAge21Op.value = v.opAge21 || "계약불가";
    if(els.elAge23Op) els.elAge23Op.value = v.opAge23 || "계약불가";
    if(els.elOptionsText) els.elOptionsText.value = v.optionsText || "";
    if(els.elPhotoLink) els.elPhotoLink.value = v.photoLink || "";
    try{
      if(els.state){
        els.state.photoUrls = Array.isArray(v.photoUrls) ? v.photoUrls.slice() : [];
      }
      if(typeof els.onPhotoChange === "function") els.onPhotoChange(els.state ? els.state.photoUrls : []);
    }catch(e){}
    if(els.elCredit) els.elCredit.value = (v.creditGrade!=null) ? String(v.creditGrade) : "";
    if(els.elReview) els.elReview.value = v.reviewRequired || "";

    // ADMIN vehicle assignment (supplier business no)
    try{
      if(els.elSupplierBiz){
        els.elSupplierBiz.value = String(v.supplierBizNo || v.supplier_biz_no || "").trim();
      }
    }catch(e){}

    var pricing = v.pricing || {};
    (window.FP_REG.TERMS||[]).forEach(function(t){
      var rentEl = document.getElementById('reg-rent-' + t);
      var depEl  = document.getElementById('reg-dep-' + t);
      var buyEl  = document.getElementById('reg-buy-' + t);
      var row = pricing[String(t)] || {};
      if(rentEl) rentEl.value = (row.rent!=null) ? String(row.rent) : "";
      if(depEl)  depEl.value  = (row.deposit!=null) ? String(row.deposit) : "";
      if(buyEl)  buyEl.value  = (row.buyout!=null) ? String(row.buyout) : "";
    });
  }

  function resetForm(els){
    if(els.elCarNo) els.elCarNo.value = "";
    // 신규 등록 기본값: 약관1(POL_01)
    if(els.elPolicy) els.elPolicy.value = "POL_01";
    if(els.elStatusSel) els.elStatusSel.value = "출고가능";
    if(els.elSubStatus) els.elSubStatus.value = "";
    if(els.elKindSel) els.elKindSel.value = "신차렌트";
    if(els.elMaker) els.elMaker.value = "";
    if(els.elModel) els.elModel.value = "";
    if(els.elDetailModel) els.elDetailModel.value = "";
    if(els.elTrim) els.elTrim.value = "";
    if(els.elExColor) els.elExColor.value = "";
    if(els.elInColor) els.elInColor.value = "";
    if(els.elYear) els.elYear.value = "";
    if(els.elMileageKm) els.elMileageKm.value = "";
    if(els.elFuelSel) els.elFuelSel.value = "가솔린";
    if(els.elDisplacement) els.elDisplacement.value = "";
    if(els.elFirstReg) els.elFirstReg.value = "";
    if(els.elExpire) els.elExpire.value = "";
    if(els.elAge21Op) els.elAge21Op.value = "계약불가";
    if(els.elAge23Op) els.elAge23Op.value = "계약불가";
    if(els.elOptionsText) els.elOptionsText.value = "";
    if(els.elPhotoLink) els.elPhotoLink.value = "";
    if(els.elCredit) els.elCredit.value = "";
    if(els.elReview) els.elReview.value = "";

    try{ if(els.elSupplierBiz) els.elSupplierBiz.value = ""; }catch(e){}

    (window.FP_REG.TERMS||[]).forEach(function(t){
      var rentEl = document.getElementById('reg-rent-' + t);
      var depEl  = document.getElementById('reg-dep-' + t);
      var buyEl  = document.getElementById('reg-buy-' + t);
      if(rentEl) rentEl.value = "";
      if(depEl) depEl.value = "";
      if(buyEl) buyEl.value = "";
    });
  }

  function buildPayload(els){
    var toInt = window.FP_REG.toInt;

    var payload = {
      carNo: els.elCarNo ? els.elCarNo.value.trim() : "",
      policyId: (els.elPolicy ? String(els.elPolicy.value||"").trim() : "") || "POL_01",
      status: els.elStatusSel ? String(els.elStatusSel.value||"").trim() : "",
      subStatus: els.elSubStatus ? String(els.elSubStatus.value||"").trim() : "",
      kind: els.elKindSel ? String(els.elKindSel.value||"").trim() : "",
      maker: els.elMaker ? els.elMaker.value.trim() : "",
      model: els.elModel ? els.elModel.value.trim() : "",
      detailModel: (function(){ var v = els.elDetailModel ? els.elDetailModel.value.trim() : ""; try{ return (window.FP_REG.normalizeDetailName||function(x){return x;})(v); }catch(e){ return v; } })(),
      trim: els.elTrim ? els.elTrim.value.trim() : "",
      exColor: els.elExColor ? els.elExColor.value.trim() : "",
      inColor: els.elInColor ? els.elInColor.value.trim() : "",
      year: toInt(els.elYear ? els.elYear.value : null),
      newCarPrice: toInt(els.elNewCarPrice ? els.elNewCarPrice.value : null),
      mileageKm: toInt(els.elMileageKm ? els.elMileageKm.value : null),
      fuel: els.elFuelSel ? String(els.elFuelSel.value||"").trim() : "",
      displacementCc: toInt(els.elDisplacement ? els.elDisplacement.value : null),
      firstRegDate: els.elFirstReg ? String(els.elFirstReg.value||"").trim() : "",
      expireDate: els.elExpire ? String(els.elExpire.value||"").trim() : "",
      opAge21: els.elAge21Op ? String(els.elAge21Op.value||"").trim() : "계약불가",
      opAge23: els.elAge23Op ? String(els.elAge23Op.value||"").trim() : "계약불가",
      optionsText: els.elOptionsText ? els.elOptionsText.value.trim() : "",
      photoLink: els.elPhotoLink ? els.elPhotoLink.value.trim() : "",
      photoUrls: (els.state && Array.isArray(els.state.photoUrls)) ? els.state.photoUrls.slice() : [],
      creditGrade: toInt(els.elCredit ? els.elCredit.value : null),
      reviewRequired: els.elReview ? String(els.elReview.value||"").trim() : ""
    };

    // supplier assignment
    try{
      var me = window.FP_CURRENT_USER || {};
      if(String(me.role||"") === "ADMIN"){
        if(els.elSupplierBiz){
          var biz = String(els.elSupplierBiz.value||"").trim();
          payload.supplierBizNo = biz || null;
        }
      }else if(String(me.role||"") === "PROVIDER"){
        var myBiz = String(me.company_code||me.companyCode||"").trim();
        payload.supplierBizNo = myBiz || null;
      }
    }catch(e){}

    var pricing = {};
    (window.FP_REG.TERMS||[]).forEach(function(t){
      var rentEl = document.getElementById('reg-rent-' + t);
      var depEl  = document.getElementById('reg-dep-' + t);
      var buyEl  = document.getElementById('reg-buy-' + t);
      var rent = toInt(rentEl ? rentEl.value : null);
      var deposit = toInt(depEl ? depEl.value : null);
      var buyout = toInt(buyEl ? buyEl.value : null);
      if(rent!=null || deposit!=null || buyout!=null){
        pricing[String(t)] = {};
        if(rent!=null) pricing[String(t)].rent = rent;
        if(deposit!=null) pricing[String(t)].deposit = deposit;
        if(buyout!=null) pricing[String(t)].buyout = buyout;
      }
    });
    if(Object.keys(pricing).length>0) payload.pricing = pricing;

    // If user manually added a link, keep it as an additional photo url
    try{
      var link = (payload.photoLink||"").trim();
      if(link){
        var exists = payload.photoUrls.some(function(x){ return String(x||"").trim() === link; });
        if(!exists) payload.photoUrls.push(link);
      }
    }catch(e){}
    return payload;
  }

  function mapSaveError(e){
    var msg = String(e && e.message || "");
    if(msg.indexOf("duplicate")>=0 || msg.indexOf("중복")>=0) return "저장 실패: 차량번호 중복";
    if(msg.indexOf("required")>=0 || msg.indexOf("필수")>=0) return "저장 실패: 차량번호 필수";
    if(msg.indexOf("not_found")>=0) return "저장 실패: 대상 없음";
    return "저장 실패";
  }

  function renderLog(logEl, v){
    if(!logEl) return;
    if(!v){
      logEl.innerHTML = '<div class="center-muted">차량을 선택하면 수정 로그가 표시됩니다.</div>';
      return;
    }
    var log = v.changeLog;
    if(!Array.isArray(log) || log.length === 0){
      logEl.innerHTML = '<div class="center-muted">수정 로그가 없습니다.</div>';
      return;
    }

    // newest first
    var items = log.slice().reverse();
    logEl.innerHTML = items.map(function(it){
      var at = esc(it.at || "");
      var action = String(it.action || "");
      var actionText = (action === "create") ? "등록" : (action === "update") ? "수정" : action;
      var changes = Array.isArray(it.changes) ? it.changes : [];
      var fields = changes.map(function(c){ return String(c.field || ""); }).filter(Boolean);
      var main = at ? (at + " · " + actionText) : actionText;
      var sub = fields.length ? ("변경: " + fields.join(", ")) : (action === "create" ? "" : "변경 항목 없음");
      return (
        '<div class="log-item">'
        + '<div class="main-line">' + esc(main) + '</div>'
        + (sub ? ('<div class="sub-line">' + esc(sub) + '</div>') : '')
        + '</div>'
      );
    }).join("");
  }

  window.FP_REG.ui = {
    setStatus: setStatus,
    renderList: renderList,
    setActive: setActive,
    fillForm: fillForm,
    resetForm: resetForm,
    buildPayload: buildPayload,
    mapSaveError: mapSaveError,
    renderLog: renderLog
  };
})();
