/**
 * crypto.js — 개인정보 AES-GCM 암호화/복호화 + 마스킹
 *
 * 사용법:
 *   import { maskName, maskPhone, maskBirth, encryptField, decryptField, requestDecryptPassword } from './crypto.js';
 *
 *   // 저장 시: 마스킹 + 암호화
 *   const masked = maskName('홍길동');        // '홍*동'
 *   const encrypted = await encryptField('홍길동', password);
 *
 *   // 열람 시: 비밀번호 입력 → 복호화
 *   const original = await decryptField(encrypted, password);
 */

// ─── 마스킹 함수 ──────────────────────────────────────────────────────────────

/** 이름 마스킹: 홍길동 → 홍*동, 홍길동이 → 홍**이, 홍길 → 홍* */
export function maskName(name) {
  if (!name || name.length < 2) return name || '';
  if (name.length === 2) return name[0] + '*';
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
}

/** 전화번호 마스킹: 010-1234-5678 → 010-****-5678 */
export function maskPhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length < 8) return phone;
  // 뒤 4자리만 보여주고 중간 마스킹
  return digits.slice(0, 3) + '-****-' + digits.slice(-4);
}

/** 생년월일 마스킹: 980315 → ***315, 19980315 → *****315 */
export function maskBirth(birth) {
  if (!birth) return '';
  const clean = birth.replace(/[^0-9]/g, '');
  if (clean.length < 4) return birth;
  return '*'.repeat(clean.length - 3) + clean.slice(-3);
}

// ─── AES-GCM 암호화 ──────────────────────────────────────────────────────────

/** 비밀번호로부터 AES 키 생성 (PBKDF2) */
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** 필드 암호화 → base64 문자열 반환 (salt + iv + ciphertext) */
export async function encryptField(plainText, password) {
  if (!plainText) return '';
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plainText));
  // salt(16) + iv(12) + ciphertext 를 하나로 합쳐서 base64
  const combined = new Uint8Array(salt.length + iv.length + new Uint8Array(ciphertext).length);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);
  return btoa(String.fromCharCode(...combined));
}

/** 필드 복호화 → 원본 문자열 반환. 비밀번호 틀리면 null */
export async function decryptField(encryptedBase64, password) {
  if (!encryptedBase64) return '';
  try {
    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const ciphertext = combined.slice(28);
    const key = await deriveKey(password, salt);
    const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(plainBuffer);
  } catch {
    return null; // 비밀번호 틀림
  }
}

// ─── 비밀번호 입력 팝업 ──────────────────────────────────────────────────────

/** 비밀번호 입력 모달. 반환: 입력한 비밀번호 문자열 또는 null(취소) */
export function requestDecryptPassword() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);backdrop-filter:blur(2px)';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:var(--radius-md,8px);padding:24px;width:min(360px,90vw);box-shadow:0 8px 32px rgba(0,0,0,0.2)">
        <div style="font-size:var(--font-size-lg,15px);font-weight:600;margin-bottom:16px;color:var(--text-main,#1e293b)">개인정보 열람</div>
        <div style="font-size:var(--font-size-base,13px);color:var(--text-subtle,#64748b);margin-bottom:12px">개인정보 확인을 위해 비밀번호를 입력하세요.</div>
        <input type="password" id="_crypto_pw" placeholder="비밀번호" autocomplete="off"
          style="width:100%;height:var(--height-lg,42px);padding:0 12px;border:1px solid var(--border-main,#cbd5e1);border-radius:var(--radius-xs,4px);font-size:var(--font-size-base,13px);margin-bottom:16px;box-sizing:border-box">
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button type="button" id="_crypto_cancel" style="height:var(--height-sm,32px);padding:0 16px;border:1px solid var(--border-soft,#e2e8f0);border-radius:var(--radius-xs,4px);background:var(--surface-base,#fff);cursor:pointer;font-size:var(--font-size-base,13px)">취소</button>
          <button type="button" id="_crypto_ok" style="height:var(--height-sm,32px);padding:0 16px;border:none;border-radius:var(--radius-xs,4px);background:#1b2a4a;color:#fff;cursor:pointer;font-size:var(--font-size-base,13px)">확인</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#_crypto_pw');
    const close = (val) => { overlay.remove(); resolve(val); };
    overlay.querySelector('#_crypto_cancel').onclick = () => close(null);
    overlay.querySelector('#_crypto_ok').onclick = () => close(input.value || null);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') close(input.value || null); if (e.key === 'Escape') close(null); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
    setTimeout(() => input.focus(), 50);
  });
}
