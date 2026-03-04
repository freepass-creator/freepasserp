import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  signOut
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { firebaseConfig } from "./firebase_init.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

function qs(sel){ return document.querySelector(sel); }

function setMsg(text, ok=false){
  const el = qs("#msg");
  if(!el) return;
  el.textContent = text || "";
  el.classList.toggle("ok", !!ok);
}

function digitsOnly(s){
  return String(s || "").replace(/\D/g, "");
}

function formatBizNo(raw){
  // raw: digits only
  const d = digitsOnly(raw).slice(0, 10);
  if(d.length <= 3) return d;                // 0..3
  if(d.length <= 5) return `${d.slice(0,3)}-${d.slice(3)}`; // 4..5
  return `${d.slice(0,3)}-${d.slice(3,5)}-${d.slice(5)}`;  // 6..10
}

function normalizeBizNo(v){
  // return digits only (10) if possible
  return digitsOnly(v).slice(0, 10);
}

async function createSessionAndRegisterRequest(idToken, payload){
  const res = await fetch("/api/auth/register-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, ...payload })
  });
  const json = await res.json().catch(()=> ({}));
  if(!res.ok){
    const msg = json.error || json.message || ("register_request_failed ("+res.status+")");
    throw new Error(msg);
  }
  return json;
}

async function main(){
  const form = qs("#signup-form");
  if(!form) return;

  await setPersistence(auth, browserLocalPersistence);

  // 사업자등록번호 자동 포맷
  const bizInput = qs("#businessNo");
  if(bizInput){
    bizInput.addEventListener("input", () => {
      const caret = bizInput.selectionStart || 0;
      const before = bizInput.value;
      const formatted = formatBizNo(before);
      bizInput.value = formatted;

      // 간단한 커서 보정(과한 계산 없이 무난하게 끝으로)
      // 입력 UX 안정 우선
      try { bizInput.setSelectionRange(formatted.length, formatted.length); } catch(_){}
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMsg("");

    const businessNoDigits = normalizeBizNo(qs("#businessNo")?.value);
    const businessNo = formatBizNo(businessNoDigits); // 서버엔 formatted로 전달(원하면 digits로 바꿔도 됨)

    const email = (qs("#email")?.value || "").trim();
    const password1 = qs("#password1")?.value || "";
    const password2 = qs("#password2")?.value || "";

    const nameTitle = (qs("#nameTitle")?.value || "").trim();
    const phone = (qs("#phone")?.value || "").trim();
    const workplace = (qs("#workplace")?.value || "").trim();
    const fax = (qs("#fax")?.value || "").trim();

    if(businessNoDigits.length !== 10){
      setMsg("사업자등록번호 10자리를 입력해 주세요.");
      return;
    }
    if(!email){
      setMsg("이메일은 필수입니다.");
      return;
    }
    if(password1.length < 6){
      setMsg("비밀번호는 6자리 이상이어야 합니다.");
      return;
    }
    if(password1 !== password2){
      setMsg("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    try{
      const btn = form.querySelector('button[type="submit"]');
      if(btn) btn.disabled = true;

      // 1) Create Firebase Auth user
      const cred = await createUserWithEmailAndPassword(auth, email, password1);

      // 2) Get ID token
      const idToken = await cred.user.getIdToken(true);

      // 3) Register signup request on server (PENDING)
      await createSessionAndRegisterRequest(idToken, {
        businessNo,   // formatted
        phone,
        nameTitle,
        workplace,
        fax
      });

      window.location.href = "/pending";
    }catch(err){
      console.error(err);
      try{ await signOut(auth); }catch(_){}

      const code = (err && err.code) ? String(err.code) : "";
      const msg = (err && err.message) ? String(err.message) : "가입신청 실패";

      if(code.includes("auth/email-already-in-use")){
        setMsg("이미 등록된 이메일입니다. 로그인페이지로 이동해 주세요.");
      }else{
        setMsg("가입신청 실패: " + msg);
      }

      const btn = form.querySelector('button[type="submit"]');
      if(btn) btn.disabled = false;
    }
  });
}

main();