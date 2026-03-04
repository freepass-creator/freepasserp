(function(){
  window.FP_CORE = window.FP_CORE || {};
  // DOM helpers
  window.FP_CORE.$ = function(sel, root){ return (root||document).querySelector(sel); };

  // Toast helper
  var toastTimer = null;
  window.FP_CORE.toast = function(msg, isError){
    try{
      var el = document.getElementById('fp-toast');
      if(!el) return;
      el.textContent = String(msg || "");
      el.classList.remove('error');
      if(isError) el.classList.add('error');
      el.classList.add('show');
      if(toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function(){
        el.classList.remove('show');
      }, isError ? 2600 : 1600);
    }catch(e){}
  };
})();
