# W-02 — 디자인 토큰 이식 (작업 지시서)

## §0 전제

- W-01 완료 상태에서 시작한다. 원격 `main`은 `SunDO v0.0.1` 커밋 1개다.
- `src/index.css`의 `@theme` 블록에는 W-01 확인용 토큰 3개(`--color-sundo-ink`,
  `--color-sundo-primary`, `--font-sundo`)만 있다. **이 3개는 이번 작업에서 전부 제거한다.**
- `src/App.tsx`는 W-01 파이프라인 확인 전용이다. 이번 작업에서 자유롭게 대체한다.
- `src/lib/`은 아직 없다. 이번 작업에서 생성한다.
- Tailwind v4 파이프라인(`@tailwindcss/vite` → `@import "tailwindcss"` → `@theme`)은
  W-01에서 빌드·런타임 양쪽으로 검증됐다. **설정 파일(`vite.config.ts`, `tsconfig*.json`)은
  건드리지 않는다.**

## §1 목표와 산출물

PRD `docs/SunDO_PRD.md` **§7.1 ~ §7.3**의 값을 코드로 옮긴다.

| 산출물 | 경로 | 내용 |
| --- | --- | --- |
| 토큰 + 표면 스타일 | `src/index.css` | `@theme` 블록 전면 교체 + `@layer components` 표면 클래스 |
| 클래스 병합 유틸 | `src/lib/cn.ts` | `twMerge(clsx(...))` |
| 검증용 화면 | `src/App.tsx` | 토큰·표면 스타일 쇼케이스 (W-03에서 폐기 예정) |
| 보고서 | `reports/W-02.md` | §7 형식 |
| 진행 기록 | `docs/PROGRESS.md` | §20.4 양식 갱신 |

> **파일명 주의**: PRD 부록 C는 산출물을 `globals.css`로 적었으나, W-01이 Vite 템플릿 기본값인
> `src/index.css`를 이미 만들었고 `main.tsx`가 이를 import한다. 파일명을 바꾸지 말고
> `src/index.css`를 그대로 쓴다. 이 차이는 보고서에 1줄 남긴다.

## §2 고정값 — 변경 금지

### 2.0 값의 정본

- **토큰 "값"의 정본은 PRD §7.1~§7.3 표다.** `index.html`을 열어 값을 대조하거나
  다른 값으로 바꾸지 마라.
- **§7.3 표가 문장으로만 기술한 CSS 세부**(`glass`의 "내부 상단 1px 흰 하이라이트",
  `neu`의 "내부 링", `shine`의 광택 스윕 구현)는 `design/index.html`에서 해당 CSS 규칙을
  찾아 **그대로 옮긴다**. 거기에도 없으면 **지어내지 말고 §5.1-4 절차로 질문한다.**
- §7.1 표에 없는 값이 필요하면 임의로 만들지 말고 §5.1-4로 질문한다.
  단, 아래 2개는 예외로 이미 확정된 값이므로 추가한다(근거: Claude Design 공통 시스템 프롬프트 `[컬러]`).

### 2.1 토큰 네이밍 규칙

PRD의 변수명은 프로토타입 CSS 변수명이라 Tailwind v4 네임스페이스와 그대로 맞지 않는다.
**값은 1바이트도 바꾸지 않고, 이름만 아래 표대로 매핑한다.**

특히 **`--text-60` / `--text-70`은 그대로 쓰면 안 된다.** Tailwind v4에서 `--text-*`는
글꼴 크기 네임스페이스이므로, 컬러 값을 넣으면 `text-60`이 색이 아닌 깨진 `font-size`
유틸리티로 생성된다. 반드시 `--color-sundo-ink-60/70`으로 옮긴다.

### 2.2 컬러 토큰 (`@theme`)

| PRD §7.1 | 값 (변경 금지) | CSS 변수명 |
| --- | --- | --- |
| `--green-900` | `#14352A` | `--color-sundo-900` |
| `--green-800` | `#1F5138` | `--color-sundo-800` |
| `--green-700` | `#2E6B4C` | `--color-sundo-700` |
| `--green-500` | `#57906F` | `--color-sundo-500` |
| `--green-300` | `#9FC4AE` | `--color-sundo-300` |
| `--bg-top` | `#F7FBF8` | `--color-sundo-bg-top` |
| `--bg-bottom` | `#EAF3ED` | `--color-sundo-bg-bottom` |
| `--bg-outer` | `#DDE9E1` | `--color-sundo-bg-outer` |
| `--surface-glass` | `rgba(255,255,255,0.55)` | `--color-sundo-glass` |
| `--surface-sheet` | `rgba(255,255,255,0.86)` | `--color-sundo-sheet` |
| `--neu-from` | `#F8FCF9` | `--color-sundo-neu-from` |
| `--neu-to` | `#E9F2EC` | `--color-sundo-neu-to` |
| `--border-light` | `rgba(255,255,255,0.7)` | `--color-sundo-border-light` |
| `--divider` | `rgba(20,53,38,0.06)` | `--color-sundo-divider` |
| `--tint-08` | `rgba(31,81,56,0.08)` | `--color-sundo-tint-08` |
| `--tint-10` | `rgba(31,81,56,0.10)` | `--color-sundo-tint-10` |
| `--tint-12` | `rgba(31,81,56,0.12)` | `--color-sundo-tint-12` |
| `--text-60` | `rgba(20,53,38,0.60)` | `--color-sundo-ink-60` ⚠ |
| `--text-70` | `rgba(20,53,38,0.70)` | `--color-sundo-ink-70` ⚠ |
| (§7.1 미수록) | `#C0392B` | `--color-sundo-danger` |
| (§7.1 미수록) | `#A93226` | `--color-sundo-danger-active` |

### 2.3 그림자 (`@theme`)

PRD 이름을 그대로 쓴다. Tailwind v4의 `--shadow-*` 네임스페이스와 일치한다.

| 변수 | 값 |
| --- | --- |
| `--shadow-glass` | `0 8px 26px rgba(20,53,38,0.09)` |
| `--shadow-primary` | `0 10px 24px rgba(31,81,56,0.35)` |
| `--shadow-neu` | `7px 7px 16px rgba(20,53,38,0.10), -7px -7px 16px rgba(255,255,255,0.95)` |

### 2.4 그라디언트 (`@theme`, 유틸리티 미생성)

| 변수 | 값 |
| --- | --- |
| `--gradient-primary` | `linear-gradient(160deg,#2E6B4C,#1F5138)` |
| `--gradient-stage` | `linear-gradient(180deg,#F7FBF8 0%,#EAF3ED 100%)` |
| `--gradient-neu` | `linear-gradient(145deg,#F8FCF9,#E9F2EC)` |

### 2.5 타이포그래피

**폰트 패밀리** — `--font-sans`를 아래로 덮어써서 앱 전역 기본 폰트로 만든다.
별칭(`--font-sundo`)을 따로 두지 않는다(값이 두 곳에 존재하면 어긋난다).

```
--font-sans: "Spoqa Han Sans Neo", -apple-system, system-ui, sans-serif;
```

**크기** — PRD §15.4 AC-05가 rem 기반을 요구한다. 루트 16px 기준으로 환산하며,
**px 값은 바뀌지 않는다.** 자간은 PRD가 명시한 H1·H2에만 넣는다.
줄 높이(line-height)는 PRD에 없으므로 **지어내지 않는다.**

| 스타일 | PRD | 변수 | 값 |
| --- | --- | --- | --- |
| H1 | 28px, -0.01em | `--text-h1` | `1.75rem` + `--text-h1--letter-spacing: -0.01em` |
| H2 | 24px, -0.01em | `--text-h2` | `1.5rem` + `--text-h2--letter-spacing: -0.01em` |
| Sheet title | 19px | `--text-sheet` | `1.1875rem` |
| Grade title | 21px | `--text-grade` | `1.3125rem` |
| Class number | 23px | `--text-classno` | `1.4375rem` |
| Stat number | 24px | `--text-stat` | `1.5rem` |
| Body | 15px | `--text-body` | `0.9375rem` |
| Button | 16px | `--text-button` | `1rem` |
| Row title | 14.5px | `--text-row` | `0.90625rem` |
| Label | 12px | `--text-label` | `0.75rem` |
| Caption | 11.5px | `--text-caption` | `0.71875rem` |
| Micro | 11px | `--text-micro` | `0.6875rem` |
| Dock | 10px | `--text-dock` | `0.625rem` |

- 굵기 토큰은 만들지 않는다. 700·500은 Tailwind 기본 `font-bold`·`font-medium`을 쓴다.
- `tabular-nums`도 토큰을 만들지 않는다. Tailwind 기본 `tabular-nums` 유틸리티를 쓴다.
- **`html`에 고정 `font-size`를 지정하지 마라.** iOS 글자 크기 설정을 따라야 한다(AC-05).

### 2.6 반경 (`@theme`)

PRD §7.3 반경 스케일 + `24`(Claude Design 공통 프롬프트 및 P-01 카드에서 사용).
용도별 의미 이름이 아니라 **숫자 이름**으로 만든다. 용도는 화면마다 달라지므로
의미 이름을 붙이면 나중에 어긋난다.

```
--radius-pill: 9999px;
--radius-28 / -26 / -24 / -22 / -20 / -18 / -16 / -15 / -14 / -12 / -11
```

### 2.7 간격 — 커스텀 토큰 만들지 말 것

PRD 간격 스케일 `6 8 10 12 14 16 18 22 26`은 전부 Tailwind v4 기본 `--spacing`(4px)의
배수로 표현된다. **`--spacing-*` 커스텀 토큰을 정의하지 마라.**

| px | 6 | 8 | 10 | 12 | 14 | 16 | 18 | 22 | 26 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 유틸 | `1.5` | `2` | `2.5` | `3` | `3.5` | `4` | `4.5` | `5.5` | `6.5` |

> **검증 필요**: `p-4.5` `p-5.5` `p-6.5` 같은 소수 단계가 실제로 CSS를 생성하는지
> 확인하라. 생성되지 않으면 임의 값(`p-[18px]`)으로 대체하고 보고서에 남긴다.

### 2.8 이징

§7.4에서 8회 이상 반복되는 값 1개만 토큰으로 만든다. 나머지 모션은 W-02 범위 밖이다(§8).

```
--ease-sundo: cubic-bezier(.2,.8,.25,1);
```

## §3 §7.3 표면 스타일

`@layer components`에 정의한다(`@utility`가 아니다 — 다중 속성 컴포넌트 스타일이다).

**이번에 만들 것 (11종)**

| 클래스 | 규격 |
| --- | --- |
| `.glass` | 배경 `--color-sundo-glass`, `backdrop-filter: blur(18px) saturate(160%)`, 테두리 `1px --color-sundo-border-light`, `--shadow-glass`, 내부 상단 하이라이트(§2.0 — `design/index.html`에서 이식) |
| `.neu` | 배경 `--gradient-neu`, `--shadow-neu`, 내부 링(§2.0). `:active` = 같은 그림자를 `inset`으로 반전 + `scale(0.98)` (§7.4 "그림자 반전") |
| `.btnp` | 배경 `--gradient-primary`, `--shadow-primary`, `radius 15`, `padding 15px`, 라벨 흰색 16/700. `:active` `scale(0.97)` |
| `.shine` | 라벨 광택 스윕 2.8s linear infinite. 구현은 §2.0에 따라 `design/index.html`에서 이식 |
| `.chip` | `radius 999`, `padding 6px 12px`, 배경 `--color-sundo-tint-10`, 12px/700 `--color-sundo-800` |
| `.fchip` | `radius 999`, `padding 8px 14px`. 활성 변형(`.fchip-on`) = 배경 `--color-sundo-800` + 흰 글자 + 700 |
| `.pill` | `radius 999`, `padding 7px 13px`, 11.5px/700 (기본 골격) |
| `.pill-soft` | 배경 틴트 + `--color-sundo-800` 글자 |
| `.pill-fill` | 배경 `--gradient-primary` + 흰 글자 |
| `.pill-line` | 배경 흰 반투명 + `1px` 테두리 |
| `.tagf` / `.tagl` / `.tage` | 셋 다 11px/700, `padding 5px 10px`, `radius 999`. `tagf`=그라디언트+흰 글자 / `tagl`=틴트+`#1F5138` / `tage`=배경 `rgba(255,255,255,0.72)` + 테두리 `1px rgba(46,107,76,0.30)` + 글자 `#2E6B4C` |

**모션 접근성** — `@media (prefers-reduced-motion: reduce)`에서 `.shine` 애니메이션만
정지시킨다. 나머지 §15.4 AC-07 처리는 해당 요소를 만드는 작업에서 한다.

**만들지 말 것** — `.field`(입력 필드 v2), `.switch`. 상태 로직과 분리되지 않으므로
W-03에서 `Field`·`Switch` 컴포넌트로 통째로 만든다. **여기서 반쯤 만들지 마라.**

## §4 `cn()`

- 패키지 설치: `clsx`, `tailwind-merge` (Tailwind v4 지원 버전).
- `src/lib/cn.ts`에 `twMerge(clsx(inputs))` 한 줄짜리로 구현한다.
- **`extendTailwindMerge` 설정은 이번에 하지 마라.** 커스텀 스케일(`rounded-11`,
  `text-h1` 등)이 병합에서 충돌하는 사례가 실제로 나오면 그때 W-03에서 붙인다.
  다만 **이 리스크는 보고서 §6에 남긴다.**

## §5 절차

### 5.1 착수 전 확인

1. `docs/SunDO_PRD.md` §7.1~§7.3, §15.4 AC-05·AC-07을 읽는다.
2. `design/index.html`에서 `.glass` `.neu` `.btnp` `.shine` 규칙 원문을 찾아 확보한다.
3. `src/index.css` 현재 내용을 확인한다.
4. **위 §2~§4와 실제 파일이 충돌하거나, 필요한 CSS 규칙이 `design/index.html`에도
   없거나, 해석이 둘 이상이면 — 코드를 쓰기 전에 멈추고 선택지 형태로 질문한다(PRD QA-01·QA-02).
   추측으로 구현하고 나중에 되돌리지 않는다.**

### 5.2 실행

1. `clsx` · `tailwind-merge` 설치 → `src/lib/cn.ts` 작성.
2. `src/index.css`의 `@theme` 블록을 §2 전체로 교체. W-01 확인용 토큰 3개 제거.
3. `@layer components`에 §3의 11종 작성.
4. `src/App.tsx`를 토큰·표면 스타일 쇼케이스로 교체(§6 검증용).
5. `npm run build` → 개발 서버에서 computed style 검증(§6).
6. `reports/W-02.md` · `docs/PROGRESS.md` 작성 → 커밋 `SunDO v0.0.2`.

## §6 완료 조건 (DoD)

| # | 조건 | 확인 방법 |
| --- | --- | --- |
| 1 | `npm run build` 오류 없이 통과 | `tsc -b && vite build` |
| 2 | §2.2 컬러 21개 전부 존재, computed 값이 표와 1:1 일치 | `getComputedStyle`로 실제 렌더 값 확인 |
| 3 | `text-60`/`text-70` 이름이 코드 어디에도 없음 | `grep` |
| 4 | §2.5 글꼴 크기 13종이 rem으로 정의되고, 루트 16px에서 PRD px와 일치 | computed `font-size` |
| 5 | H1·H2 `letter-spacing`이 `-0.01em` | computed style |
| 6 | 기본 폰트가 Spoqa Han Sans Neo (클래스 없이 `body`에서) | `document.fonts.check` + computed |
| 7 | `--spacing-*` 커스텀 토큰이 없고, §2.7 9개 값이 전부 생성됨 | CSS 출력 확인 |
| 8 | `--radius-*` 12개, `--shadow-*` 3개, `--ease-sundo` 유틸리티 동작 | computed style |
| 9 | §3의 11종이 쇼케이스에서 전부 렌더. `.neu:active`·`.btnp:active` 포함 | 육안 + computed |
| 10 | `prefers-reduced-motion: reduce`에서 `.shine` 정지 | 에뮬레이션 |
| 11 | `cn('rounded-11','p-4')` 호출 성공, 빌드 통과 | 쇼케이스에서 실제 호출 |
| 12 | W-01 확인용 토큰 3개 제거 후 참조 잔재 0건 | `grep` |
| 13 | Tailwind v3 잔재 없음 | `tailwind.config.js`·`postcss.config.js` 부재, `@tailwind` 지시어 0건 |
| 14 | `SunDO v0.0.2` 푸시, Contributors에 Claude 없음 | `git log -1` |
| 15 | `package.json` version이 `0.0.2`로 갱신 (GT-07) | 파일 확인 |

## §7 보고 형식

`reports/W-02.md`에 아래 순서로 쓴다. 터미널에는 `작업이 완료되었습니다` 한 줄만 출력한다.

1. 최종 토큰 목록 (PRD 이름 → CSS 변수명 → 값 → 생성된 유틸리티 예)
2. 생성·수정한 파일 목록
3. 완료 조건 15개 통과 여부 표 + 근거
4. 판단이 필요했던 지점과 근거
5. `design/index.html`에서 이식한 CSS 규칙 원문과 출처 라인
6. **사용자 확인이 필요한 사항** (`tailwind-merge` 커스텀 스케일 리스크 포함)
7. 다음 작업(W-03)에 넘길 전제

## §8 범위 제외 — 이번에 하지 말 것

- `.field` · `.switch` (→ W-03)
- React 컴포넌트 일체 (`GlassCard`, `NeuButton` 등 → W-03)
- §7.4 모션 전체(`blurIn`, `rise`, `sparkle`, `pulseDot`, 시트/독/세그먼트 전환,
  CountUp 등). `--ease-sundo`와 `.shine`만 예외다.
- §7.5 레이아웃 규격(430px 스테이지, safe-area 패딩, 오라 블롭 3개) → W-03 `AppShell`
- 터치 타깃 44px 보정, ARIA (→ W-18)
- Firebase SDK · React Router · 상태 관리 라이브러리 설치
- `index.html` 수정. **단 `viewport-fit=cover`와 `theme-color: #F7FBF8`(§7.5)이
  누락됐는지 확인만 하고, 없으면 고치지 말고 보고서 §6에 적는다.**
- `vite.config.ts` · `tsconfig*.json` 수정
