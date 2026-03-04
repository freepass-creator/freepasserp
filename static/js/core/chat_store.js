/* FREEPASS ERP - Chat Store (Firestore rooms + RTDB messages)

   v010 changes:
   - Room status(미확인/응답대기/응답완료) 계산을 위해 Firestore rooms에
     lastSenderUid / lastAt / readAtByUid 를 유지한다.
   - unread 카운트는 따로 유지하지 않고, (lastAt > readAtByUid[uid]) 로 미확인을 판단한다.

   데이터 구조:
     rooms/{roomId}: {
       roomId, carNo, carNoNorm,
       agentCode, providerCode, providerCompanyCode,
       yymmdd, detailModel,
       principals: [...],
       createdAt, updatedAt,
       lastText, lastAt, lastSenderUid,
       readAtByUid: { [uid]: ms },
       hiddenBy: { [principalKey]: true }
     }

     chats/{roomId}/{msgId}: { text, senderRole, senderCode, createdAt }

   가시성 규칙:
   - AGENT/PROVIDER: principals(array) 기반
   - ADMIN: 전체
*/
(function(){
  window.FP_CORE = window.FP_CORE || {};

  // -----------------------
  // Helpers
  // -----------------------
  function cleanCarNo(carNo){
    return String(carNo||'').trim().replace(/\s+/g,'').replace(/-/g,'');
  }

  function now(){ return Date.now(); }

  function yymmddNow(){
    try{
      var d = new Date();
      var yy = String(d.getFullYear()).slice(-2);
      var mm = String(d.getMonth()+1).padStart(2,'0');
      var dd = String(d.getDate()).padStart(2,'0');
      return yy+mm+dd;
    }catch(e){
      return '';
    }
  }

  function makeRoomId(meta){
    meta = meta || {};
    if(meta.roomId) return String(meta.roomId).trim();
    var carNorm = cleanCarNo(meta.carNo);
    var a = String(meta.agentCode||'').trim();
    var y = String(meta.yymmdd||yymmddNow()).trim();
    return carNorm + a + y;
  }

  function getUserKey(user){
    if(!user) return '';
    var role = String(user.role||'').toUpperCase();
    var code = String(user.code||'');
    return role + ':' + code;
  }

  // -----------------------
  // Firebase impl
  // - rooms: Firestore
  // - messages: RTDB (legacy)
  // -----------------------
  function hasRTDB(){
    return !!(window.FP_FB && window.FP_FB.db && typeof window.FP_FB.db.ref === 'function');
  }

  function hasFirestore(){
    return !!(window.FP_FB && window.FP_FB.fs && typeof window.FP_FB.fs.collection === 'function');
  }

  function fbRef(path){ return window.FP_FB.db.ref(path); }
  function fsCol(name){ return window.FP_FB.fs.collection(name); }

  function fsNow(){
    try{ return firebase.firestore.FieldValue.serverTimestamp(); }catch(e){ return null; }
  }

  function principalUid(uid){
    uid = String(uid||'').trim();
    return uid ? ('uid:' + uid) : '';
  }

  function principalCompany(company){
    company = String(company||'').trim();
    return company ? ('company:' + company) : '';
  }

  function principalCode(code){
    code = String(code||'').trim();
    return code ? ('code:' + code) : '';
  }

  function fsEnsureRoom(meta){
    return new Promise(function(resolve, reject){
      try{
        meta = meta || {};
        var roomId = makeRoomId(meta);
        if(!roomId) return resolve(null);
        if(!hasFirestore()) return resolve(roomId);

        var cu = window.FP_CURRENT_USER || {};
        var meUid = String(cu.uid || meta.uid || '').trim();

        var principals = [];
        var pMe = principalUid(meUid);
        if(pMe) principals.push(pMe);

        var aCode = String(meta.agentCode||'').trim();
        var pAgentCode = principalCode(aCode);
        if(pAgentCode) principals.push(pAgentCode);

        var pProv = principalCompany(meta.providerCompanyCode);
        if(pProv) principals.push(pProv);

        var provCode = String(meta.providerCode||'').trim();
        var pProvCode = principalCode(provCode);
        if(pProvCode) principals.push(pProvCode);

        principals = principals.filter(function(v, i, a){ return v && a.indexOf(v) === i; });

        var carNoNorm = cleanCarNo(meta.carNo);
        var payload = {
          roomId: roomId,
          carNo: String(meta.carNo||'').trim(),
          carNoNorm: carNoNorm,
          agentCode: String(meta.agentCode||'').trim(),
          providerCode: String(meta.providerCode||'').trim(),
          providerCompanyCode: String(meta.providerCompanyCode||'').trim(),
          yymmdd: String(meta.yymmdd||'').trim(),
          detailModel: String(meta.detailModel||'').trim(),
          principals: principals,
          createdAt: fsNow() || now(),
          updatedAt: fsNow() || now(),
          lastText: '',
          lastAt: 0,
          lastSenderUid: '',
          readAtByUid: {},
          hiddenBy: {}
        };

        var ref = fsCol('rooms').doc(roomId);
        ref.set(payload, { merge: true })
          .then(function(){ return ref.set({ updatedAt: fsNow() || now() }, { merge: true }); })
          .then(function(){ resolve(roomId); })
          .catch(function(e){ reject(e); });
      }catch(e){ reject(e); }
    });
  }

  function rtdbSendMessage(roomId, msg){
    return new Promise(function(resolve, reject){
      try{
        if(!roomId) return resolve(false);
        if(!hasRTDB()) return resolve(false);

        var cu = window.FP_CURRENT_USER || {};
        var senderUid = String((cu.uid || (msg && msg.senderUid) || '')).trim();

        var text = String((msg && msg.text) || '').slice(0, 2000);
        var payload = {
          text: text,
          senderRole: String((msg && msg.senderRole) || ''),
          senderCode: String((msg && msg.senderCode) || ''),
          createdAt: now()
        };

        var mref = fbRef('chats/' + roomId).push();
        mref.set(payload).then(function(){
          // Firestore room meta update (best-effort)
          if(hasFirestore()){
            try{
              var upd = {
                updatedAt: fsNow() || payload.createdAt,
                lastText: text,
                lastAt: payload.createdAt,
                lastSenderUid: senderUid || ''
              };
              // sender is considered "read" up to their own send timestamp
              if(senderUid){
                upd['readAtByUid.' + senderUid] = payload.createdAt;
              }
              fsCol('rooms').doc(roomId).set(upd, { merge: true });
            }catch(e){}
          }
          resolve(true);
        }).catch(function(e){ reject(e); });
      }catch(e){ reject(e); }
    });
  }

  // Mark read up to a specific timestamp (ts).
  // IMPORTANT: use the room's lastAt (or last message ts) to avoid infinite update loops.
  function fsMarkRead(roomId, user, ts){
    return new Promise(function(resolve){
      try{
        if(!roomId) return resolve(false);
        if(!hasFirestore()) return resolve(false);

        var cu = window.FP_CURRENT_USER || {};
        var uid = String((cu.uid || (user && user.uid) || '')).trim();
        if(!uid) return resolve(false);

        var t = (typeof ts === 'number' && ts > 0) ? ts : now();
        var upd = {};
        upd['readAtByUid.' + uid] = t;
        // updatedAt은 "마지막 활동" 정렬에 영향을 주므로 여기서는 건드리지 않는다.
        fsCol('rooms').doc(roomId).set(upd, { merge: true })
          .then(function(){ resolve(true); })
          .catch(function(){ resolve(false); });
      }catch(e){ resolve(false); }
    });
  }

  function fsHideRoom(roomId, user){
    return new Promise(function(resolve){
      try{
        if(!roomId) return resolve(false);
        if(!hasFirestore()) return resolve(false);

        var cu = window.FP_CURRENT_USER || {};
        var myUid2 = String(cu.uid || (user && user.uid) || '').trim();
        var myP = principalUid(myUid2);
        var myCode3 = String((user && user.code) || cu.code || '').trim();
        var myK3 = principalCode(myCode3);
        var myC3 = principalCompany((user && (user.company_code||user.companyCode)) || cu.company_code || cu.companyCode);

        var keys = [myP, myK3, myC3].filter(function(v,i,a){ return v && a.indexOf(v)===i; });
        if(!keys.length) return resolve(false);

        var upd = {};
        keys.forEach(function(k){ upd['hiddenBy.' + k] = true; });
        upd['updatedAt'] = fsNow() || now();

        fsCol('rooms').doc(roomId).set(upd, { merge: true })
          .then(function(){ resolve(true); })
          .catch(function(){ resolve(false); });
      }catch(e){ resolve(false); }
    });
  }

  function fsSubscribeRooms(user, cb){
    if(!hasFirestore()) return function(){};
    user = user || {};

    var cu = window.FP_CURRENT_USER || {};
    var role = String((user.role || cu.role) || '').toUpperCase();
    var myUid = String((cu.uid || user.uid) || '').trim();
    var myCompany = String((user.company_code || user.companyCode || cu.company_code || cu.companyCode) || '').trim();
    var myP = principalUid(myUid);
    var myC = principalCompany(myCompany);

    var q;
    if(role === 'ADMIN'){
      q = fsCol('rooms').orderBy('updatedAt', 'desc').limit(300);
    }else{
      var keys = [];
      if(myP) keys.push(myP);
      var myCode = String((user.code || cu.code) || '').trim();
      var myK = principalCode(myCode);
      if(myK) keys.push(myK);
      if(myC) keys.push(myC);
      keys = keys.filter(function(v, i, a){ return v && a.indexOf(v) === i; });

      if(keys.length === 1){
        q = fsCol('rooms').where('principals', 'array-contains', keys[0]).limit(300);
      }else if(keys.length > 1){
        q = fsCol('rooms').where('principals', 'array-contains-any', keys.slice(0,10)).limit(300);
      }else{
        q = fsCol('rooms').limit(0);
      }
    }

    function toMillis(v){
      try{
        if(!v) return 0;
        if(typeof v === 'number') return v;
        if(typeof v.toMillis === 'function') return v.toMillis();
      }catch(e){}
      return 0;
    }

    var unsub = q.onSnapshot(function(snap){
      var rooms = [];
      snap.forEach(function(doc){
        var r = doc.data() || {};
        r.roomId = r.roomId || doc.id;
        r.createdAt = toMillis(r.createdAt);
        r.updatedAt = toMillis(r.updatedAt);
        r.lastAt = toMillis(r.lastAt);

        var hid = r.hiddenBy || {};
        // hide if any of my identity keys are marked
        var myKeys = [];
        if(myP) myKeys.push(myP);
        var myCode2 = String((user.code || cu.code) || '').trim();
        var myK2 = principalCode(myCode2);
        if(myK2) myKeys.push(myK2);
        if(myC) myKeys.push(myC);
        myKeys = myKeys.filter(function(v,i,a){ return v && a.indexOf(v)===i; });
        for(var i=0;i<myKeys.length;i++){
          if(hid && hid[myKeys[i]]) return;
        }
        rooms.push(r);
      });
      rooms.sort(function(a,b){ return Number(b.updatedAt||0) - Number(a.updatedAt||0); });
      cb && cb(rooms);
    }, function(err){
      // Firestore query can fail (permission/index/etc). Fallback to server-side room list
      try{ console.warn('[rooms] Firestore subscribe failed; falling back to /api/chat/rooms', err); }catch(e){}
      try{
        if(!window.__FP_ROOMS_FALLBACK_UNSUB){
          window.__FP_ROOMS_FALLBACK_UNSUB = localSubscribeRooms(user, cb);
        }
      }catch(e2){
        try{ console.warn('[rooms] Fallback subscribe failed', e2); }catch(e3){}
        cb && cb([]);
      }
    });

    return function(){
      try{ unsub && unsub(); }catch(e){}
      try{ if(window.__FP_ROOMS_FALLBACK_UNSUB){ window.__FP_ROOMS_FALLBACK_UNSUB(); window.__FP_ROOMS_FALLBACK_UNSUB=null; } }catch(e2){}
    };
  }

  function rtdbSubscribeMessages(roomId, cb){
    if(!hasRTDB() || !roomId) return function(){};
    var q = fbRef('chats/' + roomId).orderByChild('createdAt').limitToLast(120);
    var handler = function(snap){
      try{ if(window.FP_CHAT_MSG_ERROR && window.FP_CHAT_MSG_ERROR[roomId]) delete window.FP_CHAT_MSG_ERROR[roomId]; }catch(e){}
      var msgs = [];
      snap.forEach(function(child){
        var m = child.val() || {};
        m.id = child.key;
        msgs.push(m);
      });
      cb && cb(msgs);
    };
    q.on('value', handler, function(err){
      try{ window.FP_CHAT_MSG_ERROR = window.FP_CHAT_MSG_ERROR || {}; window.FP_CHAT_MSG_ERROR[roomId] = (err && err.message) ? String(err.message) : 'permission_denied'; }catch(e){}
      try{ cb && cb([]); }catch(e){}
    });
    return function(){
      try{ q.off('value', handler); }catch(e){}
    };
  }

// Incremental subscribe (no full rerender flicker)
// Fires existing children as a stream, then only new ones.
function rtdbSubscribeMessagesStream(roomId, onAdd, onError){
  if(!hasRTDB() || !roomId) return function(){};
  var q = fbRef('chats/' + roomId).orderByChild('createdAt').limitToLast(120);
  var handlerAdd = function(child){
    try{ if(window.FP_CHAT_MSG_ERROR && window.FP_CHAT_MSG_ERROR[roomId]) delete window.FP_CHAT_MSG_ERROR[roomId]; }catch(e){}
    var m = child && child.val ? (child.val() || {}) : {};
    m.id = child && child.key ? child.key : (m.id||'');
    try{ onAdd && onAdd(m); }catch(e){}
  };
  var handlerErr = function(err){
    var msg = (err && err.message) ? String(err.message) : 'permission_denied';
    try{ window.FP_CHAT_MSG_ERROR = window.FP_CHAT_MSG_ERROR || {}; window.FP_CHAT_MSG_ERROR[roomId] = msg; }catch(e){}
    try{ onError && onError(err); }catch(e){}
  };
  q.on('child_added', handlerAdd, handlerErr);
  return function(){
    try{ q.off('child_added', handlerAdd); }catch(e){}
  };
}


  // -----------------------
  // Local fallback (dev)
  // -----------------------
  var LOCAL_KEY = 'freepass_chat_store_v2';

  function safeParse(s, fallback){
    try{ return JSON.parse(s); }catch(e){ return fallback; }
  }
  function localLoad(){
    var raw = '';
    try{ raw = localStorage.getItem(LOCAL_KEY) || ''; }catch(e){}
    var st = safeParse(raw, null);
    if(!st || typeof st !== 'object') st = {};
    if(!st.rooms || typeof st.rooms !== 'object') st.rooms = {};
    if(!st.messages || typeof st.messages !== 'object') st.messages = {};
    return st;
  }
  function localSave(st){
    try{ localStorage.setItem(LOCAL_KEY, JSON.stringify(st)); }catch(e){}
  }

  function localEnsureRoom(meta){
    var st = localLoad();
    var rid = makeRoomId(meta || {});
    var t = now();
    if(!st.rooms[rid]){
      st.rooms[rid] = {
        roomId: rid,
        carNo: String(meta.carNo||'').trim(),
        carNoNorm: cleanCarNo(meta.carNo),
        agentCode: String(meta.agentCode||'').trim(),
        providerCode: String(meta.providerCode||'').trim(),
        providerCompanyCode: String(meta.providerCompanyCode||'').trim(),
        yymmdd: String(meta.yymmdd||'').trim(),
        detailModel: String(meta.detailModel||'').trim(),
        createdAt: t,
        updatedAt: t,
        lastText: '',
        lastAt: 0,
        lastSenderUid: '',
        readAtByUid: {},
        hiddenBy: {}
      };
      st.messages[rid] = st.messages[rid] || [];
      localSave(st);
    }else{
      st.rooms[rid].updatedAt = t;
      localSave(st);
    }
    return rid;
  }

  function localListRooms(user){
    var st = localLoad();
    var role = (user && user.role) ? String(user.role).toUpperCase() : 'AGENT';
    var code = (user && user.code) ? String(user.code) : '';
    var company = (user && (user.company_code||user.companyCode)) ? String(user.company_code||user.companyCode) : '';
    var key = getUserKey(user);

    var rooms = Object.keys(st.rooms).map(function(k){ return st.rooms[k]; });
    if(role === 'ADMIN'){
      // all
    }else if(role === 'PROVIDER'){
      rooms = rooms.filter(function(r){ return String(r.providerCompanyCode||'') === company; });
    }else{
      rooms = rooms.filter(function(r){ return String(r.agentCode||'') === code; });
    }
    rooms = rooms.filter(function(r){
      if(r.hiddenBy && key && r.hiddenBy[key]) return false;
      return true;
    });
    rooms.sort(function(a,b){ return Number(b.updatedAt||0) - Number(a.updatedAt||0); });
    return rooms;
  }

  function localGetMessages(roomId){
    var st = localLoad();
    var arr = st.messages[roomId];
    if(!Array.isArray(arr)) arr = [];
    return arr;
  }

  function localAddMessage(roomId, msg){
    var st = localLoad();
    st.messages[roomId] = st.messages[roomId] || [];
    var payload = {
      text: String((msg && msg.text) || ''),
      senderRole: String((msg && msg.senderRole) || ''),
      senderCode: String((msg && msg.senderCode) || ''),
      createdAt: now()
    };
    st.messages[roomId].push(payload);
    if(st.rooms[roomId]){
      st.rooms[roomId].updatedAt = payload.createdAt;
      st.rooms[roomId].lastText = payload.text;
      st.rooms[roomId].lastAt = payload.createdAt;
      st.rooms[roomId].lastSenderUid = ''; // local mode doesn't have uid
    }
    localSave(st);
    return true;
  }

  function localHideRoom(roomId, user){
    var st = localLoad();
    var key = getUserKey(user);
    if(st.rooms[roomId]){
      st.rooms[roomId].hiddenBy = st.rooms[roomId].hiddenBy || {};
      st.rooms[roomId].hiddenBy[key] = true;
      st.rooms[roomId].updatedAt = now();
      localSave(st);
    }
    return true;
  }

  function localSubscribeRooms(user, cb){
    var alive = true;
    function tick(){
      if(!alive) return;
      try{ cb && cb(localListRooms(user)); }catch(e){}
    }
    tick();
    var t = setInterval(tick, 1500);
    return function(){ alive = false; try{ clearInterval(t); }catch(e){} };
  }

  function localSubscribeMessages(roomId, cb){
    var alive = true;
    function tick(){
      if(!alive) return;
      try{ cb && cb(localGetMessages(roomId)); }catch(e){}
    }
    tick();
    var t = setInterval(tick, 1000);
    return function(){ alive = false; try{ clearInterval(t); }catch(e){} };
  }

  // -----------------------
  // Public API
  // -----------------------
  var api = {
    ensureRoom: function(meta){
      if(hasFirestore()){
        fsEnsureRoom(meta).catch(function(){});
        return makeRoomId(meta);
      }
      return localEnsureRoom(meta);
    },
    ensureRoomAsync: function(meta){
      if(hasFirestore()) return fsEnsureRoom(meta);
      return Promise.resolve(localEnsureRoom(meta));
    },
    addMessage: function(roomId, msg){
      if(hasRTDB()) return rtdbSendMessage(roomId, msg);
      return Promise.resolve(localAddMessage(roomId, msg));
    },
    markRead: function(roomId, user){
      // Optional 3rd arg: ts
      var ts = arguments.length >= 3 ? arguments[2] : undefined;
      if(hasFirestore()) return fsMarkRead(roomId, user, ts);
      return Promise.resolve(true);
    },
    hideRoom: function(roomId, user){
      if(hasFirestore()) return fsHideRoom(roomId, user);
      return Promise.resolve(localHideRoom(roomId, user));
    },
    subscribeRooms: function(user, cb){
      if(hasFirestore()) return fsSubscribeRooms(user, cb);
      return localSubscribeRooms(user, cb);
    },
    subscribeMessages: function(roomId, cb){
      if(hasRTDB()) return rtdbSubscribeMessages(roomId, cb);
      return localSubscribeMessages(roomId, cb);
    },
    subscribeMessagesStream: function(roomId, onAdd, onError){
      if(hasRTDB()) return rtdbSubscribeMessagesStream(roomId, onAdd, onError);
      // fallback: emulate stream by full list once
      return localSubscribeMessages(roomId, function(msgs){
        (msgs||[]).forEach(function(m){ try{ onAdd && onAdd(m); }catch(e){} });
      });
    }
  };

  window.FP_CORE.chat = api;
})();
