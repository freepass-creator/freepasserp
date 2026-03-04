(function(){
  window.FP_CORE = window.FP_CORE || {};

  async function fetchJSON(url, opts){
    const res = await fetch(url, opts||{});
    const ct = res.headers.get("content-type") || "";
    let data = null;
    try{
      data = ct.includes("application/json") ? await res.json() : await res.text();
    }catch(e){
      data = null;
    }
    if(!res.ok){
      const err = new Error("HTTP "+res.status);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // ---- Vehicles ----
  async function listVehicles(){
    return await fetchJSON("/api/vehicles");
  }

  // Backward-compatible alias used by some page modules
  async function getVehicles(){
    return await listVehicles();
  }

  // Normalize API payloads into a simple items array
  function normApiItems(out){
    if(!out) return [];
    if(Array.isArray(out)) return out;
    if(Array.isArray(out.items)) return out.items;
    return [];
  }
  async function createVehicle(payload){
    return await fetchJSON("/api/vehicles", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify(payload||{})
    });
  }
  async function updateVehicle(carNo, payload){
    return await fetchJSON("/api/vehicles/" + encodeURIComponent(carNo), {
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify(payload||{})
    });
  }
  async function deleteVehicle(carNo){
    return await fetchJSON("/api/vehicles/" + encodeURIComponent(carNo), { method:"DELETE" });
  }

  async function applyPolicyToVehicles(policyId, mode, carNos){
    return await fetchJSON("/api/vehicles/apply-policy", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ policyId: policyId, mode: mode||"missing", carNos: carNos||null })
    });
  }


  // ---- Policies ----
  async function getPolicies(){
    return await fetchJSON("/api/policies");
  }
  
  async function getVehicleMaster(){
    return fetchJSON("/api/vehicle_master");
  }

async function updatePolicy(policyId, payload){
    return await fetchJSON("/api/policies/" + encodeURIComponent(policyId), {
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify(payload||{})
    });
  }

  
  async function uploadVehiclePhotos(files){
    var fd = new FormData();
    (files||[]).forEach(function(f){ fd.append("files", f); });
    return fetch("/api/uploads/vehicle_photos", { method:"POST", body: fd }).then(async function(r){
      if(!r.ok){
        var t = await r.text();
        throw new Error(t||("HTTP "+r.status));
      }
      return r.json();
    });
  }

  // ---- Admin: partners master (for vehicle assignment) ----
  async function listAdminPartners(){
    return await fetchJSON("/api/admin/partners");
  }

window.FP_CORE.api = {
    fetchJSON,
    listVehicles,
    getVehicles,
    createVehicle,
    updateVehicle,
    deleteVehicle,
    normApiItems,
    getPolicies,
    getVehicleMaster,
    updatePolicy,
    uploadVehiclePhotos,
    listAdminPartners
  };
})();