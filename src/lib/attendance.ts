import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import type { DayKey } from './dateKeys'
import type { MealKey } from './duty'

/**
 * W-25 기능 4 — **순찰 담당자 출석 체크.** `dutyAttendance/{weekId}`.
 *
 * 🔴 **PRD에 없는 컬렉션이다.** §9.3에 대응 항목이 없고 design 산출물에도 시안이
 * 없다 — 사용자 요구로 이 회차가 신설했다(보고서 §2 결정 4 · §9 규격 공백).
 *
 * ── 왜 `dutySchedules`에 얹지 않았나 ────────────────────────────────────
 * 🔴 **쓰기 권한이 다르기 때문이다.** 편성은 `isHead()`(W-21C 결정 2)이고 출석은
 * **차장 이상**이다. 같은 문서에 두면 `dutySchedules` update 문을 차장에게 열어야
 * 하고, 그 순간 「차장이 편성은 못 하지만 출석은 쓴다」를 `affectedKeys()` 조합으로
 * 표현해야 한다 — 조건이 하나 틀리면 차장이 편성을 통째로 덮어쓸 수 있다.
 * **문서를 가르면 규칙 한 줄로 끝난다.**
 *
 * ── 왜 평평한 맵인가 ────────────────────────────────────────────────────
 * 🔴 `marks`의 키는 **`{요일}_{끼니}_{uid}`** 한 문자열이다. 중첩 맵
 * (`{ mon: { lunch: { uid: … } } }`)으로 두면 규칙이 값을 검사하려고 3중 맵을
 * 순회해야 하는데 **Rules에는 맵 값을 순회하는 수단이 없다.** 평평하게 두면
 * 한 사람의 한 칸을 고칠 때 `affectedKeys()`에 **그 한 칸만** 잡혀 「무엇이
 * 달라졌나」가 규칙에도 사람에게도 그대로 보인다.
 *
 * 🔴 **끼니까지 키에 넣는다.** 같은 사람이 같은 날 아침 선도와 중식에 **둘 다**
 * 편성될 수 있고(§8.9.3이 막지 않는다), 그때 두 칸의 출석은 서로 다른 사실이다.
 *
 * ⚠ **감사 로그(`auditLogs`)를 남기지 않는다.** §9.3.8의 `action` 유니온에 출석용
 * 값이 없고, 값을 새로 만들면 규칙·PRD·기존 소비자가 함께 움직여야 한다. 대신
 * **표시마다 `by`·`byName`·`at`을 칸 안에 박아** 누가 언제 찍었는지가 문서 자체에
 * 남는다 — 별도 로그보다 조회가 쉽고 지워질 일이 없다(보고서 §9 ②).
 */

/** 🔴 세 값이 전부다. 색은 화면이 정한다(§7.1 토큰 3종). */
export const ATTENDANCE_STATUSES = ['present', 'late', 'absent'] as const

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]

/** 사용자 원문. 새로 짓지 마라. */
export const ATTENDANCE_LABEL: Readonly<Record<AttendanceStatus, string>> = {
  present: '정상',
  late: '지각',
  absent: '불참',
}

/** 한 칸의 기록. `by`/`at`이 감사 로그를 대신한다(위 주석). */
export interface AttendanceMark {
  status: AttendanceStatus
  by: string
  byName: string
}

/** 🔴 `{요일}_{끼니}_{uid}`. 이 함수 밖에서 키를 조립하지 마라. */
export function markKey(day: DayKey, meal: MealKey, uid: string): string {
  return `${day}_${meal}_${uid}`
}

export type AttendanceMap = Readonly<Record<string, AttendanceMark>>

/**
 * 🔴 **`empty`와 `failed`를 가른다** — `duty.ts`의 `DutyResult`와 같은 규율이다.
 * 「아직 아무도 안 찍었다」와 「못 읽었다」는 다른 사실이고, 뭉개면 오프라인에서
 * 모든 이름이 검게 보여 **찍힌 출석이 사라진 것처럼** 된다.
 */
export type AttendanceResult =
  | { kind: 'ok'; marks: AttendanceMap }
  | { kind: 'empty' }
  | { kind: 'failed'; code: string }

/** 🔴 캐시 키는 `weekId`다 — `scheduleCache`와 같은 수명이라 같은 규칙으로 판다. */
const cache = new Map<string, AttendanceResult>()

/** T-07 당겨서 새로고침 전용. `clearDutyCache()`와 **함께** 불린다. */
export function clearAttendanceCache(): void {
  cache.clear()
}

function errorCode(error: unknown, fallback: string): string {
  return (error as { code?: string })?.code ?? fallback
}

/** 시딩 실수·옛 형태가 섞여도 한 칸만 죽고 표가 살아야 한다. */
function toMark(raw: unknown): AttendanceMark | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  const status = m.status
  if (typeof status !== 'string') return null
  if (!(ATTENDANCE_STATUSES as readonly string[]).includes(status)) return null
  return {
    status: status as AttendanceStatus,
    by: typeof m.by === 'string' ? m.by : '',
    byName: typeof m.byName === 'string' ? m.byName : '',
  }
}

/**
 * 문서 ID 직접 조회 1건 — **인덱스가 필요 없다.**
 *
 * 🔴 **`onSnapshot`을 켜지 않는다.** `duty.ts`와 같은 판단이다 — 문서 1건이고
 * 이 문서를 바꾸는 주체는 같은 화면의 출석 시트뿐이다. 저장 직후에는 호출부가
 * 캐시를 버리고 다시 읽는다.
 */
export async function fetchAttendance(weekId: string, force = false): Promise<AttendanceResult> {
  if (!force) {
    const hit = cache.get(weekId)
    if (hit) return hit
  }

  let result: AttendanceResult
  try {
    const snapshot = await getDoc(doc(db, 'dutyAttendance', weekId))
    if (!snapshot.exists()) {
      result = { kind: 'empty' }
    } else {
      const raw = (snapshot.data() as { marks?: unknown }).marks
      const marks: Record<string, AttendanceMark> = {}
      if (raw && typeof raw === 'object') {
        for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
          const mark = toMark(value)
          if (mark) marks[key] = mark
        }
      }
      result = { kind: 'ok', marks }
    }
  } catch (error: unknown) {
    /* 🔴 실패는 캐시하지 않는다. 다음 진입에서 다시 시도해야 한다. */
    return { kind: 'failed', code: errorCode(error, 'firestore/attendance-failed') }
  }
  cache.set(weekId, result)
  return result
}

export interface AttendanceActor {
  uid: string
  name: string
}

export type AttendanceWriteResult = { ok: true } | { ok: false; code: string }

/**
 * 한 칸을 찍는다 — **`setDoc(..., { merge: true })` 1연산.**
 *
 * 🔴 **`merge`가 맵을 깊게 합친다.** `marks` 아래 **이 키 하나만** 새로 쓰이고
 * 나머지 칸은 손대지 않는다 — 두 차장이 같은 주를 동시에 찍어도 서로를 지우지 않는다.
 * `updateDoc`을 쓰면 문서가 없는 주차에서 실패하므로 이쪽이 맞다.
 *
 * 🔴 **`weekId`를 매번 함께 쓴다.** 규칙의 create 문이 `weekId == 문서 ID`를 검사하고
 * (`dutySchedules`의 D-13과 같은 형태의 방어), update에서는 **값이 그대로라
 * `affectedKeys()`에 잡히지 않아** `hasOnly`를 건드리지 않는다(규약 4-6).
 *
 * ⚠ **`await`한다.** 이미 기록된 출석을 고치는 경로가 있어(사용자 요구) 「저장됐다」는
 * 통지가 실제 커밋 뒤에 나와야 한다. S6의 「기다리지 않는다」는 오프라인 저장을
 * 허용하기 때문에 성립하는 계약이고(W-12 §2.3), 출석은 그 범위가 아니다.
 */
export async function markAttendance(
  actor: AttendanceActor,
  weekId: string,
  day: DayKey,
  meal: MealKey,
  uid: string,
  status: AttendanceStatus,
): Promise<AttendanceWriteResult> {
  try {
    await setDoc(
      doc(db, 'dutyAttendance', weekId),
      {
        weekId,
        marks: {
          [markKey(day, meal, uid)]: {
            status,
            by: actor.uid,
            byName: actor.name,
            at: serverTimestamp(),
          },
        },
        updatedBy: actor.uid,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  } catch (error: unknown) {
    return { ok: false, code: errorCode(error, 'firestore/attendance-save-failed') }
  }
  /* 저장한 주차의 캐시만 버린다. 🔴 다른 화면 캐시를 건드리지 않는다. */
  cache.delete(weekId)
  return { ok: true }
}
