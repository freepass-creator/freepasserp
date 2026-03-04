# FREEPASS ERP UI Skeleton v4 (Demo)

## Run
```bash
python app.py
# http://127.0.0.1:7000
```

## Implemented (demo-functional)
- Global Shell: Sidebar + Topbar + Content (panel scroll)
- Layouts:
  - 상품 9:3
  - 대화 6:3:3
  - 승인 6:6 (사람 중심)
  - 등록 3:5:4
  - 정산 6:6
  - 설정 12
  - 요청(신설) 4:4:4 ✅
- Row density standard: main 12px / sub 10px
- Rectangular controls: buttons/inputs/badges
- 요청 flow:
  1) 요청 선택 → 상세 + 응찰 목록
  2) 응찰 선택 → 확정 버튼 활성
  3) 확정 → 요청 상태 '확정', 확정 응찰 표시, 채팅 버튼 활성
  4) 채팅 → 대화 페이지로 이동 (roomId: `REQ_{requestId}_{providerCode}`)

## Note
- UI+demo data only (no Firebase yet).


## v4 changes
- Sidebar nav starts below topbar (aligned with section headers)
- Products: header shows selected terms (from filter)
- Products list: per-term columns show rent(main) + deposit(sub)
- Products filter overlay covers ONLY right panel

---
## Firebase 적용 (로그인/회원가입)

이 버전은 **Firebase Auth(이메일/비밀번호)** 로 로그인/회원가입을 처리하고,
서버(Flask)는 **Firebase ID Token을 검증한 뒤 세션을 생성**합니다.

### 1) Firebase 콘솔 설정
- Authentication → Sign-in method → **Email/Password 활성화**
- Authentication → Users 에서 관리자 계정을 **미리 생성**
  - 이메일: `admin@freepassmobility.com`
  - 비밀번호: `870602`  (Firebase 정책상 **6자리 이상** 필요)

### 2) 서버 환경변수(권장)
- `FIREBASE_PROJECT_ID=freepasserp`
- (선택) `BOOTSTRAP_ADMIN_EMAIL=admin@freepassmobility.com`

### 3) 동작 흐름
- 회원가입: Firebase Auth 계정 생성 → 서버에 가입요청(PENDING) 저장 → 승인대기 화면
- 관리자 승인: 승인 페이지에서 PENDING → ACTIVE로 이동
- 로그인: Firebase 로그인 → 서버 세션 생성 → ACTIVE만 내부 페이지 접근

> 서버는 firebase-admin 없이 **Google 공개 인증서로 JWT 검증**을 합니다.
> 따라서 Flask 서버가 외부로 https 요청(인증서 fetch)을 할 수 있어야 합니다.


## Realtime Database rules (chat MVP)

초기 테스트용으로는 아래처럼 열어두면 2개 창(영업/공급사)에서 바로 동기화됩니다. 오픈 전에는 반드시 권한 규칙을 강화하세요.

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

권한형으로 갈 때는 `rooms`는 agentCode/providerCode 기반으로 조회/쓰기 제한, `chats`는 roomId 참여자만 읽기/쓰기 제한을 걸어야 합니다.

---

## Deploy (Vercel)

이 프로젝트는 Flask 앱을 **Vercel Python Serverless Function** 형태로 배포합니다.

### 필수 파일
- `vercel.json` (라우팅/빌드 설정)
- `api/index.py` (WSGI 엔트리포인트)
- `requirements.txt` (의존성)

### 배포 방법
1) GitHub에 푸시
2) Vercel에서 Import → Deploy
3) 배포 URL로 접속

> 참고: `/static/*` 경로는 Vercel이 정적 파일로 서빙하고, 그 외 모든 요청은 Flask 함수로 라우팅됩니다.
