import { escapeHtml } from '../../core/management-format.js';
import { showToast, showConfirm } from '../../core/toast.js';

export function createStockController({ getPartnerNameMap }) {
  let allProducts = [];
  let filterPartner = '', filterStatus = '', filterType = '', filterMaker = '', searchQuery = '';
  const checked = new Set();

  function getFiltered() {
    let items = allProducts;
    if (filterPartner) items = items.filter(p => (p.provider_company_code || p.partner_code) === filterPartner);
    if (filterStatus) items = items.filter(p => p.vehicle_status === filterStatus);
    if (filterType) items = items.filter(p => p.product_type === filterType);
    if (filterMaker) items = items.filter(p => p.maker === filterMaker);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(p => (p.car_number || '').toLowerCase().includes(q) || (p.model_name || '').toLowerCase().includes(q));
    }
    return items;
  }

  function renderFilterSelects() {
    const pMap = getPartnerNameMap();
    const sets = { partner: new Set(), status: new Set(), type: new Set(), maker: new Set() };
    allProducts.forEach(p => {
      const pc = p.provider_company_code || p.partner_code;
      if (pc) sets.partner.add(pc);
      if (p.vehicle_status) sets.status.add(p.vehicle_status);
      if (p.product_type) sets.type.add(p.product_type);
      if (p.maker) sets.maker.add(p.maker);
    });

    const fill = (id, label, values, nameFn) => {
      const el = document.getElementById(id);
      if (!el) return;
      const prev = el.value;
      const sorted = [...values].sort();
      el.innerHTML = `<option value="">${label}</option>` + sorted.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(nameFn ? nameFn(v) : v)}</option>`).join('');
      if (prev && sorted.includes(prev)) el.value = prev;
    };
    fill('adminStockPartner', '전체 파트너', sets.partner, c => `${c} / ${pMap.get(c) || c}`);
    fill('adminStockStatus', '전체 차량상태', sets.status);
    fill('adminStockType', '전체 상품구분', sets.type);
    fill('adminStockMaker', '전체 제조사', sets.maker);
  }

  function renderList() {
    const container = document.getElementById('adminStockList');
    const countEl = document.getElementById('adminStockCount');
    if (!container) return;
    const items = getFiltered();
    if (countEl) countEl.textContent = items.length ? `${items.length}대` : '';
    if (!items.length) {
      container.innerHTML = '<div class="list-empty" style="padding:40px;text-align:center;color:#94a3b8;">등록된 재고가 없습니다.</div>';
      return;
    }
    container.innerHTML = `<table class="pls-table" style="min-width:800px;"><thead><tr>
      <th style="width:40px;text-align:center;"><input type="checkbox" id="adminStockCheckAll"></th>
      <th>공급사</th><th>차량번호</th><th>제조사</th><th>모델명</th><th>세부모델</th><th>상품구분</th><th>차량상태</th>
    </tr></thead><tbody>${items.map(p => {
      const key = p.product_uid || p.product_code || p._key || '';
      return `<tr><td style="text-align:center;"><input type="checkbox" class="stock-check" data-key="${escapeHtml(key)}"${checked.has(key) ? ' checked' : ''}></td>
        <td>${escapeHtml(p.provider_company_code || p.partner_code || '')}</td>
        <td>${escapeHtml(p.car_number || '')}</td>
        <td>${escapeHtml(p.maker || '')}</td>
        <td>${escapeHtml(p.model_name || '')}</td>
        <td>${escapeHtml(String(p.sub_model || '').replace(/20(\d{2})~/g, '$1~'))}</td>
        <td>${escapeHtml(p.product_type || '')}</td>
        <td>${escapeHtml(p.vehicle_status || '')}</td></tr>`;
    }).join('')}</tbody></table>`;
    const hc = document.getElementById('adminStockCheckAll');
    if (hc) hc.checked = items.length > 0 && items.every(p => checked.has(p.product_uid || p.product_code || p._key || ''));
  }

  function bind() {
    const container = document.getElementById('adminStockList');
    const onFilterChange = () => {
      filterPartner = document.getElementById('adminStockPartner')?.value || '';
      filterStatus = document.getElementById('adminStockStatus')?.value || '';
      filterType = document.getElementById('adminStockType')?.value || '';
      filterMaker = document.getElementById('adminStockMaker')?.value || '';
      checked.clear();
      renderList();
    };
    ['adminStockPartner','adminStockStatus','adminStockType','adminStockMaker'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', onFilterChange);
    });
    let _searchTimer = 0;
    document.getElementById('adminStockSearch')?.addEventListener('input', (e) => {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => { searchQuery = e.target.value.trim(); checked.clear(); renderList(); }, 200);
    });

    container?.addEventListener('change', (e) => {
      const input = e.target.closest('.stock-check');
      if (input) {
        if (input.checked) checked.add(input.dataset.key); else checked.delete(input.dataset.key);
        const hc = document.getElementById('adminStockCheckAll');
        const items = getFiltered();
        if (hc) hc.checked = items.length > 0 && items.every(p => checked.has(p.product_uid || p.product_code || p._key || ''));
        return;
      }
      if (e.target.id === 'adminStockCheckAll') {
        const items = getFiltered();
        if (e.target.checked) items.forEach(p => checked.add(p.product_uid || p.product_code || p._key || ''));
        else items.forEach(p => checked.delete(p.product_uid || p.product_code || p._key || ''));
        renderList();
      }
    });

    document.getElementById('adminStockSelectAll')?.addEventListener('click', () => {
      getFiltered().forEach(p => checked.add(p.product_uid || p.product_code || p._key || ''));
      renderList();
    });
    document.getElementById('adminStockDeselectAll')?.addEventListener('click', () => { checked.clear(); renderList(); });
    document.getElementById('adminStockDeleteSelected')?.addEventListener('click', async () => {
      if (!checked.size) { showToast('삭제할 차량을 선택하세요.', 'error'); return; }
      if (!await showConfirm(`선택한 ${checked.size}대의 재고를 삭제할까요?\n\n삭제된 재고는 복구할 수 없습니다.`)) return;
      const { deleteProduct } = await import('../../firebase/firebase-db.js');
      let deleted = 0;
      for (const key of checked) { try { await deleteProduct(key); deleted++; } catch (e) { console.warn('삭제 실패', key, e); } }
      checked.clear();
      showToast(`${deleted}대 삭제 완료`, 'success');
    });
  }

  function setData(items) { allProducts = items.filter(p => p.status !== 'deleted'); }
  function onTabEnter() { renderFilterSelects(); renderList(); }

  return { bind, setData, onTabEnter, renderFilterSelects, renderList };
}
