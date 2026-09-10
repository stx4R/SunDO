import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  deleteUser,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { doc, getDoc, getDocFromCache, serverTimestamp, updateDoc } from 'firebase/firestore'
import { auth, db, googleProvider } from '../lib/firebase'
import { parseDisplayName, type ParseResult } from '../lib/parseDisplayName'

/**
 * PRD §6.1 인증 분기 규칙 · §9.1 · §9.4 DR-12 · §9.6.
 *
 * **이 컴포넌트는 화면을 그리지도, 라우팅하지도 않는다.** 상태만 노출한다.
 * 화면 이동은 W-05, S1·S2·S2-1 화면은 W-06이다.
 * 문구도 여기 없다 — 에러 **코드**만 노출하고 ER-11~ER-14·TS-17은 호출부가 붙인다.
 */

export type AuthStatus =
  /** 판정 전. N-05 — 이 동안 스플래시를 유지한다 */
  | 'loading'
  | 'signedOut'
  /** 도메인이 `@dshs.kr`이 아니어서 계정을 지우고 내보낸 상태 */
  | 'domainRejected'
  /** `users/{uid}` 문서 없음 → S2 가입 신청 */
  | 'noProfile'
  | 'pending'
  | 'active'
  | 'rejected'
  | 'suspended'
  | 'withdrawn'

/** §9.3.1 `users/{uid}`. 이번 작업은 **조회와 DR-12 갱신만** 한다(생성은 W-06). */
export interface UserProfile {
  uid: string
  email: string
  name: string
  nameSource: 'parsed' | 'manual'
  displayNameRaw: string
  memberStudentNo: string | null
  memberGrade: number | null
  memberClassNo: number | null
  memberNumber: number | null
  role: 'member' | 'vice' | 'head' | 'teacher' | 'dev'
  status: 'pending' | 'active' | 'rejected' | 'suspended' | 'withdrawn'
  departmentId: string
  notificationPrefs: { duty: boolean; approval: boolean }
  recordCount: number
  rejectReason: string | null
}

export interface AuthContextValue {
  status: AuthStatus
  profile: UserProfile | null
  parsed: ParseResult | null
  /** T-05 거절 계정 칩에 쓴다. T-06으로 지운다 */
  rejectedEmail: string | null
  /** Firebase 에러 코드 원문. 문구 매핑은 화면이 한다 */
  errorCode: string | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  clearRejection: () => void
  /**
   * 현재 로그인된 사용자로 판정을 **다시 돌린다**(W-07 §3 — A안).
   *
   * 판정 로직을 새로 쓰지 않고 `resolve()`를 재사용하므로, W-17이 `getDoc` 경로를
   * 고치면 이 경로도 함께 고쳐진다. `throw`하지 않는다.
   *
   * **실패해도 `status`를 흔들지 않는다** — 폴링 1회 실패에 사용자가 화면 밖으로
   * 튕기면 안 된다. 미인증 상태에서는 아무 것도 하지 않는다(재인증 유발 금지).
   *
   * 🔴 **W-12에서 `onSnapshot`으로 전환하면 이것과 S2-1의 폴링 루프를 함께 걷어내야 한다.**
   * 구독이 들어오면 수동 재조회와 30초 폴링은 중복이 된다. 지금 심는 부채다.
   */
  refresh: () => Promise<void>
}

/**
 * §9.6 필수 규칙 1 — **끝의 `$`가 없으면 `attacker@dshs.kr.evil.com`이 통과한다.**
 * 지우지 마라.
 */
const SCHOOL_DOMAIN = /@dshs\.kr$/

/** 팝업이 불가능한 환경. 리다이렉트로 폴백한다(§5.4). */
const REDIRECT_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/cancelled-popup-request',
  'auth/operation-not-supported-in-this-environment',
])

/** EC-30 — PWA standalone에서는 팝업이 막히는 사례가 있어 처음부터 리다이렉트로 간다. */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone === true
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [rejectedEmail, setRejectedEmail] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)

  /* 인증 상태가 연달아 바뀌면 늦게 끝난 조회가 최신 판정을 덮을 수 있다. */
  const seqRef = useRef(0)

  /* 도메인 거절은 **인증 상태에서 파생시키면 안 된다.**
     `signOut` 직후 `onAuthStateChanged`가 `null`을 뱉는 순간 `domainRejected`가
     `signedOut`으로 덮이고 `rejectedEmail`도 사라진다 — 화면에는 아무 일도 없었던 것처럼 보인다.
     S1의 거절 배너·거절 계정 칩(T-05)·버튼 라벨 교체가 전부 이 값에 달려 있으므로
     `clearRejection()`이 불릴 때까지 살아남는 래치로 따로 들고 있는다. */
  const rejectionRef = useRef<string | null>(null)

  /* W-07 §3.2 규칙 4 — 재조회 재진입 빗장. `useState`로는 같은 태스크 안의
     동시 호출을 막지 못한다(리렌더 전이라 전부 옛 값을 본다 — W-06 §5-4).
     동기적으로 즉시 서는 ref여야 한다. */
  const refreshingRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    /* §5.4 — 리다이렉트 결과를 먼저 처리해야 판정이 확정된다.
       실패해도 판정 자체는 진행한다(로그아웃 상태로 떨어질 뿐이다). */
    const redirectSettled = getRedirectResult(auth).catch((error: unknown) => {
      const code = (error as { code?: string })?.code
      setErrorCode(code ?? 'auth/redirect-failed')
      return null
    })

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const mine = ++seqRef.current
      void (async () => {
        await redirectSettled
        if (cancelled || mine !== seqRef.current) return
        const isStale = () => cancelled || mine !== seqRef.current

        /* 🔴 **W-27 — 첫 판정만 「캐시로 먼저 그리고, 서버로 확인한다」**(사용자 확정).
           `primeFromCache`가 참을 돌려주면 스플래시는 **서버 왕복을 기다리지 않고** 걷힌다.
           그 뒤 아래 `resolve`가 그대로 이어 돌아 서버 값으로 판정을 확정한다. */
        const primed = await primeFromCache(user, isStale)
        if (isStale()) return

        /* 🔴 **`silent`가 붙는 조건이 계약의 핵심이다.**
           선판정이 성공했으면 화면에는 이미 확정된 상태가 그려져 있다 — 이때 서버 조회가
           실패했다고 `loading`으로 되돌리면 **멀쩡히 보이던 화면 위로 스플래시가 덮인다.**
           `silent`는 W-07 §3.2 규칙 3이 바로 그 상황을 위해 만든 것이라 그대로 쓴다.
           반대로 선판정이 없었으면 이 조회가 **유일한 판정**이므로 실패는 그대로 드러나야 한다
           (§8.1.5 스플래시 3초 타임아웃과 오류 화면이 그 경로다). */
        await resolve(user, isStale, primed ? { silent: true } : undefined)
      })()
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * 🔴 **W-27 — 영구 캐시에 이미 있는 프로필로 「먼저 그리는」 선판정**(사용자 확정).
   *
   * **왜 필요한가.** `lib/firebase.ts`가 `persistentLocalCache`를 켜 두었는데도
   * `getDoc`은 **언제나 서버를 먼저 친다** — 캐시는 그 조회가 실패했을 때의 폴백이다.
   * 그래서 재실행마다 스플래시가 서버 왕복 하나를 통째로 기다렸다. 이 함수는 그 왕복을
   * **판정의 앞에서 빼내고 뒤로 옮긴다.** 화면은 캐시로 서고, 서버 값은 곧이어 도착해 덮는다.
   *
   * 🔴 **대가를 정확히 적는다 — 최대 1왕복 동안 옛 계정 상태가 보일 수 있다.**
   * 정지·거절 처분이 방금 내려진 계정이 그 사이 활성 화면을 볼 수 있다. 사용자가 이 대가를
   * 알고 확정했다. **다만 「보인다」와 「할 수 있다」는 다르다** — 읽기·쓰기는 전부
   * `firestore.rules`가 서버에서 막으므로 데이터가 새지 않는다. 잠기는 것은 껍데기뿐이고
   * 그것도 서버 판정이 도착하는 즉시 걷힌다.
   * 되돌리려면 이 함수를 지우고 위 호출부에서 `primed`를 `false`로 고정하면 끝이다.
   *
   * 🔴 **참을 돌려주는 조건을 좁게 잡았다.**
   * ① 로그인된 사용자가 있고 ② 도메인이 학교 도메인이고 ③ 캐시에 문서가 **존재**할 때뿐이다.
   * ⚠ **캐시가 「없음」이라고 답하면 믿지 않는다.** SDK는 「이 문서는 없다」도 캐시하는데,
   * 프로필이 만들어지기 **전에** 굳은 그 답을 그대로 쓰면 이미 승인된 부원에게
   * S2 가입 신청 화면이 번쩍인다. 없음은 서버에게 다시 묻는다 — 그 경로가 원래 동작이다.
   * ⚠ **이름 재파싱(DR-12)을 여기서 하지 않는다.** 그것은 `updateDoc` **쓰기**이고,
   * 선판정은 읽기만 하는 자리다. 뒤이어 도는 `resolve`가 서버 값으로 그 일을 한다.
   */
  const primeFromCache = useCallback(async (user: User | null, stale: () => boolean) => {
    if (!user) return false
    const email = (user.email ?? '').toLowerCase()
    /* 도메인 판정을 여기서 한 번 더 하는 것은 중복이 아니라 **가드**다.
       거절 계정은 `resolve`가 계정 삭제·로그아웃까지 하는 경로라 선판정이 건드리면 안 된다. */
    if (!SCHOOL_DOMAIN.test(email)) return false

    let snapshot
    try {
      snapshot = await getDocFromCache(doc(db, 'users', user.uid))
    } catch {
      /* 캐시 미스는 정상이다(첫 로그인 · 캐시 비움 · 시크릿 창). 조용히 서버 경로로 넘긴다. */
      return false
    }
    if (stale() || !snapshot.exists()) return false

    const cachedProfile = snapshot.data() as UserProfile
    setProfile(cachedProfile)
    setStatus(cachedProfile.status)
    return true
  }, [])

  /**
   * 인증된 사용자 1명에 대한 판정. §6.1 인증 분기 규칙 표와 1:1이다.
   *
   * `silent`는 **조회 실패 시 판정을 흔들지 않는다**는 뜻이다(W-07 §3.2 규칙 3).
   * 재조회(`refresh()`)는 이미 화면이 떠 있는 상태에서 도는데, 실패를 `loading`으로
   * 떨어뜨리면 `AuthGate`가 스플래시를 씌워 S2-1이 30초마다 사라진다.
   */
  const resolve = useCallback(
    async (user: User | null, stale: () => boolean, options?: { silent?: boolean }) => {
      if (!user) {
        setProfile(null)
        setParsed(null)
        if (rejectionRef.current) {
          /* 거절 직후의 로그아웃이다. 판정을 되돌리지 않는다. */
          setRejectedEmail(rejectionRef.current)
          setStatus('domainRejected')
          return
        }
        setStatus('signedOut')
        return
      }

      const email = (user.email ?? '').toLowerCase()

      /* 도메인 3중 방어의 2차. `hd` 힌트(1차)는 강제가 아니라 여기서 다시 본다. */
      if (!SCHOOL_DOMAIN.test(email)) {
        /* 삭제·로그아웃보다 **먼저** 래치를 세운다. 아래 두 호출 사이에
           `onAuthStateChanged(null)`이 끼어들어도 거절 판정이 살아남아야 한다. */
        rejectionRef.current = email

        /* 순서 주의 — `signOut`을 먼저 하면 권한이 사라져 계정이 그대로 남는다.
           `deleteUser`는 `auth/requires-recent-login`으로 실패할 수 있는데,
           실패해도 **반드시 로그아웃은 한다.** */
        try {
          await deleteUser(user)
        } catch (error: unknown) {
          const code = (error as { code?: string })?.code ?? 'auth/delete-user-failed'
          console.warn('[auth] 도메인 거절 계정 삭제 실패 — 로그아웃만 수행한다:', code)
          setErrorCode(code)
        }
        try {
          await firebaseSignOut(auth)
        } catch {
          /* 로그아웃까지 실패하면 다음 onAuthStateChanged가 다시 판정한다. */
        }
        if (stale()) return
        setProfile(null)
        setParsed(null)
        setRejectedEmail(email)
        setStatus('domainRejected')
        return
      }

      /* 도메인이 정상인 계정으로 들어왔다. 이전 거절 배너는 더 이상 유효하지 않다. */
      rejectionRef.current = null
      setRejectedEmail(null)

      const raw = user.displayName ?? ''
      const parsedName = parseDisplayName(raw)
      if (stale()) return
      setParsed(parsedName)

      const ref = doc(db, 'users', user.uid)
      let snapshot
      try {
        snapshot = await getDoc(ref)
      } catch (error: unknown) {
        /* **조회 실패는 `noProfile`이 아니다.** 문서가 없는 것(`exists() === false`)과
           읽지 못한 것(`permission-denied`·네트워크·규칙 미게시)을 같게 다루면
           오프라인이나 규칙 오류일 때 활성 부원이 가입 신청 화면으로 튕긴다.
           판정을 확정하지 않고(`loading`) 이유만 `errorCode`로 넘긴다 —
           스플래시 3초 타임아웃(§8.1.5)과 오류 화면은 W-06이 붙인다. */
        const code = (error as { code?: string })?.code ?? 'firestore/get-profile-failed'
        setErrorCode(code)
        if (stale()) return
        /* 재조회는 **판정을 흔들지 않는다**(W-07 §3.2 규칙 2·3).
           이미 확정된 상태를 `loading`으로 되돌리면 스플래시가 화면을 덮고,
           `profile`을 비우면 신원 요약 줄이 사라진다. 이유는 `errorCode`로만 넘긴다. */
        if (options?.silent) return
        setProfile(null)
        setStatus('loading')
        return
      }
      if (stale()) return

      if (!snapshot.exists()) {
        setProfile(null)
        setStatus('noProfile')
        return
      }

      const next = snapshot.data() as UserProfile

      /* DR-12 — 로그인할 때마다 재파싱해 표시 이름 변화를 따라간다.
         DR-13: `manual` 계정은 제외한다. 수동 입력값을 자동 파싱이 덮으면 안 된다.
         `PROFILE_SYNC` 감사 로그는 스키마·Rules가 없어 W-15 이후다(보고서 §8). */
      if (next.nameSource !== 'manual' && next.displayNameRaw !== raw) {
        try {
          if (parsedName.ok) {
            await updateDoc(ref, {
              displayNameRaw: raw,
              name: parsedName.name,
              memberStudentNo: parsedName.memberStudentNo,
              memberGrade: parsedName.memberGrade,
              memberClassNo: parsedName.memberClassNo,
              memberNumber: parsedName.memberNumber,
              updatedAt: serverTimestamp(),
            })
            next.displayNameRaw = raw
            next.name = parsedName.name
            next.memberStudentNo = parsedName.memberStudentNo
            next.memberGrade = parsedName.memberGrade
            next.memberClassNo = parsedName.memberClassNo
            next.memberNumber = parsedName.memberNumber
          } else {
            /* 파싱이 실패한 표시 이름으로 기존 이름을 지우지 않는다.
               원문만 갱신해 롤오버 감지가 가능하게 두고, 이름 재입력은 W-06 S2가 다룬다. */
            console.warn('[auth] 표시 이름 파싱 실패 — 원문만 갱신한다:', parsedName.reason)
            await updateDoc(ref, { displayNameRaw: raw, updatedAt: serverTimestamp() })
            next.displayNameRaw = raw
          }
        } catch (error: unknown) {
          const code = (error as { code?: string })?.code ?? 'firestore/profile-sync-failed'
          console.warn('[auth] 프로필 동기화 실패 — 조회 값으로 진행한다:', code)
          setErrorCode(code)
        }
        if (stale()) return
      }

      /* PRD DR-10 — MVP 유보(W-04 결정).
         교차 검증(이메일 입학 연도 ↔ 표시 이름 학년)은 이메일 로컬 파트를 분해해야 한다.
         산출물이 아무도 읽지 않는 `console.warn` 하나이고, PRD가 유급·전입을 정당한 예외로
         인정하므로 오탐이 기본값에 가깝다. 이득 0 대비 "로컬 파트를 분해하는 코드 경로"가
         생기는 비용만 남는다 — 앞 2자리를 읽는 코드는 뒤 4자리(생일, DR-14·PR-05)로
         확장하기 쉽다. 학번 신선도는 DR-12 재파싱이 이미 덮는다.
         **되살리지 마라.** 되살리려면 W-04 결정을 먼저 뒤집어야 한다. */

      setProfile(next)
      setStatus(next.status)
    },
    [],
  )

  const signIn = useCallback(async () => {
    setErrorCode(null)
    try {
      if (isStandalone()) {
        await signInWithRedirect(auth, googleProvider)
        return
      }
      await signInWithPopup(auth, googleProvider)
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code ?? 'auth/unknown'
      if (REDIRECT_FALLBACK_CODES.has(code)) {
        /* 어느 코드로 폴백했는지 남긴다. W-19에서 리다이렉트가 막히면 이 줄이 출발점이다. */
        console.warn('[auth] 팝업 실패 — 리다이렉트로 폴백한다:', code)
        try {
          await signInWithRedirect(auth, googleProvider)
          return
        } catch (fallbackError: unknown) {
          setErrorCode((fallbackError as { code?: string })?.code ?? 'auth/redirect-failed')
          return
        }
      }
      /* `auth/popup-closed-by-user`는 에러가 아니라 취소다. 코드만 노출하고
         TS-17 `로그인이 취소되었습니다`는 S1이 띄운다. */
      setErrorCode(code)
    }
  }, [])

  const signOut = useCallback(async () => {
    setErrorCode(null)
    await firebaseSignOut(auth)
  }, [])

  /**
   * W-07 §3 — S2-1 승인 감지(수동 `승인 확인` + 30초 폴링)가 쓰는 재조회.
   *
   * **폴링 주기는 여기 두지 않는다.** 화면마다 정책이 다르므로 화면이 소유한다(§6.1).
   */
  const refresh = useCallback(async () => {
    /* 규칙 5 — 미인증(`signedOut`·`domainRejected`)에서는 아무 것도 하지 않는다.
       `currentUser`가 null인 것이 곧 그 두 상태다. 재인증을 유발하지 마라. */
    const user = auth.currentUser
    if (!user) return

    /* 규칙 4 — 동시 호출은 1회만 돈다. */
    if (refreshingRef.current) return
    refreshingRef.current = true

    try {
      /* 진행 중이던 판정보다 이 재조회가 최신이다. 시퀀스를 올려 앞선 것을 무효화한다. */
      const mine = ++seqRef.current
      await resolve(user, () => mine !== seqRef.current, { silent: true })
    } catch (error: unknown) {
      /* 규칙 6 — `throw`하지 않는다. 호출부에 `catch`를 요구하지 않는 계약이다.
         `resolve`는 내부에서 전부 잡으므로 여기 오면 예상 밖이다. 삼키지 말고 남긴다. */
      console.warn('[auth] refresh 실패:', error)
    } finally {
      refreshingRef.current = false
    }
  }, [resolve])

  /** T-06 — 거절 칩 X. 배너·칩만 지우고 로그인 화면 기본 상태로 돌린다. */
  const clearRejection = useCallback(() => {
    rejectionRef.current = null
    setRejectedEmail(null)
    setErrorCode(null)
    setStatus((current) => (current === 'domainRejected' ? 'signedOut' : current))
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      profile,
      parsed,
      rejectedEmail,
      errorCode,
      signIn,
      signOut,
      clearRejection,
      refresh,
    }),
    [status, profile, parsed, rejectedEmail, errorCode, signIn, signOut, clearRejection, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth는 AuthProvider 안에서만 쓸 수 있다')
  return value
}
