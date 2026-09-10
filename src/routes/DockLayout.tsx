import { useContext, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { DockRootContext } from '../components/AppShell'
import { Dock, type DockTab } from '../components/Dock'
import { useToast } from '../components/Toast'
import { useAuth } from '../contexts/AuthProvider'
import { watchPendingFlush } from '../lib/records'

/**
 * PRD §6.2 — 독을 노출하는 5개 라우트(S3·S7·S8·S9·S10)의 공통 부모.
 *
 * 여백을 만들지 않는다. `AppShell`이 `hasDock`으로 이미 소유한다 —
 * 이 라우트들의 `handle.hasDock`을 `RootLayout`이 읽어 `AppShell`에 넘긴다.
 *
 * 독은 `createPortal`로 스테이지 직계로 내보낸다. 이 컴포넌트가 반환하는
 * 트리는 스크롤 영역 안이라 그대로 두면 본문과 함께 스크롤된다.
 *
 * **레이아웃 라우트라 탭을 옮겨도 언마운트되지 않는다.** 독이 다시 마운트되면
 * 활성 알약이 첫 페인트 억제 상태로 되돌아가 가로 슬라이드(§7.4)가 죽는다.
 *
 * 🔴 **W-30 — PWA 배너 2종(design `10c`·`10d`)이 여기를 떠나 `router.tsx`로 갔다.**
 *
 * W-19가 여기를 고른 근거는 셋이었고 그중 둘은 지금도 참이다 — ② 설치를 권할 대상은
 * **승인된 부원**이다 · ③ 탭을 옮겨도 언마운트되지 않는다. 셋 다 `RootLayout`에서도
 * 성립하고(그쪽도 언마운트되지 않는다), ②는 `hasDock` 한 줄로 그대로 지켜진다.
 *
 * 🔴 **근거 ①이 무너진 것이 이사의 이유다.** 「독이 없는 화면의 좌표가 규격에 없다」는
 * 이유로 배너를 독 화면에 가둔 결과, **로그인을 막는 버그의 수리를 로그인하지 못한
 * 사용자가 받을 수 없게 됐다**(W-29 §5). 없던 좌표는 `.pwab-nodock`으로 정했다.
 *
 * ⚠ 배너를 화면에서 직접 그리지 마라. `OfflineBanner`와 같은 규율이다 — 두 개가 된다.
 */

const TAB_PATH: Readonly<Record<DockTab, string>> = {
  home: '/',
  records: '/records',
  duty: '/duty',
  admin: '/admin',
  settings: '/settings',
}

/**
 * §13.2 NT-07 · EC-02 · EC-41 원문. `{n}`만 채운다.
 * 🔴 세 조항이 **같은 문자열**을 규정하므로 신규 문구가 아니다.
 */
const NT_07 = (n: number) => `전송 대기 중이던 기록 ${n}건을 전송했습니다`

const PATH_TAB = new Map<string, DockTab>(
  (Object.entries(TAB_PATH) as [DockTab, string][]).map(([tab, path]) => [path, tab]),
)

export function DockLayout() {
  const dockRoot = useContext(DockRootContext)
  const { profile } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const toast = useToast()

  /**
   * NT-07 — 🔴 **여기가 전역 소유자다.** S7이 아니다.
   *
   * 오프라인 기록은 S5(반 학생 목록)에서 작성되는데 그 화면은 `DockLayout` **밖**이라
   * 전송이 끝나는 순간 구독자가 없을 수 있다. `lib/records.ts`가 그 경우를 쌓아 두었다가
   * 여기서 구독할 때 한 번에 준다 — 그래서 「가장 필요한 순간에만 안 뜨는」 토스트가 되지 않는다.
   */
  useEffect(() => watchPendingFlush((flushed) => toast(NT_07(flushed))), [toast])

  /* 이 레이아웃 아래 라우트는 5개뿐이라 목록에 없는 경로가 올 수 없다.
     그래도 홈으로 떨어뜨려 독이 활성 탭 없이 그려지는 상태를 만들지 않는다. */
  const active = PATH_TAB.get(pathname) ?? 'home'

  /* `RequireAuth`가 `allow: ['active']`로 막아 두어 여기까지 오면 프로필이 있다.
     그래도 옵셔널 체이닝을 남긴다 — 없으면 4탭이 가장 좁은 쪽이다. */
  const role = profile?.role ?? 'member'

  return (
    <>
      <Outlet />
      {dockRoot &&
        createPortal(
          <Dock
            active={active}
            role={role}
            /* N-03 — 탭 이동은 히스토리를 쌓지 않는다. 탭 이동 뒤 뒤로가기는
               직전 탭이 아니라 앱 종료 동작이 되어야 한다. */
            onChange={(tab) => navigate(TAB_PATH[tab], { replace: true })}
          />,
          dockRoot,
        )}
    </>
  )
}
