(function(){
  window.FP_PAGES = window.FP_PAGES || {};

  window.FP_PAGES.chats = function(ctx){
    var CORE = window.FP_CORE || {};
    var chat = CORE.chat;
    var $ = ctx.$;
    var state = ctx.state || (ctx.state = {});
    var saveState = ctx.saveState;

    var listEl = $("#chats-room-list");
    if(!listEl) return;

    var countEl = $("#chats-count");
    var headerEl = $("#chats-header");
    var roomcodeEl = $("#chats-roomcode");
    var messagesEl = $("#chats-messages");
    var inputbarEl = $("#chats-inputbar");
    var inputEl = $("#chats-input");
    var sendBtn = $("#chats-send");
    var summaryEl = $("#chats-summary");
    // --- scroll anchoring (keep last message visible)
    function _isNearBottom(el, threshold){
      try{
        threshold = (typeof threshold === 'number') ? threshold : 80;
        return (el.scrollHeight - (el.scrollTop + el.clientHeight)) <= threshold;
      }catch(e){ return true; }
    }
    function _scrollToBottom(el){
      if(!el) return;
      try{
        // wait for layout to settle (bubbles/fonts)
        (window.requestAnimationFrame || function(fn){ return setTimeout(fn,0); })(function(){
          (window.requestAnimationFrame || function(fn){ return setTimeout(fn,0); })(function(){
            try{ el.scrollTop = el.scrollHeight; }catch(e){}
          });
        });
      }catch(e){}
    }


    // --- current user (from shell.html)
    var cu = window.FP_CURRENT_USER || {};
    state.user = state.user || {
      uid: (cu.uid || ''),
      role: (cu.role || 'AGENT'),
      code: (cu.code || ''),
      company_code: (cu.company_code || ''),
      name: (cu.name || ''),
      email: (cu.email || '')
    };

    if(!state.user.role){ state.user.role = deriveRoleFromCode(state.user.code) || 'AGENT'; }

    state.chats = state.chats || { activeRoomId: null, rooms: [] };
    state.chats._urlApplied = state.chats._urlApplied || false;
    state.chats._readCache = state.chats._readCache || {}; // { roomId: lastReadTs }
    state.chats._lastRenderedRoomId = state.chats._lastRenderedRoomId || null; // for message pane stability

    // --- helpers
    function esc(s){ return CORE.esc ? CORE.esc(s) : String(s||''); }
    function cleanCarNo(v){ return String(v||'').trim().replace(/\s+/g,'').replace(/-/g,''); }

    function fmtTime(ts){
      if(!ts) return '';
      var d = new Date(Number(ts));
      if(isNaN(d.getTime())) return '';
      var hh = String(d.getHours()).padStart(2,'0');
      var mm = String(d.getMinutes()).padStart(2,'0');
      return hh+':'+mm;
    }

    function deriveRoleFromCode(code){
      var c = String(code||'').toUpperCase();
      if(!c) return '';
      if(c.startsWith('A')) return 'ADMIN';
      if(c.startsWith('P')) return 'PROVIDER';
      if(c.startsWith('S')) return 'AGENT';
      return '';
    }

    // 상태(미확인/응답대기/응답완료) — 내(uid) 기준 자동 계산
    // 우선순위: 미확인(0) > 응답대기(1) > 응답완료(2)
    function deriveStatus(room, myUid){
      room = room || {};
      myUid = String(myUid||'').trim();
      var lastAt = Number(room.lastAt || room.updatedAt || 0);
      var lastSenderUid = String(room.lastSenderUid || '').trim();
      var readAtByUid = room.readAtByUid || {};
      var myReadAt = myUid ? Number(readAtByUid[myUid] || 0) : 0;

      // 내가 마지막으로 보냈으면 응답완료
      if(myUid && lastSenderUid && lastSenderUid === myUid){
        return { label: '응답완료', rank: 2 };
      }

      // 상대가 마지막으로 보냈고, 내가 그 시점 이후로 읽지 않았으면 미확인
      if(lastAt && myUid && lastSenderUid && lastSenderUid !== myUid && myReadAt < lastAt){
        return { label: '미확인', rank: 0 };
      }

      // 상대가 마지막으로 보냈고, 읽긴 했으면 응답대기
      if(myUid && lastSenderUid && lastSenderUid !== myUid){
        return { label: '응답대기', rank: 1 };
      }

      // 초기/정보 부족 fallback
      return { label: '응답대기', rank: 1 };
    }

    function fmtDate(ts){
      if(!ts) return '';
      var d = new Date(Number(ts));
      if(isNaN(d.getTime())) return '';
      var yy = String(d.getFullYear()).slice(-2);
      var m = String(d.getMonth()+1).padStart(2,'0');
      var da = String(d.getDate()).padStart(2,'0');
      return yy+'/'+m+'/'+da;
    }

    // --- vehicle map for summary
    var vehiclesMap = {};
    function indexVehicles(items){
      vehiclesMap = {};
      (items||[]).forEach(function(v){
        var key = cleanCarNo(v.carNo || v.car_no);
        if(key) vehiclesMap[key] = v;
      });
    }

    function loadVehicles(){
      return fetch('/api/vehicles_all')
        .then(function(r){ return r.json(); })
        .then(function(data){
          var items = (data && Array.isArray(data.items)) ? data.items : [];
          indexVehicles(items);
        })
        .catch(function(){ indexVehicles(window.FP_SAMPLE_VEHICLES || []); });
    }

    // --- rooms list (Firestore realtime)
    var unsubRooms = null;

    function getRoomById(roomId){
      var rid = String(roomId||'');
      return (state.chats.rooms || []).find(function(x){ return String(x.roomId||'') === rid; }) || null;
    }

    function markReadIfNeeded(roomId, lastAt){
      try{
        if(!roomId) return;
        if(!chat || typeof chat.markRead !== 'function') return;
        var myUid = String(state.user.uid || '').trim();
        if(!myUid) return;
        var ts = Number(lastAt || 0);
        if(!ts) return;

        var cached = Number(state.chats._readCache[roomId] || 0);
        if(cached >= ts) return; // already marked up to this ts

        state.chats._readCache[roomId] = ts;
        chat.markRead(roomId, state.user, ts);
      }catch(e){}
    }

    function setActiveRoom(roomId){
      state.chats.activeRoomId = roomId || null;
      // force bottom anchoring on room change
      state.chats._forceScrollBottom = true;
      state.chats._forceScrollBottomUntil = Date.now() + 1200;
      state.chats._lastRenderedRoomId = state.chats.activeRoomId;
      if(saveState) saveState();

      // mark read up to the room's lastAt (best-effort) — avoid infinite loops
      try{
        var room = getRoomById(roomId);
        if(room){
          var lastAt = Number(room.lastAt || room.updatedAt || 0);
          markReadIfNeeded(roomId, lastAt);
        }
      }catch(e){}

      renderRooms();
      // defer heavier work to keep click responsive
      (window.requestAnimationFrame || function(fn){ return setTimeout(fn,0); })(function(){
        renderMessages();
        renderSummary();
      });
    }

    function renderRooms(){
      var rooms = state.chats.rooms || [];
      var pending = state.chats.pendingRoom;
      if(pending && pending.roomId){
        var has = rooms.some(function(x){ return String(x.roomId||'') === String(pending.roomId); });
        if(!has){ rooms = [pending].concat(rooms); }
      }
      if(countEl) countEl.textContent = (rooms.length ? (rooms.length + '건') : '0건');

      if(!rooms.length){
        listEl.innerHTML = '<div class="center-muted">대화가 없습니다.</div>';
        return;
      }

      var active = state.chats.activeRoomId;
      var myUid = String(state.user.uid || (window.FP_CURRENT_USER && window.FP_CURRENT_USER.uid) || '').trim();

      function badgeHtml(label){
        var s = String(label||'').trim();
        if(!s) return '';
        // 상태 배지만 사용
        return '<span class="badge muted">'+esc(s)+'</span>';
      }

      listEl.innerHTML = rooms.map(function(r){
        var rid = String(r.roomId || '');
        var carNo = String(r.carNo || '');
        var carKey = cleanCarNo(carNo || r.carNoNorm);
        var v = vehiclesMap[carKey] || {};

        // 상태 계산
        var st = deriveStatus(r, myUid);

        // 메인줄: [상태] 차량번호 제조사 세부모델  ... 일자 시간  [숨김]
        var titleCar = (v.carNo || carNo || '-');
        var maker = (v.maker || v.manufacturer || v.brand || r.maker || r.manufacturer || '');
        var detailModel = (v.detailModel || r.detailModel || v.model || v.trim || '');
        var mainRequired = [titleCar, maker, detailModel].filter(function(x){ return x && String(x).trim(); }).join(' ').trim();

        var dt = r.updatedAt || r.lastAt || r.createdAt;
        var dateStr = fmtDate(dt);
        var timeStr = fmtTime(dt);
        var rightText = (dateStr && timeStr) ? (dateStr+' '+timeStr) : (dateStr || timeStr || '');

        // 보조줄: 채팅방코드 | 마지막메세지
        var roomCode = String(r.roomCode || r.code || rid || '').trim();
        var lastMsg = String(r.lastText || '').trim();
        var sub = (roomCode ? roomCode : '-') + (lastMsg ? (' | ' + lastMsg) : '');

        var cls = 'row has-actions chat-row' + ((rid === active) ? ' active' : '');

        return ''+
          '<div class="'+cls+'" data-room="'+esc(rid)+'">'+
            '<div class="row-body">'+
              '<div class="main-line">'+
                '<div class="main-left">'+
                  badgeHtml(st.label)+
                  '<span class="main-text">'+esc(mainRequired || '-')+'</span>'+
                '</div>'+
                '<div class="right-text">'+esc(rightText)+'</div>'+
              '</div>'+
              '<div class="sub-line">'+esc(sub)+'</div>'+
            '</div>'+
            '<div class="row-actions">'+
              '<button type="button" class="chats-hide-btn" data-room="'+esc(rid)+'">숨김</button>'+
            '</div>'+
          '</div>';
      }).join('');
    }

    // --- messages
    var unsubMsgs = null;

    function roleClass(role){
      var r = String(role||'').toUpperCase();
      if(r === 'AGENT') return 'role-agent';
      if(r === 'PROVIDER') return 'role-provider';
      if(r === 'ADMIN') return 'role-admin';
      return 'role-unknown';
    }

    function renderMessages(){
      var rid = state.chats.activeRoomId;
      // ensure last message is visible when entering a room
      state.chats._forceScrollBottom = true;
      state.chats._forceScrollBottomUntil = Date.now() + 1200;
      if(headerEl) headerEl.textContent = '대화하기';
      if(roomcodeEl) roomcodeEl.textContent = rid ? rid : '';

      if(!rid){
        if(messagesEl) messagesEl.innerHTML = '<div class="center-muted">대화방을 선택하세요.</div>';
        if(inputbarEl) inputbarEl.classList.add('hidden');
        if(unsubMsgs){ try{ unsubMsgs(); }catch(e){} unsubMsgs = null; }
        return;
      }

      if(unsubMsgs){ try{ unsubMsgs(); }catch(e){} unsubMsgs = null; }
      if(messagesEl) messagesEl.innerHTML = '<div class="center-muted">불러오는 중...</div>';
      if(inputbarEl) inputbarEl.classList.remove('hidden');
      
// Incremental message stream to avoid full re-render flicker
var msgIds = {};
var msgCount = 0;
var emptyTimer = null;

function appendMsg(m){
  if(!m) return;
  var id = String(m.id||'');
  if(id && msgIds[id]) return;
  if(id) msgIds[id] = 1;

  // If this is the first real message, clear loading/empty placeholder
  if(msgCount === 0){
    if(messagesEl) messagesEl.innerHTML = '';
  }
  msgCount++;

  var meCode = String(state.user.code||'');
  var senderCode = String(m.senderCode||'');
  var senderRole = String(m.senderRole||'') || deriveRoleFromCode(senderCode);
  var mine = (senderCode && senderCode === meCode);
  var cls = (mine ? 'chat-msg chat-msg-out ' : 'chat-msg chat-msg-in ') + roleClass(senderRole);
  var t = esc(m.text || '');
  var ts = m.createdAt || m.ts || m.time || 0;
  var tm = fmtTime(ts);

  var html = ''+
    '<div class="'+cls+'">'+
      '<div class="chat-msg-col">'+
        '<div class="chat-msg-top">'+
          '<span class="chat-msg-sender">'+esc(senderCode || '-')+'</span>'+
        '</div>'+
        '<div class="chat-msg-bubble">'+t+'</div>'+
        '<div class="chat-msg-time">'+esc(tm)+'</div>'+
      '</div>'+
    '</div>';

  // Decide auto-scroll BEFORE DOM changes (prevents jump / mid-screen)
  var forceBottom = false;
  var wasNear = true;
  try{
    forceBottom = !!state.chats._forceScrollBottom && (Date.now() <= (state.chats._forceScrollBottomUntil || 0));
    wasNear = forceBottom || _isNearBottom(messagesEl, 80);
  }catch(e){}

  try{ messagesEl.insertAdjacentHTML('beforeend', html); }catch(e){
    try{ messagesEl.innerHTML += html; }catch(e2){}
  }

  // Keep anchored to bottom only when user is already near bottom OR on first enter
  try{
    if(wasNear){ _scrollToBottom(messagesEl); }
    // clear force after initial settle window
    if(forceBottom){
      clearTimeout(state.chats._forceScrollBottomTimer || 0);
      state.chats._forceScrollBottomTimer = setTimeout(function(){
        state.chats._forceScrollBottom = false;
      }, 650);
    }
  }catch(e){}

  // Mark read once per increasing lastTs
  try{
    var lastTs = Number(ts || 0);
    if(lastTs) markReadIfNeeded(rid, lastTs);
  }catch(e){}
}

if(unsubMsgs){ try{ unsubMsgs(); }catch(e){} unsubMsgs = null; }
if(emptyTimer){ try{ clearTimeout(emptyTimer); }catch(e){} emptyTimer = null; }

if(messagesEl) messagesEl.innerHTML = '<div class="center-muted">불러오는 중...</div>';
if(inputbarEl) inputbarEl.classList.remove('hidden');

// If nothing arrives shortly, show empty/error message (stream has no "done" signal)
emptyTimer = setTimeout(function(){
  if(state.chats.activeRoomId !== rid) return;
  if(msgCount > 0) return;
  var emsg = '';
  try{ emsg = (window.FP_CHAT_MSG_ERROR && window.FP_CHAT_MSG_ERROR[rid]) ? String(window.FP_CHAT_MSG_ERROR[rid]) : ''; }catch(e){}
  if(emsg){
    messagesEl.innerHTML = '<div class="center-muted">채팅을 불러올 수 없습니다: ' + esc(emsg) + '</div>';
  }else{
    messagesEl.innerHTML = '<div class="center-muted">메시지가 없습니다.</div>';
  }
}, 350);

if(chat.subscribeMessagesStream){
  unsubMsgs = chat.subscribeMessagesStream(rid, function(m){
    if(state.chats.activeRoomId !== rid) return;
    // cancel empty placeholder as soon as something comes in
    if(emptyTimer){ try{ clearTimeout(emptyTimer); }catch(e){} emptyTimer = null; }
    appendMsg(m);
  }, function(err){
    // let the emptyTimer handler show the error message
    try{ console.warn('RTDB subscribe error', err); }catch(e){}
  });
}else{
  // Fallback to old full-list subscription (should not happen on v016+)
  unsubMsgs = chat.subscribeMessages(rid, function(msgs){
    msgs = Array.isArray(msgs) ? msgs : [];
    if(emptyTimer){ try{ clearTimeout(emptyTimer); }catch(e){} emptyTimer = null; }
    messagesEl.innerHTML = '';
    msgs.forEach(function(m){ appendMsg(m); });
    if(!msgs.length){
      messagesEl.innerHTML = '<div class="center-muted">메시지가 없습니다.</div>';
    }
  });
}

      try{ if(inputEl) setTimeout(function(){ try{ inputEl.focus(); }catch(e){} }, 50); }catch(e){}
    }

    // --- summary
    function renderSummary(){
      if(!summaryEl) return;

      var rid = state.chats.activeRoomId;
      if(!rid){
        summaryEl.innerHTML = '<div class="center-muted">선택된 항목이 없습니다.</div>';
        return;
      }

      var room = (state.chats.rooms || []).find(function(x){ return String(x.roomId||'') === String(rid); }) || {};
      var carKey = cleanCarNo(room.carNo || room.carNoNorm);
      var v = vehiclesMap[carKey] || null;

      if(window.FP_PRD && window.FP_PRD.detail && window.FP_PRD.detail.renderDetail && v){
        if(!v.id) v.id = carKey;
        var wrap = document.createElement('div');
        var act = document.createElement('div');
        act.style.display = 'none';
        var fakeState = { products: { activeVehicleId: v.id }, productsByCarNo: {} };
        window.FP_PRD.detail.renderDetail(wrap, act, [v], fakeState);
        summaryEl.innerHTML = wrap.innerHTML;
        return;
      }

      summaryEl.innerHTML = '<div class="center-muted">차량 요약 정보를 불러올 수 없습니다.</div>';
    }

    // click room / hide
    listEl.addEventListener('click', function(e){
      var hideBtn = e.target && e.target.closest ? e.target.closest('.chats-hide-btn') : null;
      if(hideBtn){
        e.preventDefault();
        e.stopPropagation();
        var hid = hideBtn.getAttribute('data-room') || '';
        if(hid && CORE.chat && typeof CORE.chat.hideRoom === 'function'){
          CORE.chat.hideRoom(hid, state.user);
        }
        return;
      }

      var row = e.target && e.target.closest ? e.target.closest('.row[data-room]') : null;
      if(!row) return;
      var rid = row.getAttribute('data-room');
      if(rid) setActiveRoom(rid);
    });

    // send message
    function send(){
      var rid = state.chats.activeRoomId;
      if(!rid) return;
      var text = String((inputEl && inputEl.value) || '').trim();
      if(!text) return;
      var sr = state.user.role || deriveRoleFromCode(state.user.code) || 'AGENT';
      chat.addMessage(rid, { text: text, senderRole: sr, senderCode: state.user.code, senderUid: state.user.uid });
      if(inputEl) inputEl.value = '';
      try{ inputEl.focus(); }catch(e){}
    }
    if(sendBtn) sendBtn.addEventListener('click', send);
    if(inputEl) inputEl.addEventListener('focus', function(){
      try{ _scrollToBottom(messagesEl); }catch(e){}
    });
    if(inputEl) inputEl.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); send(); }
    });

    function selectRoomFromUrlOnce(){
      try{
        var sp = new URLSearchParams(location.search || '');
        var rid = sp.get('roomId') || sp.get('room') || '';
        if(!rid) return;

        // Optional meta passed from /products inquiry flow (optimistic navigation)
        var carNo = sp.get('carNo') || '';
        var detailModel = sp.get('detailModel') || '';
        var agentCode = sp.get('agentCode') || '';
        var providerCode = sp.get('providerCode') || '';
        var providerCompanyCode = sp.get('providerCompanyCode') || '';

        // Ensure room meta exists in Firestore (best-effort).
        // This is important because the chat list is driven by Firestore rooms.
        try{
          var CORE2 = window.FP_CORE || {};
          var chat2 = CORE2.chat;
          if(chat2 && chat2.ensureRoom){
            chat2.ensureRoom({
              roomId: rid,
              carNo: carNo,
              detailModel: detailModel,
              agentCode: agentCode,
              providerCode: providerCode,
              providerCompanyCode: providerCompanyCode
            });
          }
        }catch(e){}

        // If Firestore propagation is delayed/blocked, keep a pending placeholder so UI can open the chat.
        state.chats.pendingRoom = state.chats.pendingRoom || null;
        state.chats.pendingRoom = {
          roomId: rid,
          carNo: carNo,
          detailModel: detailModel,
          agentCode: agentCode,
          providerCode: providerCode,
          providerCompanyCode: providerCompanyCode,
          updatedAt: Date.now(),
          lastAt: null,
          lastText: ''
        };

        setActiveRoom(rid);
      }catch(e){}
    }

    function loadMe(){
      return fetch('/api/me')
        .then(function(r){ return r.json(); })
        .then(function(res){
          if(res && res.ok && res.user){
            state.user = {
              uid: (res.user.uid || ''),
              role: (res.user.role || deriveRoleFromCode(res.user.code) || 'AGENT'),
              code: (res.user.code || ''),
              company_code: (res.user.company_code || ''),
              name: (res.user.name || ''),
              email: (res.user.email || '')
            };
            window.FP_CURRENT_USER = state.user;
          }
        })
        .catch(function(){});
    }

    // init
    loadMe().then(function(){
      return loadVehicles();
    }).then(function(){
      if(unsubRooms){ try{ unsubRooms(); }catch(e){} unsubRooms = null; }
      unsubRooms = chat.subscribeRooms(state.user, function(rooms){
        rooms = rooms || [];

        // Keep track of the active room before we mutate selection.
        // IMPORTANT: do NOT re-render the message pane unless the active room actually changes.
        // Otherwise, any rooms meta update (e.g., lastText/lastAt) will cause a full message reset -> flicker + scroll jump.
        var prevActive = state.chats.activeRoomId;

        // 상태 기반 정렬 (미확인 → 응답대기 → 응답완료)
        var myUid = String(state.user.uid || (window.FP_CURRENT_USER && window.FP_CURRENT_USER.uid) || '').trim();
        rooms.sort(function(a,b){
          var sa = deriveStatus(a, myUid);
          var sb = deriveStatus(b, myUid);
          if(sa.rank !== sb.rank) return sa.rank - sb.rank;
          return Number(b.updatedAt||0) - Number(a.updatedAt||0);
        });

        state.chats.rooms = rooms;

        // Apply URL selection ONLY ONCE to avoid flicker/loop on every snapshot.
        if(!state.chats._urlApplied){
          state.chats._urlApplied = true;
          selectRoomFromUrlOnce();
        }

        // If active room disappeared (e.g., hidden), fall back to first.
        var active = state.chats.activeRoomId;
        if(active){
          var still = rooms.some(function(r){ return String(r.roomId||'') === String(active); });
          if(!still) state.chats.activeRoomId = null;
        }
        if(!state.chats.activeRoomId && rooms.length){
          state.chats.activeRoomId = rooms[0].roomId;
        }

        var nextActive = state.chats.activeRoomId;

        renderRooms();

        // Only render message/summary panes when the active room changes.
        // This prevents message pane reset/flicker on every Firestore snapshot update.
        if(String(nextActive||'') !== String(prevActive||'') || String(state.chats._lastRenderedRoomId||'') !== String(nextActive||'')){
          state.chats._lastRenderedRoomId = nextActive || null;
          (window.requestAnimationFrame || function(fn){ return setTimeout(fn,0); })(function(){
            renderSummary();
            renderMessages();
          });
        }else{
          // Keep summary fresh without touching the message list (summary is cheap).
          (window.requestAnimationFrame || function(fn){ return setTimeout(fn,0); })(function(){
            renderSummary();
          });
        }
      });

      renderRooms();
      // defer heavier work to keep click responsive
      (window.requestAnimationFrame || function(fn){ return setTimeout(fn,0); })(function(){
        renderMessages();
        renderSummary();
      });
    });
  };
})();