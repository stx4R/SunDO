/**
 * PRD §7.4 `sparkle` — **7개 · `51.4°` 간격 · 0.5s ease-out.**
 * 밝은 배경 위 `#2E6B4C`, 주 버튼 위 `#fff`.
 *
 * design 프로토타입의 `spawnSpark(x, y, light)`가 정본이고 값이 전부 일치한다.
 * 원문(2단계 이스케이프 해제 후):
 *
 * ```js
 * for (let i = 0; i < 7; i++) {
 *   a.style.cssText = `position:absolute;left:-1px;top:-14px;width:2.5px;height:9px;
 *                      transform-origin:1.25px 14px;transform:rotate(${i * 51.4}deg)`
 *   b.style.cssText = `width:100%;height:100%;border-radius:2px;
 *                      background:${light ? '#fff' : '#2E6B4C'};
 *                      animation:sparkle .5s ease-out forwards`
 * }
 * setTimeout(() => c.remove(), 550)
 * ```
 *
 * **컴포넌트가 아니라 함수인 이유**: T-03은 sparkle과 라우팅을 같은 프레임에 건다.
 * React 컴포넌트가 화면 소유라면 `navigate()` 직후 화면이 언마운트되면서 포털도 함께
 * 사라져 **0.5s 애니메이션이 첫 프레임에서 끊긴다.** 명령형으로 `.ovl-root`에 직접
 * 붙이면 소유자가 없어 전환을 가로질러 살아남고, 550ms 뒤 스스로 지운다.
 *
 * design은 `position: fixed` + `document.body` + `z-index: 9999`를 쓰지만 여기서는
 * **`.ovl-root`(스테이지 기준 `absolute`)** 에 붙인다. `fixed`로 두면 430px 밖 화면에서
 * 스테이지를 벗어난다(W-03B §4-9와 같은 이유). 그래서 좌표도 스테이지 기준으로 옮긴다.
 */

const SPARK_COUNT = 7
const SPARK_ANGLE_DEG = 51.4
const LIFETIME_MS = 550

function prefersReduced(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * @param root `.ovl-root` 노드(`OverlayRootContext`). `null`이면 아무 것도 하지 않는다.
 * @param clientX 탭 지점의 뷰포트 좌표
 * @param clientY 〃
 * @param color §7.4 「밝은 배경 위 `#2E6B4C`, 주 버튼 위 `#fff`」. **주지 않으면
 *   `.spark i`의 기본값(`--color-sundo-700` = `#2E6B4C`)이 그대로 쓰인다** —
 *   기존 호출부(S3·S4·S5)는 한 글자도 바뀌지 않는다. S6 사유 세그먼트가 `'#fff'`로 부른다.
 */
export function spawnSparkle(
  root: HTMLElement | null,
  clientX: number,
  clientY: number,
  color?: string,
): void {
  if (!root) return
  /* §7.4 마지막 문단 — reduce에서 sparkle은 **정지**다. 아예 만들지 않는다.
     CSS로 `animation: none`만 걸면 `from{opacity:1}`이 적용되지 않아 막대가
     550ms 동안 그대로 떠 있는다. */
  if (prefersReduced()) return

  const bounds = root.getBoundingClientRect()
  const container = document.createElement('div')
  container.setAttribute('aria-hidden', 'true')
  container.className = 'spark'
  container.style.left = `${clientX - bounds.left}px`
  container.style.top = `${clientY - bounds.top}px`
  /* 커스텀 속성은 자식 `.spark i`가 `var(--spark-color, …)`로 읽는다.
     주지 않으면 선언 자체가 없어 CSS 폴백이 그대로 산다. */
  if (color) container.style.setProperty('--spark-color', color)

  for (let i = 0; i < SPARK_COUNT; i++) {
    const spoke = document.createElement('span')
    spoke.style.transform = `rotate(${i * SPARK_ANGLE_DEG}deg)`
    spoke.appendChild(document.createElement('i'))
    container.appendChild(spoke)
  }

  root.appendChild(container)
  window.setTimeout(() => container.remove(), LIFETIME_MS)
}
