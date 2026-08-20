import { useContext, useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router'
import { cn } from '../lib/cn'
import { useFocusTrap } from '../lib/useFocusTrap'
import { useOverlayTransition } from '../lib/useOverlayTransition'
import { OverlayRootContext } from './AppShell'

/** §7.4 시트 모션 0.38s. 닫힘 대기도 같은 값을 쓴다. */
const SHEET_MS = 380

/** `location.state`에 얹는 표식의 키. 라우터 상태를 통째로 쓰지 않고 이 키만 본다. */
interface SheetState {
  sheet?: string
}

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
 *
 * **N-02 히스토리 연동(W-05)**: 시트가 열린 상태의 뒤로가기는 화면을 옮기지 않고
 * 시트만 닫는다. `window.history.pushState`를 **직접 쓰지 않는다** — React Router가
 * history를 소유하고 있어 내부 상태와 어긋난다. 같은 경로에 `state`만 얹어
 * 한 단계를 쌓고, 그 표식이 사라지면 닫는다.
 */
export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const overlayRoot = useContext(OverlayRootContext)
  const sheetRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const { mounted, shown } = useOverlayTransition(open, SHEET_MS)

  const navigate = useNavigate()
  const location = useLocation()

  /* 시트마다 다른 표식이어야 한 화면에 시트가 둘일 때 서로의 엔트리를 닫지 않는다.
     `useId`는 인스턴스마다 다르고 리렌더에도 그대로다. */
  const sheetId = useId()
  const hasEntry = (location.state as SheetState | null)?.sheet === sheetId

  /* 우리가 쌓은 엔트리인지 기억한다. 없으면 되감을 때 남의 엔트리를 먹는다. */
  const pushedRef = useRef(false)
  /* 뒤로가기로 닫은 직후에는 `open`이 아직 true다. 이 한 프레임에 다시 쌓으면
     시트가 되살아나 뒤로가기가 영영 먹히지 않는다. */
  const backClosedRef = useRef(false)

  useEffect(() => {
    if (!open) {
      backClosedRef.current = false
      if (hasEntry && pushedRef.current) {
        /* 호출부가 `open`을 직접 내렸다(저장 완료 등). 쌓아 둔 엔트리를 되감지 않으면
           스택에 쓰레기가 남아 다음 뒤로가기가 한 번 헛돈다. */
        pushedRef.current = false
        navigate(-1)
      }
      return
    }

    if (hasEntry) return

    if (pushedRef.current) {
      /* 뒤로가기로 표식이 사라졌다. 화면은 그대로 두고 시트만 닫는다(N-02). */
      pushedRef.current = false
      backClosedRef.current = true
      onClose()
      return
    }

    if (!backClosedRef.current) {
      /* 열림 — 같은 경로에 `state`만 얹어 한 단계를 쌓는다. */
      pushedRef.current = true
      navigate(location.pathname + location.search, {
        state: { ...(location.state as object | null), sheet: sheetId },
      })
    }
  }, [open, hasEntry, sheetId, navigate, location, onClose])

  /**
   * 딤 탭·ESC의 종착지. `onClose`를 바로 부르지 않고 히스토리를 되감는다 —
   * 그러면 표식이 사라지고 위 효과의 두 번째 분기가 실제 닫기를 맡는다.
   * 닫는 경로를 하나로 모아야 뒤로가기와 딤 탭이 같은 결과를 낸다.
   */
  const requestClose = () => {
    if (pushedRef.current) navigate(-1)
    else onClose()
  }

  /* 마운트 전에는 ref가 비어 있다. `open`만 보고 걸면 첫 프레임에 아무것도 못 잡는다. */
  useFocusTrap({ open: open && mounted, ref: sheetRef, onEscape: requestClose })

  if (!mounted || !overlayRoot) return null

  return createPortal(
    <>
      <div
        className={cn('dim', shown && 'dim-open')}
        onClick={requestClose}
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
