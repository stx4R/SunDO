import { useContext } from 'react'
import { createPortal } from 'react-dom'
import { useInstallGuide } from '../lib/pwa'
import { DockRootContext } from './AppShell'
import { InstallBanner } from './InstallBanner'
import { UpdateBanner } from './UpdateBanner'

/**
 * PWA 배너 2종(design `10c`·`10d`)의 **유일한 마운트 지점**.
 * 🔴 **W-30 — 옛 자리는 `routes/DockLayout.tsx`였다.** 거기 있던 이유와 떠난 이유는
 * 그 파일 머리 주석에 남겨 뒀다. 요약하면 「독 화면 = 로그인한 계정만 보는 화면」이라
 * **로그인을 막는 버그의 수리를 로그인하지 못한 사용자가 받을 수 없었다**(W-29 §5).
 *
 * 🔴 **둘이 동시에 뜨지 않는다.** 같은 좌표를 쓰므로 겹치면 한쪽이 다른 쪽을 가린다.
 * 업데이트가 우선이다 — 설치 안내는 닫기 전까지 계속 뜨지만(EC-24 「1회」),
 * 업데이트는 **놓치면 그 기기가 낡은 채로 남는** 정보다.
 *
 * 🔴 **설치 안내는 독 화면에서만 뜬다.** W-19가 `DockLayout`을 고른 근거 ②를 그대로
 * 옮긴 것이다 — 설치를 권할 대상은 **승인된 부원**이지 로그인 전 방문자가 아니고,
 * M-08도 설치율을 「승인된 부원 중」으로 잰다(§4). 넓어진 것은 업데이트 배너뿐이다.
 *
 * ⚠ **감지 훅(`useServiceWorkerUpdate`)을 여기서 부르지 않는다.** `RootLayout`이
 * 한 번 부르고 결과만 내려 준다 — 그 값이 `AppShell`의 하단 여백도 함께 정하기 때문이다.
 * 여기서 또 부르면 `controllerchange` 구독이 두 벌이 된다.
 *
 * ⚠ 스테이지 직계(`DockRootContext`)로 내보내야 `position: absolute`가 스테이지를
 * 기준으로 잡힌다(`.dock`과 같은 이유). 첫 렌더에는 `null`이라 아무것도 그리지 않는다.
 */
export function PwaBanners({
  hasDock,
  updateReady,
  applyUpdate,
}: {
  hasDock: boolean
  updateReady: boolean
  applyUpdate: () => void
}) {
  const dockRoot = useContext(DockRootContext)
  const installGuide = useInstallGuide()

  const banner = updateReady ? (
    <UpdateBanner onApply={applyUpdate} hasDock={hasDock} />
  ) : hasDock && installGuide.show ? (
    <InstallBanner onDismiss={installGuide.dismiss} />
  ) : null

  if (!dockRoot || !banner) return null
  return createPortal(banner, dockRoot)
}
