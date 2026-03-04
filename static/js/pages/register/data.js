(function(){
  window.FP_REG = window.FP_REG || {};
  var CORE = window.FP_CORE || {};
  var api = (CORE.api || {});

  function ensureFilterState(){
    window.FP_FILTER_STATE = window.FP_FILTER_STATE || {};
    if(!window.FP_FILTER_STATE.register) window.FP_FILTER_STATE.register = { keyword:"" };
  }

  function applyKeywordFilter(vehiclesAll){
    ensureFilterState();
    var kw = String(window.FP_FILTER_STATE.register && window.FP_FILTER_STATE.register.keyword || "").trim().toLowerCase();
    if(!kw) return vehiclesAll;
    return (vehiclesAll||[]).filter(function(v){
      var hay = [v.carNo, v.policyId, v.status, v.kind, v.maker, v.model, v.detailModel, v.trim, v.fuel, v.optionsText].filter(Boolean).join(" ").toLowerCase();
      return hay.indexOf(kw) >= 0;
    });
  }

  async function reloadFromApi(onOk, onFail){
    try{
      var out = await (api.getVehicles ? api.getVehicles() : Promise.reject(new Error("api_missing")));
      var items = api.normApiItems ? api.normApiItems(out) : (out && out.items) || [];
      onOk && onOk(items);
    }catch(e){
      onFail && onFail(e);
    }
  }

  window.FP_REG.ensureFilterState = ensureFilterState;
  window.FP_REG.applyKeywordFilter = applyKeywordFilter;
  window.FP_REG.reloadFromApi = reloadFromApi;
})();
