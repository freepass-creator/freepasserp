import { onValue, push, ref, remove, set } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';
import { ref as sRef, uploadBytes, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js';
import { db, storage } from '../../firebase/firebase-config.js';
import { escapeHtml } from '../../core/management-format.js';
import { showToast, showConfirm } from '../../core/toast.js';
import { registerPageCleanup } from '../../core/utils.js';
import { setDirtyCheck, clearDirtyCheck } from '../../app.js';

function fmtDate(v) {
  const d = new Date(Number(v || 0));
  if (Number.isNaN(d.getTime()) || d.getTime() <= 0) return '-';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export function createNoticeController({ getCurrentProfile }) {
  let noticeItems = [];
  let selectedNoticeId = null;
  let noticeFormMode = 'idle';
  let noticeImgFile = null, noticeImgUrl = null, noticeImgCleared = false;

  async function uploadNoticeImage(file) {
    const profile = getCurrentProfile();
    const path = `notice-images/${profile.uid}/${Date.now()}_${file.name}`;
    const r = sRef(storage, path);
    await uploadBytes(r, file, { contentType: file.type || 'image/png' });
    return { url: await getDownloadURL(r), storageRef: r };
  }

  function renderThumb(src) {
    const el = document.getElementById('adminNoticeThumbList');
    if (!el) return;
    if (!src) { el.innerHTML = ''; return; }
    const url = typeof src === 'string' ? src : URL.createObjectURL(src);
    el.innerHTML = `<div class="img-thumb-item"><div class="img-thumb-media"><img src="${url}" alt=""></div>
      <button type="button" class="img-thumb-remove" id="adminNoticeImgRemove" title="제거">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button></div>`;
  }

  function clearImg() {
    noticeImgFile = null; noticeImgUrl = null; noticeImgCleared = true;
    const input = document.getElementById('admin_notice_img');
    if (input) input.value = '';
    renderThumb(null);
  }

  function setMode(mode) {
    noticeFormMode = mode;
    const form = document.getElementById('adminNoticeForm');
    const hint = document.getElementById('adminNoticeIdleHint');
    const imgBtn = document.getElementById('adminNoticeImgPickBtn');
    const editBtn = document.getElementById('adminNoticeEditSave');
    const delBtn = document.getElementById('adminNoticeDelete');

    if (hint) hint.hidden = mode !== 'idle';
    if (form) form.hidden = mode === 'idle';
    if (imgBtn) imgBtn.hidden = mode === 'view';
    if (editBtn) editBtn.textContent = (mode === 'edit' || mode === 'create') ? '저장' : '수정';
    if (delBtn) delBtn.disabled = !selectedNoticeId || mode === 'create';

    const fields = form?.querySelectorAll('input, textarea') || [];
    fields.forEach(f => { if (f.type !== 'file') f.readOnly = mode === 'view'; });

    if (mode === 'edit') setDirtyCheck(() => noticeFormMode === 'edit');
    else clearDirtyCheck();
  }

  function selectNotice(notice) {
    selectedNoticeId = notice.id;
    document.querySelectorAll('#adminNoticeList .admin-notice-row').forEach(r => {
      r.classList.toggle('is-active', r.dataset.noticeId === notice.id);
    });
    document.getElementById('admin_notice_title').value = notice.title || '';
    document.getElementById('admin_notice_body').value = notice.body || '';
    noticeImgFile = null; noticeImgCleared = false;
    noticeImgUrl = notice.image_url || null;
    renderThumb(noticeImgUrl || null);
    setMode('view');
  }

  function deselectNotice() {
    selectedNoticeId = null;
    document.querySelectorAll('#adminNoticeList .admin-notice-row').forEach(r => r.classList.remove('is-active'));
    document.getElementById('admin_notice_title').value = '';
    document.getElementById('admin_notice_body').value = '';
    clearImg();
    setMode('idle');
  }

  function renderList() {
    const list = document.getElementById('adminNoticeList');
    if (!list) return;
    if (!noticeItems.length) { list.innerHTML = '<div class="list-empty" style="padding:20px;text-align:center;color:#94a3b8;">등록된 안내사항이 없습니다.</div>'; return; }
    list.innerHTML = noticeItems.map(n => `
      <div class="admin-notice-row${selectedNoticeId === n.id ? ' is-active' : ''}" data-notice-id="${escapeHtml(n.id)}">
        ${n.image_url ? '<svg class="admin-notice-img-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>' : ''}
        <span class="admin-notice-title">${escapeHtml(n.title || '제목 없음')}</span>
        <span class="admin-notice-date">${fmtDate(n.created_at)}</span>
      </div>
    `).join('');
  }

  function bind() {
    const noticeForm = document.getElementById('adminNoticeForm');
    const noticeMsg = document.getElementById('adminNoticeMessage');
    const noticeList = document.getElementById('adminNoticeList');
    const imgInput = document.getElementById('admin_notice_img');
    const editSaveBtn = document.getElementById('adminNoticeEditSave');
    const deleteBtn = document.getElementById('adminNoticeDelete');

    imgInput?.addEventListener('change', () => {
      const file = imgInput.files?.[0];
      if (file) { noticeImgFile = file; noticeImgCleared = false; renderThumb(file); }
    });

    document.getElementById('adminNoticeThumbList')?.addEventListener('click', e => {
      if (e.target.closest('#adminNoticeImgRemove')) clearImg();
    });

    noticeList?.addEventListener('click', async (e) => {
      const row = e.target.closest('.admin-notice-row');
      if (!row) return;
      if (noticeFormMode === 'edit' && !await showConfirm('수정/등록을 중단하시겠습니까?\n저장하지 않은 내용은 사라집니다.')) return;
      const notice = noticeItems.find(n => n.id === row.dataset.noticeId);
      if (notice) selectNotice(notice);
    });

    document.getElementById('adminNoticeNew')?.addEventListener('click', async () => {
      if (noticeFormMode === 'edit' && !await showConfirm('수정/등록을 중단하시겠습니까?\n저장하지 않은 내용은 사라집니다.')) return;
      selectedNoticeId = null;
      document.querySelectorAll('#adminNoticeList .admin-notice-row').forEach(r => r.classList.remove('is-active'));
      noticeForm?.reset();
      clearImg();
      setMode('create');
      document.getElementById('admin_notice_title')?.focus();
    });

    editSaveBtn?.addEventListener('click', async () => {
      if (noticeFormMode === 'view') {
        if (!await showConfirm('수정하시겠습니까?')) return;
        setMode('edit');
        return;
      }
      if (noticeFormMode === 'edit' || noticeFormMode === 'create') {
        if (!await showConfirm('저장하시겠습니까?')) return;
        noticeForm?.requestSubmit();
      }
    });

    let saving = false;
    noticeForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (saving) return;
      saving = true;
      const title = document.getElementById('admin_notice_title')?.value.trim();
      const body = document.getElementById('admin_notice_body')?.value.trim();
      if (!title || !body) { saving = false; if (noticeMsg) noticeMsg.textContent = '제목과 내용을 모두 입력하세요.'; return; }
      if (noticeMsg) noticeMsg.textContent = '';
      if (editSaveBtn) editSaveBtn.disabled = true;
      let _uploadedRef = null;
      try {
        let image_url;
        if (noticeImgFile) {
          if (noticeMsg) noticeMsg.textContent = '업로드 중…';
          const { url, storageRef } = await uploadNoticeImage(noticeImgFile);
          image_url = url; _uploadedRef = storageRef;
          if (noticeMsg) noticeMsg.textContent = '';
        } else if (!noticeImgCleared && noticeImgUrl) { image_url = noticeImgUrl; }

        if (selectedNoticeId) {
          const updates = { title, body };
          if (image_url !== undefined) updates.image_url = image_url;
          else if (noticeImgCleared) updates.image_url = null;
          const existing = noticeItems.find(n => n.id === selectedNoticeId) || {};
          const payload = { ...existing, ...updates }; delete payload.id;
          await set(ref(db, `home_notices/${selectedNoticeId}`), payload);
          selectNotice({ ...existing, ...updates, id: selectedNoticeId });
        } else {
          const profile = getCurrentProfile();
          const data = { title, body, writer_uid: profile.uid, writer_name: profile.name || profile.user_name || profile.email || '관리자', created_at: Date.now() };
          if (image_url) data.image_url = image_url;
          await set(push(ref(db, 'home_notices')), data);
          deselectNotice();
        }
        showToast('저장 완료', 'success');
      } catch (err) {
        if (_uploadedRef) deleteObject(_uploadedRef).catch(() => {});
        if (noticeMsg) noticeMsg.textContent = err.message;
        showToast(`저장 실패: ${err.message}`, 'error');
        if (editSaveBtn) editSaveBtn.disabled = false;
      } finally { saving = false; }
    });

    deleteBtn?.addEventListener('click', async () => {
      if (!selectedNoticeId) return;
      if (!await showConfirm('이 안내사항을 삭제하시겠습니까?')) return;
      try {
        await remove(ref(db, `home_notices/${selectedNoticeId}`));
        deselectNotice();
        showToast('삭제 완료', 'success');
      } catch (err) { showToast(`삭제 실패: ${err.message}`, 'error'); }
    });

    const unsub = onValue(ref(db, 'home_notices'), (snap) => {
      const raw = snap.val() || {};
      noticeItems = Object.entries(raw).map(([id, v]) => ({ id, ...(v || {}) })).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      renderList();
    });
    registerPageCleanup(unsub);
    registerPageCleanup(() => clearDirtyCheck());
  }

  function onTabEnter() { setMode('idle'); }

  return { bind, onTabEnter };
}
