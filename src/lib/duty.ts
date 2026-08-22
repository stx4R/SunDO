import { doc, getDoc } from 'firebase/firestore'
import { db } from './firebase'
import type { DayKey } from './dateKeys'
import { DEPARTMENT_ID } from './stats'

/**
 * PRD §8.9 S9 선도 일정 · §9.3.6 `dutySchedules/{weekId}` · §11.2 OP-12(읽기 쪽만).
 *
 * **화면은 Firestore를 직접 부르지 않는다.** `stats.ts`가 S3에, `roster.ts`가 S4·S5에,
 * `records.ts`가 S6·S7에 대해 갖는 것과 같은 계약이다.
 *
 * 🔴 **`onSnapshot`을 켜지 않는다.** S9가 읽는 문서는 1~2건이고, 편집이 v1.1이라
 * **MVP에서 이 문서를 바꾸는 주체가 앱 안에 없다**(§17.1이 `dutySchedules`를 「수동 시딩」으로
 * 규정한다). W-13 §8-1의 구독 계약은 목록형 화면을 위한 것이지 모든 조회의 기본값이 아니다.
 *
 * 🔴 **`users`를 읽지 않는다.** 담당자 이름은 `assigneeNames` **스냅샷**이고, §9.3.6이 그 필드를
 * 따로 둔 이유가 이것이다. BR-59는 「이미 편성된 과거 주차의 담당자 이름은 그대로 남긴다」로
 * 규정하므로 **S7의 탈퇴 취소선(BR-58)을 여기에 적용하면 안 된다.** 둘은 다르게 동작하는 것이 정상이다.
 */

/** §8.9.3 · `[결정 필요 D-10]` — 월~금 5일 고정. 표시 순서도 이 배열이 정한다. */
export const WEEKDAYS: readonly { key: DayKey; label: string }[] = [
  { key: 'mon', label: '월' },
  { key: 'tue', label: '화' },
  { key: 'wed', label: '수' },
  { key: 'thu', label: '목' },
  { key: 'fri', label: '금' },
]

/** 토·일이면 오늘 카드 대신 T-04 블록이 온다(§8.9.4). */
export function isWeekend(day: DayKey): boolean {
  return day === 'sat' || day === 'sun'
}

/**
 * 화면이 실제로 그리는 값만 담는다.
 *
 * 🔴 **`assignments`(uid 배열)를 담지 않는다.** 화면에 uid가 나가는 자리가 없고,
 * 결정 3의 클라이언트 규율(「화면·`lib`는 실제로 쓰는 필드만 반환값에 담는다」)이 요구하는 형태다.
 * `createdBy`·`updatedBy`·`updatedAt`도 같은 이유로 빠졌다.
 */
export interface DutySchedule {
  weekId: string
  /** 요일 키 → 담당자 표시 이름. 없는 요일은 키가 아예 없을 수 있다. */
  assigneeNames: Readonly<Partial<Record<DayKey, readonly string[]>>>
  /** 문서에 없으면 `null`. 호출부가 부서 기본값으로 떨어뜨린다(§9.3.6 「부서 기본값」). */
  patrolTime: string | null
  patrolPlace: string | null
}

/**
 * 🔴 **`empty`와 `failed`를 가른다.** ER-05(불러오지 못함)와 EM-06(등록되지 않음)은 다른 사실이다.
 * 빈 객체·`null`로 실패를 표현하면 오프라인에서 **「아직 등록되지 않았습니다」라는 거짓말**이 뜬다.
 *
 * `fromCache`는 보고용이다 — **판정에 쓰지 않는다.** 실측(W-14 §1-3 P1)상 캐시에 없는 문서를
 * 오프라인에서 `getDoc`하면 `exists() === false`가 아니라 **`unavailable`로 throw**하므로,
 * `empty`에 도달했다는 것 자체가 이미 「서버가 확인한 부재」다.
 */
export type DutyResult =
  | { kind: 'ok'; schedule: DutySchedule; fromCache: boolean }
  | { kind: 'empty'; fromCache: boolean }
  | { kind: 'failed'; code: string }

export interface PatrolDefaults {
  patrolTime: string | null
  patrolPlace: string | null
}

/**
 * 🔴 **캐시 키는 `weekId`다.** 주 경계를 넘으면 키가 저절로 갈려 T-05가 별도 코드 없이 성립한다.
 *
 * `clearHomeCache`·`clearRosterCache`·`clearRecordsCache`와 **섞지 않는다** — 캐시 수명이 다르면
 * 파일도 다르다(W-11 §4-5 · W-13 §4-3). **실패는 캐시하지 않는다.**
 */
const scheduleCache = new Map<string, DutyResult>()
let defaultsCache: PatrolDefaults | null = null

/** T-07 당겨서 새로고침 전용. */
export function clearDutyCache(): void {
  scheduleCache.clear()
  defaultsCache = null
}

function errorCode(error: unknown, fallback: string): string {
  return (error as { code?: string })?.code ?? fallback
}

/** 맵 값이 배열이 아닐 수 있다(시딩 실수). 행이 죽지 않게 걸러 낸다. */
function toNameMap(raw: unknown): Partial<Record<DayKey, readonly string[]>> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Partial<Record<DayKey, readonly string[]>> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue
    out[key as DayKey] = value.filter((v): v is string => typeof v === 'string')
  }
  return out
}

interface StoredDuty {
  weekId?: string
  assigneeNames?: unknown
  patrolTime?: string
  patrolPlace?: string
}

/**
 * §8.9.4 T-01 — `getDoc(dutySchedules/{weekId})` **1건**. 문서 ID 직접 조회라 **인덱스가 필요 없다.**
 *
 * @param weekId `toWeekKey(now)`의 반환값 그대로. 🔴 주차를 여기서 다시 계산하지 않는다.
 */
export async function fetchDutySchedule(weekId: string, force = false): Promise<DutyResult> {
  if (!force) {
    const hit = scheduleCache.get(weekId)
    if (hit) return hit
  }

  let result: DutyResult
  try {
    const snapshot = await getDoc(doc(db, 'dutySchedules', weekId))
    if (!snapshot.exists()) {
      result = { kind: 'empty', fromCache: snapshot.metadata.fromCache }
    } else {
      const data = snapshot.data() as StoredDuty
      result = {
        kind: 'ok',
        fromCache: snapshot.metadata.fromCache,
        schedule: {
          weekId: data.weekId ?? weekId,
          assigneeNames: toNameMap(data.assigneeNames),
          patrolTime: data.patrolTime ?? null,
          patrolPlace: data.patrolPlace ?? null,
        },
      }
    }
  } catch (error: unknown) {
    /* 🔴 실패는 캐시하지 않는다. 다음 진입에서 다시 시도해야 한다. */
    return { kind: 'failed', code: errorCode(error, 'firestore/duty-failed') }
  }
  scheduleCache.set(weekId, result)
  return result
}

/**
 * §9.3.6 — `patrolTime`·`patrolPlace`가 문서에 없을 때의 **부서 기본값**.
 *
 * 🔴 **`stats.ts`를 넓히지 않았다.** `fetchDepartment()`는 `academicYear`·`classCountByGrade`만
 * 돌려주고 그 캐시는 `clearHomeCache()`에 묶여 있다 — 거기에 두 필드를 얹으면 S9의 당겨서
 * 새로고침이 홈 통계·명부 캐시까지 버리거나, 반대로 S3의 새로고침이 S9 값을 갈아 치운다
 * (W-11 §4-5 · W-13 §4-3과 같은 판단). 문서 ID 상수만 가져다 쓴다.
 *
 * 결정 3의 규율대로 **화면이 쓰는 두 필드만** 반환한다. 조회 실패는 `null`이고, 그때는
 * 시간·장소 줄을 그리지 않는다(추측한 값을 그리지 않는다).
 */
export async function fetchPatrolDefaults(force = false): Promise<PatrolDefaults | null> {
  if (!force && defaultsCache) return defaultsCache

  try {
    const snapshot = await getDoc(doc(db, 'departments', DEPARTMENT_ID))
    if (!snapshot.exists()) return null
    const data = snapshot.data() as { patrolTime?: string; patrolPlace?: string }
    defaultsCache = {
      patrolTime: data.patrolTime ?? null,
      patrolPlace: data.patrolPlace ?? null,
    }
  } catch {
    /* 기본값을 못 읽은 것은 일정 조회 실패가 아니다. 시간·장소 줄만 비운다. */
    return null
  }
  return defaultsCache
}
