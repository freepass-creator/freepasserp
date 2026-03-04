(function(){
  window.FP_PAGES = window.FP_PAGES || {};
  window.FP_PAGES.requests = function(ctx){
    const { $, esc, state, saveState, data } = ctx;
    const list = $("#requests-list");
    const count = $("#requests-count");
    const detail = $("#requests-detail");
    if(!list) return;

    const itemsAll = data.requests || [];
    let items = itemsAll;

    window.FP_FILTER_STATE = window.FP_FILTER_STATE || {};
    if(!window.FP_FILTER_STATE.requests) window.FP_FILTER_STATE.requests = { keyword:"" };

    function applyKeywordFilter(){
      const kw = String((window.FP_FILTER_STATE.requests?.keyword)||"").trim().toLowerCase();
      if(!kw){ items = itemsAll; return; }
      items = itemsAll.filter(it=>{
        const hay = [it.id||"", it.title||"", it.carNo||"", it.detailModel||"", it.memo||"", it.status||"", it.budget||""].join(" ").toLowerCase();
        return hay.includes(kw);
      });
    }

    window.addEventListener("fp:filter:apply", (ev)=>{
      if(ev?.detail?.page !== "requests") return;
      applyKeywordFilter();
      if(count) count.textContent = `${items.length}건`;
      render();
    });
    window.addEventListener("fp:filter:reset", (ev)=>{
      if(ev?.detail?.page !== "requests") return;
      applyKeywordFilter();
      if(count) count.textContent = `${items.length}건`;
      render();
    });

    applyKeywordFilter();

    if(count) count.textContent = `${items.length}건`;
    if(!state.requests) state.requests = { activeId: items[0]?.id || null };

    function render(){
      list.innerHTML = items.map(it=>{
        const active = state.requests.activeId===it.id ? "active":"";
        return `
          <div class="row ${active}" data-id="${esc(it.id)}">
            <div class="main-line">
              <div class="main-left"><div class="main-text">${esc(it.title||"요청")}</div></div>
              <div class="right-text">${esc(it.at||"")}</div>
            </div>
            <div class="sub-line">${esc(it.sub||"")}</div>
          </div>
        `;
      }).join("");

      list.onclick = (e)=>{
        const row = e.target.closest(".row");
        if(!row) return;
        state.requests.activeId = row.getAttribute("data-id");
        saveState();
        render();
        renderDetail();
      };
    }

    function renderDetail(){
      const it = items.find(x=>x.id===state.requests.activeId);
      if(!it){
        if(detail) detail.innerHTML = `<div class="center-muted">항목을 선택하세요.</div>`;
        return;
      }
      if(detail){
        detail.innerHTML = `
          <div class="box">
            <div class="box-title">요청 상세(샘플)</div>
            <div class="kv">
              <div class="kv-row"><div class="k">차량번호</div><div class="v">${esc(it.carNo||"-")}</div></div>
              <div class="kv-row"><div class="k">기간</div><div class="v">${esc(it.term || "-")}</div></div>
              <div class="kv-row"><div class="k">희망조건</div><div class="v">${esc(it.want||"-")}</div></div>
            </div>
          </div>
        `;
      }
    }

    render();
    renderDetail();
  };
})();