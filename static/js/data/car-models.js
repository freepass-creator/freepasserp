/**
 * car-models.js — 차량 모델 마스터 데이터
 * 출처: freepasserp 공유 시트 + 누락 차종 보완
 * https://docs.google.com/spreadsheets/d/1UYUutPTmD76mWzEV5x0-e39ngihp5vduQdV0YEiX_RQ/edit?gid=0
 *
 * 색상은 별도 마스터 (color-codes.js) 에서 관리
 */

export const CAR_MODELS = [
  { maker: '기아', model: '니로', sub: '니로 SG2', year_start: '22', year_end: '현재', code: 'SG2', category: '소형 SUV' },
  { maker: '기아', model: '니로', sub: '니로 EV SG2', year_start: '22', year_end: '현재', code: 'SG2', category: '소형 EV' },
  { maker: '기아', model: '레이', sub: '레이 TAM', year_start: '11', year_end: '17', code: 'TAM', category: '경차' },
  { maker: '기아', model: '레이', sub: '더 뉴 레이 TAM (페리)', year_start: '17', year_end: '22', code: 'TAM', category: '경차' },
  { maker: '기아', model: '레이', sub: '더 뉴 기아 레이 TAM (페리2)', year_start: '22', year_end: '현재', code: 'TAM', category: '경차' },
  { maker: '기아', model: '모닝', sub: '모닝 JA', year_start: '17', year_end: '20', code: 'JA', category: '경차' },
  { maker: '기아', model: '모닝', sub: '더 뉴 모닝 JA (페리)', year_start: '20', year_end: '23', code: 'JA', category: '경차' },
  { maker: '기아', model: '모닝', sub: '더 뉴 기아 모닝 JA (페리2)', year_start: '23', year_end: '현재', code: 'JA', category: '경차' },
  { maker: '기아', model: '셀토스', sub: '셀토스 SP2', year_start: '19', year_end: '22', code: 'SP2', category: '소형 SUV' },
  { maker: '기아', model: '셀토스', sub: '더 뉴 셀토스 SP2 (페리)', year_start: '22', year_end: '현재', code: 'SP2', category: '소형 SUV' },
  { maker: '기아', model: '쏘렌토', sub: '쏘렌토 MQ4', year_start: '20', year_end: '23', code: 'MQ4', category: '중형 SUV' },
  { maker: '기아', model: '쏘렌토', sub: '더 뉴 쏘렌토 MQ4 (페리)', year_start: '23', year_end: '현재', code: 'MQ4', category: '중형 SUV' },
  { maker: '기아', model: '쏘렌토', sub: '쏘렌토 UM', year_start: '14', year_end: '17', code: 'UM', category: '중형 SUV' },
  { maker: '기아', model: '쏘렌토', sub: '더 뉴 쏘렌토 UM (페리)', year_start: '17', year_end: '20', code: 'UM', category: '중형 SUV' },
  { maker: '기아', model: '스포티지', sub: '스포티지 NQ5', year_start: '21', year_end: '24', code: 'NQ5', category: '준중형 SUV' },
  { maker: '기아', model: '스포티지', sub: '더 뉴 스포티지 NQ5 (페리)', year_start: '24', year_end: '현재', code: 'NQ5', category: '준중형 SUV' },
  { maker: '기아', model: '스포티지', sub: '스포티지 QL', year_start: '15', year_end: '18', code: 'QL', category: '준중형 SUV' },
  { maker: '기아', model: '스포티지', sub: '스포티지 더 볼드 QL (페리)', year_start: '18', year_end: '21', code: 'QL', category: '준중형 SUV' },
  { maker: '기아', model: '스팅어', sub: '스팅어 CK', year_start: '17', year_end: '20', code: 'CK', category: '스포츠 세단' },
  { maker: '기아', model: '스팅어', sub: '스팅어 마이스터 CK (페리)', year_start: '20', year_end: '23', code: 'CK', category: '스포츠 세단' },
  { maker: '기아', model: '카니발', sub: '카니발 KA4', year_start: '20', year_end: '23', code: 'KA4', category: '대형 MPV' },
  { maker: '기아', model: '카니발', sub: '더 뉴 카니발 KA4 (페리)', year_start: '23', year_end: '현재', code: 'KA4', category: '대형 MPV' },
  { maker: '기아', model: '카니발', sub: '카니발 YP', year_start: '14', year_end: '18', code: 'YP', category: '대형 MPV' },
  { maker: '기아', model: '카니발', sub: '더 뉴 카니발 YP (페리)', year_start: '18', year_end: '20', code: 'YP', category: '대형 MPV' },
  { maker: '기아', model: 'K3', sub: 'K3 BD', year_start: '18', year_end: '21', code: 'BD', category: '준중형 세단' },
  { maker: '기아', model: 'K3', sub: '더 뉴 K3 BD (페리)', year_start: '21', year_end: '24', code: 'BD', category: '준중형 세단' },
  { maker: '기아', model: 'K5', sub: 'K5 DL3', year_start: '19', year_end: '23', code: 'DL3', category: '중형 세단' },
  { maker: '기아', model: 'K5', sub: '더 뉴 K5 DL3 (페리)', year_start: '23', year_end: '현재', code: 'DL3', category: '중형 세단' },
  { maker: '기아', model: 'K5', sub: 'K5 JF', year_start: '15', year_end: '18', code: 'JF', category: '중형 세단' },
  { maker: '기아', model: 'K5', sub: '더 뉴 K5 JF (페리)', year_start: '18', year_end: '19', code: 'JF', category: '중형 세단' },
  { maker: '기아', model: 'K8', sub: 'K8 GL3', year_start: '21', year_end: '24', code: 'GL3', category: '준대형 세단' },
  { maker: '기아', model: 'K8', sub: '더 뉴 K8 GL3 (페리)', year_start: '24', year_end: '현재', code: 'GL3', category: '준대형 세단' },
  { maker: '기아', model: 'K9', sub: 'K9 RJ', year_start: '18', year_end: '21', code: 'RJ', category: '대형 세단' },
  { maker: '기아', model: 'K9', sub: '더 뉴 K9 RJ (페리)', year_start: '21', year_end: '현재', code: 'RJ', category: '대형 세단' },
  { maker: '기아', model: 'EV3', sub: 'EV3 SV1', year_start: '24', year_end: '현재', code: 'SV1', category: '소형 EV SUV' },
  { maker: '기아', model: 'EV6', sub: 'EV6 CV', year_start: '21', year_end: '24', code: 'CV', category: '준중형 EV' },
  { maker: '기아', model: 'EV6', sub: '더 뉴 EV6 CV (페리)', year_start: '24', year_end: '현재', code: 'CV', category: '준중형 EV' },
  { maker: '기아', model: 'EV9', sub: 'EV9 MV', year_start: '23', year_end: '현재', code: 'MV', category: '대형 EV SUV' },
  { maker: '르노', model: '아르카나', sub: '아르카나 LJB', year_start: '24', year_end: '현재', code: 'LJB', category: '소형 SUV' },
  { maker: '르노', model: '콜레오스', sub: '그랑 콜레오스 OV6', year_start: '24', year_end: '현재', code: 'OV6', category: '중형 SUV' },
  { maker: '르노', model: 'QM6', sub: 'QM6 HZG', year_start: '16', year_end: '현재', code: 'HZG', category: '중형 SUV' },
  { maker: '르노', model: 'SM6', sub: 'SM6 LFD', year_start: '16', year_end: '현재', code: 'LFD', category: '중형 세단' },
  { maker: '르노', model: 'XM3', sub: 'XM3 LJB', year_start: '20', year_end: '24', code: 'LJB', category: '소형 SUV' },
  { maker: '제네시스', model: 'G70', sub: 'G70 IK', year_start: '17', year_end: '20', code: 'IK', category: '중형 세단' },
  { maker: '제네시스', model: 'G70', sub: '더 뉴 G70 IK (페리)', year_start: '20', year_end: '현재', code: 'IK', category: '중형 세단' },
  { maker: '제네시스', model: 'G80', sub: 'G80 DH 페리', year_start: '16', year_end: '20', code: 'DH', category: '준대형 세단' },
  { maker: '제네시스', model: 'G80', sub: 'G80 RG3', year_start: '20', year_end: '23', code: 'RG3', category: '준대형 세단' },
  { maker: '제네시스', model: 'G80', sub: '더 뉴 G80 RG3 (페리)', year_start: '23', year_end: '현재', code: 'RG3', category: '준대형 세단' },
  { maker: '제네시스', model: 'G90', sub: 'G90 HI', year_start: '15', year_end: '18', code: 'HI', category: '대형 세단' },
  { maker: '제네시스', model: 'G90', sub: '더 뉴 G90 HI (페리)', year_start: '18', year_end: '21', code: 'HI', category: '대형 세단' },
  { maker: '제네시스', model: 'G90', sub: 'G90 RS4', year_start: '21', year_end: '현재', code: 'RS4', category: '대형 세단' },
  { maker: '제네시스', model: 'GV60', sub: 'GV60 JW1', year_start: '21', year_end: '현재', code: 'JW1', category: '준중형 EV SUV' },
  { maker: '제네시스', model: 'GV70', sub: 'GV70 JK1', year_start: '20', year_end: '24', code: 'JK1', category: '중형 SUV' },
  { maker: '제네시스', model: 'GV70', sub: '더 뉴 GV70 JK1 (페리)', year_start: '24', year_end: '현재', code: 'JK1', category: '중형 SUV' },
  { maker: '제네시스', model: 'GV80', sub: 'GV80 JX1', year_start: '20', year_end: '23', code: 'JX1', category: '준대형 SUV' },
  { maker: '제네시스', model: 'GV80', sub: '더 뉴 GV80 JX1 (페리)', year_start: '23', year_end: '현재', code: 'JX1', category: '준대형 SUV' },
  { maker: '현대', model: '그랜저', sub: '그랜저 GN7', year_start: '22', year_end: '현재', code: 'GN7', category: '준대형 세단' },
  { maker: '현대', model: '그랜저', sub: '그랜저 IG', year_start: '16', year_end: '19', code: 'IG', category: '준대형 세단' },
  { maker: '현대', model: '그랜저', sub: '더 뉴 그랜저 IG (페리)', year_start: '19', year_end: '22', code: 'IG', category: '준대형 세단' },
  { maker: '현대', model: '넥쏘', sub: '넥쏘 FE', year_start: '18', year_end: '현재', code: 'FE', category: '수소 SUV' },
  { maker: '현대', model: '싼타페', sub: '싼타페 MX5', year_start: '23', year_end: '현재', code: 'MX5', category: '중형 SUV' },
  { maker: '현대', model: '싼타페', sub: '싼타페 TM', year_start: '18', year_end: '20', code: 'TM', category: '중형 SUV' },
  { maker: '현대', model: '싼타페', sub: '더 뉴 싼타페 TM (페리)', year_start: '20', year_end: '23', code: 'TM', category: '중형 SUV' },
  { maker: '현대', model: '쏘나타', sub: '쏘나타 DN8', year_start: '19', year_end: '23', code: 'DN8', category: '중형 세단' },
  { maker: '현대', model: '쏘나타', sub: '쏘나타 디 엣지 DN8 (페리)', year_start: '23', year_end: '현재', code: 'DN8', category: '중형 세단' },
  { maker: '현대', model: '쏘나타', sub: '쏘나타 뉴 라이즈 LF (페리)', year_start: '17', year_end: '19', code: 'LF', category: '중형 세단' },
  { maker: '현대', model: '아반떼', sub: '아반떼 AD', year_start: '15', year_end: '18', code: 'AD', category: '준중형 세단' },
  { maker: '현대', model: '아반떼', sub: '더 뉴 아반떼 AD (페리)', year_start: '18', year_end: '20', code: 'AD', category: '준중형 세단' },
  { maker: '현대', model: '아반떼', sub: '아반떼 CN7', year_start: '20', year_end: '23', code: 'CN7', category: '준중형 세단' },
  { maker: '현대', model: '아반떼', sub: '더 뉴 아반떼 CN7 (페리)', year_start: '23', year_end: '현재', code: 'CN7', category: '준중형 세단' },
  { maker: '현대', model: '아이오닉5', sub: '아이오닉5 NE', year_start: '21', year_end: '24', code: 'NE', category: '준중형 EV' },
  { maker: '현대', model: '아이오닉5', sub: '더 뉴 아이오닉5 NE (페리)', year_start: '24', year_end: '현재', code: 'NE', category: '준중형 EV' },
  { maker: '현대', model: '아이오닉6', sub: '아이오닉6 CE', year_start: '22', year_end: '현재', code: 'CE', category: '중형 EV 세단' },
  { maker: '현대', model: '코나', sub: '코나 OS', year_start: '17', year_end: '20', code: 'OS', category: '소형 SUV' },
  { maker: '현대', model: '코나', sub: '더 뉴 코나 OS (페리)', year_start: '20', year_end: '23', code: 'OS', category: '소형 SUV' },
  { maker: '현대', model: '코나', sub: '코나 SX2', year_start: '23', year_end: '현재', code: 'SX2', category: '소형 SUV' },
  { maker: '현대', model: '투싼', sub: '투싼 NX4', year_start: '20', year_end: '23', code: 'NX4', category: '준중형 SUV' },
  { maker: '현대', model: '투싼', sub: '더 뉴 투싼 NX4 (페리)', year_start: '23', year_end: '현재', code: 'NX4', category: '준중형 SUV' },
  { maker: '현대', model: '투싼', sub: '투싼 TL (페리)', year_start: '18', year_end: '20', code: 'TL', category: '준중형 SUV' },
  { maker: '현대', model: '팰리세이드', sub: '팰리세이드 LX2', year_start: '18', year_end: '22', code: 'LX2', category: '대형 SUV' },
  { maker: '현대', model: '팰리세이드', sub: '더 뉴 팰리세이드 LX2 (페리)', year_start: '22', year_end: '24', code: 'LX2', category: '대형 SUV' },
  { maker: '현대', model: '팰리세이드', sub: '팰리세이드 LX3', year_start: '25', year_end: '현재', code: 'LX3', category: '대형 SUV' },
  { maker: 'KGM', model: '렉스턴', sub: '렉스턴 Y400', year_start: '17', year_end: '20', code: 'Y400', category: '대형 SUV' },
  { maker: 'KGM', model: '렉스턴', sub: '올뉴 렉스턴 Y450', year_start: '20', year_end: '23', code: 'Y450', category: '대형 SUV' },
  { maker: 'KGM', model: '렉스턴', sub: '렉스턴 뉴아레나 Y450 (페리)', year_start: '23', year_end: '현재', code: 'Y450', category: '대형 SUV' },
  { maker: 'KGM', model: '렉스턴 스포츠', sub: '렉스턴 스포츠 Q200', year_start: '18', year_end: '21', code: 'Q200', category: '픽업트럭' },
  { maker: 'KGM', model: '렉스턴 스포츠', sub: '렉스턴 스포츠 Q200 (페리)', year_start: '21', year_end: '현재', code: 'Q200', category: '픽업트럭' },
  { maker: 'KGM', model: '코란도', sub: '뷰티풀 코란도 C300', year_start: '19', year_end: '현재', code: 'C300', category: '준중형 SUV' },
  { maker: 'KGM', model: '티볼리', sub: '티볼리 X100', year_start: '15', year_end: '19', code: 'X100', category: '소형 SUV' },
  { maker: 'KGM', model: '티볼리', sub: '베리 뉴 티볼리 X150 (페리)', year_start: '19', year_end: '23', code: 'X150', category: '소형 SUV' },
  { maker: 'KGM', model: '티볼리', sub: '더 뉴 티볼리 X150 (페리2)', year_start: '23', year_end: '현재', code: 'X150', category: '소형 SUV' },
  { maker: 'KGM', model: '토레스', sub: '토레스 J100', year_start: '22', year_end: '현재', code: 'J100', category: '중형 SUV' },
  { maker: 'KGM', model: '토레스', sub: '토레스 EVX U100', year_start: '23', year_end: '현재', code: 'U100', category: '중형 EV SUV' },
  { maker: '쉐보레', model: '트랙스', sub: '트랙스 9BQC', year_start: '23', year_end: '현재', code: '9BQC', category: '소형 SUV' },
  { maker: '쉐보레', model: '트레일블레이저', sub: '트레일블레이저 9BYC', year_start: '20', year_end: '23', code: '9BYC', category: '소형 SUV' },
  { maker: '쉐보레', model: '트레일블레이저', sub: '더 뉴 트레일블레이저 9BYC (페리)', year_start: '23', year_end: '현재', code: '9BYC', category: '소형 SUV' },
  { maker: 'BMW', model: '3시리즈', sub: '3시리즈 F30', year_start: '12', year_end: '19', code: 'F30', category: '준중형 세단' },
  { maker: 'BMW', model: '3시리즈', sub: '3시리즈 G20', year_start: '19', year_end: '22', code: 'G20', category: '준중형 세단' },
  { maker: 'BMW', model: '3시리즈', sub: '3시리즈 G20 페리 (LCI)', year_start: '22', year_end: '현재', code: 'G20', category: '준중형 세단' },
  { maker: 'BMW', model: '5시리즈', sub: '5시리즈 G30', year_start: '17', year_end: '20', code: 'G30', category: '중형 세단' },
  { maker: 'BMW', model: '5시리즈', sub: '5시리즈 G30 페리 (LCI)', year_start: '20', year_end: '23', code: 'G30', category: '중형 세단' },
  { maker: 'BMW', model: '5시리즈', sub: '5시리즈 G60', year_start: '23', year_end: '현재', code: 'G60', category: '중형 세단' },
  { maker: 'BMW', model: 'X3', sub: 'X3 G01', year_start: '17', year_end: '21', code: 'G01', category: '중형 SUV' },
  { maker: 'BMW', model: 'X3', sub: 'X3 G01 페리 (LCI)', year_start: '21', year_end: '24', code: 'G01', category: '중형 SUV' },
  { maker: 'BMW', model: 'X5', sub: 'X5 G05', year_start: '19', year_end: '23', code: 'G05', category: '준대형 SUV' },
  { maker: 'BMW', model: 'X5', sub: 'X5 G05 페리 (LCI)', year_start: '23', year_end: '현재', code: 'G05', category: '준대형 SUV' },
  { maker: '벤츠', model: 'C-클래스', sub: 'C-클래스 W205', year_start: '14', year_end: '21', code: 'W205', category: '준중형 세단' },
  { maker: '벤츠', model: 'C-클래스', sub: 'C-클래스 W206', year_start: '21', year_end: '현재', code: 'W206', category: '준중형 세단' },
  { maker: '벤츠', model: 'E-클래스', sub: 'E-클래스 W213', year_start: '16', year_end: '20', code: 'W213', category: '중형 세단' },
  { maker: '벤츠', model: 'E-클래스', sub: '더 뉴 E-클래스 W213 (페리)', year_start: '20', year_end: '24', code: 'W213', category: '중형 세단' },
  { maker: '벤츠', model: 'E-클래스', sub: 'E-클래스 W214', year_start: '24', year_end: '현재', code: 'W214', category: '중형 세단' },
  { maker: '벤츠', model: 'GLC', sub: 'GLC X253 페리 (페리)', year_start: '19', year_end: '23', code: 'X253', category: '중형 SUV' },
  { maker: '벤츠', model: 'GLC', sub: 'GLC X254', year_start: '23', year_end: '현재', code: 'X254', category: '중형 SUV' },
  { maker: '벤츠', model: 'GLE', sub: 'GLE V167', year_start: '19', year_end: '23', code: 'V167', category: '준대형 SUV' },
  { maker: '벤츠', model: 'GLE', sub: 'GLE V167 페리 (페리)', year_start: '23', year_end: '현재', code: 'V167', category: '준대형 SUV' },
  { maker: '아우디', model: 'A6', sub: 'A6 C7 (페리)', year_start: '15', year_end: '19', code: 'C7', category: '중형 세단' },
  { maker: '아우디', model: 'A6', sub: 'A6 C8', year_start: '19', year_end: '23', code: 'C8', category: '중형 세단' },
  { maker: '아우디', model: 'A6', sub: 'A6 C8 (페리)', year_start: '23', year_end: '현재', code: 'C8', category: '중형 세단' },
  { maker: '테슬라', model: '모델 3', sub: '모델 3', year_start: '19', year_end: '23', code: '-', category: '중형 EV 세단' },
  { maker: '테슬라', model: '모델 3', sub: '모델 3 하이랜드 (페리)', year_start: '24', year_end: '현재', code: '-', category: '중형 EV 세단' },
  { maker: '테슬라', model: '모델 Y', sub: '모델 Y', year_start: '21', year_end: '24', code: '-', category: '중형 EV SUV' },
  { maker: '테슬라', model: '모델 Y', sub: '모델 Y 주니퍼 (페리)', year_start: '25', year_end: '현재', code: '-', category: '중형 EV SUV' },
  { maker: '현대', model: '캐스퍼', sub: '캐스퍼 AX1', year_start: '21', year_end: '현재', code: 'AX1', category: '경형 SUV' },
  { maker: '현대', model: '캐스퍼', sub: '캐스퍼 일렉트릭 AX1 EV', year_start: '24', year_end: '현재', code: 'AX1', category: '경형 EV' },
  { maker: '현대', model: '스타리아', sub: '스타리아 US4', year_start: '21', year_end: '24', code: 'US4', category: '대형 MPV' },
  { maker: '현대', model: '스타리아', sub: '더 뉴 스타리아 US4 (페리)', year_start: '24', year_end: '현재', code: 'US4', category: '대형 MPV' },
  { maker: '현대', model: '포터2', sub: '포터2 HR', year_start: '04', year_end: '현재', code: 'HR', category: '소형 트럭' },
  { maker: '현대', model: '포터2', sub: '포터2 일렉트릭 HR EV', year_start: '19', year_end: '현재', code: 'HR', category: '소형 EV 트럭' },
  { maker: '현대', model: '베뉴', sub: '베뉴 QX', year_start: '19', year_end: '현재', code: 'QX', category: '소형 SUV' },
  { maker: '현대', model: '아이오닉9', sub: '아이오닉9', year_start: '24', year_end: '현재', code: '-', category: '대형 EV SUV' },
  { maker: '기아', model: '봉고3', sub: '봉고3 PU', year_start: '04', year_end: '현재', code: 'PU', category: '소형 트럭' },
  { maker: '기아', model: '봉고3', sub: '봉고3 EV PU EV', year_start: '20', year_end: '현재', code: 'PU', category: '소형 EV 트럭' },
  { maker: '기아', model: '타스만', sub: '타스만 TK', year_start: '25', year_end: '현재', code: 'TK', category: '픽업트럭' },
  { maker: 'KGM', model: '액티언', sub: '더 뉴 액티언 J120', year_start: '24', year_end: '현재', code: 'J120', category: '중형 SUV' },

  // ─── 추가 누락분 (서치 기반) ────────────────────────────────────────────
  { maker: '현대', model: '아슬란', sub: '아슬란 AG', year_start: '14', year_end: '17', code: 'AG', category: '준대형 세단' },
  { maker: '현대', model: '그랜저', sub: '그랜저 HG', year_start: '11', year_end: '14', code: 'HG', category: '준대형 세단' },
  { maker: '현대', model: '그랜저', sub: '더 뉴 그랜저 HG (페리)', year_start: '14', year_end: '16', code: 'HG', category: '준대형 세단' },
  { maker: '현대', model: '그랜드 스타렉스', sub: '그랜드 스타렉스 TQ', year_start: '07', year_end: '17', code: 'TQ', category: '대형 MPV' },
  { maker: '현대', model: '그랜드 스타렉스', sub: '더 뉴 그랜드 스타렉스 TQ (페리)', year_start: '17', year_end: '21', code: 'TQ', category: '대형 MPV' },
  { maker: '현대', model: '아이오닉', sub: '아이오닉 일렉트릭 AE', year_start: '15', year_end: '19', code: 'AE', category: '준중형 EV' },
  { maker: '현대', model: '아이오닉', sub: '아이오닉 하이브리드 AE', year_start: '16', year_end: '19', code: 'AE', category: '준중형 하이브리드' },
  { maker: '현대', model: '벨로스터', sub: '벨로스터 JS', year_start: '18', year_end: '22', code: 'JS', category: '준중형 쿠페' },
  { maker: '현대', model: '벨로스터', sub: '벨로스터 N JS', year_start: '19', year_end: '22', code: 'JS', category: '스포츠 쿠페' },
  { maker: '제네시스', model: 'EQ900', sub: 'EQ900 HI', year_start: '15', year_end: '18', code: 'HI', category: '대형 세단' },
  { maker: '기아', model: 'K7', sub: 'K7 VG', year_start: '09', year_end: '16', code: 'VG', category: '준대형 세단' },
  { maker: '기아', model: 'K7', sub: 'K7 YG', year_start: '16', year_end: '19', code: 'YG', category: '준대형 세단' },
  { maker: '기아', model: 'K7', sub: '더 K7 프리미어 YG (페리)', year_start: '19', year_end: '21', code: 'YG', category: '준대형 세단' },
  { maker: '기아', model: '모하비', sub: '모하비 HM', year_start: '08', year_end: '15', code: 'HM', category: '대형 SUV' },
  { maker: '기아', model: '모하비', sub: '더 마스터 모하비 HM (페리)', year_start: '19', year_end: '23', code: 'HM', category: '대형 SUV' },
  { maker: 'BMW', model: '4시리즈', sub: '4시리즈 F32', year_start: '13', year_end: '20', code: 'F32', category: '준중형 쿠페' },
  { maker: 'BMW', model: '4시리즈', sub: '4시리즈 G22', year_start: '20', year_end: '현재', code: 'G22', category: '준중형 쿠페' },
  { maker: 'BMW', model: '6시리즈', sub: '6시리즈 그란쿠페 F06', year_start: '12', year_end: '18', code: 'F06', category: '대형 쿠페' },
  { maker: '벤츠', model: 'C-클래스', sub: 'C-클래스 카브리올레 A205', year_start: '16', year_end: '23', code: 'A205', category: '준중형 컨버터블' },
  { maker: '벤츠', model: 'CLS', sub: 'CLS C257', year_start: '18', year_end: '현재', code: 'C257', category: '대형 쿠페 세단' },
  { maker: '벤츠', model: 'S-클래스', sub: 'S-클래스 W223', year_start: '21', year_end: '현재', code: 'W223', category: '대형 세단' },
  { maker: '쉐보레', model: '스파크', sub: '스파크 M300', year_start: '11', year_end: '15', code: 'M300', category: '경차' },
  { maker: '쉐보레', model: '스파크', sub: '더 넥스트 스파크 M400', year_start: '15', year_end: '22', code: 'M400', category: '경차' },
  { maker: '쉐보레', model: '카마로', sub: '카마로 SS A1XX', year_start: '16', year_end: '24', code: 'A1XX', category: '스포츠 쿠페' },
  { maker: '포드', model: '머스탱', sub: '머스탱 GT S550', year_start: '14', year_end: '23', code: 'S550', category: '스포츠 쿠페' },
  { maker: '포르쉐', model: '카이엔', sub: '카이엔 E3', year_start: '17', year_end: '23', code: 'E3', category: '중형 SUV' },
  { maker: '포르쉐', model: '카이엔', sub: '카이엔 E3 (페리)', year_start: '23', year_end: '현재', code: 'E3', category: '중형 SUV' },
  { maker: '마세라티', model: '기블리', sub: '기블리 M157', year_start: '13', year_end: '현재', code: 'M157', category: '준대형 세단' },
  { maker: '마세라티', model: '콰트로포르테', sub: '콰트로포르테 M156', year_start: '13', year_end: '현재', code: 'M156', category: '대형 세단' },
  { maker: '마세라티', model: '르반떼', sub: '르반떼', year_start: '16', year_end: '현재', code: '-', category: '중형 SUV' },
  { maker: '미니', model: '컨트리맨', sub: '컨트리맨 F60', year_start: '17', year_end: '24', code: 'F60', category: '소형 SUV' },
  { maker: '미니', model: '컨트리맨', sub: '컨트리맨 U25', year_start: '24', year_end: '현재', code: 'U25', category: '소형 SUV' },
  { maker: '미니', model: '쿠퍼', sub: '쿠퍼 F56', year_start: '14', year_end: '24', code: 'F56', category: '소형 해치백' },
  { maker: '지프', model: '어벤저', sub: '어벤저', year_start: '23', year_end: '현재', code: '-', category: '소형 SUV' },
  { maker: '지프', model: '랭글러', sub: '랭글러 JL', year_start: '18', year_end: '현재', code: 'JL', category: '중형 SUV' },
  { maker: '지프', model: '체로키', sub: '체로키 KL', year_start: '14', year_end: '23', code: 'KL', category: '중형 SUV' },

  // ─── 추가: 시트 데이터 매칭용 누락 차종 ─────────────────────
  // 기아 K7 (단종 모델)
  { maker: '기아', model: 'K7', sub: 'K7 VG', year_start: '09', year_end: '16', code: 'VG', category: '준대형 세단' },
  { maker: '기아', model: 'K7', sub: '올 뉴 K7 YG', year_start: '16', year_end: '19', code: 'YG', category: '준대형 세단' },
  { maker: '기아', model: 'K7', sub: 'K7 프리미어 YG (페리)', year_start: '19', year_end: '21', code: 'YG', category: '준대형 세단' },
  // 현대 그랜저 IG (페리 추가)
  { maker: '현대', model: '그랜저', sub: '그랜저 IG', year_start: '16', year_end: '19', code: 'IG', category: '준대형 세단' },
  // 르노 아르카나 LJB
  { maker: '르노', model: '아르카나', sub: '아르카나 LJB', year_start: '24', year_end: '현재', code: 'LJB', category: '소형 SUV' },
  // 르노 SM6
  { maker: '르노', model: 'SM6', sub: 'SM6 LFD', year_start: '16', year_end: '현재', code: 'LFD', category: '중형 세단' },
  // 르노 콜레오스
  { maker: '르노', model: '콜레오스', sub: '그랑 콜레오스 OV6', year_start: '24', year_end: '현재', code: 'OV6', category: '중형 SUV' },
  // 기아 카니발 KA4 하이리무진/특장
  { maker: '기아', model: '카니발', sub: '카니발 KA4 하이리무진', year_start: '20', year_end: '23', code: 'KA4', category: '대형 MPV' },
  { maker: '기아', model: '카니발', sub: '더 뉴 카니발 KA4 하이리무진 (페리)', year_start: '23', year_end: '현재', code: 'KA4', category: '대형 MPV' },
  // 기아 EV6
  { maker: '기아', model: 'EV6', sub: 'EV6 CV', year_start: '21', year_end: '현재', code: 'CV', category: '준중형 EV' },
  // 현대 캐스퍼
  { maker: '현대', model: '캐스퍼', sub: '캐스퍼 AX1', year_start: '21', year_end: '현재', code: 'AX1', category: '경 SUV' },
  // 현대 코나
  { maker: '현대', model: '코나', sub: '코나 OS', year_start: '17', year_end: '23', code: 'OS', category: '소형 SUV' },
  { maker: '현대', model: '코나', sub: '코나 SX2', year_start: '23', year_end: '현재', code: 'SX2', category: '소형 SUV' },
  // 현대 스타리아
  { maker: '현대', model: '스타리아', sub: '스타리아 US4', year_start: '21', year_end: '현재', code: 'US4', category: '대형 MPV' },
  { maker: '현대', model: '스타리아', sub: '스타리아 투어러 US4', year_start: '21', year_end: '현재', code: 'US4', category: '대형 MPV' },
  { maker: '현대', model: '스타리아', sub: '스타리아 라운지 US4', year_start: '21', year_end: '현재', code: 'US4', category: '대형 MPV' },
  // 현대 싼타페 MX5
  { maker: '현대', model: '싼타페', sub: '싼타페 MX5', year_start: '23', year_end: '현재', code: 'MX5', category: '중형 SUV' },
  { maker: '현대', model: '싼타페', sub: '싼타페 TM', year_start: '18', year_end: '20', code: 'TM', category: '중형 SUV' },
  // 현대 투싼
  { maker: '현대', model: '투싼', sub: '투싼 NX4', year_start: '20', year_end: '24', code: 'NX4', category: '준중형 SUV' },
  { maker: '현대', model: '투싼', sub: '더 뉴 투싼 NX4 (페리)', year_start: '24', year_end: '현재', code: 'NX4', category: '준중형 SUV' },
  // 현대 아반떼 PE / N라인
  { maker: '현대', model: '아반떼', sub: '아반떼 CN7 (페리)', year_start: '23', year_end: '현재', code: 'CN7', category: '준중형 세단' },
  { maker: '현대', model: '아반떼', sub: '아반떼 N CN7', year_start: '21', year_end: '현재', code: 'CN7', category: '준중형 세단' },
  // 제네시스 G90
  { maker: '제네시스', model: 'G90', sub: 'G90 RS4', year_start: '22', year_end: '현재', code: 'RS4', category: '대형 세단' },
  // 제네시스 G70
  { maker: '제네시스', model: 'G70', sub: 'G70 IK', year_start: '17', year_end: '현재', code: 'IK', category: '준중형 세단' },
  // 르노 필랑트
  { maker: '르노', model: '필랑트', sub: '필랑트 E-Tech', year_start: '24', year_end: '현재', code: '-', category: '소형 SUV' },
  // 쉐보레 스파크
  { maker: '쉐보레', model: '스파크', sub: '스파크 M400', year_start: '15', year_end: '22', code: 'M400', category: '경차' },
  { maker: '쉐보레', model: '스파크', sub: '더 뉴 스파크 M400 (페리)', year_start: '18', year_end: '22', code: 'M400', category: '경차' },
  // 쉐보레 트랙스
  { maker: '쉐보레', model: '트랙스', sub: '트랙스 크로스오버 CUV', year_start: '23', year_end: '현재', code: 'CUV', category: '소형 SUV' },
  // KGM 액티언
  { maker: 'KGM', model: '액티언', sub: '액티언', year_start: '24', year_end: '현재', code: '-', category: '중형 SUV' },
  // BMW 시리즈 추가
  { maker: 'BMW', model: '4시리즈', sub: '4시리즈 F32', year_start: '13', year_end: '20', code: 'F32', category: '준중형 쿠페' },
  { maker: 'BMW', model: '4시리즈', sub: '4시리즈 G22', year_start: '20', year_end: '현재', code: 'G22', category: '준중형 쿠페' },
  { maker: 'BMW', model: '5시리즈', sub: '5시리즈 G30', year_start: '17', year_end: '23', code: 'G30', category: '중형 세단' },
  { maker: 'BMW', model: '5시리즈', sub: '5시리즈 G60', year_start: '23', year_end: '현재', code: 'G60', category: '중형 세단' },
  { maker: 'BMW', model: '7시리즈', sub: '7시리즈 G70', year_start: '22', year_end: '현재', code: 'G70', category: '대형 세단' },
  { maker: 'BMW', model: 'X1', sub: 'X1 F48', year_start: '15', year_end: '22', code: 'F48', category: '소형 SUV' },
  { maker: 'BMW', model: 'X1', sub: 'X1 U11', year_start: '22', year_end: '현재', code: 'U11', category: '소형 SUV' },
  { maker: 'BMW', model: 'X3', sub: 'X3 G01', year_start: '17', year_end: '24', code: 'G01', category: '중형 SUV' },
  { maker: 'BMW', model: 'X4', sub: 'X4 G02', year_start: '18', year_end: '현재', code: 'G02', category: '중형 SUV' },
  { maker: 'BMW', model: 'X5', sub: 'X5 G05', year_start: '18', year_end: '현재', code: 'G05', category: '대형 SUV' },
  { maker: 'BMW', model: 'X6', sub: 'X6 G06', year_start: '19', year_end: '현재', code: 'G06', category: '대형 SUV' },
  { maker: 'BMW', model: 'X7', sub: 'X7 G07', year_start: '19', year_end: '현재', code: 'G07', category: '대형 SUV' },
  { maker: 'BMW', model: 'Z4', sub: 'Z4 G29', year_start: '18', year_end: '현재', code: 'G29', category: '소형 컨버터블' },
  { maker: 'BMW', model: 'M4', sub: 'M4 G82', year_start: '20', year_end: '현재', code: 'G82', category: '준중형 쿠페' },
  // 벤츠 시리즈 추가 (E시리즈 등 별칭 지원)
  { maker: '벤츠', model: 'E-클래스', sub: 'E-클래스 W214', year_start: '24', year_end: '현재', code: 'W214', category: '중형 세단' },
  { maker: '벤츠', model: 'GLC', sub: 'GLC 쿠페 X254', year_start: '23', year_end: '현재', code: 'X254', category: '중형 SUV' },
  { maker: '벤츠', model: 'GLE', sub: 'GLE 쿠페 C167', year_start: '19', year_end: '현재', code: 'C167', category: '준대형 SUV' },
  { maker: '벤츠', model: 'GLS', sub: 'GLS X167', year_start: '19', year_end: '현재', code: 'X167', category: '대형 SUV' },
  { maker: '벤츠', model: 'S-클래스', sub: 'S-클래스 W222', year_start: '13', year_end: '20', code: 'W222', category: '대형 세단' },
  { maker: '벤츠', model: 'S-클래스', sub: 'S-클래스 W223', year_start: '20', year_end: '현재', code: 'W223', category: '대형 세단' },
  { maker: '벤츠', model: 'A-클래스', sub: 'A-클래스 W177', year_start: '18', year_end: '현재', code: 'W177', category: '준중형 해치백' },
  { maker: '벤츠', model: 'CLE', sub: 'CLE 카브리올레 A236', year_start: '24', year_end: '현재', code: 'A236', category: '준중형 컨버터블' },
  { maker: '벤츠', model: 'EQS', sub: 'EQS V297', year_start: '21', year_end: '현재', code: 'V297', category: '대형 EV 세단' },
  { maker: '벤츠', model: 'AMG GT', sub: 'AMG GT', year_start: '15', year_end: '현재', code: '-', category: '준중형 쿠페' },
  { maker: '벤츠', model: 'G-클래스', sub: 'G-클래스 W463', year_start: '18', year_end: '현재', code: 'W463', category: '중형 SUV' },
  // 아우디 시리즈 추가
  { maker: '아우디', model: 'A3', sub: 'A3 8Y', year_start: '20', year_end: '현재', code: '8Y', category: '준중형 세단' },
  { maker: '아우디', model: 'A4', sub: 'A4 B9', year_start: '15', year_end: '24', code: 'B9', category: '준중형 세단' },
  { maker: '아우디', model: 'A5', sub: 'A5 F5', year_start: '16', year_end: '24', code: 'F5', category: '준중형 쿠페' },
  { maker: '아우디', model: 'A6', sub: 'A6 C8', year_start: '18', year_end: '현재', code: 'C8', category: '중형 세단' },
  { maker: '아우디', model: 'A7', sub: 'A7 C8', year_start: '18', year_end: '현재', code: 'C8', category: '중형 세단' },
  { maker: '아우디', model: 'A8', sub: 'A8 D5', year_start: '17', year_end: '현재', code: 'D5', category: '대형 세단' },
  { maker: '아우디', model: 'Q3', sub: 'Q3 F3', year_start: '18', year_end: '현재', code: 'F3', category: '소형 SUV' },
  { maker: '아우디', model: 'Q5', sub: 'Q5 FY', year_start: '17', year_end: '현재', code: 'FY', category: '중형 SUV' },
  { maker: '아우디', model: 'Q7', sub: 'Q7 4M', year_start: '15', year_end: '현재', code: '4M', category: '대형 SUV' },
  { maker: '아우디', model: 'Q8', sub: 'Q8 4M', year_start: '18', year_end: '현재', code: '4M', category: '대형 SUV' },
  // 포르쉐 추가
  { maker: '포르쉐', model: '박스터', sub: '박스터 982', year_start: '16', year_end: '현재', code: '982', category: '소형 컨버터블' },
  { maker: '포르쉐', model: '카이엔', sub: '카이엔 PO536', year_start: '17', year_end: '현재', code: 'PO536', category: '대형 SUV' },
  { maker: '포르쉐', model: '카이엔 쿠페', sub: '카이엔 쿠페 PO536', year_start: '19', year_end: '현재', code: 'PO536', category: '대형 SUV' },
  { maker: '포르쉐', model: '타이칸', sub: '타이칸 J1', year_start: '20', year_end: '현재', code: 'J1', category: '중형 EV 세단' },
  // 폭스바겐 아테온
  { maker: '폭스바겐', model: '아테온', sub: '아테온', year_start: '17', year_end: '현재', code: '-', category: '중형 세단' },
  // 도요타 알파드
  { maker: '토요타', model: '알파드', sub: '알파드', year_start: '15', year_end: '현재', code: '-', category: '대형 MPV' },
  // 렉서스 LM
  { maker: '렉서스', model: 'LM', sub: 'LM500h', year_start: '23', year_end: '현재', code: '-', category: '대형 MPV' },
  // 마세라티 기블리
  { maker: '마세라티', model: '기블리', sub: '기블리', year_start: '13', year_end: '현재', code: '-', category: '중형 세단' },
  // 페라리 SF90
  { maker: '페라리', model: 'SF90', sub: 'SF90 스파이더', year_start: '19', year_end: '현재', code: '-', category: '슈퍼카' },
  // 람보르기니
  { maker: '람보르기니', model: '우르스', sub: '우르스', year_start: '18', year_end: '현재', code: '-', category: '대형 SUV' },
  { maker: '람보르기니', model: '가야르도', sub: '가야르도 LP550-2', year_start: '03', year_end: '13', code: '-', category: '슈퍼카' },
  // 벤틀리
  { maker: '벤틀리', model: '컨티넨탈 GT', sub: '컨티넨탈 GT', year_start: '03', year_end: '현재', code: '-', category: '대형 쿠페' },
  // 캐딜락
  { maker: '캐딜락', model: '에스컬레이드', sub: '에스컬레이드', year_start: '06', year_end: '현재', code: '-', category: '대형 SUV' },
  // 롤스로이스
  { maker: '롤스로이스', model: '컬리넌', sub: '컬리넌', year_start: '18', year_end: '현재', code: '-', category: '대형 SUV' },
  // 포드 머스탱
  { maker: '포드', model: '머스탱', sub: '머스탱 GT', year_start: '15', year_end: '현재', code: '-', category: '대형 쿠페' },
  // GM대우 (구형) → 쉐보레로 통합
  // 기아 팰리세이드 — 현대 모델인데 데이터에 잘못 들어옴 → MAKER_FIX에서 처리
  // 기아 K5 / 카니발 / 모하비 / 모닝 / 레이 / 셀토스 / 쏘렌토 / 스포티지 등 trim 정보 포함된 sub는 SUB_FIX에서 처리
];

// 인기 제조사 순위
const MAKER_POPULARITY = [
  '현대', '기아', '제네시스', 'KGM', '쌍용', '르노코리아', '르노', '르노삼성', '쉐보레', 'GM',
  'BMW', '메르세데스-벤츠', '벤츠', '아우디', '폭스바겐', '포르쉐', '미니',
  '테슬라', '볼보', '재규어', '랜드로버', '렉서스', '토요타', '혼다', '닛산',
  '인피니티', '캐딜락', '포드', '링컨', '크라이슬러', '지프', '닷지',
  '푸조', '시트로엥', '피아트', '마세라티', '람보르기니', '페라리', '벤틀리', '롤스로이스',
];

const _makerRank = new Map(MAKER_POPULARITY.map((m, i) => [m, i]));
const _rank = (m) => _makerRank.has(m) ? _makerRank.get(m) : 9999;

/** 제조사 목록 — 인기 순 정렬 */
export function getMakers() {
  const all = [...new Set(CAR_MODELS.map(m => m.maker))];
  return all.sort((a, b) => _rank(a) - _rank(b) || a.localeCompare(b, 'ko'));
}

/** 특정 제조사의 모델명 목록 — 등록 항목 수가 많은 순 */
export function getModels(maker) {
  if (!maker) return [];
  const counts = new Map();
  CAR_MODELS.filter(m => m.maker === maker).forEach(m => {
    counts.set(m.model, (counts.get(m.model) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
    .map(([name]) => name);
}

/** 특정 제조사+모델명의 세부모델 목록 — 연식 큰(최신) 것이 위 */
export function getSubModels(maker, model) {
  if (!maker || !model) return [];
  return CAR_MODELS
    .filter(m => m.maker === maker && m.model === model)
    .sort((a, b) => Number(b.year_start || 0) - Number(a.year_start || 0))
    .map(m => m.sub);
}

/** 세부모델로 차종구분(category) 조회 */
export function getCategory(maker, model, sub) {
  const found = CAR_MODELS.find(m => m.maker === maker && m.model === model && m.sub === sub);
  return found ? found.category : '';
}

/** 세부모델로 코드명(model_code) 조회 */
export function getModelCode(maker, model, sub) {
  const found = CAR_MODELS.find(m => m.maker === maker && m.model === model && m.sub === sub);
  return found ? found.code : '';
}
