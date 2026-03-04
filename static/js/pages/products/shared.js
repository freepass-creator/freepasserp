(function(){
  window.FP_PRD = window.FP_PRD || {};

  var BASE_TERMS = [6,12,24,36,48,60];

  function extractTermsFromVehicles(items){
    var s = new Set(BASE_TERMS);
    (items||[]).forEach(function(v){
      var pricing = (v && (v.pricing || v.terms || v.pricingByTerm)) || {};
      Object.keys(pricing||{}).forEach(function(k){
        var n = parseInt(String(k).replace(/[^0-9]/g,''), 10);
        if(Number.isFinite(n) && n>0) s.add(n);
      });
    });
    return Array.from(s).sort(function(a,b){ return a-b; });
  }

  function normalizeVehicles(items){
    return (items||[]).map(function(v, idx){
      var id = (v && (v.id || v.vehicleId || v.vehicle_id || v.carNo || v.car_no)) || ("v_" + idx);
      var out = {};
      for(var k in v) out[k] = v[k];
      out.id = id;
      return out;
    });
  }

  function getPricing(v, term){
    var pricing = (v && (v.pricing || v.terms || v.pricingByTerm)) || {};
    return pricing[String(term)] || pricing[term] || null;
  }

  window.FP_PRD.shared = {
    BASE_TERMS: BASE_TERMS,
    extractTermsFromVehicles: extractTermsFromVehicles,
    normalizeVehicles: normalizeVehicles,
    getPricing: getPricing
  };
})();
