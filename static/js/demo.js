(function(){
  var CORE = window.FP_CORE || {};
  var $ = CORE.$ || function(s, r){ return (r||document).querySelector(s); };
  var esc = CORE.esc || function(v){ return String(v==null?"":v); };

  var pageEl = document.querySelector("[data-page]");
  var page = pageEl ? pageEl.getAttribute("data-page") : "";

  // ===== Sample Data (single source) =====
  var SAMPLE = window.FREEPASS_SAMPLE || {};
  if(!window.FREEPASS_SAMPLE){
    console.warn("[FREEPASS] 샘플데이터가 비어있음: sample_data.js 로드/캐시 확인");
  }

  var data = {
    vehicles: SAMPLE.vehicles || [],
    approvals: SAMPLE.approvals || [],
    requests: SAMPLE.requests || [],
    settlements: SAMPLE.settlements || [],
    rooms: SAMPLE.rooms || []
  };

  // Register page is now backed by server-side JSON (API).
  // Keep demo datasets for other pages, but do NOT inject sample vehicles into register.
  if(page === "register"){
    data.vehicles = [];
  }

  // ===== State (localStorage) =====
  var store = (CORE.storage && CORE.storage.load) ? CORE.storage : { load:function(){return null;}, save:function(){} };
  var loaded = store.load();
  var state = (loaded && typeof loaded === "object") ? loaded : {};
  if(state.data) delete state.data;

  state.products = state.products || { activeVehicleId: (data.vehicles[0] && data.vehicles[0].id) ? data.vehicles[0].id : null };
  state.chats    = state.chats    || { activeRoomId: (data.rooms[0] && data.rooms[0].roomId) ? data.rooms[0].roomId : null };

  // ===== User (demo role) =====
  // role: agent | provider | admin
  // code: agentCode(A001..) or providerCode(PR001..) or adminCode
  state.user = state.user || { role: 'agent', code: 'A001' };
  try{
    var sp = new URLSearchParams(location.search || '');
    var r = sp.get('role');
    var c = sp.get('code');
    if(r && (r==='agent' || r==='provider' || r==='admin')) state.user.role = r;
    if(c) state.user.code = c;
  }catch(e){}

  function saveState(){ store.save(state); }

  // ===== Products header compatibility =====
  function productsFixedTerms(){ return [36,48,60]; }
  function renderProductsHeaderTerms(terms){
    var head = document.querySelector("#products-term-head");
    if(!head) return;
    head.innerHTML = (terms||[]).map(function(t){ return '<div class="term-head">'+esc(String(t))+'개월</div>'; }).join("");
  }
  function updateProductsHeader(){ renderProductsHeaderTerms(productsFixedTerms()); }

  // ===== Topbar =====
  var tb = CORE.topbar || {};
  tb.setCount && tb.setCount(0);
  function datasetCountForPage(p){
    switch(p){
      case "products": return data.vehicles.length;
      case "chats": {
        try{
          var chat = (CORE.chat && CORE.chat.listRooms) ? CORE.chat : null;
          if(chat) return chat.listRooms(state.user).length;
        }catch(e){}
        return data.rooms.length;
      }
      case "approvals": return data.approvals.length;
      case "requests": return data.requests.length;
      case "settlements": return data.settlements.length;
      case "register": return data.vehicles.length;
      default: return 0;
    }
  }

  function selectionLabelForPage(p){
    try{
      if(p==="products"){
        var v = data.vehicles.find(function(x){ return x.id===state.products.activeVehicleId; }) || data.vehicles[0];
        if(!v) return "-";
        return ("차량정보 · " + (v.carNo||"-") + " " + (v.detailModel||"")).trim();
      }
      if(p==="chats"){
        var list = null;
        try{
          if(CORE.chat && CORE.chat.listRooms) list = CORE.chat.listRooms(state.user);
        }catch(e){}
        list = list || data.rooms;
        var r = (list||[]).find(function(x){ return x.roomId===state.chats.activeRoomId; }) || (list && list[0]);
        if(!r) return "-";
        var car = r.carNo || r.vehicleNumber || "-";
        return ("대화정보 · " + car + " " + (r.detailModel||"")).trim();
      }
      if(p==="approvals"){
        var a = data.approvals[0];
        return a ? ("승인정보 · " + (a.carNo||"-") + " " + (a.detailModel||"")).trim() : "-";
      }
      if(p==="requests"){
        var q = data.requests[0];
        return q ? ("요청정보 · " + (q.carNo||"-") + " " + (q.detailModel||"")).trim() : "-";
      }
      if(p==="settlements"){
        var s = data.settlements[0];
        return s ? ("정산정보 · " + (s.carNo||"-") + " " + (s.detailModel||"")).trim() : "-";
      }
      if(p==="register"){
        var v0 = data.vehicles[0];
        return v0 ? ("입력대상 · " + (v0.carNo||"-") + " " + (v0.detailModel||"")).trim() : "-";
      }
    }catch(e){}
    return "-";
  }

  document.addEventListener("click", function(e){
    var el = e.target && e.target.closest ? e.target.closest("[data-focus]") : null;
    if(el && tb.setFocus) tb.setFocus(el.getAttribute("data-focus"));
    if(tb.setSelection) tb.setSelection(selectionLabelForPage(page));
  }, true);

  document.getElementById("btn-search")?.addEventListener("click", function(){
    alert("검색은 데모(미구현)." );
  });

  // ===== Page Dispatch =====
  var ctx = {
    $: $, esc: esc,
    page: page,
    state: state,
    saveState: saveState,
    data: data,
    productsFixedTerms: productsFixedTerms,
    updateProductsHeader: updateProductsHeader,
    setTopbarCount: tb.setCount,
    setTopbarFocus: tb.setFocus,
    setTopbarSelection: tb.setSelection
  };

  if(tb.setCount) tb.setCount(datasetCountForPage(page));
  if(tb.setFocus) tb.setFocus("목록");
  if(tb.setSelection) tb.setSelection(selectionLabelForPage(page));

  var P = window.FP_PAGES || {};
  if(page && typeof P[page] === "function"){
    try{
      P[page](ctx);
      if(tb.setCount) tb.setCount(datasetCountForPage(page));
      if(tb.setSelection) tb.setSelection(selectionLabelForPage(page));
    }catch(err){
      console.error("[FREEPASS] page render failed:", page, err);
    }
  }

  // ===== Global Filter UI =====
  if(CORE.filterUI && CORE.filterUI.init) CORE.filterUI.init(page);
})();
