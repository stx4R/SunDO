/**
 * W-12 §4 — `records` create 10항목 + W-13 §4 읽기 2건 + 보강.
 * 🔴 「1자/21자」는 한 항목이지만 케이스가 둘이라 테스트를 둘로 폈다.
 */
import {
  collection, doc, deleteDoc, getDocs, limit, orderBy, query, setDoc, Timestamp,
  updateDoc, where, documentId,
} from 'firebase/firestore'
import { as, anon, check, describe, recordPayload, seed, UIDS, YEAR } from './harness.mjs'

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

  describe('records update · delete')
  await seed()
  await check('RU-1', 'pass', '`vice`의 사유 변경 (v1.1 BR-07b)', () =>
    updateDoc(doc(as(UIDS.vice), 'records', 'rec-seed'), { reasonCode: 'SLIPPER', reasonText: null }))

  await seed()
  await check('RU-2', 'deny', '`member`의 사유 변경', () =>
    updateDoc(doc(as(UIDS.member), 'records', 'rec-seed'), { reasonCode: 'SLIPPER', reasonText: null }))

  await seed()
  await check('RU-3', 'deny', '`vice`가 `createdBy`를 함께 바꾼다', () =>
    updateDoc(doc(as(UIDS.vice), 'records', 'rec-seed'), {
      reasonCode: 'SLIPPER', reasonText: null, createdBy: UIDS.vice,
    }))

  await seed()
  await check('RD-1', 'deny', '🔴 물리 삭제 (BR-08 — 소프트 삭제만)', () =>
    deleteDoc(doc(as(UIDS.head), 'records', 'rec-seed')))
}
