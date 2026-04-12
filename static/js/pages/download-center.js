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

function isFirebaseUrl(url) {
  return url.includes('firebasestorage.googleapis.com') || url.includes('storage.googleapis.com');
}

function getPhotosFromProduct(product, source = 'all') {
  const urls = [];
  if (Array.isArray(product.image_urls) && product.image_urls.length) {
    urls.push(...product.image_urls);
  } else if (product.image_url) {
    urls.push(product.image_url);
  }
  if (source === 'erp') return urls.filter(u => isFirebaseUrl(u));
  if (source === 'external') {
    const externalFromUrls = urls.filter(u => !isFirebaseUrl(u));
    const photoLink = String(product.photo_link || '').trim();
    if (photoLink && !externalFromUrls.includes(photoLink)) externalFromUrls.push(photoLink);
    return externalFromUrls;
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
  let erpCount = 0, extCount = 0;
  filtered.forEach(p => {
    erpCount += getPhotosFromProduct(p, 'erp').length;
    extCount += getPhotosFromProduct(p, 'external').length;
  });
  const countEl = qs('#dlc-photo-count');
  if (countEl) countEl.textContent = `차량 ${filtered.length}대 / ERP ${erpCount}장 / 외부링크 ${extCount}장`;
}

async function downloadPhotos(source = 'erp') {
  const period = qs('#dlc-photo-period')?.value || 'all';
  const provider = qs('#dlc-photo-provider')?.value || 'all';
  const filtered = getFilteredProducts(period, provider);
  const productsWithPhotos = filtered.filter(p => getPhotosFromProduct(p, source).length > 0);

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
    productsWithPhotos.forEach(p => { totalPhotos += getPhotosFromProduct(p, source).length; });

    for (const product of productsWithPhotos) {
      const photos = getPhotosFromProduct(product, source);
      const folderName = buildFolderName(product);
      const folder = zip.folder(folderName);

      for (let i = 0; i < photos.length; i++) {
        try {
          const url = source === 'external' ? `/api/proxy-image?url=${encodeURIComponent(photos[i])}` : photos[i];
          const res = await fetch(url);
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
    const sourceLabel = source === 'external' ? '외부링크' : 'ERP';
    a.download = `상품사진_${sourceLabel}_${periodLabel}_${new Date().toISOString().slice(0, 10)}.zip`;
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

async function downloadExcel() {
  const provider = qs('#dlc-excel-provider')?.value || 'all';
  let filtered = allProducts.filter(p => p.status !== 'deleted');
  if (provider !== 'all') {
    filtered = filtered.filter(p => (p.provider_company_code || p.partner_code || '') === provider);
  }
  if (!filtered.length) { showToast('다운로드할 상품이 없습니다.', 'info'); return; }

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

  const priceStartIdx = 16;
  const priceEndIdx = 27;
  const vehiclePriceIdx = 15;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'FREEPASS ERP';
  const ws = wb.addWorksheet('상품목록', { views: [{ state: 'frozen', ySplit: 1 }] });

  const colWidths = headers.map(h => {
    if (h === '사진링크') return 40;
    if (h.includes('대여료') || h.includes('보증금') || h === '차량가격') return 14;
    if (h.includes('옵션') || h.includes('트림') || h === '특이사항') return 18;
    if (h === '상품코드') return 18;
    return 11;
  });

  ws.columns = headers.map((h, i) => ({ header: h, key: h, width: colWidths[i] }));

  const thinBorder = { style: 'thin', color: { argb: 'FFD0D5DD' } };
  const border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
  const bodyFont = { name: 'Pretendard', size: 9, color: { argb: 'FF1F2937' } };
  const headerFont = { name: 'Pretendard', size: 9, bold: true, color: { argb: 'FF1B2A4A' } };
  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F9' } };
  const priceFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFBFC' } };

  const headerRow = ws.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = headerFont;
    cell.fill = headerFill;
    cell.border = border;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
  });

  filtered.forEach(p => {
    const price = p.price || {};
    const photoUrls = Array.isArray(p.image_urls) ? p.image_urls : (p.image_url ? [p.image_url] : []);
    const photoLink = p.photo_link || '';
    const photoDisplay = photoUrls.length ? photoUrls[0] : photoLink || '';

    const values = [
      p.provider_company_code || p.partner_code || '',
      p.product_code || p.product_uid || '',
      p.vehicle_status || '',
      p.product_type || '',
      p.car_number || '',
      p.maker || '',
      p.model_name || '',
      p.sub_model || '',
      p.trim_name || p.trim || '',
      p.options || '',
      p.fuel_type || '',
      p.year || '',
      p.mileage || '',
      p.ext_color || '',
      p.vehicle_class || '',
      Number(p.vehicle_price || 0) || ''
    ];
    months.forEach(m => {
      const slot = price[m] || {};
      values.push(Number(slot.rent || 0) || '', Number(slot.deposit || 0) || '');
    });
    values.push(
      p.review_status || '', p.min_age || '', p.credit_grade || '',
      p.bodily_limit || p.injury_limit_deductible || '',
      p.property_limit || p.property_limit_deductible || '',
      p.personal_injury_limit || p.personal_injury_limit_deductible || '',
      p.uninsured_limit || p.uninsured_limit_deductible || '',
      p.own_damage || p.own_damage_limit_deductible || '',
      p.driver_age_lowering || p.age_lowering || '',
      p.age_lowering_cost || '',
      p.annual_mileage || '',
      p.payment_method || '',
      p.delivery_fee || '',
      p.penalty_rate || '',
      p.partner_memo || p.note || '',
      photoDisplay
    );

    const row = ws.addRow(values);
    row.height = 18;
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.font = bodyFont;
      cell.border = border;
      cell.alignment = { vertical: 'middle', wrapText: false };
      const ci = colNum - 1;
      if (ci >= priceStartIdx && ci <= priceEndIdx || ci === vehiclePriceIdx) {
        if (typeof cell.value === 'number' && cell.value > 0) {
          cell.numFmt = '#,##0';
        }
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.fill = priceFill;
      }
      if (ci === headers.length - 1 && cell.value && String(cell.value).startsWith('http')) {
        cell.value = { text: '사진 보기', hyperlink: String(cell.value) };
        cell.font = { ...bodyFont, color: { argb: 'FF2563EB' }, underline: true };
      }
    });
  });

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: filtered.length + 1, column: headers.length } };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `상품목록_${new Date().toISOString().slice(0, 10)}.xlsx`;
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
    qs('#dlc-photo-download')?.addEventListener('click', () => downloadPhotos('erp'));
    qs('#dlc-photo-external')?.addEventListener('click', () => downloadPhotos('external'));
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
