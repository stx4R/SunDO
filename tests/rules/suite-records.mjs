/**
 * W-12 §4 — `records` create 10항목 + W-13 §4 읽기 2건 + 보강.
 * 🔴 「1자/21자」는 한 항목이지만 케이스가 둘이라 테스트를 둘로 폈다.
 */
import {
  collection, doc, deleteDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, Timestamp,
  updateDoc, where, documentId,
} from 'firebase/firestore'
import { as, anon, check, describe, put, recordPayload, seed, UIDS, YEAR } from './harness.mjs'

const RID = 'rec-new'
const at = (mins) => Timestamp.fromDate(new Date(Date.now() + mins * 60_000))

export async function run() {
  describe('records create — W-12 §4 (10항목 → 11케이스)')
  await seed()
  await check('R-1', 'pass', '정상 저장 (active member)', () =>
    setDoc(doc(as(UIDS.member), 'records', RID), recordPayload()))

  await seed()
  await check('R-2', 'deny', '`createdBy`를 남의 uid로 위조', () =>
    setDoc(doc(as(UIDS.member), 'records', RID), recordPayload({ createdBy: UIDS.vice })))

  await seed()
  await check('R-3', 'deny', "`status: 'deleted'`로 생성 (소프트 삭제 우회)", () =>
    setDoc(doc(as(UIDS.member), 'records', RID), recordPayload({ status: 'deleted' })))

  await seed()
  await check('R-4', 'deny', '미래 `occurredAt` (+10분 — BR-39 허용 오차 초과)', () =>
    setDoc(doc(as(UIDS.member), 'records', RID), recordPayload({ occurredAt: at(10) })))

  await seed()
  await check('R-5', 'deny', '미정의 `reasonCode` (`HAIR`)', () =>
    setDoc(doc(as(UIDS.member), 'records', RID), recordPayload({ reasonCode: 'HAIR' })))

  await seed()
  await check('R-6', 'deny', '`ETC`인데 `reasonText`가 없다', () =>
    setDoc(doc(as(UIDS.member), 'records', RID), recordPayload({ reasonCode: 'ETC', reasonText: null })))

  await seed()
  await check('R-7', 'deny', '`ETC`가 아닌데 `reasonText`가 있다', () =>
    setDoc(doc(as(UIDS.member), 'records', RID), recordPayload({ reasonCode: 'DRESS', reasonText: '치마' })))

  await seed()
  await check('R-8', 'deny', '`ETC` `reasonText` 1자', () =>
    setDoc(doc(as(UIDS.member), 'records', RID), recordPayload({ reasonCode: 'ETC', reasonText: '가' })))

  await seed()
  await check('R-9', 'deny', '`ETC` `reasonText` 21자', () =>
    setDoc(doc(as(UIDS.member), 'records', RID), recordPayload({ reasonCode: 'ETC', reasonText: '가'.repeat(21) })))

  await seed()
  await check('R-10', 'deny', '비활성(`pending`) 계정이 저장', () =>
    setDoc(doc(as(UIDS.pending), 'records', RID), recordPayload({ createdBy: UIDS.pending })))

  await seed()
  await check('R-11', 'deny', '`teacher`가 저장 (§4.2 단서 3 — 교사는 쓰기 불가)', () =>
    setDoc(doc(as(UIDS.teacher), 'records', RID), recordPayload({ createdBy: UIDS.teacher })))

  describe('records create — 경계 보강 (신규)')
  await seed()
  await check('R-12', 'pass', '`occurredAt` +3분 — BR-39 ±5분 안쪽 (부록 B대로면 거부된다)', () =>
    setDoc(doc(as(UIDS.member), 'records', RID), recordPayload({ occurredAt: at(3) })))

  await seed()
  await check('R-13', 'pass', '`ETC` `reasonText` 2자 (하한 경계)', () =>
    setDoc(doc(as(UIDS.member), 'records', RID), recordPayload({ reasonCode: 'ETC', reasonText: '지각' })))

  await seed()
  await check('R-14', 'pass', '`ETC` `reasonText` 20자 (상한 경계)', () =>
    setDoc(doc(as(UIDS.member), 'records', RID), recordPayload({ reasonCode: 'ETC', reasonText: '가'.repeat(20) })))

  await seed()
  await check('R-15', 'deny', '`vice`가 남의 uid로 `createdBy` 위조 (§14.5 5번)', () =>
    setDoc(doc(as(UIDS.vice), 'records', RID), recordPayload({ createdBy: UIDS.head })))

  describe('records read — W-13 §4')
  await seed()
  await check('R13-1', 'pass', 'active 부원의 목록 질의 (IX-01 형태)', () =>
    getDocs(query(
      collection(as(UIDS.member), 'records'),
      where('academicYear', '==', YEAR),
      where('status', '==', 'active'),
      orderBy('occurredAt', 'desc'),
      limit(30),
    )))

  await check('R13-2', 'pass', '🔴 `users`를 `documentId() in`으로 묶음 읽기 (S7 작성자 이름)', () =>
    getDocs(query(
      collection(as(UIDS.member), 'users'),
      where(documentId(), 'in', [UIDS.head, UIDS.vice]),
    )))

  await check('R13-3', 'deny', '`pending` 계정의 `records` 목록 질의', () =>
    getDocs(query(collection(as(UIDS.pending), 'records'), where('status', '==', 'active'))))

  await check('R13-4', 'deny', '미인증의 `records` 목록 질의', () =>
    getDocs(query(collection(anon(), 'records'), where('status', '==', 'active'))))

  /* ==========================================================================
     W-21B 기능 9 — 기록 수정·삭제

     🔴 **권한은 「작성자 본인 · 차장 · 부장 · Dev」 넷이다**(결정 4 + 착수 확인).
        `rec-seed`의 작성자는 `member`다 — 그래서 `member`는 **작성자**이고
        `vice`·`head`·`dev`는 **비작성자이지만 권한자**, `teacher`는 둘 다 아니다.
        「비작성자이면서 권한자도 아닌」 경우를 재려면 **남이 쓴 기록**이 필요해
        `rec-other`(작성자 `vice`)를 케이스마다 심는다.

     ⚠ PRD BR-05는 「작성자 본인은 수정·삭제할 수 **없다**」이고 BR-06은 권한을
        `vice`·`head`·`dev`로 규정한다. **결정 4가 그것을 뒤집었다** — 보고서 §8 ①.
     ========================================================================*/

  /** 사유 변경 — `src/lib/records.ts`의 `updateRecordReason`과 **같은 필드 집합**이다. */
  const reasonEdit = (uid, over = {}) => ({
    reasonCode: 'SLIPPER', reasonText: null, updatedBy: uid, updatedAt: serverTimestamp(), ...over,
  })
  /** 소프트 삭제 — `deleteRecord`와 같은 필드 집합. 🔴 `updatedAt`을 쓰지 않는다(§9.3.5). */
  const softDelete = (uid, over = {}) => ({
    status: 'deleted', deletedBy: uid, deletedAt: serverTimestamp(), ...over,
  })
  /** 작성자가 `vice`인 기록. 「비작성자 `member`」를 만들려면 이것이 필요하다. */
  const seedOther = () => put('records/rec-other', recordPayload({ createdBy: UIDS.vice }))
  const rec = (uid, id = 'rec-seed') => doc(as(uid), 'records', id)

  describe('🔴 records 사유 변경 — 권한 4종 (BR-07 · BR-07a · BR-07b)')
  await seed()
  await check('RU-1', 'pass', '`vice`의 사유 변경 (비작성자 · BR-06 승계)', () =>
    updateDoc(rec(UIDS.vice), reasonEdit(UIDS.vice)))

  await seed()
  await check('RU-2', 'pass', '🔴 **작성자 본인(`member`)의 사유 변경** — 결정 4가 연 경로', () =>
    updateDoc(rec(UIDS.member), reasonEdit(UIDS.member)))

  await seed()
  await check('RU-3', 'pass', '`head`의 사유 변경', () =>
    updateDoc(rec(UIDS.head), reasonEdit(UIDS.head)))

  await seed()
  await check('RU-4', 'pass', '`dev`의 사유 변경', () =>
    updateDoc(rec(UIDS.dev), reasonEdit(UIDS.dev)))

  await seed()
  await seedOther()
  await check('RU-5', 'deny', '🔴 **비작성자 `member`**가 남의 기록을 고친다', () =>
    updateDoc(rec(UIDS.member, 'rec-other'), reasonEdit(UIDS.member)))

  await seed()
  await check('RU-6', 'deny', '`teacher`의 사유 변경 (§4.2 단서 3)', () =>
    updateDoc(rec(UIDS.teacher), reasonEdit(UIDS.teacher)))

  await seed()
  await put(`records/rec-pend`, recordPayload({ createdBy: UIDS.pending }))
  await check('RU-7', 'deny', '🔴 비활성(`pending`) **작성자**가 자기 기록을 고친다', () =>
    updateDoc(rec(UIDS.pending, 'rec-pend'), reasonEdit(UIDS.pending)))

  describe('🔴 records 사유 변경 — 바꿀 수 있는 필드를 `hasOnly`가 못 박는다 (BR-07)')
  await seed()
  await check('RU-8', 'deny', '`createdBy`를 함께 바꾼다', () =>
    updateDoc(rec(UIDS.vice), reasonEdit(UIDS.vice, { createdBy: UIDS.vice })))

  await seed()
  await check('RU-9', 'deny', '🔴 `occurredAt`을 함께 바꾼다 (일시 불변)', () =>
    updateDoc(rec(UIDS.vice), reasonEdit(UIDS.vice, { occurredAt: at(-60) })))

  await seed()
  await check('RU-10', 'deny', '🔴 `studentDocId`·`studentName`을 함께 바꾼다 (학생 불변)', () =>
    updateDoc(rec(UIDS.vice), reasonEdit(UIDS.vice, {
      studentDocId: '2026_10101', studentName: '학생1',
    })))

  await seed()
  await check('RU-11', 'deny', '🔴 사유 변경 경로로 `status`를 `deleted`로 (허용 키 밖)', () =>
    updateDoc(rec(UIDS.vice), reasonEdit(UIDS.vice, { status: 'deleted' })))

  await seed()
  await check('RU-12', 'deny', '🔴 `updatedBy`를 남의 uid로 위조', () =>
    updateDoc(rec(UIDS.vice), reasonEdit(UIDS.head)))

  describe('🔴 records 사유 변경 — `validReason()`은 create와 같은 문장이다 (BR-07a)')
  await seed()
  await check('RU-13', 'pass', '`ETC`로 바꾸면서 `reasonText` 2자 (하한 경계)', () =>
    updateDoc(rec(UIDS.vice), reasonEdit(UIDS.vice, { reasonCode: 'ETC', reasonText: '지각' })))

  await seed()
  await check('RU-14', 'pass', '`ETC`로 바꾸면서 `reasonText` 20자 (상한 경계)', () =>
    updateDoc(rec(UIDS.vice), reasonEdit(UIDS.vice, { reasonCode: 'ETC', reasonText: '가'.repeat(20) })))

  await seed()
  await check('RU-15', 'deny', '`ETC`인데 `reasonText`가 `null`', () =>
    updateDoc(rec(UIDS.vice), reasonEdit(UIDS.vice, { reasonCode: 'ETC', reasonText: null })))

  await seed()
  await check('RU-16', 'deny', '`ETC` `reasonText` 21자', () =>
    updateDoc(rec(UIDS.vice), reasonEdit(UIDS.vice, { reasonCode: 'ETC', reasonText: '가'.repeat(21) })))

  await seed()
  await check('RU-17', 'deny', '🔴 `ETC`가 아닌데 `reasonText`를 남긴다 (BR-07a 역방향)', () =>
    updateDoc(rec(UIDS.vice), reasonEdit(UIDS.vice, { reasonCode: 'DRESS', reasonText: '치마' })))

  await seed()
  await check('RU-18', 'deny', '미정의 `reasonCode`(`HAIR`)로 변경', () =>
    updateDoc(rec(UIDS.vice), reasonEdit(UIDS.vice, { reasonCode: 'HAIR' })))

  await seed()
  await put('records/rec-del', recordPayload({ createdBy: UIDS.member, status: 'deleted' }))
  await check('RU-19', 'deny', '🔴 **이미 삭제된** 기록의 사유 변경', () =>
    updateDoc(rec(UIDS.vice, 'rec-del'), reasonEdit(UIDS.vice)))

  describe('🔴 records 소프트 삭제 — BR-08 (`active → deleted` 한 방향)')
  await seed()
  await check('RX-1', 'pass', '🔴 **작성자 본인(`member`)의 소프트 삭제**', () =>
    updateDoc(rec(UIDS.member), softDelete(UIDS.member)))

  await seed()
  await check('RX-2', 'pass', '`vice`의 소프트 삭제', () =>
    updateDoc(rec(UIDS.vice), softDelete(UIDS.vice)))

  await seed()
  await check('RX-3', 'pass', '`head`의 소프트 삭제', () =>
    updateDoc(rec(UIDS.head), softDelete(UIDS.head)))

  await seed()
  await check('RX-4', 'pass', '`dev`의 소프트 삭제', () =>
    updateDoc(rec(UIDS.dev), softDelete(UIDS.dev)))

  await seed()
  await seedOther()
  await check('RX-5', 'deny', '🔴 **비작성자 `member`**가 남의 기록을 지운다', () =>
    updateDoc(rec(UIDS.member, 'rec-other'), softDelete(UIDS.member)))

  await seed()
  await check('RX-6', 'deny', '`teacher`의 소프트 삭제', () =>
    updateDoc(rec(UIDS.teacher), softDelete(UIDS.teacher)))

  await seed()
  await check('RX-7', 'deny', '🔴 `deletedBy`를 남의 uid로 위조', () =>
    updateDoc(rec(UIDS.vice), softDelete(UIDS.head)))

  await seed()
  await check('RX-8', 'deny', '🔴 삭제하면서 `reasonCode`를 함께 바꾼다 (허용 키 밖)', () =>
    updateDoc(rec(UIDS.vice), softDelete(UIDS.vice, { reasonCode: 'ETC', reasonText: '어쩌고' })))

  await seed()
  await check('RX-9', 'deny', "🔴 `status`를 임의 값(`archived`)으로", () =>
    updateDoc(rec(UIDS.vice), softDelete(UIDS.vice, { status: 'archived' })))

  /**
   * 🔴 **되돌리기는 앱에 없다.** design `18`에도 §8.7에도 복구 UI가 없고,
   * BR-08은 「삭제는 소프트 삭제」까지만 규정한다. 되돌리는 유일한 경로는 **콘솔**이며
   * 그 절차는 `database_ToDo/W-21B.md` §5에 있다(DoD 15의 근거).
   *
   * 🔬 **이 케이스를 막는 조건은 하나가 아니다**(역검증 실측). 세 조건이 겹쳐 막는데
   * 마지막 벽이 `deletedBy == request.auth.uid`다 — 되돌리는 요청은 `deletedBy`를
   * 비우므로 거기서 선다. **어느 하나만 벗겨도 열리지 않는다**(`mutations.mjs`의
   * `delete-status-guards-off` 주석). 그래서 이 테스트에 대응하는 단일 변형이 없다.
   */
  await seed()
  await put('records/rec-del', recordPayload({ createdBy: UIDS.member, status: 'deleted' }))
  await check('RX-10', 'deny', '🔴 `deleted → active` 되돌리기 — 앱에는 이 경로가 없다', () =>
    updateDoc(rec(UIDS.head, 'rec-del'), { status: 'active', deletedBy: null, deletedAt: null }))

  /**
   * 🔬 **역검증이 찾아낸 케이스.** `resource.data.status == 'active'`(출발지 조건)가
   * 실제로 막는 것은 RX-10이 아니라 **이것**이다 — RX-10은 목적지 조건이 먼저 세운다.
   *
   * 🔴 `status`가 `deleted → deleted`라 **값이 안 바뀌어 `affectedKeys()`에 들어가지 않고**
   * (B-20이 문서화한 성질), 나머지 조건은 전부 통과한다. 출발지 조건이 없으면
   * **누가 지웠는지가 나중에 덮어써진다.** 감사 로그는 남지만 기록 문서는 거짓말을 한다.
   */
  await seed()
  await put('records/rec-del', recordPayload({ createdBy: UIDS.member, status: 'deleted' }))
  await check('RX-11', 'deny', '🔴 **이미 삭제된** 기록의 `deletedBy`를 다른 사람으로 덮어쓴다', () =>
    updateDoc(rec(UIDS.head, 'rec-del'), softDelete(UIDS.head)))

  await seed()
  await check('RD-1', 'deny', '🔴 물리 삭제 (BR-08 — 소프트 삭제만)', () =>
    deleteDoc(doc(as(UIDS.head), 'records', 'rec-seed')))

  await seed()
  await check('RD-2', 'deny', '🔴 `dev`도 물리 삭제할 수 없다', () =>
    deleteDoc(doc(as(UIDS.dev), 'records', 'rec-seed')))
}
