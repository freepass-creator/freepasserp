(function(){
  window.FP_PRD = window.FP_PRD || {};
  var CORE = window.FP_CORE || {};
  var shared = (window.FP_PRD && window.FP_PRD.shared) || {};
  var esc = CORE.esc || function(v){ return String(v==null?"":v); };

  function isBlank(v){
    return v==null || v==="" || (typeof v === 'string' && v.trim()==="");
  }

  function fmtYear(v){
    // 연식이 있으면 우선, 없으면 최초등록일/최초등록일자에서 연도 추출
    if(v && v.year) return String(v.year) + '년식';
    var d = v && (v.firstRegDate || v.first_reg_date || v.firstRegistrationDate);
    if(!d) return '-';
    var s = String(d);
    var m = s.match(/(19\d{2}|20\d{2})/);
    return m ? (m[1] + '년식') : s;
  }

  function fmtKm(n){
    if(n==null || n==="") return '-';
    var v = Number(n);
    if(!Number.isFinite(v)) return '-';
    return v.toLocaleString('ko-KR') + 'km';
  }

  function fmtCc(n){
    if(n==null || n==="") return '-';
    var v = Number(n);
    if(!Number.isFinite(v)) return String(n) + 'cc';
    return v.toLocaleString('ko-KR') + 'cc';
  }

  function pick(v, keys){
    for(var i=0;i<keys.length;i++){
      var k = keys[i];
      if(v && v[k]!=null && v[k]!=="") return v[k];
    }
    return null;
  }

  function splitOptions(v){
    var raw = pick(v, ['options', 'optionCodes', 'optionList', 'optionsText', 'optText', 'opt', 'selectedOptions']);
    if(!raw) return [];
    if(Array.isArray(raw)) return raw.map(function(x){ return String(x||'').trim(); }).filter(Boolean);
    // string: comma/pipe separated
    return String(raw)
      .split(/\s*[\,\|\n\r]+\s*/)
      .map(function(x){ return String(x||'').trim(); })
      .filter(Boolean);
  }

  function toNum(v){
    if(v==null) return null;
    if(typeof v === 'number') return Number.isFinite(v) ? v : null;
    var s = String(v).trim();
    if(!s) return null;
    // remove comma and non-digit (keep minus)
    s = s.replace(/[,\s]/g, '');
    var n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function fmtWon(n){
    var v = toNum(n);
    if(v==null) return '-';
    return v.toLocaleString('ko-KR') + '원';
  }

  function fmtWonShort(n){
    var v = toNum(n);
    if(v==null) return '-';
    // exact 억 단위면 억으로
    if(v >= 100000000 && v % 100000000 === 0){
      return (v/100000000).toLocaleString('ko-KR') + '억원';
    }
    return v.toLocaleString('ko-KR') + '원';
  }

  function fmtManwon(n){
    var v = toNum(n);
    if(v==null) return '-';
    // 1만원 단위는 만원으로
    if(v >= 10000 && v % 10000 === 0){
      return (v/10000).toLocaleString('ko-KR') + '만원';
    }
    return v.toLocaleString('ko-KR') + '원';
  }

  function renderRow(k, vHtml){
    return '<div class="prd-doc-row">'
      + '<div class="prd-doc-k">'+esc(k||'')+'</div>'
      + '<div class="prd-doc-v">'+(vHtml || '-')+'</div>'
      + '</div>';
  }

  function renderSection(title, rowsHtml){
    var body = rowsHtml && rowsHtml.length ? rowsHtml.join('') : '<div class="prd-doc-empty">-</div>';
    return '<div class="prd-doc-sec">'
      + '<div class="prd-doc-sec-title">'+esc(title)+'</div>'
      + body
      + '</div>';
  }

  function splitLinks(raw){
    if(!raw) return [];
    if(Array.isArray(raw)) return raw.map(function(x){ return String(x||'').trim(); }).filter(Boolean);
    return String(raw)
      .split(/\s*[\,\|\n\r]+\s*/)
      .map(function(x){ return String(x||'').trim(); })
      .filter(Boolean);
  }

  function renderLinks(raw){
    var links = splitLinks(raw);
    if(!links.length) return null;
    var html = links.map(function(u){
      var safe = esc(u);
      return '<div class="prd-doc-links"><a href="'+safe+'" target="_blank" rel="noopener noreferrer">'+safe+'</a></div>';
    }).join('');
    return html;
  }

  function renderMoneyPair(rent, deposit){
    // fixed-width columns (9,999,999원 / 99,999,999원)
    return '<span class="prd-doc-money">'
      + '<span class="m-rent">'+esc(fmtWon(rent))+'</span>'
      + '<span class="m-sep">|</span>'
      + '<span class="m-dep">'+esc(fmtWon(deposit))+'</span>'
      + '</span>';
  }

  function renderDetail(detailEl, actionsEl, vehicles, state){
    if(!detailEl) return;
    var v = vehicles.find(function(x){ return x.id === (state.products && state.products.activeVehicleId); });
    if(!v){
      detailEl.innerHTML = '<div class="center-muted">차량을 선택해 주세요.</div>';
      if(actionsEl) actionsEl.innerHTML = '';
      return;
    }

    if(actionsEl){
      // 문의: 영업자만 / 공유: 모두
      var cu = window.FP_CURRENT_USER || {};
      var role = String(cu.role||'').toUpperCase();
      if(role === 'AGENT'){
        actionsEl.innerHTML = '<button class="btn-outline" type="button" data-action="inquiry">문의</button>'
          + '<button class="btn-outline" type="button" data-action="share">공유</button>';
      }else{
        actionsEl.innerHTML = '<button class="btn-outline" type="button" data-action="share">공유</button>';
      }
    }

    var exColor = pick(v, ['exColor','extColor','exteriorColor','outerColor','colorExt']);
    var inColor = pick(v, ['inColor','intColor','interiorColor','innerColor','colorInt']);

    // ---------- 정책(약관) 데이터는 화면에 노출하지 않고, 보험/계약조건 섹션 렌더링에만 사용 ----------
    var pid = v.policyId;
    var policies = state && state.products && state.products.policiesById;
    var pol = (pid && policies && policies[pid]) ? policies[pid] : null;

    // ---------- 상단(13px) 1줄 ----------
    var headLeft = [v.carNo, v.maker, v.detailModel || v.model, v.fuel].filter(Boolean).join(' ');
    var headBadges = '';
    if(!isBlank(v.status)) headBadges += '<span class="prd-doc-badge">'+esc(v.status)+'</span>';
    if(!isBlank(v.kind)) headBadges += '<span class="prd-doc-badge">'+esc(v.kind)+'</span>';

    // ---------- 섹션 1: 차량 세부사양 및 사진 (등록된 정보만) ----------
    var specRows = [];
    if(!isBlank(v.trim)) specRows.push(renderRow('세부트림', esc(v.trim)));

    var optRaw = pick(v, ['optionsText','optText','options','optionList','selectedOptions']);
    var optText = '';
    if(Array.isArray(optRaw)) optText = optRaw.map(function(x){ return String(x||'').trim(); }).filter(Boolean).join(', ');
    else if(!isBlank(optRaw)) optText = String(optRaw);
    if(!isBlank(optText)) specRows.push(renderRow('선택옵션', esc(optText)));

    if(!isBlank(exColor) || !isBlank(inColor)){
      var c = [];
      if(!isBlank(exColor)) c.push('외장 ' + String(exColor));
      if(!isBlank(inColor)) c.push('내장 ' + String(inColor));
      specRows.push(renderRow('색상', esc(c.join(' / '))));
    }

    var km = fmtKm(v.mileageKm);
    if(km !== '-') specRows.push(renderRow('주행거리', esc(km)));
    var yr = fmtYear(v);
    if(yr !== '-') specRows.push(renderRow('연식', esc(yr)));
    var cc = fmtCc(v.displacementCc);
    if(cc !== '-') specRows.push(renderRow('배기량', esc(cc)));

    // 사진 링크 (필수 항목 - 없으면 -)
    var photoHtml = renderLinks(pick(v, ['photoLink','photoLinks','photos','photoUrls','imageUrls']));
    specRows.push(renderRow('사진링크', photoHtml ? photoHtml : '-'));

    // ---------- 섹션 2: 대여료 및 보증금 (운영하는 기간만 표시) ----------
    var terms = (shared && shared.extractTermsFromVehicles) ? shared.extractTermsFromVehicles([v]) : [6,12,24,36,48,60];
    var priceRows = [];
    terms.forEach(function(t){
      var p = (shared && shared.getPricing) ? shared.getPricing(v, t) : null;
      if(!p) return;
      var rent = toNum(p.rent!=null ? p.rent : (p.monthly!=null ? p.monthly : null));
      var dep = toNum(p.deposit!=null ? p.deposit : (p.depo!=null ? p.depo : null));
      // 0 또는 없음은 운영 안 함 → 표시하지 않음
      if(!(rent && rent > 0 && dep && dep > 0)) return;
      var label = (String(t).padStart(2,'0')) + '개월 대여료|보증금';
      priceRows.push(renderRow(label, renderMoneyPair(rent, dep)));
    });

    // ---------- 섹션 3: 보험한도 및 면책금 (약관에서) ----------
    var insRows = [];
    if(pol && pol.insurance){
      var ins = pol.insurance;
      function limitText(obj, amountKey){
        if(!obj) return '-';
        var t2 = obj.type ? String(obj.type).toUpperCase() : '';
        if(t2 === 'UNLIMITED') return '무한';
        if(t2 === 'UP_TO_VEHICLE_VALUE') return '차량가액';
        if(t2 === 'AMOUNT'){
          var av = obj[amountKey];
          return fmtWonShort(av);
        }
        // fallback
        if(obj.amount!=null) return fmtWonShort(obj.amount);
        if(obj.amount_won!=null) return fmtWonShort(obj.amount_won);
        return t2 ? t2 : '-';
      }

      // 대인
      if(ins.liability_bodily){
        var bodily = ins.liability_bodily;
        var l1 = limitText(bodily, 'amount');
        var d1 = (bodily.deductible_amount!=null) ? fmtManwon(bodily.deductible_amount) : '-';
        insRows.push(renderRow('대인한도|면책금', esc(l1) + ' | ' + esc(d1)));
      }
      // 대물
      if(ins.liability_property){
        var prop = ins.liability_property;
        var l2 = limitText(prop, 'amount');
        var d2 = (prop.deductible_amount!=null) ? fmtManwon(prop.deductible_amount) : '-';
        insRows.push(renderRow('대물한도|면책금', esc(l2) + ' | ' + esc(d2)));
      }
      // 자차
      if(ins.collision){
        var col = ins.collision;
        var lim = col.limit || {};
        var l3 = limitText(lim, 'amount_won');
        var ded = col.deductible || {};
        var parts = [];
        if(ded.percent!=null && ded.percent!=="") parts.push('수리비' + String(ded.percent) + '%');
        if(ded.min_won!=null || ded.max_won!=null){
          var minS = ded.min_won!=null ? fmtManwon(ded.min_won) : '-';
          var maxS = ded.max_won!=null ? fmtManwon(ded.max_won) : '-';
          // 50만원~100만원 형태 선호
          parts.push(String(minS).replace('원','') + '~' + String(maxS));
        }
        var d3 = parts.length ? parts.join(', ') : '-';
        insRows.push(renderRow('자차한도|면책금', esc(l3) + ' | ' + esc(d3)));
      }
    }

    // ---------- 섹션 4: 계약조건 및 유의사항 (약관에서) ----------
    var condRows = [];
    if(pol){
      if(pol.driver && pol.driver.base_min_age!=null && pol.driver.base_min_age!==""){
        condRows.push(renderRow('연령조건', esc('만 ' + String(pol.driver.base_min_age) + '세 이상')));
      }
      if(pol.mileage){
        if(pol.mileage.contract_km_per_year!=null && pol.mileage.contract_km_per_year!==""){
          var kmY = toNum(pol.mileage.contract_km_per_year);
          if(kmY!=null) condRows.push(renderRow('약정주행거리', esc('연 ' + kmY.toLocaleString('ko-KR') + 'km')));
        }
        if(pol.mileage.over_km_fee!=null && pol.mileage.over_km_fee!==""){
          var fee = toNum(pol.mileage.over_km_fee);
          if(fee!=null) condRows.push(renderRow('초과요율', esc(fee.toLocaleString('ko-KR') + '원/km')));
        }
      }
      // 유의사항/메모류 (policy.notes or policy.notice)
      var note = pick(pol, ['notice','notes','memo','remark']);
      if(!isBlank(note)){
        condRows.push(renderRow('유의사항', esc(String(note))));
      }
    }

    // ---------- 섹션 5: 기타사항 (차량 등록에서) ----------
    var etcRows = [];
    var etc = pick(v, ['etc','memo','note','remark','comment','extra']);
    if(!isBlank(etc)) etcRows.push(renderRow('기타', esc(String(etc))));

    detailEl.innerHTML = ''
      + '<div class="prd-doc">'
      +   '<div class="prd-doc-head">'
      +     '<div class="prd-doc-head-left">'+esc(headLeft || '-')+'</div>'
      +     '<div class="prd-doc-head-right">'+(headBadges || '')+'</div>'
      +   '</div>'
      +   renderSection('차량 세부사양 및 사진', specRows)
      +   renderSection('대여료 및 보증금', priceRows)
      +   renderSection('보험한도 및 면책금', insRows)
      +   renderSection('계약조건 및 유의사항', condRows)
      +   renderSection('기타사항', etcRows)
 '</div>';
  }

  window.FP_PRD.detail = { renderDetail: renderDetail };
})();
