import { useContext, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/cn'
import { splitSentences } from '../lib/sentences'
import { useFocusTrap } from '../lib/useFocusTrap'
import { useOverlayTransition } from '../lib/useOverlayTransition'
import { OverlayRootContext } from './AppShell'

/** design 4a 원문 `modalPop .25s`. 닫힘 대기도 같은 값을 쓴다. */
const MODAL_MS = 250

interface ConfirmModalProps {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  /** true면 우 버튼 danger 그라디언트 (MD-03 · MD-04 · MD-07) */
  destructive?: boolean
  /** 실행 중 — 우 버튼 스피너 + 양쪽 비활성 */
  loading?: boolean
}

/**
 * PRD §6.4 확인 모달. design `4a`~`4f` · `20c` 원문.
 *
 * 규격에 없어 이번에 확정한 것 2건(보고서 §4):
 * 1. **초기 포커스는 좌측 `취소`.** 파괴적 버튼에 두면 Enter 오조작이 난다.
 * 2. **딤 탭·ESC는 `취소`와 같다.** 닫을 방법이 버튼뿐이면 키보드 사용자가 갇힌다(AC-09).
 *
 * 좌 버튼 라벨은 항상 `취소`다(MD-01~MD-07 전부). prop으로 열지 않는다.
 */
export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  destructive = false,
  loading = false,
}: ConfirmModalProps) {
  const overlayRoot = useContext(OverlayRootContext)
  const cardRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const bodyId = useId()
  const { mounted, shown } = useOverlayTransition(open, MODAL_MS)

  /* 마운트 전에는 ref가 비어 있다. `open`만 보고 걸면 첫 프레임에 아무것도 못 잡는다. */
  useFocusTrap({
    open: open && mounted,
    ref: cardRef,
    onEscape: onCancel,
    initialFocus: cancelRef,
  })

  if (!mounted || !overlayRoot) return null

  return createPortal(
    <>
      <div
        className={cn('dim', shown && 'dim-open')}
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        ref={cardRef}
        className={cn('modal', shown && 'modal-open')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
      >
        <div id={titleId} className="modal-title">
          {title}
        </div>
        {/* 🔴 W-21 P-8 ② — 본문을 마침표 기준으로 나눠 **줄마다 한 문장**으로 그린다.
            문자열은 그대로다(`lib/sentences.ts` 주석). 한 문장이면 줄이 하나라
            기존 6개 본문 중 3개(`거절할까요?`·`로그아웃할까요?`·양도 비-강등)는 computed가 안 바뀐다. */}
        <div id={bodyId} className="modal-body">
          {splitSentences(body).map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </div>
        <div className="modal-actions">
          <button
            ref={cancelRef}
            type="button"
            className="mbtn mbtn-line"
            onClick={onCancel}
            disabled={loading}
          >
            취소
          </button>
          <button
            type="button"
            className={cn('mbtn', destructive ? 'mbtn-danger' : 'mbtn-fill')}
            onClick={onConfirm}
            disabled={loading}
            aria-busy={loading || undefined}
            /* 실행 중에는 라벨이 스피너로 바뀐다. 이름은 여기서 유지한다. */
            aria-label={confirmLabel}
          >
            {loading ? (
              /* `.ff-spin`·`.btnp-spin`이 쓰는 spin 키프레임을 그대로 재사용한다. */
              <span className="btnp-spin" aria-hidden="true" />
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </>,
    overlayRoot,
  )
}
