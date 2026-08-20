import { createContext, useState, type ReactNode } from 'react'

interface AppShellProps {
  children: ReactNode
  /** true면 상단 패딩 +34px, 스크롤 하단 여백 120px (PRD §7.5) */
  hasDock?: boolean
  /** 관리 화면 130px 같은 예외. 기본값은 hasDock에서 결정한다. */
  bottomGap?: number
}

/**
 * 오버레이(토스트·시트·모달)가 붙을 DOM 노드. 스테이지 안에 있어야 430px 밖
 * 화면에서도 스테이지를 벗어나지 않는다(W-03B §4-9와 같은 이유).
 *
 * 첫 렌더에는 `null`이다 — ref 콜백이 돌아야 노드가 생긴다.
 * 구독자는 `null`이면 아무것도 그리지 않고 다음 렌더를 기다린다.
 * `document.getElementById`로 찾지 마라. 첫 렌더에 없다.
 */
export const OverlayRootContext = createContext<HTMLElement | null>(null)

/**
 * 하단 독이 붙을 DOM 노드. 오버레이 루트와 같은 이유로 필요하다 —
 * `.dock`은 `position: absolute`라 **스테이지**를 기준으로 잡혀야 하는데,
 * 스크롤 영역 안에 두면 본문과 함께 스크롤된다(`.dock` 주석 참조).
 *
 * 오버레이 루트를 대신 쓰지 않는다. 루트가 `pointer-events: none`이라 탭이 죽고,
 * 독은 z-30으로 딤(z-40) **아래**에 있어야 하므로 오버레이가 아니다.
 *
 * 첫 렌더는 `null`이다. 구독자는 그때 아무것도 그리지 않고 다음 렌더를 기다린다.
 */
export const DockRootContext = createContext<HTMLElement | null>(null)

/**
 * PRD §7.5 레이아웃 규격.
 * 스테이지는 430px 고정 폭 · 100dvh · overflow hidden이고, 세로 스크롤은 그 안쪽
 * 영역이 담당한다. 오라 블롭은 스크롤 영역 바깥에 있어 스크롤과 무관하게 고정된다.
 */
export function AppShell({ children, hasDock = false, bottomGap }: AppShellProps) {
  const topGap = hasDock ? 34 : 26
  const bottom = bottomGap ?? (hasDock ? 120 : 0)

  const [overlayEl, setOverlayEl] = useState<HTMLElement | null>(null)
  const [dockEl, setDockEl] = useState<HTMLElement | null>(null)

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

        <DockRootContext.Provider value={dockEl}>
          <OverlayRootContext.Provider value={overlayEl}>
            <div
              className="relative h-full overflow-y-auto"
              style={{
                padding: `calc(env(safe-area-inset-top) + ${topGap}px) 22px ${bottom}px`,
              }}
            >
              {children}
            </div>

            {/* 독 슬롯. 스크롤 영역의 형제이며 스타일이 없다(높이 0).
                `position: static`이라 안에 들어온 `.dock`의 absolute는
                스테이지를 기준으로 잡힌다 — 이게 이 노드의 존재 이유다. */}
            <div ref={setDockEl} />

            {/* 스크롤 영역의 형제다. 안에 두면 시트가 본문과 함께 스크롤된다.
                루트 자체는 클릭을 통과시키고 딤·시트·모달만 되돌린다. */}
            <div ref={setOverlayEl} className="ovl-root" />
          </OverlayRootContext.Provider>
        </DockRootContext.Provider>
      </div>
    </div>
  )
}
