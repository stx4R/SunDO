import { useEffect, useState, type CSSProperties } from 'react'
import { NeuButton } from './NeuButton'

/**
 * PRD §6.4 스플래시(z-index 100, 최대 3초) + §8.1.5 + design `10a`.
 *
 * **라우터보다 앞선 화면이다**(N-05). 인증 판정이 끝나기 전에는 이것만 보이고
 * 다른 화면은 렌더되지 않는다 — S1이 소유하면 *S1이 마운트되기 전에 필요한 것을
 * S1이 갖는* 순환이 된다(지시서 §0.2).
 *
 * 배경은 그리지 않는다. `AppShell` 스테이지의 그라디언트와 오라 블롭이
 * design 10a와 같은 값이라 다시 그리면 두 겹이 된다.
 */

/** design 10a 원문. 글자별 `blurIn` 스태거 지연도 원문 값이다. */
const TITLE = [
  { ch: '자', delay: 0 },
  { ch: '율', delay: 0.09 },
  { ch: '생', delay: 0.18 },
  { ch: '활', delay: 0.27 },
  { ch: '부', delay: 0.36 },
]

/** design 10a 원문. */
const DOT_DELAYS = [0, 0.2, 0.4]

/** §6.4 — 판정이 이 시간을 넘기면 오류 화면으로 바꾼다. */
const TIMEOUT_MS = 3000

/**
 * §8.10.3 에러 사전. **문구를 새로 짓지 않는다.**
 * 매핑이 없는 코드는 ER-01로 떨어진다(지시서 §5.2). 어떤 코드가 여기 없는지는
 * `reports/W-05.md` §7에 적혀 있다.
 */
const ER_01 = '네트워크에 연결할 수 없습니다'
const ER_09 = '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요'
const ER_10 = '세션이 만료되었습니다. 다시 로그인해 주세요'

const ERROR_TEXT: Readonly<Record<string, string>> = {
  /* 판정이 `loading`에 머무는 경로는 `AuthProvider`의 `users/{uid}` 조회 실패
     하나뿐이다(W-04 §4-3). 아래는 그 자리에서 실제로 나올 수 있는 코드다. */
  unavailable: ER_01,
  'deadline-exceeded': ER_01,
  'firestore/get-profile-failed': ER_01,
  'auth/network-request-failed': ER_01,
  'auth/redirect-failed': ER_01,
  'resource-exhausted': ER_09,
  unauthenticated: ER_10,
}

interface SplashProps {
  /** `AuthProvider`가 노출하는 Firebase 에러 코드 원문. 문구 매핑은 여기서 한다. */
  errorCode: string | null
  /** 오류 화면의 `다시 시도`. 인증 판정을 처음부터 다시 돌린다. */
  onRetry: () => void
  /** 자산이 생기면 넘긴다. 없으면 §8.1.2 폴백(`자` 이니셜 원형)이다. Footer와 같다. */
  logoSrc?: string
}

export function Splash({ errorCode, onRetry, logoSrc }: SplashProps) {
  const [timedOut, setTimedOut] = useState(false)

  /* 타이머는 이 컴포넌트의 수명과 같다. `loading`을 벗어나면 호출부가
     스플래시를 내리고, 언마운트가 곧 해제다(지시서 §5.2). */
  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [])

  if (timedOut) {
    return (
      <div className="splash">
        <div className="splash-err" role="alert" aria-live="assertive">
          <span className="splash-logo" aria-hidden="true">
            <Logo logoSrc={logoSrc} />
          </span>
          <p className="mt-4.5 text-body font-medium text-sundo-900">
            {(errorCode && ERROR_TEXT[errorCode]) || ER_01}
          </p>
          <NeuButton radius={20} className="mt-5 px-5 py-3" onClick={onRetry}>
            <span className="text-button font-bold text-sundo-800">다시 시도</span>
          </NeuButton>
        </div>
      </div>
    )
  }

  return (
    <div className="splash">
      <span className="splash-logo rise">
        <Logo logoSrc={logoSrc} />
      </span>

      <h1 className="splash-title">
        {TITLE.map(({ ch, delay }) => (
          <span
            key={ch}
            className="blur-in"
            style={{ '--blur-in-delay': `${delay}s` } as CSSProperties}
          >
            {ch}
          </span>
        ))}
      </h1>

      {/* design 10a 원문 지연 0.5s. */}
      <p className="splash-sub blur-in" style={{ '--blur-in-delay': '0.5s' } as CSSProperties}>
        대전대신고등학교
      </p>

      <div className="splash-dots" aria-hidden="true">
        {DOT_DELAYS.map((delay) => (
          <span
            key={delay}
            className="splash-dot"
            style={{ '--dot-delay': `${delay}s` } as CSSProperties}
          />
        ))}
      </div>
    </div>
  )
}

/** §8.1.2 — 로고 자산이 없거나 로드에 실패하면 `자` 이니셜 원형이다. */
function Logo({ logoSrc }: { logoSrc?: string }) {
  if (logoSrc) return <img src={logoSrc} alt="" className="h-full w-full object-cover" />
  /* Footer 폴백과 같은 색·굵기다. 크기는 §7.2 스케일에서 84px 원에 가장 가까운
     `text-h1`(28px)을 골랐다. PRD에 폴백 글자 크기 규격이 없다(보고서 §4). */
  return (
    <span className="text-h1 font-bold text-sundo-800" aria-hidden="true">
      자
    </span>
  )
}
