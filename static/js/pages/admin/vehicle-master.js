import {
  watchVehicleMaster, addVehicleMasterEntry, deleteVehicleMasterEntry, fetchProductsOnce,
} from '../../firebase/firebase-db.js';
import { showToast, showConfirm } from '../../core/toast.js';

export function createVehicleMasterAdminController({ getCurrentProfile }) {
  let items = [];
  let unsub = null;
  let bound = false;
  let editingId = null;

  const $ = (id) => document.getElementById(id);
  const escapeHtml = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function refreshFilterSelects() {
    const makerSel = $('#vmFilterMaker');
    const modelSel = $('#vmFilterModel');
    if (!makerSel || !modelSel) return;
    const curMaker = makerSel.value;
    const curModel = modelSel.value;
    const makers = [...new Set(items.map((it) => it.maker).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    makerSel.innerHTML = '<option value="">전체 제조사</option>' +
      makers.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
    if (makers.includes(curMaker)) makerSel.value = curMaker;
    const modelPool = curMaker
      ? items.filter((it) => it.maker === makerSel.value)
      : items;
    const models = [...new Set(modelPool.map((it) => it.model_name).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    modelSel.innerHTML = '<option value="">전체 모델</option>' +
      models.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
    if (models.includes(curModel)) modelSel.value = curModel;
  }

  function render() {
    refreshFilterSelects();
    const q = ($('#vmSearch')?.value || '').toLowerCase().trim();
    const fMaker = $('#vmFilterMaker')?.value || '';
    const fModel = $('#vmFilterModel')?.value || '';
    const tbody = $('#vmList');
    const count = $('#vmCount');
    if (!tbody) return;
    const filtered = items
      .filter((it) => {
        if (fMaker && it.maker !== fMaker) return false;
        if (fModel && it.model_name !== fModel) return false;
        if (!q) return true;
        const blob = `${it.maker} ${it.model_name} ${it.sub_model} ${it.vehicle_category || ''}`.toLowerCase();
        return blob.includes(q);
      })
      .sort((a, b) =>
        (a.maker || '').localeCompare(b.maker || '') ||
        (a.model_name || '').localeCompare(b.model_name || '') ||
        (a.sub_model || '').localeCompare(b.sub_model || '')
      );
    if (count) count.textContent = `${filtered.length}건`;
    tbody.innerHTML = filtered
      .map(
        (it) => `<tr data-id="${escapeHtml(it.entry_id)}">
        <td>${escapeHtml(it.maker)}</td>
        <td>${escapeHtml(it.model_name)}</td>
        <td>${escapeHtml(it.sub_model)}</td>
        <td>${escapeHtml(it.vehicle_category || '')}</td>
        <td>
          <button type="button" class="inline-button btn-xs vm-edit-btn">수정</button>
          <button type="button" class="inline-button btn-xs btn-danger vm-del-btn">삭제</button>
        </td>
      </tr>`
      )
      .join('');
    tbody.querySelectorAll('.vm-edit-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.target.closest('tr')?.dataset.id;
        const it = items.find((x) => x.entry_id === id);
        if (!it) return;
        editingId = id;
        $('#vmMaker').value = it.maker || '';
        $('#vmModel').value = it.model_name || '';
        $('#vmSub').value = it.sub_model || '';
        $('#vmCat').value = it.vehicle_category || '';
        $('#vmSaveBtn').textContent = '수정 저장';
        $('#vmMaker').focus();
      });
    });
    tbody.querySelectorAll('.vm-del-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.closest('tr')?.dataset.id;
        const it = items.find((x) => x.entry_id === id);
        if (!it) return;
        const ok = await showConfirm(`${it.maker} ${it.model_name} ${it.sub_model}\n삭제하시겠습니까?`);
        if (!ok) return;
        try {
          await deleteVehicleMasterEntry(id);
          showToast('삭제 완료', 'success');
        } catch (err) {
          showToast('삭제 실패: ' + (err.message || err), 'error');
        }
      });
    });
  }

  async function handleSave() {
    const maker = $('#vmMaker').value.trim();
    const model_name = $('#vmModel').value.trim();
    const sub_model = $('#vmSub').value.trim();
    const vehicle_category = $('#vmCat').value.trim();
    if (!maker || !model_name || !sub_model) {
      showToast('제조사·모델명·세부모델은 필수', 'error');
      return;
    }
    try {
      const profile = getCurrentProfile?.() || {};
      // 수정 모드: 기존 entry 삭제 후 추가 (entry_id가 키 기반이라 자연 처리)
      if (editingId) {
        const old = items.find((x) => x.entry_id === editingId);
        if (old && old.entry_id !== `${maker}_${model_name}_${sub_model}`.replace(/\s+/g, '_')) {
          await deleteVehicleMasterEntry(editingId);
        }
      }
      await addVehicleMasterEntry(
        { maker, model_name, sub_model, vehicle_category },
        { updatedBy: profile.uid || '', updatedByName: profile.name || profile.email || '' }
      );
      showToast(editingId ? '수정 완료' : '추가 완료', 'success');
      $('#vmMaker').value = '';
      $('#vmModel').value = '';
      $('#vmSub').value = '';
      $('#vmCat').value = '';
      $('#vmSaveBtn').textContent = '저장하기';
      editingId = null;
      $('#vmMaker').focus();
    } catch (err) {
      showToast('저장 실패: ' + (err.message || err), 'error');
    }
  }

  async function handleImportFromProducts() {
    const ok = await showConfirm('기존 등록된 상품에서 제조사·모델·세부모델 조합을 추출해\nvehicle_master에 추가합니다.\n(이미 있는 항목은 덮어씁니다)\n\n진행하시겠습니까?');
    if (!ok) return;
    try {
      const products = await fetchProductsOnce();
      const seen = new Map();
      (products || []).forEach((p) => {
        const maker = String(p?.maker || '').trim();
        const model_name = String(p?.model_name || '').trim();
        const sub_model = String(p?.sub_model || '').trim();
        if (!maker || !model_name || !sub_model) return;
        const key = `${maker}|${model_name}|${sub_model}`;
        if (!seen.has(key)) {
          seen.set(key, {
            maker, model_name, sub_model,
            vehicle_category: String(p?.vehicle_class || '').trim(),
          });
        }
      });
      const list = [...seen.values()];
      if (!list.length) {
        showToast('가져올 상품이 없습니다', 'error');
        return;
      }
      const profile = getCurrentProfile?.() || {};
      let saved = 0, failed = 0;
      for (const entry of list) {
        try {
          await addVehicleMasterEntry(entry, {
            updatedBy: profile.uid || '',
            updatedByName: profile.name || profile.email || '',
          });
          saved++;
        } catch (e) { failed++; console.error('vm import fail', entry, e); }
      }
      showToast(`가져오기 완료: ${saved}건${failed ? ` (실패 ${failed})` : ''}`, 'success');
    } catch (err) {
      showToast('가져오기 실패: ' + (err.message || err), 'error');
    }
  }

  function bind() {
    if (bound) return;
    bound = true;
    $('#vmSaveBtn')?.addEventListener('click', handleSave);
    $('#vmImportBtn')?.addEventListener('click', handleImportFromProducts);
    $('#vmSearch')?.addEventListener('input', render);
    $('#vmFilterMaker')?.addEventListener('change', () => {
      $('#vmFilterModel').value = '';
      render();
    });
    $('#vmFilterModel')?.addEventListener('change', render);
    [$('#vmMaker'), $('#vmModel'), $('#vmSub'), $('#vmCat')].forEach((el) => {
      el?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSave();
      });
    });
  }

  function onTabEnter() {
    if (!unsub) {
      unsub = watchVehicleMaster((data) => {
        items = data?.items || [];
        render();
      });
    } else {
      render();
    }
  }

  function dispose() {
    if (typeof unsub === 'function') unsub();
    unsub = null;
  }

  return { bind, onTabEnter, dispose };
}
