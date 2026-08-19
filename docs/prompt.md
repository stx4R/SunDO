## 작업 원칙 (최우선)

1. 기술적 모순, 내 지시 간 충돌, 애매한 부분, 궁금한 점, 수정 제안이 생기면 **작업 전에 반드시 나에게 먼저 질문**할 것.
2. 내 지시를 전부 꼼꼼히 읽을 것.
3. 할 일을 정리하고 Step by Step으로 구조화할 것.

내가 아래에 **예시 우수 프롬프트/문서**를 알려줄 테니, 그 형식과 밀도를 기준으로 삼아 그대로 작성해라. 예시의 목차 구조, 표 사용 방식, 문장 톤, 상세 수준을 그대로 따르고, 예시보다 덜 구체적인 섹션이 없게 해라.

```
[## ① Project Overview

- **< Goal >** React & TypeScript를 활용하여 약 100명의 참가 의원과 36명의 운영진을 포함한 **약 150여 명의 사용자**가 실시간으로 빠르게 소통할 수 있는 "제 3회 오량모의국회 WebApp"을 제작한다. (Vercel 배포, Supabase DB 연동)
- **< Target User >** 본 대회를 참여 및 운영하는 Admin, Mod, 일반 User 3계층. **(데스크탑 웹 환경을 메인 기준으로 설정하며, 모바일은 이를 보조하는 서브 환경으로 지원함)**
- **< Key Value >** 직관적인 UI/UX, 극대화된 가독성, 화려한 동적 애니메이션, WebApp과 DB 간의 빠르고 안전한 통신

---

## ② Tech Stack

- **Framework : React (Next.js App Router) — TypeScript 기반**
- **Styling : Tailwind CSS v4 (Utility-First), `clsx` + `tailwind-merge` (`utils/cn.ts`의 `cn()` 유틸리티로 조건부 클래스 병합)**
- **Animation : Framer Motion**
- **Icons : Lucide React**
- **Server/Hosting : Vercel**
- **Database : Supabase (Auth · RLS · Realtime · Storage · RPC)**
- **Middleware : `proxy.ts` (`export async function proxy`) — 이 버전의 Next.js는 `middleware.ts`가 아닌 `proxy.ts`를 사용한다. 절대 `middleware.ts`를 생성하지 말 것.**

---

## ③ UI/UX & Design Layout

### 1. Color System & Theme (Dark/Light Mode supported)

메인 컬러인 레드(`#c0392b`)와 옐로우(`#f1c40f`)를 60-30-10 법칙에 따라 배치하며,
테마 전환 시 잉크가 번지듯 둥근 원 형태로 배경색이 퍼져나가는 **원형(Circular Reveal) 모핑 애니메이션**을 적용해 동적인 느낌을 부여한다.

**커스텀 컬러 토큰 (`globals.css` `@theme` 블록):**

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `--color-red-primary` | `#c0392b` | 주 강조색 (라이트 모드 버튼, 헤더 배경 등) |
| `--color-red-hover` | `#a93226` | 레드 호버 상태 |
| `--color-yellow-primary` | `#f1c40f` | 보조 강조색 (다크 모드 버튼, 배지 등) |
| `--color-yellow-hover` | `#d4ac0d` | 옐로우 호버 상태 |
| `--color-dark-bg` | `#121212` | 다크 모드 최하위 배경 |
| `--color-dark-surface` | `#1e1e1e` | 다크 모드 카드/패널 배경 |
| `--color-dark-border` | `#2a2a2a` | 다크 모드 구분선/테두리 |
- **< 라이트 모드 (Light Mode) >** 화이트/웜그레이 배경(60%). 레드는 헤더 배경이나 대제목 등 면적을 넓게(30%) 사용하여 시각적 무게 중심을 잡는다. 옐로우는 핵심 버튼 등(10%)에 사용한다.
- **< 다크 모드 (Dark Mode) >** 짙은 다크 그레이 배경(`#121212`). 눈의 피로를 막기 위해 레드는 카드 테두리(Border)나 그림자(Drop-shadow) 등 선 위주로 좁게 사용한다. 옐로우는 버튼이나 상태 바에 발광(Glow/Neon) 효과를 주어 가시성을 극대화한다.
- **다크모드 활성화 방식:** Tailwind v4의 `@variant dark (&:is(.dark *))` — 클래스 기반. `ThemeProvider`가 `html` 태그에 `.dark` 클래스를 토글하며, 선택값은 `localStorage`에 저장된다.

### 2. Global Elements (Header & Footer)

- **< Header (GNB) >**
    - **< Contexts >** `About`, `Vote`, `Chat`, `Help`, `Login` (비로그인 시) / `About`, `Vote`, `Chat`, `Help`, `Admin Dashboard`(Admin·Mod 한정), `Logout` (로그인 시). 향후 메뉴 추가를 고려해 텍스트를 고정 위치가 아닌 **우측 정렬**로 배치.
    - 로그인 상태에서는 이름 옆에 **정당(PP) 배지**와 **역할(Role) 배지**를 함께 표시.
    - **< 데스크탑 (Standard) >** 넓고 쾌적한 형태의 상단 고정 헤더(Sticky Header). 스크롤 시 반투명(Blur) 효과 적용.
    - **< 모바일 (Variants) >** 화면이 좁아지면 데스크탑의 메뉴들을 햄버거 메뉴(☰) 안으로 숨겨 공간을 확보.
- **< Footer >**
메인 브랜드 컬러와 충돌하지 않도록 무채색(Gray/Slate) 계열로 고정하여 혼동을 방지한다.
    
    `<footer className="w-full text-center py-6 text-sm text-gray-400 dark:text-slate-500 border-t border-gray-200 dark:border-slate-800">
      <p>© 2026 제 3회 오량모의국회. All rights reserved.</p>
      <p className="mt-1">
        Developed by{' '}
        <a href="http://stx4r.me/" target="_blank" rel="noopener noreferrer"
          className="font-bold text-gray-500 hover:text-blue-500 dark:text-slate-400 dark:hover:text-blue-400 transition-colors">
          stx4R
        </a>{' '}
        <a href="https://github.com/kmc11004" target="_blank" rel="noopener noreferrer"
          className="font-bold text-gray-500 hover:text-blue-500 dark:text-slate-400 dark:hover:text-blue-400 transition-colors">
          kmc
        </a>{' '}
        <a href="https://github.com/heejae0105" target="_blank" rel="noopener noreferrer"
          className="font-bold text-gray-500 hover:text-blue-500 dark:text-slate-400 dark:hover:text-blue-400 transition-colors">
          heejae
        </a>
      </p>
    </footer>`
    

### 3. Core Page Layouts & Technical Implementation

**< Common Principle >**
데스크탑의 넓은 화면을 100% 기준으로 화려한 다단 레이아웃과 호버 효과를 먼저 설계한다.
창 크기가 줄어들면(모바일) 가로 배치를 세로 스택(Stack)으로 내리고, 호버 효과를 터치(Tap) 효과로 대체(Graceful Degradation)한다.

- **< Main Tab (메인 페이지) >**
    - **< 배경 >** '오량모의국회' 주제에 맞춰 법봉(Gavel), 별(Star), 두루마리(Scroll), 기둥(Pillar), 저울(Scale) 5가지 국회 관련 도형 파티클들이 마우스 반발력(Mouse Repulsion)과 함께 부유하는 Canvas 기반 Interactive 배경 (`ParliamentBackground` 컴포넌트, Canvas 2D API 직접 사용).
    - **< 로고 영역 >** 운영진 소속 동아리 로고 12개를 무한 스크롤하는 Marquee 방식으로 구현 (`LogoMarquee` 컴포넌트). 정방향/역방향 두 줄로 배치하여 입체감 부여.
    - **< 히어로 섹션 >** 이벤트 배지, 메인 타이틀(레드/옐로우 컬러 강조), 부제목, CTA 버튼("안건 투표하기", "프로그램 안내"), 스크롤 유도 화살표(animate-bounce).
    - **< 스탯 요약 >** 참가 의원(100명), 협력 동아리(12개), 운영 기간(58일) 3가지 수치 표시.
- **< About (프로그램 설명 페이지) >**
    - **< 스타일 >** 라이트/다크 모드 전역 테마와 별개로 **다크 톤(`#0a0c12` 배경) 단일 스크롤 페이지**로 고정 설계. 페이지 전체가 어두운 배경을 유지한다.
    - **< 내용 & 섹션 구성 >** 아래 6개 섹션을 세로로 순차 배열한다.
        1. **Hero** — 페이지 전체 높이(`h-screen`) 중앙 정렬. 글자별 슬라이드업 애니메이션(Framer Motion). 배경 글로우 효과(Red/Yellow blur circle).
        2. **대회 개요 + Stats** — 총 참가자(100명), 부처(9개), 운영진(36명), 활동 기간(58일). CountUp 숫자 애니메이션.
        3. **일정 타임라인** — 중앙 수직선을 기준으로 좌우 교대로 카드 배치(데스크탑), 세로 스택(모바일). 선이 채워지는 scaleY 애니메이션.
        4. **상임위원회 소개** — 9개 부처 카드 그리드. 각 카드에 상임위원장·평가위원 표기.
        5. **정당 구성** — 진보(파랑)/보수(레드)/중도(옐로우) 3당 카드. 당대표, 당원 수, 이념 표기.
        6. **활동 흐름** — 의안 탐구→제출→상임위→본회의 4단계 스테퍼. 데스크탑은 가로, 모바일은 세로.
    - **< 애니메이션 >** 모든 섹션은 `whileInView`로 뷰포트 진입 시 fade-up 등장. `SectionHeader`, `TimelineCard`, `CountUp` 재사용 서브 컴포넌트 활용.
- **< Vote (안건 투표 페이지) >**
    - **< 내용 >** 안건 관련 텍스트. 로그인 필수 페이지.
    - **< 레이아웃 >** 데스크탑: **좌측 안건 목록(w-72) + 우측 상세 및 투표 UI**의 2열 구조. 모바일: 세로 스택으로 변형 (목록 위, 상세 아래).
    - **< 투표 정책 >** 투표는 찬성(✔)/반대(✗)/기권(−) 3택 1. **투표 완료 후 결과(찬반 비율 등)는 사용자에게 공개하지 않는다(백분율 비공개).** 투표한 의사("찬성"/"반대"/"기권")만 표시. 결과는 Admin Dashboard에서만 확인 가능.
    - **< 안건 상태 >** `is_open = true`: 투표 진행 중(녹색 pulse 배지). `is_open = false`: 대기 중(회색 배지). `is_completed = true`: 완료 처리 후 Vote 탭에서 숨겨짐.
    - **< Realtime >** `agenda_items` 테이블 `postgres_changes`로 안건 상태 변경 실시간 반영.
    - **< Auth Guard >** `onAuthStateChange(INITIAL_SESSION)` 패턴으로 인증 초기화 완료 후 미로그인 시 `/login`으로 리다이렉트. 무한 루프 방지를 위해 반드시 `INITIAL_SESSION` 이벤트 기준으로 판단할 것.
- **< Chat (채팅 페이지) >**
    - **< Layout >** 데스크탑: **좌측 채팅방 목록(w-64) + 우측 채팅 영역 + 우측 멤버 패널(w-52, 토글식)**의 최대 3단 구조. 모바일: `mobileView: 'rooms' | 'chat'` 상태로 방 목록 ↔ 채팅 영역을 단일 뷰로 전환(뒤로가기 버튼 제공).
    - **< 채팅방 종류 >**
        1. **전체 공지방** (`is_global = true`): 전원 자동 가입, Admin만 메시지 전송 가능, 일반 유저에게는 읽기 전용 안내 표시.
        2. **정당별 채팅방** (`party_tag` 보유): 소속 정당원 자동 가입. PARTY_LEADERS(`{ '진보': '김동하', '보수': '정재욱', '중도': '황성연' }`) 상수에 명시된 당대표가 방 개설자(`created_by`)로 자동 지정.
        3. **일반 채팅방**: 사용자가 직접 생성(`is_public = false`), 초대 기반 멤버십.
        4. **지원 채팅방** (`is_support = true`): Admin/Mod가 관리자 호출을 수락할 때 자동 생성.
    - **< 로그인 필수 >** `onAuthStateChange(INITIAL_SESSION)` 패턴으로 보호.
    - **< 추가 기능 >** 방 이름/이모지 아이콘 편집(개설자 전용), 사용자 초대 모달(개설자·Admin), 공지 핀 클릭 시 전체 내용 팝업, PIP 모드 전환 버튼, 커맨드 자동완성(Tab 키 완성 지원).
- **< Help (도움말 페이지) >**
    - **< 내용 >**
        1. **관리자 호출**: 로그인 사용자가 버튼 클릭 시 `admin_calls` 테이블에 `pending` row 삽입. Admin/Mod가 수락하면 지원 채팅방이 자동 생성되고 `support_ready` broadcast 수신 후 DB 멤버십 검증을 거쳐 PIP Chat이 자동으로 열림. 사용자당 pending 호출은 1개로 제한(Partial Unique Index).
        2. **버그 제보**: 제목(최대 100자) + 설명(최대 2000자) + 카테고리 폼. 비로그인 게스트도 제출 가능. DB 레벨 Rate Limit: 인증 사용자는 5분 내 3회, 게스트는 `reporter_id = null`로 삽입.
    - **< 접근 권한 >** 비로그인 게스트 접근 허용. 관리자 호출은 로그인 필수.
- **< Login / Signup (인증 페이지) >**
    - **< Layout & Animation >** 데스크탑은 50:50 좌우 분할 (좌측: 그래픽 패널, 우측: 폼). 폼 입력창 클릭 시 라벨이 위로 작게 이동하는 Material Design 스타일 Floating Label 애니메이션 적용 (`FloatingInput` 컴포넌트). 모바일은 그래픽 패널을 숨기고 중앙 정렬 폼으로 변형.
    - **< 회원가입 제약 >**
        - 이름(`name`) + OTP 조합으로 `allowed_names` 테이블에서 DB 검증 (서버 API `/api/auth/signup` 경유, Service Role 사용).
        - 이름 중복 불가 (`profiles.name UNIQUE`).
        - `role`은 DB 트리거(`handle_new_user`)가 강제로 `'user'`로 고정. `user_metadata`의 role 값은 무시됨.
        - 비밀번호 최소 8자 이상.
        - API Rate Limit: IP 기준 60초 내 5회 초과 시 거부(서버 인메모리).
    - **< Open Redirect 방지 >** 로그인 후 `redirectTo` 파라미터 처리 시 화이트리스트(`/vote`, `/chat`, `/about`, `/help`, `/admin-dashboard`)에 있는 경로만 허용. 미포함 시 `/`로 리다이렉트.

## ④ Coding Guidelines

### 1. General Principles

- **KISS (Keep It Simple, Stupid):** 과도한 추상화를 피하고 명확한 코드를 작성하라.
- **DRY (Don't Repeat Yourself):** 반복되는 로직은 커스텀 훅(`hooks/`)이나 유틸리티 함수(`utils/`)로 분리하라.
- **Functional Components:** 모든 컴포넌트는 React Functional Component로 작성하며 Hooks를 사용하라.
- **Clarification First:** 지시사항이 구체적으로 제시되어 있지 않거나, 요구사항 간 모순이 발생하거나, 의도가 명확하지 않은 경우에는 임의로 판단하여 진행하지 말고, 반드시 작업을 중단하고 해당 내용을 먼저 확인 및 질문할 것. 불확실한 상태로 대규모 코드를 작성하는 것은 이후 수정 비용을 크게 증가시킨다.

### 2. File Structure

- **Feature-Driven Development:** 폴더는 컴포넌트 종류(단순 UI)뿐만 아니라 기능(Feature) 단위로도 묶어 응집도를 높여라. (예: `components/chat/`, `components/vote/`, `components/layout/`, `components/providers/`, `components/main/`).
- **App Router Convention:** Next.js App Router의 규칙(`page.tsx`, `layout.tsx`, `route.ts`)을 엄격히 준수하고, 클라이언트 컴포넌트 최상단에는 반드시 `"use client"`를 명시하라.
- **Middleware는 proxy.ts:** 이 프로젝트의 Next.js 버전에서 미들웨어는 반드시 `proxy.ts`에 `export async function proxy`로 작성한다. `middleware.ts`를 생성하면 빌드 오류가 발생한다.
- **Shared Components:** 여러 페이지에서 재사용되는 컴포넌트(예: `FileDisplay`, `PIPChat`)는 `components/chat/`, `components/providers/` 등 적절한 feature 폴더 아래 배치하라.
- **Supabase Clients:** 환경에 따라 세 가지 클라이언트를 구분하여 사용하라.
    - `lib/supabase/client.ts` → 브라우저 클라이언트 (`createBrowserClient`)
    - `lib/supabase/server.ts` → 서버 컴포넌트·API Route 클라이언트 (`createServerClient` + cookies)
    - `lib/supabase/admin.ts` → Service Role 어드민 클라이언트 (`createClient` with `SUPABASE_SERVICE_ROLE_KEY`) — **절대 클라이언트에 노출 금지, 서버 사이드 전용**

### 3. Naming Conventions

- **PascalCase for Components:** React 컴포넌트 파일명과 함수명은 무조건 PascalCase를 사용하라. (예: `VoteCard.tsx`, `AdminDashboard.tsx`, `FileDisplay.tsx`).
- **camelCase for Logic:** 일반 변수, 함수, 커스텀 훅은 camelCase를 사용하라. (예: `handleVoteSubmit`, `useRealtimeVote`).
- **snake_case for Database:** Supabase 테이블명, 컬럼명, RPC 함수명은 SQL 관례에 따라 snake_case를 유지하여 프론트엔드 코드와 DB 데이터를 명확히 구분하라. (예: `user_id`, `agenda_items`, `admin_kick_user`).

### 4. Styling (Tailwind CSS)

- **Utility-First (Tailwind CSS):** 스타일링은 Tailwind CSS를 기본으로 사용하며, 가독성을 해치는 무분별한 인라인 스타일(`style={{...}}`)은 엄격히 금지하라. 단, 드래그 위치나 CSS keyframes duration처럼 동적으로 계산된 값은 예외적으로 인라인 스타일 사용을 허용한다.
- **Desktop-Driven Responsive (데스크탑 중심 반응형):** 데스크탑 기준의 넓은 레이아웃과 화려한 UI를 우선적으로 설계하라. 창이 작아지는 모바일 환경을 제어할 때는 `max-md:`와 같은 max-width 브레이크포인트를 활용하여 점진적으로 다운사이징하는 방식으로 작성하라.
- **Class Consolidation:** 조건부 스타일링이 복잡해질 경우, 템플릿 리터럴 대신 `cn()` 유틸리티(`utils/cn.ts` — `clsx` + `tailwind-merge` 조합)를 사용하여 코드를 깔끔하게 유지하라.

### 5. Code Comments

- **Minimize & Summarize:** 핵심 로직이나 기능 앞에만 **짧게 요약하여 한 줄**로만 작성한다. 기존 핵심 로직의 틀 내에서 수정할 때에는 주석을 달지 않는다. 아예 새로운 핵심 로직이나 기능을 추가할 때만 한 줄로 요약해서 짧게 작성한다.
- **Developer Initial:** 공동 개발자 식별을 위해 모든 주석 끝에 한 글자 이니셜을 반드시 포함한다. `stx4R → S`, `kmc → K`, `heejae → H`. 예시: `// 관리자 호출 DB 검증 후 PIP 오픈 S`
- **Developer Identification:** AI는 사용자가 누구인지 판별할 수 있도록, 매 작업(대화) 시작 시에만 위 3명의 작업자 중 누구인지 묻고 확인한다.

---

## ⑤ State Management, Error Handling & Server Security

### 1. State Management & Logic

- **Server vs Client State:** Supabase에서 가져오는 서버 데이터(투표 결과, 채팅 메시지 등)와 순수 UI 상태(모달 열림/닫힘 등)를 명확히 분리하라. 전역 UI 상태는 Context API를 활용하라. (예: `OnlineUsersContext`, `PIPChatContext`).
- **Realtime Memory Leak Prevention:** 150명 실시간 통신을 위해 Supabase Realtime 구독(Subscribe) 로직을 사용할 경우, 반드시 `useEffect`의 cleanup 함수(`return () => supabase.removeChannel(...)`)에서 구독을 해제하여 메모리 누수를 막아라.
- **Stale Closure 방지:** Realtime 이벤트 핸들러 내에서 컴포넌트 상태(state)를 직접 참조하면 클로저 문제로 구버전 값이 참조된다. `useRef`로 최신 값을 추적하는 ref 패턴(`msgChRef`, `myUserIdRef`)을 적용하라.
- **Auth Initialization Pattern:** 로그인 필수 페이지의 리다이렉트 판단은 `supabase.auth.onAuthStateChange`의 `INITIAL_SESSION` 이벤트 기준으로만 수행하라. 단, `INITIAL_SESSION`이 null로 올 수 있는 타이밍 이슈 대비를 위해 `SIGNED_IN` 이벤트도 동시에 처리하되, `initialized` 플래그로 중복 실행을 방지하라.
- **Supabase 클라이언트 싱글턴:** 컴포넌트 내 Supabase 클라이언트는 `useRef(createClient()).current` 패턴으로 렌더마다 재생성되는 것을 막아라.
- **Optimistic Updates:** 투표 버튼 클릭 시 UX 극대화를 위해 서버 응답 전 프론트엔드 상태를 먼저 변경하고, 실패 시 롤백하는 '낙관적 업데이트' 패턴을 고려하라.

### 2. Error Handling

- **Fail Gracefully:** 에러가 발생해도 흰 화면(White Screen of Death)이 뜨지 않도록 최상단이나 주요 컴포넌트에 Error Boundary(`error.tsx`)를 배치하라.
- **User-Friendly Feedback:** Supabase의 원시 에러 메시지를 유저에게 그대로 노출하지 마라. `alert`를 통해 "채팅방 생성 실패", "권한이 없습니다"처럼 이해하기 쉬운 메시지로 매핑하여 안내하라.
- **Command Confirmation:** `/kick`, `/ban` 등 치명적인 관리자 명령어는 실행 전 Confirmation Modal을 반드시 거치게 하고, **취소 시 `admin_chat` 로그에 기록되어서는 안 된다.** 명령 실행이 확인·완료된 후에만 채팅 로그에 삽입할 것.
- **Validation First:** 중요한 액션은 서버에 도달하기 전 클라이언트 단에서 1차적으로 검증하라. 입력 필드에는 반드시 `maxLength` 속성을 지정하라.
    - 채팅 메시지: 2000자
    - 방 이름: 50자
    - 방 아이콘: 2자 (이모지)
    - 채팅방 공지: 500자
    - 버그 제목: 100자
    - 버그 설명: 2000자
    - 투표 제목: 100자
    - 투표 세부사항: 2000자
    - 전역 공지 (`/announcement`): 500자 (관리자 명령어 파싱 단계에서 제한)

### 3. Server & Database Security

- **Strict Row Level Security (RLS):** Supabase의 핵심 보안 기능인 RLS를 모든 테이블에 반드시 활성화하라. DB 단에서 `auth.uid() = user_id` 형태로 본인 데이터만 조작 가능하도록 엄격한 정책(Policy)을 강제하라.
- **RLS Recursion 방지:** `chat_rooms` ↔ `chat_room_members` 간 상호 참조 정책은 무한 재귀를 유발한다. 반드시 아래 `SECURITY DEFINER` 헬퍼 함수들을 통해 멤버십과 방 속성을 확인하라. RLS 정책 내에서 동일 테이블을 자기 참조하거나 순환 참조하는 구조를 절대 작성하지 말 것.
    - `is_room_member(p_room_id uuid)` — 멤버십 여부
    - `is_global_room(p_room_id uuid)` — 글로벌 방 여부
    - `can_self_join_room(p_room_id uuid)` — 자가 가입 가능 여부 (공개방·글로벌방·본인 정당방만 허용)
- **Broadcast Verification:** Supabase Realtime broadcast 채널은 인증된 사용자라면 누구든 임의 채널에 메시지를 전송할 수 있다. 보안에 민감한 broadcast 이벤트 수신 시에는 반드시 `supabase.auth.getUser()` 또는 DB 쿼리로 서버 측 검증을 수행한 후에만 동작하라.
    - `force_signout` 수신 → `getUser()` 호출 후 세션이 실제로 무효화된 경우에만 로그아웃 처리.
    - `kick` broadcast 수신 → `chat_room_members` 테이블에서 실제 멤버십 제거 여부 DB 재확인 후 처리.
    - `announcement_update` broadcast 수신 → broadcast payload 신뢰 금지, DB에서 실제 값 재조회.
- **Admin 보호 로직:** `admin_ban_user`, `admin_timeout_user`, `admin_kick_user` RPC 함수와 `/api/admin/kick` API Route는 대상 유저의 `role`이 `'admin'`이면 반드시 거부하고 오류를 반환하라. Admin 간 상호 차단으로 인한 시스템 잠금을 방지한다.
- **Audit Log 무결성:** `admin_logs` INSERT 정책에는 `auth.uid() = admin_id` 조건을 반드시 포함하라. 이 조건이 없으면 다른 Admin 명의의 허위 감사 로그 삽입이 가능하다.
- **is_command 제한:** `admin_chat` 테이블의 `is_command = true` 값은 Admin만 삽입 가능하도록 RLS INSERT 정책에 `(is_command = false OR public.is_admin())` 조건을 추가하라. Mod가 명령어 실행 기록을 위조하는 것을 방지한다.
- **File Upload Security:** 파일 업로드 시 다음 세 가지를 순서대로 검증하라.
    1. **크기 제한:** 10MB 초과 시 거부.
    2. **MIME 화이트리스트:** `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/avif`, `application/pdf`, `text/plain`만 허용.
    3. **매직 바이트 검증:** 파일 앞 12바이트를 `arrayBuffer()`로 읽어 선언된 MIME 타입과 실제 파일 시그니처가 일치하는지 확인하라. `text/plain`은 실행파일 시그니처(MZ, ELF, Shebang) 블랙리스트 검사로 악성 파일을 차단한다. 불일치 시 거부.
- **File URL 관리:** Supabase Storage `chat-files` 버킷은 Private으로 설정하고, 파일 업로드 시 DB에는 서명된 URL이 아닌 **Storage 경로(path)만 저장**하라. 렌더링 시점에 `createSignedUrl(path, 3600)`으로 1시간짜리 서명 URL을 생성하는 `FileDisplay` 컴포넌트(`components/chat/FileDisplay.tsx`)를 사용하라. 서명 URL을 DB에 영구 저장하면 만료 후 파일에 접근 불가능해진다. 레거시 공개 URL(`http`로 시작)은 그대로 사용한다.
- **CSRF 보호:** 상태 변경 POST 엔드포인트에서는 `lib/csrf.ts`의 `checkOrigin(request)` 함수를 사용하라. Origin 헤더와 Host 헤더를 비교하여 same-origin 요청이 아니면 `403`을 반환한다.
- **HTTP Security Headers:** `next.config.ts`에서 모든 경로(`/(.*))`)에 아래 보안 헤더를 적용하라.
    - `X-Frame-Options: DENY` — 클릭재킹 방지
    - `X-Content-Type-Options: nosniff` — MIME 스니핑 방지
    - `Referrer-Policy: strict-origin-when-cross-origin`
    - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
    - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
    - `Content-Security-Policy` — `default-src 'self'`, `script-src 'self' 'unsafe-inline'` (dev에서는 `'unsafe-eval'` 추가), `connect-src 'self' {SUPABASE_URL} {SUPABASE_WSS_URL}`
- **Rate Limiting:**
    - **버그 제보:** DB 레벨 `check_bug_report_rate_limit()` SECURITY DEFINER 함수로 인증 사용자당 5분 내 3회로 제한.
    - **채팅 메시지:** DB 레벨 `check_chat_rate_limit()` SECURITY DEFINER 함수로 사용자당 1분에 30개로 제한. RLS INSERT 정책에 포함.
    - **회원가입 API:** 서버 인메모리(`rateLimitMap`)로 IP 기준 60초 내 5회 초과 시 거부.
    - 클라이언트 인메모리만을 이용한 Rate Limit은 새로고침·시크릿탭으로 즉시 우회되므로 서버 측 제한이 반드시 병행되어야 한다.
- **Input Sanitization:** URL 파라미터(예: `reason` 쿼리스트링)는 반드시 화이트리스트 검증 후 사용하라. `VALID_REASONS = new Set(['kicked', 'banned', 'timeout'])` 형태로 허용값을 제한하여 Open Redirect 및 XSS를 방지한다.
- **Secret Management:** `SUPABASE_SERVICE_ROLE_KEY`와 같은 관리자 권한의 비밀키는 절대 클라이언트(브라우저)에 노출되어서는 안 된다. Vercel 환경변수에 안전하게 저장하고, 반드시 서버 사이드(API Routes, `lib/supabase/admin.ts`)에서만 사용하라.
- **Concurrency Control (Race Condition 방어):** DB 테이블에 Unique Index 제약 조건을 걸어 물리적인 중복 삽입을 막아라.
    - `votes`: `(agenda_id, user_id)` Unique 제약.
    - `admin_calls`: `caller_id` 기준 Partial Unique Index (`WHERE status = 'pending'`) — 사용자당 pending 호출 1개 제한.
- **DB 보안 트리거:**
    - `enforce_profile_immutability` (BEFORE UPDATE on `profiles`): `name` 컬럼 영구 불변 강제. 비관리자의 `role`, `club`, `pp`, `is_banned`, `timeout_until` 등 admin-only 필드 변조를 이전 값으로 강제 복원.
    - `prevent_user_metadata_tampering` (BEFORE UPDATE on `auth.users`): `supabase.auth.updateUser({ data: { name: ... } })`로 이름을 조작하는 시도를 차단하고 `profiles.name`으로 강제 복원.
    - `handle_new_user` (AFTER INSERT on `auth.users`): `allowed_names` 테이블에 없는 이름이면 트랜잭션 전체 롤백. `role`은 항상 `'user'`로 고정.
    - `handle_pp_change` (AFTER UPDATE of `pp` on `profiles`): 정당 변경 시 기존 정당 채팅방 자동 퇴장 + 새 정당 채팅방 자동 가입.
- **OTP 기반 가입 검증:** `allowed_names` 테이블은 `name`(PK) + `otp` 컬럼을 가진다. 회원가입 API(`/api/auth/signup`)는 이름과 OTP 조합을 DB에서 직접 검증한다. 이름만으로는 가입 불가능하며, OTP를 알아야만 계정을 생성할 수 있다. 해당 테이블에는 RLS 정책이 없어 Service Role만 접근 가능하다.
- **Schema Sync:** 매 업데이트마다 Supabase DB에 반영해야 할 SQL 변경사항(테이블 추가, 컬럼 변경, RLS 정책 수정, 함수 업데이트 등)이 존재하면 `supabase/schema.sql` 파일을 반드시 동시에 갱신하라. 코드 배포와 DB 스키마가 항상 동기화 상태를 유지해야 하며, SQL 변경 후에는 Supabase Dashboard SQL Editor에서의 실행 방법도 명시적으로 안내할 것.
- **Pentest Per Update:** 기능 추가나 수정이 완료된 후에는 매번 해당 변경사항을 대상으로 보안 취약점(RLS 우회, Broadcast 스푸핑, SQL 인젝션, XSS, IDOR, 무한 재귀 등) 및 기술적 모순(정책 충돌, 무효한 상태 전이 등)을 능동적으로 점검하라. 발견된 취약점은 즉시 보고하고 수정 방안을 함께 제시할 것.

---

## ⑥ Admin Management & Global Announcement

### 1. Role System (3계층)

- **< Admin >** 모든 기능 사용 가능. 명령어 실행, 유저 제재, 버그 제보 관리, 공지 발송, 안건 생성·개폐·완료, 투표 결과 브로드캐스트.
- **< Mod >** 접속자 목록 확인, Admin Chat 참여(메시지 전송), 관리자 호출 수락 가능. 명령어 실행 및 유저 제재 불가. `is_support = true` 채팅방 삭제(`/end`) 가능.
- **< User >** 일반 사용자. 투표, 채팅, 관리자 호출, 버그 제보 가능.
- **< 역할 보호 원칙 >** Admin은 다른 Admin을 `/kick`, `/ban`, `/timeout` 할 수 없다. RPC 함수 내부와 API Route에서 대상의 `role = 'admin'`이면 즉시 거부한다.

### 2. Admin Access & Role-Based Routing

- **< Access Control >** 로그인 시 `profiles` 테이블의 `role` 컬럼을 확인하여 권한을 검증한다. `user_metadata`의 role 값은 신뢰하지 않는다.
- **< Routing >** `proxy.ts`에서 `/admin-dashboard` 경로 접근 시 `profiles.role`이 `'admin'` 또는 `'mod'`인지 DB에서 직접 확인한다. 비정상 접근 시 `/login` 또는 `/`으로 리다이렉트한다. 나머지 비공개 경로(`/vote`, `/chat` 등)는 로그인 여부만 확인한다. `/help`는 비로그인 게스트도 접근 가능하다.

### 3. Admin Dashboard Layout

관리 효율과 직관성을 극대화하기 위해 3단 분할 레이아웃(Three-Column Layout)을 기본으로 설계한다.

- **< Left Column: Real-time User List (Admin·Mod 공통) >**
    - 현재 웹에 접속 중인 사용자들의 명단을 실시간으로 리스트업한다. (Supabase Presence 활용, `UserSessionManager`가 Presence 데이터를 `OnlineUsersContext`에 동기화)
    - Admin / Mod / User 3개 그룹으로 구분하여 표시하며, 정당(PP) 배지도 함께 표시한다.
    - 유저 제재 액션(Kick/Ban/Timeout)은 **좌측 컬럼 클릭 UI가 아니라 Center Column의 명령어 채팅**으로만 실행한다.
- **< Center Column: Admin/Mod Chat & Commands >**
    - **UI:** 말풍선 기반의 메신저 UI. Admin·Mod만 접근 가능한 별도의 `admin_chat` 테이블을 구독한다. 파일 첨부 및 드래그앤드롭 지원.
    - **Command Logic (Admin 전용):** 채팅 입력창에 `/`로 시작하는 명령어 입력 시 관리자 전용 기능을 트리거한다.
        - **명령어 자동완성:** `/` 타이핑 시 사용 가능한 명령어 리스트가 팝업으로 표시된다. Tab 키로 첫 번째 항목을 완성한다.
        - `/kick "사용자명"` : 확인 모달 후 `admin_kick_user` RPC + `/api/admin/kick` API(세션 전체 무효화) + broadcast 강제 로그아웃.
        - `/ban "사용자명"` : 확인 모달 후 `admin_ban_user` RPC + broadcast 강제 로그아웃.
        - `/timeout "사용자명" "초"` : 지정 시간(최대 86400초) 동안 투표·채팅 권한 일시 제한. `admin_timeout_user` RPC 사용.
        - `/announcement "내용"` : 전체 공지 배너 발송. `announcements` 테이블 삽입 → `postgres_changes`로 전파. DB 삽입 실패 시 채팅 로그 미생성.
        - `/voteresult "투표 제목"` : 해당 제목의 안건(완료된 안건 포함) 결과를 집계하여 `vote_result_broadcasts` 테이블에 삽입 → 비로그인 게스트 포함 전원에게 팝업 모달로 결과 공개.
    - **Fail-safe:** `/kick`, `/ban` 실행 시 Confirmation Modal을 반드시 거치며, **취소 시 채팅 로그에 기록되지 않는다.** 실행 완료 후에만 `admin_chat`에 CMD 배지로 기록된다.
    - **파일 첨부:** 이미지·PDF·TXT 파일 첨부 지원. 드래그앤드롭 포함. 파일은 Supabase Storage `chat-files` 버킷(Private)의 `admin-chat/` 경로에 저장하고, 경로만 DB에 저장한다.
    - **관리자 호출 알림:** `admin_calls` 테이블의 `pending` 상태 호출이 있으면 채팅 영역 상단에 알림 배너를 표시한다. "참가하기" 클릭 시 지원 채팅방 자동 생성 + `support_ready` broadcast 전송 + PIP Chat 오픈.
- **< Right Column: Quick Stats, Vote Management & Logs (Admin 전용) >**
    - **퀵 스탯:** 접속 중 인원, 진행 중 안건 수, 총 투표수 3가지 카드.
    - **안건 투표 관리:** Admin만 안건 생성(모달), 개폐(확인 모달 필수), 완료 처리(확인 모달 필수, 비가역적)가 가능. 각 안건에 "자세히" 버튼 클릭 시 찬반 집계·투표율 상세 모달 표시. `agenda_with_votes` 뷰에서 집계 데이터 조회.
        - **투표 생성:** 제목(필수, 100자 이하) + 세부사항(필수, 2000자 이하). `admin_create_agenda` RPC 호출 → 자동 공지 발송.
        - **투표 열기/닫기:** `admin_toggle_agenda` RPC 호출 → 자동 공지 발송. 완료된 안건은 변경 불가.
        - **투표 완료:** `admin_complete_agenda` RPC 호출 → `is_completed = true`, Vote 탭에서 숨겨짐, 되돌릴 수 없음 → 자동 공지 발송.
    - **감사 로그:** 관리자 액션(kick/ban/timeout/공지/안건 생성·개폐·완료) 최근 30건 실시간 표시. `admin_logs` 테이블 `postgres_changes` 구독.
    - **버그 제보 (Admin 전용):** 최근 10건 미리보기(사이드바). "버그 제보" 버튼 클릭 시 전체 목록 모달 표시(전체 조회). 해결 여부(resolved) 체크박스로 관리.

### 4. Global Announcement System (Flowing Banner)

관리자가 채팅창에 `/announcement "내용"`을 입력할 시, 모든 페이지(User/Admin 공통)에 실시간으로 전파되는 긴급 공지 시스템을 구축한다.

- **< Design Layout >**
    - **Position:** 화면 최상단, Header보다 위에 위치(DOM 순서상 AnnouncementBanner → Header 순).
    - **Layout Shift 방지:** 공지 배너 등장 시 웹페이지의 기존 콘텐츠를 자연스럽게 아래로 밀어내어 **UI 요소가 공지 배경과 절대 겹치지 않도록** 설계한다. (`AnimatePresence`로 `height: 0 → 2.75rem` 트랜지션)
    - **Style:** 눈에 잘 띄는 순백색(`#FFFFFF`) 띠 배경에 검은색 볼드체(Black Bold) 텍스트. 하단 2px 레드 보더(`border-b-2 border-red-primary`).
- **< Animation & Interactivity >**
    - **Flowing Effect:** 텍스트가 우측 끝에서 좌측 끝으로 끊임없이 흐르는 마키(Marquee) 애니메이션. 시각적 연속성을 위해 동일 텍스트 2벌을 연달아 배치.
    - **Dynamic Speed:** 공지 텍스트 글자 수에 따라 속도 동적 조절. `Math.max(15, content.length * 0.18)` 공식 기준.
    - **Suffix:** 공지 텍스트 끝에 `(Admin 사용자명)`을 작은 글씨로 표기.
- **< Lifecycle Management >**
    - 공지는 `announcements` 테이블의 `expires_at` 컬럼 기준으로 유효 시간을 관리한다 (기본값 `now() + interval '120 seconds'`).
    - 남은 유효 시간만큼 `setTimeout`으로 자동 소멸.
    - `AnimatePresence`를 활용해 배너가 부드럽게 페이드아웃된다.
- **< Technical Implementation >**
    - **Realtime Trigger:** `announcements` 테이블에 row 삽입 시 `AnnouncementBanner`는 **`postgres_changes` (INSERT)**로 수신한다. Broadcast 방식은 스푸핑 취약점으로 인해 사용하지 않는다.
    - **페이지 진입 시 복원:** 접속 시점에 `expires_at > now()`인 유효한 공지가 DB에 존재하면 즉시 배너를 렌더링한다.

---

## ⑦ Chat System

### 1. 채팅방 구조 & 멤버십

- **< 특수 채팅방 자동 가입 >** 로그인 완료 시 `ensureSpecialMembership` 함수가 자동 실행된다. 먼저 `/api/ensure-special-rooms` POST API(Auth 필수, Admin만 호출 가능)로 특수방 생성 여부를 확인하고, 없으면 Service Role로 자동 생성한다.
    - **전체 공지방 (`is_global = true`):** 모든 사용자 자동 가입.
    - **정당별 채팅방 (`party_tag` 보유):** 소속 정당(`pp` 컬럼)에 맞는 채팅방 자동 가입. 방이 없으면 생성. `무소속`은 정당 채팅방 없음.
    - **정당 변경 시 자동 재가입:** `handle_pp_change` DB 트리거가 기존 정당방 퇴장 + 새 정당방 가입을 처리. 프론트엔드는 `profiles` 테이블 `UPDATE` `postgres_changes`를 구독하여 방 목록 UI를 갱신한다.
- **< 정당(PP) 배지 시스템 >**
    - `profiles.pp` 컬럼 값: `'진보'` | `'보수'` | `'중도'` | `'무소속'`
    - 진보: 파란색 배지, 보수: 레드 배지, 중도: 옐로우 배지, 무소속: 그레이 배지
    - 접속자 목록, 채팅 메시지, Admin Dashboard 유저 리스트, 헤더 등 전체에서 일관되게 표시.

### 2. 채팅 기능

- **< 메시지 전송 규칙 >**
    - 전체 공지방(`is_global = true`): Admin만 메시지 전송 가능. 일반 유저에게는 읽기 전용 안내 표시.
    - 타임아웃·차단 유저(`is_restricted()`): 메시지 전송 불가. RLS INSERT 정책으로 DB 레벨에서 차단.
    - Rate Limit: 1분에 30개 초과 시 DB 레벨 거부.
    - `is_system` 메시지: Admin·Mod만 `is_system = true`로 삽입 가능. 시스템 공지처럼 중앙 정렬 알약 스타일로 별도 렌더링.
- **< 방장 전용 명령어 (개설자 `created_by`) >**
    - `/kick 사용자명` : 해당 유저를 채팅방에서 강제 퇴장. Admin을 kick하는 것은 불가.
    - `/announcement 텍스트` : 방 내 공지 핀 설정 (`announcement` 컬럼 업데이트 + `announcement_update` broadcast 전송). broadcast 수신 측은 DB에서 실제 값 재조회.
    - `/promote 사용자명` : 방장 권한 양도. 확인 모달 필수. 양도 후 본인 방장 권한 소멸.
    - `/leave` : 현재 방 나가기 (`chat_room_members` 삭제).
- **< Mod 이상 전용 명령어 >**
    - `/end` : 지원 채팅방(`is_support = true`)만 종료 가능. DB에서 `is_support` 재확인 후 방 삭제. (클라이언트 상태 조작 방어)
- **< 커맨드 자동완성 >** 입력창에 `/`를 입력하면 사용 가능한 명령어 팝업 표시. Tab 키로 첫 번째 명령어 완성. 명령어 뒤 인자 힌트도 함께 표시.
- **< 파일 첨부 >**
    - 크기: 10MB 이하, MIME 화이트리스트 + 매직 바이트 이중 검증.
    - Storage 경로만 DB 저장 → `FileDisplay` 컴포넌트가 렌더 시 1시간 서명 URL 생성.
    - 드래그앤드롭 지원 (드래그 중 링 하이라이트 표시).
    - 파일명은 특수문자 제거 처리 (`replace(/[^a-zA-Z0-9._-]/g, '_')`).
- **< 방 편집 (개설자 전용) >** 방 이름(50자 이하)과 이모지 아이콘(2자 이하) 변경 모달. `chat_rooms` UPDATE 정책은 개설자(`created_by`) 또는 Admin만 허용.
- **< 사용자 초대 >** 개설자 또는 Admin이 기존 채팅방에 추가 사용자를 초대하는 모달. 이름으로 검색(debounce 300ms). 본인보다 높은 권한(rank)의 유저는 초대 불가. 이미 멤버인 유저는 선택 불가.
- **< 공지 핀 >** 방에 공지가 설정되어 있으면 메시지 목록 상단에 고정 바 표시. 클릭 시 전체 내용 팝업 모달.
- **< Kick 처리 흐름 >**
    1. 방장이 `/kick 이름` 입력 → roomMembers에서 대상 조회.
    2. `chat_room_members`에서 대상 row 삭제.
    3. `msgChRef`를 통해 `kick` broadcast 전송.
    4. 수신 측은 **DB 멤버십 재확인** 후 실제로 방에서 제거. (broadcast 위조 방지)

### 3. PIP Chat (Picture-in-Picture)

- **< 개요 >** 화면 임의 위치에 띄울 수 있는 드래그 가능한 미니 채팅 창 (기본 위치: 우측 하단). `PIPChatContext`로 전역 상태 관리 (`pipRoomId`).
- **< 활성화 조건 >**
    - 관리자 호출 수락 시: Help 페이지의 호출자가 `support_ready` broadcast 수신 → DB에서 멤버십 실제 확인 → PIP 자동 오픈.
    - Admin Dashboard에서 호출 참가 시: `handleJoinCall` 함수가 방 생성 후 `setPipRoomId(room.id)` 호출.
    - Chat 페이지의 PIP 버튼 클릭 시: 현재 선택된 방을 PIP로 오픈.
- **< 기능 >** 슬래시 커맨드(`/kick`, `/announcement`, `/promote`, `/end`, `/leave`) 지원 (방장·권한 조건 동일). 커맨드 자동완성(Tab 완성). 최소화(Minimize)/최대화 토글. 창 드래그 이동(viewport 경계 내 제한).
- **< 렌더링 위치 >** `app/layout.tsx`의 `<PIPChat />` 컴포넌트로 전역 배치. 모든 페이지에서 접근 가능.

### 4. 채팅 관련 DB 설계

| 테이블 | 주요 컬럼 | 비고 |
| --- | --- | --- |
| `chat_rooms` | `id`, `name`, `icon`, `is_public`, `is_support`, `is_global`, `party_tag`, `announcement`, `created_by` | Realtime publication 포함 |
| `chat_messages` | `id`, `room_id`, `author_id`, `content`, `file_url`, `file_name`, `is_system` | `file_url`은 경로만 저장 |
| `chat_room_members` | `room_id`, `user_id`, `joined_at` | PK: (room_id, user_id) |
- **RLS 재귀 방지:** `is_room_member(p_room_id UUID)`, `is_global_room(p_room_id UUID)`, `can_self_join_room(p_room_id UUID)` SECURITY DEFINER 함수를 모든 chat 관련 정책에서 사용한다.
- **채팅방 멤버 가입 정책:** 자가 가입(본인이 `user_id`)은 공개방·글로벌방·본인 정당방만 허용. 타인 초대(`user_id ≠ auth.uid()`)는 Admin 또는 방 개설자만 가능.

---

## ⑧ Vote Result Broadcast System

### 1. 개요

Admin이 `/voteresult "투표 제목"` 명령어를 입력하면, 해당 안건의 투표 결과를 집계하여 **비로그인 게스트를 포함한 전원**에게 실시간 팝업 모달(`VoteResultModal`)로 공개하는 시스템.

### 2. 실행 흐름

1. Admin이 Admin Dashboard 채팅창에 `/voteresult "제목"` 입력.
2. `executeVoteResult` 함수가 `agenda_items` 테이블에서 제목으로 안건 조회 (완료된 안건 포함).
3. `votes` 테이블에서 찬성·반대·기권 집계.
4. `profiles` 테이블에서 전체 사용자 수 조회.
5. `vote_result_broadcasts` 테이블에 결과 데이터 삽입.
6. 모든 클라이언트의 `VoteResultModal`이 `postgres_changes` (INSERT)로 수신 → 팝업 모달 표시.

### 3. VoteResultModal 컴포넌트

- **위치:** `app/layout.tsx`에 전역 배치 (`<VoteResultModal />`). z-index 200으로 모든 UI 위에 표시.
- **접근 권한:** anon(게스트) + authenticated 모두 SELECT 가능하도록 RLS 정책 설정.
- **표시 내용:** 안건 제목, 세부사항, 전체 투표율, 찬성·반대·기권 수 및 백분율 프로그레스 바.
- **닫기:** X 버튼으로 닫기. 한 번 닫으면 같은 결과가 다시 뜨지 않음(로컬 상태 null화).

### 4. vote_result_broadcasts 테이블

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `agenda_id` | `uuid` | 대상 안건 FK |
| `title` | `text` | 안건 제목 |
| `description` | `text` | 안건 세부사항 |
| `yes_count` | `integer` | 찬성 수 |
| `no_count` | `integer` | 반대 수 |
| `abstain_count` | `integer` | 기권 수 |
| `total_voted` | `integer` | 총 투표 수 |
| `total_users` | `integer` | 전체 사용자 수 |
| `admin_name` | `text` | 발송 Admin 이름 |
- **RLS:** `SELECT to anon, authenticated` — 게스트 포함 전원 조회 가능. `INSERT to authenticated with check (is_admin())` — Admin만 삽입 가능.
- **Realtime:** `supabase_realtime` publication에 포함.]
```

---

너는 고등학교 학생 자치기구용 모바일 앱의 PM 겸 테크리드다. 아래에 이미 확정된 UI 디자인과 화면 로직을 바탕으로, 개발자가 그대로 구현에 착수할 수 있는 수준의 **매우 구체적이고 세밀한 PRD**를 작성해라. 추측으로 기능을 늘리지 말고, 명시된 범위를 정확하게 문서화하되 구현에 필요한 세부 규칙(검증, 예외, 권한, 데이터 스키마)은 빠짐없이 정의해라. 애매한 지점은 문서 안에 `[결정 필요]` 태그로 남겨라.

## 제품 개요

- 제품명: 자율생활부 앱 (Name : SunDO)
- 사용자: 고등학교 자율생활부(선도부) 학생 부원, 부장, 교사, 기타 학생회 임원
- 목적: 복장·실내화 등 생활규정 위반 기록을 학년/반/학생 단위로 빠르게 남기고, 누적 기록을 조회·통계화하며, 선도 순찰 일정을 관리한다
- 플랫폼: iOS/Android 모바일(IOS 기준 제작.) (기준 해상도 430×902), 세로 고정
- 디자인: 밝은 민트-그린 계열, 뉴모피즘(Neumorphic) 버튼, 바텀시트, Count Up 통계 애니메이션, 하단 탭 내비게이션

## 확정된 화면 목록과 동작

1. **로그인** — 이메일/비밀번호 입력, 로그인 버튼, 회원가입 이동
2. **회원가입** — 학교 이메일 + 부서 코드(초대 코드) 입력 방식. 부서 코드가 유효해야 가입 가능, 가입 후 관리자 승인 대기
3. **홈 · 학년 선택** — 1/2/3학년 뉴모피즘 버튼 3개, 상단에 누적 기록 수 등 통계 Count Up
4. **반 선택** — 선택한 학년의 1~10반 그리드
5. **학생 목록** — 선택한 학년·반의 학생 리스트(학번 · 이름). 학번 규칙은 `{학년}{반 2자리}{번호 2자리}`
6. **기록 작성 (바텀 시트)** — 학생 탭 시 바텀시트 오픈. 위반 사유를 세그먼트로 선택(복장 / 실내화), 저장 시 시트 닫히고 토스트 노출(약 2.2초)
7. **기록 조회** — 기간·유형 필터, 통계 수치 Count Up, 기록 리스트
8. **관리자** — 부서 코드 발급/재발급, 권한 양도, 신규 가입 승인
9. **선도 순서 · 순찰 일정** — 요일별 순찰 순서/담당자 일정 표시

내비게이션: 홈 → 학년 → 반 → 학생 → 기록 작성(시트), 하단 탭으로 홈 / 기록 조회 / 선도 일정 / 관리자 이동. 뒤로가기는 한 단계 상위 화면으로.

## 배포 방식 (문서에 반영할 것)

- **웹앱 배포 (TestFlight)**: 개발자가 웹사이트로 배포하면, 사용자가 웹 접속을 통해 모바일 기기 홈 화면에 추가한다.

## PRD에 반드시 포함할 항목

1. **문서 헤더** — 제품명, 버전, 작성일, 담당, 변경 이력 표
2. **배경과 문제 정의** — 현재 종이/엑셀 기반 기록의 문제, 앱으로 해결하려는 것
3. **목표 / 비목표(Non-goals)** — 이번 버전에서 하지 않을 것 명시
4. **성공 지표** — 기록 1건 작성까지 걸리는 시간, 주간 활성 부원 비율, 기록 누락률 등 측정 가능한 지표
5. **사용자 역할과 권한 매트릭스** — 부원 / 부장(관리자) / 교사 각각의 기능별 CRUD 권한을 표로
6. **사용자 스토리** — 역할별로 `~로서 ~하고 싶다, 왜냐하면 ~` 형식, 각 스토리에 수용 기준(Acceptance Criteria) Given/When/Then 3개 이상
7. **화면별 상세 명세** — 위 9개 화면 각각에 대해:
   - 화면 목적과 진입 경로
   - UI 요소 목록(각 요소의 상태: 기본/눌림/비활성/로딩/에러)
   - 입력 필드 검증 규칙(형식, 길이, 필수 여부, 에러 메시지 문구까지 한국어로 확정)
   - 인터랙션과 전환(탭 → 어디로, 애니메이션 종류와 지속시간)
   - 빈 상태(Empty), 로딩 상태, 오프라인 상태, 에러 상태 각각의 화면 처리
8. **데이터 모델** — 엔티티별 필드명·타입·필수여부·기본값·제약조건 표. 최소 다음 포함: User, Department(부서), InviteCode, Student, Record(기록), DutySchedule, ApprovalRequest. 학번/학년/반 파생 규칙과 인덱스 설계도 기술
9. **핵심 비즈니스 로직 규칙** — 번호를 매긴 규칙 목록으로:
   - 동일 학생·동일 사유의 중복 기록 처리(허용/경고/차단)
   - 기록 수정·삭제 가능 시간 창과 권한
   - 부서 코드 유효기간·재사용 정책
   - 권한 양도 절차와 최소 관리자 1명 보장
   - 가입 승인 대기 중 사용자의 접근 범위
   - 학년 진급 시 데이터 처리(연도 롤오버)
10. **API 명세** — 엔드포인트별 method, path, 요청/응답 JSON 예시, 상태 코드, 에러 코드 표
11. **통계·집계 정의** — 각 카운터의 계산식과 집계 기준(기간, 중복 제외 여부)
12. **알림** — 승인 완료, 순찰 당번 리마인드 등 트리거·문구·채널
13. **개인정보 및 보안** — 학생 개인정보 최소 수집 원칙, 접근 로그, 데이터 보관 기간과 파기, 학교 정책 준수 사항
14. **접근성** — 최소 터치 타깃 44px, 색 대비, 스크린리더 레이블, 글자 크기 대응
15. **엣지 케이스 목록** — 최소 15개(네트워크 단절 중 저장, 중복 로그인, 삭제된 학생의 기록, 코드 만료, 동시 편집 등)
16. **마일스톤** — MVP / v1.1 / v1.2 범위 분할과 각 단계 산출물
17. **배포·릴리스 계획** — TestFlight 테스트 배포 절차(초대 방식, 테스터 그룹 구성, 빌드 업로드 주기, 피드백 수집 경로), 테스터 규모 계획, App Store 정식 심사 제출 조건
18. **미결정 사항** — `[결정 필요]` 항목을 한 표로 모아 정리

## 작성 규칙

- 한국어로 작성. 표와 번호 목록을 적극 사용하고, 불필요한 수식어는 쓰지 말 것
- 모든 UI 문구(버튼 라벨, 에러 메시지, 빈 상태 안내, 토스트)는 실제 앱에 넣을 최종 한국어 문안으로 확정해서 적어라
- "적절히", "필요에 따라" 같은 모호한 표현 금지. 숫자와 조건으로 명시
- 기능마다 담당 화면 번호를 상호 참조로 연결
- 분량 제한 없음. 개발자가 추가 질문 없이 착수할 수 있는 수준까지 상세하게

먼저 문서 전체 목차를 제시하고, 내가 승인하면 섹션별로 작성해라.

---

## 첨부하면 좋은 것

- 앱 화면 스크린샷(9개 화면) 또는 배포된 프로토타입 URL
- 실제 학교의 위반 사유 항목 전체 목록(복장·실내화 외)
- 현재 사용 중인 기록 양식(엑셀/구글시트) 샘플
