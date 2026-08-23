/**
 * W-15A §4.1(A-1~3) · §4.3(C-1~5) · §4.4(L-1~3) + W-15B §3.4(L-4) +
 * W-14 §3(D-1) + `students` · `meta` · 규칙 로드 확인.
 */
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc,
  updateDoc, where,
} from 'firebase/firestore'
import { anon, as, check, DEPT, describe, seed, UIDS, YEAR } from './harness.mjs'

const codes = (db) => collection(db, 'departments', DEPT, 'inviteCodes')
const code = (db, id) => doc(db, 'departments', DEPT, 'inviteCodes', id)

function codeDoc(id, over = {}) {
  return {
    code: id, issuedBy: UIDS.head, issuedAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + 14 * 864e5), isActive: true, revokedAt: null,
    useCount: 0, maxUses: 30, ...over,
  }
}

export async function run() {
  describe('🔴 규칙 로드 확인 (§6 함정 3 — 에뮬레이터 기본 규칙은 전부 허용이다)')
  await seed()
  await check('LOAD-1', 'deny', '미인증이 PRD에 없는 컬렉션을 읽는다', () =>
    getDoc(doc(anon(), 'zzruleprobe', 'x')))
  await check('LOAD-2', 'deny', '🔴 **active `head`**가 PRD에 없는 컬렉션을 읽는다 (catch-all 잔재 0건)', () =>
    getDoc(doc(as(UIDS.head), 'zzruleprobe', 'x')))
  await check('LOAD-3', 'deny', 'active `head`가 PRD에 없는 컬렉션에 쓴다', () =>
    setDoc(doc(as(UIDS.head), 'zzruleprobe', 'x'), { a: 1 }))

  describe('approvalRequests — W-15A §4.1')
  await seed()
  await check('A-1', 'pass', '`vice`가 `status == pending` 목록 (S8 ③ 구독)', () =>
    getDocs(query(collection(as(UIDS.vice), 'approvalRequests'), where('status', '==', 'pending'))))
  await check('A-2', 'deny', '🔴 `member`(active)가 같은 목록', () =>
    getDocs(query(collection(as(UIDS.member), 'approvalRequests'), where('status', '==', 'pending'))))
  await check('A-3', 'deny', '🔴 `vice`가 `status`를 `approved`로 (US-V-03 AC-3)', () =>
    updateDoc(doc(as(UIDS.vice), 'approvalRequests', 'req-1'), {
      status: 'approved', decidedBy: UIDS.vice, decidedAt: serverTimestamp(),
    }))
  await check('A-4', 'pass', '`teacher`가 목록을 읽는다 (§4.2 단서 3)', () =>
    getDocs(query(collection(as(UIDS.teacher), 'approvalRequests'), where('status', '==', 'pending'))))
  await check('A-5', 'pass', '`head`가 `approved`로 처리', () =>
    updateDoc(doc(as(UIDS.head), 'approvalRequests', 'req-1'), {
      status: 'approved', decidedBy: UIDS.head, decidedAt: serverTimestamp(),
    }))
  await seed()
  await check('A-6', 'pass', '본인의 신청 문서 단건 읽기 (§9.6 「본인 또는 vice 이상」)', () =>
    getDoc(doc(as(UIDS.pending), 'approvalRequests', 'req-1')))
  await check('A-7', 'pass', 'S2 신청 생성 (본인 uid)', () =>
    setDoc(doc(as('uid-new'), 'approvalRequests', 'req-new'), {
      uid: 'uid-new', email: 'uid-new@dshs.kr', name: '신입',
      inviteCodeId: 'DJSN-2691', status: 'pending', createdAt: serverTimestamp(),
    }))
  await check('A-8', 'deny', '🔴 남의 uid로 신청 생성', () =>
    setDoc(doc(as('uid-new'), 'approvalRequests', 'req-forge'), {
      uid: UIDS.member, email: 'x@dshs.kr', name: '위조', status: 'pending',
    }))
  await check('A-9', 'deny', '신청 문서 삭제', () =>
    deleteDoc(doc(as(UIDS.head), 'approvalRequests', 'req-1')))

  describe('inviteCodes — W-15A §4.3 · W-08 §2-1 (🔴 get ↔ list 분리)')
  await seed()
  await check('C-1', 'pass', '`head`가 새 코드 create (문서 ID = `code` 필드)', () =>
    setDoc(code(as(UIDS.head), 'ABCD-2345'), codeDoc('ABCD-2345')))
  await check('C-2', 'deny', '🔴 `code` 필드를 문서 ID와 **다르게** create', () =>
    setDoc(code(as(UIDS.head), 'EFGH-6789'), codeDoc('WXYZ-1111')))
  await check('C-3', 'pass', '`head`가 기존 코드를 `isActive: false` + `revokedAt`로 update (BR-12)', () =>
    updateDoc(code(as(UIDS.head), 'DJSN-2691'), { isActive: false, revokedAt: serverTimestamp() }))
  await seed()
  await check('C-4', 'pass', '`head`가 `inviteCodes` **list** (BR-16 레이트 리밋)', () =>
    getDocs(query(codes(as(UIDS.head)), where('isActive', '==', true))))
  await check('C-4b', 'deny', '🔴 `member`(active)가 같은 **list** — 유효 코드 전체 유출 차단', () =>
    getDocs(query(codes(as(UIDS.member)), where('isActive', '==', true))))
  await check('C-4c', 'deny', '🔴 `pending`이 같은 **list**', () =>
    getDocs(query(codes(as(UIDS.pending)), where('isActive', '==', true))))
  await check('C-4d', 'deny', '`teacher`가 같은 **list**', () =>
    getDocs(query(codes(as(UIDS.teacher)), where('isActive', '==', true))))
  await check('C-5', 'pass', '`head`가 `useCount`를 +1 update (승인 배치)', () =>
    updateDoc(code(as(UIDS.head), 'DJSN-2691'), { useCount: 4 }))
  await check('C-6', 'pass', '🔴 학교 계정의 **단건 get** (S2 코드 검증 — W-08 §2-1)', () =>
    getDoc(code(as('uid-new'), 'DJSN-2691')))
  await check('C-7', 'deny', '미인증의 단건 get', () => getDoc(code(anon(), 'DJSN-2691')))
  await check('C-8', 'deny', '`member`가 코드를 create', () =>
    setDoc(code(as(UIDS.member), 'MMMM-2222'), codeDoc('MMMM-2222')))
  await check('C-9', 'deny', '코드 삭제 (BR-12 — 만료로만 무효화)', () =>
    deleteDoc(code(as(UIDS.head), 'DJSN-2691')))

  describe('auditLogs — W-15A §4.4 · W-15B §3.4 · §14.5 3번')
  await seed()
  const log = (actorUid, action = 'USER_APPROVE') => ({
    actorUid, actorName: '행위자', actorRole: 'head', action,
    targetType: 'users', targetId: UIDS.pending, before: null, after: null,
    createdAt: serverTimestamp(),
  })
  await check('L-1', 'pass', '`head`가 `actorUid == auth.uid`로 create', () =>
    setDoc(doc(as(UIDS.head), 'auditLogs', 'log-1'), log(UIDS.head)))
  await check('L-2', 'deny', '🔴 `actorUid`를 남의 uid로 위조', () =>
    setDoc(doc(as(UIDS.head), 'auditLogs', 'log-2'), log(UIDS.vice)))
  await check('L-3a', 'deny', '🔴 기존 감사 로그 update', () =>
    updateDoc(doc(as(UIDS.head), 'auditLogs', 'log-seed'), { action: 'CODE_ISSUE' }))
  await check('L-3b', 'deny', '🔴 기존 감사 로그 delete', () =>
    deleteDoc(doc(as(UIDS.head), 'auditLogs', 'log-seed')))
  await check('L-3c', 'deny', '🔴 `dev`도 감사 로그를 지울 수 없다', () =>
    deleteDoc(doc(as(UIDS.dev), 'auditLogs', 'log-seed')))
  await check('L-4', 'pass', '🔴 `HEAD_TRANSFER` create (W-15B 신규 action)', () =>
    setDoc(doc(as(UIDS.head), 'auditLogs', 'log-4'), log(UIDS.head, 'HEAD_TRANSFER')))
  await check('L-5', 'pass', '`head`가 감사 로그를 읽는다 (v1.1 ④ 화면)', () =>
    getDocs(query(collection(as(UIDS.head), 'auditLogs'))))
  await check('L-6', 'pass', '`teacher`가 감사 로그를 읽는다', () =>
    getDocs(query(collection(as(UIDS.teacher), 'auditLogs'))))
  await check('L-7', 'deny', '`member`가 감사 로그를 읽는다', () =>
    getDocs(query(collection(as(UIDS.member), 'auditLogs'))))

  describe('dutySchedules — W-14 §3')
  await seed()
  await check('D-1', 'pass', 'active 부서원의 단건 조회', () =>
    getDoc(doc(as(UIDS.member), 'dutySchedules', '2026-W35')))
  await check('D-2', 'deny', '`pending`의 단건 조회', () =>
    getDoc(doc(as(UIDS.pending), 'dutySchedules', '2026-W35')))
  await check('D-3', 'pass', '`vice`의 편성 update (v1.1 S9 편집)', () =>
    updateDoc(doc(as(UIDS.vice), 'dutySchedules', '2026-W35'), { mon: { name: '부원1' } }))
  await check('D-4', 'deny', '`member`의 편성 update', () =>
    updateDoc(doc(as(UIDS.member), 'dutySchedules', '2026-W35'), { mon: { name: '부원1' } }))
  await check('D-5', 'pass', '`head`의 삭제', () =>
    deleteDoc(doc(as(UIDS.head), 'dutySchedules', '2026-W35')))

  describe('students — 🔴 부록 B의 `allow write` 뭉치기를 풀었다')
  await seed()
  const student = { academicYear: YEAR, grade: 1, classNo: 1, number: 1, name: '학생1', studentNo: '10101', isActive: true }
  await check('ST-1', 'pass', 'active 부서원의 목록 조회 (IX-08 형태)', () =>
    getDocs(query(
      collection(as(UIDS.member), 'students'),
      where('academicYear', '==', YEAR),
      where('grade', '==', 2),
      where('classNo', '==', 3),
    )))
  await check('ST-2', 'pass', '`head`의 명부 create (⑤ 임포트 — v1.1)', () =>
    setDoc(doc(as(UIDS.head), 'students', '2026_10101'), student))
  await check('ST-3', 'deny', '`member`의 명부 create', () =>
    setDoc(doc(as(UIDS.member), 'students', '2026_10102'), student))
  await check('ST-4', 'deny', '🔴 `head`의 명부 **삭제** (부록 B `allow write`면 통과해 버린다)', () =>
    deleteDoc(doc(as(UIDS.head), 'students', '2026_20303')))
  await check('ST-5', 'deny', '`pending`의 명부 조회 (§9.6 필수 조건 2)', () =>
    getDoc(doc(as(UIDS.pending), 'students', '2026_20303')))

  describe('meta')
  await seed()
  await check('MT-1', 'pass', '인증 사용자의 읽기 (최소 지원 버전 판정)', () =>
    getDoc(doc(as(UIDS.pending), 'meta', 'appConfig')))
  await check('MT-2', 'deny', '미인증의 읽기', () => getDoc(doc(anon(), 'meta', 'appConfig')))
  await check('MT-3', 'pass', '`dev`의 update', () =>
    updateDoc(doc(as(UIDS.dev), 'meta', 'appConfig'), { minVersion: '1.1.0' }))
  await check('MT-4', 'deny', '`head`의 update', () =>
    updateDoc(doc(as(UIDS.head), 'meta', 'appConfig'), { minVersion: '1.1.0' }))
}
