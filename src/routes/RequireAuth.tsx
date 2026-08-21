import { useEffect, type ReactNode } from 'react'
import { Navigate, Outlet, useMatches } from 'react-router'
import type { DockRole } from '../components/Dock'
import { useToast } from '../components/Toast'
import { useAuth, type AuthStatus } from '../contexts/AuthProvider'

/**
 * PRD §6.1 인증 분기 + §4.3 화면 접근 권한 매트릭스.
 *
 * `AuthProvider`가 `status`를 이미 확정해 준다(W-04 §3 대응표).
 * **여기서 판정을 다시 하지 않는다 — 이동만 한다.**
 */

/** §3.1 — `status`별 기본 착지 화면. `loading`은 스플래시가 먹으므로 여기 없다. */
const LANDING: Readonly<Record<Exclude<AuthStatus, 'loading'>, string>> = {
  signedOut: '/login',
  domainRejected: '/login',
  noProfile: '/signup',
  pending: '/pending',
  active: '/',
  rejected: '/pending',
  suspended: '/login',
  withdrawn: '/signup',
}

/**
 * 라우트가 `allow`를 적지 않으면 활성 부원 전용이다.
 * §4.3 매트릭스에서 예외는 `/login`·`/signup`·`/pending` 세 곳뿐이라
 * 기본값을 좁게 두고 예외만 표시한다.
 */
const DEFAULT_ALLOW: readonly AuthStatus[] = ['active']

/** §8.10.1 TS-12. 문구를 여기서 새로 짓지 않는다. */
const TS_12 = '접근 권한이 없습니다'

/** 라우트에 붙이는 메타. `router.tsx`가 채우고 이 파일과 `RootLayout`이 읽는다. */
export interface RouteHandle {
  /** 이 라우트에 머무를 수 있는 `AuthStatus` 목록 */
  allow?: readonly AuthStatus[]
  /** 하단 독을 노출하는 라우트(§6.2 — S3·S7·S8·S9·S10) */
  hasDock?: boolean
  /**
   * 인증 판정(N-05 스플래시)을 기다리지 않고 바로 렌더하는 라우트.
   * **정책 3종뿐이다**(EC-44 · W-06 §0.1-3). 다른 라우트에 붙이지 마라 —
   * 로그인 화면이 한 프레임 깜빡이는 것이 N-05가 막으려던 것이다.
   */
  skipsAuthGate?: boolean
}

export function RequireAuth() {
  const { status } = useAuth()
  const matches = useMatches()

  /* 가장 깊은 곳에서 선언한 `allow`가 이긴다. 부모가 넓게 열어 둔 뒤
     자식이 좁히는 방향으로만 쓴다. */
  const allow = matches.reduce<readonly AuthStatus[]>(
    (acc, m) => (m.handle as RouteHandle | undefined)?.allow ?? acc,
    DEFAULT_ALLOW,
  )

  /* 방어선이다. `RootLayout`이 `loading` 동안 이 트리를 아예 렌더하지 않는다(N-05). */
  if (status === 'loading') return null

  if (allow.includes(status)) return <Outlet />

  /* 히스토리에 막힌 경로를 남기면 뒤로가기가 무한 왕복한다(지시서 §3.2). */
  return <Navigate to={LANDING[status]} replace />
}

/**
 * §4.3 — 역할이 모자란 계정이 URL로 직접 들어온 경우.
 *
 * `RequireAuth`의 상태 리다이렉트와 **다른 처리**다. 상태 리다이렉트는 아직
 * 자기 자리에 도착하지 못한 계정을 조용히 옮기는 것이고, 이쪽은 자리에 도착한
 * 계정이 넘볼 수 없는 문을 민 것이라 토스트로 알린다. W-03B §8-4가 넘긴
 * "역할 강등 뒤에도 `/admin`에 남아 있는 문제"의 처리이기도 하다.
 */
export function RequireRole({
  roles,
  children,
}: {
  roles: readonly DockRole[]
  children: ReactNode
}) {
  const { profile } = useAuth()
  const toast = useToast()
  const denied = !profile || !roles.includes(profile.role)

  /* 렌더 중에 토스트를 띄우면 렌더가 부작용을 갖는다. `ToastProvider`가
     라우트 루트에 있어 이동 뒤에도 살아남으므로 이동과 함께 띄워도 된다(§7). */
  useEffect(() => {
    if (denied) toast(TS_12)
  }, [denied, toast])

  if (denied) return <Navigate to="/" replace />
  return <>{children}</>
}
