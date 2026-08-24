/**
 * 업데이트 배너 — design `10c` · PRD §18.2.
 *
 * 「새 SW 감지 시 하단 배너 `새 버전이 있습니다 · 새로고침` 노출, 탭 시 `skipWaiting` 후 리로드」.
 * 감지와 `skipWaiting` 전송은 `lib/pwa.ts`의 `useServiceWorkerUpdate()`가 소유한다 —
 * 이 파일은 그 결과만 그린다.
 *
 * **마운트는 `DockLayout`이 한다.** 화면에서 직접 그리지 마라 — 전역 1개이고,
 * 스테이지 직계로 나가야 `position: absolute`가 스테이지를 기준으로 잡힌다(`.dock`과 같은 이유).
 *
 * ⚠ 리로드를 여기서 부르지 마라. `controllerchange`를 기다려야 **새 워커가 제어권을
 * 잡은 뒤에** 새로고침된다. 먼저 리로드하면 옛 워커가 그대로 응답한다.
 */

/* §18.2 원문. design `10c`도 같은 문자열이다. */
const MESSAGE = '새 버전이 있습니다'
const ACTION = '새로고침'

export function UpdateBanner({ onApply }: { onApply: () => void }) {
  return (
    <div className="pwab pwab-upd" role="status" aria-live="polite">
      {/* design `10c` 원문 — 원 안의 위쪽 화살표. */}
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className="pwab-ico" aria-hidden="true">
        <circle cx="10" cy="10" r="8.2" stroke="#1F5138" strokeWidth="2" />
        <path
          d="M10 13.8V6.8M6.8 9.6L10 6.4l3.2 3.2"
          stroke="#1F5138"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="pwab-msg">{MESSAGE}</span>
      <button type="button" className="pwab-act" onClick={onApply}>
        {ACTION}
      </button>
    </div>
  )
}
