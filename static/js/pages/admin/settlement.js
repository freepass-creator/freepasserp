import { renderBadge } from '../../shared/badge.js';
import { renderTableGrid } from '../../core/management-list.js';
import { escapeHtml, formatShortDate } from '../../core/management-format.js';
import { showToast } from '../../core/toast.js';

function prevYearMonth() {
  const d = new Date(); d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function fmtMoney(v) { return Number(v || 0).toLocaleString('ko-KR'); }
function fmtDate(v) {
  const d = new Date(Number(v || 0));
  if (Number.isNaN(d.getTime()) || d.getTime() <= 0) return '-';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function stlPartner(s)     { return s.partner_code || s.partner_code_snapshot || '-'; }
function stlChannel(s)     { return s.agent_channel_code_snapshot || s.agent_channel_code || s.agent_company_code || '-'; }
function stlAgent(s)       { return s.agent_code_snapshot || s.agent_code || '-'; }
function stlFee(s)         { return Number(s.fee_amount || s.origin_fee_amount || 0); }
function stlModel(s)       { return s.model_name || s.model_name_snapshot || s.sub_model_snapshot || s.vehicle_name || ''; }
function stlCar(s)         { return s.car_number || s.car_number_snapshot || ''; }
function stlCustomer(s)    { return s.customer_name || s.customer_name_snapshot || ''; }
function stlStatus(s)      { return s.settlement_status || s.status || '정산대기'; }

export function createSettlementController({ getPartnerNameMap, getProductTypeMap }) {
  let allSettlements = [];
  let filterYear = '', filterMonth = '', filterPartner = '', filterChannel = '', filterAgent = '';

  function stlPartnerName(s) { const c = stlPartner(s); return getPartnerNameMap().get(c) || c; }
  function stlPtype(s) { return getProductTypeMap().get(stlCar(s)) || '-'; }

  function getStlItemMonth(s) {
    const ts = s.completed_at || s.settled_at || s.created_at || 0;
    const d = new Date(Number(ts));
    if (!ts || isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function getFiltered() {
    let items = allSettlements;
    if (filterYear) items = items.filter(s => getStlItemMonth(s).startsWith(filterYear));
    if (filterMonth) {
      const ym = filterYear ? `${filterYear}-${filterMonth}` : '';
      if (ym) items = items.filter(s => getStlItemMonth(s) === ym);
    }
    if (filterPartner) items = items.filter(s => stlPartner(s) === filterPartner);
    if (filterChannel) items = items.filter(s => stlChannel(s) === filterChannel);
    if (filterAgent) items = items.filter(s => stlAgent(s) === filterAgent);
    return items;
  }

  const COLS = [
    { key: 'status',   label: '정산상태',   align: 'c', filterable: true, w: 80 },
    { key: 'code',     label: '정산코드',   align: 'c', searchable: true  },
    { key: 'partner',  label: '공급사명',   align: 'c', filterable: true  },
    { key: 'date',     label: '계약완료일', align: 'c', filterable: true  },
    { key: 'ptype',    label: '상품구분',   align: 'c', filterable: true, w: 80 },
    { key: 'car',      label: '차량번호',   align: 'c', searchable: true  },
    { key: 'model',    label: '모델명',     align: 'c', filterable: true  },
    { key: 'customer', label: '고객명',     align: 'c', searchable: true  },
    { key: 'month',    label: '계약기간',   align: 'c', filterable: true  },
    { key: 'rent',     label: '대여료',     align: 'r' },
    { key: 'deposit',  label: '보증금',     align: 'r' },
    { key: 'fee',      label: '수수료',     align: 'r' },
    { key: 'channel',  label: '영업채널',   align: 'c', filterable: true  },
    { key: 'agent',    label: '영업자',     align: 'c', filterable: true  },
  ];

  function renderList() {
    const thead = document.getElementById('adminStlHead');
    const tbody = document.getElementById('adminStlList');
    const countEl = document.getElementById('adminStlCount');
    if (!tbody) return;
    const items = getFiltered();
    if (countEl) countEl.textContent = items.length ? `${items.length}건` : '';
    renderTableGrid({
      thead, tbody, columns: COLS, items,
      emptyText: '조건에 맞는 정산 내역이 없습니다.',
      getKey: s => s.id || s.settlement_code,
      getCellValue: (col, s) => {
        switch (col.key) {
          case 'code':     return escapeHtml(s.settlement_code || s.contract_code || '-');
          case 'status':   return renderBadge('settlement_status', stlStatus(s));
          case 'partner':  return escapeHtml(stlPartnerName(s));
          case 'date':     return escapeHtml(formatShortDate(s.completed_at));
          case 'ptype':    return renderBadge('product_type', stlPtype(s));
          case 'car':      return escapeHtml(stlCar(s));
          case 'model':    return escapeHtml(stlModel(s));
          case 'customer': return escapeHtml(stlCustomer(s));
          case 'month':    return escapeHtml(s.rent_month ? `${s.rent_month}개월` : '-');
          case 'rent':     return escapeHtml(fmtMoney(Number(s.rent_amount || 0)));
          case 'deposit':  return escapeHtml(fmtMoney(Number(s.deposit_amount || 0)));
          case 'fee':      return escapeHtml(fmtMoney(stlFee(s)));
          case 'channel':  return escapeHtml(stlChannel(s));
          case 'agent':    return escapeHtml(stlAgent(s));
          default: return '';
        }
      },
      getCellText: (col, s) => {
        switch (col.key) {
          case 'status':  return stlStatus(s);
          case 'partner': return stlPartnerName(s);
          case 'date':    return formatShortDate(s.completed_at);
          case 'ptype':   return stlPtype(s);
          case 'model':   return stlModel(s);
          case 'month':   return s.rent_month ? `${s.rent_month}개월` : '-';
          case 'channel': return stlChannel(s);
          case 'agent':   return stlAgent(s);
          default: return '';
        }
      },
    });
  }

  function renderFilterSelects() {
    const yearEl = document.getElementById('adminStlYear');
    const monthEl = document.getElementById('adminStlMonth');
    const partnerEl = document.getElementById('adminStlPartner');
    const channelEl = document.getElementById('adminStlChannel');
    const agentEl = document.getElementById('adminStlAgent');
    const pMap = getPartnerNameMap();

    if (yearEl) {
      const years = [...new Set(allSettlements.map(s => getStlItemMonth(s).split('-')[0]).filter(Boolean))].sort().reverse();
      const prev = yearEl.value;
      yearEl.innerHTML = '<option value="">전체 연도</option>' + years.map(y => `<option value="${y}">${y}년</option>`).join('');
      if (prev && years.includes(prev)) yearEl.value = prev;
      else if (!prev) { yearEl.value = prevYearMonth().split('-')[0]; filterYear = yearEl.value; }
    }
    if (monthEl) {
      const prev = monthEl.value;
      monthEl.innerHTML = '<option value="">전체 월</option>' + Array.from({ length: 12 }, (_, i) => `<option value="${String(i + 1).padStart(2, '0')}">${i + 1}월</option>`).join('');
      if (prev) monthEl.value = prev;
      else { monthEl.value = prevYearMonth().split('-')[1]; filterMonth = monthEl.value; }
    }
    if (partnerEl) {
      const codes = [...new Set(allSettlements.map(s => stlPartner(s)).filter(v => v && v !== '-'))].sort();
      const prev = partnerEl.value;
      partnerEl.innerHTML = '<option value="">전체 공급사</option>' + codes.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(pMap.get(c) || c)}</option>`).join('');
      if (prev && codes.includes(prev)) partnerEl.value = prev;
    }
    if (channelEl) {
      const codes = [...new Set(allSettlements.map(s => stlChannel(s)).filter(v => v && v !== '-'))].sort();
      const prev = channelEl.value;
      channelEl.innerHTML = '<option value="">전체 영업채널</option>' + codes.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
      if (prev && codes.includes(prev)) channelEl.value = prev;
    }
    if (agentEl) {
      const codes = [...new Set(allSettlements.map(s => stlAgent(s)).filter(v => v && v !== '-'))].sort();
      const prev = agentEl.value;
      agentEl.innerHTML = '<option value="">전체 영업자</option>' + codes.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
      if (prev && codes.includes(prev)) agentEl.value = prev;
    }
  }

  function exportCSV() {
    const items = getFiltered();
    if (!items.length) { showToast('조건에 맞는 정산 내역이 없습니다.', 'error'); return; }
    const headers = ['정산코드','정산상태','공급사명','계약완료일','상품구분','차량번호','세부모델','고객명','계약기간','대여료','보증금','수수료','영업채널','영업자'];
    const rows = items.map(s => [s.settlement_code||s.contract_code||'',stlStatus(s),stlPartnerName(s),fmtDate(s.completed_at),stlPtype(s),stlCar(s),stlModel(s),stlCustomer(s),s.rent_month?`${s.rent_month}개월`:'',Number(s.rent_amount||0),Number(s.deposit_amount||0),stlFee(s),stlChannel(s),stlAgent(s)]);
    const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `정산서_${[filterYear, filterMonth].filter(Boolean).join('-') || '전체'}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  function bind() {
    document.getElementById('adminStlExportCsv')?.addEventListener('click', exportCSV);
    const onChange = () => {
      filterYear = document.getElementById('adminStlYear')?.value || '';
      filterMonth = document.getElementById('adminStlMonth')?.value || '';
      filterPartner = document.getElementById('adminStlPartner')?.value || '';
      filterChannel = document.getElementById('adminStlChannel')?.value || '';
      filterAgent = document.getElementById('adminStlAgent')?.value || '';
      renderList();
    };
    ['adminStlYear','adminStlMonth','adminStlPartner','adminStlChannel','adminStlAgent'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', onChange);
    });
  }

  function setData(items) { allSettlements = items; }
  function onTabEnter() { renderFilterSelects(); renderList(); }

  return { bind, setData, onTabEnter, renderFilterSelects, renderList };
}
