(function(){
  window.FP_PAGES = window.FP_PAGES || {};
  window.FP_PAGES.settlements = function(ctx){
    const { $, esc, state, saveState, data } = ctx;
    const list = $("#settlements-list");
    const count = $("#settlements-count");
    const detail = $("#settlements-detail");
    if(!list) return;

    const itemsAll = data.settlements || [];
    let items = itemsAll;

    window.FP_FILTER_STATE = window.FP_FILTER_STATE || {};
    if(!window.FP_FILTER_STATE.settlements) window.FP_FILTER_STATE.settlements = { keyword:"" };

    function applyKeywordFilter(){
      const kw = String((window.FP_FILTER_STATE.settlements?.keyword)||"").trim().toLowerCase();
      if(!kw){ items = itemsAll; return; }
      items = itemsAll.filter(it=>{
        const hay = [it.id||"", it.title||"", it.carNo||"", it.detailModel||"", it.amount||"", it.status||""].join(" ").toLowerCase();
        return hay.includes(kw);
      });
    }

    window.addEventListener("fp:filter:apply", (ev)=>{
      if(ev?.detail?.page !== "settlements") return;
      applyKeywordFilter();
      if(count) count.textContent = `${items.length}건`;
      render();
    });
    window.addEventListener("fp:filter:reset", (ev)=>{
      if(ev?.detail?.page !== "settlements") return;
      applyKeywordFilter();
      if(count) count.textContent = `${items.length}건`;
      render();
    });

    applyKeywordFilter();

    if(count) count.textContent = `${items.length}건`;
    if(!state.settlements) state.settlements = { activeId: items[0]?.id || null };

    function render(){
      list.innerHTML = items.map(it=>{
        const active = state.settlements.activeId===it.id ? "active":"";
        return `
          <div class="row ${active}" data-id="${esc(it.id)}">
            <div class="main-line">
              <div class="main-left"><div class="main-text">${esc(it.title||"정산")}</div></div>
              <div class="right-text">${esc(it.at||"")}</div>
            </div>
            <div class="sub-line">${esc(it.sub||"")}</div>
          </div>
        `;
      }).join("");

      list.onclick = (e)=>{
        const row = e.target.closest(".row");
        if(!row) return;
        state.settlements.activeId = row.getAttribute("data-id");
        saveState();
        render();
        renderDetail();
      };
    }

    function renderDetail(){
      const it = items.find(x=>x.id===state.settlements.activeId);
      if(!it){
        if(detail) detail.innerHTML = `<div class="center-muted">항목을 선택하세요.</div>`;
        return;
      }
      if(detail){
        detail.innerHTML = `
          <div class="box">
            <div class="box-title">정산 상세(샘플)</div>
            <div class="kv">
              <div class="kv-row"><div class="k">공급사</div><div class="v">${esc(it.provider||"-")}</div></div>
              <div class="kv-row"><div class="k">금액</div><div class="v">${esc(it.amount||"-")}</div></div>
              <div class="kv-row"><div class="k">메모</div><div class="v">${esc(it.note||"-")}</div></div>
            </div>
          </div>
        `;
      }
    }

    render();
    renderDetail();
  };
})();