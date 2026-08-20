# W-04 — Firebase 콘솔 작업 (PM 직접 수행)

작업 지시서: `prompts/W-04.md` §6 (WF-04)
이 문서의 **1~6단계를 마치고 `.env`를 채운 뒤** Claude Code에 재개를 지시하면 2단계(실 로그인 검증)로 넘어간다.

> ⚠ **경고 1 — `sundo-dev`에 실제 학생 명부를 넣지 마라.**
> 5단계의 임시 Rules는 **도메인 3차 방어만** 한다. 역할(`role`)·상태(`status`) 검증이 없어
> `@dshs.kr` 계정이면 누구나 모든 문서를 읽고 쓸 수 있다. 실명 학생 데이터는 W-15에서
> 본편 Rules를 배포한 뒤에 넣는다. 그때까지는 가짜 데이터만 쓴다.
>
> ⚠ **경고 2 — Firestore를 테스트 모드로 만들지 마라.**
> 테스트 모드는 30일 뒤 전면 차단되고, 그 사이에는 **인증 없이도 전체 공개**다.
> 반드시 프로덕션 모드로 만든 뒤 5단계의 규칙을 배포한다.

---

## 1. 프로젝트 생성 — `sundo-dev`

1. <https://console.firebase.google.com> → **프로젝트 추가**
2. 프로젝트 이름 `sundo-dev` (프로덕션 `sundo-prod`는 **W-19**에서 따로 만든다)
3. Google 애널리틱스는 **사용 안 함**으로 둔다 (MVP 범위 밖, 개인정보 수집 최소화)

---

## 2. Authentication → Sign-in method

1. **Authentication** → **시작하기**
2. **Google** Provider → **사용 설정**
   - 프로젝트 지원 이메일: 관리자 계정 선택
3. **이메일/비밀번호 Provider가 "사용 중지"인지 확인한다.**
   - 켜져 있으면 **끈다.** PRD C4 — 이 앱은 Google Provider 단독이고,
     `users` 문서에 비밀번호 필드가 존재하지 않으며 코드에도 비밀번호 API가 없다.
4. 다른 Provider(익명·전화·GitHub 등)는 전부 사용 중지 상태로 둔다.

---

## 3. Authentication → Settings → Authorized domains

1. `localhost`가 목록에 있는지 확인한다 (기본 포함). **없으면 개발 중 OAuth가 즉시 실패한다.**
2. 배포 도메인 등록은 **W-19**에서 한다. 지금은 추가하지 않는다.

---

## 4. Firestore Database 생성

1. **Firestore Database** → **데이터베이스 만들기**
2. **위치: `asia-northeast3` (서울)** — 한 번 정하면 바꿀 수 없다. 반드시 확인하고 진행한다.
3. **프로덕션 모드로 시작**을 선택한다. (경고 2 참조)
4. 생성 후 컬렉션은 만들지 않는다. `departments/dshs-jayul` 시딩은 W-15 이후다.

---

## 5. 임시 개발용 Rules 배포

**Firestore Database → 규칙** 탭에서 전체를 아래로 교체하고 **게시**한다.

```
// 임시 개발 규칙 — W-15에서 전면 교체한다. 절대 프로덕션에 배포하지 마라.
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null
        && request.auth.token.email.matches('.*@dshs[.]kr$');
    }
  }
}
```

- 정규식 끝의 `$`는 **필수**다. 없으면 `attacker@dshs.kr.evil.com` 형태가 통과한다(§9.6 필수 규칙 1).
- 이 규칙은 §9.6의 역할·상태 조건을 **하나도** 담고 있지 않다. 경고 1을 다시 읽어라.

---

## 6. 웹 앱 등록 → `.env` 기입

1. **프로젝트 설정(톱니) → 내 앱 → 웹(`</>`)** 추가
2. 앱 닉네임 `SunDO Web`. **Firebase Hosting 설정은 지금 체크하지 않는다**(W-19).
3. 표시되는 `firebaseConfig` 6개 값을 저장소 루트의 `.env`에 옮긴다.
   `.env.example`을 복사해 만들면 된다.

```
VITE_FIREBASE_API_KEY=            → apiKey
VITE_FIREBASE_AUTH_DOMAIN=        → authDomain
VITE_FIREBASE_PROJECT_ID=         → projectId
VITE_FIREBASE_STORAGE_BUCKET=     → storageBucket
VITE_FIREBASE_MESSAGING_SENDER_ID= → messagingSenderId
VITE_FIREBASE_APP_ID=             → appId
```

- 파일명은 `.env` 또는 `.env.local` 아무거나 좋다. Vite가 둘 다 읽고 `.env.local`이 우선한다.
  둘 다 `.gitignore`에 있어 커밋되지 않는다. **`.env.example`만 커밋 대상이다** —
  복사해서 쓰되 원본을 지우거나 이름을 바꾸지 마라.
- 6개 중 하나라도 비어 있으면 앱이 시작하자마자 **어느 변수가 없는지 이름을 찍고 멈춘다.**

---

## 7. 2단계 검증에 필요한 준비물

재개를 지시하기 전에 아래를 준비해 두면 검증이 한 번에 끝난다.

| 준비물 | 용도 | DoD |
| --- | --- | --- |
| `@dshs.kr` 계정 1개 | 정상 로그인 · `noProfile` 판정 확인 | 14 · 19 |
| **개인 Google 계정 1개**(`@gmail.com` 등) | 도메인 거절 → 계정 자동 삭제 확인 | 16 · 17 |
| 브라우저 팝업 차단 설정 | 리다이렉트 폴백 확인 | 18 |

> 개인 계정은 **로그인 시도 즉시 삭제된다.** 앱이 `deleteUser`를 호출하기 때문이며,
> 그 계정의 Firebase Auth 레코드만 지워질 뿐 **Google 계정 자체에는 아무 영향이 없다.**

검증 중 확인할 콘솔 화면: **Authentication → Users**.
개인 계정으로 로그인한 뒤 이 목록에 **남아 있지 않아야** 한다(DoD 17).

---

## 8. 이번 작업에서 하지 않는 것

| 항목 | 시점 |
| --- | --- |
| `departments/dshs-jayul` · 초기 부장 지정 | W-15 이후 |
| 학생 명부 CSV 임포트 | W-08 |
| Security Rules 본편 · 인덱스(IX-01~IX-13) | W-15 |
| `sundo-prod` 생성 · 배포 도메인 등록 · Hosting | W-19 |
| Cloud Functions · Blaze 요금제 전환 | `[결정 필요 D-16]` |
