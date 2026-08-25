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

  describe('🔴 배치 조합 — 재발급 4연산 (W-15A §4.5 · 🔴 W-21B 결정 5로 뒤집힘)')
  await seed()
  await check('B-3', 'deny', '🔴 **`head`의 재발급 배치 4연산** — 세 연산이 걸려 전체 거부(뒤집힘)', () =>
    reissueBatch(as(UIDS.head), UIDS.head))
  await seed()
  await check('B-3b', 'deny', '`vice`의 재발급 배치', () => reissueBatch(as(UIDS.vice), UIDS.vice))
  await seed()
  await check('B-3c', 'pass', '🔴 **`dev`의 재발급 배치 4연산** — 유일하게 남은 발급 경로', () =>
    reissueBatch(as(UIDS.dev), UIDS.dev))

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

  describe('🔴 배치 조합 — S10 탈퇴 2연산 (W-17 · BR-57)')

  /**
   * 🔴 **`src/lib/account.ts`의 `withdrawAccount`와 필드가 같아야 한다.**
   * 한 글자라도 다르면 이 테스트가 코드를 검증하지 못한다(파일 머리글 규율).
   *
   * BR-57은 4연산을 규정하지만 `departments.memberCount` 감소는 **넣지 않는다** —
   * B-17이 그것을 넣으면 배치가 죽는 것을 증명한다.
   */
  function withdrawBatch(db, uid, { extra = {}, action = 'USER_WITHDRAW' } = {}) {
    const b = writeBatch(db)
    const now = serverTimestamp()
    b.update(doc(db, 'users', uid), {
      status: 'withdrawn', withdrawnAt: now, updatedAt: now, ...extra,
    })
    b.set(doc(db, 'auditLogs', 'log-withdraw'), {
      actorUid: uid, actorName: '탈퇴자', actorRole: 'member', action,
      targetType: 'users', targetId: uid,
      before: { status: 'active' }, after: { status: 'withdrawn' },
      createdAt: now,
    })
    return b.commit()
  }

  await seed()
  await check('B-14', 'pass', '🔴 `member` 탈퇴 — `users` 3키 + `auditLogs(USER_WITHDRAW)`', () =>
    withdrawBatch(as(UIDS.member), UIDS.member))

  await seed()
  await check('B-15', 'deny', '🔴 **부장**의 탈퇴 배치 (BR-56 — `users` 연산이 걸려 전체 거부)', () =>
    withdrawBatch(as(UIDS.head), UIDS.head))

  /* 🔬 시드의 `recordCount`는 `0`이다. **같은 값을 다시 쓰면 `affectedKeys()`에 들어가지
     않아** `hasOnly`가 걸리지 않는다 — 처음에 `recordCount: 0`으로 썼다가 통과해서 알았다.
     실제 위반을 재현하려면 **값이 달라야** 한다. 그 성질 자체는 B-20이 잠근다. */
  await seed()
  await check('B-16', 'deny', '🔴 탈퇴하면서 `recordCount`를 함께 바꾼다 (허용 키 밖 — C7 위반)', () =>
    withdrawBatch(as(UIDS.member), UIDS.member, { extra: { recordCount: 999 } }))

  /**
   * 🔬 **`diff().affectedKeys()`는 「쓴 키」가 아니라 「값이 바뀐 키」다.**
   * 그래서 허용 키 밖 필드를 **같은 값으로** 다시 써도 `hasOnly`가 통과한다.
   *
   * 🔴 **이것을 「규칙이 느슨하다」로 읽지 마라** — 값이 바뀌지 않았으므로 문서도 바뀌지
   * 않는다. `recordCount`는 탈퇴 후에도 보존되고(C7) 그 보존을 깨는 경로는 B-16이 막는다.
   * 이 케이스는 규칙의 **의미**를 문서화해 다음 회차가 오해하지 않게 잠근다.
   */
  await seed()
  await check('B-20', 'pass', '🔬 허용 키 밖 필드를 **같은 값으로** 다시 쓴다 (값이 안 바뀌면 `affectedKeys`에 없다)', () =>
    withdrawBatch(as(UIDS.member), UIDS.member, { extra: { recordCount: 0 } }))

  await seed()
  await check(
    'B-17',
    'deny',
    '🔴 **BR-57 원문대로** `departments.memberCount` 감소를 넣는다 (탈퇴자는 `head`가 아니다 → 전체 거부)',
    () => {
      const db = as(UIDS.member)
      const b = writeBatch(db)
      const now = serverTimestamp()
      b.update(doc(db, 'users', UIDS.member), {
        status: 'withdrawn', withdrawnAt: now, updatedAt: now,
      })
      b.update(doc(db, 'departments', DEPT), { memberCount: increment(-1) })
      return b.commit()
    },
  )

  /* ⚠ 규칙의 `auditLogs` create는 `actorUid == request.auth.uid`만 본다 —
     `action` 유니온을 **검사하지 않는다**. 그래서 `USER_WITHDRAW`를 더하는 데
     규칙 재배포가 필요 없다는 것이 B-18의 관측 내용이다(보고서 §4). */
  await seed()
  await check('B-18', 'pass', '⚠ 규칙은 `action` 값을 검사하지 않는다 (임의 문자열도 통과)', () =>
    withdrawBatch(as(UIDS.member), UIDS.member, { action: 'ZZ_NOT_IN_UNION' }))

  await seed()
  await check('B-19', 'deny', '🔴 남의 uid로 감사 로그를 남긴다 (§9.6 필수 조건 6)', () => {
    const db = as(UIDS.member)
    const b = writeBatch(db)
    const now = serverTimestamp()
    b.update(doc(db, 'users', UIDS.member), {
      status: 'withdrawn', withdrawnAt: now, updatedAt: now,
    })
    b.set(doc(db, 'auditLogs', 'log-withdraw'), {
      actorUid: UIDS.head, actorName: '위조', actorRole: 'head', action: 'USER_WITHDRAW',
      targetType: 'users', targetId: UIDS.member,
      before: { status: 'active' }, after: { status: 'withdrawn' }, createdAt: now,
    })
    return b.commit()
  })

  /* ==========================================================================
     🔴 W-21B 기능 9 — S7 사유 변경 · 소프트 삭제 **2연산**

     BR-09가 「감사 로그 생성 실패 시 수정·삭제도 실패 처리한다」로 규정한다.
     🔴 그것을 코드가 아니라 **배치의 원자성**(Q-3 실측)이 보장한다 — 한 연산이라도
        거부되면 남은 문서가 0/2다.

     🔴 `src/lib/records.ts`의 `updateRecordReason`·`deleteRecord`와 **같은 필드 집합**이다.
        한 글자라도 다르면 이 테스트가 코드를 검증하지 못한다(파일 머리글 규율).

     🔴 **`before`/`after`에 학생 이름·학번을 담지 않는다**(W-18 §2.1① · §14.3과 양립).
        누구의 기록인지는 `targetId`(= recordId)로 역추적한다.
     ========================================================================*/
  describe('🔴 배치 조합 — S7 사유 변경 2연산 (W-21B · BR-07b · BR-09)')

  function reasonEditBatch(db, actor, actorRole, { recordId = 'rec-seed', over = {}, logOver = {} } = {}) {
    const b = writeBatch(db)
    const now = serverTimestamp()
    b.update(doc(db, 'records', recordId), {
      reasonCode: 'SLIPPER', reasonText: null, updatedBy: actor, updatedAt: now, ...over,
    })
    b.set(doc(db, 'auditLogs', 'log-recedit'), {
      actorUid: actor, actorName: '행위자', actorRole, action: 'RECORD_UPDATE',
      targetType: 'records', targetId: recordId,
      before: { reasonCode: 'DRESS', reasonText: null },
      after: { reasonCode: 'SLIPPER', reasonText: null },
      createdAt: now, ...logOver,
    })
    return b.commit()
  }

  await seed()
  await check('B-21', 'pass', '🔴 **작성자 본인(`member`)의 사유 변경 2연산** — 결정 4가 연 경로', () =>
    reasonEditBatch(as(UIDS.member), UIDS.member, 'member'))
  await seed()
  await check('B-22', 'pass', '`vice`의 사유 변경 2연산 (비작성자 권한자)', () =>
    reasonEditBatch(as(UIDS.vice), UIDS.vice, 'vice'))
  await seed()
  await put('records/rec-other', recordPayload({ createdBy: UIDS.vice }))
  await check('B-23', 'deny', '🔴 **비작성자 `member`** — `records` 연산이 걸려 전체 거부', () =>
    reasonEditBatch(as(UIDS.member), UIDS.member, 'member', { recordId: 'rec-other' }))
  await seed()
  await check('B-24', 'deny', '🔴 정상 사유 변경 + **위조된 감사 로그** — 로그가 걸려 전체 거부(BR-09)', () =>
    reasonEditBatch(as(UIDS.vice), UIDS.vice, 'vice', { logOver: { actorUid: UIDS.head } }))
  await seed()
  await check('B-25', 'deny', '🔴 잘못된 사유(`ETC` + `reasonText` 없음) + 정상 로그 — 전체 거부', () =>
    reasonEditBatch(as(UIDS.vice), UIDS.vice, 'vice', { over: { reasonCode: 'ETC' } }))

  describe('🔴 배치 조합 — S7 소프트 삭제 2연산 (W-21B · BR-08 · BR-09)')

  function deleteBatch(db, actor, actorRole, { recordId = 'rec-seed', over = {} } = {}) {
    const b = writeBatch(db)
    const now = serverTimestamp()
    b.update(doc(db, 'records', recordId), {
      status: 'deleted', deletedBy: actor, deletedAt: now, ...over,
    })
    b.set(doc(db, 'auditLogs', 'log-recdel'), {
      actorUid: actor, actorName: '행위자', actorRole, action: 'RECORD_DELETE',
      targetType: 'records', targetId: recordId,
      before: { status: 'active', reasonCode: 'DRESS' }, after: { status: 'deleted' },
      createdAt: now,
    })
    return b.commit()
  }

  await seed()
  await check('B-26', 'pass', '🔴 **작성자 본인(`member`)의 소프트 삭제 2연산**', () =>
    deleteBatch(as(UIDS.member), UIDS.member, 'member'))
  await seed()
  await check('B-27', 'pass', '`head`의 소프트 삭제 2연산', () =>
    deleteBatch(as(UIDS.head), UIDS.head, 'head'))
  await seed()
  await check('B-28', 'deny', '`teacher`의 소프트 삭제 2연산', () =>
    deleteBatch(as(UIDS.teacher), UIDS.teacher, 'teacher'))
  await seed()
  await put('records/rec-other', recordPayload({ createdBy: UIDS.vice }))
  await check('B-29', 'deny', '🔴 **비작성자 `member`**의 소프트 삭제 2연산', () =>
    deleteBatch(as(UIDS.member), UIDS.member, 'member', { recordId: 'rec-other' }))

  /**
   * 🔴 **`recordCount` 감소를 넣으면 배치가 죽는다** — B-17과 같은 형태의 증명이다.
   *
   * 감소 대상은 `resource.data.createdBy`의 `users` 문서인데, **삭제자가 작성자가
   * 아닐 수 있다**(차장이 부원 기록을 지운다). 그러면 `selfSync()`의 「본인 문서만」에
   * 걸리고, `isHead()` 경로로 가려면 차장에게는 그 권한이 아예 없다.
   * ⇒ 감소를 규칙으로 표현하려면 **「남의 카운터를 바꾸는」 새 문**을 열어야 한다.
   *    그것이 W-16 §7의 v1.1 예약을 이 회차가 **닫지 않기로 한 근거**다(보고서 §6).
   */
  await seed()
  await check('B-30', 'deny', '🔴 **`vice`가 삭제하면서 작성자의 `recordCount`를 −1** (전체 거부 — 판단 근거)', () => {
    const db = as(UIDS.vice)
    const b = writeBatch(db)
    const now = serverTimestamp()
    b.update(doc(db, 'records', 'rec-seed'), { status: 'deleted', deletedBy: UIDS.vice, deletedAt: now })
    b.update(doc(db, 'users', UIDS.member), { recordCount: increment(-1), updatedAt: now })
    return b.commit()
  })
  await seed()
  await check('B-31', 'deny', '🔴 **작성자 본인**이 삭제하면서 자기 `recordCount`를 −1 (RC-3이 막는다)', () => {
    const db = as(UIDS.member)
    const b = writeBatch(db)
    const now = serverTimestamp()
    b.update(doc(db, 'records', 'rec-seed'), { status: 'deleted', deletedBy: UIDS.member, deletedAt: now })
    b.update(doc(db, 'users', UIDS.member), { recordCount: increment(-1), updatedAt: now })
    return b.commit()
  })
}
