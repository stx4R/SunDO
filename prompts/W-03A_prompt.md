# W-03A — 기반 레이어 + AppShell + Field + Switch (작업 지시서)

## §0 전제

### 0.1 W-03을 3분할한다

PRD 부록 C의 W-03은 공통 컴포넌트 12종을 한 단위로 묶었으나, 상태 명세가 촘촘해
한 세션에 담기 어렵고 중단 복구(WF-03)도 불리하다. 아래로 나눈다. **W-04부터는 부록 C 번호를 그대로 쓴다.**

| 단위 | 범위 |
| --- | --- |
| **W-03A** (이번) | `cn()` 보강 · `index.html` 메타 · AppShell · **Field** · Switch |
| W-03B | GlassCard · NeuButton · PrimaryButton · Chip · Pill · Footer · Dock |
| W-03C | Toast · BottomSheet · ConfirmModal |

### 0.2 W-02에서 넘어온 상태

- 토큰 레이어는 완결됐다(컬러 24 · 글꼴 13 · 반경 12 · 그림자 3 · 그라디언트 3 · 이징 1).
  **`@theme` 블록을 건드리지 마라.** 토큰을 조합만 한다.
- `src/index.css`에는 `@layer components` 11종과 `@keyframes shine`이 있다.
- `src/lib/cn.ts`는 `twMerge(clsx(...))` 기본형이다. **결함이 확인됐다(§1).**
- `src/App.tsx`는 W-02 쇼케이스다. 이번에 스토리 페이지로 대체한다.
- `src/components/`는 아직 없다. 이번에 만든다.
- 테스트 러너는 아직 없다. **이번에도 도입하지 않는다.** 검증은 W-02와 같은 방식
  (빌드 CSS 파싱 + `getComputedStyle` 실측)으로 한다. vitest는 W-08에서 도입한다.

### 0.3 확정된 회신 3건

1. **`index.html` 메타 2건** — W-03A에서 넣는다(§2).
2. **`.pill-fill` 그림자 없음은 의도된 차이다.** 유지한다. 근거: `.btnp`는 화면 하단 주 액션,
   `.fchip-on`은 필터 바에 떠 있는 칩이라 고도(elevation)를 갖지만, `.pill`은 목록 **행 안에**
   들어가는 인라인 액션(승인·거절·양도)이다. 행마다 그림자가 깔리면 목록이 지저분해진다.
   Claude Design 공통 프롬프트도 pill 3종에 그림자를 명시하지 않았고 `[금지]`에 하드 섀도우가 있다.
   → W-03B에서 실제 목록 행에 렌더한 뒤에도 어색하면 그때 다시 본다. **지금은 손대지 마라.**
3. §7.1 보완 토큰 5개는 PM이 PRD v1.3에 반영한다. 코드 변경 없음.

---

## §1 `cn()` 보강 — 가장 먼저 할 것

W-02 보고서 §4.4·§6-1에서 확인된 결함을 고친다. `text-h1` 같은 커스텀 글꼴 크기가
커스텀 색과 함께 `cn()`에 들어가면 **경고 없이 소실된다.**

`src/lib/cn.ts`를 `extendTailwindMerge`로 교체한다. 등록 그룹 3개:

```ts
import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['h1','h2','sheet','grade','classno','stat','body',
                             'button','row','label','caption','micro','dock'] }],
      rounded: [{ rounded: ['pill','28','26','24','22','20','18','16','15','14','12','11'] }],
      shadow: [{ shadow: ['glass','primary','neu'] }],
    },
  },
});
```

- `shadow`는 보고서에 없던 항목이다. `shadow-glass`/`shadow-primary`/`shadow-neu`가
  기본 설정에서 그림자 색으로 오인될 수 있으므로 함께 등록한다.
- **`override`가 아니라 `extend`다.** Tailwind 내장 스케일(`text-sm`, `rounded-lg` 등)을
  잃으면 안 된다.
- W-02 쇼케이스에서 `cn()` 대신 문자열 결합으로 우회한 호출부가 있다면, 이번에 `cn()`으로 되돌린다.

**이 작업을 먼저 끝내고 컴포넌트를 시작하라.** 순서를 뒤집으면 글꼴 크기가 사라진 채로
컴포넌트를 만들고 나중에 전수 점검하게 된다.

---

## §2 `index.html` 메타 2건

W-02 §8이 수정을 금지해 남겨둔 항목이다. 이번에 넣는다.

| 항목 | 값 | 근거 |
| --- | --- | --- |
| 뷰포트 | `width=device-width, initial-scale=1, viewport-fit=cover` | PRD §7.5 |
| 테마 색 | `<meta name="theme-color" content="#F7FBF8">` | PRD §7.5, `--bg-top` |

- **`maximum-scale`·`user-scalable=no`를 넣지 마라**(AC-08. 사용자 확대를 막지 않는다).
- 그 외 `index.html` 수정은 하지 않는다. Spoqa CDN `<link>`와 `lang="ko"`는 유지 대상이다.

---

## §3 모션 — 오라 블롭만

**이번에 이식할 모션은 오라 블롭뿐이다.** `design/index.html`에서 원문을 찾아 그대로 옮긴다.

| 항목 | PRD §7.4 |
| --- | --- |
| 지속 | `8s` / `10s` / `12s` |
| 이징 | `ease-in-out alternate` (infinite) |

`blurIn`(화면 전환)은 W-05, `rise`(카드 등장)는 W-03B, `sparkle`·시트·독·세그먼트·토글 모션은
각각 그 요소를 만드는 작업으로 넘긴다. **§7.4 표를 통째로 이식하지 마라.**

`prefers-reduced-motion: reduce`에서 오라 블롭 애니메이션을 정지시킨다(AC-07).

---

## §4 `AppShell` — `src/components/AppShell.tsx`

PRD **§7.5 레이아웃 규격** 전문을 구현한다.

### 4.1 스테이지

| 항목 | 값 |
| --- | --- |
| 기준 해상도 | 430 × 902 |
| 스테이지 | `max-width: 430px`, `height: 100dvh`, `margin: 0 auto`, `overflow: hidden` |
| 배경 | `--gradient-stage` |
| 430px 초과 화면 | 좌우를 `--color-sundo-bg-outer`로 채우고 스테이지에 `0 0 60px rgba(20,53,38,0.18)` 그림자 |
| 화면 패딩 | `calc(env(safe-area-inset-top) + 26px) 22px 0` |
| 독 노출 화면 상단 패딩 | `calc(env(safe-area-inset-top) + 34px)` |
| 독 노출 화면 스크롤 하단 여백 | 최소 `120px` (관리 화면은 `130px`) |
| 방향 | 세로 고정. 가로 회전 시 레이아웃을 유지하고 세로 스크롤로 대응 |

- 스테이지는 `overflow: hidden`이고, 그 **안쪽에 세로 스크롤 영역**을 둔다.
- `0 0 60px rgba(20,53,38,0.18)`은 §7.1에 없는 값이다. 인라인으로 두고 보고서에 적는다.

### 4.2 오라 블롭 3개

Claude Design 공통 프롬프트 `[배경 장식]` — 항상 배경에 깐다. `blur 28px`.

| 위치 | 색 | 지속 |
| --- | --- | --- |
| 좌상단 | `rgba(87,144,111,0.30)` | `8s` |
| 우측 중단 | `rgba(46,107,76,0.20)` | `10s` |
| 좌하단 | `rgba(159,196,174,0.38)` | `12s` |

- **크기·좌표는 `design/index.html`에서 이식한다.** 거기에 없으면 지어내지 말고 §6.1-4로 질문한다.
- 전부 `aria-hidden="true"`(AC / §15.3 장식 요소).
- 스크롤과 무관하게 스테이지에 고정된다.

### 4.3 API

```ts
interface AppShellProps {
  children: ReactNode;
  hasDock?: boolean;       // true면 상단 패딩 +34px, 스크롤 하단 여백 120px
  bottomGap?: number;      // 관리 화면 130px 같은 예외. 기본값은 hasDock에서 결정
}
```

프로퍼티를 더 만들지 마라. 지금 필요한 것은 이 둘뿐이다.

---

## §5 `Field` — `src/components/Field.tsx` (이번 작업의 무게 중심)

PRD **§7.3 「입력 필드 v2 (`field`)」 별도 표** 전문을 구현한다.

> **PRD 프롬프트 지침 5 — 네이티브 `input`을 직접 쓰는 것을 금지한다.** 앞으로 모든 화면의
> 텍스트 입력은 이 컴포넌트만 쓴다. 여기서 빠진 거동은 화면마다 제각각 재구현된다.

### 5.1 원문 확보

`design/index.html`의 `<style>` 블록에 `.ff` 계열로 **완전히 존재한다**(W-02 보고서 §7).
높이 56px, floating label 전환 0.18s, `caret-color:#2E6B4C`, `:focus-within` 배경 상향 등.
**추출해서 그대로 이식한다.** 값을 새로 짓지 마라. 없는 항목만 PRD 표를 따른다.

### 5.2 7상태

부록 C 검증 기준이다. 스토리 페이지에서 **7개가 전부 동시에 보여야 한다.**

| # | 상태 | 규격 (PRD §7.3) |
| --- | --- | --- |
| 1 | 라벨 부상 | 비어 있고 비포커스 → 세로 중앙 `15px/500 rgba(20,53,38,0.45)`. 포커스 또는 값 있음 → 상단 9px, `11.5px/700 #2E6B4C`. 전환 `0.18s --ease-sundo`. **좌측 기준선 16px 고정**(아이콘 있으면 44px) |
| 2 | 포커스 | 테두리 `1px rgba(255,255,255,0.8)` → `1.5px #2E6B4C` 0.15s. 포커스 링 `0 0 0 3px rgba(46,107,76,0.12)`. 배경 `rgba(255,255,255,0.72)`로 상향 |
| 3 | 커서 | `caret-color: #2E6B4C` |
| 4 | 성공 | 테두리 `1.5px #2E6B4C`, 우측 16px 원형 20px 체크. `stroke-dashoffset` 0.28s 드로잉 + 필드 y `-2→0` 0.2s |
| 5 | 실패 | 테두리·라벨 `1.5px #C0392B`, 우측 느낌표 원형 20px. shake x `0→-6→5→-3→0` 0.32s ease-out (**에러당 1회만**). 아래 6px에 `11px/500 #C0392B` 문구가 높이 `0→auto` + 투명도 `0→1` 0.2s 펼침 |
| 6 | 검사 중 | 우측 `#2E6B4C` 스피너 16px. 테두리는 포커스 상태 유지 |
| 7 | 읽기 전용 | 배경 `rgba(31,81,56,0.06)`, 테두리 없음, 우측 16px 자물쇠 14px `rgba(20,53,38,0.45)`. 라벨 떠 있는 상태 고정, 커서 없음 |

추가 — **제출 중**: 전체 투명도 0.6, 커서·깜빡임 정지.

색은 전부 W-02 토큰으로 참조한다(`--color-sundo-700`, `--color-sundo-danger` 등).
`rgba(255,255,255,0.72)`는 `--color-sundo-line-surface`, `rgba(31,81,56,0.06)`은
`--color-sundo-divider`와 값이 같은지 확인하고 같으면 토큰을 쓴다.

### 5.3 컨테이너 규격

높이 **56px**, `radius 14`(`rounded-14`), 배경 `--color-sundo-glass`,
테두리 `1px rgba(255,255,255,0.8)`, `inset 0 1px 3px rgba(20,53,38,0.05)`,
`padding 22px 16px 8px`. 값 텍스트 `15px/500 --color-sundo-900`.
숫자·시각·코드는 `tabular-nums`.

### 5.4 placeholder 처리

- 항상 `placeholder={placeholder ?? " "}`를 준다.
- 라벨 부상은 **CSS만으로** 처리한다: `:focus` 또는 `:not(:placeholder-shown)`.
- 실제 예시 문구는 **포커스 중에만** `rgba(20,53,38,0.30)`으로 보인다.
  구현: `input:not(:focus)::placeholder { color: transparent }`.
- 라벨을 placeholder로 대신하지 마라(§15.3).

### 5.5 검증 타이밍 — Field가 소유한다

화면마다 재구현하면 규격이 갈라진다. 아래 규칙을 **컴포넌트 안에** 넣는다.

- blur 시 1차 검증.
- 한 번 에러가 뜬 필드는 값이 바뀔 때마다 즉시 재검사.
- 제출 시 전체 검증은 폼이 주도하므로 `ref`로 노출한다.
- 성공 아이콘은 **`validate`가 주어진 필드에서만**, blur 후 통과했을 때 표시한다.
  `validate`가 없는 필드에는 성공 상태가 없다(순찰 장소 같은 자유 입력에 체크가 뜨면 과하다).

### 5.6 API — 이 이상 만들지 마라

```ts
interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  validate?: (v: string) => string | null;  // null = 통과, string = 에러 문구
  checking?: boolean;        // 서버 확인 중 → 상태 6
  readOnly?: boolean;        // → 상태 7
  submitting?: boolean;      // 전체 투명도 0.6
  maxLength?: number;
  inputMode?: 'text' | 'numeric' | 'tel';
  placeholder?: string;      // 포커스 중에만 노출
  leadingIcon?: ReactNode;   // 있으면 좌측 기준선 44px
  id?: string;
}

interface FieldHandle {
  validate: () => boolean;   // 제출 시 폼이 호출
  focus: () => void;
}
```

- 글자 수 카운터는 만들지 않는다. 규격이 R-07에 있으므로 **W-09에서** 붙인다.
- `scrollIntoView` 보정(AC-12)도 S6 맥락이므로 W-09로 넘긴다.

### 5.7 접근성 (§15.3)

| 항목 | 처리 |
| --- | --- |
| 라벨 | 시각 라벨을 `<label for>`로 연결 |
| 실패 | `role="alert"` + `aria-invalid="true"` + `aria-describedby`로 에러 문구 연결 |
| 성공 아이콘 | `aria-hidden` |
| 읽기 전용 | `readonly` + `aria-readonly="true"`. 자물쇠는 `aria-hidden`, 안내 문구는 `aria-describedby` |
| 포커스 링 | `#2E6B4C` (AC-09) |

**AC-07 주의** — `prefers-reduced-motion: reduce`에서 **shake 진동만 제거하고
색·아이콘·에러 문구는 그대로 유지한다.** 오류 전달 수단을 통째로 없애면 안 된다.
라벨 부상·커서 깜빡임·체크 드로잉은 정지시킨다.

---

## §6 `Switch` — `src/components/Switch.tsx`

PRD §7.3 `switch` 행 + §7.4 토글 노브.

| 항목 | 값 |
| --- | --- |
| 트랙 | 폭 `50` 높이 `30` `radius 999` |
| 켜짐 | `--gradient-primary` + 흰 노브 `26px` 우측 |
| 꺼짐 | `rgba(20,53,38,0.14)` + 노브 좌측 |
| 모션 | 노브 이동 + 트랙 색 전환 `0.2s --ease-sundo` |
| 접근성 | `role="switch"` + `aria-checked`. 잠금 상태는 `aria-disabled="true"` + 안내 문구 `aria-describedby` |

- `rgba(20,53,38,0.14)`는 §7.1에 없다. 인라인으로 두고 보고서에 적는다.
- **잠금(locked) 상태가 필요하다.** S10 알림 토글은 MVP에서 잠금 상태로 들어간다.
- 터치 타깃 44px 보정은 하지 않는다(W-18).

```ts
interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  locked?: boolean;
  describedById?: string;
  id?: string;
}
```

---

## §7 절차

### 7.1 착수 전 확인

1. `docs/SunDO_PRD.md` §7.3(입력 필드 v2 표 포함), §7.4, §7.5, §15.3, §15.4를 읽는다.
2. `design/index.html`에서 아래를 확보한다. 추출 방법은 `reports/W-02.md` §5 서두에 있다.
   - `.ff` 계열 전문 (Field)
   - 오라 블롭 3개의 크기·좌표·`@keyframes`
   - 토글 스위치 규칙 (있으면)
3. `reports/W-02.md` §5.3 인라인 리터럴 목록을 읽는다. 같은 값을 또 인라인으로 쓰게 되면
   그때는 토큰화 후보다.
4. **§4~§6과 실제 파일이 충돌하거나, 필요한 규칙이 `design/index.html`에도 없거나,
   해석이 둘 이상이면 — 코드를 쓰기 전에 멈추고 선택지 형태로 질문한다(QA-01·QA-02).**

### 7.2 실행 순서

1. `src/lib/cn.ts` 교체 → 충돌 3케이스 실측 확인 (§1)
2. `index.html` 메타 2건 (§2)
3. 오라 블롭 `@keyframes` 이식 (§3)
4. `AppShell` (§4)
5. `Field` (§5) ← 가장 오래 걸린다
6. `Switch` (§6)
7. `src/App.tsx`를 스토리 페이지로 교체 (§8 DoD 검증용)
8. `npm run build` → computed style 실측
9. `reports/W-03A.md` · `docs/PROGRESS.md` → 커밋 `SunDO v0.0.3`

---

## §8 완료 조건 (DoD)

| # | 조건 | 확인 방법 |
| --- | --- | --- |
| 1 | `npm run build` 통과 | `tsc -b && vite build` exit 0 |
| 2 | `cn('text-h1','text-sundo-900')` 결과에 `text-h1` 유지 | 실측. W-02 §4.4의 3케이스 전부 재실행 |
| 3 | `cn('shadow-glass','shadow-neu')`가 뒤엣것만 남김 | 실측 |
| 4 | Tailwind 내장 스케일 유지 (`cn('text-sm','text-lg')` → `text-lg`) | 실측 |
| 5 | `index.html`에 `viewport-fit=cover` + `theme-color: #F7FBF8` 존재 | 파일 확인 |
| 6 | `maximum-scale`·`user-scalable` 부재 | `grep` |
| 7 | 스테이지가 `max-width:430px`, `height:100dvh`, `overflow:hidden`, 가운데 정렬 | computed style |
| 8 | 1024px 폭에서 좌우가 `#DDE9E1`, 스테이지에 외곽 그림자 | computed + 육안 |
| 9 | `hasDock` false/true에서 상단 패딩이 26px/34px 차이 (safe-area 0 기준) | computed |
| 10 | 오라 블롭 3개 존재, `blur(28px)`, 색 3종 일치, 전부 `aria-hidden` | computed + DOM |
| 11 | reduce에서 오라 블롭 정지 | 에뮬레이션 + `animationName` |
| 12 | **Field 7상태가 스토리 페이지에서 전부 렌더** | 육안 + computed |
| 13 | Field 컨테이너 높이 56px, radius 14px, padding `22px 16px 8px` | computed |
| 14 | 라벨 부상이 **CSS만으로** 동작 (JS 상태 없이 `:placeholder-shown` 전환) | 코드 확인 + 실측 |
| 15 | 좌측 기준선이 아이콘 없음 16px / 있음 44px로 고정, 부상 전후 동일 | computed (부상 전/후 `left` 동일) |
| 16 | shake가 에러당 1회만. 에러 상태에서 재포커스해도 반복 없음 | 실측 |
| 17 | reduce에서 shake만 제거되고 테두리 색·아이콘·에러 문구는 유지 | 에뮬레이션 |
| 18 | 실패 시 `aria-invalid="true"` + `role="alert"` + `aria-describedby` 연결 | DOM |
| 19 | 읽기 전용에 `readonly` + `aria-readonly="true"`, 커서 없음 | DOM + computed |
| 20 | `ref.validate()` 호출 시 전체 검증되고 boolean 반환 | 실측 |
| 21 | Switch 트랙 50×30, 노브 26px, 켜짐/꺼짐/잠금 3상태 렌더, `role="switch"` | computed + DOM |
| 22 | 네이티브 `<input type="text">` 직접 사용이 `Field.tsx` 밖에 0건 | `grep -rn '<input' src/` |
| 23 | `@theme` 블록 변경 0건 | `git diff` |
| 24 | `SunDO v0.0.3` 푸시, `package.json` version `0.0.3`, Contributors에 Claude 없음 | `git log -1` |

---

## §9 보고 형식

`reports/W-03A.md`. 터미널에는 `작업이 완료되었습니다` 한 줄만.

1. 생성·수정한 파일 목록
2. 완료 조건 24개 통과 여부 표 + 근거
3. `Field` 7상태 각각의 최종 규격 (스크린샷 또는 computed 값)
4. 판단이 필요했던 지점과 근거
5. `design/index.html`에서 이식한 규칙 원문과 출처 (특히 `.ff` 계열, 오라 블롭)
6. 토큰화하지 않고 인라인으로 남긴 리터럴 목록
   (`0 0 60px rgba(20,53,38,0.18)`, `rgba(20,53,38,0.14)`, `inset 0 1px 3px rgba(20,53,38,0.05)` 등)
7. 사용자 확인이 필요한 사항
8. W-03B에 넘길 전제

---

## §10 범위 제외 — 이번에 하지 말 것

- GlassCard · NeuButton · PrimaryButton · Chip · Pill · Footer · Dock (→ W-03B)
- Toast · BottomSheet · ConfirmModal (→ W-03C)
- `blurIn`(→ W-05) · `rise`(→ W-03B) · `sparkle` · 시트 · 독 · 세그먼트 모션
- 라우팅, 화면 전환 (→ W-05)
- Firebase SDK · 상태 관리 라이브러리 설치
- 테스트 러너 도입 (→ W-08)
- 터치 타깃 44px 보정, VoiceOver 검증 (→ W-18)
- 글자 수 카운터, `scrollIntoView` 보정 (→ W-09)
- `@theme` 블록 수정, `vite.config.ts` · `tsconfig*.json` 수정
- `.pill-fill` 그림자 (§0.3-2 — 의도된 차이로 확정)
