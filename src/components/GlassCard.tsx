import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

interface GlassCardProps {
  children: ReactNode
  radius?: 24 | 22 | 20 | 18
  /** ms. 주면 `rise` 등장 모션을 적용한다. 0도 유효한 값이다. */
  riseDelay?: number
  className?: string
}

/* Tailwind v4 스캐너는 소스에 적힌 문자열만 찾는다. `rounded-${radius}`로
   조립하면 유틸리티가 생성되지 않으므로 정적 표를 둔다. */
const RADIUS: Record<NonNullable<GlassCardProps['radius']>, string> = {
  24: 'rounded-24',
  22: 'rounded-22',
  20: 'rounded-20',
  18: 'rounded-18',
}

/**
 * PRD §7.3 `glass`. padding은 화면마다 달라 className으로 받는다.
 * 배경 장식(오라 블롭)은 AppShell 스테이지가 소유한다. 여기서 또 깔지 않는다.
 */
export function GlassCard({ children, radius = 20, riseDelay, className }: GlassCardProps) {
  const rise = riseDelay !== undefined
  return (
    <div
      className={cn('glass', RADIUS[radius], rise && 'rise', className)}
      style={rise ? ({ '--rise-delay': `${riseDelay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  )
}
