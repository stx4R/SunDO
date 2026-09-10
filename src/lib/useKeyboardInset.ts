import { useEffect, useState } from 'react'

/**
 * 화면 아래를 키보드가 덮은 높이(px) — W-28 A-2.
 *
 * 🔬 증상: 학생 검색 시트에서 학번 칸을 누르면 숫자 키보드가 올라오고, **시트가 그
 * 뒤에 가려 검색 결과가 보이지 않는다**(사용자 첨부2 영상). 시트는 `bottom: 0`이고
 * 키보드는 그 위를 덮으므로 당연한 결과다.
 *
 * 🔴 **키보드 높이는 「레이아웃」이 아니라 「비주얼 뷰포트」에만 나타난다.** iOS는 키보드가
 * 떠도 `innerHeight`도 `100%`도 한 픽셀도 바꾸지 않는다 — 그래서 CSS만으로는 이 수를 알 수 없고,
 * `visualViewport`를 구독하는 이 훅이 유일한 통로다.
 *
 * 🔴 **`innerHeight`를 기준으로 빼지 않는다.** Android에는 키보드가 `innerHeight`까지 줄이는
 * 설정이 있어 그 경우 `innerHeight - visualViewport.height`가 **언제나 0**이 된다.
 * 대신 **지금까지 본 가장 큰 값**을 「키보드가 없을 때의 높이」로 삼는다 — 두 기기에서 같은 식이 된다.
 *
 * ⚠ `offsetTop`을 반드시 더한다. 입력 칸을 보이려고 브라우저가 비주얼 뷰포트를 위로
 * 밀면 `height`는 그대로인 채 `offsetTop`만 커진다. 그것을 빼먹으면 시트가 그만큼 어긋난다.
 */

/** 이보다 작은 축소는 키보드로 보지 않는다. 도구 막대·접근성 바가 이 범위에서 움직인다. */
const MIN_KEYBOARD_PX = 60

/** 「키보드가 없을 때」의 높이. 세션 동안 살아 있어야 시트를 여닫아도 기준이 흔들리지 않는다. */
let base = 0
/** 그 기준을 잰 화면 폭. 회전하면 기준을 버린다. */
let baseWidth = 0

function span(vv: VisualViewport): number {
  return vv.height + vv.offsetTop
}

export function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!active || !vv) return

    const read = () => {
      if (window.innerWidth !== baseWidth) {
        baseWidth = window.innerWidth
        base = 0
      }
      const now = span(vv)
      /* 🔴 최댓값을 계속 끌어올린다. 키보드가 닫히면 여기서 저절로 회복된다. */
      if (now > base) base = now
      const keyboard = Math.round(base - now)
      setInset(keyboard >= MIN_KEYBOARD_PX ? keyboard : 0)
    }

    read()
    vv.addEventListener('resize', read)
    vv.addEventListener('scroll', read)
    return () => {
      vv.removeEventListener('resize', read)
      vv.removeEventListener('scroll', read)
    }
  }, [active])

  /* 시트가 닫히는 동안에는 값이 남아 있어도 쓰지 않는다 — 닫힘 모션이 어긋난다. */
  return active ? inset : 0
}
