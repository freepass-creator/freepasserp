(function(){
  window.FP_PRD = window.FP_PRD || {};
  var CORE = window.FP_CORE || {};
  var esc = CORE.esc || function(v){ return String(v==null?"":v); };
  var fmtNum = CORE.fmtNum || function(n){ return (n==null?"-":String(n)); };
  var shared = window.FP_PRD.shared;

  function termsToRender(state, allTerms){
    var sel = (state.products && Array.isArray(state.products.selectedTerms)) ? state.products.selectedTerms : [];
    return (sel && sel.length) ? sel.slice().sort(function(a,b){return a-b;}) : allTerms;
  }

  function renderTermHead(termHeadEl, terms){
    if(!termHeadEl) return;
    termHeadEl.innerHTML = (terms||[]).map(function(term){
      return '<div class="term-col"><div class="term-h" title="'+esc(String(term))+'개월">'+esc(String(term))+'개월</div></div>';
    }).join('');
  }

  function buildRowHtml(v, active, terms){
    var rentCols = terms.map(function(term){
      var p = shared.getPricing(v, term);
      var rentNum = p ? (p.rent ?? p.monthly ?? p.rental_fee ?? p.price ?? null) : null;
      return '<div class="term-col"><div class="rent">'+esc(fmtNum(rentNum))+'</div></div>';
    }).join('');

    var depCols = terms.map(function(term){
      var p = shared.getPricing(v, term);
      var depNum = p ? (p.deposit ?? p.dep ?? p.securityDeposit ?? null) : null;
      return '<div class="term-col"><div class="dep">'+esc(fmtNum(depNum))+'</div></div>';
    }).join('');

    function pick(obj, keys){
      for(var i=0;i<keys.length;i++){
        var k = keys[i];
        var val = obj && obj[k];
        if(val!=null && String(val).trim()!=='') return val;
      }
      return null;
    }

    function badgeHtml(label){
      if(label==null) return '';
      var s = String(label).trim();
      if(!s) return '';
      return '<span class="badge muted">'+esc(s)+'</span>';
    }

    // ✅ 메인줄: 필수(절대 안잘림) + 추가(길면 ...)
    // 필수: [상태] [구분] 차량번호 제조사 세부모델 세부트림
    var status = pick(v, ['status','state','vehicleStatus','availability']);
    var category = pick(v, ['category','kind','type','vehicleType']);

    var carNo = pick(v, ['carNo','car_no','vehicleNumber','vehicleNo','number','plate']) || '-';
    var maker = pick(v, ['maker','manufacturer','brand']);
    var detailModel = pick(v, ['detailModel','subModel','submodel','modelDetail','model']);
    var trim = pick(v, ['trim','detailTrim','grade','variant']);

    var requiredText = [carNo, maker, detailModel, trim].filter(Boolean).join(' ').trim();

    // 추가(옵션 영역): 폭 부족 시 ... 처리 대상
    // ✅ 요청: 메인줄에는 모델 관련 정보만(필수까지만) 깔끔하게. => extra 영역은 비워둠
    var fuel = pick(v, ['fuel','fuelType']);
    var exColor = pick(v, ['exColor','exteriorColor','extColor','outerColor','exterior','outsideColor','outColor','color']);
    var inColor = pick(v, ['inColor','interiorColor','intColor','innerColor','interior','insideColor','inColorName']);
    var extraText = '';

    function yearFromFirstReg(firstRegDate){
      if(!firstRegDate) return null;
      var s = String(firstRegDate).trim();
      // supports YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD
      var m = s.match(/(19|20)\d{2}/);
      return m ? m[0] : null;
    }

    // 보조줄(요청 순서): 연료 | 주행거리 | 연식(없으면 최초등록일 기준년도) | 외장/내장 | 택옵션 | 배기량
    var subParts = [];
    if(fuel) subParts.push(String(fuel));
    if(v.mileageKm!=null) subParts.push(Number(v.mileageKm).toLocaleString('ko-KR')+'km');
    var y = (v.year!=null && String(v.year).trim()!=='') ? String(v.year) : yearFromFirstReg(v.firstRegDate);
    if(y) subParts.push(String(y) + '년식');
    var colorPair = [];
    if(exColor) colorPair.push('외장 ' + String(exColor));
    if(inColor) colorPair.push('내장 ' + String(inColor));
    if(colorPair.length) subParts.push(colorPair.join(' / '));
    if(v.optionsText) subParts.push(String(v.optionsText));
    if(v.displacementCc) subParts.push(String(v.displacementCc)+'cc');
    var sub = subParts.join(' | ');

    return (
      '<div class="row prd '+(active?"active":"")+'" data-id="'+esc(v.id)+'">'
      + '<div class="main-line">'
      +   '<div class="main-left">'
      +     '<div class="main-required">'
      +       badgeHtml(status)
      +       badgeHtml(category)
      +       '<span class="main-required-text">'+esc(requiredText)+'</span>'
      +     '</div>'
      +     (extraText ? ('<div class="main-extra">'+esc(extraText)+'</div>') : '')
      +   '</div>'
      +   '<div class="terms-grid terms-rent">'+rentCols+'</div>'
      + '</div>'
      + '<div class="sub-line">'
      +   '<div class="sub-left">'+esc(sub)+'</div>'
      +   '<div class="terms-grid terms-dep">'+depCols+'</div>'
      + '</div>'
      + '</div>'
    );
  }

  function renderList(listEl, vehicles, state, terms){
    if(!listEl) return;
    if(!vehicles.length){
      listEl.innerHTML = '<div class="center-muted">차량 데이터가 없습니다.</div>';
      return;
    }
    listEl.innerHTML = vehicles.map(function(v){
      var active = (state.products && state.products.activeVehicleId===v.id);
      return buildRowHtml(v, active, terms);
    }).join('');
  }

  window.FP_PRD.render = { termsToRender: termsToRender, renderTermHead: renderTermHead, renderList: renderList };
})();
