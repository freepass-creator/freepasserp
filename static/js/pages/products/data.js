(function(){
  window.FP_PRD = window.FP_PRD || {};
  var shared = window.FP_PRD.shared;

  async function loadVehiclesFromApi(fallback, setVehicles){
    try{
      var res = await fetch('/api/vehicles_all', { headers:{ 'Accept':'application/json' }});
      if(!res.ok){
        if(fallback!=null) setVehicles(fallback);
        return;
      }
      var out = await res.json();
      var items = Array.isArray(out && out.items) ? out.items : (Array.isArray(out && out.vehicles) ? out.vehicles : []);
      // ✅ Products list must reflect 실제 등록 데이터: API가 성공하면(0개라도) 그대로 사용
      setVehicles(items);
    }catch(e){
      console.error('[products] loadVehiclesFromApi failed:', e);
      if(fallback!=null) setVehicles(fallback);
    }
  }
  async function loadPoliciesFromApi(setPolicies){
    try{
      var res = await fetch('/api/policies', { headers:{ 'Accept':'application/json' }});
      if(!res.ok){
        setPolicies && setPolicies(null);
        return;
      }
      var out = await res.json();
      // out is expected to be a dict keyed by policy id
      if(out && typeof out === 'object' && !Array.isArray(out)){
        setPolicies && setPolicies(out);
      }else{
        setPolicies && setPolicies(null);
      }
    }catch(e){
      console.warn('[products] policies api error:', e);
      setPolicies && setPolicies(null);
    }
  }



  function createVehicleStore(initial, state){
    var vehicles = shared.normalizeVehicles(Array.isArray(initial) ? initial : []);
    var allTerms = shared.extractTermsFromVehicles(vehicles);

    function setVehicles(next){
      vehicles = shared.normalizeVehicles(Array.isArray(next) ? next : []);
      allTerms = shared.extractTermsFromVehicles(vehicles);
      if(state.products && state.products.activeVehicleId){
        var exists = vehicles.some(function(v){ return String(v.id)===String(state.products.activeVehicleId); });
        if(!exists) state.products.activeVehicleId = null;
      }
    }

    function getVehicles(){ return vehicles; }
    function getAllTerms(){ return allTerms; }

    return { setVehicles:setVehicles, getVehicles:getVehicles, getAllTerms:getAllTerms };
  }

  window.FP_PRD.data = { loadVehiclesFromApi: loadVehiclesFromApi, loadPoliciesFromApi: loadPoliciesFromApi, createVehicleStore: createVehicleStore };
})();
