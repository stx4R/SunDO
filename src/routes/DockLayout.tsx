import { useContext } from 'react'
import { createPortal } from 'react-dom'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { DockRootContext } from '../components/AppShell'
import { Dock, type DockTab } from '../components/Dock'
import { useAuth } from '../contexts/AuthProvider'

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
 */

const TAB_PATH: Readonly<Record<DockTab, string>> = {
  home: '/',
  records: '/records',
  duty: '/duty',
  admin: '/admin',
  settings: '/settings',
}

const PATH_TAB = new Map<string, DockTab>(
  (Object.entries(TAB_PATH) as [DockTab, string][]).map(([tab, path]) => [path, tab]),
)

export function DockLayout() {
  const dockRoot = useContext(DockRootContext)
  const { profile } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()

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
