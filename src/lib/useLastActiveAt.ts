import { useEffect } from 'react'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from './firebase'

/**
 * PRD §9.3.1 `lastActiveAt` — **앱 진입 시 갱신(1시간 스로틀)**.
 * W-04가 W-05로 넘긴 항목이다(지시서 §7).
 *
 * 부록 B의 `users.update` 자기 갱신 허용 키에 `lastActiveAt`이 들어 있다
 * (`docs/SunDO_PRD.md:2866`). `hasOnly`는 부분집합을 허용하므로 이 키만 써도 통과한다.
 * `updatedAt`은 함께 올리지 않는다 — 접속만 한 것을 "프로필이 바뀌었다"로
 * 기록하면 `updatedAt`이 마지막 변경 시각의 의미를 잃는다(보고서 §4).
 */

const HOUR_MS = 60 * 60 * 1000
const KEY_PREFIX = 'sundo.lastActiveAt'

/* Safari 개인정보 보호 모드처럼 저장소가 막힌 환경에서 `localStorage` 접근 자체가
   throw한다(EC-23 계열). 진입을 막을 이유가 없으므로 메모리로 떨어뜨린다.
   메모리 폴백은 새로고침마다 비므로 스로틀이 세션 단위가 된다 — 창이 좁아질 뿐
   과다 쓰기는 아니다. */
const memory = new Map<string, string>()

function readStamp(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return memory.get(key) ?? null
  }
}

function writeStamp(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    if (value === null) memory.delete(key)
    else memory.set(key, value)
  }
}

/**
 * @param uid 갱신 대상. `status === 'active'`가 아니면 `null`을 넘긴다.
 *   승인 대기·거절·정지 계정은 `users/{uid}` 쓰기 권한이 없거나 의미가 없다.
 */
export function useLastActiveAt(uid: string | null): void {
  useEffect(() => {
    if (!uid) return

    const key = `${KEY_PREFIX}:${uid}`
    const previous = readStamp(key)
    const last = Number(previous)
    const now = Date.now()

    if (previous !== null && Number.isFinite(last) && now - last < HOUR_MS) return

    /* 창을 **먼저** 연다. StrictMode의 이중 실행이나 짧은 시간의 재마운트가
       쓰기를 두 번 만들지 않게 하기 위해서다. */
    writeStamp(key, String(now))

    void updateDoc(doc(db, 'users', uid), { lastActiveAt: serverTimestamp() }).catch(
      (error: unknown) => {
        /* 실패했으면 창을 되돌린다. 실패한 시도가 한 시간을 먹으면
           `lastActiveAt`이 최대 한 시간씩 뒤처진다. */
        writeStamp(key, previous)
        const code = (error as { code?: string })?.code ?? 'firestore/last-active-failed'
        console.warn('[lastActiveAt] 갱신 실패:', code)
      },
    )
  }, [uid])
}
