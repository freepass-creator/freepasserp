(function(){
  window.FP_PRD = window.FP_PRD || {};

  function initFilterBridge(state, saveState, rerender){
    window.FP_FILTER_STATE = window.FP_FILTER_STATE || {};
    if(!window.FP_FILTER_STATE.products){
      window.FP_FILTER_STATE.products = {
        keyword: "",
        selectedTerms: Array.isArray(state.products && state.products.selectedTerms) ? state.products.selectedTerms : []
      };
    }

    function applyFromEvent(ev){
      if(!(ev && ev.detail && ev.detail.page === 'products')) return;
      // global UI currently only sends keyword; we keep selectedTerms from existing state
      // (terms selection UI is future work, but we keep data contract intact)
      if(ev.detail.keyword!=null){
        window.FP_FILTER_STATE.products.keyword = String(ev.detail.keyword||'').trim();
      }
      var st = window.FP_FILTER_STATE.products;
      var terms = Array.isArray(st.selectedTerms) ? st.selectedTerms : [];
      state.products.selectedTerms = terms;
      saveState && saveState();
      rerender && rerender();
    }

    function onReset(ev){
      if(!(ev && ev.detail && ev.detail.page === 'products')) return;
      state.products.selectedTerms = [];
      saveState && saveState();
      rerender && rerender();
    }

    window.addEventListener('fp:filter:apply', applyFromEvent);
    window.addEventListener('fp:filter:reset', onReset);
  }

  window.FP_PRD.filter = { initFilterBridge: initFilterBridge };
})();
