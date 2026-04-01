# FREEPASS ERP 052

현재 버전 기준 전체 프로젝트 정리본입니다.

## 포함 페이지
- 01_login
- 02_signup
- 03_product_new
- 04_product_list
- 05_chat
- 06_settings
- 07_partner
- 08_member
- 09_codes
- 10_terms
- 11_contract
- 12_settlement
- 13_request

## 현재 반영 상태
- 조회/등록/수정 모드에 따라 상세 패널 타이틀이 `정보 / 등록 / 수정`으로 자동 변경됩니다.
- 조회 상태에서도 입력폼 모양을 유지하도록 전역 폼 오버레이 규칙이 적용되어 있습니다.
- 정책관리(10_terms)는 2열 입력폼 구조이며, 화면 폭이 좁아지면 1열로 전환됩니다.
- 정책 필터용 핵심 값인 `운전연령하향`, `연간약정주행거리`는 term 최상위 필드에도 별도 저장됩니다.

## 실행 방법
```bash
pip install -r requirements.txt
python app.py
```

## 개발 메모
- Firebase Realtime Database를 사용합니다.
- 관리자/공급사/영업자 역할 기반 메뉴가 적용됩니다.
- 정책 상세 나머지 항목은 자유입력 기반으로 유지하고, 필터에 쓸 값만 최소 구조화하는 방향입니다.
