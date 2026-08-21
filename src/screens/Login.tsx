import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router'
import { BrandLogo } from '../components/BrandLogo'
import { Footer } from '../components/Footer'
import { GlassCard } from '../components/GlassCard'
import { OfflineBanner } from '../components/OfflineBanner'
import { useToast } from '../components/Toast'
import { useAuth } from '../contexts/AuthProvider'
import { useOnline } from '../lib/useOnline'

/**
 * S1 로그인 — `/login` · design `12a`~`12e` · PRD §8.1.
 *
 * **이 화면은 이동시키지 않는다.** `signIn()`이 성공하면 `status`가 바뀌고
 * `RequireAuth`가 옮긴다(W-05 §3). `navigate()`를 인증 흐름에 쓰지 마라 —
 * Footer 정책 링크에만 쓴다.
 *
 * **`signOut()`·`deleteUser()`도 부르지 않는다.** 도메인 불일치는 `AuthProvider`가
 * 이미 처리하고(W-04 §5.3 — `deleteUser` → `signOut` 순서), S1은 결과를 그리기만 한다.
 *
 * 화면 전환 `blurIn`은 `ScreenTransition`이 이미 감싸고 있다. 여기서 다시 걸지 마라.
 */

/* design 12a 원문. **Splash(`0/.09/.18/.27/.36`)와 다른 값이다.** 복사해 오지 마라. */
const TITLE = [
  { ch: '자', delay: 0.05 },
  { ch: '율', delay: 0.13 },
  { ch: '생', delay: 0.21 },
  { ch: '활', delay: 0.29 },
  { ch: '부', delay: 0.37 },
]

const TITLE_TEXT = '자율생활부'

/* §8.1.3 · §8.10 — 확정 문안이다. 새로 짓지 마라. */
const ER_11 = '@dshs.kr 학교 계정만 사용할 수 있습니다'
const ER_12 = '개인 Google 계정으로는 로그인할 수 없습니다'
const ER_13 = '로그인에 실패했습니다. 잠시 후 다시 시도해 주세요'
const ER_01 = '네트워크에 연결할 수 없습니다'
const E_1006 = '정지된 계정입니다. 부장에게 문의해 주세요'
const TOO_MANY = '로그인 시도가 많습니다. 1분 후 다시 시도해 주세요'
const TS_17 = '로그인이 취소되었습니다'

const HINT_DEFAULT = '@dshs.kr 학교 계정만 로그인할 수 있습니다'
const HINT_SUBMITTING = 'Google 창에서 계속 진행해 주세요'
const HINT_OFFLINE = '오프라인 상태에서는 로그인할 수 없습니다'

const LABEL_DEFAULT = 'Google 계정으로 계속하기'
const LABEL_REJECTED = '다른 계정으로 로그인'

/**
 * 취소는 에러가 아니다(W-04 §9). 배너가 아니라 TS-17 토스트로 알린다.
 *
 * `auth/popup-blocked`·`auth/cancelled-popup-request`는 `AuthProvider`가
 * 리다이렉트로 조용히 폴백하므로(EC-30) 실제로는 `errorCode`에 도달하지 않는다.
 * 폴백 자체가 실패하면 `auth/redirect-failed`가 대신 온다. 방어로만 적어 둔다.
 */
const CANCEL_CODES = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/popup-blocked',
  'auth/user-cancelled',
])

/** §8.1.3 — 배너로 보여 줄 코드. 목록에 없으면 ER-13이다. */
const BANNER_TEXT: Readonly<Record<string, string>> = {
  'auth/too-many-requests': TOO_MANY,
  'auth/network-request-failed': ER_01,
}

export default function Login() {
  const { status, errorCode, rejectedEmail, signIn, clearRejection } = useAuth()
  const online = useOnline()
  const toast = useToast()
  const navigate = useNavigate()

  const [submitting, setSubmitting] = useState(false)
  /* `submitting` 상태만으로는 같은 태스크 안의 연속 탭을 막지 못한다 —
     React가 리렌더하기 전이라 5번의 핸들러가 전부 `submitting === false`를 본다.
     DOM의 `disabled`도 아직 안 붙는다. 동기적으로 즉시 서는 빗장이 따로 필요하다. */
  const submittingRef = useRef(false)
  const titleRef = useRef<HTMLHeadingElement>(null)

  /* §15.3 — 화면 전환 시 제목에 포커스를 옮긴다. */
  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  /* 취소는 배너를 띄우지 않는다. `signIn`이 시작할 때 `errorCode`를 null로
     되돌리므로, 같은 코드가 다시 와도 값이 바뀌어 이 효과가 다시 돈다. */
  useEffect(() => {
    if (errorCode && CANCEL_CODES.has(errorCode)) toast(TS_17)
  }, [errorCode, toast])

  /* 판정이 끝나면(성공이든 실패든) 버튼을 되돌린다. 성공하면 라우터가
     이 화면을 걷어내므로 실제로 보이는 것은 실패·취소 경로뿐이다. */
  useEffect(() => {
    if (!errorCode) return
    submittingRef.current = false
    setSubmitting(false)
  }, [errorCode])

  const rejected = status === 'domainRejected'
  const suspended = status === 'suspended'
  const disabled = !online || submitting

  /* D(오프라인)가 B·C·E와 겹칠 때 버튼 상태와 안내 줄은 D가 이긴다(지시서 §6.4). */
  const hint = !online ? HINT_OFFLINE : submitting ? HINT_SUBMITTING : HINT_DEFAULT

  /* C·E는 `status`가 서로 배타적이라 동시에 성립하지 않는다.
     그 둘이 없을 때만 로그인 시도 실패를 배너로 띄운다. */
  const attemptError =
    !rejected && !suspended && errorCode && !CANCEL_CODES.has(errorCode)
      ? (BANNER_TEXT[errorCode] ?? ER_13)
      : null

  const handleSignIn = () => {
    /* "탭 불가"는 시각 처리가 아니라 호출 차단이다(지시서 §6.4). */
    if (disabled || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    void signIn()
  }

  return (
    <main
      data-screen="S1"
      aria-labelledby="scr-s1"
      className="flex min-h-full flex-col"
    >
      {!online && <OfflineBanner />}

      {/* design 12a — `flex:1`로 남는 공간을 먹고 그 안에서 세로 중앙 정렬한다.
          Footer는 흐름의 마지막이라 늘 최하단이다. */}
      <div className="flex flex-1 flex-col items-center justify-center">
        <BrandLogo className="rise" />

        {/* 5글자를 각각 `<span>`으로 쪼개므로 스크린리더가 5번 읽지 않게
            래퍼가 이름을 갖고 글자는 숨긴다(§15.3). */}
        <h1
          ref={titleRef}
          id="scr-s1"
          tabIndex={-1}
          aria-label={TITLE_TEXT}
          className="brand-title outline-none"
        >
          {TITLE.map(({ ch, delay }) => (
            <span
              key={ch}
              className="blur-in"
              aria-hidden="true"
              style={{ '--blur-in-delay': `${delay}s` } as CSSProperties}
            >
              {ch}
            </span>
          ))}
        </h1>

        {/* design 12a에는 모션이 없으나 §8.1.2 #3이 `blurIn` 0.5s 지연을 명시한다.
            충돌 해소 순서 1번(PRD 우선)을 적용했다(보고서 §5). */}
        <p
          className="brand-sub blur-in"
          style={{ '--blur-in-delay': '0.5s' } as CSSProperties}
        >
          대전대신고등학교 · 부원 전용
        </p>

        <GlassCard radius={24} riseDelay={150} className="mt-[30px] w-full p-[22px_20px]">
          {/* C — 도메인 거절. 2줄이라 아이콘을 첫 줄에 맞춘다(design 12c). */}
          {rejected && (
            <div className="s1-banner items-start" role="alert" aria-live="assertive">
              <AlertIcon className="mt-px" />
              <div className="flex flex-col gap-[3px]">
                <span className="text-label font-bold text-sundo-danger">{ER_11}</span>
                <span className="text-micro font-medium text-sundo-ink-70">{ER_12}</span>
              </div>
            </div>
          )}

          {/* E — 계정 정지. 1줄이라 아이콘을 가운데 맞춘다(design 12e). */}
          {suspended && (
            <div
              className="s1-banner mb-[14px] items-center"
              role="alert"
              aria-live="assertive"
            >
              <AlertIcon />
              <span className="text-label font-bold text-sundo-danger">{E_1006}</span>
            </div>
          )}

          {/* 로그인 시도 실패. §8.1.3의 나머지 3줄이 여기로 온다. */}
          {attemptError && (
            <div
              className="s1-banner mb-[14px] items-center"
              role="alert"
              aria-live="assertive"
            >
              <AlertIcon />
              <span className="text-label font-bold text-sundo-danger">{attemptError}</span>
            </div>
          )}

          {/* T-05 거절 계정 칩. 44px 터치 타깃은 행이 갖는다(design 12c). */}
          {rejected && rejectedEmail && (
            <div className="s1-chiprow mt-2">
              <div className="s1-chip">
                <span
                  className="size-[18px] flex-none rounded-full bg-[rgba(20,53,38,0.16)]"
                  aria-hidden="true"
                />
                <span className="text-label font-medium text-sundo-ink-70">{rejectedEmail}</span>
                <button
                  type="button"
                  className="s1-chip-x"
                  aria-label="거절된 계정 지우기"
                  onClick={clearRejection}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path
                      d="M2.6 2.6l6.8 6.8M9.4 2.6l-6.8 6.8"
                      stroke="rgba(20,53,38,0.70)"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleSignIn}
            disabled={disabled}
            aria-label={rejected ? LABEL_REJECTED : LABEL_DEFAULT}
            aria-busy={submitting}
            className={`gbtn ${rejected ? 'mt-2' : ''} ${
              submitting ? 'opacity-75' : !online ? 'opacity-45' : ''
            }`}
          >
            <GoogleMark />
            {submitting ? (
              /* B — 라벨 자리에 스피너. reduce에서도 정지시키지 않는다(§8.1.2 #4). */
              <span className="gbtn-spin" role="status" aria-label={HINT_SUBMITTING} />
            ) : (
              <span className="text-body font-bold text-sundo-900">
                {rejected ? LABEL_REJECTED : LABEL_DEFAULT}
              </span>
            )}
          </button>

          <div className="mt-[14px] flex items-center justify-center gap-1.5">
            <LockIcon />
            <span className="text-caption font-medium text-sundo-ink-70">{hint}</span>
          </div>
        </GlassCard>

        <p className="mt-4 text-center text-micro font-medium text-sundo-ink-70">
          가입에는 자율생활부 코드가 필요합니다
        </p>
      </div>

      {/* W-05 §10 — `onNavigate`가 없으면 `<a href>`로 폴백해 전체 재적재가 일어난다. */}
      <Footer variant="compact" onNavigate={(path) => navigate(path)} />
    </main>
  )
}

/**
 * design 12a 원문. **4색 원본 그대로다** — 단색화·재색상화·`currentColor` 치환은
 * §7 팔레트 제약의 유일한 예외로 금지돼 있다(§8.1.2 각주).
 */
function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" className="flex-none" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  )
}

/** design 12a 원문 자물쇠. S1에서만 쓰므로 `icons.tsx`로 빼지 않는다. */
function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="flex-none" aria-hidden="true">
      <rect
        x="3.2"
        y="7"
        width="9.6"
        height="7"
        rx="2"
        stroke="rgba(20,53,38,0.70)"
        strokeWidth="1.9"
      />
      <path
        d="M5.6 7V5.2a2.4 2.4 0 014.8 0V7"
        stroke="rgba(20,53,38,0.70)"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** design 12c·12e 원문 느낌표. */
function AlertIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      className={className ? `flex-none ${className}` : 'flex-none'}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.6" stroke="#C0392B" strokeWidth="1.9" />
      <path d="M8 4.9v3.6" stroke="#C0392B" strokeWidth="1.9" strokeLinecap="round" />
      <circle cx="8" cy="11.1" r="0.95" fill="#C0392B" />
    </svg>
  )
}
