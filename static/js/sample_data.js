(function(){
  // FREEPASS ERP - Sample Data (v26)
  // 데모/프리뷰 전용. 실제 운영에서는 DB/Firebase에서 동일 스키마로 대체.

  const now = Date.now();

  const vehicles = [
    {
      id: "V001",
      carNo: "12가 3456",
      maker: "현대",
      model: "그랜저",
      detailModel: "더 뉴 그랜저 IG",
      trim: "2.5 가솔린 프리미엄",
      fuel: "가솔린",
      year: 2022,
      mileageKm: 24000,
      optionsText: "선루프 | 내비",
      displacementCc: 2497,
      colorExt: "블랙",
      providerCode: "PR001",
      pricing: { 6:{rent:650000,deposit:20000000}, 12:{rent:620000,deposit:18000000}, 36:{rent:540000,deposit:15000000}, 48:{rent:520000,deposit:14000000}, 60:{rent:500000,deposit:13000000} }
    },
    {
      id: "V002",
      carNo: "34나 7788",
      maker: "기아",
      model: "K5",
      detailModel: "K5 DL3",
      trim: "2.0 가솔린 노블레스",
      fuel: "가솔린",
      year: 2021,
      mileageKm: 41000,
      optionsText: "드라이브와이즈 | HUD",
      displacementCc: 1999,
      colorExt: "화이트",
      providerCode: "PR002",
      pricing: { 6:{rent:590000,deposit:18000000}, 12:{rent:560000,deposit:17000000}, 36:{rent:490000,deposit:13000000}, 48:{rent:470000,deposit:12000000}, 60:{rent:450000,deposit:11000000} }
    },
    {
      id: "V003",
      carNo: "56다 1122",
      maker: "현대",
      model: "아반떼",
      detailModel: "아반떼 CN7",
      trim: "1.6 가솔린 인스퍼레이션",
      fuel: "가솔린",
      year: 2023,
      mileageKm: 12000,
      optionsText: "스마트센스 | 통풍시트",
      displacementCc: 1598,
      colorExt: "그레이",
      providerCode: "PR001",
      pricing: { 6:{rent:520000,deposit:15000000}, 12:{rent:500000,deposit:14000000}, 36:{rent:440000,deposit:11000000}, 48:{rent:420000,deposit:10000000}, 60:{rent:400000,deposit:9000000} }
    },
    {
      id: "V004",
      carNo: "78라 9090",
      maker: "제네시스",
      model: "G80",
      detailModel: "G80 RG3",
      trim: "2.5T AWD",
      fuel: "가솔린",
      year: 2022,
      mileageKm: 28000,
      optionsText: "파퓰러패키지 | 19인치",
      displacementCc: 2497,
      colorExt: "실버",
      providerCode: "PR003",
      pricing: { 6:{rent:980000,deposit:30000000}, 12:{rent:940000,deposit:28000000}, 36:{rent:860000,deposit:24000000}, 48:{rent:830000,deposit:23000000}, 60:{rent:800000,deposit:22000000} }
    },
    {
      id: "V005",
      carNo: "90마 3344",
      maker: "기아",
      model: "쏘렌토",
      detailModel: "쏘렌토 MQ4",
      trim: "2.2 디젤 프레스티지",
      fuel: "디젤",
      year: 2020,
      mileageKm: 67000,
      optionsText: "7인승 | 어라운드뷰",
      displacementCc: 2151,
      colorExt: "블루",
      providerCode: "PR002",
      pricing: { 6:{rent:790000,deposit:26000000}, 12:{rent:760000,deposit:24000000}, 36:{rent:690000,deposit:20000000}, 48:{rent:660000,deposit:19000000}, 60:{rent:630000,deposit:18000000} }
    }
  ];

  const rooms = [
    { roomId:"12가3456_A001_PR001", title:"12가 3456 문의", at:"10:21", last:"견적 부탁드립니다", carNo:"12가 3456", detailModel:"더 뉴 그랜저 IG", agentCode:"A001", providerCode:"PR001", lastMessage:"견적 부탁드립니다", lastAt: now-60*60*1000 },
    { roomId:"34나7788_A002_PR002", title:"34나 7788 문의", at:"09:55", last:"가능 기간 확인요", carNo:"34나 7788", detailModel:"K5 DL3", agentCode:"A002", providerCode:"PR002", lastMessage:"가능 기간 확인요", lastAt: now-2*60*60*1000 },
    { roomId:"56다1122_A001_PR001", title:"56다 1122 문의", at:"어제", last:"보증금 조건 문의", carNo:"56다 1122", detailModel:"아반떼 CN7", agentCode:"A001", providerCode:"PR001", lastMessage:"보증금 조건 문의", lastAt: now-26*60*60*1000 },
    { roomId:"78라9090_A003_PR003", title:"78라 9090 문의", at:"2/26", last:"차량 상태 확인", carNo:"78라 9090", detailModel:"G80 RG3", agentCode:"A003", providerCode:"PR003", lastMessage:"차량 상태 확인", lastAt: now-3*24*60*60*1000 },
    { roomId:"90마3344_A002_PR002", title:"90마 3344 문의", at:"2/25", last:"출고 가능일?", carNo:"90마 3344", detailModel:"쏘렌토 MQ4", agentCode:"A002", providerCode:"PR002", lastMessage:"출고 가능일?", lastAt: now-4*24*60*60*1000 }
  ];

  const approvals = [
    { id:"AP001", title:"승인요청 | 12가 3456 | 36개월", at:"10:05", sub:"현대 그랜저 | PR001 | 보증금 15,000,000", carNo:"12가 3456", detailModel:"더 뉴 그랜저 IG", status:"대기", note:"조건 확인 필요" },
    { id:"AP002", title:"승인요청 | 34나 7788 | 48개월", at:"09:40", sub:"기아 K5 | PR002 | 보증금 12,000,000", carNo:"34나 7788", detailModel:"K5 DL3", status:"대기", note:"" },
    { id:"AP003", title:"승인요청 | 56다 1122 | 60개월", at:"어제", sub:"현대 아반떼 | PR001 | 보증금 9,000,000", carNo:"56다 1122", detailModel:"아반떼 CN7", status:"검토", note:"" },
    { id:"AP004", title:"승인요청 | 78라 9090 | 36개월", at:"2/26", sub:"제네시스 G80 | PR003 | 보증금 24,000,000", carNo:"78라 9090", detailModel:"G80 RG3", status:"완료", note:"승인 완료" },
    { id:"AP005", title:"승인요청 | 90마 3344 | 12개월", at:"2/25", sub:"기아 쏘렌토 | PR002 | 보증금 24,000,000", carNo:"90마 3344", detailModel:"쏘렌토 MQ4", status:"반려", note:"서류 누락" }
  ];

  const requests = [
    { id:"RQ001", title:"요청 | 12가 3456 | 36개월", at:"10:11", sub:"희망: 월 54만 | 보증금 1,500만 | A001", carNo:"12가 3456", term:"36개월", want:"월 540,000 / 보증금 15,000,000" },
    { id:"RQ002", title:"요청 | 34나 7788 | 60개월", at:"09:58", sub:"희망: 월 45만 | 보증금 1,100만 | A002", carNo:"34나 7788", term:"60개월", want:"월 450,000 / 보증금 11,000,000" },
    { id:"RQ003", title:"요청 | 56다 1122 | 48개월", at:"어제", sub:"희망: 월 42만 | 보증금 1,000만 | A001", carNo:"56다 1122", term:"48개월", want:"월 420,000 / 보증금 10,000,000" },
    { id:"RQ004", title:"요청 | 78라 9090 | 36개월", at:"2/26", sub:"희망: 월 86만 | 보증금 2,400만 | A003", carNo:"78라 9090", term:"36개월", want:"월 860,000 / 보증금 24,000,000" },
    { id:"RQ005", title:"요청 | 90마 3344 | 12개월", at:"2/25", sub:"희망: 월 76만 | 보증금 2,400만 | A002", carNo:"90마 3344", term:"12개월", want:"월 760,000 / 보증금 24,000,000" }
  ];

  const settlements = [
    { id:"ST001", title:"정산 | PR001 | 2026-02", at:"2/28", sub:"금액 3,200,000 | 건수 8", provider:"PR001", amount:"3,200,000", note:"" },
    { id:"ST002", title:"정산 | PR002 | 2026-02", at:"2/27", sub:"금액 2,450,000 | 건수 6", provider:"PR002", amount:"2,450,000", note:"" },
    { id:"ST003", title:"정산 | PR003 | 2026-02", at:"2/26", sub:"금액 1,980,000 | 건수 4", provider:"PR003", amount:"1,980,000", note:"" },
    { id:"ST004", title:"정산 | PR001 | 2026-01", at:"2/01", sub:"금액 2,870,000 | 건수 7", provider:"PR001", amount:"2,870,000", note:"지연 정산" },
    { id:"ST005", title:"정산 | PR002 | 2026-01", at:"1/31", sub:"금액 2,300,000 | 건수 5", provider:"PR002", amount:"2,300,000", note:"" }
  ];

  window.FREEPASS_SAMPLE = { vehicles, rooms, approvals, requests, settlements };
})();