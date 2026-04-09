import { watchColorMaster, setColorMaster, fetchProductsOnce } from '../../firebase/firebase-db.js';
import { showToast, showConfirm } from '../../core/toast.js';
import { EXT_COLORS as DEFAULT_EXT, INT_COLORS as DEFAULT_INT } from '../../data/color-codes.js';

export function createColorAdminController() {
  let extColors = [];
  let intColors = [];
  let unsub = null;
  let bound = false;

  const $ = (id) => document.getElementById(id);
  const escapeHtml = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function renderList(containerId, list, kind) {
    const el = $(containerId);
    if (!el) return;
    const searchEl = $(kind === 'ext' ? 'extColorSearch' : 'intColorSearch');
    const countEl = $(kind === 'ext' ? 'extColorCount' : 'intColorCount');
    const q = (searchEl?.value || '').toLowerCase().trim();
    const filtered = q ? list.filter((c) => c.toLowerCase().includes(q)) : list;
    if (countEl) countEl.textContent = `${filtered.length}/${list.length}`;
    el.innerHTML = filtered
      .map(
        (c) => `<span class="admin-color-chip" data-val="${escapeHtml(c)}">
          ${escapeHtml(c)}
          <button type="button" class="admin-color-del" data-kind="${kind}">×</button>
        </span>`
      )
      .join('');
    el.querySelectorAll('.admin-color-del').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const chip = e.target.closest('.admin-color-chip');
        const val = chip?.dataset.val;
        if (!val) return;
        const ok = await showConfirm(`"${val}" 삭제하시겠습니까?`);
        if (!ok) return;
        try {
          if (kind === 'ext') {
            await setColorMaster({ ext_colors: extColors.filter((x) => x !== val) });
          } else {
            await setColorMaster({ int_colors: intColors.filter((x) => x !== val) });
          }
          showToast('삭제 완료', 'success');
        } catch (err) {
          showToast('삭제 실패: ' + (err.message || err), 'error');
        }
      });
    });
  }

  function render() {
    renderList('extColorList', extColors, 'ext');
    renderList('intColorList', intColors, 'int');
  }

  async function addColor(kind) {
    const inputEl = kind === 'ext' ? $('#extColorInput') : $('#intColorInput');
    const val = inputEl.value.trim();
    if (!val) return;
    const list = kind === 'ext' ? extColors : intColors;
    if (list.includes(val)) {
      showToast('이미 있는 색상', 'error');
      return;
    }
    try {
      const next = [...list, val];
      if (kind === 'ext') await setColorMaster({ ext_colors: next });
      else await setColorMaster({ int_colors: next });
      inputEl.value = '';
      inputEl.focus();
      showToast('추가 완료', 'success');
    } catch (err) {
      showToast('저장 실패: ' + (err.message || err), 'error');
    }
  }

  async function handleImportFromProducts() {
    const ok = await showConfirm('기존 등록된 상품에서 외부/내부 색상을 추출해\ncolor_master에 추가합니다.\n\n진행하시겠습니까?');
    if (!ok) return;
    try {
      const products = await fetchProductsOnce();
      const ext = new Set(extColors);
      const int = new Set(intColors);
      (products || []).forEach((p) => {
        const e = String(p?.ext_color || '').trim();
        const i = String(p?.int_color || '').trim();
        if (e) ext.add(e);
        if (i) int.add(i);
      });
      const nextExt = [...ext];
      const nextInt = [...int];
      await setColorMaster({ ext_colors: nextExt, int_colors: nextInt });
      const addedExt = nextExt.length - extColors.length;
      const addedInt = nextInt.length - intColors.length;
      showToast(`가져오기 완료: 외부 +${addedExt}, 내부 +${addedInt}`, 'success');
    } catch (err) {
      showToast('가져오기 실패: ' + (err.message || err), 'error');
    }
  }

  function bind() {
    if (bound) return;
    bound = true;
    $('#colorImportBtn')?.addEventListener('click', handleImportFromProducts);
    $('#extColorAddBtn')?.addEventListener('click', () => addColor('ext'));
    $('#intColorAddBtn')?.addEventListener('click', () => addColor('int'));
    $('#extColorInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addColor('ext'); });
    $('#intColorInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addColor('int'); });
    $('#extColorSearch')?.addEventListener('input', render);
    $('#intColorSearch')?.addEventListener('input', render);
  }

  function onTabEnter() {
    if (!unsub) {
      unsub = watchColorMaster((data) => {
        extColors = data.ext_colors.length ? data.ext_colors : [...DEFAULT_EXT];
        intColors = data.int_colors.length ? data.int_colors : [...DEFAULT_INT];
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
