(function(){
  window.FP_CORE = window.FP_CORE || {};
  var $ = window.FP_CORE.$ || function(s){ return document.querySelector(s); };

  var PAGE_TITLES = {
    products: "상품 필터",
    chats: "대화 필터",
    requests: "요청 필터",
    approvals: "승인 필터",
    register: "등록 필터",
    settlements: "정산 필터",
  };

  function init(page){
    var btnFilter = $("#btn-filter");
    var overlay = $("#fp-filter-overlay");
    var backdrop = $("#fp-filter-backdrop");
    var title = $("#fp-filter-title");
    var btnReset = $("#fp-filter-reset");
    var inpKeyword = $("#fp-filter-keyword");
    var btnSearch = $("#fp-filter-search");

    if(!btnFilter || !overlay || !backdrop) return;

    function isOpen(){ return document.body.classList.contains("fp-filter-open"); }
    function open(){
      try{ if(btnFilter) btnFilter.classList.add("is-active"); }catch(e){}
      try{ var tb=(window.FP_CORE&&window.FP_CORE.topbar)||{}; if(tb.setFocus) tb.setFocus("필터"); }catch(e){}

      if(title) title.textContent = PAGE_TITLES[page] || "필터";
      document.body.classList.add("fp-filter-open");
      overlay.setAttribute("aria-hidden","false");
      backdrop.setAttribute("aria-hidden","false");
      if(inpKeyword) setTimeout(function(){ inpKeyword.focus(); }, 0);
    }
    function close(){
      try{ if(btnFilter) btnFilter.classList.remove("is-active"); }catch(e){}
      try{ var tb=(window.FP_CORE&&window.FP_CORE.topbar)||{}; if(tb.setFocus) tb.setFocus("목록"); }catch(e){}

      document.body.classList.remove("fp-filter-open");
      overlay.setAttribute("aria-hidden","true");
      backdrop.setAttribute("aria-hidden","true");
    }
    function toggle(){ isOpen() ? close() : open(); }

    function emitApply(){
      var detail = { keyword: inpKeyword ? String(inpKeyword.value||"").trim() : "", page: page };
      window.dispatchEvent(new CustomEvent("fp:filter:apply", { detail: detail }));
    }

    btnFilter.addEventListener("click", function(e){ e.preventDefault(); toggle(); });
    backdrop.addEventListener("click", function(){ close(); });

    // ESC closes the filter overlay
    document.addEventListener("keydown", function(e){
      if(e.key === "Escape" && isOpen()) close();
    });

    if(btnSearch) btnSearch.addEventListener("click", function(e){ e.preventDefault(); emitApply(); });
    if(inpKeyword){
      inpKeyword.addEventListener("keydown", function(e){
        if(e.key === "Enter"){ e.preventDefault(); emitApply(); }
      });
    }

    if(btnReset){
      btnReset.addEventListener("click", function(e){
        e.preventDefault();
        if(inpKeyword) inpKeyword.value = "";
        window.dispatchEvent(new CustomEvent("fp:filter:reset", { detail: { page: page } }));
        emitApply();
      });
    }
  }

  window.FP_CORE.filterUI = { init: init };
})();
