/* FREEPASS ERP — Firebase Runtime Init (Compat)
   - Initializes Firebase app/auth/database/firestore for pages inside shell.html
   - Reuses window.FP_FIREBASE_CONFIG from static/js/firebase_config.js
*/
(function(){
  try{
    if(!window.FP_FIREBASE_CONFIG) return;
    if(!window.firebase || !firebase.initializeApp) return;

    if(firebase.apps && firebase.apps.length){
      // already initialized
    }else{
      firebase.initializeApp(window.FP_FIREBASE_CONFIG);
    }

    window.FP_FB = window.FP_FB || {};
    window.FP_FB.app = firebase.app();
    try{ window.FP_FB.auth = firebase.auth(); }catch(e){}
    try{ window.FP_FB.db = firebase.database(); }catch(e){}
    try{ window.FP_FB.fs = firebase.firestore(); }catch(e){}
  }catch(e){
    // no-op
  }
})();