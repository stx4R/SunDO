/**
 * 🔴 배치 조합 — W-15A §4.5(승인 4 · 재발급 4) · W-15B §3.5(양도 4 · 양도 3) +
 * S2 가입 2연산 + 거절 3연산 + S6 저장 2연산(`recordCount` ②).
 *
 * 🔴 **개별 연산 테스트로 대체하지 마라.** Firestore 배치는 한 연산이라도 규칙에 걸리면
 *    **전체가 거부된다.** 「4연산 중 3개는 통과한다」는 관측은 의미가 없다(§6 함정 2).
 *
 * 🔴 앱 코드(`src/lib/signup.ts` · `admin.ts` · `records.ts`)의 **실제 필드 집합**을
 *    그대로 옮겼다. 한 글자라도 다르면 이 테스트가 규칙을 검증하지 못한다.
 */
import { doc, increment, serverTimestamp, writeBatch } from 'firebase/firestore'
import { as, check, DEPT, describe, put, recordPayload, seed, UIDS } from './harness.mjs'

const codeRef = (db, id) => doc(db, 'departments', DEPT, 'inviteCodes', id)

/** OP-09 승인 — `users` + `approvalRequests` + `inviteCodes` + `auditLogs`. */
function approveBatch(db, actor) {
  const b = writeBatch(db)
  const now = serverTimestamp()
  b.update(doc(db, 'users', UIDS.pending), {
    status: 'active', approvedBy: actor, approvedAt: now, updatedAt: now,
  })
  b.update(doc(db, 'approvalRequests', 'req-1'), {
    status: 'approved', decidedBy: actor, decidedAt: now,
  })
  b.update(codeRef(db, 'DJSN-2691'), { useCount: increment(1) })
  b.set(doc(db, 'auditLogs', 'log-approve'), {
    actorUid: actor, actorName: '행위자', actorRole: 'head', action: 'USER_APPROVE',
    targetType: 'users', targetId: UIDS.pending,
    before: { status: 'pending' }, after: { status: 'active', inviteCodeCounted: 'DJSN-2691' },
    createdAt: now,
  })
  return b.commit()
}

/** OP-10 재발급 — `inviteCodes`(만료) + `inviteCodes`(생성) + `departments` + `auditLogs`. */
function reissueBatch(db, actor) {
  const b = writeBatch(db)
  const now = serverTimestamp()
  b.update(codeRef(db, 'DJSN-2691'), { isActive: false, revokedAt: now })
  b.set(codeRef(db, 'NEWC-3456'), {
    code: 'NEWC-3456', issuedBy: actor, issuedAt: now,
    expiresAt: new Date(Date.now() + 14 * 864e5), isActive: true, revokedAt: null,
    useCount: 0, maxUses: 30,
  })
  b.update(doc(db, 'departments', DEPT), { activeInviteCodeId: 'NEWC-3456', updatedAt: now })
  b.set(doc(db, 'auditLogs', 'log-reissue'), {
    actorUid: actor, actorName: '행위자', actorRole: 'head', action: 'CODE_ISSUE',
    targetType: 'inviteCodes', targetId: 'NEWC-3456',
    before: { activeInviteCodeId: 'DJSN-2691' }, after: { activeInviteCodeId: 'NEWC-3456' },
    createdAt: now,
  })
  return b.commit()
}

/**
 * OP-11 양도 — `users`×2 + `departments` + `auditLogs`.
 * `demote`가 null이면 **3연산**(BR-23 부장 0명 복구 경로)이다.
 */
function transferBatch(db, actor, actorRole, target, demote) {
  const b = writeBatch(db)
  const now = serverTimestamp()
  b.update(doc(db, 'users', target), { role: 'head', updatedAt: now })
  if (demote) b.update(doc(db, 'users', demote), { role: 'member', updatedAt: now })
  b.update(doc(db, 'departments', DEPT), { headUid: target, updatedAt: now })
  b.set(doc(db, 'auditLogs', 'log-transfer'), {
    actorUid: actor, actorName: '행위자', actorRole, action: 'HEAD_TRANSFER',
    targetType: 'users', targetId: target,
    before: { headUid: demote }, after: { headUid: target }, createdAt: now,
  })
  return b.commit()
}

export async function run() {
  describe('🔴 배치 조합 — 승인 4연산 (W-15A §4.5)')
  await seed()
  await check('B-1', 'pass', '`head`의 승인 배치 4연산 통째로', () => approveBatch(as(UIDS.head), UIDS.head))
  await seed()
  await check('B-1b', 'pass', '`dev`의 승인 배치 4연산', () => approveBatch(as(UIDS.dev), UIDS.dev))
  await seed()
  await check('B-1c', 'deny', '🔴 `vice`의 승인 배치 — 한 연산(A-3)이 걸려 **전체 거부**', () =>
    approveBatch(as(UIDS.vice), UIDS.vice))

  describe('🔴 배치 조합 — 거절 3연산')
  await seed()
  await check('B-2', 'pass', '`head`의 거절 배치 3연산', () => {
    const db = as(UIDS.head)
    const b = writeBatch(db)
    const now = serverTimestamp()
    b.update(doc(db, 'users', UIDS.pending), { status: 'rejected', rejectReason: null, updatedAt: now })
    b.update(doc(db, 'approvalRequests', 'req-1'), { status: 'rejected', decidedBy: UIDS.head, decidedAt: now })
    b.set(doc(db, 'auditLogs', 'log-reject'), {
      actorUid: UIDS.head, actorName: '부장1', actorRole: 'head', action: 'USER_REJECT',
      targetType: 'users', targetId: UIDS.pending,
      before: { status: 'pending' }, after: { status: 'rejected' }, createdAt: now,
    })
    return b.commit()
  })

  describe('🔴 배치 조합 — 재발급 4연산 (W-15A §4.5)')
  await seed()
  await check('B-3', 'pass', '`head`의 재발급 배치 4연산 통째로', () => reissueBatch(as(UIDS.head), UIDS.head))
  await seed()
  await check('B-3b', 'deny', '`vice`의 재발급 배치', () => reissueBatch(as(UIDS.vice), UIDS.vice))

  describe('🔴 배치 조합 — 양도 (W-15B §3.5)')
  await seed()
  await check('B-4', 'pass', '🔴 **`head` 실행 양도 4연산** — 강등 대상이 곧 본인이다(T-2)', () =>
    transferBatch(as(UIDS.head), UIDS.head, 'head', UIDS.member, UIDS.head))
  await seed()
  await check('B-5', 'pass', '🔴 **`dev` 실행 양도 4연산** — 강등 대상은 `departments.headUid`(T-3)', () =>
    transferBatch(as(UIDS.dev), UIDS.dev, 'dev', UIDS.vice, UIDS.head))

  /* 🔴 BR-23 — 부장이 0명인 사고 상태. 규칙이 여기를 막으면 **복구가 불가능해진다.** */
  await seed()
  await put(`users/${UIDS.head}`, {
    uid: UIDS.head, email: `${UIDS.head}@dshs.kr`, name: '부장1', nameSource: 'parsed',
    displayNameRaw: '26_20101부장1', role: 'dev', status: 'active', departmentId: DEPT,
    notificationPrefs: { duty: true, approval: true }, recordCount: 0,
  })
  await check('B-6', 'pass', '🔴 **양도 3연산 (BR-23 부장 0명 복구)** — 강등 연산이 없다', () =>
    transferBatch(as(UIDS.head), UIDS.head, 'dev', UIDS.member, null))

  await seed()
  await check('B-7', 'deny', '`vice`의 양도 4연산 (T-4가 걸려 전체 거부)', () =>
    transferBatch(as(UIDS.vice), UIDS.vice, 'vice', UIDS.member, UIDS.head))
  await seed()
  await check('B-8', 'deny', '`teacher`의 양도 4연산 (T-5)', () =>
    transferBatch(as(UIDS.teacher), UIDS.teacher, 'teacher', UIDS.member, UIDS.head))
  await seed()
  await check('B-9', 'deny', '🔴 `head`가 양도 배치에서 **본인을 `vice`로** 내린다 (T-7 — 전체 거부)', () => {
    const db = as(UIDS.head)
    const b = writeBatch(db)
    const now = serverTimestamp()
    b.update(doc(db, 'users', UIDS.member), { role: 'head', updatedAt: now })
    b.update(doc(db, 'users', UIDS.head), { role: 'vice', updatedAt: now })
    b.update(doc(db, 'departments', DEPT), { headUid: UIDS.member, updatedAt: now })
    return b.commit()
  })

  describe('🔴 배치 조합 — S2 가입 2연산 (OP-01)')
  await seed()
  await check('B-10', 'pass', '프로필 없는 학교 계정의 가입 배치 2연산', () => {
    const db = as('uid-new')
    const b = writeBatch(db)
    const now = serverTimestamp()
    b.set(doc(db, 'users', 'uid-new'), {
      uid: 'uid-new', email: 'uid-new@dshs.kr', name: '신입', nameSource: 'parsed',
      displayNameRaw: '26_20999신입', memberStudentNo: '20999', memberGrade: 2,
      memberClassNo: 9, memberNumber: 99, role: 'member', status: 'pending',
      departmentId: DEPT, inviteCodeId: 'DJSN-2691',
      notificationPrefs: { duty: true, approval: true },
      createdAt: now, recordCount: 0, updatedAt: now,
    })
    b.set(doc(db, 'approvalRequests', 'uid-new_1'), {
      uid: 'uid-new', email: 'uid-new@dshs.kr', name: '신입',
      inviteCodeId: 'DJSN-2691', status: 'pending', createdAt: now,
    })
    return b.commit()
  })

  describe('🔴 배치 조합 — S6 저장 2연산 (`recordCount` A안 ②)')
  await seed()
  await check('B-11', 'pass', '🔴 `records` create + `users/{본인}.recordCount` +1', () => {
    const db = as(UIDS.member)
    const b = writeBatch(db)
    b.set(doc(db, 'records', 'rec-batch'), recordPayload())
    b.update(doc(db, 'users', UIDS.member), { recordCount: increment(1), updatedAt: serverTimestamp() })
    return b.commit()
  })
  await seed()
  await check('B-12', 'deny', '🔴 같은 배치에서 `recordCount`를 +2 (한 연산이 걸려 전체 거부)', () => {
    const db = as(UIDS.member)
    const b = writeBatch(db)
    b.set(doc(db, 'records', 'rec-batch'), recordPayload())
    b.update(doc(db, 'users', UIDS.member), { recordCount: increment(2), updatedAt: serverTimestamp() })
    return b.commit()
  })
  await seed()
  await check('B-13', 'deny', '🔴 사유가 잘못된 `records`와 정상 `recordCount` (전체 거부)', () => {
    const db = as(UIDS.member)
    const b = writeBatch(db)
    b.set(doc(db, 'records', 'rec-batch'), recordPayload({ reasonCode: 'HAIR' }))
    b.update(doc(db, 'users', UIDS.member), { recordCount: increment(1), updatedAt: serverTimestamp() })
    return b.commit()
  })
}
