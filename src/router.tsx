import { useContext, useEffect, useState } from 'react'
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  useLocation,
  useMatches,
  useParams,
} from 'react-router'
import { AppShell, ScrollRootContext } from './components/AppShell'
import { Splash } from './components/Splash'
import { ToastProvider, useToast } from './components/Toast'
import { AuthProvider, useAuth } from './contexts/AuthProvider'
import { useLastActiveAt } from './lib/useLastActiveAt'
import { DockLayout } from './routes/DockLayout'
import { RequireAuth, RequireRole, type RouteHandle } from './routes/RequireAuth'
import Admin from './screens/Admin'
import ClassStudents from './screens/ClassStudents'
import Duty from './screens/Duty'
import GradeClasses from './screens/GradeClasses'
import Home from './screens/Home'
import Login from './screens/Login'
import Pending from './screens/Pending'
import PolicyOss from './screens/PolicyOss'
import PolicyPrivacy from './screens/PolicyPrivacy'
import PolicyTerms from './screens/PolicyTerms'
import Records from './screens/Records'
import Settings from './screens/Settings'
import Signup from './screens/Signup'

/**
 * PRD §6.1 화면 맵 + §6.3 뒤로가기 규칙 + §4.3 접근 매트릭스.
 *
 * **경로 문자열을 바꾸지 마라.** 독(§6.2)과 Footer(§6.4)가 이미 묶여 있다.
 */

/* §4.3 — `member`는 `관리`에 접근할 수 없다. 독에서 탭 자체가 렌더되지 않는 것과
   같은 규칙의 다른 절반이다(탭을 숨겨도 URL은 남는다). */
const ADMIN_ROLES = ['vice', 'head', 'teacher', 'dev'] as const

/** §8.10.1 TS-13. §4.3 파라미터 검증 실패에만 쓴다. */
const TS_13 = '잘못된 접근입니다'

/**
 * 라우트 루트. **`AuthProvider`·`ToastProvider`가 각각 1개만 존재하는 지점**이다.
 *
 * `AppShell`을 여기로 끌어올린 이유(지시서 §7): `ToastProvider`는 오버레이 루트가
 * 필요해 `AppShell` **안쪽**이어야 하는데, `AppShell`이 라우트마다 있으면
 * 화면을 옮길 때 토스트가 함께 사라진다(W-03C §7-5). 상단/하단 여백 차이는
 * `hasDock` 하나로 갈리므로 라우트 `handle`에서 읽어 넘긴다.
 */
function RootLayout() {
  /* 스플래시 오류 화면의 `다시 시도`. `AuthProvider`를 통째로 다시 마운트해
     `getRedirectResult` + `onAuthStateChanged` 판정을 처음부터 돌린다.
     `location.reload()`를 쓰지 않는다 — 오류 화면이 뜨는 가장 흔한 원인이
     네트워크 단절이고, 서비스 워커가 아직 없어(W-16) 재적재가 통째로
     실패할 수 있다. 앱을 살려 둔 채로 판정만 다시 하는 편이 안전하다. */
  const [attempt, setAttempt] = useState(0)

  const matches = useMatches()
  const hasDock = matches.some((m) => (m.handle as RouteHandle | undefined)?.hasDock)

  return (
    <AuthProvider key={attempt}>
      <AppShell hasDock={hasDock}>
        <ToastProvider>
          <AuthGate onRetry={() => setAttempt((n) => n + 1)} />
        </ToastProvider>
      </AppShell>
    </AuthProvider>
  )
}

/**
 * N-05 — 판정 전에는 스플래시만 남기고 **어떤 화면도 렌더하지 않는다.**
 * `<Outlet />`을 조건 없이 그리면 로그인 화면이 한 프레임 깜빡인다.
 *
 * **예외는 정책 3종뿐이다**(EC-44 · W-06 §0.1-3). EC-44의 목적은 "정책 문서는
 * 언제나 도달 가능해야 한다"인데, 로그인된 계정이 오프라인이면 판정이 3초 뒤
 * 오류 화면으로 끝나 정책 문서에 영영 닿지 못한다. 스플래시가 가드가 아니어도
 * 결과적으로 도달을 막으면 EC-44 위반과 구분되지 않는다.
 */
function AuthGate({ onRetry }: { onRetry: () => void }) {
  const { status, profile, errorCode } = useAuth()
  const matches = useMatches()

  /* §9.3.1 — 활성 계정만, 1시간 스로틀. */
  useLastActiveAt(status === 'active' ? (profile?.uid ?? null) : null)

  const skipsGate = matches.some((m) => (m.handle as RouteHandle | undefined)?.skipsAuthGate)

  if (status === 'loading' && !skipsGate) {
    return <Splash errorCode={errorCode} onRetry={onRetry} />
  }
  return <Outlet />
}

/**
 * §7.4 `blurIn` 0.35s 화면 전환.
 *
 * 경로가 바뀌면 래퍼가 새 노드로 바뀌어 애니메이션이 처음부터 돈다.
 * **`DockLayout`보다 안쪽에 둔다** — 바깥에 두면 탭을 옮길 때마다 독까지
 * 다시 마운트되어 활성 알약의 가로 슬라이드가 죽는다.
 *
 * 🔴 **W-23 A-5(f)(B-05) — 라우트가 바뀌면 스크롤을 맨 위로 되돌린다.**
 *
 * 스크롤 노드는 `AppShell` 소유라(W-10 `ScrollRootContext`) **화면이 언마운트돼도
 * 살아 있다.** 그래서 아래로 스크롤한 뒤 독으로 탭을 옮기면 새 화면이 **중간부터** 보였다.
 * 🔬 §1-5 전수: 저장소 전체에 `scrollTo`·`scrollTop` 리셋이 **0건**이었다 —
 * S9만의 문제가 아니라 **전역**이었다.
 *
 * 🔴 **`AppShell`에 prop을 만들지 않는다**(W-10 §5-1 — 여백 단독 소유자에게 정책이 붙는다).
 * `ScrollRootContext`의 **소비자**인 이 컴포넌트가 처리한다. `usePullToRefresh`가
 * 같은 컨텍스트를 같은 방식으로 쓰고 있어 새 통로를 내지 않았다.
 *
 * 🔴 **`useLayoutEffect`가 아니라 `useEffect`인 것이 중요하다.** 화면들이 `useEffect`에서
 * 제목으로 포커스를 옮기는데(§15.3), `focus()`는 대상이 화면 밖이면 **스스로 스크롤한다.**
 * 패시브 효과는 자식 → 부모 순이라 여기가 마지막에 돌아 최종 위치를 갖는다.
 *
 * ⚠ **시트는 영향을 받지 않는다.** `BottomSheet`의 N-02 히스토리 엔트리는 **같은 `pathname`**에
 * `state`만 얹으므로 이 효과가 다시 돌지 않는다 — 시트를 열고 닫아도 스크롤이 튀지 않는다.
 * ⚠ 당겨서 새로고침(T-05)과 무관하다 — 그쪽은 터치 제스처이고 여기는 경로 변경이다.
 */
function ScreenTransition() {
  const { pathname } = useLocation()
  const scrollRoot = useContext(ScrollRootContext)

  useEffect(() => {
    /* 첫 렌더에는 노드가 `null`이다(W-10 계약). 다음 렌더에서 다시 돈다.
       ⚠ `scrollTop = 0` 대입이 아니라 `scrollTo(0, 0)`이다 — oxlint의
       `react(immutability)`가 `useContext()` 반환값에 대한 **대입**을 경고한다.
       규칙을 끄지 않고(규약 4-6) 같은 일을 하는 메서드로 바꿨다. `scroll-behavior`를
       어디에도 주지 않으므로 기본값 `auto`(즉시)이고 결과는 대입과 같다. */
    scrollRoot?.scrollTo(0, 0)
  }, [pathname, scrollRoot])

  return (
    <div key={pathname} className="blur-in">
      <Outlet />
    </div>
  )
}

/**
 * N-04 파라미터 검증 — **형식만** 한다.
 *
 * `classNo ≤ classCountByGrade[grade]` 상한 검증은 부서 문서를 읽어야 하므로 **S5가 한다**
 * (`screens/ClassStudents.tsx` — W-11 §3.4). 여기로 끌어올리지 마라: 가드가 부서 문서를
 * 기다리면 `/grade/1/class/1` 정상 경로까지 조회가 끝날 때까지 아무 것도 못 그린다.
 *
 * **PRD 내부 충돌**: N-04는 `grade`·`classNo` 오류를 모두 S3으로 보내라 하고,
 * §8.5.3은 반 범위 초과를 S4로 보낸다. N-01(뒤로가기는 항상 한 단계 상위)의
 * 정신과 더 구체적인 규정을 따라 아래처럼 나눴다(지시서 §4.3).
 */
function toIndex(raw: string | undefined): number | null {
  /* `Number('')`는 0이고 `Number(' 2 ')`는 2다. 경로 파라미터를 그렇게 관대하게
     읽으면 `/grade/%202`가 통과한다. 십진수 표기만 받는다. */
  if (!raw || !/^\d+$/.test(raw)) return null
  return Number(raw)
}

function GradeGuard() {
  const { grade } = useParams()
  const toast = useToast()
  const value = toIndex(grade)
  const denied = value === null || value < 1 || value > 3

  useEffect(() => {
    if (denied) toast(TS_13)
  }, [denied, toast])

  if (denied) return <Navigate to="/" replace />
  return <Outlet />
}

function ClassGuard() {
  const { grade, classNo } = useParams()
  const toast = useToast()
  const value = toIndex(classNo)
  /* 상한은 S5가 본다(§8.5.3 · W-11 §3.4). 여기서는 "정수 1 이상"만 본다.
     S5도 **같은 문구(TS-13) · 같은 이동 방식(`/grade/{g}`로 `replace`)** 을 쓴다. */
  const denied = value === null || value < 1

  useEffect(() => {
    if (denied) toast(TS_13)
  }, [denied, toast])

  /* §8.5.3 — 반 파라미터 오류는 홈이 아니라 **반 선택(S4)** 으로 되돌린다. */
  if (denied) return <Navigate to={`/grade/${grade}`} replace />
  return <Outlet />
}

const DOCK_HANDLE: RouteHandle = { hasDock: true }

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      /* EC-44 — 정책 3종은 가드 **바깥**이고 인증 판정도 기다리지 않는다.
         미인증이든 판정 중이든 직접 URL 진입에 정상 렌더해야 한다.
         S1 Footer에서 들어오는 경로이기 때문이다. */
      {
        element: <ScreenTransition />,
        handle: { skipsAuthGate: true } satisfies RouteHandle,
        children: [
          { path: 'policy/privacy', element: <PolicyPrivacy /> },
          { path: 'policy/terms', element: <PolicyTerms /> },
          { path: 'policy/oss', element: <PolicyOss /> },
        ],
      },

      {
        element: <RequireAuth />,
        children: [
          /* 독이 없는 인증 화면들. `allow`를 적지 않은 라우트는 활성 부원 전용이다. */
          {
            element: <ScreenTransition />,
            children: [
              {
                path: 'login',
                element: <Login />,
                handle: { allow: ['signedOut', 'domainRejected', 'suspended'] } satisfies RouteHandle,
              },
              {
                path: 'signup',
                element: <Signup />,
                /* BR-28 — 거절 계정은 재신청할 수 있다. S2-1의 `가입 코드 다시 입력`이
                   여기로 오므로 `rejected`가 없으면 `/pending`으로 되튕긴다.
                   **착지 표는 그대로다** — `rejected`의 기본 착지는 여전히 `/pending`이고,
                   `allow` 확장은 "직접 이동이 허용된다"는 뜻일 뿐이다(§4). */
                handle: { allow: ['noProfile', 'withdrawn', 'rejected'] } satisfies RouteHandle,
              },
              {
                path: 'pending',
                element: <Pending />,
                handle: { allow: ['pending', 'rejected'] } satisfies RouteHandle,
              },
              {
                /* 가드가 `:grade`를 읽어야 해서 경로 조각을 직접 갖는다. */
                path: 'grade/:grade',
                element: <GradeGuard />,
                children: [
                  { index: true, element: <GradeClasses /> },
                  {
                    path: 'class/:classNo',
                    element: <ClassGuard />,
                    children: [{ index: true, element: <ClassStudents /> }],
                  },
                ],
              },
            ],
          },

          /* §6.2 독 노출 5화면. `DockLayout`은 레이아웃 라우트라 탭을 옮겨도
             언마운트되지 않는다 — 독이 계속 살아 있어야 알약이 미끄러진다. */
          {
            element: <DockLayout />,
            handle: DOCK_HANDLE,
            children: [
              {
                element: <ScreenTransition />,
                children: [
                  { index: true, element: <Home /> },
                  { path: 'records', element: <Records /> },
                  {
                    path: 'admin',
                    element: (
                      <RequireRole roles={ADMIN_ROLES}>
                        <Admin />
                      </RequireRole>
                    ),
                  },
                  { path: 'duty', element: <Duty /> },
                  { path: 'settings', element: <Settings /> },
                ],
              },
            ],
          },
        ],
      },

      /* 정의되지 않은 경로 → `/`. 거기서 §3이 인증 상태에 따라 다시 분기한다.
         `replace`가 아니면 뒤로가기가 막힌 경로와 홈 사이를 무한 왕복한다. */
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
