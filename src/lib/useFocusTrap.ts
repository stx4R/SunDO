import { useEffect, useRef, type RefObject } from 'react'

interface FocusTrapOptions {
  /** 열려 있는 동안만 가둔다. false가 되면 트리거로 포커스를 되돌린다. */
  open: boolean
  /** 가둘 컨테이너. 포커스 가능한 자식이 없을 때를 대비해 `tabIndex={-1}`을 준다. */
  ref: RefObject<HTMLElement | null>
  /** ESC로 닫기(AC-09). 키 처리가 같은 리스너 하나로 끝나 여기서 함께 받는다. */
  onEscape?: () => void
  /** 열릴 때 포커스를 받을 요소. 없으면 컨테이너 안 첫 포커스 가능 요소. */
  initialFocus?: RefObject<HTMLElement | null>
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * PRD §15.3 — 바텀시트·확인 모달이 공유하는 포커스 트랩.
 * 열릴 때 안쪽으로 포커스를 옮기고, Tab이 컨테이너를 벗어나지 않게 하고,
 * **닫을 때 트리거 요소로 되돌린다.**
 */
export function useFocusTrap({ open, ref, onEscape, initialFocus }: FocusTrapOptions) {
  /* 콜백·ref 객체가 렌더마다 새로 만들어져도 아래 효과가 다시 돌면 안 된다.
     다시 돌면 포커스가 트리거로 돌아갔다가 되돌아와 깜빡인다.
     최신값은 ref에 담아 넘기되, 렌더 중에 쓰지 않도록 효과에서 갱신한다.
     이 효과가 먼저 선언돼 있어야 같은 커밋에서 트랩보다 먼저 돈다. */
  const escapeRef = useRef(onEscape)
  const initialRef = useRef(initialFocus)
  const containerRef = useRef(ref)

  useEffect(() => {
    escapeRef.current = onEscape
    initialRef.current = initialFocus
    containerRef.current = ref
  })

  useEffect(() => {
    if (!open) return
    const container = containerRef.current.current
    if (!container) return

    const trigger = document.activeElement as HTMLElement | null
    const items = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0,
      )

    const first = initialRef.current?.current ?? items()[0] ?? container
    first.focus()
    /* 지정한 요소가 비활성이면 focus()가 아무 일도 하지 않는다(모달 loading이 그렇다).
       그대로 두면 포커스가 트리거에 남아 트랩 밖이 된다. */
    if (!container.contains(document.activeElement)) (items()[0] ?? container).focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        escapeRef.current?.()
        return
      }
      if (e.key !== 'Tab') return

      const list = items()
      if (list.length === 0) {
        e.preventDefault()
        container.focus()
        return
      }

      const head = list[0]
      const tail = list[list.length - 1]
      const active = document.activeElement

      if (e.shiftKey && (active === head || !container.contains(active))) {
        e.preventDefault()
        tail.focus()
      } else if (!e.shiftKey && (active === tail || !container.contains(active))) {
        e.preventDefault()
        head.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      /* 트리거가 사라졌을 수도 있다. 그때는 아무 데도 옮기지 않는다. */
      if (trigger && document.contains(trigger)) trigger.focus()
    }
  }, [open])
}
