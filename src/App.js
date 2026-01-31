import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, X, RefreshCw, Download, Car, Shield, 
  FileText, User, CreditCard, ExternalLink, Database,
  ChevronRight, CheckCircle2, Copy, Filter,
  ArrowUpDown, ArrowUp, ArrowDown, Calendar, 
  Banknote, Coins, Gauge, History, Lock, Clock, CalendarDays,
  Info, Sparkles, AlertCircle, Phone, Wrench, Share2
} from 'lucide-react';

// [1] 구글 시트 웹 게시 URL
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vREzDg6YIAoZBiSeT58g6sksXFZkILyX0hKJeuQIdfKxWDRgu7SX7epVkuKMjXvp8n10-sNCoWRyJdJ/pub?gid=1259006970&single=true&output=csv";

// --- 필터용 옵션 데이터 (오류 수정용) ---
const rentalOptions = ['50만 이하', '50~60', '60~70', '70~80', '80~90', '90~100', '100만 이상'];
const depositOptions = ['100만 이하', '100~200', '200~300', '300~400', '400~500', '500만 이상'];
const mileageOptions = ['1만km 미만', '1~3만', '3~5만', '5~10만', '10만km 이상'];
const yearOptions = ['1년 미만', '1~2년', '2~3년', '3~4년', '4~5년', '5년 이상'];

// --- 커스텀 공통 컴포넌트 ---

const StatusBadge = ({ text, type }) => {
  if (!text) return null;
  let colorClass = "bg-slate-100 text-slate-600 border-slate-200";
  if (type === '구분') {
    if (text === '신차') colorClass = "bg-blue-50 text-blue-700 border-blue-100";
    else if (text === '중고') colorClass = "bg-slate-100 text-slate-700 border-slate-200";
  } else if (type === '상태' || type === '세부상태') {
    const t = String(text);
    if (t.includes('가능') || t === '출고가능' || t === '정상') colorClass = "bg-emerald-50 text-emerald-700 border-emerald-100";
    else if (t.includes('완료') || t.includes('불가')) colorClass = "bg-rose-50 text-rose-700 border-rose-100";
    else colorClass = "bg-amber-50 text-amber-700 border-amber-100";
  }
  return (
    <span className={`inline-flex items-center justify-center px-1.5 py-0.5 border text-[10px] font-black leading-none whitespace-nowrap ${colorClass}`}>
      {text}
    </span>
  );
};

const WonIcon = ({ size = 20, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 10h16M4 14h16M7 6l5 12 5-12" />
  </svg>
);

const App = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCar, setSelectedCar] = useState(null);
  const [showAccount, setShowAccount] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [copyLinkFeedback, setCopyLinkFeedback] = useState(false);
  
  // 담당자 정보 상태 (로컬 스토리지 연동)
  const [managerInfo, setManagerInfo] = useState({
    company: localStorage.getItem('erp_manager_company') || '',
    nameTitle: localStorage.getItem('erp_manager_nameTitle') || '',
    phone: localStorage.getItem('erp_manager_phone') || '',
    includeAccount: localStorage.getItem('erp_manager_includeAcc') === 'true'
  });

  const [selectedPeriods, setSelectedPeriods] = useState(['24M']); 
  const [columnFilters, setColumnFilters] = useState({}); 
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' }); 
  
  const [sidebarFilters, setSidebarFilters] = useState({
    rental: [], deposit: [], mileage: [], year: []
  });
  
  const [activeFilterColumn, setActiveFilterColumn] = useState(null); 
  const [activeSidebarPopup, setActiveSidebarPopup] = useState(null); 
  
  const filterRef = useRef(null);
  const sidebarPopupRef = useRef(null);

  // --- 핵심 유틸리티 함수 ---

  const parseNum = (str) => {
    const val = parseInt(String(str).replace(/[^0-9]/g, ''));
    return isNaN(val) ? 0 : val;
  };

  const formatPrice = (val) => {
    const num = parseNum(val);
    return num.toLocaleString();
  };

  const formatPeriod = (p) => {
    if (!p) return "";
    return p.replace('M', '개월');
  };

  // --- 인터랙션 함수 정의 ---

  const togglePeriod = (p) => {
    setSelectedPeriods(prev => {
      const periodsOrder = ['6M', '12M', '24M', '36M', '48M', '60M'];
      const next = prev.includes(p) ? (prev.length > 1 ? prev.filter(x => x !== p) : prev) : [...prev, p];
      return next.sort((a, b) => periodsOrder.indexOf(a) - periodsOrder.indexOf(b));
    });
  };

  const toggleSidebarFilter = (key, value) => {
    setSidebarFilters(prev => {
      const current = prev[key];
      const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
      return { ...prev, [key]: next };
    });
  };

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    else if (sortConfig.key === key && sortConfig.direction === 'desc') key = null;
    setSortConfig({ key, direction });
  };

  const handleCarClick = (car) => {
    if (selectedCar && selectedCar.차량_번호 === car.차량_번호) {
      setSelectedCar(null);
    } else {
      setSelectedCar(car);
      setCopyFeedback(false);
      setCopyLinkFeedback(false);
    }
  };

  const downloadTemplate = () => {
    const tableHeaders = ["상태", "구분", "차량번호", "제조사", "모델", "세부모델", "세부트림(선택옵션)", "외부색상", "내부색상", "주행거리", "대여료", "보증금"];
    const csvContent = "\uFEFF" + tableHeaders.join(",");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.setAttribute("download", "매물리스트_양식.csv"); link.click();
  };

  const handleCopySummary = () => {
    if (!selectedCar) return;
    
    let text = `[상품 상세 정보]\n\n`;
    text += `1. 차량 상세 제원\n`;
    text += `■ 차량번호: ${selectedCar.차량_번호} (${selectedCar.차량_구분}/${selectedCar.차량_상태})\n`;
    text += `■ 모델명: ${selectedCar.차량_제조사} ${selectedCar.차량_모델명} ${selectedCar.차량_세부모델}\n`;
    text += `■ 세부트림: ${selectedCar.차량_세부트림}\n`;
    text += `■ 선택옵션: ${selectedCar.차량_선택옵션 || '기본 사양'}\n`;
    text += `■ 주요제원: ${selectedCar.차량_연료 || '-'} / ${selectedCar.차량_배기량 ? formatPrice(selectedCar.차량_배기량) + 'cc' : '-'} / ${formatPrice(selectedCar.차량_현재주행거리)}km\n`;
    text += `■ 색상(내/외): ${selectedCar.차량_내부색상} / ${selectedCar.차량_외부색상}\n`;
    text += `■ 실물사진확인: ${selectedCar.차량_사진링크 || '링크 정보 없음'}\n\n`;

    text += `2. 대여료 및 보증금 안내 (부가세 포함)\n`;
    ['6M', '12M', '24M', '36M', '48M', '60M'].forEach(m => {
      const fee = selectedCar[`금액_대여료_${m}`];
      const dep = selectedCar[`금액_보증금_${m}`];
      if (fee && fee !== '-' && fee !== '0' && fee !== '0원') {
        text += `■ ${formatPeriod(m)}: 월 대여료 ${fee} / 보증금 ${dep}\n`;
      }
    });
    text += `\n`;

    text += `3. 보험 보상 상세\n`;
    text += `■ 대인배상: ${selectedCar.보험_대인 || '무한'} (면책금: ${selectedCar.보험_대인면책금 || '0원'})\n`;
    text += `■ 대물배상: ${selectedCar.보험_대물 || '1억원'} (면책금: ${selectedCar.보험_대물면책금 || '10만'})\n`;
    text += `■ 자기신체(자손): ${selectedCar.보험_자손 || '3천만'} (면책금: ${selectedCar.보험_자손면책금 || '없음'})\n`;
    text += `■ 무보험차 상해: ${selectedCar.보험_무보험 || '2억원'} (면책금: ${selectedCar.보험_무보험면책금 || '없음'})\n`;
    text += `■ 자기차량(자차): 차량가액 한도 (면책금: 수리비 20%, ${selectedCar.보험_최소면책금 || '20만'}~${selectedCar.보험_최대면책금 || '50만'})\n`;
    text += `■ 긴급출동: 연 5회 제공\n\n`;

    text += `4. 계약 및 추가 비용 조건\n`;
    text += `■ 기본연령: ${selectedCar.계약_기본운전연령 || '만 26세 이상'}\n`;
    text += `■ 약정거리: ${selectedCar.계약_약정주행거리 || '2만km'}\n`;
    text += `■ 연령 하향(+): 만 21세(${formatPrice(selectedCar.계약_21세추가금)}원), 만 23세(${formatPrice(selectedCar.계약_23세추가금)}원)\n`;
    text += `■ 거리 추가(+): 1만km당 ${formatPrice(selectedCar.계약_주행거리추가금)}원/월\n\n`;

    text += `5. 담당자 정보\n`;
    text += `■ 소속/담당: ${managerInfo.company || '-'} ${managerInfo.nameTitle || '-'}\n`;
    text += `■ 연락처: ${managerInfo.phone || '-'}\n`;
    if (managerInfo.includeAccount) {
      text += `■ 입금계좌: ${selectedCar.계약_입금계좌번호 || '계좌 정보 미등록'} (우리은행/프레패스)\n`;
    }
    text += `\n* 본 정보는 내부 전산 데이터로 실시간 재고 상황에 따라 변동될 수 있습니다.`;

    const textArea = document.createElement("textarea");
    textArea.value = text; document.body.appendChild(textArea); textArea.select();
    try { 
      document.execCommand('copy'); 
      setCopyFeedback(true); 
      setTimeout(() => setCopyFeedback(false), 2000); 
    } catch (err) {}
    document.body.removeChild(textArea);
  };

  const handleCopyLink = () => {
    if (!selectedCar) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?car=${selectedCar.차량_번호}`;
    const textArea = document.createElement("textarea");
    textArea.value = shareUrl; document.body.appendChild(textArea); textArea.select();
    try { 
      document.execCommand('copy'); 
      setCopyLinkFeedback(true); 
      setTimeout(() => setCopyLinkFeedback(false), 2000); 
    } catch (err) {}
    document.body.removeChild(textArea);
  };

  // --- 데이터 수명 주기 ---

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${CSV_URL}&cachebust=${Date.now()}`);
      if (!response.ok) throw new Error("데이터 연동 실패");
      const text = await response.text();
      const rows = text.split(/\r?\n/).filter(r => r.trim());
      if (rows.length === 0) { setData([]); setLoading(false); return; }
      const headers = rows[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const jsonData = rows.slice(1).map(row => {
        const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
        const values = row.split(regex).map(v => v ? v.trim().replace(/^"|"$/g, '').replace(/""/g, '"') : "");
        return headers.reduce((obj, header, i) => { obj[header] = values[i] || ""; return obj; }, {});
      });
      setData(jsonData);
      setLoading(false);
    } catch (e) { console.error(e.message); setLoading(false); }
  };

  useEffect(() => { 
    fetchData(); 
  }, []);

  useEffect(() => {
    localStorage.setItem('erp_manager_company', managerInfo.company);
    localStorage.setItem('erp_manager_nameTitle', managerInfo.nameTitle);
    localStorage.setItem('erp_manager_phone', managerInfo.phone);
    localStorage.setItem('erp_manager_includeAcc', managerInfo.includeAccount);
  }, [managerInfo]);

  const filteredAndSortedData = useMemo(() => {
    let result = data.filter(item => {
      const matchesSearch = Object.values(item).some(v => String(v).toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesColumnFilters = Object.entries(columnFilters).every(([col, selectedValues]) => {
        if (!selectedValues || selectedValues.length === 0) return true;
        return selectedValues.includes(String(item[col]));
      });
      let matchesRental = true;
      if (sidebarFilters.rental.length > 0) {
        const periodKey = `금액_대여료_${selectedPeriods[0] || '24M'}`;
        const val = parseNum(item[periodKey]);
        matchesRental = sidebarFilters.rental.some(range => {
          if (range === '50만 이하') return val <= 500000;
          if (range === '100만 이상') return val >= 1000000;
          const [low, high] = range.split('~').map(s => parseInt(s) * 10000);
          return val >= low && val < high;
        });
      }
      let matchesDeposit = true;
      if (sidebarFilters.deposit.length > 0) {
        const periodKey = `금액_보증금_${selectedPeriods[0] || '24M'}`;
        const val = parseNum(item[periodKey]);
        matchesDeposit = sidebarFilters.deposit.some(range => {
          if (range === '100만 이하') return val <= 1000000;
          if (range === '500만 이상') return val >= 5000000;
          const [low, high] = range.split('~').map(s => parseInt(s) * 10000);
          return val >= low && val < high;
        });
      }
      let matchesMileage = true;
      if (sidebarFilters.mileage.length > 0) {
        const val = parseNum(item.차량_현재주행거리);
        matchesMileage = sidebarFilters.mileage.some(range => {
          if (range === '1만km 미만') return val < 10000;
          if (range === '10만km 이상') return val >= 100000;
          if (range === '1~3만') return val >= 10000 && val < 30000;
          if (range === '3~5만') return val >= 30000 && val < 50000;
          if (range === '5~10만') return val >= 50000 && val < 100000;
          return false;
        });
      }
      let matchesYear = true;
      if (sidebarFilters.year.length > 0) {
        const regYear = parseInt(String(item.차량_최초등록일).substring(0, 4)) || 2025;
        const age = 2026 - regYear;
        matchesYear = sidebarFilters.year.some(range => {
          if (range === '1년 미만') return age < 1;
          if (range === '5년 이상') return age >= 5;
          const [low, high] = range.replace('년', '').split('~').map(Number);
          return age >= low && age < high;
        });
      }
      return matchesSearch && matchesColumnFilters && matchesRental && matchesDeposit && matchesMileage && matchesYear;
    });

    if (sortConfig.key) {
      result.sort((a, b) => {
        let aVal = a[sortConfig.key] || "";
        let bVal = b[sortConfig.key] || "";
        if (sortConfig.key === '차량_현재주행거리' || sortConfig.key.includes('금액')) {
          aVal = parseNum(aVal); bVal = parseNum(bVal);
        }
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [searchTerm, data, columnFilters, sortConfig, sidebarFilters, selectedPeriods]);

  const baseColumns = { "상태": "차량_상태", "구분": "차량_구분", "차량번호": "차량_번호", "제조사": "차량_제조사", "모델": "차량_모델명", "세부모델": "차량_세부모델", "세부트림(선택옵션)": "차량_세부트림", "외부색상": "차량_외부색상", "내부색상": "차량_내부색상", "주행거리": "차량_현재주행거리" };
  const sortableColumns = ["주행거리"];
  const filterableColumns = ["상태", "구분", "제조사", "모델", "세부모델", "외부색상", "내부색상"];

  return (
    <div className="flex h-screen bg-[#f1f3f6] text-slate-900 overflow-hidden rounded-none font-sans select-none border-none text-[11px]">
      <style>{`
        @keyframes drawerAppear { 0% { transform: translateX(100%); opacity: 0; } 100% { transform: translateX(0); opacity: 1; } }
        .animate-drawer-reset { animation: drawerAppear 0.3s cubic-bezier(0.1, 0.9, 0.2, 1) forwards; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
      
      {/* --- 좌측 필터바 --- */}
      <div className="w-[68px] bg-white flex flex-col z-[60] flex-shrink-0 border-r border-slate-200 relative shadow-sm font-sans">
        <div className="mt-[80px] flex flex-col items-center gap-1 px-1">
          {[
            { id: 'period', icon: <div className="flex flex-col items-center justify-center -space-y-0.5"><CalendarDays size={18}/><span className="text-[7px] font-black leading-none mt-0.5 uppercase">6-60M</span></div>, label: '기간' },
            { id: 'rental', icon: <WonIcon size={20} />, label: '대여료' },
            { id: 'deposit', icon: <Lock size={19} />, label: '보증금' },
            { id: 'mileage', icon: <div className="font-black text-base uppercase">Km</div>, label: '거리' },
            { id: 'year', icon: <div className="flex flex-col items-center justify-center -space-y-0.5"><History size={18}/><span className="text-[7px] font-black uppercase mt-0.5">YEAR</span></div>, label: '연식' }
          ].map((btn, index) => {
            const isActive = activeSidebarPopup === btn.id;
            const isFiltered = btn.id === 'period' ? selectedPeriods.length > 0 : sidebarFilters[btn.id]?.length > 0;
            const isBottomAligned = index >= 3; 
            return (
              <div key={btn.id} className="relative w-full">
                <button onClick={() => setActiveSidebarPopup(isActive ? null : btn.id)} className={`w-full aspect-square flex flex-col items-center justify-center gap-1 sidebar-toggle-btn transition-all duration-200 rounded-none mb-1 relative ${isActive ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                  <div className={isFiltered ? 'text-blue-600' : 'text-slate-400'}>{btn.icon}</div>
                  <span className={`text-[9px] tracking-tighter leading-none font-sans ${isFiltered ? 'text-blue-600 font-bold' : 'text-slate-500'}`}>{btn.label}</span>
                  {isFiltered && <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-blue-600 rounded-full ring-2 ring-white"></div>}
                </button>
                {isActive && (
                  <div ref={sidebarPopupRef} className={`absolute left-full ml-3 w-[180px] bg-white border border-slate-200 shadow-xl z-[70] text-left font-normal normal-case rounded-none overflow-hidden ring-1 ring-black/5 font-sans ${isBottomAligned ? 'bottom-0' : 'top-[-10px]'}`}>
                    <div className="p-2 border-b bg-slate-50 flex justify-between items-center font-sans">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">필터 선택</span>
                      <div className="flex items-center gap-2 font-sans">
                        <button onClick={() => { if (btn.id === 'period') setSelectedPeriods(['24M']); else setSidebarFilters(prev => ({...prev, [btn.id]: []})); }} className="text-[9px] text-blue-600 font-bold">초기화</button>
                        <button onClick={() => setActiveSidebarPopup(null)} className="text-slate-400 hover:text-slate-600 transition-colors p-0.5"><X size={12} /></button>
                      </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-1 hide-scrollbar font-sans">
                      {(btn.id === 'period' ? ['6M', '12M', '24M', '36M', '48M', '60M'] : 
                        btn.id === 'rental' ? rentalOptions : btn.id === 'deposit' ? depositOptions : btn.id === 'mileage' ? mileageOptions : yearOptions
                      ).map(opt => (
                        <label key={opt} className="flex items-center gap-2 p-2 hover:bg-slate-50 cursor-pointer text-[10px] rounded transition-colors group font-sans">
                          <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={btn.id === 'period' ? selectedPeriods.includes(opt) : sidebarFilters[btn.id].includes(opt)} onChange={() => btn.id === 'period' ? togglePeriod(opt) : toggleSidebarFilter(btn.id, opt)} />
                          <span className={`truncate flex-1 font-sans ${ (btn.id === 'period' ? selectedPeriods.includes(opt) : sidebarFilters[btn.id].includes(opt)) ? 'text-blue-700 font-bold' : 'text-slate-600' }`}>{opt}{btn.id === 'rental' || btn.id === 'deposit' ? (opt.includes('만') ? '' : '만원') : ''}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 relative">
        <header className="h-[50px] bg-white border-b border-slate-200 flex items-center px-4 gap-4 flex-shrink-0 z-20 shadow-sm font-sans">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 text-slate-400 font-sans" size={16} />
            <input type="text" placeholder="매물 통합 검색..." className="w-full pl-9 pr-4 py-1.5 border border-slate-300 rounded-none text-xs focus:outline-none focus:border-blue-600 bg-white font-sans font-sans" onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button onClick={downloadTemplate} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 font-bold text-[10px] hover:bg-slate-50 transition-all text-slate-600 rounded-none font-sans font-sans"><Download size={12}/> 양식다운로드</button>
            <span className="text-slate-500 text-[11px] font-medium border-l pl-3 flex items-center gap-2 font-sans font-sans"><Database size={12} className="text-slate-400 font-sans"/> 매물수: <b className="text-blue-600 font-black font-sans">{filteredAndSortedData.length}</b>건</span>
            <button onClick={fetchData} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 font-bold text-[11px] hover:bg-slate-50 active:scale-95 transition-all text-blue-600 rounded-none font-sans font-sans"><RefreshCw size={12}/> 최신화</button>
          </div>
        </header>

        <div className="flex-1 overflow-auto bg-white m-1.5 shadow-sm border border-slate-200 relative text-slate-800 font-sans">
          <table className="w-full border-collapse text-left text-[11px] table-fixed font-sans">
            <thead className="sticky top-0 bg-[#f8f9fb] border-b border-slate-300 z-40 font-bold text-slate-600 text-center uppercase tracking-tighter">
              <tr className="divide-x divide-slate-200 font-sans">
                {Object.keys(baseColumns).map((label) => {
                  const dataKey = baseColumns[label];
                  const isFiltered = columnFilters[dataKey]?.length > 0;
                  const isSorted = sortConfig.key === dataKey;
                  const canSort = sortableColumns.includes(label);
                  const canFilter = filterableColumns.includes(label);
                  const isStatusCol = label === '상태';
                  let columnWidth = label === '상태' ? "w-[65px]" : label === '구분' ? "w-[58px]" : label === '차량번호' ? "w-[100px]" : label === '제조사' ? "w-[90px]" : label === '모델' ? "w-[110px]" : label === '세부모델' ? "w-[120px]" : label === '세부트림(선택옵션)' ? "w-[160px]" : label === '외부색상' || label === '내부색상' ? "w-[85px]" : label === '주행거리' ? "w-[90px]" : "w-auto";
                  return (
                    <th key={label} className={`py-1.5 px-1 relative transition-colors font-sans font-sans ${isSorted ? 'bg-blue-100/50' : ''} ${columnWidth}`}>
                      <div className="flex flex-row items-center justify-center gap-1 leading-tight h-full relative overflow-hidden font-sans">
                        <span className={`${isFiltered || isSorted ? 'text-blue-700 font-black font-sans' : ''} ${label === '세부트림(선택옵션)' ? 'whitespace-pre-line font-sans' : 'whitespace-nowrap font-sans'} ${isStatusCol ? '' : 'truncate font-sans'}`}>{label === '세부트림(선택옵션)' ? "세부트림\n(선택옵션)" : label}</span>
                        {canFilter && (
                          <div className="relative font-sans">
                            <button onClick={(e) => { e.stopPropagation(); setActiveFilterColumn(prev => prev === dataKey ? null : dataKey); }} className={`p-0.5 rounded-none transition-colors filter-toggle-btn font-sans ${isFiltered ? 'text-blue-700 font-sans font-sans' : 'text-slate-300 hover:text-slate-600'}`}>
                              <Filter size={10} fill={isFiltered ? "currentColor" : "none"} />
                            </button>
                            {isFiltered && <div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-blue-600 rounded-full font-sans"></div>}
                          </div>
                        )}
                        {canSort && <button onClick={() => requestSort(dataKey)} className={`p-0.5 rounded-none transition-colors font-sans ${isSorted ? 'text-blue-700 font-sans font-sans' : 'text-slate-300 hover:text-slate-600 font-sans'}`}>{isSorted ? (sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />) : <ArrowUpDown size={10} />}</button>}
                      </div>
                      {canFilter && activeFilterColumn === dataKey && (
                        <div ref={filterRef} className="absolute top-full left-0 mt-1 w-52 bg-white border border-slate-200 shadow-xl z-50 text-left font-normal normal-case rounded-none ring-1 ring-black/5 font-sans font-sans">
                          <div className="p-2 border-b bg-slate-50 flex justify-between items-center font-sans">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">필터</span>
                            <div className="flex items-center gap-2">
                              <button onClick={() => setColumnFilters(p => ({...p, [dataKey]: []}))} className="text-[9px] text-blue-600 font-bold font-sans">초기화</button>
                              <button onClick={(e) => { e.stopPropagation(); setActiveFilterColumn(null); }} className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 font-sans"><X size={12} /></button>
                            </div>
                          </div>
                          <div className="max-h-60 overflow-y-auto p-1 hide-scrollbar font-sans font-sans">
                            {(() => {
                              const counts = data.reduce((acc, item) => { const val = String(item[dataKey] || "미정"); acc[val] = (acc[val] || 0) + 1; return acc; }, {});
                              const sortedOptions = Object.entries(counts).sort((a, b) => b[1] - a[1]);
                              return sortedOptions.map(([value, count]) => (
                                <label key={value} className="flex items-center gap-2 p-2 hover:bg-slate-50 cursor-pointer text-[10px] rounded transition-colors group font-sans">
                                  <input type="checkbox" className="w-3 h-3 accent-blue-600 font-sans" checked={(columnFilters[dataKey] || []).includes(value)} onChange={() => { const current = columnFilters[dataKey] || []; const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value]; setColumnFilters(prev => ({ ...prev, [dataKey]: next })); }}/>
                                  <span className="truncate flex-1 font-sans">{value}</span>
                                  <span className="text-slate-400 text-[9px] font-medium ml-auto group-hover:text-blue-600 tracking-tighter font-sans font-sans">{count}</span>
                                </label>
                              ));
                            })()}
                          </div>
                        </div>
                      )}
                    </th>
                  );
                })}
                {selectedPeriods.map(p => (
                  <th key={p} className="py-1.5 px-1 relative w-[130px] bg-blue-200/20 border-l border-blue-200 text-blue-800 font-sans font-sans">
                    <div className="flex flex-col items-center justify-center leading-tight h-full font-black">
                      <span className="text-[10px] uppercase whitespace-nowrap font-sans font-sans">{p} 대여료</span>
                      <span className="text-[9px] opacity-70 font-bold font-sans font-sans">(보증금)</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-center font-sans font-sans font-sans">
              {filteredAndSortedData.map((item, idx) => (
                <tr key={idx} onClick={() => handleCarClick(item)} className={`hover:bg-blue-50/50 cursor-pointer divide-x divide-slate-50 h-[48px] transition-colors font-sans ${selectedCar?.차량_번호 === item.차량_번호 ? 'bg-blue-50 font-bold border-l-2 border-l-blue-600' : ''}`}>
                  <td className="p-2 overflow-hidden whitespace-nowrap"><StatusBadge text={item.차량_상태} type="상태" /></td>
                  <td className="p-2 truncate font-sans"><StatusBadge text={item.차량_구분} type="구분" /></td>
                  <td className="p-2 truncate font-bold text-slate-900">{item.차량_번호 || '-'}</td>
                  <td className="p-2 truncate text-slate-700 font-sans">{item.차량_제조사 || '-'}</td>
                  <td className="p-2 truncate font-bold text-center text-slate-900 font-sans">{item.차량_모델명 || '-'}</td>
                  <td className="p-2 truncate text-slate-500 text-left font-sans font-sans font-sans">{item.차량_세부모델 || '-'}</td>
                  <td className="p-2 text-left leading-none font-sans font-sans">
                    <div className="font-bold text-slate-800 truncate font-sans font-sans font-sans">{item.차량_세부트림 || '-'}</div>
                    <div className="text-slate-400 font-normal text-[9px] truncate mt-0.5 font-sans font-sans font-sans">{item.차량_선택옵션 || '옵션없음'}</div>
                  </td>
                  <td className="p-2 truncate text-slate-500 whitespace-nowrap font-sans font-sans">{item.차량_외부색상 || '-'}</td>
                  <td className="p-2 truncate text-slate-500 whitespace-nowrap font-sans font-sans">{item.차량_내부색상 || '-'}</td>
                  <td className="p-2 truncate text-right font-medium text-slate-600 tracking-tight font-sans font-sans font-sans">{item.차량_현재주행거리 || '0'}km</td>
                  {selectedPeriods.map(p => (
                    <td key={p} className="p-2 bg-blue-50/20 text-blue-700 font-black text-center leading-none font-sans font-sans">
                      <div className="text-[12px] font-sans font-sans font-sans font-sans">{item[`금액_대여료_${p}`] || '-'}</div>
                      <div className="text-slate-400 font-bold text-[9px] mt-0.5 font-sans font-sans font-sans font-sans font-sans">{item[`금액_보증금_${p}`] || '-'}</div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* --- 상품 상세 정보 레이어 (Drawer) --- */}
        <div key={selectedCar?.차량_번호 || 'none'} className={`absolute right-0 top-0 h-full w-[440px] bg-white shadow-[-15px_0_35px_rgba(0,0,0,0.12)] z-[100] flex flex-col border-l border-slate-200 transition-transform duration-300 ease-in-out rounded-none font-sans ${selectedCar ? 'translate-x-0 animate-drawer-reset' : 'translate-x-full'}`}>
          {selectedCar && (
            <>
              {/* 상단 타이틀 바 - 11px 고정 */}
              <div className="h-[44px] flex justify-between items-center px-4 bg-white border-b border-slate-100 text-slate-800 flex-shrink-0 font-sans">
                <h2 className="font-black text-[11px] tracking-tighter uppercase flex items-center gap-2 font-sans font-sans font-sans font-sans">
                  <Car size={16} className="text-blue-600" /> 상품 상세 정보
                </h2>
                <button onClick={() => setSelectedCar(null)} className="text-slate-400 hover:text-slate-600 transition-colors font-sans"><X size={18} /></button>
              </div>

              {/* 본문 영역 - 모든 텍스트 11px 통일 */}
              <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5 scrollbar-hide text-slate-800 bg-white text-[11px] font-sans font-sans font-sans">
                
                {/* 1. 차량 상세 제원 (3개 구간) */}
                <section className="border border-slate-200 bg-white shadow-sm font-sans font-sans">
                  <div className="bg-slate-50 px-2 py-1 border-b border-slate-200 flex justify-between items-center font-sans">
                    <span className="font-black text-[11px] text-slate-600 flex items-center gap-1.5 uppercase font-sans font-sans font-sans font-sans">
                      <Sparkles size={12} className="text-blue-600"/> 1. 차량 상세 제원
                    </span>
                  </div>
                  <div className="p-2 space-y-2.5 font-sans font-sans">
                    {/* [식별 구간] */}
                    <div className="flex items-center gap-2.5 py-1 border-b border-slate-50 font-sans font-sans font-sans">
                      <span className="font-black text-[11px] text-blue-700 leading-none tracking-tight font-sans font-sans font-sans font-sans">{selectedCar.차량_번호}</span>
                      <span className="font-bold text-[11px] text-slate-900 leading-none font-sans font-sans font-sans font-sans font-sans">
                        {selectedCar.차량_제조사} {selectedCar.차량_모델명} 
                        {selectedCar.차량_연료 ? ` ${selectedCar.차량_연료}` : ''}
                      </span>
                      <div className="flex gap-1 ml-auto font-sans font-sans font-sans font-sans">
                        <StatusBadge text={selectedCar.차량_구분} type="구분" />
                        <StatusBadge text={selectedCar.차량_상태} type="상태" />
                      </div>
                    </div>

                    {/* [사양 구간] */}
                    <div className="space-y-1 py-1 font-sans font-sans font-sans">
                      <div className="flex gap-2 items-start font-sans font-sans font-sans font-sans">
                        <span className="text-slate-400 font-bold w-[55px] flex-shrink-0 tracking-tighter text-[11px] font-sans font-sans font-sans font-sans font-sans">세부모델</span>
                        <span className="font-black text-[11px] text-slate-900 leading-tight font-sans font-sans font-sans font-sans font-sans font-sans">{selectedCar.차량_세부모델}</span>
                      </div>
                      <div className="flex gap-2 items-start font-sans font-sans font-sans font-sans font-sans">
                        <span className="text-slate-400 font-bold w-[55px] flex-shrink-0 tracking-tighter text-[11px] font-sans font-sans font-sans font-sans font-sans font-sans">세부트림</span>
                        <span className="font-bold text-[11px] text-blue-600 leading-tight font-sans font-sans font-sans font-sans font-sans font-sans font-sans">{selectedCar.차량_세부트림}</span>
                      </div>
                      <div className="flex gap-2 items-start font-sans font-sans font-sans font-sans font-sans font-sans">
                        <span className="text-slate-400 font-bold w-[55px] flex-shrink-0 tracking-tighter text-[11px] font-sans font-sans font-sans font-sans font-sans font-sans font-sans">선택옵션</span>
                        <span className="font-medium text-[11px] text-slate-600 leading-tight font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans">{selectedCar.차량_선택옵션 || '장착 정보 없음'}</span>
                      </div>
                    </div>

                    {/* [기술제원 구간] */}
                    <div className="grid grid-cols-2 divide-x divide-slate-100 border border-slate-100 shadow-sm overflow-hidden bg-white text-[11px] font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans">
                      <div className="p-1.5 flex justify-between items-center font-sans font-sans">
                        <span className="text-blue-600 font-bold tracking-tighter text-[11px] font-sans font-sans font-sans">주행거리</span>
                        <span className="font-black text-[11px] text-blue-600 font-sans font-sans font-sans font-sans">{formatPrice(selectedCar.차량_현재주행거리)}km</span>
                      </div>
                      <div className="p-1.5 flex justify-between items-center pl-2 font-sans font-sans font-sans">
                        <span className="text-slate-400 font-bold tracking-tighter text-[11px] font-sans font-sans font-sans font-sans">외부색상</span>
                        <span className="font-bold text-[11px] font-sans font-sans font-sans font-sans font-sans font-sans">{selectedCar.차량_외부색상}</span>
                      </div>
                      <div className="p-1.5 flex justify-between items-center border-t border-slate-50 font-sans font-sans font-sans">
                        <span className="text-slate-400 font-bold tracking-tighter text-[11px] font-sans font-sans font-sans font-sans font-sans">배기량</span>
                        <span className="font-black text-[11px] font-sans font-sans font-sans font-sans font-sans font-sans">{selectedCar.차량_배기량 ? formatPrice(selectedCar.차량_배기량) + 'cc' : '-'}</span>
                      </div>
                      <div className="p-1.5 flex justify-between items-center pl-2 border-t border-slate-50 font-sans font-sans font-sans font-sans">
                        <span className="text-slate-400 font-bold tracking-tighter text-[11px] font-sans font-sans font-sans font-sans font-sans">내부색상</span>
                        <span className="font-bold text-[11px] font-sans font-sans font-sans font-sans font-sans font-sans font-sans">{selectedCar.차량_내부색상}</span>
                      </div>
                      <div className="p-1.5 flex justify-between items-center border-t border-slate-50 font-sans font-sans font-sans font-sans font-sans">
                        <span className="text-slate-400 font-bold tracking-tighter text-[11px] font-sans font-sans font-sans font-sans font-sans font-sans">최초등록일</span>
                        <span className="font-bold text-[11px] font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans">{selectedCar.차량_최초등록일}</span>
                      </div>
                      <div className="p-1.5 flex justify-between items-center pl-2 border-t border-slate-50 font-sans font-sans font-sans font-sans font-sans font-sans">
                        <span className="text-slate-400 font-bold tracking-tighter text-[11px] font-sans font-sans font-sans font-sans font-sans font-sans font-sans">차령만료일</span>
                        <span className="font-bold text-[11px] text-rose-600 font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans">{selectedCar.차량_차령만료일 || '-'}</span>
                      </div>
                      <div className="p-1.5 bg-slate-50/50 flex justify-between items-center col-span-2 border-t border-slate-100 font-sans font-sans font-sans font-sans">
                        <span className="text-slate-400 font-bold tracking-tighter text-[11px] font-sans font-sans font-sans font-sans font-sans">세부상태</span>
                        <StatusBadge text={selectedCar.차량_세부상태} type="세부상태" />
                      </div>
                    </div>
                    
                    <button onClick={() => window.open(selectedCar.차량_사진링크, '_blank')} className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black transition-all flex items-center justify-center gap-1.5 border border-slate-200 rounded-none shadow-sm font-sans text-[11px] font-sans font-sans font-sans font-sans font-sans">
                      <ExternalLink size={11}/> 실물 차량 사진 확인 (링크)
                    </button>
                  </div>
                </section>

                {/* 2. 대여료 및 보증금 안내 (11px 통일) */}
                <section className="border border-slate-200 bg-white shadow-sm font-sans font-sans font-sans">
                  <div className="bg-slate-50 px-2 py-1 border-b border-slate-200 flex items-center gap-1.5 uppercase font-sans font-sans font-sans font-sans">
                    <Banknote size={12} className="text-blue-600"/> <span className="font-black text-[11px] text-slate-600 font-sans font-sans font-sans font-sans font-sans">2. 대여료 및 보증금 안내</span>
                  </div>
                  <table className="w-full text-center border-collapse font-sans text-[11px] font-sans font-sans font-sans">
                    <thead className="bg-[#f8f9fb] border-b border-slate-200 font-bold text-slate-500 uppercase font-sans font-sans font-sans">
                      <tr className="divide-x divide-slate-200 font-sans font-sans font-sans">
                        <th className="py-1 text-[11px] font-bold font-sans font-sans font-sans">계약기간</th>
                        <th className="py-1 text-blue-700 text-[11px] font-bold font-sans font-sans font-sans text-right pr-4">월 대여료 (부가세 포함)</th>
                        <th className="py-1 text-slate-400 text-[11px] font-bold font-sans font-sans font-sans text-right pr-4">보증금</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 font-medium text-slate-800 font-sans font-sans font-sans">
                      {['6M', '12M', '24M', '36M', '48M', '60M'].map(m => {
                        const fee = selectedCar[`금액_대여료_${m}`];
                        const dep = selectedCar[`금액_보증금_${m}`];
                        if (!fee || fee === '-' || fee === '0' || fee === '0원') return null;
                        return (
                          <tr key={m} className="divide-x divide-slate-50 hover:bg-slate-50 transition-colors font-sans text-[11px] font-sans font-sans font-sans">
                            <td className="py-1 font-black uppercase text-[11px] font-sans font-sans font-sans font-sans">{formatPeriod(m)}</td>
                            <td className="py-1 text-blue-700 font-black text-[11px] font-sans font-sans font-sans text-right pr-4 font-sans font-sans font-sans">{fee}원</td>
                            <td className="py-1 text-slate-500 font-sans text-[11px] font-sans font-sans font-sans text-right pr-4 font-sans font-sans font-sans">{dep}원</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>

                {/* 3. 보험 보상 상세 (11px 통일) */}
                <section className="border border-slate-200 bg-white shadow-sm font-sans font-sans font-sans">
                  <div className="bg-slate-50 px-2 py-1 border-b border-slate-200 font-black text-[11px] text-slate-600 flex items-center gap-1.5 uppercase tracking-tighter font-sans font-sans font-sans font-sans">
                    <Shield size={12} className="text-blue-600"/> <span className="font-black text-[11px] font-sans font-sans font-sans font-sans font-sans font-sans">3. 보험 보상 및 개별 면책금 상세</span>
                  </div>
                  <table className="w-full text-center border-collapse text-[11px] font-sans font-sans font-sans">
                    <thead className="bg-slate-50/50 font-bold text-slate-400 uppercase font-sans font-sans font-sans">
                      <tr className="divide-x divide-slate-100 border-b border-slate-100 font-sans font-sans font-sans">
                        <th className="py-1 px-2 text-left font-bold text-[11px] font-sans font-sans font-sans">항목</th>
                        <th className="py-1 px-2 font-bold text-[11px] font-sans font-sans font-sans">보상한도</th>
                        <th className="py-1 px-2 text-right font-bold text-[11px] font-sans font-sans font-sans pr-4">면책금</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-slate-800 font-sans font-sans font-sans">
                      {[
                        { k: '대인 배상', v: selectedCar.보험_대인 || '무한', d: selectedCar.보험_대인면책금 || '0원' },
                        { k: '대물 배상', v: selectedCar.보험_대물 || '1억원', d: selectedCar.보험_대물면책금 || '10만' },
                        { k: '자기신체(자손)', v: selectedCar.보험_자손 || '3천만', d: selectedCar.보험_자손면책금 || '없음' },
                        { k: '무보험차 상해', v: selectedCar.보험_무보험 || '2억원', d: selectedCar.보험_무보험면책금 || '없음' },
                        { k: '자기차량(자차)', v: '차량가액', d: `수리비 20% (${selectedCar.보험_최소면책금 || '20만'}~${selectedCar.보험_최대면책금 || '50만'})`, highlight: true },
                        { k: '긴급 출동', v: `연 5회`, d: selectedCar.보험_긴급출동면책금 || '없음' }
                      ].map((row, i) => (
                        <tr key={i} className={`divide-x divide-slate-50 ${row.highlight ? 'bg-blue-50/20' : ''} font-sans font-sans font-sans`}>
                          <td className="p-1.5 text-left font-bold text-slate-500 font-sans text-[11px] font-sans font-sans font-sans">{row.k}</td>
                          <td className="p-1.5 font-black font-sans text-[11px] font-sans font-sans font-sans">{row.v}</td>
                          <td className={`p-1.5 text-right font-black ${row.highlight ? 'text-red-600' : 'text-blue-700'} font-sans text-[11px] font-sans font-sans font-sans pr-4 font-sans font-sans font-sans`}>{row.d}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                {/* 4. 계약 및 추가 비용 조건 (11px 통일) */}
                <section className="border border-slate-200 bg-white shadow-sm font-sans font-sans font-sans">
                  <div className="bg-slate-50 px-2 py-1 border-b border-slate-200 font-black text-[11px] text-slate-600 flex items-center gap-1.5 uppercase font-sans font-sans font-sans font-sans">
                    <FileText size={12} className="text-blue-600"/> <span className="font-black text-[11px] font-sans font-sans font-sans font-sans font-sans font-sans font-sans">4. 계약 및 추가 비용 조건</span>
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100 bg-white text-[11px] font-sans font-sans font-sans">
                    <div className="p-2 flex justify-between items-baseline font-sans font-sans font-sans">
                      <span className="text-slate-400 font-bold tracking-tighter text-[11px] font-sans font-sans font-sans font-sans font-sans">기본연령</span>
                      <span className="font-black text-[11px] font-sans font-sans font-sans font-sans font-sans font-sans">{selectedCar.계약_기본운전연령 || '만 26세'}</span>
                    </div>
                    <div className="p-2 flex justify-between items-baseline font-sans font-sans font-sans">
                      <span className="text-slate-400 font-bold tracking-tighter text-[11px] font-sans font-sans font-sans font-sans font-sans">약정거리</span>
                      <span className="font-black text-[11px] font-sans font-sans font-sans font-sans font-sans font-sans">{selectedCar.계약_약정주행거리 || '2만km'}</span>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-50 text-slate-800 bg-white text-[11px] font-sans font-sans font-sans">
                    <div className="flex justify-between p-1.5 hover:bg-slate-50 transition-colors font-sans font-sans font-sans">
                      <span className="text-slate-500 font-bold font-sans text-[11px] font-sans font-sans font-sans font-sans">만 21세 연령 하향</span>
                      <span className="font-black text-blue-700 text-[11px] font-sans font-sans font-sans font-sans font-sans">+{formatPrice(selectedCar.계약_21세추가금)}원/월</span>
                    </div>
                    <div className="flex justify-between p-1.5 hover:bg-slate-50 transition-colors font-sans font-sans font-sans">
                      <span className="text-slate-500 font-bold font-sans text-[11px] font-sans font-sans font-sans font-sans">만 23세 연령 하향</span>
                      <span className="font-black text-blue-700 text-[11px] font-sans font-sans font-sans font-sans font-sans">+{formatPrice(selectedCar.계약_23세추가금)}원/월</span>
                    </div>
                    <div className="flex justify-between p-1.5 hover:bg-slate-50 transition-colors font-sans font-sans font-sans">
                      <span className="text-slate-500 font-bold font-sans text-[11px] font-sans font-sans font-sans font-sans">연간 1만km 거리 추가</span>
                      <span className="font-black text-blue-700 text-[11px] font-sans font-sans font-sans font-sans font-sans">+{formatPrice(selectedCar.계약_주행거리추가금)}원/월</span>
                    </div>
                  </div>
                </section>

                {/* 5. 담당자 및 입금 계좌 안내 (11px 통일) */}
                <section className="pb-1 border border-slate-200 bg-white shadow-sm font-sans font-sans font-sans">
                  <div className="bg-slate-50 px-2 py-1 border-b border-slate-200 font-black text-[11px] text-slate-600 flex items-center gap-1.5 uppercase tracking-tighter font-sans font-sans font-sans font-sans">
                    <User size={12} className="text-blue-600"/> <span className="font-black text-[11px] font-sans font-sans font-sans font-sans font-sans font-sans font-sans font-sans">5. 담당자 및 입금 계좌 안내</span>
                  </div>
                  <div className="p-2 space-y-2 bg-white text-[11px] font-sans font-sans font-sans">
                    <div className="grid grid-cols-2 gap-2 font-sans font-sans font-sans">
                      <input type="text" placeholder="소속" className="p-1.5 border border-slate-200 outline-none font-bold focus:border-blue-500 bg-white text-[11px] font-sans font-sans h-[28px] font-sans font-sans font-sans" value={managerInfo.company} onChange={(e) => setManagerInfo({...managerInfo, company: e.target.value})} />
                      <input type="text" placeholder="성명/직책" className="p-1.5 border border-slate-200 outline-none font-bold focus:border-blue-500 bg-white text-[11px] font-sans font-sans h-[28px] font-sans font-sans font-sans" value={managerInfo.nameTitle} onChange={(e) => setManagerInfo({...managerInfo, nameTitle: e.target.value})} />
                      <input type="text" placeholder="연락처" className="p-1.5 border border-slate-200 outline-none font-bold focus:border-blue-500 col-span-2 bg-white text-[11px] font-sans font-sans h-[28px] font-sans font-sans font-sans" value={managerInfo.phone} onChange={(e) => setManagerInfo({...managerInfo, phone: e.target.value})} />
                    </div>

                    <div className="pt-2 border-t border-slate-100 space-y-2 font-sans font-sans font-sans">
                      <label className="flex items-center gap-2 cursor-pointer group font-sans font-sans font-sans font-sans">
                        <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600 font-sans font-sans font-sans font-sans" checked={managerInfo.includeAccount} onChange={(e) => setManagerInfo({...managerInfo, includeAccount: e.target.checked})} />
                        <span className="text-[11px] font-black text-blue-600 group-hover:text-blue-800 transition-colors font-sans font-sans font-sans font-sans font-sans">계좌번호 같이 보내기</span>
                      </label>
                      
                      {managerInfo.includeAccount && (
                        <div className="p-2 bg-blue-50 border border-blue-100 text-center animate-in fade-in slide-in-from-top-1 duration-200 font-sans font-sans font-sans">
                          <p className="text-[11px] font-black text-blue-700 tracking-tighter font-sans font-sans font-sans font-sans font-sans">{selectedCar.계약_입금계좌번호 || '계좌 정보 미등록'}</p>
                          <p className="text-[10px] mt-0.5 font-bold uppercase tracking-tighter text-blue-400 font-sans font-sans font-sans font-sans font-sans">우리은행 (예금주: 프레패스)</p>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </div>

              {/* 하단 버튼 (11px 통일) */}
              <div className="p-2 border-t bg-white flex-shrink-0 grid grid-cols-2 gap-1.5 font-sans font-sans font-sans">
                <button 
                  className={`py-3 font-black text-[11px] flex items-center justify-center gap-1.5 rounded-none transition-all active:scale-[0.99] shadow-sm font-sans font-sans font-sans ${copyLinkFeedback ? 'bg-emerald-600 text-white border-emerald-600 font-sans' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 font-sans'}`}
                  onClick={handleCopyLink}
                >
                  {copyLinkFeedback ? <CheckCircle2 size={14}/> : <Share2 size={14}/>}
                  <span className="font-sans font-sans font-sans font-sans font-sans">{copyLinkFeedback ? '주소 복사됨' : '고객용 링크'}</span>
                </button>
                <button 
                  className={`py-3 font-black text-[11px] flex items-center justify-center gap-1.5 rounded-none transition-all active:scale-[0.99] shadow-sm font-sans font-sans font-sans ${copyFeedback ? 'bg-green-600 text-white border-green-600 font-sans font-sans font-sans' : 'bg-slate-800 text-white hover:bg-slate-900 border-slate-800 font-sans'}`} 
                  onClick={handleCopySummary}
                >
                  {copyFeedback ? <CheckCircle2 size={14}/> : <Copy size={14}/>}
                  <span className="font-sans font-sans font-sans font-sans font-sans">{copyFeedback ? '텍스트 복사됨' : '전달용 텍스트'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
