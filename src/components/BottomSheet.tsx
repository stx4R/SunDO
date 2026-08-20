import { useContext, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/cn'
import { useFocusTrap } from '../lib/useFocusTrap'
import { useOverlayTransition } from '../lib/useOverlayTransition'
import { OverlayRootContext } from './AppShell'

/** §7.4 시트 모션 0.38s. 닫힘 대기도 같은 값을 쓴다. */
const SHEET_MS = 380

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  /** 있으면 그랩 핸들 아래 19px/700 제목. `aria-labelledby`로 연결된다. */
  title?: string
  children: ReactNode
}

/**
 * PRD §6.4 바텀시트. **껍데기만이다** — 내용물(S6 기록 작성·액션 시트)은 W-09다.
 *
 * 딤 탭·ESC로 닫히고, 열린 동안 포커스를 가두며, 닫을 때 트리거로 되돌린다(§15.3).
 * `popstate` 연동(N-02)은 W-05다. 드래그로 닫기는 규격에 없다.
 */
export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const overlayRoot = useContext(OverlayRootContext)
  const sheetRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const { mounted, shown } = useOverlayTransition(open, SHEET_MS)

  /* 마운트 전에는 ref가 비어 있다. `open`만 보고 걸면 첫 프레임에 아무것도 못 잡는다. */
  useFocusTrap({ open: open && mounted, ref: sheetRef, onEscape: onClose })

  if (!mounted || !overlayRoot) return null

  return createPortal(
    <>
      <div
        className={cn('dim', shown && 'dim-open')}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        className={cn('sheet', shown && 'sheet-open')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        /* 포커스 가능한 자식이 없는 시트도 있다. 그때는 컨테이너가 받는다. */
        tabIndex={-1}
      >
        <div className="sheet-handle" aria-hidden="true" />
        {title && (
          <div id={titleId} className="sheet-title">
            {title}
          </div>
        )}
        {children}
      </div>
    </>,
    overlayRoot,
  )
}
