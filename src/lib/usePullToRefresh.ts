import { useContext, useEffect, useRef } from 'react'
import { ScrollRootContext } from '../components/AppShell'

/**
 * T-05 「아래로 당기기 → 통계 재조회」(§8.3.4).
 *
 * **소유가 갈린다.** 스크롤 요소는 `AppShell`이 소유하고(W-09 §5) 새로고침 **정책**은
 * 화면이 소유한다(W-07 §6.1 — 화면마다 정책이 다르다). 그래서 `AppShell`은
 * `ScrollRootContext`로 노드만 노출하고, 임계값과 핸들러는 화면이 준다.
 * **`AppShell`에 `onRefresh` prop을 만들지 마라** — 여백 소유자에게 데이터 정책이 붙는다.
 *
 * 🔴 **`preventDefault`를 부르지 않는다.** §8.3.4 T-05의 애니메이션 열이 `—`이고
 * §7.4에 당김 인디케이터가 없다 — 따라올 시각 요소가 없으므로 기본 동작을 막을 이유가 없다.
 * 그래서 리스너를 전부 `passive`로 붙인다. iOS Safari의 바운스와 충돌하지 않고,
 * 임계값에 못 미친 제스처는 그냥 평범한 오버스크롤로 끝난다.
 *
 * 재조회 중 시각 피드백은 §8.3.5의 **로딩 상태(40px 스켈레톤)를 그대로 재사용**한다.
 */

/**
 * 발동 임계값(px).
 *
 * **design·PRD 어디에도 없는 값이다**(보고서에 신규 값으로 기록했다).
 * `scrollTop === 0`에서 시작한 아래 방향 제스처가 이만큼 넘어가야 재조회한다.
 * 시각 피드백이 없어 사용자가 당김의 진행도를 볼 수 없으므로, 우연한 오버스크롤과
 * 의도적인 당김을 가르되 과하게 크지 않은 값이어야 한다.
 */
const DEFAULT_THRESHOLD_PX = 70

export function usePullToRefresh(
  onRefresh: () => void,
  { threshold = DEFAULT_THRESHOLD_PX, enabled = true }: { threshold?: number; enabled?: boolean } = {},
): void {
  const scrollRoot = useContext(ScrollRootContext)

  /* 핸들러는 리스너 등록 후에도 최신 클로저를 봐야 한다. 매 렌더 재등록하지 않는다.
     **렌더 중에 `ref.current`를 쓰지 않는다** — 버려지는 렌더가 ref를 오염시킨다
     (동시 렌더링). 커밋된 렌더에서만 갱신되도록 의존성 없는 effect에 둔다. */
  const handlerRef = useRef(onRefresh)
  const enabledRef = useRef(enabled)
  useEffect(() => {
    handlerRef.current = onRefresh
    enabledRef.current = enabled
  })

  useEffect(() => {
    if (!scrollRoot) return

    /* `null`이면 「이 제스처는 당김이 아니다」. touchstart에서 맨 위였을 때만 세운다. */
    let startY: number | null = null
    let pulled = 0

    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0]
      /* 맨 위에서 시작한 제스처만 당김이다. 그 밖에서는 아무 것도 하지 않는다 —
         스크롤 도중 위로 되돌아와도 재조회가 걸리면 안 된다. */
      if (!touch || scrollRoot.scrollTop !== 0) {
        startY = null
        return
      }
      startY = touch.clientY
      pulled = 0
    }

    const onMove = (event: TouchEvent) => {
      if (startY === null) return
      const touch = event.touches[0]
      if (!touch) return
      const delta = touch.clientY - startY
      /* 위로 올리는 순간 당김이 아니다. 같은 제스처 안에서 되살리지 않는다. */
      if (delta < 0) {
        startY = null
        pulled = 0
        return
      }
      pulled = delta
    }

    const onEnd = () => {
      const fired = startY !== null && pulled >= threshold
      startY = null
      pulled = 0
      if (fired && enabledRef.current) handlerRef.current()
    }

    /* 전부 passive다. `preventDefault`를 부르지 않으므로 브라우저가 경고하지도,
       기본 스크롤이 막히지도 않는다. */
    const opts = { passive: true } as const
    scrollRoot.addEventListener('touchstart', onStart, opts)
    scrollRoot.addEventListener('touchmove', onMove, opts)
    scrollRoot.addEventListener('touchend', onEnd, opts)
    scrollRoot.addEventListener('touchcancel', onEnd, opts)
    return () => {
      scrollRoot.removeEventListener('touchstart', onStart)
      scrollRoot.removeEventListener('touchmove', onMove)
      scrollRoot.removeEventListener('touchend', onEnd)
      scrollRoot.removeEventListener('touchcancel', onEnd)
    }
  }, [scrollRoot, threshold])
}
