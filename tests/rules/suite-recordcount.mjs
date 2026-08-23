/**
 * §3.6 — `recordCount` A안 ①(규칙). 5건.
 *
 * 🔴 **RC-5(단독 update)는 「통과」가 기대값이다.** 규칙은 같은 배치의 다른 연산을
 *    볼 수 없으므로 `records` create 없이 `recordCount`만 +1 하는 요청을 막지 못한다.
 *    이것을 「실패」로 적으면 규칙을 표현 불가능한 방향으로 넓히게 된다.
 *    근거와 잔여 위험은 `firestore.rules`의 `selfSync()` 주석과 보고서 §4에 있다.
 */
import { doc, increment, serverTimestamp, updateDoc } from 'firebase/firestore'
import { as, check, describe, seed, UIDS } from './harness.mjs'

export async function run() {
  describe('recordCount — §3.6 결정 R-a (A안 ①)')

  await seed()
  await check('RC-1', 'pass', '본인 `recordCount` +1', () =>
    updateDoc(doc(as(UIDS.member), 'users', UIDS.member), {
      recordCount: increment(1), updatedAt: serverTimestamp(),
    }))

  await seed()
  await check('RC-2', 'deny', '🔴 +2 (「+1만」 조건)', () =>
    updateDoc(doc(as(UIDS.member), 'users', UIDS.member), {
      recordCount: increment(2), updatedAt: serverTimestamp(),
    }))

  await seed()
  await check('RC-3', 'deny', '🔴 -1 (v1.1 삭제 회차 소유 — A안 ③)', () =>
    updateDoc(doc(as(UIDS.member), 'users', UIDS.member), {
      recordCount: increment(-1), updatedAt: serverTimestamp(),
    }))

  await seed()
  await check('RC-4', 'deny', '🔴 **남의** `recordCount` +1', () =>
    updateDoc(doc(as(UIDS.member), 'users', UIDS.vice), {
      recordCount: increment(1), updatedAt: serverTimestamp(),
    }))

  await seed()
  await check('RC-5', 'pass', '🔴 `records` create 없는 **단독** +1 — 규칙은 형제 연산을 못 본다(판단)', () =>
    updateDoc(doc(as(UIDS.member), 'users', UIDS.member), {
      recordCount: increment(1), updatedAt: serverTimestamp(),
    }))

  await seed()
  await check('RC-6', 'deny', '임의의 절댓값을 넣는다 (`recordCount: 999`)', () =>
    updateDoc(doc(as(UIDS.member), 'users', UIDS.member), {
      recordCount: 999, updatedAt: serverTimestamp(),
    }))

  /* ⚠ `head`의 남의 문서 update는 §9.6이 「역할·기타 상태 변경은 head·dev만」으로 **넓게** 연다.
     그래서 `head`는 남의 `recordCount`도 바꿀 수 있다 — 「+1만」은 **본인 경로에만** 걸린다.
     좁히려면 `isHead()` 경로에도 허용 키 목록이 필요한데, 승인·거절·양도가 쓰는 필드가
     서로 달라 목록이 세 벌이 된다. **넓힌 것이 아니라 §9.6이 그렇게 규정한 것**이고,
     실질 위험은 「부장이 남의 통계를 부풀린다」로 감사 로그 밖 지표에 한정된다. */
  await seed()
  await check('RC-7', 'pass', '⚠ `head`가 남의 `recordCount`를 임의 값으로 (§9.6이 넓게 연다 — 판단)', () =>
    updateDoc(doc(as(UIDS.head), 'users', UIDS.member), { recordCount: 999 }))
}
