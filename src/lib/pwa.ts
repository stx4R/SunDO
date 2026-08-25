import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

/**
 * PWA 런타임 — W-19 · PRD §18.2 · EC-24 · EC-30.
 *
 * **화면은 `navigator.serviceWorker`를 직접 만지지 않는다.** 이 파일이 유일한 통로다
 * (`lib/*`가 계약을 소유하는 저장소 규율 그대로다).
 *
 * 🔴 **이 모듈은 캐시를 다루지 않는다.** 서비스 워커가 아무것도 캐시하지 않기 때문이다
 * (`public/sw.js` 주석). 캐시·오프라인은 W-20이다.
 */

/** 등록 URL. 🔴 **루트여야 한다** — `scope: '/'`가 모든 라우트를 덮는다. */
const SW_URL = '/sw.js'

/** EC-24 「1회 노출」의 저장 위치. ⚠ 규격에 판정 기준이 없다(보고서 §7 st4R). */
const A2HS_DISMISSED = 'sundo.a2hs.dismissed'

/**
 * §8.11.3 #6 · §8.11.5 · EC-24 — 홈 화면에서 실행 중인지.
 *
 * 🔴 **정의가 한 곳에 있어야 한다.** 소비자가 둘이다 — S10의 `설치됨` 표시와
 * 설치 안내 배너의 노출 조건. 두 벌이면 한쪽만 고쳐졌을 때 「설치됐다고 하면서
 * 설치하라는 배너를 띄우는」 상태가 조용히 생긴다.
 *
 * iOS Safari는 표준 `display-mode`를 오래 지원하지 않아 `navigator.standalone`을 함께 본다.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true
}

/**
 * iOS인지. 🔴 **`navigator.platform`을 쓰지 마라** — iPadOS 13+는 `MacIntel`을 돌려주어
 * 아이패드가 iOS가 아닌 것으로 판정된다. 터치 포인트로 갈라야 한다.
 */
export function isIOS(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))
}

/**
 * §3.3-6 — 🔴 **등록 실패가 앱을 죽이면 안 된다.**
 *
 * 등록은 부수 효과일 뿐이고 앱의 어떤 화면도 서비스 워커에 의존하지 않는다
 * (캐시를 안 하니 의존할 것이 없다). 사설 인증서·시크릿 창·엔터프라이즈 정책 등으로
 * 등록이 막히는 환경이 실재하므로 **삼키고 로그만 남긴다.**
 *
 * `load` 이후로 미루는 것은 등록이 첫 페인트의 네트워크와 경쟁하지 않게 하기 위해서다.
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(SW_URL, { scope: '/' }).catch((error: unknown) => {
      console.warn('[sundo] service worker 등록 실패 — 앱은 그대로 동작한다', error)
    })
  })
}

/**
 * §18.2 업데이트 흐름 — 「새 SW 감지 시 하단 배너, 탭 시 `skipWaiting` 후 리로드」.
 * design `10c`가 그 배너다.
 *
 * 🔴 **`controller`가 없으면 배너를 띄우지 않는다.** 첫 설치도 「대기 중인 워커」를
 * 만드는데, 그때 배너를 띄우면 방금 처음 연 사용자에게 `새 버전이 있습니다`가 뜬다.
 * `controller`가 있다는 것은 **이미 옛 워커가 이 페이지를 제어 중**이라는 뜻이다.
 *
 * ⚠ **SPA는 내비게이션을 하지 않는다.** 브라우저가 워커 스크립트를 다시 확인하는 계기가
 * 사실상 없어서, 탭을 다시 볼 때 `update()`를 직접 부른다. 이것이 없으면 배너는
 * 「코드에는 있지만 실기기에서 한 번도 뜨지 않는」 기능이 된다.
 */
export function useServiceWorkerUpdate(): { updateReady: boolean; applyUpdate: () => void } {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let alive = true

    /* 🔴 리로드는 **한 번만**. `controllerchange`는 여러 번 올 수 있고,
       빗장이 없으면 새로고침 루프가 된다 — 이 영역의 고전적인 사고다. */
    let reloading = false
    const onControllerChange = () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    let registration: ServiceWorkerRegistration | null = null

    const track = (reg: ServiceWorkerRegistration) => {
      const settle = (worker: ServiceWorker | null) => {
        if (!alive) return
        /* `installed` + 기존 컨트롤러 존재 = 「대기 중인 새 버전」이다. */
        if (worker && worker.state === 'installed' && navigator.serviceWorker.controller) {
          setWaiting(worker)
        }
      }
      settle(reg.waiting)
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing
        if (!installing) return
        installing.addEventListener('statechange', () => settle(installing))
      })
    }

    void navigator.serviceWorker.ready.then((reg) => {
      if (!alive) return
      registration = reg
      track(reg)
    })

    const onVisible = () => {
      if (document.visibilityState === 'visible') void registration?.update().catch(() => {})
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      alive = false
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return {
    updateReady: waiting !== null,
    applyUpdate: () => waiting?.postMessage({ type: 'SKIP_WAITING' }),
  }
}

/* ── W-23 B-9(c)(B-09) — 원클릭 설치 ──────────────────────────────────────
   🔴 **W-19의 「`beforeinstallprompt`를 잡아 두지 않는다」 결정을 되돌린다.**
   그때의 근거는 「잡으면 Chrome 기본 설치 UI가 사라지는데 **대체할 것이 없다**」였다.
   이제 대체가 생겼다 — S10의 `원클릭 설치` 행이다. 근거가 사라졌으므로 결정도 바뀐다.

   🔴 **PM 지시(「설치 가이드 위젯과 기능을 폐기하라」)를 그대로 따르지 않았다.**
   iOS Safari에는 `beforeinstallprompt`가 **존재하지 않는다.** 통째로 폐기하면
   **iPhone 사용자는 설치 방법을 알 길이 없어지고**, M-01의 측정 기기가 바로 iPhone Safari다
   (§17.1 DoD). ⇒ **분기한다.** 근거는 `reports/W-23.md` §3에 있고 판단을 받는다.

   ⚠ **이벤트는 한 번 쓰면 소모된다.** `prompt()` 뒤에는 버리고, 브라우저가 다시 쏘면 다시 잡는다.
   ⚠ **`main.tsx`에서 부른다** — 이 이벤트는 React가 마운트되기 **전에** 도착할 수 있다.
   ⚠ `useSyncExternalStore`를 쓴 것은 취향이 아니다. `useState` + `useEffect` 구독은
   oxlint의 `set-state-in-effect`를 새로 하나 늘린다(기준선 18 유지 · 규약 4-6).
   ────────────────────────────────────────────────────────────────────── */

/** 표준이 아니다 — Chromium 전용이라 `lib.dom`에 타입이 없다. 필요한 두 멤버만 적는다. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const promptListeners = new Set<() => void>()
const emitPrompt = () => {
  for (const listener of promptListeners) listener()
}

/** 🔴 `main.tsx`에서 **렌더보다 먼저** 부른다. */
export function captureInstallPrompt(): void {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (event) => {
    /* 기본 UI를 미루고 우리가 쥔다. 이것을 부르지 않으면 브라우저가 자체 배너를 띄운다. */
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    emitPrompt()
  })
  /* 설치가 끝나면 더 이상 권할 것이 없다. `isStandalone()`은 **다음 실행**에야 참이 되므로
     이 이벤트가 없으면 설치 직후에도 버튼이 남는다. */
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    emitPrompt()
  })
}

function subscribePrompt(onChange: () => void): () => void {
  promptListeners.add(onChange)
  return () => {
    promptListeners.delete(onChange)
  }
}

const promptSnapshot = () => deferredPrompt !== null

/**
 * §8.11.2 「홈 화면에 추가」 행이 쓴다. `available`이 거짓이면 **기존 안내 시트**로 간다
 * (iOS가 그 경우다 — 지우면 iPhone에서 설치가 불가능해진다).
 */
export function useInstallPrompt(): {
  available: boolean
  promptInstall: () => Promise<void>
} {
  const available = useSyncExternalStore(subscribePrompt, promptSnapshot, () => false)

  const promptInstall = useCallback(async () => {
    const event = deferredPrompt
    if (!event) return
    /* 🔴 **먼저 버린다.** `prompt()`는 두 번 부를 수 없고, 사용자가 두 번 탭하면
       두 번째 호출이 예외를 던진다. */
    deferredPrompt = null
    emitPrompt()
    await event.prompt()
    await event.userChoice
  }, [])

  return { available, promptInstall }
}

/**
 * EC-24 · §18.2 「전역 설치 배너 1회 노출」 — design `10d`.
 *
 * 🔴 **iOS에서만 뜬다**(사용자 결정). design 부제 `공유 버튼 → 홈 화면에 추가`는
 * iOS의 실제 경로이고, Android/Chrome에는 그런 흐름이 없다. Android용 문구는
 * §8.10 사전에 **없으므로 만들지 않는다**(규약 4-4).
 * ⚠ **W-23에서도 이 배너는 그대로다.** B-09(c)가 바꾼 것은 S10의 **행**이고
 * 이 배너는 iOS 전용이라 `beforeinstallprompt`와 애초에 겹치지 않는다.
 */
export function useInstallGuide(): { show: boolean; dismiss: () => void } {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(A2HS_DISMISSED) === '1'
    } catch {
      /* 시크릿 창·저장소 차단. 배너를 한 번 더 보는 쪽이 앱이 죽는 것보다 낫다. */
      return false
    }
  })

  const dismiss = () => {
    setDismissed(true)
    try {
      window.localStorage.setItem(A2HS_DISMISSED, '1')
    } catch {
      /* 저장에 실패해도 이번 세션에서는 닫힌 상태를 유지한다. */
    }
  }

  return { show: !dismissed && isIOS() && !isStandalone(), dismiss }
}
