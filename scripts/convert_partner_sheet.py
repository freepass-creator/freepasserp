"""
최종 변환 v2:
1. published HTML에서 모든 탭 fetch (gid + 탭이름)
2. 헤더 동적 매핑 (탭마다 컬럼 다름)
3. 차량번호 hyperlink → photo_link
4. 출고불가 제외 (나머지 모두 출고가능 처리)
5. maker/model/sub/연료/색상/상태/구분 정규화
6. CAR_MODELS 매칭 검증
"""
import csv
import re
import urllib.request
import urllib.parse
import sys
import html as html_lib
import os

sys.stdout.reconfigure(encoding='utf-8')

PUB_BASE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTvkNpr9E2jul-nxvdO18T9UgYCygvPSbzH1d5rzML9ZCoHGc5SLxTLur5jfwec48aD-A_UyobrRvA5'

TAB_TO_PARTNER = {
    '퍼스트': 'RP009',
    '아이카': 'RP004',
    '아이카(월렌트)': 'RP004',
    '아이언': 'RP006',
    '리더스렌트카': 'RP008',
    'KH': 'RP010',
    '연카': 'RP011',
    '손오공': 'RP012',
    '웰릭스': 'RP013',
    '스위치': 'RP014',
    '경진렌트카': 'RP015',
    '경진카': 'RP016',
    '센트로': 'RP017',
    '스타': 'RP005',
    '에이스': 'RP019',
    '퍼시픽': 'RP022',
    '우리캐피탈렌터카': 'RP020',
    '빌린카': 'RP021',
    '빌린카구독': 'RP021',
}

# 헤더 한글 → 표준 키
HEADER_MAP = {
    '상태': 'vehicle_status',
    '구분': 'product_type',
    '차량번호': 'car_number',
    '차종분류': 'model_name',
    '차종': 'model_name',
    '세부모델': 'sub_model',
    '연료': 'fuel_type',
    '외장': 'ext_color',
    '외장색': 'ext_color',
    '내장': 'int_color',
    '내장색': 'int_color',
    'Km': 'mileage',
    'KM': 'mileage',
    '주행거리': 'mileage',
    '단기보증': '_short_dep',
    '장기보증': '_long_dep',
    '1개월': 'rent_1',
    '12개월': 'rent_12',
    '24개월': 'rent_24',
    '36개월': 'rent_36',
    '48개월': 'rent_48',
    '60개월': 'rent_60',
    '트림': 'trim_name',
    '옵션': 'options',
    '최초등록': 'first_registration_date',
    '소비자가격': 'vehicle_price',
    '제조사': 'maker',
    '배기량': 'engine_cc',
    '비고': 'partner_memo',
}

# ─── 정규화 ─────────────────────────────────────────
MAKER_FIX = {
    '르노(삼성)': '르노', '르노 삼성': '르노', '르노삼성': '르노',
    '쌍용': 'KGM',
    '메르세데스-벤츠': '벤츠', '메르세데스벤츠': '벤츠', 'mercedes-benz': '벤츠',
    'mercedes': '벤츠', 'benz': '벤츠',
    '폭스바겐': '폭스바겐', 'volkswagen': '폭스바겐', 'vw': '폭스바겐',
    'BMW': 'BMW', 'bmw': 'BMW',
    '도요타': '토요타', 'toyota': '토요타',
    'GM대우': '쉐보레', '한국GM': '쉐보레', '한국gm': '쉐보레',
    '포드사': '포드',
    '기블리': '마세라티',  # 데이터 오류 — maker에 모델명 들어감
}

MAKER_BY_MODEL = {
    '그랜저': '현대', '아반떼': '현대', '쏘나타': '현대', '소나타': '현대',
    '스타리아': '현대', '싼타페': '현대', '캐스퍼': '현대', '코나': '현대',
    '투싼': '현대', '팰리세이드': '현대', '펠리세이드': '현대',
    '더뉴아반데': '현대', '아이오닉': '현대',
    'G70': '제네시스', 'G80': '제네시스', 'G90': '제네시스',
    'GV60': '제네시스', 'GV70': '제네시스', 'GV80': '제네시스',
    'EQ900': '제네시스',
    'K3': '기아', 'K5': '기아', 'K7': '기아', 'K8': '기아', 'K9': '기아',
    'EV3': '기아', 'EV6': '기아', 'EV9': '기아', '레이': '기아',
    '모닝': '기아', '모하비': '기아', '셀토스': '기아', '쏘렌토': '기아',
    '스포티지': '기아', '카니발': '기아', '니로': '기아',
}

MODEL_FIX = {
    'k5': 'K5', 'K5 ': 'K5', 'k8': 'K8',
    '더뉴아반데': '아반떼', '소나타': '쏘나타', '소나타디엣지': '쏘나타',
    '펠리세이드': '팰리세이드',
    '그랜져': '그랜저', '그랜져GN7': '그랜저', '더뉴그랜져': '그랜저',
    '제네시스 DH': 'G80',
    '모델Y': '모델 Y', '모델3': '모델 3', '테슬라': '',  # 추후 sub로 추정
    'BMW 3시리즈': '3시리즈', 'BMW 4시리즈': '4시리즈',
    '벤츠 E클래스': 'E-클래스', '벤츠 E시리즈': 'E-클래스',
    '벤츠 C클래스': 'C-클래스', '벤츠 S클래스': 'S-클래스',
    '벤츠 A클래스': 'A-클래스', '벤츠 GLE클래스': 'GLE',
    '벤츠 GLS클래스': 'GLS', '벤츠 G63 AMG': 'G-클래스',
    'E시리즈': 'E-클래스', 'E클래스': 'E-클래스',
    'C시리즈': 'C-클래스', 'C클래스': 'C-클래스',
    'S클래스': 'S-클래스', 'A클래스': 'A-클래스',
    'GLE클래스': 'GLE', 'GLS클래스': 'GLS',
    'E200': 'E-클래스', 'E220d': 'E-클래스', 'E450': 'E-클래스',
    'GLC300': 'GLC', 'GLC300쿠페': 'GLC', 'GLE450d': 'GLE',
    'GLS580': 'GLS', 'S350d': 'S-클래스', 'S400d': 'S-클래스',
    'S500': 'S-클래스', 'S560': 'S-클래스', 'S580': 'S-클래스',
    'EQS350': 'EQS', 'CLE카브리올레': 'CLE',
    'AMG GT': 'AMG GT', 'G63 AMG': 'G-클래스',
    '아우디Q5': 'Q5', '아우디A6': 'A6',
    '그랑콜레오스': '그랑 콜레오스', '콜레오스': '콜레오스',
    '모닝26MY': '모닝', 'MX5': '싼타페',
    '레인지로버벨라': '레인지로버 벨라', '레인지로버 보그': '레인지로버',
    '렉서스LM': 'LM', '벤틀리컨티넨탈GT': '컨티넨탈 GT',
    '코치맨 캠핑카': '머스탱',  # 시트 데이터 오류 처리
    '올뉴카니발': '카니발', '신형 카니발': '카니발',
}

SUB_FIX = {
    # K5
    'K5': 'K5 DL3', 'K5 3세대': 'K5 DL3',
    '더 뉴 K5 3세대': '더 뉴 K5 DL3 (페리)',
    '더 뉴 K5  3세대': '더 뉴 K5 DL3 (페리)',
    '더뉴 K5 - 3세대': '더 뉴 K5 DL3 (페리)',
    '더 뉴 K5 GSL': '더 뉴 K5 DL3 (페리)',
    '더 뉴 K5 HEV': '더 뉴 K5 DL3 (페리)',
    '기아 K5 DL3': 'K5 DL3',
    # K3
    '더 뉴 K3 2세대': '더 뉴 K3 BD (페리)',
    'K3 1.6': 'K3 BD',
    # K7 (단종 — 추가됨)
    'K7': '올 뉴 K7 YG', 'K7프리미어': 'K7 프리미어 YG (페리)',
    '올 뉴 K7': '올 뉴 K7 YG',
    # K8
    'K8': 'K8 GL3', '더 뉴 K8': '더 뉴 K8 GL3 (페리)',
    '더 뉴 k8': '더 뉴 K8 GL3 (페리)',
    '더 뉴K8 HEV': '더 뉴 K8 GL3 (페리)',
    # K9
    'K9': 'K9 RJ',
    '더 뉴 K9 2세대': '더 뉴 K9 RJ (페리)',
    # 셀토스
    '셀토스': '셀토스 SP2',
    '디 올 뉴 셀토스': '더 뉴 셀토스 SP2 (페리)',
    '더 뉴 셀토스': '더 뉴 셀토스 SP2 (페리)',
    '더뉴셀토스': '더 뉴 셀토스 SP2 (페리)',
    # 쏘렌토
    '쏘렌토': '쏘렌토 MQ4',
    '쏘렌토 MQ4': '쏘렌토 MQ4',
    '쏘렌토4세대': '쏘렌토 MQ4',
    '쏘렌토 2.5T': '쏘렌토 MQ4',
    '쏘렌토 2.5 그래비티 2WD 5인승': '쏘렌토 MQ4',
    '쏘렌토 2.5 프레스티지 5인승': '쏘렌토 MQ4',
    '더 뉴 쏘렌토': '더 뉴 쏘렌토 MQ4 (페리)',
    '더 뉴 쏘렌토4세대': '더 뉴 쏘렌토 MQ4 (페리)',
    '더 2026 쏘렌토': '더 뉴 쏘렌토 MQ4 (페리)',
    # 카니발
    '카니발': '카니발 KA4', '카니발 4세대': '카니발 KA4',
    '카니발 2.2D 프레스티지 9인승': '카니발 KA4',
    '카니발 3.5T 9인승': '카니발 KA4',
    '카니발 3.5 9인승 시그니처': '카니발 KA4',
    '올 뉴 카니발': '카니발 KA4',
    'KA4 카니발': '카니발 KA4',
    '더 뉴 카니발': '더 뉴 카니발 KA4 (페리)',
    '더 뉴 카니발 3.5 가솔린 9인승': '더 뉴 카니발 KA4 (페리)',
    '더 뉴 카니발 4세대 하이리무진': '더 뉴 카니발 KA4 하이리무진 (페리)',
    '더 뉴 카니발 하이리무진': '더 뉴 카니발 KA4 하이리무진 (페리)',
    '더 뉴카니발 9인승 디젤 럭셔리': '더 뉴 카니발 KA4 (페리)',
    'CN더뉴카니발하이리무진(특장)': '더 뉴 카니발 KA4 하이리무진 (페리)',
    # 그랜저
    '그랜저': '그랜저 GN7', '그랜저 GN7': '그랜저 GN7',
    '그랜저GN7': '그랜저 GN7', '그랜져IG': '그랜저 IG',
    '그랜저 GN7 3.5 LPI 2WD': '그랜저 GN7',
    '그랜저 2.5T 프리미엄 2WD': '그랜저 GN7',
    '그랜저 IG': '그랜저 IG', '그랜저IG': '그랜저 IG',
    '더 뉴 그랜저IG': '더 뉴 그랜저 IG (페리)',
    '디 올 뉴 그랜저GN7': '그랜저 GN7',
    '더뉴그랜져': '더 뉴 그랜저 IG (페리)',
    # 쏘나타
    '쏘나타 DN8': '쏘나타 DN8', '쏘나타DN8': '쏘나타 DN8',
    '쏘나타 디 엣지': '쏘나타 DN8 디 엣지 (페리)',
    '쏘나타 디엣지': '쏘나타 DN8 디 엣지 (페리)',
    '쏘나타디엣지': '쏘나타 DN8 디 엣지 (페리)',
    '디 엣지': '쏘나타 DN8 디 엣지 (페리)',
    '소나타 디엣지': '쏘나타 DN8 디 엣지 (페리)',
    '소나타 DN8': '쏘나타 DN8',
    # 아반떼
    '아반떼': '아반떼 CN7', '아반떼 CN7': '아반떼 CN7',
    '아반떼CN7': '아반떼 CN7', '아반떼 CN7 N': '아반떼 N CN7',
    '더 뉴 아반떼': '아반떼 CN7 (페리)',
    '아반데': '아반떼 CN7',
    '아반떼 PE  N라인': '아반떼 CN7 (페리)',
    '아반떼 PE N라인': '아반떼 CN7 (페리)',
    '아반떼 CN7 1.6 LPG': '아반떼 CN7',
    '아반떼 MD 1.6 터보': '아반떼 MD',
    'DH 3.3 Premium AWD': 'G80 DH',
    # 싼타페
    '싼타페TM': '싼타페 TM',
    '싼타페': '싼타페 MX5',
    '더 뉴 싼타페': '싼타페 MX5',
    '싼타페 R2.2': '싼타페 TM',
    '싼타페 2.5 프레스티지 5인승': '싼타페 MX5',
    '싼타페MX5': '싼타페 MX5',
    # 팰리세이드
    '팰리세이드': '팰리세이드 LX2',
    '팰리세이드 LX2': '팰리세이드 LX2',
    '더 뉴 팰리세이드': '더 뉴 팰리세이드 LX2 (페리)',
    '더 뉴 팰리세이드 LX2 (페리)': '더 뉴 팰리세이드 LX2 (페리)',
    '더뉴팰리세이드': '더 뉴 팰리세이드 LX2 (페리)',
    '더 올뉴 팰리세이드': '팰리세이드 LX3',
    '디 올 뉴 팰리세이드': '팰리세이드 LX3',
    '디 올뉴팰리세이드': '팰리세이드 LX3',
    '팰리세이드 3.8 AWD': '팰리세이드 LX2',
    # 스포티지
    '스포티지': '스포티지 NQ5',
    '더 뉴 스포티지': '더 뉴 스포티지 NQ5 (페리)',
    '스포티지5세대': '스포티지 NQ5',
    '스포티지 1.6T': '스포티지 NQ5',
    '디 올뉴스포티지': '스포티지 NQ5',
    # 모닝
    '모닝': '모닝 JA',
    '더 뉴 모닝': '더 뉴 기아 모닝 JA (페리2)',
    '더뉴 모닝 1.0 프레스티지': '더 뉴 기아 모닝 JA (페리2)',
    # 레이
    '레이': '레이 TAM',
    '더 뉴 레이': '더 뉴 기아 레이 TAM (페리2)',
    '더 뉴 기아 레이': '더 뉴 기아 레이 TAM (페리2)',
    # 모하비
    '모하비': '모하비 HM',
    '모하비 3.0 4WD 6인승': '모하비 HM',
    '모하비 3.0D 마스터스 그래비티 4WD 6인승': '더 마스터 모하비 HM (페리)',
    '모하비 더 마스터': '더 마스터 모하비 HM (페리)',
    # 캐스퍼
    '캐스퍼': '캐스퍼 AX1', '캐스퍼(CASPER)': '캐스퍼 AX1',
    # 코나
    '코나': '코나 SX2',
    # 스타리아
    '스타리아': '스타리아 US4',
    '스타리아 9인승': '스타리아 US4',
    '스타리아 투어러': '스타리아 투어러 US4',
    # 투싼
    '투싼 (신형)': '더 뉴 투싼 NX4 (페리)',
    'NX4': '투싼 NX4',
    '더 뉴 투싼': '더 뉴 투싼 NX4 (페리)',
    '투싼 1.6 N라인 인스퍼레이션 2WD': '투싼 NX4',
    # 르노 아르카나
    '아르카나': '아르카나 LJB',
    '아르카나 1.6 GTe': '아르카나 LJB',
    'ARKANA': '아르카나 LJB',
    # 르노 SM6 / QM6 / XM3 / 콜레오스
    'SM6': 'SM6 LFD',
    'QM6': 'QM6 HZG',
    'QM6 LPe': 'QM6 HZG',
    '더 뉴 QM6': 'QM6 HZG',
    'XM3': 'XM3 LJB',
    '그랑 콜레오스': '그랑 콜레오스 OV6',
    '그랑 콜레오스 OV6': '그랑 콜레오스 OV6',
    'E-Tecos 하이브리드': '그랑 콜레오스 OV6',
    'KOLEOS': 'QM6 HZG',
    # 필랑트
    '필랑트 E-Tech': '필랑트 E-Tech',
    # 테슬라
    '모델Y': '모델 Y', '모델Y 프리미엄': '모델 Y',
    '모델3 롱레인지': '모델 3', 'Model 3 Premium Long Range RWD': '모델 3',
    'Model Y Premium RWD': '모델 Y',
    # G80 / GV80
    'G80': 'G80 RG3', 'G80 RG3': 'G80 RG3',
    'G80 2.5T AWD': 'G80 RG3',
    'G80 3.5T 2WD': 'G80 RG3',
    '더뉴 G80 (RG3)': '더 뉴 G80 RG3 (페리)',
    '더 올뉴G80': 'G80 RG3',
    'GV80': 'GV80 JX1',
    'GV80 2.5T AWD': 'GV80 JX1',
    'GV80 2.5T AWD 5인승': 'GV80 JX1',
    'GV80 3.0D AWD 5인승': 'GV80 JX1',
    'GV80 3.5T AWD 7인승': 'GV80 JX1',
    'G70': 'G70 IK',
    'G90': 'G90 RS4',
    'EQ900': 'EQ900',
    # 쉐보레
    '스파크': '스파크 M400', '스파크1.0': '스파크 M400',
    '더뉴스파크': '더 뉴 스파크 M400 (페리)',
    '더 넥스트 스파크': '스파크 M400',
    '트랙스 1.2 E-터보 엑티브 플러스': '트랙스 크로스오버 CUV',
    # KGM
    '액티언': '액티언',
    '더 뉴 티볼리': '티볼리 X100',
    # BMW
    'BMW 320i': '3시리즈 G20 페리 (LCI)',
    '3시리즈(7세대) 320i LCI 2': '3시리즈 G20 페리 (LCI)',
    'X1 F48': 'X1 F48', 'X4 2.0D M Sport': 'X4 G02',
    'X3 G01': 'X3 G01', 'X5 (G05)': 'X5 G05', 'BMW X3 M40i': 'X3 G01',
    'Z4(G29)': 'Z4 G29', 'M4 컨버터블': 'M4 G82',
    '4시리즈 (F32)': '4시리즈 F32', '4시리즈': '4시리즈 G22',
    # 벤츠
    'E200': 'E-클래스 W213', 'E220d': 'E-클래스 W213', 'E450': 'E-클래스 W214',
    'E220 W213': 'E-클래스 W213', 'E450 W214': 'E-클래스 W214',
    'E클래스(6세대) E200 아방가르드': '더 뉴 E-클래스 W213 (페리)',
    'Mercedes-Benz E200': 'E-클래스 W213',
    'Mercedes-Benz E220d 4MATIC': 'E-클래스 W213',
    'Mercedes-Benz GLC300 4MATIC': 'GLC X254',
    'Mercedes-Benz GLC300 4MATIC Coupe': 'GLC 쿠페 X254',
    'GLC300 X254': 'GLC X254', 'CLE200카브리올레': 'CLE 카브리올레 A236',
    'GLE450d C236': 'GLE 쿠페 C167',
    'Mercedes-Benz GLE450d 4MATIC Coupe': 'GLE 쿠페 C167',
    'GLS400d C257': 'GLS X167',
    'Mercedes-Benz GLS580 4MATIC': 'GLS X167',
    'Mercedes-Benz S580 4MATIC': 'S-클래스 W223',
    'S350d W223': 'S-클래스 W223',
    'Mercedes-Benz S350d': 'S-클래스 W223',
    'Mercedes-Benz S400d 4MATIC': 'S-클래스 W223',
    'S450 W222': 'S-클래스 W222',
    'Mercedes-Benz S500 4MATIC': 'S-클래스 W223',
    'S560 W222': 'S-클래스 W222',
    'S 350d 4MATIC': 'S-클래스 W223',
    'A45 AMG 4MATIC': 'A-클래스 W177',
    'AMG GT': 'AMG GT',
    'Mercedes-AMG G63': 'G-클래스 W463',
    'Mercedes-Benz EQS350': 'EQS V297',
    # 아우디
    'A3 8Y': 'A3 8Y', 'A3 40 TFSI': 'A3 8Y',
    'A4 B9': 'A4 B9', 'A4 40 TFSI': 'A4 B9',
    'A5 (F5)': 'A5 F5',
    'A5 Sportback 40 TFSI quattro': 'A5 F5',
    '35TDi 2.0 디젤': 'A6 C8',
    'A6 40 TDI': 'A6 C8',
    'A6 45 TFSI Quattro': 'A6 C8', 'A6 45 TFSI': 'A6 C8',
    'A7 45 TDI quattro': 'A7 C8',
    'A8 D5': 'A8 D5', 'A8 L 55 TFSI Quattro': 'A8 D5',
    'Q3 35 TDI': 'Q3 F3',
    'Q5 FY': 'Q5 FY', 'Q5 45 TFSI Quattro': 'Q5 FY',
    'Q7 45 TDI Quattro': 'Q7 4M',
    'Q8 45 TDI Quattro': 'Q8 4M',
    # 포르쉐
    '박스터': '박스터 982',
    '카이엔': '카이엔 PO536',
    '카이엔 PO536': '카이엔 쿠페 PO536',
    '타이칸(High, 5인승)': '타이칸 J1',
    # 포드
    'Mustang GT 5.0L Convertibel': '머스탱 GT',
    '포드코치맨(COACHMEN)캠핑카': '머스탱 GT',
    # 폭스바겐 / 토요타 / 렉서스 / 마세라티 / 페라리 / 람보르기니 / 벤틀리 / 캐딜락 / 롤스로이스
    '아테온': '아테온',
    '도요타 알파드': '알파드',
    '렉서스 lm500h ROYAL': 'LM500h',
    '기블리': '기블리',
    'SF90 스파이더': 'SF90 스파이더',
    '컬리넌': '컬리넌',
    '에스컬레이드': '에스컬레이드',
    'new continental GT speed': '컨티넨탈 GT',
    '가야르도 2세대 LP550-2': '가야르도 LP550-2',
    '우르스': '우르스',
    '레인지로버 벨라 d240': '레인지로버 벨라',
    '더 뉴 레인지로버 P530 LWB': '레인지로버',
    '더 뉴 레인지로버': '레인지로버',
}

FUEL_RULES = [
    (r'전기|ev|electric|하이랜드|모델y|모델3', '전기'),
    (r'수소|hydrogen|fcev', '수소'),
    (r'하이브리드|hybrid|hev|tecos|e[- ]?tech', '하이브리드'),
    (r'lpg|lpi|엘피지', 'LPG'),
    (r'디젤|diesel|경유|crdi|tdi', '디젤'),
    (r'가솔린|gasoline|휘발|gsl|gdi|t-?gdi|petrol', '가솔린'),
]

COLOR_RULES = [
    (r'펄|화이트|흰|white|크림|아이보리|cream|ivory|스노우|snow|클라우드|cloud|진주', '화이트'),
    (r'미색', '베이지'),
    (r'실버|silver|티타늄|titanium|플래티넘|platinum|은색', '실버'),
    (r'그레이|회색|gray|grey|건메탈|gunmetal|차콜|charcoal|쥐색|그라파이트|graphite', '그레이'),
    (r'블랙|검정|black|미드나잇|midnight|오닉스|onyx|에보니|쉐도우', '블랙'),
    (r'네이비|navy|남색|곤색|인디고', '네이비'),
    (r'블루|파랑|blue|아쿠아|aqua|코발트|cobalt|청색', '블루'),
    (r'그린|초록|green|에메랄드|emerald|올리브|olive', '그린'),
    (r'레드|빨강|red|버건디|burgundy|와인|wine|마룬', '레드'),
    (r'브라운|갈색|brown|모카|copper|카본|carbon', '브라운'),
    (r'베이지|beige|샴페인|champagne|토프|카멜|에크루|베이직', '베이지'),
    (r'골드|gold', '골드'),
    (r'오렌지|orange|선셋|sunset', '오렌지'),
    (r'카키|khaki', '카키'),
    (r'옐로우|노랑|yellow|크레용', '옐로우'),
]


def fix_maker(maker, model):
    m = (maker or '').strip()
    if m in MAKER_FIX:
        return MAKER_FIX[m]
    if not m:
        return MAKER_BY_MODEL.get((model or '').strip(), '')
    return m


def fix_model(model, maker_hint=''):
    m = (model or '').strip()
    if m in MODEL_FIX:
        return MODEL_FIX[m]
    if re.match(r'^[kK]\d$', m):
        return m.upper()
    m_clean = re.sub(r'\s*\d{2}MY$', '', m)
    if m_clean in MODEL_FIX:
        return MODEL_FIX[m_clean]
    return m_clean


def fix_sub(sub):
    s = (sub or '').strip()
    s = re.sub(r'\s+', ' ', s)
    if s in SUB_FIX:
        return SUB_FIX[s]
    return s


def fix_fuel(v):
    s = (v or '').strip().lower().replace(' ', '')
    if not s:
        return ''
    for pat, name in FUEL_RULES:
        if re.search(pat, s):
            return name
    return v.strip()


def fix_color(v):
    s = (v or '').strip().lower().replace(' ', '')
    if not s or s == '-':
        return ''
    s_first = s.split('&')[0].split('/')[0].split(',')[0]
    for pat, name in COLOR_RULES:
        if re.search(pat, s_first):
            return name
    return v.strip()


def fix_vehicle_status(v):
    s = (v or '').strip()
    if '불가' in s:
        return '출고불가'
    if '가능' in s and '불가' not in s:
        return '출고가능'
    # 그 외 (배차대기, 재고확인, 빈값, 예약, 협의 등) 모두 출고협의
    return '출고협의'


def fix_product_type(v):
    s = (v or '').strip()
    if not s:
        return '중고렌트'
    if '신차' in s and '구독' in s:
        return '신차구독'
    if '신차' in s:
        return '신차렌트'
    if '구독' in s:
        return '중고구독'
    return '중고렌트'


def parse_money(v):
    s = re.sub(r'[^\d]', '', str(v or ''))
    return s if s else ''


def parse_date(v):
    s = (v or '').strip()
    if not s:
        return ''
    m = re.match(r'^(\d{2})-(\d{1,2})-(\d{1,2})$', s)
    if m:
        return f'{m.group(1)}{m.group(2).zfill(2)}{m.group(3).zfill(2)}'
    return s


def clean_trim(trim, maker, model_norm, sub_norm):
    t = (trim or '').strip()
    if not t:
        return ''
    remove_tokens = []
    if maker:
        remove_tokens.append(maker)
    if model_norm:
        remove_tokens.append(model_norm)
    if sub_norm:
        for code in re.findall(r'[A-Z]{1,4}\d{1,3}', sub_norm):
            remove_tokens.append(code)
            remove_tokens.append(f'({code})')
    remove_patterns = [
        r'\d+세대',
        r'(더 뉴|더뉴|디 올 뉴|디올뉴|올 뉴|올뉴|더 올뉴|새|신형|The New)',
        r'\(페리\d?\)', r'\(\s*\)',
    ]
    for tok in remove_tokens:
        t = re.sub(re.escape(tok), ' ', t, flags=re.IGNORECASE)
    for pat in remove_patterns:
        t = re.sub(pat, ' ', t, flags=re.IGNORECASE)
    t = re.sub(r'\s+', ' ', t).strip()
    t = t.strip(' -·.,/()')
    return t


# ─── HTTP fetch ─────────────────────────────────────
def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode('utf-8', errors='replace')


def unwrap_url(u):
    if not u:
        return ''
    m = re.match(r'https?://www\.google\.com/url\?q=([^&]+)', u)
    if m:
        return urllib.parse.unquote(m.group(1))
    return u


def parse_table_with_links(html):
    """published HTML 테이블 → [{셀텍스트, hyperlink}, ...]"""
    table_match = re.search(r'<table[^>]*>(.*?)</table>', html, re.DOTALL)
    if not table_match:
        return []
    table = table_match.group(1)
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', table, re.DOTALL)
    out = []
    for tr in rows:
        cells = re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>', tr, re.DOTALL)
        parsed = []
        for c in cells:
            link_m = re.search(r'<a[^>]+href="([^"]+)"', c)
            link = unwrap_url(html_lib.unescape(link_m.group(1))) if link_m else ''
            text = re.sub(r'<[^>]+>', '', c)
            text = html_lib.unescape(text).strip()
            parsed.append((text, link))
        out.append(parsed)
    return out


# ─── 메인 ───────────────────────────────────────────
print('=== 시트 메타 ===')
main_html = fetch(f'{PUB_BASE}/pubhtml')
matches = re.findall(r'items\.push\(\{name:\s*"([^"]+)"[^}]*?gid:\s*"(\d+)"', main_html)
gid_to_name = {gid: name for name, gid in matches}
print(f'  탭 발견: {len(gid_to_name)}')

target = [(g, n, TAB_TO_PARTNER[n]) for g, n in gid_to_name.items() if n in TAB_TO_PARTNER]
print(f'  처리 대상: {len(target)}개')

OUT_COLS = [
    'partner_code', 'car_number', 'maker', 'model_name', 'sub_model', 'trim_name',
    'options', 'ext_color', 'int_color', 'year', 'mileage', 'fuel_type',
    'policy_code', 'vehicle_status', 'product_type', 'vehicle_class', 'vehicle_price',
    'first_registration_date', 'partner_memo', 'photo_link',
    'rent_1', 'deposit_1',
    'rent_12', 'deposit_12',
    'rent_24', 'deposit_24',
    'rent_36', 'deposit_36',
    'rent_48', 'deposit_48',
    'rent_60', 'deposit_60',
]

all_rows = []
print()
print('=== 탭별 처리 ===')
for gid, tab, partner in target:
    try:
        html = fetch(f'{PUB_BASE}/pubhtml/sheet?gid={gid}')
        rows = parse_table_with_links(html)
        if not rows:
            continue
        # 헤더 행 찾기 (셀에 '차량번호' 또는 '차종분류'가 있는 첫 행)
        header_row_idx = None
        for i, r in enumerate(rows):
            texts = [c[0] for c in r]
            if any(t in ('차량번호', '차종분류', '제조사') for t in texts):
                header_row_idx = i
                break
        if header_row_idx is None:
            print(f'  [SKIP] {tab}: 헤더 못 찾음')
            continue
        header = [c[0] for c in rows[header_row_idx]]
        data_rows_raw = rows[header_row_idx + 1:]
        # 데이터 첫 셀이 row number(숫자)인지 샘플 검사
        sample_data = next((r for r in data_rows_raw if r and len(r) > 5 and r[4][0].strip()), None)
        data_has_rowno = sample_data and sample_data[0][0].strip().isdigit()
        # 헤더 첫 셀이 빈값/숫자면 잘라냄
        header_has_rowno = header and (header[0].strip() == '' or header[0].strip().isdigit())
        if header_has_rowno and data_has_rowno:
            header = header[1:]
            data_rows = [r[1:] if r else r for r in data_rows_raw]
        elif header_has_rowno and not data_has_rowno:
            header = header[1:]
            data_rows = data_rows_raw
        else:
            data_rows = data_rows_raw
        # 헤더 → 표준 키 매핑
        col_map = {}
        for i, h in enumerate(header):
            std = HEADER_MAP.get(h.strip())
            if std:
                col_map[std] = i

        cnt = 0
        skipped = 0
        for r in data_rows:
            if not r or len(r) < 3:
                continue

            def get(key):
                i = col_map.get(key, -1)
                if i < 0 or i >= len(r):
                    return ('', '')
                return r[i]

            car_no_text, car_no_link = get('car_number')
            if not car_no_text.strip():
                continue

            status = fix_vehicle_status(get('vehicle_status')[0])
            if status == '출고불가':
                skipped += 1
                continue

            raw_maker = get('maker')[0]
            raw_model = get('model_name')[0]
            raw_sub = get('sub_model')[0]

            maker = fix_maker(raw_maker, raw_model)
            model_norm = fix_model(raw_model, maker)
            sub_norm = fix_sub(raw_sub)
            trim_clean = clean_trim(get('trim_name')[0], maker, model_norm, sub_norm)

            short_dep = parse_money(get('_short_dep')[0])
            long_dep = parse_money(get('_long_dep')[0])

            row = {
                'partner_code': partner,
                'car_number': car_no_text.strip(),
                'maker': maker,
                'model_name': model_norm,
                'sub_model': sub_norm,
                'trim_name': trim_clean,
                'options': get('options')[0].strip(),
                'ext_color': fix_color(get('ext_color')[0]),
                'int_color': fix_color(get('int_color')[0]),
                'year': '',
                'mileage': parse_money(get('mileage')[0]),
                'fuel_type': fix_fuel(get('fuel_type')[0]),
                'policy_code': '',
                'vehicle_status': status,
                'product_type': fix_product_type(get('product_type')[0]),
                'vehicle_class': '',
                'vehicle_price': parse_money(get('vehicle_price')[0]),
                'first_registration_date': parse_date(get('first_registration_date')[0]),
                'partner_memo': get('partner_memo')[0].strip(),
                'photo_link': car_no_link,
                'rent_1': parse_money(get('rent_1')[0]),
                'deposit_1': short_dep,
                'rent_12': parse_money(get('rent_12')[0]),
                'deposit_12': short_dep,
                'rent_24': parse_money(get('rent_24')[0]),
                'deposit_24': long_dep,
                'rent_36': parse_money(get('rent_36')[0]),
                'deposit_36': long_dep,
                'rent_48': parse_money(get('rent_48')[0]),
                'deposit_48': long_dep,
                'rent_60': parse_money(get('rent_60')[0]),
                'deposit_60': long_dep,
            }
            all_rows.append(row)
            cnt += 1
        print(f'  [{partner}] {tab}: {cnt}건 (출고불가 {skipped} 제외)')
    except Exception as e:
        print(f'  [FAIL] {tab}: {e}')

print()
print(f'총 {len(all_rows)}건')
photo_n = sum(1 for r in all_rows if r['photo_link'])
print(f'사진링크 포함: {photo_n}건')

DST = 'd:/dev/freepasserp/all_partners_normalized.csv'
with open(DST, 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.DictWriter(f, fieldnames=OUT_COLS)
    w.writeheader()
    w.writerows(all_rows)
print(f'저장: {DST}')
