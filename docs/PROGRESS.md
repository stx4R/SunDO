# SunDO Progress

## 현재 버전
v0.0.3

## 완료한 작업
- [x] W-01 프로젝트 스캐폴딩
- [x] W-02 디자인 토큰 이식 (PRD §7.1~7.3)
- [x] W-03A 기반 레이어 + AppShell + Field + Switch (DoD 24개 전부 통과)

## 진행 중
- 없음

## 다음 작업
- W-03B 공통 컴포넌트 2 — GlassCard · NeuButton · PrimaryButton · Chip · Pill · Footer · Dock
  (W-03은 3분할했다: W-03A 완료 / W-03B / W-03C Toast·BottomSheet·ConfirmModal.
   **W-04부터는 PRD 부록 C 번호를 그대로 쓴다.**)

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
- **성공 상태는 blur·`ref.validate()`에서만 켠다.** (W-03A §4-2)
  값 변경 재검사는 에러 해제만 하고 성공 체크를 띄우지 않는다.

## 막힌 지점 / 사용자 확인 필요
- **W-03A 보고서 §7의 확인 요청 5건이 미회신이다.** W-03B 착수 전에 1·3·4를 정하는 편이 좋다.
  1. `ref.validate()`가 성공 체크를 띄우는 것이 맞는지 (지금은 띄운다)
  2. `.ff-ro` 테두리를 투명으로 바꾼 것 (PRD 문구는 "테두리 없음")
  3. `--color-sundo-tint-06` 신설 여부 — `rgba(31,81,56,0.06)`이 2회 쓰인다.
     `--color-sundo-divider`는 밑색이 `rgba(20,53,38,…)`이라 대체 불가
  4. `inset 0 1px 3px rgba(20,53,38,0.05)` 토큰화 여부 — **이미 5회 반복**
  5. 스피너를 reduce에서 정지시키지 않은 것
- `public/fonts/`의 Spoqa TTF 5종은 CDN 채택으로 여전히 미사용이다.
  오프라인 PWA 단계에서 로컬 `@font-face` 전환 여부를 재검토한다.
- `README.md`·`LICENSE`(MIT)를 원격에 복구할지, 복구한다면 어느 작업 단계에 넣을지 미정.

## 해소된 항목
- ~~`tailwind-merge` 커스텀 스케일 충돌~~ → W-03A §1에서 해결. 실측 11케이스 통과.
- ~~`index.html`에 `viewport-fit=cover`·`theme-color` 부재~~ → W-03A §2에서 추가.
- ~~`.pill-fill` 그림자 확인 필요~~ → 의도된 차이로 확정.

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
- `src/App.tsx`는 화면이 아니라 **W-03A DoD 실측용 스토리 페이지**다. W-05 라우팅에서 대체된다.

## 다음 세션이 먼저 읽어야 할 파일
- CLAUDE.md, docs/SunDO_PRD.md, prompts/{다음 작업}.md
- reports/W-03A.md §7(확인 요청 5건) · §8(W-03B 전제)
