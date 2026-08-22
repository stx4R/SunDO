import type { MouseEvent, ReactNode } from 'react'
import { cn } from '../lib/cn'

interface NeuButtonProps {
  children: ReactNode
  /**
   * W-10 — `sparkle`이 탭 **좌표**를 쓰므로 이벤트를 넘긴다(design `spawnSpark(x, y)`).
   * 인자를 **넓히기만** 하는 변경이라 기존 호출부는 그대로 둔다.
   */
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
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
      /* 네이티브 `disabled`만으로도 AT에 전달되지만, PRD §15.3·§8.2.6이
         `aria-disabled="true"`를 명시한다. 둘을 함께 두는 것은 무해하다. */
      aria-disabled={disabled || undefined}
      className={cn('neu', RADIUS[radius], disabled && 'opacity-45', className)}
    >
      {children}
    </button>
  )
}
