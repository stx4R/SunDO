/**
 * W-25 규칙 테스트 — `dutyAttendance/{weekId}` (출석 체크).
 *
 * 🔴 **이 컬렉션은 이 회차에 신설됐다.** PRD §9.3에 대응 항목이 없고, 스키마와
 * 「왜 `dutySchedules`에 얹지 않았나」는 `src/lib/attendance.ts`와 `firestore.rules`의
 * 주석에 있다.
 *
 * 🔴 **거부 기대를 명시적으로 센다**(§6 함정 1 · DoD 10). 「통과만 확인하면
 * 조건을 아예 안 쓴 규칙도 통과한다」 — 역검증 변형은 `mutations.mjs`에 있다.
 */
import { doc, getDoc, getDocs, collection, query, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { as, anon, check, describe, seed, UIDS } from './harness.mjs'

const WEEK = '2026-W35'

/** `src/lib/attendance.ts`의 `markAttendance`와 **같은 필드 집합**이다. */
const payload = (uid, over = {}) => ({
  weekId: WEEK,
  marks: {
    [`mon_lunch_${UIDS.member}`]: {
      status: 'present',
      by: uid,
      byName: '차장1',
      at: serverTimestamp(),
    },
  },
  updatedBy: uid,
  updatedAt: serverTimestamp(),
  ...over,
})

/** 이미 한 칸이 찍혀 있는 문서. update 경로의 사전 조건이다. */
const existing = {
  weekId: WEEK,
  marks: { [`mon_lunch_${UIDS.member}`]: { status: 'late', by: UIDS.head, byName: '부장1' } },
  updatedBy: UIDS.head,
  updatedAt: new Date(),
}

const att = (uid, id = WEEK) => doc(as(uid), 'dutyAttendance', id)

export async function run() {
  /* ======================================================================
     읽기 — 🔴 **활성 부원 전원이다.** 요일 행의 이름 색이 곧 이 문서이고
     (사용자 요구 「모든 부원이 시각적으로 확인」), 못 읽으면 색이 영영 검게 남는다.
     ==================================================================== */
  describe('dutyAttendance — 읽기(활성 부원 전원)')

  await seed({ [`dutyAttendance/${WEEK}`]: existing })
  await check('AT-1', 'pass', '`member`(active)의 단건 조회', () =>
    getDoc(doc(as(UIDS.member), 'dutyAttendance', WEEK)))
  await check('AT-1b', 'pass', '`teacher`의 단건 조회 (§4.2 열람 전용)', () =>
    getDoc(doc(as(UIDS.teacher), 'dutyAttendance', WEEK)))
  await check('AT-1c', 'pass', '`member`의 목록 조회', () =>
    getDocs(query(collection(as(UIDS.member), 'dutyAttendance'))))
  await check('AT-2', 'deny', '`pending`의 단건 조회', () =>
    getDoc(doc(as(UIDS.pending), 'dutyAttendance', WEEK)))
  await check('AT-2b', 'deny', '`withdrawn`의 단건 조회', () =>
    getDoc(doc(as(UIDS.withdrawn), 'dutyAttendance', WEEK)))
  await check('AT-2c', 'deny', '미인증의 단건 조회', () =>
    getDoc(doc(anon(), 'dutyAttendance', WEEK)))

  /* ======================================================================
     create — 🔴 **차장 이상.** `dutySchedules`(부장만)와 **일부러 다른 폭**이다.
     ==================================================================== */
  describe('🔴 dutyAttendance — create (차장 이상)')

  await seed()
  await check('AT-3', 'deny', '🔴 **`member`가 첫 출석을 찍는다** — 차장 미만은 못 쓴다', () =>
    setDoc(att(UIDS.member), payload(UIDS.member)))
  await seed()
  await check('AT-4', 'pass', '🔴 **`vice`가 첫 출석을 찍는다** — 이 회차가 연 경로다', () =>
    setDoc(att(UIDS.vice), payload(UIDS.vice)))
  await seed()
  await check('AT-5', 'pass', '`head`가 첫 출석을 찍는다', () =>
    setDoc(att(UIDS.head), payload(UIDS.head)))
  await seed()
  await check('AT-6', 'pass', '`dev`가 첫 출석을 찍는다', () =>
    setDoc(att(UIDS.dev), payload(UIDS.dev)))
  await seed()
  await check('AT-7', 'deny', '🔴 `teacher`가 첫 출석을 찍는다 — §4.2 단서 3(열람 전용)', () =>
    setDoc(att(UIDS.teacher), payload(UIDS.teacher)))
  await seed()
  await check('AT-8', 'deny', '🔴 `weekId`가 문서 ID와 다르다 (D-13과 같은 형태의 방어)', () =>
    setDoc(att(UIDS.vice), payload(UIDS.vice, { weekId: '2026-W36' })))
  await seed()
  await check('AT-9', 'deny', '🔴 `updatedBy`를 남의 uid로 위조해 create', () =>
    setDoc(att(UIDS.vice), payload(UIDS.head)))
  await seed()
  await check('AT-9b', 'deny', '`pending`이 create', () =>
    setDoc(att(UIDS.pending), payload(UIDS.pending)))

  /* ======================================================================
     update — 이미 있는 문서에 칸을 더하거나 고친다(사용자 요구 — 출석 수정).
     ==================================================================== */
  describe('🔴 dutyAttendance — update (칸 추가 · 수정)')

  await seed({ [`dutyAttendance/${WEEK}`]: existing })
  await check('AT-10', 'pass', '🔴 **`vice`가 다른 칸을 더한다**(merge와 같은 형태)', () =>
    updateDoc(att(UIDS.vice), {
      [`marks.tue_dinner_${UIDS.head}`]: { status: 'absent', by: UIDS.vice, byName: '차장1' },
      updatedBy: UIDS.vice,
      updatedAt: serverTimestamp(),
    }))
  await seed({ [`dutyAttendance/${WEEK}`]: existing })
  await check('AT-10b', 'pass', '🔴 **이미 찍힌 칸을 고친다** — 사용자 요구(수정 허용)', () =>
    updateDoc(att(UIDS.vice), {
      [`marks.mon_lunch_${UIDS.member}`]: { status: 'present', by: UIDS.vice, byName: '차장1' },
      updatedBy: UIDS.vice,
      updatedAt: serverTimestamp(),
    }))
  await seed({ [`dutyAttendance/${WEEK}`]: existing })
  await check('AT-10c', 'pass', '`head`의 update', () =>
    updateDoc(att(UIDS.head), { marks: {}, updatedBy: UIDS.head, updatedAt: serverTimestamp() }))
  await seed({ [`dutyAttendance/${WEEK}`]: existing })
  await check('AT-11', 'deny', '`member`의 update', () =>
    updateDoc(att(UIDS.member), { marks: {}, updatedBy: UIDS.member, updatedAt: serverTimestamp() }))
  await seed({ [`dutyAttendance/${WEEK}`]: existing })
  await check('AT-12', 'deny', '`teacher`의 update', () =>
    updateDoc(att(UIDS.teacher), { marks: {}, updatedBy: UIDS.teacher, updatedAt: serverTimestamp() }))

  describe('🔴 dutyAttendance — 바꿀 수 있는 필드를 `hasOnly`가 못 박는다')

  /* 🔬 **값이 실제로 달라져야 한다**(규약 4-6 · B-20 · D-8이 같은 함정을 밟았다).
     시드의 `weekId`가 `2026-W35`이므로 다른 값으로 바꿔야 `affectedKeys()`에 잡힌다. */
  await seed({ [`dutyAttendance/${WEEK}`]: existing })
  await check('AT-13', 'deny', '🔴 `weekId`를 **다른 값으로** 함께 바꾼다 (주차 키 불변)', () =>
    updateDoc(att(UIDS.vice), {
      weekId: '2026-W36',
      marks: {},
      updatedBy: UIDS.vice,
      updatedAt: serverTimestamp(),
    }))
  await seed({ [`dutyAttendance/${WEEK}`]: existing })
  await check('AT-14', 'deny', '🔴 `updatedBy`를 남의 uid로 위조', () =>
    updateDoc(att(UIDS.vice), { marks: {}, updatedBy: UIDS.head, updatedAt: serverTimestamp() }))
  await seed({ [`dutyAttendance/${WEEK}`]: existing })
  await check('AT-15', 'deny', '🔴 허용 목록 밖의 키를 끼워 넣는다', () =>
    updateDoc(att(UIDS.vice), {
      marks: {},
      createdBy: UIDS.vice,
      updatedBy: UIDS.vice,
      updatedAt: serverTimestamp(),
    }))

  describe('🔴 dutyAttendance — delete는 전면 금지')

  /* 🔴 되돌릴 일이 있으면 **다시 찍는 것**이 옳고, 문서를 통째로 지우는 UI가 없다.
     `dutySchedules`가 `isHead()` delete를 여는 것은 편성 취소 경로가 있기 때문이다. */
  await seed({ [`dutyAttendance/${WEEK}`]: existing })
  await check('AT-16', 'deny', '🔴 `head`의 삭제 — 아무도 못 지운다', () =>
    deleteDoc(att(UIDS.head)))
  await check('AT-16b', 'deny', '`dev`의 삭제', () => deleteDoc(att(UIDS.dev)))
  await check('AT-16c', 'deny', '`vice`의 삭제', () => deleteDoc(att(UIDS.vice)))
}

