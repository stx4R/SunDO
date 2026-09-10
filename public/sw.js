/**
 * SunDO 서비스 워커 — W-27 · W-20 · PRD §18.2 · EC-01 · CP-02 · EC-44.
 *
 * 🔴 **W-27 — 내비게이션이 network-first에서 cache-first로 바뀌었다(사용자 확정).**
 * W-20 §3.2의 결정(「온라인이면 **이번 실행에** 항상 최신 셸」)을 **일부러 폐기한다.**
 * 그 결정의 대가가 「PWA를 켤 때마다 `/index.html`을 네트워크에서 받을 때까지
 * 흰 화면」이었고, 사용자가 실기기에서 그것을 「뻑뻑함」으로 겪었다.
 * 🔴 **최신성은 사라지지 않고 한 실행 뒤로 밀린다** — `navigateShellFirst` 주석 참조.
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
 * 🔴 **W-27 결함 1 — `ignoreVary`가 없으면 오프라인에서 캐시가 통째로 헛돈다.**
 *
 * 🔬 **실측**(`vite preview`, 서버를 내린 채 `/records` 진입):
 * `caches.match('/assets/Records-*.js')` → **적중**인데
 * 같은 파일을 `import()`로 부르면 **`net::ERR_FAILED`**. 캐시에 있는데 못 꺼냈다.
 *
 * 원인은 저장된 응답의 **`vary: Origin`** 헤더다. Cache API의 기본 매칭은 `Vary`를
 * 존중해서 **「저장할 때의 요청 헤더」와 「지금 찾는 요청 헤더」가 그 헤더에 대해
 * 일치할 때만** 적중으로 친다. `install`의 `cache.addAll(PRECACHE)`가 만드는 요청과
 * 브라우저의 **모듈 스크립트 요청**은 그 점에서 다르고, 그래서 빗나갔다.
 * 빗나가면 `assetCacheFirst`가 `fetch`로 내려가고, 오프라인이면 그것이 throw해
 * `respondWith`가 거부되며 브라우저에는 네트워크 오류로 보인다.
 *
 * 🔴 **`ignoreVary: true`가 옳은 답인 이유** — 이 캐시에 담기는 것은 **우리가 precache한
 * 동일 출처 정적 자산뿐**이고, 그 이름에는 **내용 해시가 박혀 있다.** 즉 **URL이 내용을
 * 완전히 결정한다.** 요청 헤더에 따라 응답이 갈릴 여지가 처음부터 없으므로 `Vary` 매칭이
 * 지켜 줄 것이 없고, 대가만 남는다.
 *
 * ⚠ **이 결함은 W-20부터 있었다.** 옛 판본에서는 자산이 빗나가도 network-first 내비게이션
 * 뒤에 온라인 `fetch`가 조용히 메웠기 때문에 **증상이 보이지 않았을 뿐**이다.
 * 즉 「오프라인에서 앱이 열린다」(EC-01)는 그동안 **측정된 적 없는 가정**이었다.
 */
const MATCH = { ignoreVary: true }

/**
 * 내비게이션의 네트워크 제한 시간.
 *
 * 🔴 **W-27 — 이제 「셸이 캐시에 없을 때」에만 쓰인다.** 즉 서비스 워커가 처음
 * 설치되기 전의 첫 방문 한 번뿐이다. 정상 실행 경로는 이 타이머에 닿지 않는다.
 *
 * ⚠ W-15A는 「임의의 제한 시간은 느린 네트워크와 끊김을 구분하지 못한다」로 **배치 쓰기**의
 * 타임아웃을 물렸다. 🔴 **여기서는 그 논리가 반대로 선다** — 판단이 틀렸을 때의 결과가
 * 다르기 때문이다. 배치는 틀리면 **기록이 사라질 수 있다.** 내비게이션은 틀려도
 * **직전 배포의 앱 셸을 그린다** — 그 셸은 자기 자산과 함께 한 벌로 캐시돼 있어
 * 온전히 동작하고, 데이터는 어차피 Firestore 캐시가 따로 준다.
 * ⇒ **안전한 쪽으로 실패하는 타임아웃**이라 둔다.
 */
const NAV_TIMEOUT_MS = 3000

/**
 * cache-first로 다루는 경로. 이름이 곧 내용인 것들(해시)과 바뀌지 않는 자산이다.
 *
 * 🔴 **W-27 — `/DSHS.png`·`/DSHSS.png`를 넣었다.** 둘은 아바타 자리에 쓰이는
 * 브랜드 이미지인데(S2·S2-1·S3·S6·S7·S8·S10 — 참조 9곳) **루트에 있어서** 이 목록에
 * 걸리지 않았다. Hosting의 `**` 규칙이 `no-cache`라 **매 실행 재검증 왕복**이 돌았다.
 * ⚠ 대가: 로고를 갈아 끼워도 **서비스 워커 판본이 바뀔 때까지** 옛 그림이 나온다.
 * 글꼴·아이콘이 이미 같은 계약이고, `activate`가 판본마다 캐시를 통째로 비우므로
 * 배포 1회분 이상 늦어지지 않는다.
 */
const ASSET = /^\/(?:assets|fonts|icons)\/|^\/favicon\.ico$|^\/DSHSS?\.png$/

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

  /* 🔴 **W-29 — Firebase Hosting 예약 경로(`/__/**`)는 우리 것이 아니다. 절대 답하지 마라.**
   *
   * 🔬 이것이 「무한 로그인 루프」의 원인이었다. `authDomain`이 `sundo.today` —
   * **앱과 같은 출처**라, Google 로그인이 여는 `/__/auth/handler`와 `/__/auth/iframe`이
   * 둘 다 `mode: 'navigate'`로 들어와 아래 `navigateShellFirst`에 걸렸다.
   * 그 함수는 **경로를 보지 않고** 캐시된 `/index.html`을 돌려주므로, 인증 핸들러 자리에
   * **앱 셸이 대신 떴다.** 자격 증명이 부모 창으로 돌아올 길이 없어 계정은 영영
   * 로그아웃 상태로 남고, 화면은 로그인으로 되돌아온다 — 팝업(브라우저)·리다이렉트(PWA)
   * 양쪽 모두 같은 이유로 죽는다.
   * 🔬 실측: 서버는 `curl https://sundo.today/__/auth/handler`에 진짜 핸들러를 준다.
   * 같은 주소를 **브라우저**로 열면 `#root`가 있는 SunDO 화면이 떴다 — 가로챈 것은 이 워커다.
   *
   * 🔴 **W-20의 network-first에서는 증상이 없었다.** 그때는 네트워크가 진짜 핸들러를
   * 가져왔고, 타임아웃 폴백일 때만 셸이 나갔다. W-27이 cache-first로 바꾸면서
   * **가끔 실패하던 것이 항상 실패하는 것으로** 바뀌었다.
   *
   * ⚠ **오프라인 폴백을 붙이지 않는다.** 이 경로는 애초에 네트워크가 있어야 의미가 있고,
   * 브라우저 기본 경로로 내려보내는 것이 유일하게 옳은 처리다. */
  if (url.pathname.startsWith('/__/')) return

  if (request.mode === 'navigate') {
    event.respondWith(navigateShellFirst(request))
    return
  }

  if (ASSET.test(url.pathname)) {
    event.respondWith(assetCacheFirst(request))
  }

  /* 그 밖(`/sw.js`·`/manifest.webmanifest`)은 `respondWith`를 부르지 않는다 —
     브라우저 기본 경로로 간다. 둘은 Hosting이 `no-cache`를 걸어 둔 파일이다. */
})

/**
 * 🔴 **내비게이션은 cache-first다**(W-27 · 사용자 확정. W-20 §3.2를 뒤집는다).
 *
 * PWA를 켜는 것은 **내비게이션**이다(`start_url`이 `/?source=pwa`). 옛 판본은 그때마다
 * 네트워크를 먼저 기다렸고, 그것이 매 실행의 흰 화면이었다. 여기서는 **precache의 셸을
 * 곧바로 돌려준다** — 네트워크가 아무리 좋아도 이기지 못하는 0 왕복이다.
 *
 * 🔴 **최신성은 사라지지 않고 「한 실행 뒤」로 밀린다. 셸을 몰래 덮어쓰지 않기 때문이다.**
 * 브라우저는 내비게이션마다 `/sw.js`를 다시 확인하고(Hosting이 `no-cache`를 건다),
 * `lib/pwa.ts`가 탭 복귀마다 `registration.update()`를 부른다. 새 판본이 있으면
 * `install`이 **새 캐시 이름으로 새 셸 + 새 자산을 한 벌로** 담고 대기에 들어간다.
 * ⇒ ① 사용자가 업데이트 배너를 탭하면 즉시, ② 무시해도 앱을 완전히 닫았다 켜면
 * 대기 워커가 활성화되어 다음 실행에 최신이 된다.
 *
 * 🔴 **여기서 셸만 따로 갱신하지 않는 이유 — precache는 「한 벌」이어야 한다.**
 * `install`의 `cache.addAll`은 `/index.html`과 그 안에서 참조하는 해시 자산을
 * **원자적으로** 담는다. 이 자리에서 새 `index.html`만 옛 캐시에 밀어 넣으면
 * 그 셸이 가리키는 새 자산은 캐시에 없고, **다음 오프라인 실행에서 앱이 통째로 깨진다**
 * (EC-01이 지켜야 하는 바로 그 상황이다). 「조금 더 최신」을 얻으려고
 * 「오프라인에 열린다」를 거는 거래는 성립하지 않는다.
 */
async function navigateShellFirst(request) {
  const cached = await caches.match(SHELL, MATCH)
  if (cached) return cached

  /* 여기 오는 것은 **서비스 워커가 설치되기 전의 첫 방문**뿐이다(`install`이
     `addAll`에 실패했거나, 캐시가 브라우저에 의해 비워진 드문 경우 포함). */
  try {
    return await withTimeout(fetch(request), NAV_TIMEOUT_MS)
  } catch {
    /* 🔴 캐시에도 없고 네트워크도 없다. **브라우저 기본 오류 화면**으로 둔다.
       §8.10에 그 상황의 문구가 없다 — 만들지 않는다(규약 4-5 · W-20 보고서 §7). */
    return Response.error()
  }
}

async function assetCacheFirst(request) {
  const cached = await caches.match(request, MATCH)
  if (cached) return cached

  /* 🔴 **W-27 결함 1의 나머지 절반 — 여기서 던지면 브라우저에는 그냥 「실패」다.**
     캐시에 없고 네트워크도 없을 때 `fetch`의 거부를 그대로 흘리면 `respondWith`가
     거부되고, 그 순간 화면은 **원인을 알 수 없는 빈 화면**이 된다. 던지지 않고
     명시적인 오류 응답을 돌려준다 — 결과는 같지만 **여기가 원인 지점임이 드러난다.** */
  let fresh
  try {
    fresh = await fetch(request)
  } catch {
    return Response.error()
  }

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
