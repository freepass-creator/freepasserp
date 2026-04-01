# FREEPASS ERP UI 규격 초안

이 문서는 화면 규격화 작업의 기준점이다.

## 1. 패널 헤드 규칙
- 보기모드: `코드명 + 패널정보`
- 수정모드: `코드명 + 패널수정`
- 신규모드: `패널등록`
- 코드가 없으면 패널명만 사용한다.

## 2. 폼 모드 규칙
허용 상태는 아래 4개뿐이다.
- `idle` : 선택 없음
- `view` : 보기모드
- `edit` : 수정모드
- `create` : 신규등록모드

각 상태는 아래를 함께 묶어서 바꾼다.
- 패널 헤드 문구
- 삭제 버튼 활성 여부
- 입력 잠금 여부
- 탭 이동 여부
- 업로드 가능 여부

## 3. 목록 규칙
모든 선택형 목록은 아래 구조를 따른다.
- 관리목록 기본형은 1행
- 상품리스트 확장형은 2행
- 1행/2행 여부와 무관하게 row 좌우 패딩, 상하 패딩, 선택 상태 높이감은 동일
- 배지 ↔ 텍스트 간격, 메인 ↔ 보조 정보 간격, trailing 정렬 규칙 공통
- hover / active / empty state 공통
- 선택 상태 바(left 3px) 공통

## 4. 버튼 / 배지 규칙
- 버튼 높이, 최소 폭, 좌우 패딩, 톤 체계 공통
- 배지 높이, 폰트, 내부 좌우 패딩, 배지와 텍스트 간격 공통

## 5. 입력칸 규칙
- input / select / checkbox / textarea는 같은 필드 간격 규격을 사용한다.
- input / select 높이는 동일하고 textarea만 최소 높이만 다르다.
- label 최소 높이, label ↔ control 간격, field ↔ field 간격 공통
- readonly / disabled / empty 상태 표현 공통
- 보기모드 placeholder 숨김
- checkbox는 별도 위젯이 아니라 같은 field 규격 안에서 정렬만 다르게 처리

## 6. CSS 계층 원칙
- `base.css`: 기본 타이포, 공통 토큰의 기존 진입점
- `ui_tokens.css`: 화면 규격 토큰의 단일 소스
- `ui_states.css`: 보기/수정/등록/선택 상태 클래스
- `ui_primitives.css`: 패널/목록/폼/버튼 원시 규격 보조층
- 페이지 CSS는 위 공통층을 덮어쓰지 말고 필요한 예외만 둔다.

## 7. JS 계층 원칙
- `ui-standards.js`: 패널명, 모드명, 상태 클래스의 단일 소스
- `management-skeleton.js`: 관리형 폼 공통 엔진
- 페이지 JS는 공통 엔진에 예외 규칙만 전달한다.


## 2026-03-30 visible spacing lock
- 목록 1행형과 2행형은 상하 패딩과 기본 높이를 동일하게 유지한다.
- 배지 뒤 본문 시작 간격은 `--list-badge-gap-x`를 공통 사용한다.
- 패널 헤드의 title/subtitle 간격과 action 버튼 간격은 공통 토큰으로 유지한다.
- chat 전용 subtitle 스타일은 chat 헤드에만 한정한다.
