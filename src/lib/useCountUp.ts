import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * PRD §7.4 CountUp — **0.85s · `easeOutCubic` = `1-(1-p)³` · `IntersectionObserver`
 * threshold 0.3 · 1회만.** §12.2 표시 규칙의 애니메이션 행이 같은 값을 반복한다.
 *
 * design 프로토타입의 `runCount()`가 정본이고 값이 전부 일치한다 —
 * `dur = 850` · `Math.round(t * (1 - Math.pow(1 - p, 3)))` · `requestAnimationFrame`.
 *
 * **타이머 누적으로 만들지 마라.** `setInterval`로 프레임을 세면 프레임 드롭에서
 * 0.85s가 어긋난다. 경과 시간을 매 프레임 **다시 계산**한다.
 *
 * `prefers-reduced-motion: reduce`에서는 최종값을 즉시 표시한다(§7.4 마지막 문단).
 */

const DURATION_MS = 850
const THRESHOLD = 0.3

function prefersReduced(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

interface CountUpResult {
  /** 표시할 값. `target`이 `null`이면 `null`(스켈레톤·`-`가 그 자리를 쓴다) */
  value: number | null
  /** 관찰 대상에 붙인다. 이 노드가 30% 보이면 1회 발동한다 */
  ref: (node: HTMLElement | null) => void
}

/**
 * @param target 최종값. `null`이면 돌지 않는다(로딩·조회 실패).
 * @param runKey 값이 같아도 다시 돌려야 할 때 증가시킨다.
 *   T-05(당겨서 새로고침)가 쓴다 — 재조회 결과가 직전과 같은 수라도 CountUp은 다시 돌아야 한다.
 *   T-02(탭 재진입)는 화면이 통째로 다시 마운트되므로 이 값이 필요 없다.
 */
export function useCountUp(target: number | null, runKey = 0): CountUpResult {
  const [value, setValue] = useState<number | null>(null)
  const [seen, setSeen] = useState(false)

  /* 관찰은 **1회**다(§7.4). 발동 후 `unobserve`하고 다시 붙이지 않는다 —
     design `scanCounts()`가 `data-cd` 표식으로 같은 일을 한다. */
  const observerRef = useRef<IntersectionObserver | null>(null)
  const ref = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') {
      /* 관찰자가 없는 환경에서는 애니메이션을 건너뛰지 않고 즉시 발동시킨다.
         값이 안 보이는 것보다 애니메이션이 없는 편이 낫다. */
      setSeen(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          io.unobserve(entry.target)
          setSeen(true)
        }
      },
      { threshold: THRESHOLD },
    )
    io.observe(node)
    observerRef.current = io
  }, [])

  useEffect(() => () => observerRef.current?.disconnect(), [])

  useEffect(() => {
    if (target === null) {
      setValue(null)
      return
    }
    if (!seen) return

    if (prefersReduced()) {
      setValue(target)
      return
    }

    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / DURATION_MS)
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    /* 첫 프레임 전에 0을 세운다 — T-02의 「카운터를 0으로 리셋한 뒤 재실행」(§8.3.4). */
    setValue(0)
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, seen, runKey])

  return { value, ref }
}
