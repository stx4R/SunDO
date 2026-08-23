import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

interface PillProps {
  children: ReactNode
  variant: 'soft' | 'fill' | 'line'
  onClick?: () => void
  /** W-15A — 오프라인·처리 중 잠금(§8.8.3 #11·#12). 인자를 **넓히기만** 하는 변경이다. */
  disabled?: boolean
  /**
   * W-15A — 행이 여러 개라 `승인`이라는 라벨만으로는 무엇을 승인하는지 알 수 없다(§3.9).
   * 호출부가 `{이름} 가입 승인` 형태로 넘긴다.
   */
  ariaLabel?: string
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
export function Pill({ children, variant, onClick, disabled = false, ariaLabel }: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      aria-label={ariaLabel}
      className={cn('pill', VARIANT[variant], disabled && 'opacity-45')}
    >
      {children}
    </button>
  )
}
