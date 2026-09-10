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

    /**
     * 🔴 **W-25 A-2 — `preventScroll: true`가 「시트가 위에서 내려오는」 버그의 수리다.**
     *
     * 이 효과는 시트가 아직 `translateY(110%)`, 즉 **스테이지 밖 아래**에 있을 때 돈다
     * (`useOverlayTransition`이 마운트 다음 프레임에야 `shown`을 켠다). 그 상태에서
     * `focus()`를 부르면 브라우저가 「포커스 대상을 보이게」 하려고 **조상 스크롤
     * 컨테이너를 스크롤한다.** 스테이지는 `overflow: hidden`이라 눈에 안 보이지만
     * **프로그램적으로는 스크롤된다** — 변형된 시트가 스테이지의 스크롤 오버플로에
     * 그대로 잡히기 때문이다.
     *
     * 🔬 실측(수리 전) — 탭하는 순간 `stage.scrollTop`이 **0 → 301.5px**로 뛰고,
     *    시트의 뷰포트 좌표는 0.38s 내내 **404px에 붙박이**였다(= 슬라이드가 아예 없다).
     *    대신 **본문이 −179px에서 123px로 흘러내렸다.** 화면에서는 「위젯이 위에 떴다가
     *    아래로 자리 잡는」 것으로 보인다 — 실제로 움직인 것은 배경이었다.
     * 🔬 실측(수리 후) — `scrollTop`은 0에 머물고 본문은 123px에 붙박이,
     *    시트만 705 → 404px로 미끄러진다. 포커스는 그대로 첫 항목에 간다.
     *
     * ⚠ **아래 Tab 처리의 `focus()`에는 붙이지 않는다.** 그쪽은 시트가 이미 제자리에
     *   있을 때 도는 키보드 이동이고, 거기서 스크롤을 막으면 `.sheet-body` 밖으로
     *   나간 항목이 화면 밖에 남는다(§15.3 역행).
     */
    const first = initialRef.current?.current ?? items()[0] ?? container
    first.focus({ preventScroll: true })
    /* 지정한 요소가 비활성이면 focus()가 아무 일도 하지 않는다(모달 loading이 그렇다).
       그대로 두면 포커스가 트리거에 남아 트랩 밖이 된다. */
    if (!container.contains(document.activeElement)) {
      ;(items()[0] ?? container).focus({ preventScroll: true })
    }

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
