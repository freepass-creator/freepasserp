(function(){
  window.FP_CORE = window.FP_CORE || {};
  var $ = function(s){ return (window.FP_CORE.$ || function(q){return document.querySelector(q);})(s); };

  function setCount(n){
    var el = $("#tb-count");
    if(el) el.textContent = (Number(n||0).toLocaleString()) + "건";
  }
  function setFocus(label){
    var el = $("#tb-focus");
    if(el) el.textContent = label || "-";
  }
  function setSelection(label){
    var el = $("#tb-selection");
    if(el) el.textContent = label || "-";
  }

  window.FP_CORE.topbar = { setCount:setCount, setFocus:setFocus, setSelection:setSelection };
})();
