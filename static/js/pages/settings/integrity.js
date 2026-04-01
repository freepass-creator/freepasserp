/**
 * settings/integrity.js
 *
 * 관리자용 데이터 정합성 검사 컨트롤러.
 * DB의 이미지 URL과 Storage 실제 파일을 대조하여 고아 파일을 검출·삭제한다.
 */

import { ref, get } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';
import { ref as storageRef, listAll, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js';
import { db } from '../../firebase/firebase-config.js';
import { storage } from '../../firebase/firebase-config.js';

export function createIntegrityController({ elements }) {
  const {
    checkButton, cleanupButton, message,
    dbCountEl, storageCountEl, orphanCountEl, missingCountEl,
    orphanListEl
  } = elements;

  let lastOrphanUrls = [];
  let isBusy = false;

  function setBusy(busy) {
    isBusy = busy;
    if (checkButton) checkButton.disabled = busy;
    if (cleanupButton) cleanupButton.disabled = busy || lastOrphanUrls.length === 0;
  }

  /**
   * DB에서 모든 이미지 URL을 수집한다 (products, contracts).
   */
  async function collectDbImageUrls() {
    const urls = new Set();

    // products의 image_url, image_urls
    const productsSnap = await get(ref(db, 'products'));
    const products = productsSnap.val() || {};
    for (const product of Object.values(products)) {
      if (!product) continue;
      if (product.image_url) urls.add(String(product.image_url).trim());
      if (Array.isArray(product.image_urls)) {
        product.image_urls.forEach((u) => { if (u) urls.add(String(u).trim()); });
      }
    }

    // contracts의 docs[].url
    const contractsSnap = await get(ref(db, 'contracts'));
    const contracts = contractsSnap.val() || {};
    for (const contract of Object.values(contracts)) {
      if (!contract) continue;
      if (Array.isArray(contract.docs)) {
        contract.docs.forEach((doc) => { if (doc?.url) urls.add(String(doc.url).trim()); });
      }
    }

    return urls;
  }

  /**
   * Storage의 product-images/ 및 contract-files/ 하위 모든 파일 URL을 수집한다.
   */
  async function collectStorageUrls() {
    const urls = new Set();

    async function listRecursive(folderRef) {
      const result = await listAll(folderRef);
      const downloadUrls = await Promise.allSettled(
        result.items.map((item) => getDownloadURL(item))
      );
      downloadUrls.forEach((r) => {
        if (r.status === 'fulfilled' && r.value) urls.add(r.value);
      });
      for (const prefix of result.prefixes) {
        await listRecursive(prefix);
      }
    }

    await Promise.all([
      listRecursive(storageRef(storage, 'product-images')).catch(() => {}),
      listRecursive(storageRef(storage, 'contract-files')).catch(() => {})
    ]);

    return urls;
  }

  function renderOrphanList(orphanUrls) {
    if (!orphanListEl) return;
    if (!orphanUrls.length) {
      orphanListEl.innerHTML = '<div class="image-preview-empty" style="min-height:48px;">고아 파일이 없습니다.</div>';
      return;
    }
    orphanListEl.innerHTML = orphanUrls.map((url, i) => {
      const shortUrl = url.length > 80 ? url.slice(0, 40) + '...' + url.slice(-35) : url;
      return `<div class="summary-row" style="font-size:11px;padding:4px 8px;word-break:break-all;">${i + 1}. ${shortUrl}</div>`;
    }).join('');
  }

  async function handleCheck() {
    if (isBusy) return;
    setBusy(true);
    lastOrphanUrls = [];
    renderOrphanList([]);
    if (message) message.textContent = 'DB 및 Storage 데이터를 수집하는 중...';

    try {
      const [dbUrls, storageUrls] = await Promise.all([
        collectDbImageUrls(),
        collectStorageUrls()
      ]);

      if (message) message.textContent = '서버에서 대조 분석 중...';

      const response = await fetch('/api/integrity/storage-orphans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          db_urls: [...dbUrls],
          storage_urls: [...storageUrls]
        })
      });

      const result = await response.json();
      if (!result.ok) throw new Error(result.message || '정합성 검사에 실패했습니다.');

      if (dbCountEl) dbCountEl.textContent = String(result.db_url_count || 0);
      if (storageCountEl) storageCountEl.textContent = String(result.storage_url_count || 0);
      if (orphanCountEl) orphanCountEl.textContent = String(result.orphaned_count || 0);
      if (missingCountEl) missingCountEl.textContent = String(result.missing_count || 0);

      lastOrphanUrls = result.orphaned_urls || [];
      renderOrphanList(lastOrphanUrls);

      if (message) {
        message.textContent = lastOrphanUrls.length
          ? `검사 완료: 고아 파일 ${lastOrphanUrls.length}건 발견`
          : '검사 완료: 모든 파일이 정상입니다.';
      }
    } catch (error) {
      if (message) message.textContent = `검사 실패: ${error.message}`;
    } finally {
      setBusy(false);
    }
  }

  async function handleCleanup() {
    if (isBusy || !lastOrphanUrls.length) return;
    if (!confirm(`고아 파일 ${lastOrphanUrls.length}건을 삭제합니다. 계속하시겠습니까?`)) return;

    setBusy(true);
    if (message) message.textContent = `고아 파일 삭제 중... (0/${lastOrphanUrls.length})`;

    let deleted = 0;
    let failed = 0;

    for (const url of lastOrphanUrls) {
      try {
        const fileRef = storageRef(storage, url);
        await deleteObject(fileRef);
        deleted++;
      } catch (error) {
        const code = error?.code || '';
        if (code === 'storage/object-not-found') {
          deleted++;
        } else {
          failed++;
        }
      }
      if (message) message.textContent = `고아 파일 삭제 중... (${deleted + failed}/${lastOrphanUrls.length})`;
    }

    lastOrphanUrls = [];
    renderOrphanList([]);
    if (orphanCountEl) orphanCountEl.textContent = '0';
    if (message) message.textContent = `삭제 완료: 성공 ${deleted}건${failed ? `, 실패 ${failed}건` : ''}`;
    setBusy(false);
  }

  return {
    bindEvents() {
      checkButton?.addEventListener('click', handleCheck);
      cleanupButton?.addEventListener('click', handleCleanup);
    }
  };
}
