import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router'
import { Footer } from '../components/Footer'
import { NeuButton } from '../components/NeuButton'
import { PrimaryButton } from '../components/PrimaryButton'
import { useAuth } from '../contexts/AuthProvider'
import { cn } from '../lib/cn'

/**
 * S2-1 승인 대기 — `/pending` · design `3a`~`3c`(R-03 델타 적용본) · PRD §8.2.6.
 *
 * **이 화면은 이동시키지 않는다.** 승인되면 `status`가 `active`가 되고
 * `RequireAuth`가 `/`로 옮긴다(W-05 §3). 거절되면 같은 라우트에서 A → B로 바뀐다.
 * `navigate()`는 `가입 코드 다시 입력`과 Footer 정책 링크에만 쓴다.
 *
 * 화면 전환 `blurIn`은 `ScreenTransition`이 이미 감싸고 있다. 여기서 다시 걸지 마라.
 *
 * 🔴 **W-12에서 `onSnapshot`으로 전환하면 이 폴링 루프를 통째로 걷어내야 한다.**
 * 구독이 들어오면 30초 폴링과 `refresh()`는 중복이 된다. 지금 심는 부채다.
 */

/** §8.2.6 — 자동 감지 주기. 폴링 주기는 `AuthProvider`가 아니라 화면이 소유한다. */
const POLL_MS = 30_000

/** §8.2.6 — `승인 확인` 쿨다운. */
const COOLDOWN_MS = 10_000

/* §8.2.6 확정 문안. **본문·보조의 마침표는 원문 그대로다.** 임의로 통일하지 마라. */
const TITLE_PENDING = '가입 신청이 접수되었습니다'
const TITLE_REJECTED = '가입이 거절되었습니다'
const BODY_PENDING = '부장이 승인하면 바로 이용할 수 있습니다.'
const BODY_REJECTED = '부장에게 문의한 뒤 다시 신청해 주세요.'
const AUX_PENDING = '승인 결과는 이 화면에서 자동으로 반영됩니다.'
const CHIP_PENDING = '승인 대기 중'
const BTN_PENDING = '승인 확인'
const BTN_REJECTED = '가입 코드 다시 입력'
const BTN_SIGNOUT = '로그아웃'

export default function Pending() {
  const { status, profile, refresh, signOut } = useAuth()
  const navigate = useNavigate()

  const [busy, setBusy] = useState(false)
  const [cooling, setCooling] = useState(false)
  const titleRef = useRef<HTMLHeadingElement>(null)

  /* §0.2 확정 규칙 — 부수효과 버튼은 상태·DOM `disabled`만으로 연속 탭을 막지 못한다.
     같은 태스크 안의 5회 탭은 전부 리렌더 전의 옛 값을 본다(W-06 §5-4). */
  const confirmLatch = useRef(false)
  const signOutLatch = useRef(false)
  const reapplyLatch = useRef(false)

  const cooldownTimer = useRef<number | undefined>(undefined)
  const pollTimer = useRef<number | undefined>(undefined)

  const rejected = status === 'rejected'

  /* §15.3 — 진입 시 제목에 포커스. **변형이 바뀔 때도 다시 옮긴다** —
     같은 라우트라 화면 전환이 일어나지 않아 스크린리더 사용자가 변화를 놓친다. */
  useEffect(() => {
    titleRef.current?.focus()
  }, [rejected])

  useEffect(
    () => () => {
      window.clearTimeout(cooldownTimer.current)
      window.clearTimeout(pollTimer.current)
    },
    [],
  )

  /** 수동·자동 재조회의 공통 경로. 쿨다운은 **수동 탭에만** 건다. */
  const runRefresh = useCallback(
    async (manual: boolean) => {
      if (confirmLatch.current) return
      confirmLatch.current = true
      setBusy(true)
      try {
        await refresh()
      } finally {
        confirmLatch.current = false
        setBusy(false)
        if (manual) {
          /* §6.2 — 성공·실패 무관하게 완료 시점부터 10초. */
          setCooling(true)
          window.clearTimeout(cooldownTimer.current)
          cooldownTimer.current = window.setTimeout(() => setCooling(false), COOLDOWN_MS)
        }
      }
    },
    [refresh],
  )

  /* §6.1 자동 감지 — `pending`에서만, 화면이 보일 때만 돈다.
     백그라운드에서 30초마다 조회하면 배터리를 먹고 얻는 것이 없다.
     복귀하면 주기를 기다리지 않고 **즉시 1회** 돈다 — 사용자가 보고 있는 순간이 중요하다. */
  useEffect(() => {
    if (status !== 'pending') return

    const tick = () => {
      window.clearTimeout(pollTimer.current)
      pollTimer.current = window.setTimeout(() => {
        if (document.visibilityState === 'visible') void runRefresh(false)
        tick()
      }, POLL_MS)
    }

    const onVisible = () => {
      if (document.visibilityState !== 'visible') {
        window.clearTimeout(pollTimer.current)
        return
      }
      void runRefresh(false)
      tick()
    }

    if (document.visibilityState === 'visible') tick()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearTimeout(pollTimer.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [status, runRefresh])

  const handleConfirm = () => {
    if (busy || cooling) return
    void runRefresh(true)
  }

  const handleSignOut = () => {
    if (signOutLatch.current) return
    signOutLatch.current = true
    /* `navigate()`를 함께 부르지 않는다. `status` 변화로 라우터가 옮긴다. */
    void signOut()
  }

  const handleReapply = () => {
    if (reapplyLatch.current) return
    reapplyLatch.current = true
    /* §8.2.6 — **구글 재인증 없이** 코드 재입력으로 돌아간다. */
    navigate('/signup')
  }

  const email = profile?.email ?? ''
  const initial = profile?.name?.trim().charAt(0) ?? ''

  return (
    <main
      data-screen="S2-1"
      aria-labelledby="scr-s2-1"
      className="flex min-h-full flex-col"
    >
      {/* 1~6을 남는 공간에서 세로 중앙 정렬한다(design 3a `flex:1` + `justify-content:center`). */}
      <div className="flex flex-1 flex-col items-center justify-center">
        {/* design 3a·3b 원문 `rise .5s ease .1s both`. */}
        <div
          className="rise flex flex-col items-center"
          style={{ '--rise-delay': '0.1s' } as CSSProperties}
        >
          <span
            className="pend-badge"
            style={
              rejected
                ? ({ '--pend-glow': 'var(--color-sundo-tint-danger-10)' } as CSSProperties)
                : undefined
            }
          >
            {rejected ? <RejectedIcon /> : <HourglassIcon />}
          </span>

          <h1
            ref={titleRef}
            id="scr-s2-1"
            tabIndex={-1}
            className="mt-7 text-center text-h2 font-bold leading-[1.32] text-sundo-900 outline-none"
          >
            {rejected ? TITLE_REJECTED : TITLE_PENDING}
          </h1>

          <p className="mt-3 text-center text-body font-medium leading-[1.5] text-sundo-ink-70">
            {rejected ? BODY_REJECTED : BODY_PENDING}
          </p>

          {/* B에는 보조 줄이 없다. §6.1이 `rejected`에서 폴링을 멈추므로
              "자동으로 반영됩니다"가 참이 아니게 된다(보고서 §5-2). */}
          {!rejected && (
            <p className="mt-2 text-center text-micro font-medium leading-[1.5] text-sundo-ink-70">
              {AUX_PENDING}
            </p>
          )}

          {/* A 전용. AC-03 — 점만이 아니라 텍스트를 함께 읽힌다. */}
          {!rejected && (
            <div className="pend-chip mt-5">
              <span className="pend-dot" aria-hidden="true" />
              <span className="text-caption font-bold text-sundo-800">{CHIP_PENDING}</span>
            </div>
          )}

          {/* R-03 델타 1 — 세 변형 공통. */}
          <div className="pend-id mt-[18px]">
            <span className="pend-avatar" aria-hidden="true">
              <span className="text-micro font-bold text-white">{initial}</span>
            </span>
            <span className="ml-2 text-label font-medium text-sundo-ink-70">{email}</span>
          </div>
        </div>
      </div>

      {/* 하단 고정 영역. `AppShell`의 하단 패딩이 0이라 여기서 준다(§5.1). */}
      <div
        className="flex flex-col gap-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 26px)' }}
      >
        {rejected ? (
          <PrimaryButton label={BTN_REJECTED} onClick={handleReapply} />
        ) : (
          <NeuButton
            radius={20}
            disabled={busy || cooling}
            /* `disabled`가 붙는 두 경우의 표현이 다르다 — 확인 중은 **눌림**(design 3c),
               쿨다운은 `NeuButton` 기본 흐림이다. 흐림을 되돌려 눌림만 남긴다. */
            className={cn('w-full rounded-15 p-[15px]', busy && 'pend-busy opacity-100')}
            onClick={handleConfirm}
          >
            {busy ? (
              <span className="flex min-h-[19px] items-center justify-center">
                <ConfirmSpinner />
              </span>
            ) : (
              <span className="text-subtitle font-bold text-sundo-800">{BTN_PENDING}</span>
            )}
          </NeuButton>
        )}

        {/* §15.1 — 텍스트 버튼도 세로 44px을 확보한다. */}
        <button
          type="button"
          onClick={handleSignOut}
          className="flex min-h-[44px] items-center justify-center"
        >
          <span className="text-subtitle font-bold text-sundo-ink-70">{BTN_SIGNOUT}</span>
        </button>

        {/* design 3a·R-03 — `로그아웃` 아래 **20px**에 Footer가 온다.
            부모 `gap-3`(12px) + 이 마진 + `Footer`의 `pt-[18px]` = 20px이 되게 맞춘다.
            (Footer 축약형은 `.ft-links`의 `-15px`와 링크 패딩 `15px`이 상쇄돼
             상단 패딩 18px이 그대로 링크 텍스트까지의 거리가 된다.) */}
        <div className="mt-[-10px]">
          <Footer variant="compact" onNavigate={(path) => navigate(path)} />
        </div>
      </div>
    </main>
  )
}

/** design 3a 원문 — 모래시계 34px `#1F5138`. */
function HourglassIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <path
        d="M10 4.6h14M10 29.4h14M11.6 4.6v4.2c0 3 5.4 5.9 5.4 8.2s-5.4 5.2-5.4 8.2v4.2M22.4 4.6v4.2c0 3-5.4 5.9-5.4 8.2s5.4 5.2 5.4 8.2v4.2"
        stroke="#1F5138"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** design 3b 원문 — 느낌표 34px `#C0392B`. 획 굵기가 두 path에서 다르다(2.4 / 2.6). */
function RejectedIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <path d="M17 8.4v12.2" stroke="#C0392B" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M17 25.9v.1" stroke="#C0392B" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

/**
 * design 3c 원문 — SVG 원호다(S1 Google 버튼의 CSS 테두리 방식과 다르다).
 * 회전부 `#1F5138` · 트랙 `rgba(31,81,56,0.22)`로 **S1과 색이 다르다.**
 * 통일하지 마라 — 각 화면의 주 색을 따른다.
 */
function ConfirmSpinner() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="pend-spin" aria-hidden="true">
      <circle cx="9" cy="9" r="7.4" stroke="rgba(31,81,56,0.22)" strokeWidth="2.2" />
      <path d="M9 1.6A7.4 7.4 0 0 1 16.4 9" stroke="#1F5138" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}
