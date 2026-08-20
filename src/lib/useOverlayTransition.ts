import { useEffect, useState } from 'react'

/**
 * 열림/닫힘 양쪽에 전환을 걸기 위한 마운트 제어. 바텀시트·확인 모달이 공유한다.
 *
 * `open`이 false가 되는 순간 언마운트하면 닫힘 모션이 보이지 않는다.
 * 시각 상태(`shown`)를 먼저 끄고, 전환이 끝난 뒤에 DOM에서 뺀다.
 * reduce에서는 CSS 지속시간이 0.01s로 줄어드므로 대기도 함께 줄인다.
 */
export function useOverlayTransition(open: boolean, durationMs: number) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(open)

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    setShown(false)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => setMounted(false), reduce ? 10 : durationMs)
    return () => window.clearTimeout(timer)
  }, [open, durationMs])

  /* 마운트된 다음 프레임에 켜야 전환이 실제로 걸린다.
     같은 프레임에 최종 상태로 그리면 브라우저가 보간할 시작값을 못 잡는다. */
  useEffect(() => {
    if (!open || !mounted) return
    const raf = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(raf)
  }, [open, mounted])

  return { mounted, shown }
}
