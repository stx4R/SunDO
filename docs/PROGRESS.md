# SunDO Progress

## 현재 버전
v0.0.4

## 완료한 작업
- [x] W-01 프로젝트 스캐폴딩
- [x] W-02 디자인 토큰 이식 (PRD §7.1~7.3)
- [x] W-03A 기반 레이어 + AppShell + Field + Switch (DoD 24개 전부 통과)
- [x] W-03B 표면 컴포넌트 6종 + Dock + Footer (DoD 28개 전부 통과)

## 진행 중
- 없음

## 다음 작업
- W-03C 공통 컴포넌트 3 — Toast · BottomSheet · ConfirmModal
  (W-03은 3분할했다: W-03A·W-03B 완료 / W-03C 남음.
   **W-04부터는 PRD 부록 C 번호를 그대로 쓴다.**)
  착수 전 `reports/W-03B.md` §8(확인 5건) · §9(W-03C 전제)를 읽는다.

## 확정된 결정
- **디자인 원본은 `design/index.html`이다.** (2026-08-20 사용자 확정)
  리셋 전 원격에 있던 `index.html`은 커밋이 더 나중이었으나 **채택하지 않는다.**
  "최신본 채택" 규약을 이 파일에 적용해 원격본을 다시 꺼내오지 말 것.
- 폰트는 CDN 방식이다(지시서 §2 고정값, PRD §7.1).
  `https://cdn.jsdelivr.net/gh/spoqa/spoqa-han-sans@latest/css/SpoqaHanSansNeo.css`
- **`.fchip-on`은 PRD §7.3의 단색 `#1F5138`이 아니라 design의 그라디언트를 쓴다.**
  (2026-08-20 사용자 확정 — PRD 표기를 전사 오류로 판단). PRD로 되돌리지 말 것.
- **`.shine` 적용 규칙은 W-02에서 신규 확정한 값이다.** 전문은 `reports/W-02.md` §5.2.
- 간격은 커스텀 토큰 없이 Tailwind 기본 `--spacing` 배수를 쓴다.
- **`.pill-fill` 그림자 없음은 의도된 차이다.** (W-03A 지시서 §0.3-2 확정)
  W-03B에서 실제 목록 행에 렌더한 뒤에도 어색하면 그때 다시 본다.
- **`cn()`은 `extendTailwindMerge`로 커스텀 스케일 3그룹을 등록했다.** (W-03A §1)
  `@theme`에 새 커스텀 스케일을 추가하면 `src/lib/cn.ts`의 `classGroups`에도 함께 등록해야 한다.
- **포커스 테두리 1.5px는 `border-width`가 아니라 inset 그림자로 낸다.** (W-03A §4-3)
  `border-width`를 바꾸면 padding box가 줄어 라벨 기준선이 흔들린다. 되돌리지 말 것.
- **`.ff-ro`의 "테두리 없음"은 `border: 1px solid transparent`다.** (W-03A §4-1)
  `border: 0`으로 지우면 읽기 전용만 라벨 좌측 기준선이 1px 어긋난다.
- **reduce에서 스피너는 정지시키지 않는다.** (W-03A §4-4) 진행 중을 알리는 유일한 피드백이다.
- **성공 상태는 blur에서만 켠다.** (W-03A §4-2 → **W-03B §1에서 수정**)
  `ref.validate()`(제출)도 성공 체크를 켜지 않는다. 제출 시점의 주인공은 에러다.
  단 **켜져 있던 성공을 끄지도 않는다** — 해제는 값 변경만 담당한다.
- **`-webkit-` 접두사를 손으로 적지 않는다.** (W-03B §4-1)
  표준과 나란히 적으면 lightningcss가 둘을 같은 속성으로 보고 **표준 선언을 지운다.**
  표준만 적으면 접두사판을 자동으로 덧붙인다. `backdrop-filter`에서 실제로 터졌다.
- **reduce에서 덮어야 하는 값은 인라인 `style`로 주지 않는다.** (W-03B §4-3)
  인라인은 미디어 쿼리가 이길 수 없다. 커스텀 속성(`--rise-delay`)으로 넘긴다.
- **`ResizeObserver` + `setState`는 결과를 폭에서 직접 계산한다.** (W-03B §4-2)
  직전 상태에서 한 칸씩 움직이면 경계 폭에서 무한 루프가 된다(React #185 — 실제로 380px에서 앱이 죽었다).
  `space-around`의 항목 사이 간격은 `free / n`이다(`n-1`이 아니다).
- **독 활성 배경은 항목이 아니라 절대 위치 알약 1개가 갖는다.** (PRD §6.2 · design `15d`)
  항목마다 배경을 켜고 끄면 가로 슬라이드가 불가능하다.
- **독 비활성 라벨 `rgba(20,53,38,0.5)`은 §15.2 AC-01과 충돌하는 채로 뒀다.** (W-03B §7)
  §6.2 원문을 따랐다. **임의로 0.70으로 올리지 말 것.** W-18 대비 실측에서 재판정한다.
- **Footer 링크 44px은 투명 패딩 + 음수 마진으로 낸다.** (W-03B §4-7)
  `padding: 15px 0` + `margin-block: -15px`. 시각 높이 14px이 유지돼야 접힘 줄 간격이 10px이 된다.

## 막힌 지점 / 사용자 확인 필요
- **`npm run build`가 기존 `dist/`가 있으면 크래시한다.** (W-03B §8-1)
  OneDrive 동기화 폴더 + vite `emptyOutDir` 조합으로 보인다. 출력이
  `✓ 30 modules transformed.`에서 끊기고 에러 없이 죽는다(`0xC0000409`).
  **`rm -rf dist` 후 실행하면 매번 통과한다.** 스크립트 수정 여부는 미정.
- **W-03B 보고서 §8의 확인 5건이 미회신이다.** (빌드 크래시 / reduce에서 독 모션 /
  320px 5탭 간격 0 / 역할 전환 시 알약 소실 / Footer 하단 여백 41px vs design 60px)
- `public/fonts/`의 Spoqa TTF 5종은 CDN 채택으로 여전히 미사용이다.
  오프라인 PWA 단계에서 로컬 `@font-face` 전환 여부를 재검토한다.
- `README.md`·`LICENSE`(MIT)를 원격에 복구할지, 복구한다면 어느 작업 단계에 넣을지 미정.

## 해소된 항목
- ~~`tailwind-merge` 커스텀 스케일 충돌~~ → W-03A §1에서 해결. 실측 11케이스 통과.
- ~~`index.html`에 `viewport-fit=cover`·`theme-color` 부재~~ → W-03A §2에서 추가.
- ~~`.pill-fill` 그림자 확인 필요~~ → 의도된 차이로 확정. W-03B에서 실제 렌더 후에도 유지.
- ~~W-03A 확인 요청 5건~~ → W-03B 지시서 §0.1에서 전부 회신됐다.
  1 끄기(§1 반영) / 2 승인 / 3 승인(`--color-sundo-tint-06` 신설) / 4 W-09으로 연기 / 5 승인.

## 참고
- W-01 착수 시 원격 저장소가 비어 있지 않아(커밋 27개) 사용자 선택에 따라 히스토리를
  리셋하고 v0.0.1 단일 커밋으로 시작했다.
  기존 원격 히스토리 백업: `바탕 화면/SunDO_remote_backup_20260820.bundle`
  (복원: `git clone SunDO_remote_backup_20260820.bundle`)
- `design/index.html`은 번들 아티팩트라 마크업이 JSON 문자열로 인코딩돼 있다.
  CSS를 꺼내려면 이스케이프를 2단계 해제해야 한다. 방법은 `reports/W-02.md` §5 서두 참조.
- **검증 환경 주의.** W-02는 Chrome 확장으로 `getComputedStyle`을 읽었으나 W-03A 재개 세션에서는
  확장이 연결돼 있지 않았다. 헤드리스 Chrome을 CDP로 직접 구동해 같은 측정을 했다
  (의존성 추가 없음, node 전역 `WebSocket`/`fetch`만 사용). 방법은 `reports/W-03A.md` §1 참조.
  - 헤드리스는 창이 활성이 아니면 `focus`/`blur` 이벤트가 **발생하지 않는다.**
    `Emulation.setFocusEmulationEnabled`를 켜야 blur 검증을 실측할 수 있다.
- `src/App.tsx`는 화면이 아니라 **W-03A·W-03B DoD 실측용 스토리 페이지**다. W-05 라우팅에서 대체된다.
  W-03C 항목도 기존 절을 지우지 말고 아래에 이어 붙인다.
- **토큰화 기준(W-03B 지시서 §3)**: 서로 다른 컴포넌트 2개 이상에서 쓰이면 토큰.
  같은 컴포넌트의 상태 변형 반복은 CSS 기계적 중복이지 토큰 수요가 아니다.
- W-09 승격 대기: `inset 0 1px 3px rgba(20,53,38,0.05)`(→ `--shadow-inset-soft`),
  `inset 0 1px 0 rgba(255,255,255,0.85)`(`.glass`+`.dock` 2회), `rgba(20,53,38,0.45)`(4회).

## 다음 세션이 먼저 읽어야 할 파일
- CLAUDE.md, docs/SunDO_PRD.md, prompts/{다음 작업}.md
- reports/W-03B.md §8(확인 5건) · §9(W-03C 전제)
