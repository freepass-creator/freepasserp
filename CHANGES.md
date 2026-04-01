# 027_list-one-line-standard 변경 내역

## 1. 비상품 관리 목록 1줄 규격 통일

- 상품 목록을 제외한 관리 목록을 `뱃지 → 코드 → 핵심식별값` 순서로 재정렬했습니다.
- 대상: 계약 / 정산 / 정책 / 회원 / 대화 / 코드관리 / 설정 내 코드관리 목록
- 날짜는 기존처럼 우측 끝에 유지하고, 본문 정보는 1줄에서 과도하게 길어지지 않도록 핵심값만 남겼습니다.

## 2. 페이지별 조정

- `계약`: 계약코드 뒤에 고객명 · 차량번호 · 세부모델 순으로 압축했습니다.
- `정산`: 정산코드 뒤에 계약코드 · 고객명 · 차량번호만 남기도록 정리했습니다.
- `정책`: 상태 뱃지를 앞에 추가하고 정책코드 뒤에 정책명 · 공급사코드를 배치했습니다.
- `회원`: 회원코드를 코드 기준으로 끌어올리고 이름 · 소속만 뒤에 배치했습니다.
- `대화`: 대화코드를 앞쪽 기준값으로 올리고 차량번호 · 모델 · 최근 메시지 순으로 재배치했습니다.
- `코드관리`: 사용여부를 뱃지로 앞에 두고 항목코드 중심 1줄 목록으로 통일했습니다.

## 3. `static/css/pages/chat.css`

- 대화목록이 관리목록 공통 구분점(`·`)과 충돌하지 않도록 기존 커스텀 점표시/여백을 정리했습니다.
- 새 순서에서도 말줄임이 자연스럽게 동작하도록 차량번호/세부모델/최근메시지 overflow 처리를 보강했습니다.

---

# 026_ui-sidebar-icon-text 변경 내역

## 1. `static/js/core/role-menu.js`

- 메뉴 항목에 `icon` 메타데이터를 추가했습니다.
- 각 항목을 `아이콘 + 텍스트` 구조로 렌더링하도록 변경했습니다.
- 외부 아이콘 라이브러리 의존 없이, Lucide 감성의 선형 SVG 아이콘을 공통 메뉴 레이어에서 직접 생성합니다.

## 2. `static/css/layout.css`

- 공통 사이드바 링크에 아이콘 슬롯, 라벨 슬롯, hover / active / focus-visible 상태를 추가했습니다.
- 기존 active 표시 로직은 유지하면서 아이콘 색상도 현재 상태와 함께 반응하도록 정리했습니다.

## 3. `static/css/shared_new/ui_new_theme.css`

- 신형 ERP 레이아웃에서 사이드바 폭을 아이콘+텍스트 구조에 맞게 조정했습니다.
- `FREEPASS ERP` 브랜드 헤더를 표시하고, 신형 테마 톤에 맞는 사이드바 간격/라운드/선택 상태를 보강했습니다.

---

# 019 → 019_improved 변경 내역

## 1. `static/js/firebase/firebase-db-helpers.js` (신규 추가)

반복되는 패턴을 공통 헬퍼로 추출한 내부 모듈.
firebase-db.js에서만 import하며, 외부 페이지에서 직접 사용하지 않는다.

| 헬퍼 | 역할 |
|------|------|
| `softDelete(path)` | `status: 'deleted', deleted_at: now` 업데이트 |
| `setStatus(path, status)` | `status + updated_at` 업데이트 |
| `watchCollection(path, cb, options)` | onValue 래퍼 — filter/sort/mode 옵션 지원 |
| `fetchCollection(path, options)` | 1회성 조회 래퍼 |
| `fetchOne(path)` | 단일 레코드 조회 (없으면 null) |
| `isNotDeleted` / `isActive` | 공통 필터 함수 |

---

## 2. `static/js/firebase/firebase-db.js` (리팩터링)

### 줄어든 반복 코드

| 패턴 | 기존 | 개선 |
|------|------|------|
| 소프트 삭제 (`status: 'deleted', deleted_at`) | 6곳 직접 작성 | `softDelete()` 1줄로 통합 |
| 상태 변경 (`status, updated_at`) | 4곳 직접 작성 | `setStatus()` 1줄로 통합 |
| `onValue` + filter + sort 보일러플레이트 | 각 컬렉션마다 10줄+ | `watchCollection()` 옵션으로 통합 |
| `Object.values(snapshot.val() || {})` | 15곳+ | `snapshotToValues()` 내부 처리 |
| `new Date()` → dateKey 생성 | 3곳 중복 | `todayDateKey()` 1회 선언 |
| 색상 배열 파싱 (`split + trim + filter`) | normalizeVehicleMasterEntry 내부 중복 | `parseColorList()` / `uniqueStrings()` 분리 |
| 상품 중복 검사 | `saveProduct` / `updateProduct` 각각 | `checkDuplicateInProducts()` 통합 |
| 정책 중복명 검사 | `saveTerm` / `updateTerm` 각각 | `checkDuplicateTermName()` 통합 |
| `watchGeneratedCodes` 내부 forEach 루프 | items.push 반복 | `...map()` 체인으로 가독성 개선 |
| `updateLinkedProductReferences` 내부 | contracts/rooms 각각 중복 루프 | `patchCollection()` 내부 헬퍼로 통합 |

**기존 public API는 100% 동일하게 유지**. 기존 페이지 코드 수정 불필요.

---

## 3. `app.py` (리팩터링)

### Blueprint 분리
| Blueprint | 경로 | 포함 라우트 |
|-----------|------|------------|
| `auth_bp` | — | `/login`, `/signup`, `/reset-password` |
| `old_bp`  | — | `*-old` 기존 페이지 10개 |
| `pages_bp`| — | 신 버전 페이지 12개 |
| `api_bp`  | `/api` | `/api/vehicle-master/fetch` |

### 기타 개선
- 기존 10개 old 라우트 / 12개 new 라우트 → 각각 매핑 테이블(`_OLD_ROUTES`, `_NEW_ROUTES`) + `add_url_rule` 반복문으로 통합
- 에러 핸들러 추가: 404 / 500 (API는 JSON, 페이지는 로그인으로 리다이렉트)
- `_api_error()` 헬퍼로 에러 응답 구조 통일

---

## 4. `static/js/core/role-menu.js` (기능 확장)

- `ALL_MENUS` → `ROUTE_REGISTRY`로 확장: `pageTitle` 필드 추가
- `getPageTitle(pathname)` 공개 함수 추가 — JS에서 현재 페이지 타이틀 접근 가능
- `setMenuActive` 개선: 정확 일치 우선, 없으면 prefix 매칭 fallback
  (기존: `href === pathname` 단순 비교 → 쿼리스트링 포함 URL에서 active가 안 잡히는 버그 수정)
- 기존 `renderRoleMenu` 시그니처 100% 유지

---

## 변경하지 않은 파일

나머지 JS, CSS, HTML 파일은 이번 버전에서 변경하지 않았다.
다음 단계 후보:

1. `management-skeleton.js` — `createManagedFormModeApplier` 내부 삼항 연산자 정리
2. `product-manage.js` 계열 — import/filters/selects 모듈 경량화 계속 진행
3. CSS — `ui_tokens.css` 변수 기반으로 `form.css` / `list.css`의 하드코딩 값 대체
