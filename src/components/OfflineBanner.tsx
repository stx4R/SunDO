import { useContext } from 'react'
import { createPortal } from 'react-dom'
import { OverlayRootContext } from './AppShell'

/**
 * PRD §6.4 오프라인 배너(z-index 70) + design `12d`.
 *
 * **콘텐츠를 밀어내지 않는다.** design 12d는 흐름 안에서 밀어내지만 §6.4가
 * `상단 고정`으로 규정하므로 충돌 해소 순서 1번(PRD 우선)을 적용했다.
 * 밀어내기는 `AppShell`에 슬롯을 하나 더 요구하는데, S1은 세로 중앙 정렬이라
 * 상단에 여유가 있어 겹침이 문제가 되지 않는다.
 * **독이 있는 화면(W-08 이후)에서 H1과 겹치면 그때 재판단한다.**
 *
 * 버튼·닫기를 붙이지 마라. `.ovl-root`가 `pointer-events: none`인 것을
 * 되돌리지 않는 전제가 "이 배너에는 상호작용이 없다"이다.
 */
export function OfflineBanner() {
  const overlayRoot = useContext(OverlayRootContext)
  if (!overlayRoot) return null

  return createPortal(
    <div className="ofb" role="status" aria-live="polite">
      {/* design 12d 원문 — 사선이 그어진 와이파이. */}
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="flex-none" aria-hidden="true">
        <path
          d="M2.6 7.4a11 11 0 0114.8 0M5.4 10.6a7.2 7.2 0 019.2 0M8 13.8a3.3 3.3 0 014 0"
          stroke="#fff"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <path d="M3.4 3.2l13.2 13.6" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
      <span className="text-label font-bold text-white">
        오프라인 상태입니다. 기록은 연결 시 자동 전송됩니다
      </span>
    </div>,
    overlayRoot,
  )
}
