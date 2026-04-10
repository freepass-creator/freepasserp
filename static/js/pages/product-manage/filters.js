export function createProductFilterController(deps = {}) {
  const {
    escapeHtml,
    safeText,
    filterGroups = [],
    filterOverlay,
    filterSearchInput,
    filterAccordion,
    getAllProducts,
    onFilteredProductsChanged,
    getProductFilterFieldValue
  } = deps;

  const filterState = {
    search: '',
    values: Object.fromEntries(filterGroups.map((group) => [group.key, new Set()])),
    openGroups: Object.fromEntries(filterGroups.map((group) => [group.key, !!group.open]))
  };

  function getFilterGroupOptions(key) {
    // count 내림차순 — 많은 값이 위
    const counts = new Map();
    getAllProducts().forEach(product => {
      const v = safeText(getProductFilterFieldValue(product, key), '');
      if (v) counts.set(v, (counts.get(v) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
  }

  function isProductMatched(product) {
    const search = String(filterState.search || '').trim().toLowerCase();
    if (search) {
      const haystack = [
        product.product_code,
        product.car_number,
        product.partner_code,
        product.provider_company_code,
        product.maker,
        product.sub_model,
        product.ext_color,
        product.int_color,
        product.fuel_type,
        product.vehicle_class
      ].map((value) => String(value || '').toLowerCase());
      if (!haystack.some((value) => value.includes(search))) return false;
    }

    return filterGroups.every((group) => {
      const selected = filterState.values[group.key];
      if (!selected || !selected.size) return true;
      return selected.has(safeText(getProductFilterFieldValue(product, group.key)));
    });
  }

  function getFilteredProducts() {
    return getAllProducts().filter(isProductMatched);
  }

  function renderFilteredList() {
    onFilteredProductsChanged?.(getFilteredProducts());
  }

  function setFilterOverlay(open) {
    if (!filterOverlay) return;
    filterOverlay.classList.toggle('is-open', !!open);
    filterOverlay.setAttribute('aria-hidden', String(!open));
  }

  function toggleFilterValue(key, value, checked) {
    if (!filterState.values[key]) filterState.values[key] = new Set();
    if (checked) filterState.values[key].add(value);
    else filterState.values[key].delete(value);
  }

  function renderFilterAccordion() {
    if (!filterAccordion) return;

    const groupsHtml = filterGroups.map((group) => {
      const options = getFilterGroupOptions(group.key);
      const selected = filterState.values[group.key] || new Set();
      const bodyHtml = options.length
        ? options.map((option) => {
            const checked = selected.has(option) ? 'checked' : '';
            const safeId = `${group.key}-${option}`.replace(/[^a-zA-Z0-9_-]/g, '_');
            const count = getAllProducts().filter((product) => safeText(getProductFilterFieldValue(product, group.key)) === option).length;
            return `
              <label class="filter-option" for="${escapeHtml(safeId)}">
                <span class="filter-check">
                  <input type="checkbox" id="${escapeHtml(safeId)}" data-filter-key="${escapeHtml(group.key)}" value="${escapeHtml(option)}" ${checked}>
                  <span>${escapeHtml(option)}</span>
                </span>
                <span class="filter-count">${count}</span>
              </label>
            `;
          }).join('')
        : '<div class="product-manage-filter-empty">선택 가능한 값이 없습니다.</div>';

      return `
        <div class="filter-group ${filterState.openGroups[group.key] ? 'is-open' : ''}" data-filter-group="${escapeHtml(group.key)}">
          <button type="button" class="filter-group-head" data-filter-toggle="${escapeHtml(group.key)}">
            <span class="filter-group-title">${escapeHtml(group.title)}</span>
            <span class="filter-group-caret">${filterState.openGroups[group.key] ? '접기' : '열기'}</span>
          </button>
          <div class="filter-group-body" ${filterState.openGroups[group.key] ? '' : 'hidden'}>
            ${bodyHtml}
          </div>
        </div>
      `;
    }).join('');

    filterAccordion.innerHTML = groupsHtml;

    filterAccordion.querySelectorAll('[data-filter-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.dataset.filterToggle;
        filterState.openGroups[key] = !filterState.openGroups[key];
        renderFilterAccordion();
      });
    });

    filterAccordion.querySelectorAll('input[type="checkbox"][data-filter-key]').forEach((input) => {
      input.addEventListener('change', (event) => {
        const target = event.currentTarget;
        toggleFilterValue(target.dataset.filterKey, target.value, target.checked);
        renderFilteredList();
      });
    });
  }

  function resetFilters() {
    filterState.search = '';
    filterGroups.forEach((group) => {
      filterState.values[group.key] = new Set();
    });
    if (filterSearchInput) filterSearchInput.value = '';
    renderFilterAccordion();
    renderFilteredList();
  }

  function bindSearchInput() {
    filterSearchInput?.addEventListener('input', (event) => {
      filterState.search = String(event.currentTarget?.value || '').trim();
      renderFilteredList();
    });
  }

  return {
    filterState,
    setFilterOverlay,
    renderFilterAccordion,
    renderFilteredList,
    resetFilters,
    bindSearchInput,
    getFilteredProducts
  };
}
