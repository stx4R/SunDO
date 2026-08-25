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

  /* 🔴 **W-22B BR-30 — 신청자가 「자기」 신청을 목록으로 셀 수 있는가.**
     이 시점의 컬렉션에는 `req-1`(uid=pending)과 A-7이 만든 `req-new`(uid=uid-new)가 있다.
     🔴 **A-11이 성립하려면 남의 문서가 하나 있어야 한다** — 전부 본인 것이면
     `where` 없는 질의도 통과해 버려 「전체 목록이 막힌다」를 증명하지 못한다.
     (W-15B §6 ④ — 픽스처가 좁으면 결함이 코드로 오해된다.) */
  await check('A-10', 'pass', '🔴 **BR-30** — `pending`이 `where(uid == 본인)`으로 자기 신청을 센다', () =>
    getDocs(query(collection(as(UIDS.pending), 'approvalRequests'), where('uid', '==', UIDS.pending))))
  await check('A-11', 'deny', '🔴 `pending`이 **`where` 없이** 전체 목록 (남의 문서가 섞인다)', () =>
    getDocs(collection(as(UIDS.pending), 'approvalRequests')))
  await check('A-12', 'deny', '🔴 `pending`이 **남의 uid**로 목록', () =>
    getDocs(query(collection(as(UIDS.pending), 'approvalRequests'), where('uid', '==', 'uid-new'))))
  await check('A-13', 'pass', '`withdrawn`(재가입 경로)이 자기 신청을 센다 — BR-61', () =>
    getDocs(query(collection(as(UIDS.withdrawn), 'approvalRequests'), where('uid', '==', UIDS.withdrawn))))
  await check('A-14', 'pass', '🔴 `noprofile`(문서가 아직 없는 신규)이 자기 신청을 센다 — 0건이어도 허용', () =>
    getDocs(query(collection(as(UIDS.noprofile), 'approvalRequests'), where('uid', '==', UIDS.noprofile))))

  /* ==========================================================================
     inviteCodes — W-15A §4.3 · W-08 §2-1 + 🔴 **W-21B 기능 12(결정 5)**

     🔴 **세 케이스가 이 회차에 뒤집혔다** — C-1 · C-3 · (배치 B-3).
        발급·만료는 이제 `dev`만이다. 부장은 **복사만** 한다.

     🔴 **`update`를 통째로 `isDev()`로 좁히면 부장의 가입 승인이 죽는다.**
        승인 배치(OP-09)가 같은 규칙으로 `useCount`를 +1 하기 때문이다
        (`src/lib/admin.ts` `approveRequest` · 배치 테스트 B-1).
        그래서 **필드로 갈랐다** — `useCount`만 `head`에게 남는다.
     ========================================================================*/
  describe('inviteCodes — W-15A §4.3 · W-08 §2-1 · 🔴 W-21B 결정 5')
  await seed()
  await check('C-1', 'deny', '🔴 **`head`가 새 코드 create** — 결정 5가 닫았다(뒤집힘)', () =>
    setDoc(code(as(UIDS.head), 'ABCD-2345'), codeDoc('ABCD-2345')))
  await check('C-1b', 'pass', '🔴 `dev`가 새 코드 create (유일한 발급 경로)', () =>
    setDoc(code(as(UIDS.dev), 'ABCD-2345'), codeDoc('ABCD-2345')))
  await check('C-2', 'deny', '🔴 `code` 필드를 문서 ID와 **다르게** create (`dev`도 못 한다)', () =>
    setDoc(code(as(UIDS.dev), 'EFGH-6789'), codeDoc('WXYZ-1111')))
  await check('C-3', 'deny', '🔴 **`head`가 기존 코드를 `isActive: false`로**(BR-12) — 뒤집힘', () =>
    updateDoc(code(as(UIDS.head), 'DJSN-2691'), { isActive: false, revokedAt: serverTimestamp() }))
  await check('C-3b', 'pass', '🔴 `dev`가 기존 코드를 `isActive: false` + `revokedAt`로 (BR-12)', () =>
    updateDoc(code(as(UIDS.dev), 'DJSN-2691'), { isActive: false, revokedAt: serverTimestamp() }))
  await seed()
  await check('C-4', 'pass', '`head`가 `inviteCodes` **list** (BR-16 레이트 리밋)', () =>
    getDocs(query(codes(as(UIDS.head)), where('isActive', '==', true))))
  await check('C-4b', 'deny', '🔴 `member`(active)가 같은 **list** — 유효 코드 전체 유출 차단', () =>
    getDocs(query(codes(as(UIDS.member)), where('isActive', '==', true))))
  await check('C-4c', 'deny', '🔴 `pending`이 같은 **list**', () =>
    getDocs(query(codes(as(UIDS.pending)), where('isActive', '==', true))))
  await check('C-4d', 'deny', '`teacher`가 같은 **list**', () =>
    getDocs(query(codes(as(UIDS.teacher)), where('isActive', '==', true))))
  await check('C-5', 'pass', '🔴 `head`가 `useCount`만 +1 update — **승인 배치가 이 문을 쓴다**', () =>
    updateDoc(code(as(UIDS.head), 'DJSN-2691'), { useCount: 4 }))
  await check('C-6', 'pass', '🔴 학교 계정의 **단건 get** (S2 코드 검증 — W-08 §2-1)', () =>
    getDoc(code(as('uid-new'), 'DJSN-2691')))
  await check('C-7', 'deny', '미인증의 단건 get', () => getDoc(code(anon(), 'DJSN-2691')))
  await check('C-8', 'deny', '`member`가 코드를 create', () =>
    setDoc(code(as(UIDS.member), 'MMMM-2222'), codeDoc('MMMM-2222')))
  await check('C-9', 'deny', '코드 삭제 (BR-12 — 만료로만 무효화)', () =>
    deleteDoc(code(as(UIDS.dev), 'DJSN-2691')))

  /* 🔴 결정 5의 급소 — 「`useCount`만」이 정말 「만」인지. 부장이 이 문으로
     만료 처리를 끼워 넣을 수 있으면 필드 분리가 아무 일도 하지 않는다. */
  await seed()
  await check('C-10', 'deny', '🔴 **`head`가 `useCount`와 `isActive`를 함께** — 승인 문으로 만료를 끼워 넣는다', () =>
    updateDoc(code(as(UIDS.head), 'DJSN-2691'), { useCount: 4, isActive: false }))
  await check('C-11', 'pass', '🔴 `dev`의 승인 배치 경로(`useCount` +1)도 그대로 열려 있다', () =>
    updateDoc(code(as(UIDS.dev), 'DJSN-2691'), { useCount: 5 }))
  await seed()
  await check('C-12', 'deny', '`vice`가 `useCount`를 +1 (승인 권한이 없다 — A-3과 같은 문장)', () =>
    updateDoc(code(as(UIDS.vice), 'DJSN-2691'), { useCount: 4 }))
  await check('C-13', 'deny', '`teacher`가 `useCount`를 +1', () =>
    updateDoc(code(as(UIDS.teacher), 'DJSN-2691'), { useCount: 4 }))

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

  /* ==========================================================================
     dutySchedules — W-14 §3 + 🔴 **W-21C 결정 2(편집은 부장만) · 중식/석식**

     🔴 **D-3이 이 회차에 뒤집힌다** — `vice`의 편성 update가 통과에서 거부로.
        §8.9.2 #3은 「차장 이상 노출」이었으나 결정 2가 **부장만**으로 좁혔다.

     🔬 **규약 4-2를 먼저 실행했다** — 앱 소스에서 `dutySchedules`를 만지는 곳은
        `src/lib/duty.ts:119`의 `getDoc` **하나뿐이고 쓰기 경로가 0건**이다.
        그래서 좁혀도 깨질 화면이 없다(보고서 §2.1).
     ========================================================================*/
  describe('dutySchedules — W-14 §3 · 🔴 W-21C 결정 2')

  /** `src/lib/duty.ts`의 `saveDutySchedule`과 **같은 필드 집합**이다. */
  const dutyEdit = (uid, over = {}) => ({
    assignmentsByMeal: { mon: { lunch: [UIDS.member], dinner: [] } },
    assigneeNamesByMeal: { mon: { lunch: ['부원1'], dinner: [] } },
    patrolTimeByMeal: { lunch: '12:30', dinner: '18:30' },
    patrolPlaceByMeal: { lunch: '중앙 현관', dinner: '급식실' },
    updatedBy: uid,
    updatedAt: serverTimestamp(),
    ...over,
  })
  const duty = (uid, id = '2026-W35') => doc(as(uid), 'dutySchedules', id)

  await seed()
  await check('D-1', 'pass', 'active 부서원의 단건 조회', () =>
    getDoc(doc(as(UIDS.member), 'dutySchedules', '2026-W35')))
  await check('D-2', 'deny', '`pending`의 단건 조회', () =>
    getDoc(doc(as(UIDS.pending), 'dutySchedules', '2026-W35')))

  await seed()
  await check('D-3', 'deny', '🔴 **`vice`의 편성 update** — 결정 2가 닫았다(뒤집힘)', () =>
    updateDoc(duty(UIDS.vice), dutyEdit(UIDS.vice)))
  await seed()
  await check('D-4', 'deny', '`member`의 편성 update', () =>
    updateDoc(duty(UIDS.member), dutyEdit(UIDS.member)))
  await seed()
  await check('D-4b', 'deny', '`teacher`의 편성 update', () =>
    updateDoc(duty(UIDS.teacher), dutyEdit(UIDS.teacher)))
  await seed()
  await check('D-4c', 'pass', '🔴 **`head`의 편성 update** — 유일하게 남은 편집 경로', () =>
    updateDoc(duty(UIDS.head), dutyEdit(UIDS.head)))
  await seed()
  await check('D-4d', 'pass', '`dev`의 편성 update (BR-23 복구 경로와 같은 층)', () =>
    updateDoc(duty(UIDS.dev), dutyEdit(UIDS.dev)))

  describe('🔴 dutySchedules — 바꿀 수 있는 필드를 `hasOnly`가 못 박는다')
  await seed()
  await check('D-6', 'deny', '🔴 `weekId`를 함께 바꾼다 (주차 키 불변)', () =>
    updateDoc(duty(UIDS.head), dutyEdit(UIDS.head, { weekId: '2026-W36' })))
  await seed()
  await check('D-7', 'deny', '🔴 `startDate`·`endDate`를 함께 바꾼다', () =>
    updateDoc(duty(UIDS.head), dutyEdit(UIDS.head, { startDate: '2026-01-01', endDate: '2026-01-05' })))
  /* 🔬 **처음에 `createdBy: UIDS.head`로 적었다가 통과해서 알았다** — 시드의
     `createdBy`가 이미 `head`라 **값이 안 바뀌어 `affectedKeys()`에 들어가지 않았다**
     (B-20이 문서화한 성질 · W-17 §4.6). 실제 위반을 재현하려면 **값이 달라야** 한다. */
  await seed()
  await check('D-8', 'deny', '🔴 `createdBy`를 **다른 값으로** 함께 바꾼다 (최초 편성자 불변)', () =>
    updateDoc(duty(UIDS.head), dutyEdit(UIDS.head, { createdBy: UIDS.vice })))
  await seed()
  await check('D-9', 'deny', '🔴 `updatedBy`를 남의 uid로 위조', () =>
    updateDoc(duty(UIDS.head), dutyEdit(UIDS.vice)))
  await seed()
  await check('D-10', 'deny', '🔴 **옛 필드**(`patrolTime`)를 새 앱이 건드린다 — 마이그레이션 산출물은 불변', () =>
    updateDoc(duty(UIDS.head), dutyEdit(UIDS.head, { patrolTime: '09:00' })))

  describe('🔴 dutySchedules — create (§8.9.5 EM-06 `지금 등록하기`)')
  await seed()
  /** 문서가 없는 주차. `saveDutySchedule`이 `create` 경로로 간다. */
  const newDuty = (uid, over = {}) => ({
    weekId: '2026-W40', startDate: '2026-09-28', endDate: '2026-10-02',
    assignmentsByMeal: { mon: { lunch: [UIDS.member], dinner: [] } },
    assigneeNamesByMeal: { mon: { lunch: ['부원1'], dinner: [] } },
    patrolTimeByMeal: { lunch: '12:30', dinner: '18:30' },
    patrolPlaceByMeal: { lunch: '중앙 현관', dinner: '급식실' },
    createdBy: uid, updatedBy: uid, updatedAt: serverTimestamp(),
    ...over,
  })
  await check('D-11', 'pass', '🔴 `head`가 새 주차를 create', () =>
    setDoc(doc(as(UIDS.head), 'dutySchedules', '2026-W40'), newDuty(UIDS.head)))
  await seed()
  await check('D-12', 'deny', '🔴 `vice`가 새 주차를 create (결정 2)', () =>
    setDoc(doc(as(UIDS.vice), 'dutySchedules', '2026-W40'), newDuty(UIDS.vice)))
  await seed()
  await check('D-13', 'deny', '🔴 `weekId`가 문서 ID와 다르다', () =>
    setDoc(doc(as(UIDS.head), 'dutySchedules', '2026-W40'), newDuty(UIDS.head, { weekId: '2026-W41' })))
  await seed()
  await check('D-14', 'deny', '🔴 `createdBy`를 남의 uid로 위조해 create', () =>
    setDoc(doc(as(UIDS.head), 'dutySchedules', '2026-W40'), newDuty(UIDS.head, { createdBy: UIDS.vice })))

  await seed()
  await check('D-5', 'pass', '`head`의 삭제', () =>
    deleteDoc(doc(as(UIDS.head), 'dutySchedules', '2026-W35')))
  await seed()
  await check('D-5b', 'deny', '`vice`의 삭제', () =>
    deleteDoc(doc(as(UIDS.vice), 'dutySchedules', '2026-W35')))

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
