/**
 * mobile/product-detail.js — 모바일 상품 상세 (그룹 구성)
 *
 * 1. 갤러리
 * 2. 차량 정보 (제조사·모델·차량번호·세부·트림·옵션·연료·연식·주행·색상)
 * 3. 가격 요약 (최저 대여료·보증금·기간)
 * 4. 대여료 상세 (전체 기간 표)
 * 5. 보험 상세
 * 6. 대여조건 상세
 * 7. 추가 정보
 */
import { requireAuth } from '../core/auth-guard.js';
import { watchProducts, watchTerms, ensureRoom } from '../firebase/firebase-db.js';
import { open as openFullscreenViewer } from '../shared/fullscreen-photo-viewer.js';
import { showToast, showConfirm } from '../core/toast.js';
import { renderMobileProductDetail } from '../shared/mobile-product-detail-markup.js';

const $content   = document.getElementById('m-pd-content');
const $back      = document.getElementById('m-back-btn');
const $btnChat   = document.getElementById('m-pd-chat-top');
const $btnContract = document.getElementById('m-pd-contract');
const $btnShare  = document.getElementById('m-pd-share');

const pathParts = location.pathname.split('/').filter(Boolean);
const productId = decodeURIComponent(pathParts[pathParts.length - 1] || '');

let activePhotoIndex = 0;
let currentProduct = null;
let allPolicies = [];
let currentUser = null;
let currentProfile = null;


/* ─── 메인 렌더 ─────────────────────────────────── */
function render() {
  if (!$content) return;
  const p = currentProduct;
  if (!p) {
    $content.innerHTML = '<div style="padding:48px 16px;text-align:center;color:#8b95a1;">상품을 찾을 수 없습니다</div>';
    return;
  }
  // 상단바 타이틀: 차량번호 세부모델명
  const $title = document.getElementById('m-pd-title');
  if ($title) {
    const carNo = p.car_number || '';
    const subModel = p.sub_model || '';
    $title.textContent = [carNo, subModel].filter(Boolean).join(' ') || '상품';
  }

  // 렌더 — shared 모듈에서 모든 섹션 마크업 생성
  $content.innerHTML = renderMobileProductDetail(p, {
    policies: allPolicies,
    activePhotoIndex,
    showFee: true,
  });

  // 갤러리 인터랙션
  const photos = (Array.isArray(p.image_urls) && p.image_urls.length ? p.image_urls : null) || (p.image_url ? [p.image_url] : []);
  // ⚡ 모든 사진 백그라운드 preload — 풀스크린 뷰어 진입 시 즉시 표시
  if (!window.__pdPreloadedFor || window.__pdPreloadedFor !== productId) {
    window.__pdPreloadedFor = productId;
    photos.forEach((url) => {
      if (!url) return;
      const img = new Image();
      img.decoding = 'async';
      img.loading = 'eager';
      img.src = url;
    });
  }
  $content.querySelector('#m-pd-prev')?.addEventListener('click', () => {
    activePhotoIndex = (activePhotoIndex - 1 + photos.length) % photos.length;
    render();
  });
  $content.querySelector('#m-pd-next')?.addEventListener('click', () => {
    activePhotoIndex = (activePhotoIndex + 1) % photos.length;
    render();
  });

  // 사진 클릭 → 풀스크린 세로 스크롤 뷰어
  const $img = $content.querySelector('.m-pd-gallery img');
  if ($img && photos.length) {
    $img.style.cursor = 'zoom-in';
    $img.addEventListener('click', (e) => {
      // 좌우 nav 버튼 클릭은 제외
      if (e.target.closest('.m-pd-gallery__nav')) return;
      openFullscreenViewer(photos, activePhotoIndex);
    });
  }
}

$back?.addEventListener('click', () => {
  if (history.length > 1) history.back();
  else location.href = '/m/product-list';
});

// ─── 액션: 문의(채팅) ────────────────────────────────────────────────────
$btnChat?.addEventListener('click', async (e) => {
  e.preventDefault();
  if (!currentProduct) { showToast('상품 정보를 불러오는 중입니다', 'info'); return; }
  if (currentProfile?.role !== 'agent') { showToast('영업자만 문의할 수 있습니다', 'error'); return; }
  const ok = await showConfirm('이 상품에 대해 문의를 시작하시겠습니까?');
  if (!ok) return;
  $btnChat.disabled = true;
  try {
    const p = currentProduct;
    const roomId = await ensureRoom({
      productUid: p.product_uid || '',
      productCode: p.product_code || p.product_uid || '',
      providerUid: p.provider_uid || '',
      providerCompanyCode: p.provider_company_code || p.partner_code || '',
      providerName: p.provider_name || '',
      agentUid: currentUser?.uid || '',
      agentCode: currentProfile?.user_code || '',
      agentName: currentProfile?.name || '',
      vehicleNumber: p.car_number || '',
      modelName: [p.maker, p.model_name, p.sub_model, p.trim_name].filter(v => v && v !== '-').join(' '),
    });
    // 채팅방으로 이동 → 입력칸 자동 포커스
    location.href = `/m/chat/${encodeURIComponent(roomId)}`;
  } catch (err) {
    console.error('[product-detail] chat failed', err);
    showToast('대화 연결 실패: ' + (err?.message || ''), 'error');
    $btnChat.disabled = false;
  }
});

// ─── 액션: 계약 ──────────────────────────────────────────────────────────
$btnContract?.addEventListener('click', async (e) => {
  e.preventDefault();
  if (!currentProduct) { showToast('상품 정보를 불러오는 중입니다', 'info'); return; }
  if (currentProfile?.role !== 'agent') { showToast('영업자만 계약을 생성할 수 있습니다', 'error'); return; }
  const ok = await showConfirm('이 상품으로 계약을 생성하시겠습니까?');
  if (!ok) return;
  const p = currentProduct;
  const seed = {
    seed_product_key: p.product_uid || p.product_code || '',
    product_uid: p.product_uid || p.product_code || '',
    product_code: p.product_code || p.product_uid || '',
    product_code_snapshot: p.product_code || p.product_uid || '',
    partner_code: p.partner_code || p.provider_company_code || '',
    provider_company_code: p.provider_company_code || p.partner_code || '',
    policy_code: p.policy_code || p.term_code || '',
    car_number: p.car_number || '',
    vehicle_name: [p.maker, p.model_name, p.sub_model, p.trim_name].filter(Boolean).join(' '),
    maker: p.maker || '',
    model_name: p.model_name || '',
    sub_model: p.sub_model || '',
    trim_name: p.trim_name || '',
    rent_month: '48',
    rent_amount: Number(p.price?.['48']?.rent || p.rental_price_48 || 0),
    deposit_amount: Number(p.price?.['48']?.deposit || p.deposit_48 || 0),
  };
  try {
    localStorage.setItem('freepass_pending_contract_seed', JSON.stringify(seed));
  } catch {}
  // 계약 페이지로 이동 → 빈 폼 자동 채움
  location.href = '/m/contract';
});

// ─── 액션: 공유 ──────────────────────────────────────────────────────────
$btnShare?.addEventListener('click', async (e) => {
  e.preventDefault();
  if (!currentProduct) { showToast('상품 정보를 불러오는 중입니다', 'info'); return; }
  const ok = await showConfirm('이 상품의 공유 링크를 만드시겠습니까?');
  if (!ok) return;
  const p = currentProduct;
  const url = new URL(location.origin + '/catalog');
  url.searchParams.set('id', p.product_uid || p.product_code || '');
  if (currentProfile?.user_code) url.searchParams.set('a', currentProfile.user_code);
  // 타이틀: "{상품유형} {차량번호} {차종} - {담당자 이름} {직급}"
  // 예: "신차렌트 113허0000 쏘렌토 - 홍길동 팀장"
  const carPart = [p.product_type, p.car_number, p.model_name || p.sub_model].filter(Boolean).join(' ');
  const agentPart = [currentProfile?.name, currentProfile?.position].filter(Boolean).join(' ');
  const company = currentProfile?.company_name || '';
  const carTitle = [carPart, agentPart && `- ${agentPart}`].filter(Boolean).join(' ');
  if (carTitle) url.searchParams.set('t', carTitle);
  if (company) url.searchParams.set('c', company);
  // 설명: 가격 위주 — "48개월 월 79만원 · 보증금 100만원"
  const num = (v) => Number(String(v ?? '').replace(/[^\d.-]/g, '')) || 0;
  const months = [1, 12, 24, 36, 48, 60];
  let cheapest = null;
  for (const m of months) {
    const slot = (p.price && (p.price[m] || p.price[String(m)])) || {};
    const rent = num(slot.rent);
    if (rent && (!cheapest || rent < cheapest.rent)) cheapest = { m, rent, deposit: num(slot.deposit) };
  }
  // 형식: "48개월 월 79만원 · 보증금 100만원 · 24년식 · 1.2만km · 가솔린"
  const fmtMan = (n) => {
    if (n >= 10000 && n % 10000 === 0) return `${(n/10000).toLocaleString('ko-KR')}만원`;
    return `${n.toLocaleString('ko-KR')}원`;
  };
  const fmtKm = (n) => {
    if (n >= 10000) return `${(n/10000).toFixed(1).replace(/\.0$/, '')}만km`;
    return `${n.toLocaleString('ko-KR')}km`;
  };
  const descParts = [];
  if (cheapest) {
    descParts.push(`${cheapest.m}개월 월 ${fmtMan(cheapest.rent)}`);
    if (cheapest.deposit) descParts.push(`보증금 ${fmtMan(cheapest.deposit)}`);
  }
  if (p.year) descParts.push(`${String(p.year).slice(-2)}년식`);
  if (p.mileage) descParts.push(fmtKm(num(p.mileage)));
  if (p.fuel_type) descParts.push(String(p.fuel_type));
  if (descParts.length) url.searchParams.set('d', descParts.join(' · '));
  // 차량 대표 이미지 → 서버 인메모리 캐시에 저장 (await로 캐시 보장)
  const firstImg = (Array.isArray(p.image_urls) && p.image_urls[0]) || p.image_url || '';
  const productKey = p.product_uid || p.product_code || '';
  if (firstImg && productKey) {
    try {
      await fetch('/api/share/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: productKey, img: firstImg }),
      });
    } catch {}
  }
  const shareUrl = url.toString();
  const title = carTitle || [p.maker, p.model_name].filter(Boolean).join(' ') || '상품';
  // Web Share API 우선
  if (navigator.share) {
    try { await navigator.share({ title, url: shareUrl }); return; }
    catch (err) { if (err?.name === 'AbortError') return; }
  }
  // 클립보드 fallback
  try {
    await navigator.clipboard.writeText(shareUrl);
    showToast('링크가 복사되었습니다', 'success');
  } catch {
    window.prompt('아래 링크를 복사하세요', shareUrl);
  }
});

// ─── 버튼 항상 노출 — 클릭 시 핸들러에서 역할 체크 ─────────────────────
function applyRoleVisibility() {
  if ($btnChat)     $btnChat.hidden     = false;
  if ($btnContract) $btnContract.hidden = false;
  if ($btnShare)    $btnShare.hidden    = false;
}

// ⚡ 마지막으로 렌더된 HTML을 sessionStorage에 보관 → 재방문 시 즉시 복원 (체감 0ms)
const SS_HTML_KEY = 'fp_pd_html_' + productId;
(function restoreLastHtml() {
  try {
    const cached = sessionStorage.getItem(SS_HTML_KEY);
    if (cached && $content) $content.innerHTML = cached;
  } catch {}
})();
window.addEventListener('pagehide', () => {
  try { if ($content) sessionStorage.setItem(SS_HTML_KEY, $content.innerHTML); } catch {}
});

// ⚡ 캐시 즉시 사용 — Firebase 응답 기다리지 않고 첫 페인트 전에 렌더
function hydrateFromCache() {
  const cached = window.__appData || {};
  if (Array.isArray(cached.products)) {
    const found = cached.products.find(p => p.product_uid === productId || p.product_code === productId);
    if (found) currentProduct = found;
  }
  if (Array.isArray(cached.terms)) {
    allPolicies = cached.terms;
  }
  if (currentProduct) render();
}
hydrateFromCache();
// IDB 비동기 복원/Firebase 응답 도착 시 다시 hydrate
window.addEventListener('fp:data', (e) => {
  const t = e.detail?.type;
  if (t === 'products' || t === 'terms') hydrateFromCache();
});

(async () => {
  try {
    const auth = await requireAuth();
    currentUser = auth.user;
    currentProfile = auth.profile;
    applyRoleVisibility();
    watchProducts((products) => {
      currentProduct = products.find(p => p.product_uid === productId || p.product_code === productId);
      render();
    });
    watchTerms((terms) => {
      allPolicies = Array.isArray(terms) ? terms : [];
      render();
    });
  } catch (e) {
    console.error('[mobile/product-detail] init failed', e);
  }
})();
