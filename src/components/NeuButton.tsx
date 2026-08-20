import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

interface NeuButtonProps {
  children: ReactNode
  onClick?: () => void
  radius?: 22 | 20
  disabled?: boolean
  className?: string
}

const RADIUS: Record<NonNullable<NeuButtonProps['radius']>, string> = {
  22: 'rounded-22',
  20: 'rounded-20',
}

/**
 * PRD §7.3 `neu`. 학년 버튼(22) · 반 버튼(20) · 코드 재발급 버튼.
 * `:active`(inset 반전 + scale 0.98)는 CSS가 이미 갖고 있다.
 */
export function NeuButton({
  children,
  onClick,
  radius = 22,
  disabled = false,
  className,
}: NeuButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn('neu', RADIUS[radius], disabled && 'opacity-45', className)}
    >
      {children}
    </button>
  )
}
