/**
 * car-models.js — 차량 모델 마스터 데이터
 * 출처: freepasserp 공유 시트 + 누락 차종 보완
 * https://docs.google.com/spreadsheets/d/1UYUutPTmD76mWzEV5x0-e39ngihp5vduQdV0YEiX_RQ/edit?gid=0
 *
 * 색상은 별도 마스터 (color-codes.js) 에서 관리
 */

export const CAR_MODELS = [
  { maker: '기아', model: '니로', sub: '니로 SG2 22~', year_start: '22', year_end: '현재', code: 'SG2', category: '소형 SUV' },
  { maker: '기아', model: '니로', sub: '니로 EV SG2 22~', year_start: '22', year_end: '현재', code: 'SG2', category: '소형 EV' },
  { maker: '기아', model: '레이', sub: '레이 TAM 11~', year_start: '11', year_end: '17', code: 'TAM', category: '경차' },
  { maker: '기아', model: '레이', sub: '더 뉴 레이 TAM (페리) 17~', year_start: '17', year_end: '22', code: 'TAM', category: '경차' },
  { maker: '기아', model: '레이', sub: '더 뉴 기아 레이 TAM (페리2) 22~', year_start: '22', year_end: '현재', code: 'TAM', category: '경차' },
  { maker: '기아', model: '모닝', sub: '모닝 JA 17~', year_start: '17', year_end: '20', code: 'JA', category: '경차' },
  { maker: '기아', model: '모닝', sub: '더 뉴 모닝 JA (페리) 20~', year_start: '20', year_end: '23', code: 'JA', category: '경차' },
  { maker: '기아', model: '모닝', sub: '더 뉴 기아 모닝 JA (페리2) 23~', year_start: '23', year_end: '현재', code: 'JA', category: '경차' },
  { maker: '기아', model: '셀토스', sub: '셀토스 SP2 19~', year_start: '19', year_end: '22', code: 'SP2', category: '소형 SUV' },
  { maker: '기아', model: '셀토스', sub: '더 뉴 셀토스 SP2 (페리) 22~', year_start: '22', year_end: '현재', code: 'SP2', category: '소형 SUV' },
  { maker: '기아', model: '쏘렌토', sub: '쏘렌토 MQ4 20~', year_start: '20', year_end: '23', code: 'MQ4', category: '중형 SUV' },
  { maker: '기아', model: '쏘렌토', sub: '더 뉴 쏘렌토 MQ4 (페리) 23~', year_start: '23', year_end: '현재', code: 'MQ4', category: '중형 SUV' },
  { maker: '기아', model: '쏘렌토', sub: '쏘렌토 UM 14~', year_start: '14', year_end: '17', code: 'UM', category: '중형 SUV' },
  { maker: '기아', model: '쏘렌토', sub: '더 뉴 쏘렌토 UM (페리) 17~', year_start: '17', year_end: '20', code: 'UM', category: '중형 SUV' },
  { maker: '기아', model: '스포티지', sub: '스포티지 NQ5 21~', year_start: '21', year_end: '24', code: 'NQ5', category: '준중형 SUV' },
  { maker: '기아', model: '스포티지', sub: '더 뉴 스포티지 NQ5 (페리) 24~', year_start: '24', year_end: '현재', code: 'NQ5', category: '준중형 SUV' },
  { maker: '기아', model: '스포티지', sub: '스포티지 QL 15~', year_start: '15', year_end: '18', code: 'QL', category: '준중형 SUV' },
  { maker: '기아', model: '스포티지', sub: '스포티지 더 볼드 QL (페리) 18~', year_start: '18', year_end: '21', code: 'QL', category: '준중형 SUV' },
  { maker: '기아', model: '스팅어', sub: '스팅어 CK 17~', year_start: '17', year_end: '20', code: 'CK', category: '스포츠 세단' },
  { maker: '기아', model: '스팅어', sub: '스팅어 마이스터 CK (페리) 20~', year_start: '20', year_end: '23', code: 'CK', category: '스포츠 세단' },
  { maker: '기아', model: '카니발', sub: '카니발 KA4 20~', year_start: '20', year_end: '23', code: 'KA4', category: '대형 MPV' },
  { maker: '기아', model: '카니발', sub: '더 뉴 카니발 KA4 (페리) 23~', year_start: '23', year_end: '현재', code: 'KA4', category: '대형 MPV' },
  { maker: '기아', model: '카니발', sub: '카니발 YP 14~', year_start: '14', year_end: '18', code: 'YP', category: '대형 MPV' },
  { maker: '기아', model: '카니발', sub: '더 뉴 카니발 YP (페리) 18~', year_start: '18', year_end: '20', code: 'YP', category: '대형 MPV' },
  { maker: '기아', model: 'K3', sub: 'K3 BD 18~', year_start: '18', year_end: '21', code: 'BD', category: '준중형 세단' },
  { maker: '기아', model: 'K3', sub: '더 뉴 K3 BD (페리) 21~', year_start: '21', year_end: '24', code: 'BD', category: '준중형 세단' },
  { maker: '기아', model: 'K5', sub: 'K5 DL3 19~', year_start: '19', year_end: '23', code: 'DL3', category: '중형 세단' },
  { maker: '기아', model: 'K5', sub: '더 뉴 K5 DL3 (페리) 23~', year_start: '23', year_end: '현재', code: 'DL3', category: '중형 세단' },
  { maker: '기아', model: 'K5', sub: 'K5 JF 15~', year_start: '15', year_end: '18', code: 'JF', category: '중형 세단' },
  { maker: '기아', model: 'K5', sub: '더 뉴 K5 JF (페리) 18~', year_start: '18', year_end: '19', code: 'JF', category: '중형 세단' },
  { maker: '기아', model: 'K8', sub: 'K8 GL3 21~', year_start: '21', year_end: '24', code: 'GL3', category: '준대형 세단' },
  { maker: '기아', model: 'K8', sub: '더 뉴 K8 GL3 (페리) 24~', year_start: '24', year_end: '현재', code: 'GL3', category: '준대형 세단' },
  { maker: '기아', model: 'K9', sub: 'K9 RJ 18~', year_start: '18', year_end: '21', code: 'RJ', category: '대형 세단' },
  { maker: '기아', model: 'K9', sub: '더 뉴 K9 RJ (페리) 21~', year_start: '21', year_end: '현재', code: 'RJ', category: '대형 세단' },
  { maker: '기아', model: 'EV3', sub: 'EV3 SV1 24~', year_start: '24', year_end: '현재', code: 'SV1', category: '소형 EV SUV' },
  { maker: '기아', model: 'EV6', sub: 'EV6 CV 21~', year_start: '21', year_end: '24', code: 'CV', category: '준중형 EV' },
  { maker: '기아', model: 'EV6', sub: '더 뉴 EV6 CV (페리) 24~', year_start: '24', year_end: '현재', code: 'CV', category: '준중형 EV' },
  { maker: '기아', model: 'EV9', sub: 'EV9 MV 23~', year_start: '23', year_end: '현재', code: 'MV', category: '대형 EV SUV' },
  { maker: '르노', model: '아르카나', sub: '아르카나 LJB 24~', year_start: '24', year_end: '현재', code: 'LJB', category: '소형 SUV' },
  { maker: '르노', model: '콜레오스', sub: '그랑 콜레오스 OV6 24~', year_start: '24', year_end: '현재', code: 'OV6', category: '중형 SUV' },
  { maker: '르노', model: 'QM6', sub: 'QM6 HZG 16~', year_start: '16', year_end: '현재', code: 'HZG', category: '중형 SUV' },
  { maker: '르노', model: 'SM6', sub: 'SM6 LFD 16~', year_start: '16', year_end: '현재', code: 'LFD', category: '중형 세단' },
  { maker: '르노', model: 'XM3', sub: 'XM3 LJB 20~', year_start: '20', year_end: '24', code: 'LJB', category: '소형 SUV' },
  { maker: '제네시스', model: 'G70', sub: 'G70 IK 17~', year_start: '17', year_end: '20', code: 'IK', category: '중형 세단' },
  { maker: '제네시스', model: 'G70', sub: '더 뉴 G70 IK (페리) 20~', year_start: '20', year_end: '현재', code: 'IK', category: '중형 세단' },
  { maker: '제네시스', model: 'G80', sub: 'G80 DH 페리 16~', year_start: '16', year_end: '20', code: 'DH', category: '준대형 세단' },
  { maker: '제네시스', model: 'G80', sub: 'G80 RG3 20~', year_start: '20', year_end: '23', code: 'RG3', category: '준대형 세단' },
  { maker: '제네시스', model: 'G80', sub: '더 뉴 G80 RG3 (페리) 23~', year_start: '23', year_end: '현재', code: 'RG3', category: '준대형 세단' },
  { maker: '제네시스', model: 'G90', sub: 'G90 HI 15~', year_start: '15', year_end: '18', code: 'HI', category: '대형 세단' },
  { maker: '제네시스', model: 'G90', sub: '더 뉴 G90 HI (페리) 18~', year_start: '18', year_end: '21', code: 'HI', category: '대형 세단' },
  { maker: '제네시스', model: 'G90', sub: 'G90 RS4 21~', year_start: '21', year_end: '현재', code: 'RS4', category: '대형 세단' },
  { maker: '제네시스', model: 'GV60', sub: 'GV60 JW1 21~', year_start: '21', year_end: '현재', code: 'JW1', category: '준중형 EV SUV' },
  { maker: '제네시스', model: 'GV70', sub: 'GV70 JK1 20~', year_start: '20', year_end: '24', code: 'JK1', category: '중형 SUV' },
  { maker: '제네시스', model: 'GV70', sub: '더 뉴 GV70 JK1 (페리) 24~', year_start: '24', year_end: '현재', code: 'JK1', category: '중형 SUV' },
  { maker: '제네시스', model: 'GV80', sub: 'GV80 JX1 20~', year_start: '20', year_end: '23', code: 'JX1', category: '준대형 SUV' },
  { maker: '제네시스', model: 'GV80', sub: '더 뉴 GV80 JX1 (페리) 23~', year_start: '23', year_end: '현재', code: 'JX1', category: '준대형 SUV' },
  { maker: '현대', model: '그랜저', sub: '그랜저 GN7 22~', year_start: '22', year_end: '현재', code: 'GN7', category: '준대형 세단' },
  { maker: '현대', model: '그랜저', sub: '그랜저 IG 16~', year_start: '16', year_end: '19', code: 'IG', category: '준대형 세단' },
  { maker: '현대', model: '그랜저', sub: '더 뉴 그랜저 IG (페리) 19~', year_start: '19', year_end: '22', code: 'IG', category: '준대형 세단' },
  { maker: '현대', model: '넥쏘', sub: '넥쏘 FE 18~', year_start: '18', year_end: '현재', code: 'FE', category: '수소 SUV' },
  { maker: '현대', model: '싼타페', sub: '싼타페 MX5 23~', year_start: '23', year_end: '현재', code: 'MX5', category: '중형 SUV' },
  { maker: '현대', model: '싼타페', sub: '싼타페 TM 18~', year_start: '18', year_end: '20', code: 'TM', category: '중형 SUV' },
  { maker: '현대', model: '싼타페', sub: '더 뉴 싼타페 TM (페리) 20~', year_start: '20', year_end: '23', code: 'TM', category: '중형 SUV' },
  { maker: '현대', model: '쏘나타', sub: '쏘나타 DN8 19~', year_start: '19', year_end: '23', code: 'DN8', category: '중형 세단' },
  { maker: '현대', model: '쏘나타', sub: '쏘나타 디 엣지 DN8 (페리) 23~', year_start: '23', year_end: '현재', code: 'DN8', category: '중형 세단' },
  { maker: '현대', model: '쏘나타', sub: '쏘나타 뉴 라이즈 LF (페리) 17~', year_start: '17', year_end: '19', code: 'LF', category: '중형 세단' },
  { maker: '현대', model: '아반떼', sub: '아반떼 AD 15~', year_start: '15', year_end: '18', code: 'AD', category: '준중형 세단' },
  { maker: '현대', model: '아반떼', sub: '더 뉴 아반떼 AD (페리) 18~', year_start: '18', year_end: '20', code: 'AD', category: '준중형 세단' },
  { maker: '현대', model: '아반떼', sub: '아반떼 CN7 20~', year_start: '20', year_end: '23', code: 'CN7', category: '준중형 세단' },
  { maker: '현대', model: '아반떼', sub: '더 뉴 아반떼 CN7 (페리) 23~', year_start: '23', year_end: '현재', code: 'CN7', category: '준중형 세단' },
  { maker: '현대', model: '아이오닉5', sub: '아이오닉5 NE 21~', year_start: '21', year_end: '24', code: 'NE', category: '준중형 EV' },
  { maker: '현대', model: '아이오닉5', sub: '더 뉴 아이오닉5 NE (페리) 24~', year_start: '24', year_end: '현재', code: 'NE', category: '준중형 EV' },
  { maker: '현대', model: '아이오닉6', sub: '아이오닉6 CE 22~', year_start: '22', year_end: '현재', code: 'CE', category: '중형 EV 세단' },
  { maker: '현대', model: '코나', sub: '코나 OS 17~', year_start: '17', year_end: '20', code: 'OS', category: '소형 SUV' },
  { maker: '현대', model: '코나', sub: '더 뉴 코나 OS (페리) 20~', year_start: '20', year_end: '23', code: 'OS', category: '소형 SUV' },
  { maker: '현대', model: '코나', sub: '코나 SX2 23~', year_start: '23', year_end: '현재', code: 'SX2', category: '소형 SUV' },
  { maker: '현대', model: '투싼', sub: '투싼 NX4 20~', year_start: '20', year_end: '23', code: 'NX4', category: '준중형 SUV' },
  { maker: '현대', model: '투싼', sub: '더 뉴 투싼 NX4 (페리) 23~', year_start: '23', year_end: '현재', code: 'NX4', category: '준중형 SUV' },
  { maker: '현대', model: '투싼', sub: '투싼 TL (페리) 18~', year_start: '18', year_end: '20', code: 'TL', category: '준중형 SUV' },
  { maker: '현대', model: '팰리세이드', sub: '팰리세이드 LX2 18~', year_start: '18', year_end: '22', code: 'LX2', category: '대형 SUV' },
  { maker: '현대', model: '팰리세이드', sub: '더 뉴 팰리세이드 LX2 (페리) 22~', year_start: '22', year_end: '24', code: 'LX2', category: '대형 SUV' },
  { maker: '현대', model: '팰리세이드', sub: '팰리세이드 LX3 25~', year_start: '25', year_end: '현재', code: 'LX3', category: '대형 SUV' },
  { maker: 'KGM', model: '렉스턴', sub: '렉스턴 Y400 17~', year_start: '17', year_end: '20', code: 'Y400', category: '대형 SUV' },
  { maker: 'KGM', model: '렉스턴', sub: '올뉴 렉스턴 Y450 20~', year_start: '20', year_end: '23', code: 'Y450', category: '대형 SUV' },
  { maker: 'KGM', model: '렉스턴', sub: '렉스턴 뉴아레나 Y450 (페리) 23~', year_start: '23', year_end: '현재', code: 'Y450', category: '대형 SUV' },
  { maker: 'KGM', model: '렉스턴 스포츠', sub: '렉스턴 스포츠 Q200 18~', year_start: '18', year_end: '21', code: 'Q200', category: '픽업트럭' },
  { maker: 'KGM', model: '렉스턴 스포츠', sub: '렉스턴 스포츠 Q200 (페리) 21~', year_start: '21', year_end: '현재', code: 'Q200', category: '픽업트럭' },
  { maker: 'KGM', model: '코란도', sub: '뷰티풀 코란도 C300 19~', year_start: '19', year_end: '현재', code: 'C300', category: '준중형 SUV' },
  { maker: 'KGM', model: '티볼리', sub: '티볼리 X100 15~', year_start: '15', year_end: '19', code: 'X100', category: '소형 SUV' },
  { maker: 'KGM', model: '티볼리', sub: '베리 뉴 티볼리 X150 (페리) 19~', year_start: '19', year_end: '23', code: 'X150', category: '소형 SUV' },
  { maker: 'KGM', model: '티볼리', sub: '더 뉴 티볼리 X150 (페리2) 23~', year_start: '23', year_end: '현재', code: 'X150', category: '소형 SUV' },
  { maker: 'KGM', model: '토레스', sub: '토레스 J100 22~', year_start: '22', year_end: '현재', code: 'J100', category: '중형 SUV' },
  { maker: 'KGM', model: '토레스', sub: '토레스 EVX U100 23~', year_start: '23', year_end: '현재', code: 'U100', category: '중형 EV SUV' },
  { maker: '쉐보레', model: '트랙스', sub: '트랙스 9BQC 23~', year_start: '23', year_end: '현재', code: '9BQC', category: '소형 SUV' },
  { maker: '쉐보레', model: '트레일블레이저', sub: '트레일블레이저 9BYC 20~', year_start: '20', year_end: '23', code: '9BYC', category: '소형 SUV' },
  { maker: '쉐보레', model: '트레일블레이저', sub: '더 뉴 트레일블레이저 9BYC (페리) 23~', year_start: '23', year_end: '현재', code: '9BYC', category: '소형 SUV' },
  { maker: 'BMW', model: '3시리즈', sub: '3시리즈 F30 12~', year_start: '12', year_end: '19', code: 'F30', category: '준중형 세단' },
  { maker: 'BMW', model: '3시리즈', sub: '3시리즈 G20 19~', year_start: '19', year_end: '22', code: 'G20', category: '준중형 세단' },
  { maker: 'BMW', model: '3시리즈', sub: '3시리즈 G20 페리 (LCI) 22~', year_start: '22', year_end: '현재', code: 'G20', category: '준중형 세단' },
  { maker: 'BMW', model: '5시리즈', sub: '5시리즈 G30 17~', year_start: '17', year_end: '20', code: 'G30', category: '중형 세단' },
  { maker: 'BMW', model: '5시리즈', sub: '5시리즈 G30 페리 (LCI) 20~', year_start: '20', year_end: '23', code: 'G30', category: '중형 세단' },
  { maker: 'BMW', model: '5시리즈', sub: '5시리즈 G60 23~', year_start: '23', year_end: '현재', code: 'G60', category: '중형 세단' },
  { maker: 'BMW', model: '4시리즈', sub: '4시리즈 F32 13~', year_start: '13', year_end: '20', code: 'F32', category: '준중형 쿠페' },
  { maker: 'BMW', model: '4시리즈', sub: '4시리즈 G22 20~', year_start: '20', year_end: '현재', code: 'G22', category: '준중형 쿠페' },
  { maker: 'BMW', model: 'X1', sub: 'X1 F48 15~', year_start: '15', year_end: '22', code: 'F48', category: '소형 SUV' },
  { maker: 'BMW', model: 'X1', sub: 'X1 U11 22~', year_start: '22', year_end: '현재', code: 'U11', category: '소형 SUV' },
  { maker: 'BMW', model: 'X4', sub: 'X4 G02 18~', year_start: '18', year_end: '현재', code: 'G02', category: '중형 SUV' },
  { maker: 'BMW', model: 'X3', sub: 'X3 G01 17~', year_start: '17', year_end: '21', code: 'G01', category: '중형 SUV' },
  { maker: 'BMW', model: 'X3', sub: 'X3 G01 페리 (LCI) 21~', year_start: '21', year_end: '24', code: 'G01', category: '중형 SUV' },
  { maker: 'BMW', model: 'X5', sub: 'X5 G05 19~', year_start: '19', year_end: '23', code: 'G05', category: '준대형 SUV' },
  { maker: 'BMW', model: 'X5', sub: 'X5 G05 페리 (LCI) 23~', year_start: '23', year_end: '현재', code: 'G05', category: '준대형 SUV' },
  { maker: '벤츠', model: 'C-클래스', sub: 'C-클래스 W205 14~', year_start: '14', year_end: '21', code: 'W205', category: '준중형 세단' },
  { maker: '벤츠', model: 'C-클래스', sub: 'C-클래스 W206 21~', year_start: '21', year_end: '현재', code: 'W206', category: '준중형 세단' },
  { maker: '벤츠', model: 'E-클래스', sub: 'E-클래스 W213 16~', year_start: '16', year_end: '20', code: 'W213', category: '중형 세단' },
  { maker: '벤츠', model: 'E-클래스', sub: '더 뉴 E-클래스 W213 (페리) 20~', year_start: '20', year_end: '24', code: 'W213', category: '중형 세단' },
  { maker: '벤츠', model: 'E-클래스', sub: 'E-클래스 W214 24~', year_start: '24', year_end: '현재', code: 'W214', category: '중형 세단' },
  { maker: '벤츠', model: 'GLC', sub: 'GLC X253 페리 (페리) 19~', year_start: '19', year_end: '23', code: 'X253', category: '중형 SUV' },
  { maker: '벤츠', model: 'GLC', sub: 'GLC X254 23~', year_start: '23', year_end: '현재', code: 'X254', category: '중형 SUV' },
  { maker: '벤츠', model: 'GLE', sub: 'GLE V167 19~', year_start: '19', year_end: '23', code: 'V167', category: '준대형 SUV' },
  { maker: '벤츠', model: 'GLE', sub: 'GLE V167 페리 (페리) 23~', year_start: '23', year_end: '현재', code: 'V167', category: '준대형 SUV' },
  { maker: '아우디', model: 'A6', sub: 'A6 C7 (페리) 15~', year_start: '15', year_end: '19', code: 'C7', category: '중형 세단' },
  { maker: '아우디', model: 'A6', sub: 'A6 C8 19~', year_start: '19', year_end: '23', code: 'C8', category: '중형 세단' },
  { maker: '아우디', model: 'A6', sub: 'A6 C8 (페리) 23~', year_start: '23', year_end: '현재', code: 'C8', category: '중형 세단' },
  { maker: '테슬라', model: '모델 3', sub: '모델 3 19~', year_start: '19', year_end: '23', code: '-', category: '중형 EV 세단' },
  { maker: '테슬라', model: '모델 3', sub: '모델 3 하이랜드 (페리) 24~', year_start: '24', year_end: '현재', code: '-', category: '중형 EV 세단' },
  { maker: '테슬라', model: '모델 Y', sub: '모델 Y 21~', year_start: '21', year_end: '24', code: '-', category: '중형 EV SUV' },
  { maker: '테슬라', model: '모델 Y', sub: '모델 Y 주니퍼 (페리) 25~', year_start: '25', year_end: '현재', code: '-', category: '중형 EV SUV' },
  { maker: '현대', model: '캐스퍼', sub: '캐스퍼 AX1 21~', year_start: '21', year_end: '현재', code: 'AX1', category: '경형 SUV' },
  { maker: '현대', model: '캐스퍼', sub: '캐스퍼 일렉트릭 AX1 EV 24~', year_start: '24', year_end: '현재', code: 'AX1', category: '경형 EV' },
  { maker: '현대', model: '스타리아', sub: '스타리아 US4 21~', year_start: '21', year_end: '24', code: 'US4', category: '대형 MPV' },
  { maker: '현대', model: '스타리아', sub: '더 뉴 스타리아 US4 (페리) 24~', year_start: '24', year_end: '현재', code: 'US4', category: '대형 MPV' },
  { maker: '현대', model: '포터2', sub: '포터2 HR 04~', year_start: '04', year_end: '현재', code: 'HR', category: '소형 트럭' },
  { maker: '현대', model: '포터2', sub: '포터2 일렉트릭 HR EV 19~', year_start: '19', year_end: '현재', code: 'HR', category: '소형 EV 트럭' },
  { maker: '현대', model: '베뉴', sub: '베뉴 QX 19~', year_start: '19', year_end: '현재', code: 'QX', category: '소형 SUV' },
  { maker: '현대', model: '아이오닉9', sub: '아이오닉9 24~', year_start: '24', year_end: '현재', code: '-', category: '대형 EV SUV' },
  { maker: '기아', model: '봉고3', sub: '봉고3 PU 04~', year_start: '04', year_end: '현재', code: 'PU', category: '소형 트럭' },
  { maker: '기아', model: '봉고3', sub: '봉고3 EV PU EV 20~', year_start: '20', year_end: '현재', code: 'PU', category: '소형 EV 트럭' },
  { maker: '기아', model: '타스만', sub: '타스만 TK 25~', year_start: '25', year_end: '현재', code: 'TK', category: '픽업트럭' },
  { maker: 'KGM', model: '액티언', sub: '더 뉴 액티언 J120 24~', year_start: '24', year_end: '현재', code: 'J120', category: '중형 SUV' },

  // ─── 추가: 기아 K7 (단종, 데이터 31건) ──────────────
  { maker: '기아', model: 'K7', sub: '올 뉴 K7 YG 16~', year_start: '16', year_end: '19', code: 'YG', category: '준대형 세단' },
  { maker: '기아', model: 'K7', sub: 'K7 프리미어 YG (페리) 19~', year_start: '19', year_end: '21', code: 'YG', category: '준대형 세단' },
  // ─── 추가: 기아 모하비 ──────────────
  { maker: '기아', model: '모하비', sub: '모하비 HM 08~', year_start: '08', year_end: '15', code: 'HM', category: '대형 SUV' },
  { maker: '기아', model: '모하비', sub: '더 마스터 모하비 HM (페리) 19~', year_start: '19', year_end: '23', code: 'HM', category: '대형 SUV' },
  // ─── 추가: 쉐보레 스파크 ──────────────
  { maker: '쉐보레', model: '스파크', sub: '스파크 M400 15~', year_start: '15', year_end: '22', code: 'M400', category: '경차' },
  { maker: '쉐보레', model: '스파크', sub: '더 뉴 스파크 M400 (페리) 18~', year_start: '18', year_end: '22', code: 'M400', category: '경차' },
  // ─── 추가: 벤츠 S-클래스 / GLS / CLE / EQS / AMG GT / G-클래스 / A-클래스 ──────────────
  { maker: '벤츠', model: 'S-클래스', sub: 'S-클래스 W222 13~', year_start: '13', year_end: '20', code: 'W222', category: '대형 세단' },
  { maker: '벤츠', model: 'S-클래스', sub: 'S-클래스 W223 20~', year_start: '20', year_end: '현재', code: 'W223', category: '대형 세단' },
  { maker: '벤츠', model: 'GLS', sub: 'GLS X167 19~', year_start: '19', year_end: '현재', code: 'X167', category: '대형 SUV' },
  { maker: '벤츠', model: 'CLE', sub: 'CLE 카브리올레 A236 24~', year_start: '24', year_end: '현재', code: 'A236', category: '준중형 컨버터블' },
  { maker: '벤츠', model: 'EQS', sub: 'EQS V297 21~', year_start: '21', year_end: '현재', code: 'V297', category: '대형 EV 세단' },
  { maker: '벤츠', model: 'AMG GT', sub: 'AMG GT 15~', year_start: '15', year_end: '현재', code: '-', category: '준중형 쿠페' },
  { maker: '벤츠', model: 'G-클래스', sub: 'G-클래스 W463 18~', year_start: '18', year_end: '현재', code: 'W463', category: '중형 SUV' },
  { maker: '벤츠', model: 'A-클래스', sub: 'A-클래스 W177 18~', year_start: '18', year_end: '현재', code: 'W177', category: '준중형 해치백' },
  // ─── 추가: 아우디 A3/A4/A5/A7/A8/Q3/Q5/Q7/Q8 ──────────────
  { maker: '아우디', model: 'A3', sub: 'A3 8Y 20~', year_start: '20', year_end: '현재', code: '8Y', category: '준중형 세단' },
  { maker: '아우디', model: 'A4', sub: 'A4 B9 15~', year_start: '15', year_end: '24', code: 'B9', category: '준중형 세단' },
  { maker: '아우디', model: 'A5', sub: 'A5 F5 16~', year_start: '16', year_end: '24', code: 'F5', category: '준중형 쿠페' },
  { maker: '아우디', model: 'A7', sub: 'A7 C8 18~', year_start: '18', year_end: '현재', code: 'C8', category: '중형 세단' },
  { maker: '아우디', model: 'A8', sub: 'A8 D5 17~', year_start: '17', year_end: '현재', code: 'D5', category: '대형 세단' },
  { maker: '아우디', model: 'Q3', sub: 'Q3 F3 18~', year_start: '18', year_end: '현재', code: 'F3', category: '소형 SUV' },
  { maker: '아우디', model: 'Q5', sub: 'Q5 FY 17~', year_start: '17', year_end: '현재', code: 'FY', category: '중형 SUV' },
  { maker: '아우디', model: 'Q7', sub: 'Q7 4M 15~', year_start: '15', year_end: '현재', code: '4M', category: '대형 SUV' },
  { maker: '아우디', model: 'Q8', sub: 'Q8 4M 18~', year_start: '18', year_end: '현재', code: '4M', category: '대형 SUV' },
  // ─── 추가: BMW Z4 / M4 ──────────────
  { maker: 'BMW', model: 'Z4', sub: 'Z4 G29 18~', year_start: '18', year_end: '현재', code: 'G29', category: '소형 컨버터블' },
  { maker: 'BMW', model: 'M4', sub: 'M4 G82 20~', year_start: '20', year_end: '현재', code: 'G82', category: '준중형 쿠페' },
  // ─── 추가: 현대 스타렉스 ──────────────
  { maker: '현대', model: '스타렉스', sub: '그랜드 스타렉스 TQ 07~', year_start: '07', year_end: '21', code: 'TQ', category: '대형 MPV' },
];

// 인기 제조사 순위 (엔카 인기 차종 기준)
const MAKER_POPULARITY = [
  '현대', '기아', '제네시스', '르노', 'KGM', '쉐보레',
  'BMW', '벤츠', '아우디', '미니', '폭스바겐', '포르쉐', '테슬라',
];

// maker별 model 인기순 (엔카 기준 — 안 들어간 model은 알파벳 순)
const MODEL_POPULARITY = {
  '현대': ['그랜저', '쏘나타', '아반떼', '싼타페', '팰리세이드', '투싼', '코나', '캐스퍼', '스타리아', '아이오닉5', '아이오닉6', '아이오닉9', '베뉴', '넥쏘', '포터2'],
  '기아': ['카니발', 'K5', 'K8', '쏘렌토', '스포티지', '셀토스', 'K3', 'K9', 'K7', '레이', '모닝', '니로', '모하비', 'EV6', 'EV9', 'EV3', '봉고3', '타스만', '스팅어', '팰리세이드'],
  '제네시스': ['G80', 'G70', 'G90', 'GV80', 'GV70', 'GV60', 'EQ900'],
  '르노': ['아르카나', '그랑 콜레오스', '콜레오스', 'QM6', 'SM6', 'XM3'],
  'KGM': ['토레스', '액티언', '렉스턴', '티볼리', '렉스턴 스포츠', '코란도'],
  '쉐보레': ['트레일블레이저', '트랙스', '스파크'],
  'BMW': ['5시리즈', '3시리즈', 'X3', 'X5', '4시리즈', 'X1', 'X4', 'X6', 'X7', 'Z4', 'M4', 'M3'],
  '벤츠': ['E-클래스', 'C-클래스', 'S-클래스', 'GLC', 'GLE', 'GLS', 'A-클래스', 'CLE', 'EQS', 'AMG GT', 'G-클래스'],
  '아우디': ['A6', 'A4', 'A5', 'A3', 'A7', 'A8', 'Q5', 'Q3', 'Q7', 'Q8'],
  '테슬라': ['모델 Y', '모델 3', '모델 S', '모델 X'],
  '폭스바겐': ['티구안', '제타', '아테온', '골프', '파사트'],
  '포르쉐': ['카이엔', '카이엔 쿠페', '마칸', '파나메라', '타이칸', '911', '박스터'],
  '미니': ['쿠퍼', '컨트리맨', '클럽맨'],
};

const _makerRank = new Map(MAKER_POPULARITY.map((m, i) => [m, i]));
const _rank = (m) => _makerRank.has(m) ? _makerRank.get(m) : 9999;
const _modelRank = (maker, model) => {
  const arr = MODEL_POPULARITY[maker] || [];
  const i = arr.indexOf(model);
  return i === -1 ? 9999 : i;
};

/** 제조사 목록 — 인기 순 정렬 */
export function getMakers() {
  const all = [...new Set(CAR_MODELS.map(m => m.maker))];
  return all.sort((a, b) => _rank(a) - _rank(b) || a.localeCompare(b, 'ko'));
}

/** 특정 제조사의 모델명 목록 — 인기 순 (MODEL_POPULARITY) 우선, 그 외 가나다순 */
export function getModels(maker) {
  if (!maker) return [];
  const all = [...new Set(CAR_MODELS.filter(m => m.maker === maker).map(m => m.model))];
  return all.sort((a, b) =>
    _modelRank(maker, a) - _modelRank(maker, b) ||
    a.localeCompare(b, 'ko')
  );
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
