import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { startAppHeightSync } from './lib/appHeight'
import { captureInstallPrompt, registerServiceWorker } from './lib/pwa'
import { blockPinchZoom } from './lib/zoom'

/* W-28 A-1 — 앱 높이를 **실측해서** `--app-h`에 심는다(`lib/appHeight.ts`).
   🔴 렌더보다 먼저다. 첫 프레임이 이미 옳은 높이로 그려져야 띠가 한 번도 보이지 않는다. */
startAppHeightSync()

/* W-19 — PRD §18.2. 🔴 등록 실패는 삼킨다(`lib/pwa.ts`) — 앱은 서비스 워커에
   의존하지 않는다. 렌더보다 먼저 부르되 실제 등록은 `load` 이후로 미뤄진다. */
registerServiceWorker()

/* W-23 B-9(b) — iOS Safari의 핀치 줌. viewport의 `user-scalable=no`를 iOS가 무시하므로
   여기서 함께 막는다. 🔴 **W-03A DoD 6을 폐기하는 결정이다**(`lib/zoom.ts` 주석). */
blockPinchZoom()

/* W-23 B-9(c) — `beforeinstallprompt`는 React가 마운트되기 **전에** 도착할 수 있다.
   여기서 잡아 두어야 S10의 `원클릭 설치` 행이 그것을 쓸 수 있다(`lib/pwa.ts` 주석). */
captureInstallPrompt()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
