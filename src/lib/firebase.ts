import { initializeApp, type FirebaseOptions } from 'firebase/app'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

/**
 * PRD §9.1 저장소 구성.
 *
 * 설정값은 비밀이 아니지만 `sundo-dev` / `sundo-prod`를 갈라야 해서(§18.1)
 * 환경 변수로 둔다. `.env`는 `.gitignore` 대상이고 `.env.example`만 커밋한다.
 * 리전(`asia-northeast3`)은 Firestore를 만들 때 콘솔에서 정한다 — 코드가 아니다.
 */

const KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const

const env = import.meta.env as unknown as Record<string, string | undefined>

/* 누락은 조용히 넘어가면 "권한 없음"처럼 엉뚱한 에러로 나타난다. 즉시 세운다. */
const missing = KEYS.filter((key) => !env[key])
if (missing.length > 0) {
  throw new Error(
    `Firebase 환경 변수가 없습니다: ${missing.join(', ')}\n` +
      '`.env.example`을 `.env`로 복사한 뒤 Firebase 콘솔의 웹 앱 설정값을 채워 주세요. ' +
      '절차는 database_ToDo/W-04_Firebase_콘솔.md에 있습니다.',
  )
}

const options: FirebaseOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

export const app = initializeApp(options)

/**
 * §11.5 · §14.5 11번 — **App Check(reCAPTCHA v3)**. W-22B 결정 2.
 *
 * 🔴 **`initializeApp` 직후, `getAuth`·`initializeFirestore`보다 먼저다.**
 * 뒤에 놓으면 앞선 서비스의 **첫 요청에 토큰이 붙지 않는다** — 시행을 켠 뒤에는
 * 그 첫 요청이 거부된다. 줄 순서가 계약이다. **밑으로 내리지 마라.**
 *
 * 🔴 **키가 없으면 건너뛴다. 앱을 멈추지 않는다.**
 * ⚠ 이것은 위 `KEYS` 6개의 「하나라도 비면 `throw`」 계약을 **일부러 따르지 않는 것**이다.
 *   근거 — `VITE_FIREBASE_*` 6개는 **없으면 앱이 아무것도 못 한다(기능)**. 사이트 키는
 *   **없어도 시행 전까지 앱이 정상 동작한다(방어)**. 방어 계층의 부재로 기능을 세우면
 *   키를 못 넣은 개발자가 앱 자체를 못 띄운다.
 * 🔴 **단, ③ 시행(enforce)을 켠 뒤에는 키가 없으면 모든 요청이 거부된다.**
 *   그때는 이 `warn`이 유일한 단서다. 절차는 `database_ToDo/W-22B.md` §2에 있다.
 *
 * 🔴 **`try`로 감싼 이유** — reCAPTCHA 스크립트 로드는 네트워크를 탄다.
 * 오프라인 첫 실행에서 던지면 **앱이 시작조차 못 한다.** 이 앱은 오프라인이 기능이다(EC-01).
 */
const siteKey = env.VITE_RECAPTCHA_SITE_KEY
if (siteKey) {
  try {
    if (import.meta.env.DEV) {
      /* 🔴 로컬 개발을 죽이지 않는다. 콘솔이 발급한 디버그 토큰을 브라우저가 받아 쓴다.
         **토큰 문자열을 코드나 `.env.example`에 적지 마라**(§14.5 12번) — 등록 절차는
         `database_ToDo/W-22B.md` §2다. */
      ;(self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN = true
    }
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    })
  } catch (error: unknown) {
    console.warn('[SunDO] App Check 초기화에 실패했습니다. 앱은 계속 동작합니다.', error)
  }
} else {
  console.warn('[SunDO] VITE_RECAPTCHA_SITE_KEY가 없어 App Check를 건너뜁니다.')
}

export const auth = getAuth(app)

/**
 * Google Provider 단독이다(C4). 이메일/비밀번호 Provider는 콘솔에서 비활성이며
 * 앱에는 비밀번호를 다루는 코드가 존재하지 않는다.
 *
 * `hd`는 계정 선택 화면의 **힌트일 뿐 강제가 아니다.** 도메인 검증은
 * `AuthProvider`(2차)와 Security Rules(3차)가 따로 한다.
 */
export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ hd: 'dshs.kr' })

/**
 * 오프라인 지속성은 **초기화 시점에만** 설정할 수 있어 여기서 켠다.
 * 전송 큐·대기 배지 거동은 W-17이다.
 */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})
