import { useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router'
import { cn } from '../lib/cn'
import { useFocusTrap } from '../lib/useFocusTrap'
import { useOverlayTransition } from '../lib/useOverlayTransition'
import { OverlayRootContext } from './AppShell'

/** §7.4 시트 모션 0.38s. 닫힘 대기도 같은 값을 쓴다. */
const SHEET_MS = 380

/**
 * 아래 스와이프 닫힘 임계값(px). §8.6.2 #2·T-08이 「드래그로 아래로 스와이프 시 닫힘」을
 * 규정하지만 **거리는 규격에도 design에도 없다**(보고서 §4). 시트 높이의 비율로 잡으면
 * 내용이 짧은 시트에서 조금만 끌어도 닫히므로 절대값으로 둔다.
 */
const SWIPE_CLOSE_PX = 80

/** `location.state`에 얹는 표식의 키. 라우터 상태를 통째로 쓰지 않고 이 키만 본다. */
interface SheetState {
  sheet?: string
}

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  /** 있으면 그랩 핸들 아래 19px/700 제목. `aria-labelledby`로 연결된다. */
  title?: string
  /**
   * 닫힘 모션까지 끝나 DOM에서 빠진 뒤 1회. `onClose`(닫기 **요청**)와 다르다.
   * 호출부가 시트가 떠 있는 동안 잠가 둔 것을 푸는 지점이다(S5 행 탭 빗장 — W-12 §3.6).
   */
  onClosed?: () => void
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
export function BottomSheet({ open, onClose, title, onClosed, children }: BottomSheetProps) {
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

  /* 닫힘 **완료** 통지. 콜백이 렌더마다 새로 만들어져도 효과가 다시 돌면 안 된다. */
  const closedRef = useRef(onClosed)
  useEffect(() => {
    closedRef.current = onClosed
  })
  const wasMountedRef = useRef(mounted)
  useEffect(() => {
    if (wasMountedRef.current && !mounted) closedRef.current?.()
    wasMountedRef.current = mounted
  }, [mounted])

  /* ---- 아래 스와이프 닫기 (§8.6.2 #2 · T-08) ----
     그랩 핸들에서만 시작한다. 시트 전체에 걸면 `기타` 입력의 캐럿 드래그·
     세그먼트 탭과 뒤엉킨다. 손가락을 따라가는 동안에는 전이를 끄고(`none`),
     놓는 순간 다시 켜서 CSS가 마무리하게 둔다. */
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragStartRef = useRef<{ pointerId: number; y: number } | null>(null)

  /* 닫힘이 시작되면 인라인 transform을 걷어 CSS의 `translateY(110%)`가 이긴다.
     손을 뗀 위치에서 이어져 내려간다. */
  useEffect(() => {
    if (shown) return
    setDragY(0)
    setDragging(false)
    dragStartRef.current = null
  }, [shown])

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current) return
    dragStartRef.current = { pointerId: e.pointerId, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current
    if (!start || start.pointerId !== e.pointerId) return
    /* 위로 끄는 동작은 무시한다. 시트가 화면 밖으로 솟아오르면 안 된다. */
    setDragY(Math.max(0, e.clientY - start.y))
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current
    if (!start || start.pointerId !== e.pointerId) return
    dragStartRef.current = null
    setDragging(false)
    if (e.clientY - start.y >= SWIPE_CLOSE_PX) {
      /* 🔴 딤 탭·ESC와 **같은 경로**다. 여기서 직접 닫지 마라(§3.5). */
      requestClose()
      return
    }
    setDragY(0)
  }

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
        style={
          dragY > 0
            ? { transform: `translateY(${dragY}px)`, transition: dragging ? 'none' : undefined }
            : undefined
        }
      >
        <div
          className="sheet-handle"
          aria-hidden="true"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
        {title && (
          <div id={titleId} className="sheet-title">
            {title}
          </div>
        )}
        {/* 🔴 **W-23 A-5(e)(B-05) — 내용물이 스테이지보다 길면 시트가 위로 자라 잘렸다.**
            `.sheet`가 `max-height` + flex 컬럼이 되고 본문만 스크롤한다. 그랩 핸들과 제목은
            위에 고정된다 — 스크롤과 함께 사라지면 아래 스와이프 닫기의 시작점이 사라진다.
            ⚠ 드래그 핸들러는 아래 `.sheet-handle` **하나에만** 붙어 있어 본문 스크롤과
            충돌하지 않는다(W-12 §4-2 계약이 이미 그렇게 만들어 두었다). */}
        <div className="sheet-body">{children}</div>
      </div>
    </>,
    overlayRoot,
  )
}
