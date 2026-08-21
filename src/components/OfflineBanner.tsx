/**
 * PRD §6.4 오프라인 배너(z-index 70) + design `12d`.
 *
 * **콘텐츠를 밀어낸다**(W-09 §0.2). design `12d`가 이 요소를 흐름 안에 그렸고,
 * 그것은 손실 없는 이형이 아니라 **더 구체적인 명세**다 — §6.4의 `상단 고정`은
 * 위치 규정이지 겹침 규정이 아니다. W-06은 오버레이로 띄웠으나 S2에서 실제로
 * 겹쳤고(W-08 §5-7), 상단 정렬인 S3·S7·S8·S9·S10은 전부 겹친다.
 * `z-index: 70`은 그대로 지킨다 — 딤(z-40) 위에 있어야 한다.
 *
 * **마운트는 `AppShell`이 한다.** 이 컴포넌트를 화면에서 직접 그리지 마라.
 * 포털도 쓰지 마라 — 만드는 쪽이 없다(전역 1개이고 조건이 `useOnline()` 하나뿐이다).
 *
 * 버튼·닫기를 붙이지 마라. `.ofb`의 `pointer-events: none`을 되돌리지 않는 전제가
 * "이 배너에는 상호작용이 없다"이다. 되돌리면 시트가 열린 동안 배너 띠에서
 * 딤 탭-투-클로즈가 죽는다.
 */
export function OfflineBanner() {
  return (
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
    </div>
  )
}
