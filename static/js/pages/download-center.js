import { requireAuth } from '../core/auth-guard.js';
import { renderRoleMenu } from '../core/role-menu.js';
import { qs } from '../core/utils.js';
import { fetchProductsOnce, fetchPartnersOnce, updateProduct } from '../firebase/firebase-db.js';
import { storage } from '../firebase/firebase-config.js';
import { ref as sRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js';
import { showToast, showConfirm } from '../core/toast.js';
import { normalizeCarNumber } from '../firebase/firebase-codes.js';

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
    providers.map(p => `<option value="${p.partner_code}">${p.partner_code} / ${p.partner_name}</option>`).join('');
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
  const headers = ['공급코드', '차량번호', '제조사', '모델명', '세부모델', '세부트림', '선택옵션', '연료', '연식', '주행거리', '색상', '차종구분'];
  months.forEach(m => { headers.push(`${m}개월_대여료`, `${m}개월_보증금`); });

  const rows = filtered.map(p => {
    const row = [
      p.provider_company_code || p.partner_code || '',
      p.car_number || p.carNo || '',
      p.maker || '',
      p.model_name || p.model || '',
      p.sub_model || p.subModel || '',
      p.trim || '',
      p.options || '',
      p.fuel || '',
      p.year || '',
      p.mileage || '',
      p.color || '',
      p.vehicle_class || ''
    ];
    months.forEach(m => {
      const slot = p.price?.[m] || {};
      row.push(slot.rent || '', slot.deposit || '');
    });
    return row;
  });

  const bom = '\uFEFF';
  const csv = bom + [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `상품목록_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
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
