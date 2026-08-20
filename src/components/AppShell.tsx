import type { ReactNode } from 'react'

interface AppShellProps {
  children: ReactNode
  /** true면 상단 패딩 +34px, 스크롤 하단 여백 120px (PRD §7.5) */
  hasDock?: boolean
  /** 관리 화면 130px 같은 예외. 기본값은 hasDock에서 결정한다. */
  bottomGap?: number
}

/**
 * PRD §7.5 레이아웃 규격.
 * 스테이지는 430px 고정 폭 · 100dvh · overflow hidden이고, 세로 스크롤은 그 안쪽
 * 영역이 담당한다. 오라 블롭은 스크롤 영역 바깥에 있어 스크롤과 무관하게 고정된다.
 */
export function AppShell({ children, hasDock = false, bottomGap }: AppShellProps) {
  const topGap = hasDock ? 34 : 26
  const bottom = bottomGap ?? (hasDock ? 120 : 0)

  return (
    // 430px 초과 화면에서 좌우를 --bg-outer로 채운다.
    <div className="min-h-dvh bg-sundo-bg-outer">
      <div
        className="relative mx-auto h-dvh max-w-[430px] overflow-hidden"
        style={{
          background: 'var(--gradient-stage)',
          // §7.1에 없는 값이라 인라인으로 둔다(보고서 §6).
          boxShadow: '0 0 60px rgba(20,53,38,0.18)',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden"
          aria-hidden="true"
        >
          <div className="aura aura-1" aria-hidden="true" />
          <div className="aura aura-2" aria-hidden="true" />
          <div className="aura aura-3" aria-hidden="true" />
        </div>

        <div
          className="relative h-full overflow-y-auto"
          style={{
            padding: `calc(env(safe-area-inset-top) + ${topGap}px) 22px ${bottom}px`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
