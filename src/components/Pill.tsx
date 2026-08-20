import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

interface PillProps {
  children: ReactNode
  variant: 'soft' | 'fill' | 'line'
  onClick?: () => void
}

const VARIANT: Record<PillProps['variant'], string> = {
  soft: 'pill-soft',
  fill: 'pill-fill',
  line: 'pill-line',
}

/**
 * PRD §7.3 `pill` — 승인 · 거절 · 양도.
 * `.pill-fill`에 그림자가 없는 것은 W-03A §0.3-2에서 확정된 의도된 차이다.
 * 눌림 `scale(0.95)`는 §7.4의 `0.92~0.95` 범위 상단으로 확정했다(지시서 §6.5).
 */
export function Pill({ children, variant, onClick }: PillProps) {
  return (
    <button type="button" onClick={onClick} className={cn('pill', VARIANT[variant])}>
      {children}
    </button>
  )
}
