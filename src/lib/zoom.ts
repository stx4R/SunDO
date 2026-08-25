/**
 * 확대 차단 — W-23 B-9(b) · PRD §8.11 밖의 전역 정책.
 *
 * 🔴 **이것은 W-03A DoD 6(「`maximum-scale`·`user-scalable` 부재 0건」)을 폐기하는 결정이다.**
 * PM이 명시 요구했고 근거·대체 경로는 `reports/W-23.md` §3에 있다.
 * 🔴 **대체 접근성 경로** — AC-05가 루트 글꼴을 고정하지 않아 시스템 글자 크기 설정이
 * 앱 전체를 키운다(32px 루트·200%에서 가로 스크롤 0 · W-15B §4-7 실측).
 * 저시력 사용자가 **완전히 막히지는 않는다.** 그 사실이 폐기의 근거다.
 *
 * 세 갈래가 각각 다른 것을 막는다. 하나만으로는 부족하다.
 * | 경로 | 막는 것 |
 * | --- | --- |
 * | `index.html`의 `maximum-scale=1, user-scalable=no` | Android/Chrome의 핀치·더블탭 |
 * | `body { touch-action: manipulation }`(`index.css`) | 더블탭 줌(iOS 포함) |
 * | **이 파일** | 🔴 **iOS Safari의 핀치** — iOS 10부터 viewport의 두 값을 **무시한다** |
 *
 * ⚠ `gesturestart`·`gesturechange`·`gestureend`는 **WebKit 전용**이고 표준이 아니다.
 * 다른 브라우저에서는 한 번도 발화하지 않는다 — 등록해도 비용이 0이다.
 * ⚠ `passive: false`를 명시한다. 명시하지 않으면 브라우저가 기본값을 바꾸는 날
 * `preventDefault()`가 조용히 무시된다.
 */
const GESTURE_EVENTS = ['gesturestart', 'gesturechange', 'gestureend'] as const

export function blockPinchZoom(): void {
  if (typeof document === 'undefined') return
  const block = (event: Event) => event.preventDefault()
  for (const name of GESTURE_EVENTS) {
    document.addEventListener(name, block, { passive: false })
  }
}
