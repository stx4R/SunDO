/**
 * 인라인 아이콘. path·stroke 폭·톱니 개수가 규격으로 고정돼 있어
 * 아이콘 라이브러리를 쓰지 않는다(지시서 §7.6).
 *
 * 독 5종은 design/index.html `15a`의 SVG 원문이다. 원문은 활성/비활성을
 * `stroke` 리터럴로 직접 칠했으나, 여기서는 `currentColor`로 바꿔 색을 CSS가
 * 제어한다. viewBox `0 0 22 22` · `stroke-width 1.9` · 라운드 캡은 원문 그대로다.
 */

interface IconProps {
  className?: string
}

/* 독 아이콘은 전부 장식이다. 이름은 라벨 텍스트가 갖는다(§15.3). */
const base = {
  width: 21,
  height: 21,
  viewBox: '0 0 22 22',
  fill: 'none',
  'aria-hidden': true,
} as const

export function HomeIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path
        d="M3.6 9.2L11 3.4l7.4 5.8v8a1.6 1.6 0 01-1.6 1.6H5.2a1.6 1.6 0 01-1.6-1.6v-8z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function RecordsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="4.6" y="3.6" width="12.8" height="14.8" rx="2.4" stroke="currentColor" strokeWidth="1.9" />
      <path d="M7.8 9.4h6.4M7.8 13.2h4.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

export function DutyIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3.4" y="4.6" width="15.2" height="14" rx="2.4" stroke="currentColor" strokeWidth="1.9" />
      <path
        d="M3.4 8.8h15.2M7.6 2.8v3.4M14.4 2.8v3.4"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function AdminIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path
        d="M11 2.8l6.4 2.4v5.6c0 4-2.7 7.3-6.4 8.4-3.7-1.1-6.4-4.4-6.4-8.4V5.2L11 2.8z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* 원 + 가운데 원(지름 6 = r 3) + 톱니 8개. 개수를 줄이지 마라. */
export function SettingsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="11" cy="11" r="6.9" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="11" cy="11" r="3" stroke="currentColor" strokeWidth="1.9" />
      <path
        d="M17.9 11h1.7M15.88 15.88l1.2 1.2M11 17.9v1.7M6.12 15.88l-1.2 1.2M4.1 11H2.4M6.12 6.12l-1.2-1.2M11 4.1V2.4M15.88 6.12l1.2-1.2"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Footer 개발자 링크용. design `14a` 원문 — viewBox `0 0 12 12`, stroke 1.5. */
export function ExternalLinkIcon({ className }: IconProps) {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
      <path
        d="M6.6 2.1h3.3v3.3M9.6 2.4L5.5 6.5"
        stroke="rgba(20,53,38,0.45)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.2 7.4v2.1a.9.9 0 01-.9.9H2.6a.9.9 0 01-.9-.9V3.8a.9.9 0 01.9-.9h2.1"
        stroke="rgba(20,53,38,0.45)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
