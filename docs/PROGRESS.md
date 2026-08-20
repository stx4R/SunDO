# SunDO Progress

## 현재 버전
v0.0.2

## 완료한 작업
- [x] W-01 프로젝트 스캐폴딩
- [x] W-02 디자인 토큰 이식 (PRD §7.1~7.3)

## 진행 중
- 없음

## 다음 작업
- W-03 공통 컴포넌트 (`Field`, `Switch`, `AppShell` 등)

## 확정된 결정
- **디자인 원본은 `design/index.html`이다.** (2026-08-20 사용자 확정)
  리셋 전 원격에 있던 `index.html`은 커밋이 더 나중이었으나 **채택하지 않는다.**
  "최신본 채택" 규약을 이 파일에 적용해 원격본을 다시 꺼내오지 말 것.
- 폰트는 CDN 방식이다(지시서 §2 고정값, PRD §7.1).
  `https://cdn.jsdelivr.net/gh/spoqa/spoqa-han-sans@latest/css/SpoqaHanSansNeo.css`
- **`.fchip-on`은 PRD §7.3의 단색 `#1F5138`이 아니라 design의 그라디언트를 쓴다.**
  (2026-08-20 사용자 확정 — PRD 표기를 전사 오류로 판단). PRD로 되돌리지 말 것.
- **`.shine` 적용 규칙은 W-02에서 신규 확정한 값이다.** 프로토타입에는 `@keyframes`만
  있고 적용 규칙이 0건이었다. 전문은 `reports/W-02.md` §5.2에 있다.
- 간격은 커스텀 토큰 없이 Tailwind 기본 `--spacing` 배수를 쓴다.
  `p-4.5` `p-5.5` `p-6.5` 소수 단계가 정상 생성됨을 확인했다.

## 막힌 지점 / 사용자 확인 필요
- **`tailwind-merge` 커스텀 스케일 충돌 — W-03 착수 전 처리 필요.**
  `cn('text-h1','text-sundo-900')` → `'text-sundo-900'`으로 **글꼴 크기가 조용히 사라진다.**
  글꼴 크기 13종 전부 해당. `rounded-*`는 무사.
  W-02 지시서 §4가 `extendTailwindMerge` 설정을 금지해 이번에는 적용하지 않았다.
  적용할 설정 내용은 `reports/W-02.md` §6-1에 적어두었다.
- `index.html`에 `viewport-fit=cover`와 `theme-color: #F7FBF8`이 없다.
  W-02 지시서 §8이 수정을 금지해 그대로 두었다. W-03 `AppShell`에서 함께 넣을 후보.
- `public/fonts/`의 Spoqa TTF 5종은 CDN 채택으로 여전히 미사용이다.
  오프라인 PWA 단계에서 로컬 `@font-face` 전환 여부를 재검토한다.
- `README.md`·`LICENSE`(MIT)를 원격에 복구할지, 복구한다면 어느 작업 단계에 넣을지 미정.
- `.pill-fill`만 그림자가 없다(회신 §3 지시대로). 의도된 차이인지 확인 필요.

## 참고
- W-01 착수 시 원격 저장소가 비어 있지 않아(커밋 27개) 사용자 선택에 따라 히스토리를
  리셋하고 v0.0.1 단일 커밋으로 시작했다.
  기존 원격 히스토리 백업: `바탕 화면/SunDO_remote_backup_20260820.bundle`
  (복원: `git clone SunDO_remote_backup_20260820.bundle`)
- `design/index.html`은 번들 아티팩트라 마크업이 JSON 문자열로 인코딩돼 있다.
  CSS를 꺼내려면 이스케이프를 2단계 해제해야 한다. 방법은 `reports/W-02.md` §5 서두 참조.
- `.field`(입력 필드 v2)의 원문 CSS는 `design/index.html`의 `<style>` 블록에
  `.ff` 계열로 완전히 존재한다. W-03에서 그대로 쓸 수 있다.

## 다음 세션이 먼저 읽어야 할 파일
- CLAUDE.md, docs/SunDO_PRD.md, prompts/{다음 작업}.md
- reports/W-02.md §6 (W-03 착수 전 처리할 항목이 있다)
