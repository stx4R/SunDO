import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

interface ChipProps {
  children: ReactNode
  className?: string
}

interface FilterChipProps {
  label: string
  active: boolean
  onClick: () => void
}

/** PRD §7.3 `chip` — 인원 수 · 상태 표시 · 역할 배지. 정적 표시 전용이다. */
export function Chip({ children, className }: ChipProps) {
  return <span className={cn('chip', className)}>{children}</span>
}

/**
 * PRD §7.3 `fchip` — S7 기록 조회 필터. `Chip`과 역할이 달라 분리했다(지시서 §6.4).
 * AC-04: 활성은 배경 반전 + 굵기 700 이중 표시다. 굵기는 `.fchip-on`이 갖고 있다.
 * 단일 선택이지만 `radiogroup` 부모를 강제하지 않도록 `aria-pressed`를 쓴다.
 */
export function FilterChip({ label, active, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn('fchip', active && 'fchip-on')}
    >
      {label}
    </button>
  )
}
