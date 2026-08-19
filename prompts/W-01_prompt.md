# W-01 — 프로젝트 스캐폴딩

> `prompts/W-01.md`
> 이 파일을 읽었으면 §0을 먼저 확인하고, §5 절차를 순서대로 수행한다.

---

## 0. 착수 전 필독

- 이 저장소는 **GitHub에 레포지토리만 생성된 빈 상태**다. 코드·브랜치·커밋이 하나도 없다.
- 이 작업의 목표는 **동작하는 앱을 만드는 것이 아니다.** 이후 모든 작업이 올라탈 뼈대와 규약을 세우는 것이다.
- 화면·기능·컴포넌트를 **하나도 만들지 마라.** `App.tsx`는 파이프라인 확인용 최소 화면 하나로 끝낸다.
- Firebase, React Router, 상태 관리 라이브러리를 **설치하지 마라.** 각각 W-04, W-05 담당이다.
- 판단이 갈리면 코드를 쓰지 말고 §7의 형식으로 먼저 묻는다.

---

## 1. 완료 조건 (DoD)

아래 8개가 전부 참이어야 이 작업이 끝난 것이다.

| # | 조건 | 확인 방법 |
| --- | --- | --- |
| 1 | `npm run build`가 오류 없이 통과 | 명령 실행 |
| 2 | `npm run dev`로 뜬 화면에 Spoqa Han Sans Neo가 적용됨 | 브라우저 확인 |
| 3 | Tailwind v4 유틸리티 클래스가 실제로 동작 | 확인용 화면에서 검증 |
| 4 | `@theme` 블록에 정의한 커스텀 토큰이 클래스로 동작 | 확인용 화면에서 검증 |
| 5 | §3 폴더 구조가 전부 존재하고, 빈 폴더도 Git에 추적됨 | `git status` |
| 6 | 저장소 루트에 `CLAUDE.md`가 존재하고 §4 내용을 담고 있음 | 파일 확인 |
| 7 | `docs/PROGRESS.md`가 작성되어 있음 | 파일 확인 |
| 8 | 커밋 메시지 `SunDO v0.0.1`로 원격 푸시 완료, Contributors에 Claude 없음 | `git log --format='%an <%ae>%n%b'` |

---

## 2. 기술 스택 (고정값 — 임의 변경 금지)

| 항목 | 값 | 비고 |
| --- | --- | --- |
| 빌드 도구 | Vite | 최신 안정 버전 |
| 프레임워크 | React 19 | — |
| 언어 | TypeScript | `strict: true` |
| 템플릿 | `react-ts` | — |
| CSS | **Tailwind CSS v4** | v3 방식과 다르다. §5.3 참조 |
| 폰트 | Spoqa Han Sans Neo | CDN 링크 |
| 패키지 매니저 | npm | — |

**Tailwind v4 주의 — 이 부분에서 가장 많이 틀린다**

- `tailwind.config.js`를 **만들지 마라.** v4는 설정 파일 없이 CSS에서 설정한다.
- `postcss.config.js`도 **만들지 마라.** `@tailwindcss/vite` 플러그인을 쓴다.
- `npx tailwindcss init`을 **실행하지 마라.** v3 명령이다.
- `@tailwind base; @tailwind components; @tailwind utilities;`를 **쓰지 마라.** v3 문법이다.
- v4는 `@import "tailwindcss";` 한 줄과 `@theme { ... }` 블록을 쓴다.

만약 위 방식으로 진행했는데 유틸리티가 동작하지 않으면, v3 방식으로 되돌리지 말고 **작업을 멈추고 §7 형식으로 보고하라.**

---

## 3. 만들어야 할 폴더 구조

```
SunDO/
├─ prompts/              # 작업 지시서 (.gitkeep)
├─ reports/              # 작업 보고서 (.gitkeep)
├─ design/               # Claude Design 산출물 (.gitkeep)
├─ database_ToDo/        # Firebase 수동 작업 목록 (.gitkeep)
├─ docs/
│  └─ PROGRESS.md
├─ public/
│  └─ (Vite 기본)
├─ src/
│  ├─ main.tsx
│  ├─ App.tsx
│  └─ index.css
├─ CLAUDE.md
├─ .gitignore
├─ index.html
├─ package.json
├─ tsconfig.json
├─ tsconfig.node.json
└─ vite.config.ts
```

- 빈 폴더 4개(`prompts` `reports` `design` `database_ToDo`)에는 `.gitkeep` 빈 파일을 넣어 Git이 추적하게 한다.
- `docs/SunDO_PRD_v1.0.md`는 **사용자가 직접 넣는다.** 만들지 마라.
- `src/` 하위에 `components/` `pages/` `lib/` 등을 **미리 만들지 마라.** 필요할 때 만든다.

**`.gitignore` 최소 항목**

```
node_modules
dist
dist-ssr
*.local
.env
.env.*
!.env.example
.firebase
.DS_Store
*.log
.vscode/*
!.vscode/extensions.json
```

---

## 4. 저장소 루트 `CLAUDE.md` 작성

Claude Code는 세션마다 저장소 루트의 `CLAUDE.md`를 자동으로 읽는다. 대화가 끊겨도 규약이 유지되는 실질적 장치는 이 파일이다. 아래 내용을 그대로 작성한다.

````markdown
# SunDO — Claude Code 작업 규약

대전대신고등학교 자율생활부 앱. 상세 사양은 `docs/SunDO_PRD_v1.0.md`에 있다.
이 파일은 **작업 방식**에 대한 구속 규칙이다. 매 세션 시작 시 이 파일과 `docs/PROGRESS.md`를 먼저 읽는다.

## 출력 규약 (토큰 절약)

- 작업 완료 시 터미널에는 `작업이 완료되었습니다` **한 줄만** 출력한다. 보고서 내용을 터미널에 풀지 않는다.
- Firebase 콘솔에서 사용자가 직접 해야 할 일이 생기면 터미널에 `Firebase에서 작업할 사항이 있습니다. Markdown File을 확인하세요` **한 줄만** 출력한다.
- **예외**: 사양 충돌, 보안 위험, 데이터 손실 가능성, 판단이 갈리는 선택지가 있으면 위 제한을 적용하지 않고 전부 보고한다. 침묵이 더 비싼 상황이 있다.

## 작업 흐름

1. 사용자가 `{작업명}.md 작업 시작하자`라고 하면 `prompts/{작업명}.md`를 읽고 착수한다.
2. 지시서에 없는 범위로 작업을 넓히지 않는다.
3. 작업 중 `docs/PROGRESS.md`를 계속 갱신한다. 중단 후 재개할 때 이 파일만 읽으면 문맥이 복원되어야 한다.
4. 작업이 끝나면 `reports/{작업명}.md`에 보고서를 쓴다.
5. 커밋하고 푸시한다.

## 커밋 규약

- 원격: `https://github.com/stx4R/SunDO`
- **매 작업이 끝날 때마다 1회 커밋.** 작업 도중 중간 커밋은 하지 않는다.
- 메시지는 `SunDO vX.X.X` 형식으로 통일한다. 본문·설명을 덧붙이지 않는다.
  - 1번째 자리(0~99): 매우 크거나 주요한 업데이트
  - 2번째 자리(0~99): 보안 패치, 편의성 패치 등 사소하지 않은 업데이트
  - 3번째 자리(1~9): 자잘한 업데이트
  - 3번째가 9를 넘으면 2번째를 올리고 3번째를 1로 되돌린다. 2번째가 99를 넘으면 1번째를 올린다.
- **Contributors에 Claude를 포함하지 않는다.** 커밋 트레일러에 `Co-Authored-By: Claude ...`를 넣지 않고 `--author`를 변경하지 않는다.
- 커밋 전 확인: 빌드 통과 → 지시서의 완료 조건 충족 → 보고서 작성 → PROGRESS 갱신 → 메시지 형식·트레일러 확인

## 디자인 규약

- 모든 프론트엔드의 시각 원본은 `design/`의 Claude Design 산출물이다. 색·간격·문구·모션을 임의로 바꾸지 않는다.
- **같은 화면의 산출물이 2개 이상이면 항상 최신본을 채택한다.** 대조표는 PRD §20.7에 있다.
- 디자인에 없는 화면·상태를 만들어야 하면 먼저 사용자에게 묻는다.
- PRD에 명시된 기능이 디자인 산출물에도 있으면 구현 대상이다. 단 **착수 전 사용자 허락을 받는다.**
- 디자인과 PRD가 충돌하면 코드를 쓰지 말고 먼저 보고한다.
- 네이티브 `input`을 직접 쓰지 않는다. PRD §7.3 입력 필드 v2를 구현한 `Field` 컴포넌트만 사용한다.

## 질문 규약

- 사양이 불명확하거나 해석이 둘 이상이면 **코드를 쓰기 전에** 묻는다. 추측으로 구현하고 나중에 되돌리지 않는다.
- 질문할 때는 선택지와 각각의 결과·되돌리기 비용을 함께 적는다.
- PRD `[결정 필요 D-XX]` 항목에 도달하면 기본값으로 진행하되 보고서에 남긴다.
- 보안·개인정보·데이터 손실이 얽힌 판단은 기본값으로 넘기지 않고 반드시 묻는다.

## 절대 하지 않을 것

- 이메일/비밀번호 인증 코드 생성 (Google Provider 단독 — PRD C4)
- `email_verified` 검사 추가 (PRD §9.6 8항)
- Tailwind v3 문법 사용 (`tailwind.config.js`, `@tailwind` 지시어)
- 요청하지 않은 리팩터링, 인접 코드 "개선", 주석·포맷 변경
````

---

## 5. 절차

### 5.1 저장소 초기화

1. 로컬 작업 폴더에서 `git init`
2. 원격 등록: `git remote add origin https://github.com/stx4R/SunDO`
3. 기본 브랜치명을 `main`으로 설정
4. 원격이 완전히 비어 있는지 확인한다. 파일이 있으면 **덮어쓰지 말고 §7 형식으로 보고하라.**

### 5.2 Vite 프로젝트 생성

현재 폴더에 `react-ts` 템플릿으로 생성한다. 하위 폴더를 새로 파지 않는다.
생성 후 기본 예제 파일(`assets/react.svg`, `App.css` 등)은 쓰지 않으므로 정리한다.

### 5.3 Tailwind v4 설정

1. `tailwindcss`와 `@tailwindcss/vite`를 devDependency로 설치
2. `vite.config.ts`에 Tailwind 플러그인을 등록
3. `src/index.css`를 아래 형태로 작성한다

```css
@import "tailwindcss";

@theme {
  /* W-01은 파이프라인 확인용 최소 토큰만 정의한다.
     전체 디자인 토큰은 W-02에서 PRD §7.1~7.3 기준으로 채운다. */
  --color-sundo-ink: #14352A;
  --color-sundo-primary: #1F5138;
  --font-sundo: "Spoqa Han Sans Neo", -apple-system, sans-serif;
}
```

4. `index.html`에 Spoqa Han Sans Neo CDN 링크를 추가하고 `<html lang="ko">`로 설정한다.

### 5.4 확인용 화면

`App.tsx`는 아래 4가지를 **한 화면에서 눈으로 확인할 수 있게만** 만든다. 그 이상 만들지 마라.

1. Tailwind 기본 유틸리티가 먹는지 (예: 패딩·플렉스·라운드)
2. `@theme` 커스텀 색 토큰이 클래스로 먹는지 (`text-sundo-primary` 등)
3. Spoqa Han Sans Neo가 적용됐는지 (한글 문장 1줄)
4. PRD §7.1 배경 그라디언트 `linear-gradient(180deg,#F7FBF8 0%,#EAF3ED 100%)`가 렌더되는지

문구는 `스캐폴딩 확인` 정도로 충분하다. 로고·독·카드 등 실제 UI 요소를 만들지 마라.

### 5.5 문서 작성

- `CLAUDE.md` — §4 내용 그대로
- `docs/PROGRESS.md` — 아래 양식으로 작성

```markdown
# SunDO Progress

## 현재 버전
v0.0.1

## 완료한 작업
- [x] W-01 프로젝트 스캐폴딩

## 진행 중
- 없음

## 다음 작업
- W-02 디자인 토큰 이식 (PRD §7.1~7.3)

## 막힌 지점 / 사용자 확인 필요
- (없으면 '없음')

## 다음 세션이 먼저 읽어야 할 파일
- CLAUDE.md, docs/SunDO_PRD_v1.0.md, prompts/{다음 작업}.md
```

### 5.6 보고서

`reports/W-01.md`에 아래 항목을 담는다. **터미널에 출력하지 않는다.**

- 설치된 패키지와 버전 (`react`, `vite`, `tailwindcss`, `typescript`)
- 생성한 파일 목록
- §1 완료 조건 8개 각각의 통과 여부
- 판단이 필요했던 지점과 선택한 근거
- 사용자 확인이 필요한 사항
- 다음 작업(W-02)에 넘길 전제

### 5.7 커밋

1. `.gitignore`가 먼저 적용됐는지 확인한다. `node_modules`가 스테이징되면 안 된다.
2. 커밋 메시지: `SunDO v0.0.1`
3. `git push -u origin main`
4. `git log -1 --format='%an <%ae>%n%b'`로 Claude 트레일러가 없는지 확인한다.

---

## 6. 버전 기준

이 작업의 커밋은 **`SunDO v0.0.1`** 이다.

`v1.0.0`은 PRD §17.1 MVP 완료 조건을 전부 충족한 시점에 붙인다. 디자인 시안(S10 설정 화면)에 `버전 1.0.0`으로 그려져 있는 것은 **출시 목표값**이지 현재 빌드 버전이 아니다. 혼동하지 마라.

`package.json`의 `version` 필드도 `0.0.1`로 맞춘다.

---

## 7. 질문이 필요할 때의 형식

아래 상황에서는 코드를 쓰지 말고 멈춘 뒤, 이 형식으로 사용자에게 묻는다.

- 원격 저장소가 비어 있지 않을 때
- Tailwind v4 설정이 §2 방식으로 동작하지 않을 때
- Node 버전이 맞지 않아 설치가 실패할 때
- 위 지시가 서로 모순될 때

```
[확인 필요] {한 줄 요약}

상황: {무엇이 어떻게 막혔는지}

선택지
 A. {안} → 결과: {…} / 되돌리기 비용: {…}
 B. {안} → 결과: {…} / 되돌리기 비용: {…}

추천: {A 또는 B}와 그 이유
```

---

## 8. 이 작업에서 하지 말 것

- Firebase SDK 설치 (W-04)
- React Router 설치 (W-05)
- 공통 컴포넌트 제작 (W-03)
- 전체 디자인 토큰 이식 (W-02)
- ESLint/Prettier 규칙 커스터마이징 (요청 없음)
- 테스트 프레임워크 도입 (요청 없음)
- CI/CD 워크플로 작성 (W-19)
- `src/` 하위 폴더 미리 생성
