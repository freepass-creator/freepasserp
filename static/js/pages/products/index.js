(function(){
  window.FP_PAGES = window.FP_PAGES || {};

  // v26: products page split (no behavior change)
  window.FP_PAGES.products = function(ctx){
    var $ = ctx.$;
    var state = ctx.state;
    var saveState = ctx.saveState;
    var data = ctx.data || {};
    var updateProductsHeader = ctx.updateProductsHeader;
    var setTopbarCount = ctx.setTopbarCount;

    // ensure topbar count resets even when list is empty
    setTopbarCount && setTopbarCount(0);
    updateProductsHeader && updateProductsHeader(0);

    state.products = state.products || {};
    state.products.selectedTerms = Array.isArray(state.products.selectedTerms) ? state.products.selectedTerms : [];

    var list = $("#products-list");
    var detailEl = $("#products-detail");
    var actionsEl = $("#products-actions");
    var termHeadEl = $("#products-term-head");
    if(!list) return;

    // v001: term header alignment fix when vertical scrollbar appears in list body
    function syncTermHeadScrollbarGutter(){
      try{
        var wrap = (list && list.closest) ? list.closest('.layout-products') : null;
        if(!wrap) wrap = document.querySelector('.layout-products');
        if(!wrap) return;
        var sbw = (list.offsetWidth || 0) - (list.clientWidth || 0);
        if(sbw < 0) sbw = 0;
        wrap.style.setProperty('--prd-sbw', sbw + 'px');
      }catch(e){}
    }
    window.addEventListener('resize', syncTermHeadScrollbarGutter);

    var store = window.FP_PRD.data.createVehicleStore([], state);

    function getActiveVehicle(){
      var vehicles = store.getVehicles();
      return vehicles.find(function(x){ return x.id === (state.products && state.products.activeVehicleId); }) || null;
    }

    function bindActions(){
      if(!actionsEl) return;
      // 이벤트 중복 방지: replace 방식으로 1회만 바인딩
      actionsEl.onclick = function(e){
        var btn = e.target && e.target.closest ? e.target.closest('button[data-action]') : null;
        if(!btn) return;
        var act = btn.getAttribute('data-action');
        var v = getActiveVehicle();
        if(!v) return;

        if(act === 'inquiry'){
          // 채팅 시작(영업자)
          // - UX: 서버 응답 지연/오류가 있어도 즉시 채팅 화면으로 이동해야 한다.
          // - 전략: (1) 클라이언트에서 roomId를 낙관적으로 계산해 즉시 이동
          //         (2) 동시에 서버 /api/chat/open 으로 정확한 메타(공급사 코드/회사코드 등) 보정
          var CORE = window.FP_CORE || {};
          var chat = CORE.chat;
          var carNo = String(v.carNo || '').trim();
          var dm = String(v.detailModel || v.trim || '').trim();

          var cu = window.FP_CURRENT_USER || {};
          var agentCode = String(cu.code || '').trim();

          // 낙관적 roomId 계산(서버 룰과 동일: carNoNorm + agentCode + yymmdd[KST])
          var roomId = '';
          try{
            var carNoNorm = String(carNo).trim().replace(/\s+/g,'').replace(/-/g,'');
            var d = new Date();
            // KST yymmdd
            var kst = new Date(d.getTime() + (9*60*60*1000) - (d.getTimezoneOffset()*60*1000));
            var yy = String(kst.getUTCFullYear()).slice(-2);
            var mm = String(kst.getUTCMonth()+1).padStart(2,'0');
            var dd = String(kst.getUTCDate()).padStart(2,'0');
            var yymmdd = yy+mm+dd;
            roomId = carNoNorm + agentCode + yymmdd;
          }catch(e){
            // fallback: let server generate
            roomId = '';
          }

          // Firestore room 메타는 가능하면 먼저 ensure(비동기, 실패해도 이동은 한다)
          try{
            if(roomId && chat && chat.ensureRoom){
              chat.ensureRoom({
                roomId: roomId,
                carNo: carNo,
                agentCode: agentCode,
                detailModel: dm
              });
            }
          }catch(e){}

          // 즉시 채팅 페이지로 이동 (roomId가 없으면 서버 응답 후 이동)
          if(roomId){
            var qs = '?roomId=' + encodeURIComponent(roomId)
              + '&carNo=' + encodeURIComponent(carNo)
              + '&detailModel=' + encodeURIComponent(dm || '');
            location.href = '/chats' + qs;
          }

          // 서버로 메타 보정 요청(성공 시 Firestore rooms 문서를 merge로 업데이트)
          // - 서버가 실패하더라도 이미 /chats 로 이동했으므로 UX는 유지된다.
          fetch('/api/chat/open', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ carNo: carNo, detailModel: dm })
          }).then(function(r){ return r.json(); }).then(function(res){
            if(!res || res.ok !== true){
              if(!roomId){
                var msg = (res && res.error) ? String(res.error) : '채팅방 생성에 실패했습니다.';
                alert(msg);
              }
              return;
            }
            // server roomId wins
            var rid = String(res.roomId || roomId || '').trim();
            if(!rid) return;

            try{
              if(chat && chat.ensureRoomAsync){
                chat.ensureRoomAsync({
                  roomId: rid,
                  carNo: res.carNo,
                  agentCode: res.agentCode,
                  providerCode: res.providerCode,
                  providerCompanyCode: res.providerCompanyCode,
                  yymmdd: res.yymmdd,
                  detailModel: res.detailModel
                }).catch(function(){});
              }else if(chat && chat.ensureRoom){
                chat.ensureRoom({
                  roomId: rid,
                  carNo: res.carNo,
                  agentCode: res.agentCode,
                  providerCode: res.providerCode,
                  providerCompanyCode: res.providerCompanyCode,
                  yymmdd: res.yymmdd,
                  detailModel: res.detailModel
                });
              }
            }catch(e){}

            // roomId가 없어서 아직 이동 못한 경우만 이동
            if(!roomId){
              var qs2 = '?roomId=' + encodeURIComponent(rid)
                + '&carNo=' + encodeURIComponent(String(res.carNo||carNo||''))
                + '&detailModel=' + encodeURIComponent(String(res.detailModel||dm||''));
              location.href = '/chats' + qs2;
            }
          }).catch(function(e){
            if(!roomId){
              alert('채팅방 생성에 실패했습니다. ' + (e ? String(e) : ''));
            }
          });

          return;
        }

        if(act === 'share'){
          // 데모: 차량번호 기반 링크 복사
          var url = location.origin + '/products?carNo=' + encodeURIComponent(v.carNo||'');
          if(navigator.clipboard && navigator.clipboard.writeText){
            navigator.clipboard.writeText(url).then(function(){
              alert('링크를 복사했습니다.');
            }).catch(function(){
              prompt('복사할 링크', url);
            });
          }else{
            prompt('복사할 링크', url);
          }
        }
      };
    }

    function rerender(){
      var vehicles = store.getVehicles();
      var allTerms = store.getAllTerms();
      var terms = window.FP_PRD.render.termsToRender(state, allTerms);

      updateProductsHeader && updateProductsHeader(vehicles.length);
      if(setTopbarCount) setTopbarCount(vehicles.length);
      window.FP_PRD.render.renderTermHead(termHeadEl, terms);
      window.FP_PRD.render.renderList(list, vehicles, state, terms);
      syncTermHeadScrollbarGutter();
      window.FP_PRD.detail.renderDetail(detailEl, actionsEl, vehicles, state);
      bindActions();

      list.querySelectorAll('.row.prd').forEach(function(el){
        el.addEventListener('click', function(){
          state.products.activeVehicleId = el.getAttribute('data-id');
          saveState && saveState();
          rerender();
        });
      });
    }

    window.FP_PRD.filter.initFilterBridge(state, saveState, rerender);

    // initial
    rerender();

    // override by API data if present
    
    // load policies once (used by detail panel)
    if(!state.products) state.products = {};
    if(!state.products.policiesById){
      state.products.policiesById = {};
      window.FP_PRD.data.loadPoliciesFromApi(function(dict){
        if(dict && typeof dict === 'object') state.products.policiesById = dict;
        rerender();
      });
    }

    window.FP_PRD.data.loadVehiclesFromApi((data && Array.isArray(data.vehicles)) ? data.vehicles : null, store.setVehicles).then(function(){
      rerender();
    });
  };
})();