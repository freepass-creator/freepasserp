import { requireAuth } from '../core/auth-guard.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { qs } from '../core/utils.js';
import { fetchProductsOnce, fetchPartnersOnce, updateProduct } from '../firebase/firebase-db.js';
import { showToast, showConfirm } from '../core/toast.js';

function normalizeCarNumber(value = '') {
  return String(value).trim().replace(/\s+/g, '').replace(/[.#$\[\]\/]/g, '').toUpperCase();
}

let allProducts = [];
let allPartners = [];

function getFilteredProducts(periodValue, providerValue) {
  let filtered = allProducts.filter(p => p.status !== 'deleted');
  if (providerValue && providerValue !== 'all') {
    filtered = filtered.filter(p => (p.provider_company_code || p.partner_code || '') === providerValue);
  }
  if (periodValue && periodValue !== 'all') {
    const days = Number(periodValue);
    const cutoff = Date.now() - days * 86400000;
    filtered = filtered.filter(p => (p.created_at || 0) >= cutoff);
  }
  return filtered;
}

function getPhotosFromProduct(product) {
  const urls = [];
  if (Array.isArray(product.image_urls) && product.image_urls.length) {
    urls.push(...product.image_urls);
  } else if (product.image_url) {
    urls.push(product.image_url);
  }
  return urls;
}

function buildFolderName(product) {
  const parts = [
    product.car_number || product.carNo || '',
    product.model_name || product.model || '',
    product.provider_company_code || product.partner_code || ''
  ].filter(Boolean);
  return parts.join('_').replace(/[\\/:*?"<>|]/g, '_') || product.id || 'unknown';
}

function populateProviderSelect(selectId) {
  const select = qs(selectId);
  if (!select) return;
  const providers = allPartners.filter(p => p.partner_type === 'provider' && p.status !== 'deleted');
  select.innerHTML = '<option value="all">전체</option>' +
    providers.map(p => `<option value="${p.partner_code}">${p.partner_code}</option>`).join('');
}

function updatePhotoCount() {
  const period = qs('#dlc-photo-period')?.value || 'all';
  const provider = qs('#dlc-photo-provider')?.value || 'all';
  const filtered = getFilteredProducts(period, provider);
  let photoCount = 0;
  filtered.forEach(p => { photoCount += getPhotosFromProduct(p).length; });
  const countEl = qs('#dlc-photo-count');
  if (countEl) countEl.textContent = `차량 ${filtered.length}대 / 사진 ${photoCount}장`;
}

async function downloadPhotos() {
  const period = qs('#dlc-photo-period')?.value || 'all';
  const provider = qs('#dlc-photo-provider')?.value || 'all';
  const filtered = getFilteredProducts(period, provider);
  const productsWithPhotos = filtered.filter(p => getPhotosFromProduct(p).length > 0);

  if (!productsWithPhotos.length) {
    showToast('다운로드할 사진이 없습니다.', 'info');
    return;
  }

  const progressEl = qs('#dlc-photo-progress');
  const fillEl = qs('#dlc-photo-fill');
  const textEl = qs('#dlc-photo-text');
  const btn = qs('#dlc-photo-download');
  progressEl.hidden = false;
  btn.disabled = true;

  try {
    const zip = new JSZip();
    let completed = 0;
    let totalPhotos = 0;
    productsWithPhotos.forEach(p => { totalPhotos += getPhotosFromProduct(p).length; });

    for (const product of productsWithPhotos) {
      const photos = getPhotosFromProduct(product);
      const folderName = buildFolderName(product);
      const folder = zip.folder(folderName);

      for (let i = 0; i < photos.length; i++) {
        try {
          const res = await fetch(photos[i]);
          if (!res.ok) continue;
          const blob = await res.blob();
          const ext = (blob.type || '').includes('png') ? 'png' : 'jpg';
          folder.file(`${i + 1}.${ext}`, blob);
        } catch {}
        completed++;
        const pct = Math.round((completed / totalPhotos) * 100);
        fillEl.style.width = `${pct}%`;
        textEl.textContent = `다운로드 중... ${completed}/${totalPhotos}`;
      }
    }

    textEl.textContent = 'ZIP 생성 중...';
    const blob = await zip.generateAsync({ type: 'blob' }, (meta) => {
      fillEl.style.width = `${Math.round(meta.percent)}%`;
    });

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const periodLabel = period === 'all' ? '전체' : `최근${period}일`;
    a.download = `상품사진_${periodLabel}_${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);

    textEl.textContent = '다운로드 완료';
    showToast(`${productsWithPhotos.length}대 / ${completed}장 다운로드 완료`, 'success');
  } catch (err) {
    showToast(`다운로드 실패: ${err.message}`, 'error');
    textEl.textContent = '다운로드 실패';
  } finally {
    btn.disabled = false;
    setTimeout(() => { progressEl.hidden = true; fillEl.style.width = '0'; }, 3000);
  }
}

async function downloadPhotosToFolder() {
  const period = qs('#dlc-photo-period')?.value || 'all';
  const provider = qs('#dlc-photo-provider')?.value || 'all';
  const filtered = getFilteredProducts(period, provider);
  const productsWithPhotos = filtered.filter(p => getPhotosFromProduct(p).length > 0);

  if (!productsWithPhotos.length) {
    showToast('다운로드할 사진이 없습니다.', 'info');
    return;
  }

  if (!window.showDirectoryPicker) {
    showToast('이 브라우저에서는 폴더 저장을 지원하지 않습니다. ZIP 다운로드를 이용해주세요.', 'error');
    return;
  }

  let dirHandle;
  try {
    dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch { return; }

  const progressEl = qs('#dlc-photo-progress');
  const fillEl = qs('#dlc-photo-fill');
  const textEl = qs('#dlc-photo-text');
  const btn = qs('#dlc-photo-folder');
  progressEl.hidden = false;
  if (btn) btn.disabled = true;

  let completed = 0;
  let totalPhotos = 0;
  productsWithPhotos.forEach(p => { totalPhotos += getPhotosFromProduct(p).length; });

  try {
    for (const product of productsWithPhotos) {
      const photos = getPhotosFromProduct(product);
      const folderName = buildFolderName(product);
      const subDir = await dirHandle.getDirectoryHandle(folderName, { create: true });

      for (let i = 0; i < photos.length; i++) {
        try {
          const res = await fetch(photos[i]);
          if (!res.ok) continue;
          const blob = await res.blob();
          const ext = (blob.type || '').includes('png') ? 'png' : 'jpg';
          const fileHandle = await subDir.getFileHandle(`${i + 1}.${ext}`, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
        } catch {}
        completed++;
        fillEl.style.width = `${Math.round((completed / totalPhotos) * 100)}%`;
        textEl.textContent = `저장 중... ${completed}/${totalPhotos}`;
      }
    }
    textEl.textContent = '저장 완료';
    showToast(`${productsWithPhotos.length}대 / ${completed}장 폴더 저장 완료`, 'success');
  } catch (err) {
    showToast(`저장 실패: ${err.message}`, 'error');
    textEl.textContent = '저장 실패';
  } finally {
    if (btn) btn.disabled = false;
    setTimeout(() => { progressEl.hidden = true; fillEl.style.width = '0'; }, 3000);
  }
}

function downloadExcel() {
  const provider = qs('#dlc-excel-provider')?.value || 'all';
  let filtered = allProducts.filter(p => p.status !== 'deleted');
  if (provider !== 'all') {
    filtered = filtered.filter(p => (p.provider_company_code || p.partner_code || '') === provider);
  }

  if (!filtered.length) {
    showToast('다운로드할 상품이 없습니다.', 'info');
    return;
  }

  const months = ['1', '12', '24', '36', '48', '60'];
  const headers = [
    '공급코드', '상품코드', '차량상태', '상품구분',
    '차량번호', '제조사', '모델명', '세부모델', '세부트림', '선택옵션',
    '연료', '연식', '주행거리', '색상', '차종구분', '차량가격',
    '월렌트_대여료', '월렌트_보증금',
    '12개월_대여료', '12개월_보증금',
    '24개월_대여료', '24개월_보증금',
    '36개월_대여료', '36개월_보증금',
    '48개월_대여료', '48개월_보증금',
    '60개월_대여료', '60개월_보증금',
    '심사기준', '최저연령', '신용등급',
    '대인', '대물', '자손', '무보험', '자차',
    '운전자연령인하', '연령인하비용', '연간주행거리',
    '결제방식', '탁송비', '위약금',
    '특이사항', '사진링크'
  ];

  const data = filtered.map(p => {
    const price = p.price || {};
    const photoUrls = Array.isArray(p.image_urls) ? p.image_urls : (p.image_url ? [p.image_url] : []);
    const photoLink = p.photo_link || '';
    const photoDisplay = photoUrls.length ? photoUrls.join('\n') : photoLink || '';

    const row = {};
    row['공급코드'] = p.provider_company_code || p.partner_code || '';
    row['상품코드'] = p.product_code || p.product_uid || '';
    row['차량상태'] = p.vehicle_status || '';
    row['상품구분'] = p.product_type || '';
    row['차량번호'] = p.car_number || '';
    row['제조사'] = p.maker || '';
    row['모델명'] = p.model_name || '';
    row['세부모델'] = p.sub_model || '';
    row['세부트림'] = p.trim_name || p.trim || '';
    row['선택옵션'] = p.options || '';
    row['연료'] = p.fuel_type || '';
    row['연식'] = p.year || '';
    row['주행거리'] = p.mileage || '';
    row['색상'] = p.ext_color || '';
    row['차종구분'] = p.vehicle_class || '';
    row['차량가격'] = Number(p.vehicle_price || 0) || '';
    months.forEach(m => {
      const slot = price[m] || {};
      const label = m === '1' ? '월렌트' : m + '개월';
      row[`${label}_대여료`] = Number(slot.rent || 0) || '';
      row[`${label}_보증금`] = Number(slot.deposit || 0) || '';
    });
    row['심사기준'] = p.review_status || '';
    row['최저연령'] = p.min_age || '';
    row['신용등급'] = p.credit_grade || '';
    row['대인'] = p.bodily_limit || p.injury_limit_deductible || '';
    row['대물'] = p.property_limit || p.property_limit_deductible || '';
    row['자손'] = p.personal_injury_limit || p.personal_injury_limit_deductible || '';
    row['무보험'] = p.uninsured_limit || p.uninsured_limit_deductible || '';
    row['자차'] = p.own_damage || p.own_damage_limit_deductible || '';
    row['운전자연령인하'] = p.driver_age_lowering || p.age_lowering || '';
    row['연령인하비용'] = p.age_lowering_cost || '';
    row['연간주행거리'] = p.annual_mileage || '';
    row['결제방식'] = p.payment_method || '';
    row['탁송비'] = p.delivery_fee || '';
    row['위약금'] = p.penalty_rate || '';
    row['특이사항'] = p.partner_memo || p.note || '';
    row['사진링크'] = photoDisplay;
    return row;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data, { header: headers });

  const colWidths = headers.map(h => {
    if (h === '사진링크') return { wch: 50 };
    if (h.includes('대여료') || h.includes('보증금') || h === '차량가격') return { wch: 14 };
    if (h.includes('옵션') || h.includes('트림') || h === '특이사항') return { wch: 20 };
    if (h === '상품코드') return { wch: 20 };
    return { wch: 12 };
  });
  ws['!cols'] = colWidths;

  const range = XLSX.utils.decode_range(ws['!ref']);
  ws['!autofilter'] = { ref: XLSX.utils.encode_range(range) };

  const priceColStart = headers.indexOf('월렌트_대여료');
  const priceColEnd = headers.indexOf('60개월_보증금');
  const vehiclePriceCol = headers.indexOf('차량가격');
  for (let r = 1; r <= range.e.r; r++) {
    const cols = [vehiclePriceCol];
    for (let c = priceColStart; c <= priceColEnd; c++) cols.push(c);
    for (const c of cols) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr] || !ws[addr].v) continue;
      ws[addr].t = 'n';
      ws[addr].z = '#,##0';
    }

    const photoCol = headers.indexOf('사진링크');
    const photoAddr = XLSX.utils.encode_cell({ r, c: photoCol });
    if (ws[photoAddr] && ws[photoAddr].v && String(ws[photoAddr].v).startsWith('http')) {
      const firstUrl = String(ws[photoAddr].v).split('\n')[0];
      ws[photoAddr].l = { Target: firstUrl, Tooltip: '사진 보기' };
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, '상품목록');
  XLSX.writeFile(wb, `상품목록_${new Date().toISOString().slice(0, 10)}.xlsx`);
  showToast(`${filtered.length}건 엑셀 다운로드 완료`, 'success');
}

async function handleFolderUpload(files) {
  if (!files || !files.length) return;

  const imageFiles = [...files].filter(f => f.type.startsWith('image/'));
  if (!imageFiles.length) {
    showToast('이미지 파일이 없습니다.', 'error');
    return;
  }

  const grouped = new Map();
  for (const file of imageFiles) {
    const pathParts = (file.webkitRelativePath || file.name).split('/');
    const folderName = pathParts.length > 1 ? pathParts[pathParts.length - 2] : '';
    if (!folderName) continue;
    const carNum = normalizeCarNumber(folderName);
    if (!carNum) continue;
    if (!grouped.has(carNum)) grouped.set(carNum, []);
    grouped.get(carNum).push(file);
  }

  for (const [carNum, files] of grouped) {
    files.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aMain = aName.includes('대표') || aName.startsWith('main') ? -1 : 0;
      const bMain = bName.includes('대표') || bName.startsWith('main') ? -1 : 0;
      if (aMain !== bMain) return aMain - bMain;
      return aName.localeCompare(bName);
    });
  }

  if (!grouped.size) {
    showToast('차량번호에 매칭되는 폴더가 없습니다.', 'error');
    return;
  }

  let matchCount = 0;
  let noMatchFolders = [];
  for (const [carNum] of grouped) {
    const product = allProducts.find(p => normalizeCarNumber(p.car_number || p.carNo || '') === carNum);
    if (product) matchCount++;
    else noMatchFolders.push(carNum);
  }

  let msg = `${grouped.size}개 폴더, ${imageFiles.length}장 감지\n매칭: ${matchCount}대`;
  if (noMatchFolders.length) msg += `\n미매칭: ${noMatchFolders.join(', ')}`;
  if (!await showConfirm(`${msg}\n\n업로드를 진행하시겠습니까?`)) return;

  const progressEl = qs('#dlc-upload-progress');
  const fillEl = qs('#dlc-upload-fill');
  const textEl = qs('#dlc-upload-text');
  progressEl.hidden = false;

  const { storage } = await import('../firebase/firebase-config.js');
  const { ref: sRef, uploadBytes, getDownloadURL } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js');

  let completed = 0;
  const total = imageFiles.length;
  let uploadedCount = 0;

  for (const [carNum, photos] of grouped) {
    const product = allProducts.find(p => normalizeCarNumber(p.car_number || p.carNo || '') === carNum);
    if (!product) {
      completed += photos.length;
      continue;
    }

    const existingUrls = Array.isArray(product.image_urls) ? [...product.image_urls] : (product.image_url ? [product.image_url] : []);
    const newUrls = [];

    for (const photo of photos) {
      try {
        const ext = photo.name.split('.').pop() || 'jpg';
        const storagePath = `products/${product.id || product.productUid}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
        const storageRef = sRef(storage, storagePath);
        await uploadBytes(storageRef, photo);
        const url = await getDownloadURL(storageRef);
        newUrls.push(url);
        uploadedCount++;
      } catch {}
      completed++;
      fillEl.style.width = `${Math.round((completed / total) * 100)}%`;
      textEl.textContent = `업로드 중... ${completed}/${total}`;
    }

    if (newUrls.length) {
      const allUrls = [...existingUrls, ...newUrls];
      await updateProduct(product.id || product.productUid, { image_urls: allUrls, image_url: allUrls[0] });
    }
  }

  textEl.textContent = `업로드 완료 (${uploadedCount}장)`;
  showToast(`${uploadedCount}장 업로드 완료`, 'success');
  allProducts = await fetchProductsOnce();
  updatePhotoCount();
  setTimeout(() => { progressEl.hidden = true; fillEl.style.width = '0'; }, 3000);
}

async function bootstrap() {
  try {
    const { profile } = await requireAuth({ roles: ['provider', 'agent', 'agent_manager', 'admin'] });
    renderRoleMenu(qs('#sidebar-menu'), profile.role);

    if (profile.role === 'agent' || profile.role === 'agent_manager') {
      const uploadPanel = qs('#dlc-upload-panel');
      if (uploadPanel) uploadPanel.hidden = true;
    }

    [allProducts, allPartners] = await Promise.all([fetchProductsOnce(), fetchPartnersOnce()]);

    populateProviderSelect('#dlc-photo-provider');
    populateProviderSelect('#dlc-excel-provider');
    updatePhotoCount();

    qs('#dlc-photo-period')?.addEventListener('change', updatePhotoCount);
    qs('#dlc-photo-provider')?.addEventListener('change', updatePhotoCount);
    qs('#dlc-photo-download')?.addEventListener('click', downloadPhotos);
    qs('#dlc-photo-folder')?.addEventListener('click', downloadPhotosToFolder);
    qs('#dlc-excel-download')?.addEventListener('click', downloadExcel);

    const uploadInput = qs('#dlc-upload-input');
    const uploadBrowse = qs('#dlc-upload-browse');
    const uploadDrop = qs('#dlc-upload-drop');

    uploadBrowse?.addEventListener('click', () => uploadInput?.click());
    uploadInput?.addEventListener('change', () => handleFolderUpload(uploadInput.files));

    uploadDrop?.addEventListener('dragover', (e) => { e.preventDefault(); uploadDrop.classList.add('is-dragover'); });
    uploadDrop?.addEventListener('dragleave', () => uploadDrop.classList.remove('is-dragover'));
    uploadDrop?.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadDrop.classList.remove('is-dragover');
      handleFolderUpload(e.dataTransfer?.files);
    });
  } catch (err) {
    console.error(err);
  }
}

let _mounted = false;
export async function mount() { _mounted = false; await bootstrap(); _mounted = true; }
export function unmount() { _mounted = false; }
if (!import.meta.url.includes('?')) mount();
