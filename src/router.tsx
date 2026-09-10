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
import Home from './screens/Home'
import Login from './screens/Login'

/* ============================================================
   🔴 **W-27 — 화면 13장 중 11장을 코드 분할했다.**

   **왜.** 옛 빌드는 번들이 **1개 · 1,109 kB**였고 앱을 켤 때마다 그 전부를 파싱했다.
   폰에서 이것은 눈에 보이는 지연이다. 지금은 부팅 경로에 필요한 것만 파싱한다.

   🔴 **`Home`과 `Login`만 즉시 로드다.** manifest의 `start_url`이 `/?source=pwa`라
   **PWA를 켜면 항상 인덱스 라우트에 착지한다** — 그 자리를 분할하면 켜는 순간
   청크 하나를 더 기다리게 되어 고치려던 것을 되살린다. `Login`은 미인증 계정이
   그 착지에서 곧바로 밀려 가는 곳이라 같은 이유로 남겼다.

   🔴 **`React.lazy`가 아니라 라우터의 `lazy`다.** `React.lazy`는 `Suspense` 폴백을
   요구하고, 그 폴백이 화면 전환마다 **빈 칸으로 번쩍인다.** 라우터의 `lazy`는
   청크가 도착할 때까지 **이전 화면을 그대로 둔 채** 전환을 붙잡으므로 깜빡임이 없다.

   ⚠ **오프라인 도달성(EC-01·EC-44)은 그대로다.** `vite.config.ts`의 `collectShell`이
   `/assets/**`를 전부 precache하므로 **분할된 청크도 한 벌로 설치된다.** 즉 설치가
   받아 오는 총 바이트는 변하지 않고, **켤 때 파싱하는 양만** 줄어든다.
   ⚠ 새 화면을 추가할 때 이 표에 넣지 않으면 즉시 로드가 되어 조용히 부팅이 무거워진다.
   ============================================================ */
const loadAdmin = () => import('./screens/Admin')
const loadClassStudents = () => import('./screens/ClassStudents')
const loadDuty = () => import('./screens/Duty')
const loadGradeClasses = () => import('./screens/GradeClasses')
const loadPending = () => import('./screens/Pending')
const loadPolicyOss = () => import('./screens/PolicyOss')
const loadPolicyPrivacy = () => import('./screens/PolicyPrivacy')
const loadPolicyTerms = () => import('./screens/PolicyTerms')
const loadRecords = () => import('./screens/Records')
const loadSettings = () => import('./screens/Settings')
const loadSignup = () => import('./screens/Signup')

/**
 * 위 `import()` 하나를 라우터가 아는 형태(`{ Component }`)로 바꾼다.
 *
 * ⚠ **로더 이름을 `load*`로 둔 것은 취향이 아니다.** `Admin`처럼 대문자로 두면
 * oxlint의 `react(only-export-components)`가 **컴포넌트로 오인해** 이 파일에만
 * 경고 11개를 새로 만든다(기준선 18 유지 · 규약 4-6과 같은 태도).
 * 이름이 하는 일과도 맞다 — 이것들은 컴포넌트가 아니라 **청크를 가져오는 함수**다.
 */
function screen(load: () => Promise<{ default: React.ComponentType }>) {
  return async () => ({ Component: (await load()).default })
}

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
          { path: 'policy/privacy', lazy: screen(loadPolicyPrivacy) },
          { path: 'policy/terms', lazy: screen(loadPolicyTerms) },
          { path: 'policy/oss', lazy: screen(loadPolicyOss) },
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
                lazy: screen(loadSignup),
                /* BR-28 — 거절 계정은 재신청할 수 있다. S2-1의 `가입 코드 다시 입력`이
                   여기로 오므로 `rejected`가 없으면 `/pending`으로 되튕긴다.
                   **착지 표는 그대로다** — `rejected`의 기본 착지는 여전히 `/pending`이고,
                   `allow` 확장은 "직접 이동이 허용된다"는 뜻일 뿐이다(§4). */
                handle: { allow: ['noProfile', 'withdrawn', 'rejected'] } satisfies RouteHandle,
              },
              {
                path: 'pending',
                lazy: screen(loadPending),
                handle: { allow: ['pending', 'rejected'] } satisfies RouteHandle,
              },
              {
                /* 가드가 `:grade`를 읽어야 해서 경로 조각을 직접 갖는다. */
                path: 'grade/:grade',
                element: <GradeGuard />,
                children: [
                  { index: true, lazy: screen(loadGradeClasses) },
                  {
                    path: 'class/:classNo',
                    element: <ClassGuard />,
                    children: [{ index: true, lazy: screen(loadClassStudents) }],
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
                  /* 🔴 인덱스는 즉시 로드다 — `start_url`의 착지점이다(위 표 주석). */
                  { index: true, element: <Home /> },
                  { path: 'records', lazy: screen(loadRecords) },
                  {
                    path: 'admin',
                    /* 🔴 **역할 가드는 분할 안쪽이 아니라 바깥에 남는다.** `RequireRole`은
                       즉시 로드된 채로 있고, 청크가 도착한 뒤 그 안을 감싼다. */
                    lazy: async () => {
                      const { default: AdminScreen } = await loadAdmin()
                      return {
                        Component: () => (
                          <RequireRole roles={ADMIN_ROLES}>
                            <AdminScreen />
                          </RequireRole>
                        ),
                      }
                    },
                  },
                  { path: 'duty', lazy: screen(loadDuty) },
                  { path: 'settings', lazy: screen(loadSettings) },
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
