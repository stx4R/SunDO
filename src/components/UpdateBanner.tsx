/**
 * 업데이트 배너 — design `10c` · PRD §18.2.
 *
 * 「새 SW 감지 시 하단 배너 `새 버전이 있습니다 · 새로고침` 노출, 탭 시 `skipWaiting` 후 리로드」.
 * 감지와 `skipWaiting` 전송은 `lib/pwa.ts`의 `useServiceWorkerUpdate()`가 소유한다 —
 * 이 파일은 그 결과만 그린다.
 *
 * **마운트는 `router.tsx`의 `PwaBanners`가 한다**(W-30 — 옛 자리는 `DockLayout`이었다).
 * 화면에서 직접 그리지 마라 — 전역 1개이고, 스테이지 직계로 나가야
 * `position: absolute`가 스테이지를 기준으로 잡힌다(`.dock`과 같은 이유).
 *
 * 🔴 **`hasDock`은 좌표만 고른다.** design `10c`의 `bottom`은 **독 높이를 전제**한
 * 값 하나뿐이라, 독이 없는 화면(S1·S2·S2-1·정책)에서 쓸 좌표가 규격에 없었다 —
 * 그것이 W-19가 이 배너를 독 화면에 가둔 이유이고, 그 가둠이 W-29의 덫이 됐다.
 * 없던 좌표는 `.pwab-nodock`으로 정했다(독이 서던 자리에 그대로 선다).
 *
 * ⚠ 리로드를 여기서 부르지 마라. `controllerchange`를 기다려야 **새 워커가 제어권을
 * 잡은 뒤에** 새로고침된다. 먼저 리로드하면 옛 워커가 그대로 응답한다.
 */

/* §18.2 원문. design `10c`도 같은 문자열이다. */
const MESSAGE = '새 버전이 있습니다'
const ACTION = '새로고침'

export function UpdateBanner({
  onApply,
  hasDock = true,
}: {
  onApply: () => void
  /** 거짓이면 독이 서던 자리로 내려온다. 기본값은 옛 동작(독 위)이다. */
  hasDock?: boolean
}) {
  return (
    <div
      className={hasDock ? 'pwab pwab-upd' : 'pwab pwab-upd pwab-nodock'}
      role="status"
      aria-live="polite"
    >
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
