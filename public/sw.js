/**
 * SunDO 서비스 워커 — W-20 · PRD §18.2 · EC-01 · CP-02 · EC-44.
 *
 * 🔴 **W-19의 워커는 아무것도 캐시하지 않았다. 이 판본이 그것을 바꾼다.**
 * 그래서 W-19 §8-2의 문장(「낡은 워커가 남아도 증상이 없다」)은 **오늘부터 거짓이다.**
 * 되돌리는 법은 `database_ToDo/W-20.md` §1에 있다 — 배포보다 먼저 적었다.
 *
 * 🔴 **Workbox를 쓰지 않는다**(W-20 결정 1). 버전 캐시명·삭제·즉시 활성화 경로가
 * W-19에서 이미 서 있었고, 여기서 더한 것은 `fetch` 핸들러 하나다.
 *
 * 🔴 **`__APP_VERSION__`·`__PRECACHE__`·`__PRECACHE_HASH__`는 빌드가 치환한다**
 * (`vite.config.ts`의 `swVersion` 플러그인). 손으로 목록을 적지 마라 —
 * 파일이 하나 늘 때마다 조용히 빠진다.
 */

const VERSION = '__APP_VERSION__'

/**
 * 🔴 **캐시 이름에 버전 + 목록 해시를 함께 넣는다**(W-19 계약 1의 확장).
 *
 * 버전만 넣으면 **같은 버전으로 다시 빌드했을 때** 이름이 그대로라 `activate`가
 * 옛 항목을 지우지 못하고 캐시에 쌓인다. 목록 해시가 붙으면 자산이 한 글자라도
 * 바뀔 때 이름이 바뀌고, 아래 `activate`가 옛 것을 통째로 지운다.
 */
const CACHE = `sundo-shell-v${VERSION}-__PRECACHE_HASH__`

/** 앱 셸. `/assets/**`(해시 붙은 JS·CSS) + `/index.html`. */
const PRECACHE = __PRECACHE__

/** 내비게이션 폴백. §18.2 「네트워크 실패 시 앱 셸 렌더 후 캐시 데이터 표시」. */
const SHELL = '/index.html'

/**
 * 내비게이션 network-first의 제한 시간.
 *
 * ⚠ W-15A는 「임의의 제한 시간은 느린 네트워크와 끊김을 구분하지 못한다」로 **배치 쓰기**의
 * 타임아웃을 물렸다. 🔴 **여기서는 그 논리가 반대로 선다** — 판단이 틀렸을 때의 결과가
 * 다르기 때문이다. 배치는 틀리면 **기록이 사라질 수 있다.** 내비게이션은 틀려도
 * **직전 배포의 앱 셸을 그린다** — 그 셸은 자기 자산과 함께 한 벌로 캐시돼 있어
 * 온전히 동작하고, 데이터는 어차피 Firestore 캐시가 따로 준다.
 * ⇒ **안전한 쪽으로 실패하는 타임아웃**이라 둔다.
 */
const NAV_TIMEOUT_MS = 3000

/** cache-first로 다루는 경로. 이름이 곧 내용인 것들(해시)과 바뀌지 않는 자산이다. */
const ASSET = /^\/(?:assets|fonts|icons)\/|^\/favicon\.ico$/

self.addEventListener('install', (event) => {
  /* 🔴 `skipWaiting()`을 부르지 않는다. §18.2가 「새 SW 감지 시 배너, 탭 시 skipWaiting」을
     규정하므로 **대기 상태가 필요하다.** 그 대기를 푸는 경로는 아래 `message`다. */
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      /* W-19 계약 2 — 이 판본이 아닌 캐시는 전부 지운다. */
      const names = await caches.keys()
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  /* 🔴 **교차 출처는 손대지 않는다.** `firestore.googleapis.com`이 여기로 온다 —
     §18.2가 「Firestore 요청은 SW 캐시 대상에서 제외」로 못 박았고, SDK가 자기
     오프라인 캐시를 갖는다(§2.1의 두 번째 층). 가로채면 두 캐시가 겹쳐 진단이 불가능해진다. */
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(navigateNetworkFirst(request))
    return
  }

  if (ASSET.test(url.pathname)) {
    event.respondWith(assetCacheFirst(request))
  }

  /* 그 밖(`/sw.js`·`/manifest.webmanifest`)은 `respondWith`를 부르지 않는다 —
     브라우저 기본 경로로 간다. 둘은 Hosting이 `no-cache`를 걸어 둔 파일이다. */
})

/**
 * 🔴 **내비게이션은 network-first다**(W-20 §3.2 판단).
 *
 * 온라인이면 **항상 새 `index.html`**을 받고, 그 안의 새 해시 자산은 아래
 * `assetCacheFirst`가 캐시 미스로 받아 온다. ⇒ **업데이트 배너를 무시한 기기도
 * 온라인이면 화면은 최신이다.** 낡은 채로 남는 것은 서비스 워커 코드뿐이다.
 */
async function navigateNetworkFirst(request) {
  try {
    return await withTimeout(fetch(request), NAV_TIMEOUT_MS)
  } catch {
    const cached = await caches.match(SHELL)
    /* 🔴 캐시에도 없으면(설치 전 첫 방문이 오프라인) **브라우저 기본 오류 화면**으로 둔다.
       §8.10에 그 상황의 문구가 없다 — 만들지 않는다(규약 4-5 · 보고서 §7). */
    return cached ?? Response.error()
  }
}

async function assetCacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  const fresh = await fetch(request)
  /* 성공한 동일 출처 응답만 담는다. `opaque`·오류 응답을 담으면 캐시가 오염된다. */
  if (fresh.ok && fresh.type === 'basic') {
    const cache = await caches.open(CACHE)
    await cache.put(request, fresh.clone())
  }
  return fresh
}

function withTimeout(promise, ms) {
  let timer
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('nav-timeout')), ms)
  })
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer))
}
