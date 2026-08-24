import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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
/**
 * W-20 — 🔴 **precache 목록을 손으로 적지 않는다**(결정 1).
 *
 * `dist`를 훑어 **규칙으로** 고른다. 손으로 적으면 파일이 하나 늘 때마다 조용히 빠진다.
 *
 * 🔴 **담는 것은 앱 셸뿐이다** — `/index.html` + `/assets/**`(해시 붙은 JS·CSS).
 * ⚠ **글꼴·아이콘은 일부러 뺐다.** 런타임 cache-first가 첫 온라인 방문에 담는데,
 * **오프라인 상태로는 애초에 앱에 들어올 수 없다** — S1이 「오프라인 상태에서는
 * 로그인할 수 없습니다」로 막는다(§8.1.5). 즉 오프라인이 되는 시점에는 이미 담겨 있다.
 * 반대로 precache에 넣으면 설치할 때마다 **쓰이지 않는 Thin·Light 337 kB**까지 받는다
 * (W-19 §2.5 — 앱이 실제로 쓰는 굵기는 400·500·700뿐이다).
 */
function collectShell(distDir: string): string[] {
  const out: string[] = []
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = `${prefix}/${entry.name}`
      if (entry.isDirectory()) walk(`${dir}/${entry.name}`, rel)
      else if (rel === '/index.html' || rel.startsWith('/assets/')) out.push(rel)
    }
  }
  walk(distDir, '')
  return out.sort()
}

function swVersion(): Plugin {
  const SW = 'sw.js'
  return {
    name: 'sundo-sw-version',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || req.url.split('?')[0] !== `/${SW}`) return next()
        const source = readFileSync(new URL(`./public/${SW}`, import.meta.url), 'utf8')
        res.setHeader('Content-Type', 'text/javascript')
        /* 개발 중에는 워커를 절대 캐시하지 않는다. 캐시되면 갱신 검증이 거짓말을 한다. */
        res.setHeader('Cache-Control', 'no-store')
        /* 개발 서버에는 `dist`가 없다. precache를 비우면 내비게이션은 network-first의
           네트워크 경로만 타므로 개발 흐름이 그대로다. */
        res.end(
          source
            .split('__APP_VERSION__')
            .join(version)
            .split('__PRECACHE_HASH__')
            .join('dev')
            .split('__PRECACHE__')
            .join('[]'),
        )
      })
    },
    closeBundle() {
      const distDir = fileURLToPath(new URL('./dist', import.meta.url))
      const shell = collectShell(distDir)
      /**
       * 🔴 **캐시 이름에 목록 해시를 넣는 이유**(`public/sw.js` 주석과 한 몸이다).
       * `/assets/**`는 이름 자체가 내용 해시라, 자산이 바뀌면 이 목록이 바뀌고
       * 따라서 해시가 바뀐다. `index.html`은 이름이 그대로지만 **그 안의 자산 이름**이
       * 바뀌므로 목록으로 잡힌다. ⇒ 같은 버전으로 다시 빌드해도 캐시가 갈린다.
       */
      const hash = createHash('sha256').update(shell.join('\n')).digest('hex').slice(0, 8)
      const out = new URL(`./dist/${SW}`, import.meta.url)
      const source = readFileSync(out, 'utf8')
        .split('__APP_VERSION__')
        .join(version)
        .split('__PRECACHE_HASH__')
        .join(hash)
        .split('__PRECACHE__')
        .join(JSON.stringify(shell))
      writeFileSync(out, source)
      console.log(`  sw.js  precache ${shell.length}개 · cache=sundo-shell-v${version}-${hash}`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react(), tailwindcss(), swVersion()],
})
