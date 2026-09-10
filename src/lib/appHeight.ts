import { isStandalone } from './pwa'

/**
 * 앱 높이 실측 — W-28 A-1. **화면 최하단 blank 띠를 여기서 끝낸다.**
 *
 * 🔬 증상: PWA로 실행하면 독 아래에 앱 배경이 아닌 띠가 남는다(사용자 첨부1).
 * 어느 독 탭에서도 같고, 띠의 두께는 **상단 상태 표시줄과 비슷하다**(사용자 확인).
 *
 * 🔴 **W-26 A-1이 이미 한 번 고쳤고, 그 수리로는 부족했다.** 그때는 원인을 「`dvh`라는
 * **단위**가 틀렸다」로 잡고 `height: 100%` 사슬로 바꿨다. 그런데 `100%`도 `dvh`도
 * 결국 **같은 하나**를 참조한다 — 레이아웃 뷰포트다. 단위를 바꿔도 증상이 살아남았다는
 * 사실이 **단위가 아니라 그 뷰포트 자체가 짧다**는 것을 증명한다.
 *
 * 🔴 **그래서 뷰포트에서 파생하지 않고 잰다.** `window.innerHeight`는 CSS 길이가 아니라
 * **브라우저가 「지금 보이는 높이」로 보고하는 수**라, 레이아웃 뷰포트가 틀린 순간에도
 * 따로 움직일 수 있다. 그 값을 `--app-h`에 실어 `index.css`의 사슬이 쓴다.
 *
 * ⚠ **아무것도 재지 못하면 조용히 옛 동작으로 돌아간다** — `--app-h`가 없으면
 * `height: var(--app-h, 100%)`가 `100%`로 읽힌다. 이 파일이 통째로 죽어도 앱은 산다.
 */

/** `index.css`의 `html`·`body`·`#root`가 읽는 이름. 양쪽을 함께 고쳐라. */
const VAR = '--app-h'

/** 마지막으로 심은 값. 같은 값을 다시 쓰지 않으려고 둔다(레이아웃 무효화 0회). */
let current = 0

/**
 * `env(safe-area-inset-*)`를 **px 수로** 읽기 위한 탐침.
 *
 * 🔴 커스텀 속성으로는 못 읽는다 — `--sat: env(...)`를 `getPropertyValue`로 읽으면
 * 계산된 px이 아니라 `env(safe-area-inset-top)`이라는 **글자 그대로**가 돌아온다.
 * 커스텀 속성은 쓰이는 자리에서 치환되기 때문이다. 실제 속성(`padding`)에 실어야
 * `getComputedStyle`이 px로 풀어 준다.
 */
let probe: HTMLDivElement | null = null

function readInsets(): { top: number; bottom: number } {
  if (!probe) {
    probe = document.createElement('div')
    probe.setAttribute('aria-hidden', 'true')
    probe.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)'
    document.body.appendChild(probe)
  }
  const cs = getComputedStyle(probe)
  return {
    top: Number.parseFloat(cs.paddingTop) || 0,
    bottom: Number.parseFloat(cs.paddingBottom) || 0,
  }
}

/**
 * 이번에 심을 높이.
 *
 * ① **브라우저에서는 `innerHeight` 하나뿐이다.** 그것이 정의상 「지금 보이는 높이」다.
 *    Safari의 도구 막대가 덮는 자리를 앱이 차지하지 않게 되는 것도 같은 이유로 옳다.
 *
 * ② **standalone에서만** 화면 전체(`screen.height`)까지 늘릴 수 있다. 단 세 관문을 전부
 *    통과해야 한다 — 하나라도 어긋나면 늘리지 않는다.
 *    - 세로 방향이어야 한다. 🔴 iOS의 `screen.height`는 **회전해도 세로 값 그대로**라
 *      가로에서 쓰면 화면 높이를 2배 넘게 잡는다.
 *    - `env(safe-area-inset-top)`·`bottom`이 **둘 다 0보다 커야 한다.** 이 둘이 0이 아니라는
 *      것은 **웹뷰가 상태 표시줄과 홈 인디케이터 자리까지 실제로 덮고 있다**는 증거다.
 *      웹뷰가 안전영역 안쪽에 놓인 경우(그때는 두 값이 0이다) 화면 끝까지 늘리면
 *      독이 보이지 않는 자리로 내려간다 — 그 사고를 이 관문이 막는다.
 *    - 늘리는 양은 **`top + bottom`을 넘지 못한다.** 레이아웃 뷰포트가 빠뜨릴 수 있는
 *      자리는 그 둘뿐이므로, 다른 이유로 벌어진 차이는 여기서 잘린다.
 *
 * 🔴 **브라우저가 옳아지면 이 함수는 저절로 아무것도 하지 않는다** — 그 순간
 * `screen.height - innerHeight`가 0이라 늘릴 양이 0이 된다. 하드코딩한 보정값이 아니다.
 */
function measure(): number {
  const inner = window.innerHeight
  if (inner <= 0) return 0
  if (!isStandalone()) return inner
  if (window.innerWidth > inner) return inner

  const { top, bottom } = readInsets()
  if (top <= 0 || bottom <= 0) return inner

  const missing = Math.round((window.screen?.height ?? 0) - inner)
  return inner + Math.min(Math.max(missing, 0), top + bottom)
}

/**
 * 지금 글자를 입력하는 중인지.
 *
 * 🔴 **키보드가 떠 있는 동안에는 재지 않는다.** Android는 키보드가 `innerHeight`를
 * 줄이는 설정이 있고, 그때 다시 재면 **앱 셸이 키보드 높이만큼 쪼그라든다.**
 * 키보드는 셸이 아니라 시트가 피한다(`lib/useKeyboardInset.ts`).
 */
function isEditing(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true
}

function apply(): void {
  const next = measure()
  if (next <= 0 || next === current) return
  current = next
  document.documentElement.style.setProperty(VAR, `${next}px`)
}

/**
 * 한 번 재고, 화면이 바뀔 때마다 다시 잰다. `main.tsx`가 렌더 전에 한 번 부른다.
 *
 * ⚠ 회전은 **두 번** 잰다. `orientationchange` 시점에는 아직 옛 치수가 오는 기기가 있어
 * 조금 뒤 한 번 더 봐야 한다. 값이 같으면 두 번째는 아무 일도 하지 않는다(`apply`의 조기 반환).
 */
export function startAppHeightSync(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  apply()

  window.addEventListener('resize', () => {
    if (!isEditing()) apply()
  })
  window.addEventListener('orientationchange', () => {
    apply()
    window.setTimeout(apply, 300)
  })
}
