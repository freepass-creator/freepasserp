import { formatMileageSummary, formatShortDate, safeText } from '../../core/management-format.js';
import { renderManagementSummaryList, summaryDate, summaryHtml, summaryStrong, summaryText } from '../../core/management-list.js';

export function buildProductSummaryRow(product, { selected = false, badgesHtml = '' } = {}) {
  const vehicleClass = safeText(product?.vehicle_class, '');
  return {
    selected,
    lines: [[
      summaryText(product?.partner_code || product?.provider_company_code),
      summaryHtml(badgesHtml, { tone: 'badges', className: 'summary-inline-badges' }),
      summaryStrong(safeText(product?.car_number)),
      summaryText(safeText(product?.sub_model), { className: 'summary-inline-truncate' }),
      vehicleClass ? summaryText(vehicleClass) : null,
      summaryText(safeText(product?.fuel_type)),
      summaryText(formatMileageSummary(product?.mileage)),
      summaryDate(formatShortDate(product?.updated_at || product?.created_at))
    ]],
    extraClassName: selected ? 'ui-selected' : ''
  };
}

export function renderProductSummaryList(options = {}) {
  const {
    container,
    products = [],
    selectedCode = '',
    buildBadges,
    onSelect,
    emptyText = '등록된 상품이 없습니다.'
  } = options;

  renderManagementSummaryList({
    container,
    items: products,
    emptyText,
    selectedKey: selectedCode,
    getKey: (item) => item?.product_uid || item?.product_code || '',
    onSelect,
    buildRow: (item, context) => buildProductSummaryRow(item, {
      selected: context.selected,
      badgesHtml: typeof buildBadges === 'function' ? buildBadges(item) : ''
    })
  });
}
