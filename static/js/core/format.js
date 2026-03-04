(function(){
  window.FP_CORE = window.FP_CORE || {};
  // HTML escape
  window.FP_CORE.esc = function(v){
    return String(v==null?"":v).replace(/[&<>"']/g, function(m){
      return ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]);
    });
  };

  window.FP_CORE.fmtNum = function(n){
    if(n===null || n===undefined || n==="") return "-";
    // Allow numeric strings with commas
    if(typeof n === 'string'){
      var cleaned = n.replace(/,/g,'').trim();
      if(cleaned === '') return "-";
      var nv = Number(cleaned);
      if(Number.isFinite(nv)) return nv.toLocaleString("ko-KR");
      return cleaned;
    }
    var v = Number(n);
    if(!Number.isFinite(v)) return "-";
    // 0 is a valid number in ERP context
    return v.toLocaleString("ko-KR");
  };

  // Date/Time format (ERP standard)
  // - Date: yy/mm/dd
  // - Time: HH:MM
  function _toDate(v){
    if(!v) return null;
    if(v instanceof Date) return v;
    var s = String(v);
    // try ISO-like: YYYY-MM-DD HH:MM:SS
    var m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if(m){
      var yy = Number(m[1]);
      var mm = Number(m[2]) - 1;
      var dd = Number(m[3]);
      // time
      var tm = s.match(/\b(\d{2}):(\d{2})(?::(\d{2}))?/);
      var hh = tm ? Number(tm[1]) : 0;
      var mi = tm ? Number(tm[2]) : 0;
      var ss = tm && tm[3] ? Number(tm[3]) : 0;
      return new Date(yy, mm, dd, hh, mi, ss);
    }
    // fallback: Date.parse
    var t = Date.parse(s);
    if(!Number.isNaN(t)) return new Date(t);
    return null;
  }

  window.FP_CORE.fmtDateYYMMDD = function(v){
    var d = _toDate(v);
    if(!d) return "";
    var yy = String(d.getFullYear()).slice(-2);
    var mm = String(d.getMonth()+1).padStart(2,'0');
    var dd = String(d.getDate()).padStart(2,'0');
    return yy + "/" + mm + "/" + dd;
  };

  window.FP_CORE.fmtTimeHHMM = function(v){
    var d = _toDate(v);
    if(!d) return "";
    var hh = String(d.getHours()).padStart(2,'0');
    var mi = String(d.getMinutes()).padStart(2,'0');
    return hh + ":" + mi;
  };

  window.FP_CORE.fmtDateTimeYYMMDD_HHMM = function(v){
    var dd = window.FP_CORE.fmtDateYYMMDD(v);
    var tt = window.FP_CORE.fmtTimeHHMM(v);
    return (dd + (tt? (" " + tt) : "")).trim();
  };
})();
