/**
 * 설치 안내 배너 — design `10d` · PRD §18.2 「전역 설치 배너 1회 노출」 · EC-24.
 *
 * 🔴 **iOS에서만 뜬다**(사용자 결정 · `lib/pwa.ts`의 `useInstallGuide()`).
 * 부제 `공유 버튼 → 홈 화면에 추가`는 iOS의 실제 경로이고 Android에는 그 흐름이 없다.
 * Android용 문구는 §8.10 사전에 **없으므로 만들지 않는다**(규약 4-4).
 *
 * **마운트는 `DockLayout`이 한다.** `UpdateBanner`와 같은 이유다.
 *
 * ⚠ 이 배너는 상세 안내를 열지 않는다. 3단계 전문은 S10 `설치 안내` 칩이 이미 갖고 있고
 * (§8.11.4 T-04 · §18.3), design `10d`는 배너 본체에 어떤 이동 경로도 그리지 않았다.
 */

/* design `10d` 원문. 제목은 EC-24의 확정 문구와 같은 문자열이다. */
const TITLE = '홈 화면에 추가하면 앱처럼 사용할 수 있습니다'
const SUB = '공유 버튼 → 홈 화면에 추가'
/** §8.10에 없다. W-06의 칩 X와 같은 판단으로 「무엇이 닫히는지」를 담는다(보고서 §4). */
const CLOSE_LABEL = '설치 안내 닫기'

export function InstallBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="pwab pwab-a2hs" role="status" aria-live="polite">
      {/* design `10d` 원문 — 상자 위로 나가는 화살표. */}
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className="pwab-ico" aria-hidden="true">
        <path
          d="M5 8.6H3.8v8.2h12.4V8.6H15"
          stroke="#1F5138"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M10 12V3.4M6.8 6.4L10 3.2l3.2 3.2"
          stroke="#1F5138"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="pwab-txt">
        <div className="pwab-title">{TITLE}</div>
        <div className="pwab-sub">{SUB}</div>
      </div>
      <button type="button" className="pwab-x" onClick={onDismiss} aria-label={CLOSE_LABEL}>
        <span aria-hidden="true">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M3 3l6 6M9 3l-6 6" stroke="#1F5138" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
      </button>
    </div>
  )
}
