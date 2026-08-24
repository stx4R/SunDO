import { readFileSync, writeFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/* GT-07 — S10의 `버전` 값은 `package.json`과 **한 곳에서** 나와야 한다.
   리터럴로 박으면 다음 회차에 조용히 어긋난다(W-01 §6 — design 시안의 `1.0.0`은
   출시 목표값이지 빌드 버전이 아니다). 빌드 시각에 주입해 드리프트를 원천 차단한다. */
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

/**
 * W-19 — `public/sw.js`의 `__APP_VERSION__`을 빌드 버전으로 치환한다.
 *
 * 🔴 **`define`이 이 파일에 닿지 않는다.** `public/`은 번들 그래프 밖이라 Vite가
 * **바이트 그대로 복사**한다. 그래서 치환을 두 경로에 각각 붙인다.
 * - `configureServer` — 개발 서버가 `/sw.js`를 줄 때
 * - `closeBundle` — 빌드가 `dist/sw.js`를 복사한 뒤
 *
 * ⚠ 서비스 워커를 번들 엔트리로 올리지 마라. 파일 이름에 해시가 붙어 등록 URL이
 * 매 배포마다 바뀌고, 그러면 브라우저가 **같은 워커의 새 버전**이 아니라
 * **다른 워커**로 본다 — 옛 워커가 등록된 채로 남는다.
 */
function swVersion(): Plugin {
  const SW = 'sw.js'
  const inject = (source: string) => source.split('__APP_VERSION__').join(version)
  return {
    name: 'sundo-sw-version',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || req.url.split('?')[0] !== `/${SW}`) return next()
        const source = readFileSync(new URL(`./public/${SW}`, import.meta.url), 'utf8')
        res.setHeader('Content-Type', 'text/javascript')
        /* 개발 중에는 워커를 절대 캐시하지 않는다. 캐시되면 갱신 검증이 거짓말을 한다. */
        res.setHeader('Cache-Control', 'no-store')
        res.end(inject(source))
      })
    },
    closeBundle() {
      const out = new URL(`./dist/${SW}`, import.meta.url)
      writeFileSync(out, inject(readFileSync(out, 'utf8')))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react(), tailwindcss(), swVersion()],
})
