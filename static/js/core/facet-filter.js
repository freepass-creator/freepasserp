/**
 * createFacetedFilter — 패싯(하위 의존성) 필터 유틸리티
 *
 * 사용법:
 *   const filter = createFacetedFilter([
 *     { key: 'status', label: '상태', getValue: item => item.status },
 *     { key: 'partner', label: '공급사', getValue: item => item.partner_code },
 *   ]);
 *
 *   // 렌더
 *   filter.bind(barEl, () => renderList());
 *   filter.render(barEl, allItems);   // allItems = 역할 필터 적용 후 전체
 *
 *   // 필터 적용
 *   const visible = allItems.filter(item => filter.passes(item));
 */
export function createFacetedFilter(schema) {
  const active = Object.fromEntries(schema.map(d => [d.key, new Set()]));

  /** 아이템이 모든 활성 필터를 통과하는지 */
  function passes(item) {
    return schema.every(d => {
      if (!active[d.key].size) return true;
      return active[d.key].has(String(d.getValue(item) || ''));
    });
  }

  /** 아이템이 특정 차원(skipKey)을 제외한 나머지 필터를 통과하는지 */
  function passesExcept(item, skipKey) {
    return schema.every(d => {
      if (d.key === skipKey) return true;
      if (!active[d.key].size) return true;
      return active[d.key].has(String(d.getValue(item) || ''));
    });
  }

  /**
   * 특정 차원의 선택 가능한 옵션 목록을 패싯 카운팅으로 반환
   * — skipKey(자기 자신)를 제외한 나머지 필터 결과에서 유니크값 + 건수 추출
   */
  function getOptions(allItems, dimKey) {
    const dim = schema.find(d => d.key === dimKey);
    if (!dim) return [];
    const counts = new Map();
    allItems.forEach(item => {
      if (!passesExcept(item, dimKey)) return;
      const v = String(dim.getValue(item) || '');
      if (!v) return;
      counts.set(v, (counts.get(v) || 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'ko'))
      .map(([value, count]) => ({ value, count }));
  }

  function toggle(dimKey, value) {
    if (active[dimKey].has(value)) active[dimKey].delete(value);
    else active[dimKey].add(value);
  }

  function reset() {
    schema.forEach(d => { active[d.key] = new Set(); });
  }

  function hasActive() {
    return schema.some(d => active[d.key].size > 0);
  }

  function esc(v) {
    return String(v)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  /**
   * container에 필터 바를 렌더링한다.
   * allItems: 역할 기반으로 먼저 걸러진 항목 전체 (패싯 카운트 기준)
   */
  function render(container, allItems) {
    if (!container) return;
    let html = '';
    let hasAny = false;
    schema.forEach(dim => {
      const options = getOptions(allItems, dim.key);
      if (!options.length) return;
      const chips = options.map(({ value, count }) => {
        const isActive = active[dim.key].has(value);
        if (!isActive && count === 0) return '';
        return `<button class="facet-chip${isActive ? ' is-active' : ''}" data-facet-dim="${esc(dim.key)}" data-facet-val="${esc(value)}" type="button">${esc(value)}<span class="facet-count">${count}</span></button>`;
      }).join('');
      if (!chips) return;
      hasAny = true;
      html += `<div class="facet-group"><span class="facet-label">${esc(dim.label)}</span><div class="facet-chips">${chips}</div></div>`;
    });
    if (!hasAny) { container.hidden = true; container.innerHTML = ''; return; }
    if (hasActive()) html += `<button class="facet-reset" type="button">초기화</button>`;
    container.hidden = false;
    container.innerHTML = html;
  }

  /**
   * container에 클릭 이벤트를 바인딩한다. (한 번만 호출)
   * onChange: 필터 상태 변경 시 호출할 콜백 (보통 renderList)
   */
  function bind(container, onChange) {
    if (!container) return;
    container.addEventListener('click', (e) => {
      const chip = e.target.closest('.facet-chip');
      if (chip) {
        toggle(chip.dataset.facetDim, chip.dataset.facetVal);
        onChange();
        return;
      }
      if (e.target.closest('.facet-reset')) {
        reset();
        onChange();
      }
    });
  }

  return { passes, passesExcept, getOptions, toggle, reset, hasActive, render, bind, active };
}
