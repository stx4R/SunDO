import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker } from './lib/pwa'

/* W-19 — PRD §18.2. 🔴 등록 실패는 삼킨다(`lib/pwa.ts`) — 앱은 서비스 워커에
   의존하지 않는다. 렌더보다 먼저 부르되 실제 등록은 `load` 이후로 미뤄진다. */
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
