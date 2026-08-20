import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { OverlayRootContext } from './AppShell'
import { ToastCheckIcon } from './icons'

/** §6.4 — 2.2초 후 자동 소멸. */
const TOAST_MS = 2200

interface ToastState {
  /** 교체마다 올라간다. key로 쓰면 같은 문구여도 진입 모션이 다시 돈다. */
  seq: number
  message: string
}

const ToastContext = createContext<((message: string) => void) | null>(null)

/**
 * PRD §6.4 토스트. **타이머와 교체 규칙을 이 컴포넌트가 소유한다** —
 * 화면마다 `setTimeout`을 다시 짜면 2.2초와 교체 규칙이 갈라진다.
 *
 * 큐는 만들지 않는다. 새 메시지는 기존 것을 **즉시 교체**한다(§6.4 명시).
 * `AppShell` 안쪽에 두어야 한다. 오버레이 루트가 필요하다.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const seqRef = useRef(0)
  const timerRef = useRef<number | undefined>(undefined)
  const overlayRoot = useContext(OverlayRootContext)

  const show = useCallback((message: string) => {
    window.clearTimeout(timerRef.current)
    seqRef.current += 1
    setToast({ seq: seqRef.current, message })
    timerRef.current = window.setTimeout(() => setToast(null), TOAST_MS)
  }, [])

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast &&
        overlayRoot &&
        createPortal(
          <div key={toast.seq} className="toast" role="status" aria-live="polite">
            <ToastCheckIcon />
            <span className="toast-text">{toast.message}</span>
          </div>,
          overlayRoot,
        )}
    </ToastContext.Provider>
  )
}

/**
 * 문구는 호출부가 넘긴다(§8.10.1 TS-01~TS-21). 컴포넌트에 하드코딩하지 마라.
 */
export function useToast() {
  const show = useContext(ToastContext)
  if (!show) throw new Error('useToast는 ToastProvider 안에서만 쓸 수 있다')
  return show
}
