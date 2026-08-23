/**
 * W-15A §4.2(U-1~3) + W-15B §3.1(M-1~3) · §3.2(T-1~7) · §3.3(P-1~3) +
 * W-08 §2-3 재신청 6조건 + §9.6 필수 조건 2·7 + §14.5 4·9·10번.
 */
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore'
import { anon, as, asEmail, check, DEPT, describe, put, recordPayload, seed, UIDS } from './harness.mjs'

const listMembers = (db) =>
  getDocs(query(
    collection(db, 'users'),
    where('departmentId', '==', DEPT),
    where('status', '==', 'active'),
  ))

/** `signup.ts`의 재신청 배치가 실제로 쓰는 6키. */
function reapplyPayload(over = {}) {
  return {
    status: 'pending',
    role: 'member',
    withdrawnAt: null,
    rejectReason: null,
    inviteCodeId: 'DJSN-2691',
    updatedAt: serverTimestamp(),
    ...over,
  }
}

export async function run() {
  describe('users list — W-15B §3.1 (🔴 앱에서 처음 쓰는 형태)')
  await seed()
  await check('M-1', 'pass', 'active 부서원의 `departmentId ==` + `status ==` 목록', () =>
    listMembers(as(UIDS.member)))
  await check('M-2', 'deny', '`pending` 계정이 같은 목록', () => listMembers(as(UIDS.pending)))
  await check('M-3', 'deny', '미인증이 같은 목록', () => listMembers(anon()))
  await check('M-4', 'deny', '`withdrawn` 계정이 같은 목록', () => listMembers(as(UIDS.withdrawn)))
  await check('M-5', 'pass', '`teacher`가 같은 목록 (§4.2 단서 3 — 전 데이터 읽기)', () =>
    listMembers(as(UIDS.teacher)))

  describe('users get — §9.6 필수 조건 2')
  await check('PC2-1', 'pass', '`pending`이 **본인** `users` 문서를 읽는다', () =>
    getDoc(doc(as(UIDS.pending), 'users', UIDS.pending)))
  await check('PC2-2', 'deny', '`pending`이 **남의** `users` 문서를 읽는다', () =>
    getDoc(doc(as(UIDS.pending), 'users', UIDS.head)))
  await check('PC2-3', 'deny', '`pending`이 `students`를 읽는다', () =>
    getDoc(doc(as(UIDS.pending), 'students', '2026_20303')))
  await check('PC2-4', 'deny', '`pending`이 `departments`를 읽는다', () =>
    getDoc(doc(as(UIDS.pending), 'departments', DEPT)))
  await check('PC2-5', 'pass', '🔴 `pending`이 `inviteCodes` **단건 get** (W-08 §2-2 — S2 생명선)', () =>
    getDoc(doc(as(UIDS.pending), 'departments', DEPT, 'inviteCodes', 'DJSN-2691')))

  describe('도메인 3중 방어 — §14.5 4번')
  /* 🔴 **이 케이스를 지키는 것은 `$`가 아니라 `matches()`의 전체 일치다**(W-16 Q-5).
     역검증 `no-dollar-anchor`는 아무것도 빨갛게 만들지 못하고,
     `domain-suffix-open`(끝에 `.*`)만 이 줄을 빨갛게 만든다. */
  await check('SEC-4a', 'deny', '🔴 `attacker@dshs.kr.evil.com` (전체 일치 — 역검증 `domain-suffix-open`)', () =>
    getDoc(doc(asEmail('uid-evil', 'attacker@dshs.kr.evil.com'), 'users', 'uid-evil')))
  await check('SEC-4b', 'deny', '`x@gmail.com` 개인 Google 계정', () =>
    getDoc(doc(asEmail('uid-gmail', 'x@gmail.com'), 'users', 'uid-gmail')))
  await check('SEC-4c', 'deny', '`dshs.kr@evil.com`', () =>
    getDoc(doc(asEmail('uid-evil2', 'dshs.kr@evil.com'), 'users', 'uid-evil2')))

  describe('users update — 승인·거절 (W-15A §4.2)')
  await seed()
  await check('U-1', 'pass', '`head`가 남의 `status`를 `pending → active`', () =>
    updateDoc(doc(as(UIDS.head), 'users', UIDS.pending), {
      status: 'active', approvedBy: UIDS.head, approvedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }))
  await seed()
  await check('U-2', 'deny', '🔴 `vice`가 같은 시도 (US-V-03 AC-3)', () =>
    updateDoc(doc(as(UIDS.vice), 'users', UIDS.pending), {
      status: 'active', approvedBy: UIDS.vice, approvedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }))
  await seed()
  await check('U-3', 'pass', '`head`가 `pending → rejected` + `rejectReason: null`', () =>
    updateDoc(doc(as(UIDS.head), 'users', UIDS.pending), {
      status: 'rejected', rejectReason: null, updatedAt: serverTimestamp(),
    }))
  await seed()
  await check('U-4', 'deny', '`teacher`가 남의 `status`를 바꾼다', () =>
    updateDoc(doc(as(UIDS.teacher), 'users', UIDS.pending), { status: 'active', updatedAt: serverTimestamp() }))

  describe('users role — 🔴 T-2 ↔ T-7 (BR-21 ↔ 양도의 자기 강등)')
  await seed()
  await check('T-1', 'pass', '`head`가 남의 `role`을 `member → head` (양도 승격)', () =>
    updateDoc(doc(as(UIDS.head), 'users', UIDS.member), { role: 'head', updatedAt: serverTimestamp() }))
  await seed()
  await check('T-2', 'pass', '🔴 `head`가 **본인** `role`을 `head → member` (양도의 강등)', () =>
    updateDoc(doc(as(UIDS.head), 'users', UIDS.head), { role: 'member', updatedAt: serverTimestamp() }))
  await seed()
  await check('T-4', 'deny', '`vice`가 남의 `role`을 바꾼다', () =>
    updateDoc(doc(as(UIDS.vice), 'users', UIDS.member), { role: 'head', updatedAt: serverTimestamp() }))
  await seed()
  await check('T-5', 'deny', '`teacher`가 남의 `role`을 바꾼다', () =>
    updateDoc(doc(as(UIDS.teacher), 'users', UIDS.member), { role: 'head', updatedAt: serverTimestamp() }))
  await seed()
  await check('T-6', 'deny', '`member`가 남의 `role`을 바꾼다', () =>
    updateDoc(doc(as(UIDS.member), 'users', UIDS.vice), { role: 'head', updatedAt: serverTimestamp() }))
  await seed()
  await check('T-7', 'deny', '🔴 `head`가 **본인** `role`을 `head → vice` (BR-21 · R-04)', () =>
    updateDoc(doc(as(UIDS.head), 'users', UIDS.head), { role: 'vice', updatedAt: serverTimestamp() }))
  await seed()
  await check('T-7b', 'deny', '🔴 `member`가 **본인** `role`을 `head`로 (§14.5 2번 — 부장 2명 시도)', () =>
    updateDoc(doc(as(UIDS.member), 'users', UIDS.member), { role: 'head', updatedAt: serverTimestamp() }))
  await seed()
  await check('T-7c', 'deny', '`head`가 본인 `role`을 `member`로 바꾸면서 `status`도 함께 (허용 키 밖)', () =>
    updateDoc(doc(as(UIDS.head), 'users', UIDS.head), {
      role: 'member', status: 'withdrawn', updatedAt: serverTimestamp(),
    }))

  describe('departments update — W-15B §3.3')
  await seed()
  await check('P-1', 'pass', '`head`가 `headUid` 갱신', () =>
    updateDoc(doc(as(UIDS.head), 'departments', DEPT), { headUid: UIDS.member, updatedAt: serverTimestamp() }))
  await seed()
  await check('P-2', 'pass', '🔴 `dev`가 같은 갱신 (결정 2)', () =>
    updateDoc(doc(as(UIDS.dev), 'departments', DEPT), { headUid: UIDS.member, updatedAt: serverTimestamp() }))
  await seed()
  await check('P-3a', 'deny', '`vice`가 같은 시도', () =>
    updateDoc(doc(as(UIDS.vice), 'departments', DEPT), { headUid: UIDS.vice, updatedAt: serverTimestamp() }))
  await check('P-3b', 'deny', '`teacher`가 같은 시도', () =>
    updateDoc(doc(as(UIDS.teacher), 'departments', DEPT), { headUid: UIDS.teacher, updatedAt: serverTimestamp() }))
  await check('P-3c', 'deny', '`member`가 같은 시도', () =>
    updateDoc(doc(as(UIDS.member), 'departments', DEPT), { headUid: UIDS.member, updatedAt: serverTimestamp() }))
  await check('DP-1', 'pass', 'active 부서원의 `departments` 읽기', () =>
    getDoc(doc(as(UIDS.member), 'departments', DEPT)))
  await check('DP-2', 'deny', '`departments` 생성 (초기 시딩은 콘솔 — §9.7)', () =>
    setDoc(doc(as(UIDS.head), 'departments', 'other'), { headUid: UIDS.head }))

  describe('users create — S2 가입 신청')
  await seed()
  const newUser = (over = {}) => ({
    uid: 'uid-new', email: 'uid-new@dshs.kr', name: '신입', nameSource: 'parsed',
    displayNameRaw: '26_20999신입', role: 'member', status: 'pending',
    departmentId: DEPT, inviteCodeId: 'DJSN-2691',
    notificationPrefs: { duty: true, approval: true },
    createdAt: serverTimestamp(), recordCount: 0, updatedAt: serverTimestamp(), ...over,
  })
  await check('UC-1', 'pass', '본인 uid + `pending` + `member` + 토큰 이메일 일치', () =>
    setDoc(doc(as('uid-new'), 'users', 'uid-new'), newUser()))
  await check('UC-2', 'deny', '🔴 `role: head`로 자기 문서 생성', () =>
    setDoc(doc(as('uid-new2'), 'users', 'uid-new2'), newUser({ uid: 'uid-new2', email: 'uid-new2@dshs.kr', role: 'head' })))
  await check('UC-3', 'deny', '🔴 `status: active`로 자기 문서 생성 (승인 우회)', () =>
    setDoc(doc(as('uid-new3'), 'users', 'uid-new3'), newUser({ uid: 'uid-new3', email: 'uid-new3@dshs.kr', status: 'active' })))
  await check('UC-4', 'deny', '남의 uid로 문서 생성', () =>
    setDoc(doc(as('uid-new4'), 'users', 'uid-other'), newUser({ uid: 'uid-other', email: 'uid-other@dshs.kr' })))
  await check('UC-5', 'deny', '`email`이 토큰 이메일과 다르다', () =>
    setDoc(doc(as('uid-new5'), 'users', 'uid-new5'), newUser({ uid: 'uid-new5', email: 'someone@dshs.kr' })))

  describe('users update — DR-12 자동 갱신 (🔴 부록 B가 정본)')
  await seed()
  await check('SY-1', 'pass', '🔴 `AuthProvider` 동기화 7키 (요약표만 보면 막힌다)', () =>
    updateDoc(doc(as(UIDS.member), 'users', UIDS.member), {
      displayNameRaw: '26_20404새이름', name: '새이름', memberStudentNo: '20404',
      memberGrade: 2, memberClassNo: 4, memberNumber: 4, updatedAt: serverTimestamp(),
    }))
  await check('SY-2', 'pass', '`lastActiveAt` 단독 (DR-12 스로틀)', () =>
    updateDoc(doc(as(UIDS.member), 'users', UIDS.member), { lastActiveAt: serverTimestamp() }))
  await check('SY-3', 'pass', '`notificationPrefs` (S10 토글 — W-17 소비자)', () =>
    updateDoc(doc(as(UIDS.member), 'users', UIDS.member), {
      notificationPrefs: { duty: false, approval: true }, updatedAt: serverTimestamp(),
    }))
  await check('SY-4', 'deny', '🔴 본인이 `status`를 `active`로 (허용 키 밖)', () =>
    updateDoc(doc(as(UIDS.pending), 'users', UIDS.pending), { status: 'active', updatedAt: serverTimestamp() }))
  await check('SY-5', 'deny', '🔴 본인이 `email`을 바꾼다', () =>
    updateDoc(doc(as(UIDS.member), 'users', UIDS.member), { email: 'x@dshs.kr', updatedAt: serverTimestamp() }))
  await check('SY-6', 'deny', '남의 `lastActiveAt`을 바꾼다', () =>
    updateDoc(doc(as(UIDS.member), 'users', UIDS.vice), { lastActiveAt: serverTimestamp() }))

  describe('users update — 재신청 예외 6조건 (W-08 §2-3)')
  const withdrawnDoc = {
    uid: UIDS.withdrawn, email: `${UIDS.withdrawn}@dshs.kr`, name: '탈퇴자', nameSource: 'parsed',
    displayNameRaw: '26_20505탈퇴자', role: 'member', status: 'withdrawn', departmentId: DEPT,
    notificationPrefs: { duty: true, approval: true }, recordCount: 0,
    withdrawnAt: new Date(), rejectReason: null, anonymizedAt: null,
  }
  const reset = async (over = {}) => {
    await seed()
    await put(`users/${UIDS.withdrawn}`, { ...withdrawnDoc, ...over })
  }
  await reset()
  await check('RE-0', 'pass', '6조건 전부 만족 (`withdrawn → pending`)', () =>
    updateDoc(doc(as(UIDS.withdrawn), 'users', UIDS.withdrawn), reapplyPayload()))
  await reset({ status: 'rejected' })
  await check('RE-0b', 'pass', '`rejected → pending` (BR-28 재신청)', () =>
    updateDoc(doc(as(UIDS.withdrawn), 'users', UIDS.withdrawn), reapplyPayload()))

  await reset({ status: 'suspended' })
  await check('RE-1', 'deny', '조건1 위반 — 이전 `status`가 `suspended`', () =>
    updateDoc(doc(as(UIDS.withdrawn), 'users', UIDS.withdrawn), reapplyPayload()))
  await reset()
  await check('RE-2', 'deny', '조건2 위반 — 새 `status`가 `active`', () =>
    updateDoc(doc(as(UIDS.withdrawn), 'users', UIDS.withdrawn), reapplyPayload({ status: 'active' })))
  await reset({ role: 'vice' })
  await check('RE-3', 'deny', '조건3 위반 — `role`을 `vice`로 복원 (BR-62)', () =>
    updateDoc(doc(as(UIDS.withdrawn), 'users', UIDS.withdrawn), reapplyPayload({ role: 'vice' })))
  await reset()
  await check('RE-4', 'deny', '조건4 위반 — `withdrawnAt`을 남긴다', () =>
    updateDoc(doc(as(UIDS.withdrawn), 'users', UIDS.withdrawn), reapplyPayload({ withdrawnAt: new Date() })))
  await reset({ anonymizedAt: new Date() })
  await check('RE-5', 'deny', '🔴 조건5 위반 — 익명화된 계정의 재활성 (BR-63)', () =>
    updateDoc(doc(as(UIDS.withdrawn), 'users', UIDS.withdrawn), reapplyPayload()))
  await reset()
  await check('RE-6', 'deny', '조건6 위반 — `recordCount`를 함께 바꾼다 (허용 키 밖)', () =>
    updateDoc(doc(as(UIDS.withdrawn), 'users', UIDS.withdrawn), reapplyPayload({ recordCount: 999 })))

  describe('본인 탈퇴 — §9.6 필수 조건 7 · §14.5 9번 (소비자는 S10/W-17)')
  await seed()
  await check('SEC-9a', 'deny', '🔴 **부장**의 본인 탈퇴 (BR-56 · R-07)', () =>
    updateDoc(doc(as(UIDS.head), 'users', UIDS.head), {
      status: 'withdrawn', withdrawnAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }))
  await check('SEC-9b', 'pass', '`member`의 본인 탈퇴 (`selfWithdraw` 허용 키 3개)', () =>
    updateDoc(doc(as(UIDS.member), 'users', UIDS.member), {
      status: 'withdrawn', withdrawnAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }))
  await seed()
  await check('SEC-9c', 'deny', '탈퇴하면서 `role`을 함께 바꾼다 (허용 키 밖)', () =>
    updateDoc(doc(as(UIDS.vice), 'users', UIDS.vice), {
      status: 'withdrawn', role: 'head', withdrawnAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }))

  describe('탈퇴 계정 — §14.5 10번')
  await seed()
  await check('SEC-10a', 'deny', '`withdrawn` 계정의 `records` 읽기', () =>
    getDocs(query(collection(as(UIDS.withdrawn), 'records'), where('status', '==', 'active'))))
  await check('SEC-10b', 'deny', '`withdrawn` 계정의 `records` 쓰기 (페이로드는 정상이다 — 막는 것은 `isActive()`다)', () =>
    setDoc(doc(as(UIDS.withdrawn), 'records', 'rec-w'), recordPayload({ createdBy: UIDS.withdrawn })))

  describe('users delete — §9.6 「`dev`만」')
  await seed()
  await check('UD-1', 'pass', '`dev`의 `users` 삭제 (§14.3 파기 절차)', () =>
    deleteDoc(doc(as(UIDS.dev), 'users', UIDS.member)))
  await seed()
  await check('UD-2', 'deny', '🔴 `head`의 `users` 삭제', () =>
    deleteDoc(doc(as(UIDS.head), 'users', UIDS.member)))
  await check('UD-3', 'deny', '본인 문서 삭제 (탈퇴는 소프트다 — C7)', () =>
    deleteDoc(doc(as(UIDS.member), 'users', UIDS.member)))
}
