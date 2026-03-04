(function(){
  window.FP_CORE = window.FP_CORE || {};
  var KEY = "freepass_demo_state_v5";

  function load(){
    try{ return JSON.parse(localStorage.getItem(KEY) || "null"); }catch(e){ return null; }
  }
  function save(state){
    try{ localStorage.setItem(KEY, JSON.stringify(state||{})); }catch(e){}
  }

  window.FP_CORE.storage = { KEY: KEY, load: load, save: save };
})();
