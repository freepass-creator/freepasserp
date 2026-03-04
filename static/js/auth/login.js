import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, signOut, signInWithEmailAndPassword, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { firebaseConfig } from "./firebase_init.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// -----------------------------
// Quick login (DEV only)
// Firebase에 미리 생성해둔 테스트 계정들의 비밀번호를 여기서 한 번에 통제합니다.
// -----------------------------
const QUICK_DEFAULT_PASSWORD = "freepass1234"; // TODO: 필요 시 변경

function qs(sel){ return document.querySelector(sel); }

function setMsg(text){
  const el = qs('#msg');
  if(!el) return;
  el.textContent = text || '';
}

function setLoading(isLoading){
  const btn = qs('#login-form button[type="submit"]');
  if(!btn) return;
  btn.disabled = !!isLoading;
  btn.style.opacity = isLoading ? '0.7' : '1';
  btn.style.cursor = isLoading ? 'not-allowed' : 'pointer';
}

async function createServerSession(idToken){
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);

  try{
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ idToken }),
      signal: controller.signal
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok){
      throw new Error(data.error || 'server_session_failed');
    }
    return data;
  }finally{
    clearTimeout(t);
  }
}

async function handleLogin(e){
  e.preventDefault();
  setMsg('');

  const email = (qs('#email')?.value || '').trim();
  const password = (qs('#password')?.value || '').trim();

  if(!email || !password){
    setMsg('이메일/비밀번호를 입력하세요.');
    return;
  }

  setLoading(true);
  setMsg('처리중...');

  try{
    await setPersistence(auth, browserLocalPersistence);
    try{ await signOut(auth); }catch(e){}
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const idToken = await cred.user.getIdToken(/* forceRefresh */ true);

    const ss = await createServerSession(idToken);

    if(ss.status === 'ACTIVE'){
      const next = new URLSearchParams(location.search).get('next');
      location.href = next || '/products';
      return;
    }

    if(ss.status === 'PENDING'){
      location.href = `/pending?email=${encodeURIComponent(email)}`;
      return;
    }

    if(ss.status === 'REJECTED'){
      location.href = `/pending?email=${encodeURIComponent(email)}`;
      return;
    }

    if(ss.status === 'NOT_REGISTERED'){
      setMsg('가입 요청이 확인되지 않습니다. 회원가입을 진행하세요.');
      return;
    }

    setMsg('로그인 처리 중 오류가 발생했습니다.');
  }catch(err){
    const raw = String(err?.message || err || '');
    console.error('[AUTH][LOGIN] error:', err);

    const lower = raw.toLowerCase();
    if(lower.includes('aborterror')){
      setMsg('서버 응답이 지연되고 있습니다. 잠시 후 다시 시도하세요.');
      return;
    }
    if(lower.includes('auth/user-not-found') || lower.includes('auth/wrong-password') || lower.includes('auth/invalid-credential')){
      setMsg('아이디 또는 비밀번호가 올바르지 않습니다.');
      return;
    }
    if(lower.includes('auth/operation-not-allowed')){
      setMsg('Firebase 이메일/비밀번호 로그인(Email/Password)이 비활성화되어 있습니다.');
      return;
    }
    if(lower.includes('auth/too-many-requests')){
      setMsg('요청이 많습니다. 잠시 후 다시 시도하세요.');
      return;
    }
    if(lower.includes('server_session_failed') || lower.includes('server_session')){
      setMsg('서버 세션 생성에 실패했습니다. 콘솔/네트워크에서 /api/auth/session 응답을 확인하세요.');
      return;
    }

    setMsg(`로그인 실패: ${raw}`);
  }finally{
    setLoading(false);
  }
}


function bindQuickLogin(){
  const btns = document.querySelectorAll('[data-quick-login]');
  if(!btns || !btns.length) return;

  btns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      try{
        const email = (btn.getAttribute('data-email') || '').trim();
        const password = (btn.getAttribute('data-password') || QUICK_DEFAULT_PASSWORD).trim();
        if(!email || !password){
          setMsg('테스트 로그인 설정(email/password)이 비어있습니다.');
          return;
        }
        const emailEl = qs('#email');
        const pwEl = qs('#password');
        if(emailEl) emailEl.value = email;
        if(pwEl) pwEl.value = password;

        // 바로 로그인 시도
        const form = qs('#login-form');
        if(form){
          form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable:true, bubbles:true }));
        }
      }catch(e){
        console.error('[AUTH][QUICK_LOGIN] error:', e);
        setMsg('테스트 로그인 실행 중 오류가 발생했습니다.');
      }
    });
  });
}


function boot(){
  const form = qs('#login-form');
  if(form) form.addEventListener('submit', handleLogin);
  bindQuickLogin();
}

boot();