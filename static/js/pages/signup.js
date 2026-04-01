import { signupWithEmail } from '../firebase/firebase-auth.js';
import { saveUserProfile, getPartnerByBusinessNumber } from '../firebase/firebase-db.js';
import { qs } from '../core/utils.js';

document.addEventListener('contextmenu', (e) => e.preventDefault());

const form = qs('#signup-form');
const message = qs('#signup-message');
const businessNumberInput = qs('#business_number');
const partnerPreview = qs('#partner-preview');

let matchedPartner = null;

function normalizeBusinessNumber(value = '') {
  return String(value).replace(/[^0-9]/g, '');
}

async function updatePartnerPreview() {
  const businessNumber = normalizeBusinessNumber(businessNumberInput?.value || '');
  matchedPartner = null;
  if (!partnerPreview) return;
  if (!businessNumber) {
    partnerPreview.className = 'auth-match-badge auth-match-badge--unmatched';
    partnerPreview.textContent = '매칭 대기';
    return;
  }
  const partner = await getPartnerByBusinessNumber(businessNumber);
  if (!partner) {
    partnerPreview.className = 'auth-match-badge auth-match-badge--unmatched';
    partnerPreview.textContent = '매칭되는 코드 없음';
    return;
  }
  matchedPartner = partner;
  const typeLabel = partner.partner_type === 'provider' ? '공급사' : partner.partner_type === 'sales_channel' ? '영업채널' : partner.partner_type;
  partnerPreview.className = 'auth-match-badge auth-match-badge--matched';
  partnerPreview.textContent = `${partner.partner_name} / ${typeLabel} / ${partner.partner_code}`;
}

businessNumberInput?.addEventListener('input', updatePartnerPreview);
updatePartnerPreview();

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = qs('#email').value.trim();
  const password = qs('#password').value.trim();
  const passwordConfirm = qs('#password_confirm').value.trim();
  const businessNumber = normalizeBusinessNumber(qs('#business_number').value.trim());
  const name = qs('#name').value.trim();
  const position = qs('#position').value.trim();
  const phone = qs('#phone').value.trim();

  if (password !== passwordConfirm) {
    message.textContent = '비밀번호와 비밀번호 확인이 일치하지 않습니다.';
    return;
  }

  try {
    const credential = await signupWithEmail(email, password);
    const partner = matchedPartner || await getPartnerByBusinessNumber(businessNumber);
    const partnerType = partner?.partner_type || '';
    const role = partnerType === 'provider' ? 'provider' : partnerType === 'sales_channel' ? 'agent' : '';

    await saveUserProfile(credential.user.uid, {
      email,
      name,
      position,
      phone,
      business_number: businessNumber,
      matched_partner_code: partner?.partner_code || '',
      matched_partner_name: partner?.partner_name || '',
      matched_partner_type: partnerType,
      company_code: partner?.partner_code || '',
      company_name: partner?.partner_name || '',
      role,
      status: 'pending',
      user_code: '',
      match_status: partner ? 'matched' : 'unmatched'
    });

    message.textContent = partner
      ? '계정 생성 완료. 소속이 자동 매칭되었으며 관리자 승인 후 로그인할 수 있습니다.'
      : '계정 생성 완료. 매칭되는 코드 없음 상태로 저장되었으며 관리자 확인 후 승인됩니다.';

    setTimeout(() => {
      window.location.href = '/login';
    }, 1200);
  } catch (error) {
    message.textContent = `계정 생성 실패: ${error.message}`;
  }
});
