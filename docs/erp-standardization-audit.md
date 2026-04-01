- **034**
  - 재고관리/계약관리 패널 헤드 subtitle 규격을 추가해 제목 아래 설명줄 밀도를 통일했다.
  - 재고관리 목록 액션 버튼에 neutral 톤을 명시해 다른 관리 페이지와 같은 버튼 규격을 따르게 했다.
  - 계약관리 sidebar head 텍스트를 다른 관리 페이지와 맞추고, product/contract form label 최소 높이를 맞춰 필드 정렬을 보정했다.

## 030
- panel/list/chat visible spacing lock applied.
- Scoped chat subtitle override to chat header only.
- Unified badge-to-text spacing and chat row height with global list tokens.

## 029
- `static/js/pages/chat.js`를 역할 기준으로 구조화했다.
- 대화리스트 공통 목록 규격은 유지하고, 채팅 페이지 본체는 부트스트랩/이벤트 연결 중심으로 정리했다.
- 분리 파일:
  - `static/js/pages/chat/room-list.js` : 대화방 row 구성, 목록 렌더, 선택 row 동기화
  - `static/js/pages/chat/room-selection.js` : 방 선택, 상세 패널 렌더, 메시지 watcher 연결/해제, 헤드 액션 제어

## 028
- `static/js/shared/product-list-detail-view.js`를 역할 기준으로 재구성했습니다.
- 데이터 정규화(`product-list-detail-data.js`), 상세 마크업 렌더(`product-list-detail-markup.js`), 이미지 뷰어 상호작용(`product-list-image-viewer.js`)으로 분리했습니다.
- 외부 import 경로는 유지해 제품목록/대화리스트 연결 리스크를 줄였습니다.

# 027 update
- 입력칸 / 드롭다운 / 체크박스 공통 규격 토큰 고정
- form.css 와 ui_management.css 에서 label, control height, textarea, checkbox spacing 을 같은 기준으로 정리

## 026 업데이트

- 목록 / 버튼 / 배지 규격 토큰을 공통 CSS 기준으로 고정
- 관리목록과 상품리스트가 같은 상하 패딩과 선택 높이감을 쓰도록 정리
- 배지 높이/패딩/간격, 버튼 최소폭/정렬을 전역 규격으로 보강
- `docs/erp-ui-standards.md` 에 목록/버튼/배지 규칙을 명시

## 018 업데이트

- 계약관리 구조화 1차 진행
- `contract-manage.js` 에서 서류 미리보기/업로드 상태 로직을 `static/js/pages/contract-manage/docs.js` 로 분리
- 계약관리 포맷/표시/시드 payload 보조 로직을 `static/js/pages/contract-manage/helpers.js` 로 분리
- `contract-manage.js` 828줄 → 482줄로 경량화
- 재고관리 관련 파일은 이번 버전에서 수정하지 않음

# ERP 규격화 감사 + 이사 계획 (003)

이 문서는 기존 페이지를 한 번에 갈아엎지 않고, **새 공통 레이어를 먼저 만들고 기존 페이지를 점진적으로 이주**시키기 위한 기준 문서다.

## 1. 현재 구조 한눈에 보기

| 페이지 | 패널 수 | 목록 컨테이너 | 폼 | field 수 | control 수 | 파일업로드 |
|---|---:|---|---|---:|---:|---:|
| 03 재고관리 | 3 | `product-register-list` | `product-form` | 27 | 42 | 1 |
| 07 파트너사관리 | 3 | `partner-list` | `partner-form` | 14 | 14 | 0 |
| 08 회원관리 | 3 | `member-list` | `member-form` | 12 | 12 | 0 |
| 09 코드관리 | 3 | `code-item-list` | `code-form` | 7 | 6 | 0 |
| 10 정책관리 | 3 | `term-list` | `term-form` | 37 | 37 | 0 |
| 11 계약관리 | 3 | `contract-list` | `contract-form` | 13 | 13 | 1 |
| 12 정산관리 | 3 | `settlement-list` | `settlement-form` | 4 | 4 | 0 |
| 13 요청하기 | 3 | `request-list` | `request-form` | 4 | 4 | 0 |
| 04 상품목록 | 3 | `productList` | - | 0 | 0 | 0 |
| 05 대화 | 4 | `room-list` | `chat-form` | 0 | 1 | 0 |

### 공통으로 이미 존재하는 레이어
- `static/js/core/ui-standards.js`
- `static/js/core/management-skeleton.js`
- `static/css/ui_tokens.css`
- `static/css/ui_primitives.css`
- `static/css/ui_states.css`

### 아직 페이지별로 흩어진 것
- 목록 row 렌더링
- 날짜/텍스트/코드 표시 포맷
- 업로드 미리보기 / 이미지 뷰어 스타일
- 폼 field label / control spacing 규칙
- 보기/수정/등록 모드 진입 시 타이틀 / 버튼 갱신 일부

## 2. 이번 버전에서 새로 만든 공통 이사 집

### JS
- `static/js/core/management-format.js`
  - escape/safe/date/시퀀스 코드 표시 규격
  - 공통 주행거리 요약 포맷 추가
- `static/js/core/management-list.js`
  - 관리 목록 공통 row 빌더
  - empty state / selection binding / 1~2줄 row 조립
- `static/js/pages/product-manage/form-mode.js`
  - 재고관리 전용 폼 모드 컨트롤러
  - 공통 `applyManagedFormMode` 기반으로 재고의 특수 규칙만 래핑
- `static/js/pages/product-manage/list.js`
  - 재고 목록 row schema 분리
  - badge / 차량정보 / 날짜를 공통 summary row 슬롯으로 조합
- `static/js/pages/product-manage/state.js`
  - 재고관리 페이지 상태 보관 시작점
  - 현재 프로필 / 선택 코드 / 모드 / 목록 상태를 분리할 준비 레이어
- `static/js/pages/product-manage/images.js`
  - 사진 업로드 / 미리보기 / 대표사진 / 이미지 뷰어 / 준비 큐를 별도 모듈로 분리
- `static/js/pages/product-manage/adapter.js`
  - 재고 payload 생성 / 상세값 폼 주입을 별도 모듈로 분리

### CSS
- `static/css/ui_management.css`
  - panel head/body 기본 정렬
  - form field label / control 간격 표준화
  - management summary row 2줄 규격
- `static/css/ui_upload.css`
  - 업로드 미리보기
  - 파일 카드
  - 공통 이미지 뷰어 overlay / dialog / nav

## 3. 이번 버전에서 실제로 이관 시작한 범위

### 목록 공통 렌더러로 이관한 페이지
- 코드관리
- 파트너사관리
- 회원관리
- 정산관리
- 정책관리
- 계약관리
- 재고관리

### 업로드 공통 CSS로 이관한 페이지
- 재고관리
- 계약관리

## 4. 이번 버전에서 정리된 핵심 원칙

### 패널
- 패널은 `head / body / actions` 기준으로 본다.
- 패널 제목, 버튼 정렬, body padding 은 페이지 고유 코드가 아니라 공통 규격이 책임진다.

### 목록
- 목록은 “구조는 같고 내용만 다르다”를 전제로 한다.
- row 는 공통 builder 로 조립한다.
- 페이지는 어떤 값을 `badge / main / sub / date` 슬롯에 넣을지만 결정한다.

### 입력
- 페이지가 input 모양을 직접 만들지 않는다.
- label / input / select / textarea 의 높이/간격/readonly 표현은 공통 레이어에서 잡는다.
- 사진 업로드도 특수 UI가 아니라 공통 field 의 한 종류로 본다.

## 5. 페이지별 이관 난이도

### 1차 이관 완료 / 계속 확장 가능한 그룹
- 코드관리
- 파트너사관리
- 회원관리
- 정산관리
- 정책관리
- 계약관리(목록만 우선)

### 2차 이관 대상
- 재고관리
  - 이유: 파일 크기 큼, 이미지/시트/차종연동/상태관리 복합
  - 현황: 목록 렌더 / 폼 모드 / 이미지 처리 / payload-form adapter 분리 시작, import/필드 schema는 후속 정리 예정
- 상품목록
  - 이유: 좌측 목록 구조는 공통화 가능하지만 가격 그리드가 특수
- 대화
  - 이유: 채팅방 목록은 공통 list 계열로 흡수 가능하지만 우측 채팅 패널은 별도

## 6. 다음 단계 권장 순서

1. **패널 헤드 컨트롤러 분리**
   - 제목
   - 상태 문구
   - 액션 버튼 tone / disabled 규칙

2. **field schema 레이어 추가**
   - text / currency / select / checkbox / textarea / image_upload
   - 페이지는 field 정의만 유지

3. **재고관리 분해**
   - `index / state / fields / render / actions / images / adapter`
   - 공통 가능 로직은 `core` 로 이관

4. **request / skeleton 페이지 흡수**
   - 목록/폼/필터를 동일 규격으로 맞춤

## 7. 이번 버전의 목표

- 기존 페이지를 지우지 않음
- 공통 집을 먼저 세움
- 반복되는 목록/업로드/폼 규격을 새 집으로 이동 시작
- 페이지 파일은 점점 고유 기능만 남기는 방향으로 정리

## 8. 003에서 실제로 줄어든 것

- `static/js/pages/product-manage.js`
  - 2455줄 → 1966줄
  - 재고 목록 row 빌드 + 폼 모드 전환 + 이미지 처리 + payload/form hydration 일부를 별도 파일로 이관
- 새로 분리된 파일
  - `static/js/pages/product-manage/form-mode.js`
  - `static/js/pages/product-manage/list.js`
  - `static/js/pages/product-manage/state.js`
  - `static/js/pages/product-manage/images.js`
  - `static/js/pages/product-manage/adapter.js`

이번 003의 의미는 재고관리 본체가 이제 실제로 `조립 파일` 방향으로 이동하기 시작했다는 점이다. 남은 큰 덩어리는 구글시트 import, 차량 코드/색상 연동, filter schema 쪽이다.


## 004 update
- `product-manage.js`에서 구글시트 import 파서를 `static/js/pages/product-manage/import.js`로 분리했다.
- 재고관리 필드/선택 규격 상수를 `static/js/pages/product-manage/fields.js`로 분리했다.
- 결과적으로 재고관리 본체는 import 흐름을 호출만 하고, 필드 정의와 import 정의는 새 집에서 관리하게 됐다.
- 다음 차수는 차량/코드 연동(select cascade)과 입력 필드 스키마를 더 밖으로 빼는 것이 우선이다.


## 005 update
- `static/js/pages/product-manage/selects.js` added.
- Vehicle spec select cascade, partner/policy select binding, and linked vehicle-class resolution were moved out of `product-manage.js`.
- `product-manage.js` now consumes a select controller instead of directly owning all select/watch glue.


## 006 update
- `static/js/pages/product-manage/inputs.js` added. Date normalization, comma-number formatting, readonly/view presentation, role-based partner field locking, and reset flow were moved out of `product-manage.js`.
- `static/js/pages/product-manage/filters.js` added. Filter overlay state, checkbox accordion rendering, keyword filtering, and filtered-list emission were moved out of `product-manage.js`.
- `product-manage.js` now orchestrates input/filter controllers instead of directly owning those long helper blocks.
- This keeps the screen shape stable while moving the control logic to the new house first; remaining issues can be repaired on top of the separated structure.


## 007 correction
- Fixed `product-manage` bootstrap crash caused by missing `vehicleMasterEntries` declaration.
- Fixed Google Sheet importer to resolve current profile lazily instead of capturing initial `null`.
- Reverted management pages (`partner/member/contract/settlement/policy`) to single-line summary rows; two-line density is reserved for dedicated product list style only.


## 008
- `product-manage.js`에서 UI 상태 메시지/버튼 busy 처리 분리 (`ui.js`)
- `product-manage.js`에서 저장/삭제 액션 분리 (`actions.js`)
- 더 이상 쓰지 않는 `state.js` 제거
- 본체는 조립과 이벤트 연결 중심으로 축소


## 009
- `static/js/core/management-list.js`에 관리페이지 1줄 목록 전용 공통 helper를 추가했다.
  - `buildOneLineManagementRow(...)`
  - `renderOneLineManagementList(...)`
- 관리페이지 기본 목록 밀도를 `single`로 명시하고, 공통 row 클래스(`management-summary-row--single` / `--double`)를 추가했다.
- 아래 페이지들은 더 이상 각자 `lines: [[...]]`를 직접 조립하지 않고, 공통 1줄 목록 renderer를 사용한다.
  - 코드관리
  - 파트너사관리
  - 회원관리
  - 정책관리
  - 계약관리
  - 정산관리
- 이번 차수의 의미는 “목록 공통화”가 단순 CSS 공유를 넘어, **전역 row schema helper**까지 올라왔다는 점이다.


## 010
- `static/js/core/management-skeleton.js`에 전역 액션 톤 helper `applyManagementButtonTones(...)`를 추가했다.
- 관리형 페이지들이 reset/save/delete 버튼 톤을 각자 직접 세팅하던 중복 코드를 공통 helper 호출로 회수했다.
  - 코드관리
  - 파트너사관리
  - 회원관리
  - 정책관리
  - 계약관리
  - 정산관리
- `bootstrapManagementSkeleton(...)`가 `titleBuilder`를 실제로 반영하도록 보정했다. 이에 따라 요청관리처럼 스켈레톤을 타는 페이지도 상세 패널 제목 계산을 공통 엔진에서 처리할 수 있게 됐다.
- 이번 차수의 의미는 패널 액션/제목 규격을 “눈에 보이는 공통 버튼 상태 + 공통 제목 계산” 수준까지 전역 helper로 올렸다는 점이다.


## 011
- `management-skeleton.js` 에 `resolveManagedPanelTitle`, `createManagedFormModeApplier` 추가.
- 코드/파트너/회원/정책/정산 관리 페이지의 상세 패널 제목 계산과 `applyManagedFormMode` 호출 래퍼를 공통 helper로 회수.
- 각 페이지가 `composePanelHeadTitle` 와 중복 `buildXPanelTitle + applyFormMode` 패턴을 직접 들고 있지 않도록 정리.


## 012 update
- 대화리스트를 공통 목록 시스템 안으로 편입
- chat.js가 room row DOM을 직접 생성하지 않고 `renderOneLineManagementList(...)`를 사용하도록 변경
- 채팅은 고유 텍스트 슬롯만 넘기고, 선택/empty/row container/active state는 공통 관리 목록 엔진을 따르도록 정리
- `pages/chat.css`는 grid 기반 개별 목록 레이아웃을 제거하고 공통 summary row 위에 얇은 튜닝만 남김


## 013 hotfix
- Restored `product-manage` page module set to the 006-confirmed baseline to recover the inventory page from the regression introduced during later efficiency refactors.
- Kept the 009~012 global list/panel standardization work for other pages intact.
- Next step should re-apply later efficiency splits to inventory only after runtime validation.


## 014
- 패널 헤드 공통화 보강: management-skeleton에 `resolveManagedPanelStateTitle`, `syncManagedPanelHead` 추가
- createManagedFormModeApplier가 제목/부제 동기화를 함께 처리하도록 확장
- 계약관리도 공통 form mode applier로 편입해 패널 제목 규칙을 다른 관리 페이지와 맞춤
- ui_management.css에서 panel head/body/action 시각 규격을 더 강하게 통일


## 015 입력 규격 전역 통일 시작
- 공통 파일 추가: `static/js/core/management-fields.js`
- `createManagedFormModeApplier()`와 `applyManagedFormMode()`가 이제 공통 field state 동기화를 함께 수행
- 관리형 폼의 `.field` 래퍼에 `field--text / field--select / field--textarea / field--checkbox`, `is-readonly / is-disabled / is-empty` 상태 클래스를 자동 부여
- `ui_management.css`에서 field 간격, label 높이, readonly/disabled 시각 표현, checkbox 행 정렬을 전역 규격으로 보강
- 목적: 계약/회원/파트너/정책/정산 등 안정 페이지의 입력칸이 같은 껍데기와 같은 읽기모드 표현을 갖도록 만드는 것

## 018
- 계약관리 구조화 1차 진행
- 계약 서류/뷰어/파일 상태 처리를 `static/js/pages/contract-manage/docs.js` 로 분리
- 계약 포맷/금액/기간/payload 보조 함수를 `static/js/pages/contract-manage/helpers.js` 로 분리
- `contract-manage.js` 를 부트스트랩/목록/상세 흐름 중심 파일로 경량화

## 019
- 정책관리 구조화 1차 진행
- 정책 항목 정의, 값 정규화, legacy content 해석, payload 조립 로직을 `static/js/pages/policy-manage/helpers.js` 로 분리
- `policy-manage.js` 는 provider 선택/목록/폼모드/저장 orchestration 중심으로 경량화
- 정책관리 본체 크기를 약 777줄에서 302줄로 축소해 이후 actions/filter/schema 분리가 쉬운 상태로 정리


## 020차 구조화
- `settings.js`를 세 축으로 분리
  - `settings/helpers.js`: 차량마스터 정규화/우선순위/공통 포맷 유틸
  - `settings/vehicle-master.js`: 차량마스터 링크 반영/테스트 셀렉트 제어
  - `settings/code-settings.js`: 코드 목록/폼 CRUD 제어
- 본체 `settings.js`는 인증, 탭 전환, controller 조립, watcher 등록만 담당하도록 축소
- 다음 구조화 우선순위는 `shared/product-list-detail-view.js`


## 025
- 재고관리/계약관리 업로드 표시 밀도 재정리
- 보기모드에서 업로드 드롭존 숨김, 썸네일/서류 미리보기 축소
- 계약관리 섹션 타이틀 추가로 패널 내부 규격 보강
