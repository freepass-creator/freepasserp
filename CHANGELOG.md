## v002
- [Deploy] Add Vercel serverless entry (api/index.py) + vercel.json with filesystem-first routing so /static assets (core.css, login.js, etc.) load correctly on Vercel.
- [Deploy] Add requirements.txt for Vercel Python build.

## v021
- [UX] Chat message panel scroll anchoring improved: on room enter and input focus, it scrolls to the latest message; while chatting, it keeps the view pinned to bottom only when you’re already near bottom (prevents jump to top and flicker).

## v019
- [Fix] Chats page JS syntax error in `static/js/pages/chats.js` removed (extra `});`) which prevented chat list rendering.

## v016
- [Fix] Chat messages render updated to incremental stream (`child_added`) to prevent flicker (no full clear/repaint on send).
- [Perf] Reduced DOM churn: append-only render + near-bottom auto-scroll.

## v015
- Chats list date/time format changed to `yy/mm/dd hh:mm`.
- Chats list main/sub line typography forced to 12px/10px to match product list.

## v008
- 대화목록을 상품목록 row 규격과 동일하게 재구성(대여료 제외) + [상태][구분] 차량번호 제조사 세부모델 / 일자 시간 / 숨김 버튼(행 중앙)
## v014
- [Fix] 상품 상세의 '문의' 클릭 시 서버 지연/오류와 무관하게 즉시 /chats로 이동(낙관적 roomId 계산)하고, 백그라운드로 /api/chat/open 메타 보정 + Firestore rooms ensure를 수행.
- [Fix] /chats 진입 시 URL roomId(+carNo/detailModel 등)로 Firestore rooms 메타를 best-effort로 ensure하고, Firestore 반영이 지연/차단되더라도 목록에 임시(pending) 방을 표시하여 채팅 오픈/목록 생성이 체감상 끊기지 않도록 처리.

- 보조줄에 채팅방코드 | 마지막메세지 표시
- 숨김 버튼 클릭 시 방 숨김 처리(Firestore hiddenBy)

# freepass_erp_004

## Summary
- 채팅방 메타(rooms): 로컬 JSON(data/chat_rooms.json) 의존을 끊고 **Firestore(rooms 컬렉션)** 기반으로 전환
  - 대화 페이지 방목록: Firestore realtime(onSnapshot)
  - 문의하기: 서버는 roomId/메타 계산만, 실제 방 메타 생성/갱신은 클라이언트가 Firestore에 merge 저장
- 메시지(chats): RTDB 유지(다음 버전에서 Firestore로 통일 예정)
- 프로젝트 버전: `VERSION.txt` = 004 (상단바 `v004`)

## Files changed
- `app.py`
- `templates/layout/shell.html`
- `static/js/firebase_runtime.js`
- `static/js/core/chat_store.js`
- `static/js/pages/chats.js`
- `VERSION.txt`

---

# freepass_erp_003

## Summary
- 상품 페이지: 기존 동작 유지(상품 목록/상세/기간 헤더 정렬 로직 포함)
- 프로젝트 버전: `VERSION.txt`를 단일 소스로 추가하고, 상단바에 `v003` 표시(중복/불일치 방지)

## Files changed
- `VERSION.txt` (new)
- `app.py`
- `templates/layout/shell.html`
- `static/css/core/20_layout.css`

---

# v43 — Policy panel layout per PPT + review field + count sync retained

## Summary
- Register 우측 패널의 **정책(약관)** UI를 PPT 구조로 재배치:
  - 패널헤드: 제목 + 저장 버튼만
  - 헤더 바로 아래: 정책 종류 드롭다운(9개)
  - 그 아래: 기본정책/보험조건/자차/심사(리뷰) 입력을 한 화면에 스크롤로 쭉 입력
  - 하단: 수정로그 표시
- 보험 담보는 가입여부 없이 **한도 미입력 = 없음** 규칙 유지.
- 기존 v42의 **0건 카운트 동기화**(register/products) 유지.

## Files changed
- `templates/pages/register.html` — 우측 정책 패널 HTML 전면 재배치(헤더/드롭다운/섹션/로그)
- `static/js/pages/register/policy.js` — 정책 UI 로직 재작성(선택/로드/저장/로그)
- `app.py` — 정책 저장 API에서 `review` 필드 저장 허용

## Test checklist
1. `python app.py` 실행 → `/register` 접속
2. 우측 패널에서 정책 종류 선택 → 기본값 로딩 확인
3. 값 수정 후 **저장** → 새로고침 후 유지 확인 + 하단 로그 추가 확인
4. `data/vehicles.json` 비우기 → `/register`, `/products` 탑바가 `0건` 확인

## v44 – 등록 페이지 적용약관 드롭다운을 정책(9종)에서 로드
- 수정: static/js/pages/register/index.js (setPolicyOptions 함수 오류/잔여 코드 제거, /api/policies 기반 옵션 로드)
- 동작: 등록 폼 '적용약관' 드롭다운이 policies.json(국산1~3/수입1~3/기타1~3)을 그대로 표시

## v46
- 정책(약관) UI 제거(우측 패널 메모로 대체)
- 기본 샘플약관 1개(POL_SAMPLE) + 국산차1/2 시드
- 기존 차량에 policyId 없으면 자동으로 POL_SAMPLE 채움
- 차량 등록시 기본 policyId=POL_SAMPLE

## v005
- Fix: Firestore rooms visibility for AGENT/PROVIDER by storing and querying multiple principals (uid/code/company) using array-contains-any fallback.
- Fix: Hide-room also marks all identity keys so it behaves consistently across logins.

## v006
- Fix: Firestore rooms query no longer requires composite index for agent/supplier by removing orderBy from array-contains(-any) queries and sorting client-side.


## v007
- Chats 우측 패널(요약)을 상품페이지 상세패널과 동일한 UI(섹션/행/타이포/간격)로 렌더링하도록 스타일을 추가
- Chats 우측 패널 헤더를 '요약' → '상세정보'로 변경(상품 상세 패널과 동일한 의미)


## v009
- Fix: chats list was blank due to a JavaScript syntax error in chats.js (extra closing brace).

## v010
- 대화목록 상태(배지) 3종 자동 산출: **미확인 / 응답대기 / 응답완료**
  - 내(uid) 기준으로 `lastAt`, `lastSenderUid`, `readAtByUid[uid]`를 사용해 계산
  - 정렬: **미확인 → 응답대기 → 응답완료(맨 아래)**, 동일 그룹 내 `updatedAt` 최신 순
- Firestore rooms 메타 확장
  - 메시지 전송 시 rooms에 `lastSenderUid`, `lastAt`, `readAtByUid.<uid>` best-effort 갱신
  - 대화방 선택/열람 시 rooms에 `readAtByUid.<uid>` 갱신(mark read)

## v011
- 대화방 선택 시 렌더링 지연(버벅임) 완화: 메시지/상세 렌더링을 다음 프레임으로 지연.
- 메시지 로딩 즉시 '불러오는 중...' 표시.
- RTDB 권한/연결 오류 발생 시 빈 화면 대신 오류 메시지 표시.
- RTDB 구독 limitToLast 120으로 축소.

## v012
- chats: Firestore rooms snapshot loop/flicker fix (URL selection applied once, markRead guarded by lastAt).
- chats: RTDB messages markRead throttled to last message timestamp to prevent endless updates.


## v017
- Fix: chat_store.js syntax/object literal corruption that broke chats page (subscribeMessagesStream).


## v018
- Fix: rooms list could be empty for all roles when Firestore subscribe fails (rules/index/network). Added fallback to server `/api/chat/rooms` when Firestore onSnapshot errors.

## v019
- Fix: chats page JavaScript parse error (`Unexpected token ')'`) in `static/js/pages/chats.js`.

## v020
- Fix: message pane flicker + scroll-jump on send by preventing `renderMessages()` from running on every Firestore rooms snapshot update (run only when active room changes).
## v001 (2026-03-04)
- Register 페이지 3패널(목록/등록/약관) 구성
- 제조사/모델/세부모델 드랍다운(엑셀 마스터 기반) 적용
- 약관 등록/편집 패널 항목 확장(보험/연령/주행/위약금) + 변경로그
