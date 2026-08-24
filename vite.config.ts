import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/* GT-07 — S10의 `버전` 값은 `package.json`과 **한 곳에서** 나와야 한다.
   리터럴로 박으면 다음 회차에 조용히 어긋난다(W-01 §6 — design 시안의 `1.0.0`은
   출시 목표값이지 빌드 버전이 아니다). 빌드 시각에 주입해 드리프트를 원천 차단한다. */
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// https://vite.dev/config/
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react(), tailwindcss()],
})
