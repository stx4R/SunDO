import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

interface ChipProps {
  children: ReactNode
  className?: string
}

/** PRD §7.3 `chip` — 인원 수 · 상태 표시 · 역할 배지. 정적 표시 전용이다. */
export function Chip({ children, className }: ChipProps) {
  return <span className={cn('chip', className)}>{children}</span>
}

/* 🔴 **W-27 — `FilterChip`을 지웠다. `.fchip` CSS는 그대로다.**
   호출부가 0이었다. S7의 필터 칩은 `screens/Records.tsx`가 같은 마크업을 **인라인으로**
   직접 그리고 있어(§8.7.3 · W-24 A-3의 스크롤 되감기가 그 `onClick`에 붙어 있다)
   이 컴포넌트는 한 번도 렌더된 적이 없다.
   ⚠ **`.fchip`·`.fchip-on`을 CSS에서 지우지 마라** — 쓰는 쪽은 살아 있다. */
