(function(){
  window.FP_REG = window.FP_REG || {};
  var CORE = window.FP_CORE || {};
  var esc = CORE.esc || function(v){ return String(v==null?"":v); };

  var TERMS = [6,12,24,36,48,60];

  // ---- Master options (MVP) ----
  // 정책(약관): 초기에는 '국산차 기본 약관' 1개만 기본 탑재
  var POLICIES = [
    {
      id: "POL_KR_BASE",
      name: "국산차 기본 약관",
      summary: "연령: 만 26+ | 약정: 20,000km/년 | 초과: 120원/km"
    }
  ];

  // 사용자 정의 드랍 옵션 (등록 페이지 전용)
  var STATUS_OPTIONS = ["출고가능", "계약대기", "출고불가", "출고협의"]; // vehicle status
  var KIND_OPTIONS = ["신차렌트", "중고렌트", "신차구독", "중고구독"]; // product type
  var FUEL_OPTIONS = ["가솔린", "디젤", "LPG", "하이브리드", "전기", "기타"]; // MVP
  var CREDIT_OPTIONS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]; // 선택

  function toInt(v){
    var n = parseInt(String(v||"").replace(/[^\d]/g,""), 10);
    return Number.isFinite(n) ? n : null;
  }

  function pickStatus(v){
    return v.status || v.vehicleStatus || v.condition || v.carStatus || "-";
  }

  function pickKind(v){
    return v.kind || v.productType || v.category || v.type || "-";
  }

  function rowHtml(v, editingCarNo){
    var carNoRaw = String(v.carNo || "");
    var carNo = esc(carNoRaw || "-");
    var maker = esc(v.maker || "-");
    var detailModel = esc(v.detailModel || v.model || "-");
    var fuel = esc(v.fuel || "-");

    var st = esc(pickStatus(v));
    var kd = esc(pickKind(v));

    var subParts = [];
    if(v.optionsText) subParts.push(esc(v.optionsText));
    if(v.year) subParts.push(esc(String(v.year)) + "년");
    var sub = subParts.join(" | ") || "&nbsp;";

    var isActive = (editingCarNo && carNoRaw && editingCarNo === carNoRaw);

    return (
      '<div class="row reg-row has-actions' + (isActive?" active":"") + '" data-car="'+esc(carNoRaw)+'" tabindex="0">'
      + '<div class="row-body">'
      +   '<div class="main-line">'
      +     '<div class="reg-main-left">'
      +       '<span class="badge">'+st+'</span>'
      +       '<span class="badge">'+kd+'</span>'
      +       '<span style="white-space:nowrap;">'+carNo+'</span>'
      +       '<span class="muted" style="white-space:nowrap;">'+maker+'</span>'
      +       '<span class="ellipsis">'+detailModel+'</span>'
      +       '<span class="muted" style="white-space:nowrap;">'+fuel+'</span>'
      +     '</div>'
      +   '</div>'
      +   '<div class="sub-line">'+sub+'</div>'
      + '</div>'
      + '<div class="row-actions">'
      +   '<button type="button" class="btn-ghost" data-act="del">삭제</button>'
      + '</div>'
      + '</div>'
    );
  }

  
  
// ---- Detail model normalization ----
// Dropdown may include year-range prefixes like "19~", "2021~", "20년~" for quick visual grouping.
// We do NOT store that prefix in registered vehicle data.
function normalizeDetailName(v){
  var s = String(v==null?"":v).trim();
  if(!s) return "";
  // Patterns: "19~ xxx", "2021~ xxx", "20년~ xxx", "2020년~ xxx"
  s = s.replace(/^\s*(\d{2,4})\s*(?:년)?\s*~\s*/,'');
  return s.trim();
}
// ---- Numeric formatting (comma) ----
  function digitsOnly(v){
    return String(v==null?"":v).replace(/[^\d]/g,"");
  }
  function formatComma(v){
    var s = digitsOnly(v);
    if(!s) return "";
    try{
      var n = parseInt(s,10);
      if(!Number.isFinite(n)) return "";
      return n.toLocaleString();
    }catch(e){
      // fallback
      return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
  }

  function isCommaTargetInput(el){
    if(!el || el.tagName!=="INPUT") return false;
    var type = (el.getAttribute("type")||"text").toLowerCase();
    if(type === "date" || type === "time") return false;
    try{
      if(el.classList && (el.classList.contains("js-num-comma") || el.classList.contains("num-comma"))) return true;
      if(el.getAttribute("data-comma")==="1") return true;
    }catch(e){}
    if(el.hasAttribute("readonly")){
      // skip readonly text such as "무한"
      if(digitsOnly(el.value)==="") return false;
    }
    if(el.id === "drv-base-age") return false; // age text
    if(el.classList.contains("js-num-comma")) return true;
    var id = (el.id||"").toLowerCase();
    if(!id) return false;
    if(id.indexOf("pct")>=0 || id.indexOf("percent")>=0 || id.indexOf("rate")>=0) return false;
    if(id.indexOf("year")>=0) return false;
    // common numeric fields in register/policy
    return /(won|price|km|mileage|deposit|rent|buyout|displacement|ded|max|min)/.test(id);
  }

  function attachCommaFormat(root){
    try{
      var rootEl = root || document;
      var inputs = Array.prototype.slice.call(rootEl.querySelectorAll("input"));
      inputs.forEach(function(el){
        if(!isCommaTargetInput(el)) return;
        // normalize initially
        if(el.value) el.value = formatComma(el.value);

        function applyFormatKeepCaret(){
          try{
            // Preserve caret position by mapping "digits-left" count.
            // (ERP numeric fields: apply comma while typing, without breaking cursor too much.)
            var start = (typeof el.selectionStart === "number") ? el.selectionStart : null;
            var before = (start==null) ? "" : String(el.value||"").slice(0, start);
            var digitsLeft = digitsOnly(before).length;

            var raw = digitsOnly(el.value);
            var formatted = formatComma(raw);
            el.value = formatted;

            if(start==null) return;
            var pos = 0;
            var cnt = 0;
            while(pos < formatted.length){
              if(/\d/.test(formatted.charAt(pos))) cnt++;
              if(cnt >= digitsLeft) { pos++; break; }
              pos++;
            }
            if(digitsLeft >= digitsOnly(formatted).length) pos = formatted.length;
            try{ el.setSelectionRange(pos, pos); }catch(e){}
          }catch(e){}
        }

        // Apply comma formatting immediately while typing
        el.addEventListener("input", function(){
          applyFormatKeepCaret();
        });

        // Ensure final format on blur
        el.addEventListener("blur", function(){
          el.value = formatComma(el.value);
        });
      });
    }catch(e){}
  }

window.FP_REG.normalizeDetailName = normalizeDetailName;
  window.FP_REG.TERMS = TERMS;
  window.FP_REG.POLICIES = POLICIES;
  window.FP_REG.STATUS_OPTIONS = STATUS_OPTIONS;
  window.FP_REG.KIND_OPTIONS = KIND_OPTIONS;
  window.FP_REG.FUEL_OPTIONS = FUEL_OPTIONS;
  window.FP_REG.CREDIT_OPTIONS = CREDIT_OPTIONS;
  window.FP_REG.toInt = toInt;
  window.FP_REG.digitsOnly = digitsOnly;
  window.FP_REG.formatComma = formatComma;
  window.FP_REG.attachCommaFormat = attachCommaFormat;
  window.FP_REG.rowHtml = rowHtml;
})();
