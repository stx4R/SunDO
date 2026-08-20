import { initializeApp, type FirebaseOptions } from 'firebase/app'
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
