/**
 * SunDO 최소 서비스 워커 — W-19 · PRD §18.2.
 *
 * 🔴 **이 워커는 아무것도 캐시하지 않는다.** 임무는 「설치 가능하게 만드는 것」까지이고
 * 캐시 전략·오프라인 폴백은 **W-20**이 짓는다(지시서 §0.6).
 * 그래서 `caches.open`도, `precache` 목록도 여기 없다 — 그 부재가 계약이다.
 *
 * ⚠ **`index.html`을 캐시하지 마라**(§3.3-5). 지금 캐시하면 새 배포가 사용자에게 가지 않는다.
 * W-20이 캐시를 붙일 때는 `CACHE` 이름을 올려서 아래 `activate`가 옛 것을 지우게 하라.
 *
 * 🔴 **`__APP_VERSION__`은 빌드 시각에 치환된다**(`vite.config.ts`의 `swVersion` 플러그인).
 * 리터럴로 박지 마라 — GT-07이 버전을 한 곳(`package.json`)에서만 나오게 한다.
 * 개발 서버에서도 미들웨어가 같은 치환을 한다.
 */

const VERSION = '__APP_VERSION__'

/* §3.3-1 — 🔴 **캐시 이름에 버전을 넣는다.** 버전 없는 캐시는 W-20이 전략을 바꿀 때
   지울 방법이 없다. 지금은 이 이름으로 여는 캐시가 없지만, 이름 규약이 먼저 서야
   아래 `activate`의 「이 버전이 아닌 것은 전부 지운다」가 성립한다. */
const CACHE = `sundo-shell-v${VERSION}`

/**
 * §3.3-3 — 🔴 **새 SW가 즉시 활성화되는 경로.**
 *
 * `install`에서 `skipWaiting()`을 **자동으로 부르지 않는다.** §18.2가 「새 SW 감지 시
 * 하단 배너 노출, 탭 시 `skipWaiting` 후 리로드」를 규정하므로 대기 상태가 필요하다.
 * 대신 그 경로를 아래 `message` 핸들러가 연다 — `lib/pwa.ts`가 `SKIP_WAITING`을 보낸다.
 *
 * 🔴 **경로가 없으면 낡은 SW가 붙박이가 되어 그 기기는 새 배포를 영영 못 받는다.**
 * 이 워커가 아무것도 캐시하지 않아서 낡은 채로 남아도 **콘텐츠는 네트워크에서 오지만**,
 * W-20이 캐시를 붙이는 순간 그 사실이 바뀐다. 경로를 지워도 지금은 증상이 없다 —
 * 그래서 더 위험하다.
 */
self.addEventListener('install', () => {
  /* 아무것도 하지 않는다. `event.waitUntil`을 붙일 일이 생기면 W-20이다. */
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      /* §3.3-2 — 🔴 **옛 버전 캐시를 지운다.** 안 지우면 기기에 쌓인다.
         이 워커가 만든 캐시가 없어도 돌려 둔다 — W-20이 캐시를 붙인 뒤 그 다음 배포가
         이 코드를 처음 필요로 하는데, 그때 없으면 이미 늦다. */
      const names = await caches.keys()
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)))

      /* §3.3-3 — 활성화되는 즉시 열려 있는 탭들의 컨트롤러가 된다.
         이것이 없으면 새 SW는 다음 내비게이션까지 아무 클라이언트도 갖지 못한다. */
      await self.clients.claim()
    })(),
  )
})

/**
 * §18.2 업데이트 흐름의 절반. 나머지 절반은 `src/lib/pwa.ts`에 있다.
 * 배너를 탭하면 여기로 메시지가 오고, `skipWaiting()`이 대기 중인 이 워커를 활성화한다.
 * 클라이언트는 `controllerchange`를 보고 리로드한다.
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})
