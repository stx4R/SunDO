import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
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
 * 🔴 **조회는 `users`를 읽지 않는다.** 담당자 이름은 `assigneeNames…` **스냅샷**이고, §9.3.6이
 * 그 필드를 따로 둔 이유가 이것이다. BR-59는 「이미 편성된 과거 주차의 담당자 이름은 그대로
 * 남긴다」로 규정하므로 **S7의 탈퇴 취소선(BR-58)을 여기에 적용하면 안 된다.** 둘은 다르게
 * 동작하는 것이 정상이다.
 * ⚠ **편집은 다르다** — 담당자를 **고르려면** 현재 계정 목록이 필요하다(`fetchDutyMembers`).
 * 고른 결과는 다시 이름 스냅샷으로 굳어 위 계약이 그대로 유지된다.
 *
 * ── 🔴 W-21C — 중식/석식 (결정 1·3) ──────────────────────────────────────
 *
 * §9.3.6의 `assignments`·`assigneeNames`·`patrolTime`·`patrolPlace` **넷 다 타입이 바뀐다.**
 * 같은 이름으로 타입을 바꾸면 옛 앱이 `[object Object]`를 그리거나 요일 행을 조용히 비우므로
 * (🔬 실측), **새 이름 4개를 병기**한다(사용자 확정 · `scripts/migrate-duty-meals.mjs`).
 *
 *   assignments   { mon: [uid] }  ← 유지 · 옛 앱이 읽는다 · 🔴 **앱은 쓰지 않는다**
 *   assignmentsByMeal { mon: { lunch: [uid], dinner: [uid] } }  ← 새 앱이 읽고 쓴다
 *
 * 🔴 **읽기는 옛 형태로 폴백한다.** 마이그레이션이 아직 안 돌았거나(배포 순서) 새 필드가
 * 없는 문서를 만나면 **옛 편성을 중식으로 승격**해 읽는다 — 그래서 배포 순서 어느 조합에서도
 * 화면이 비지 않는다. 폴백은 `promote()` 한 곳뿐이다.
 */

/** §8.9.3 · `[결정 필요 D-10]` — 월~금 5일 고정. 표시 순서도 이 배열이 정한다. */
export const WEEKDAYS: readonly { key: DayKey; label: string }[] = [
  { key: 'mon', label: '월' },
  { key: 'tue', label: '화' },
  { key: 'wed', label: '수' },
  { key: 'thu', label: '목' },
  { key: 'fri', label: '금' },
]

/**
 * 🔴 **W-21C 결정 1 — 하루 2회.** 표시 순서도 이 배열이 정한다(중식 먼저).
 *
 * ⚠ **§8.9·§9.3.6에도 design `19`에도 이 개념이 없다.** 결정 1·3이 신설했고 라벨
 * `중식`·`석식`은 사용자 원문이다 — 보고서 §9 ③의 규격 공백 목록에 올렸다.
 */
export const MEALS: readonly { key: MealKey; label: string }[] = [
  { key: 'lunch', label: '중식' },
  { key: 'dinner', label: '석식' },
]

export type MealKey = 'lunch' | 'dinner'

/** 한 요일의 두 끼. 값이 없는 끼니는 빈 배열이다(키가 없는 경우를 만들지 않는다). */
export type ByMeal<T> = Readonly<Record<MealKey, T>>

/** §8.9.3 — 요일마다 1명 이상 4명 이하. 🔴 **끼니마다**가 아니라 **요일·끼니마다**다. */
export const MAX_ASSIGNEES = 4

/** 토·일이면 오늘 카드 대신 T-04 블록이 온다(§8.9.4). */
export function isWeekend(day: DayKey): boolean {
  return day === 'sat' || day === 'sun'
}

/**
 * 화면이 실제로 그리는 값만 담는다.
 *
 * 🔴 **`assigneeUids`가 W-21C에서 추가됐다.** W-14의 주석은 「uid를 담지 않는다 —
 * 화면에 uid가 나가는 자리가 없다」였고 **그때는 사실이었다**(조회 전용이었다).
 * 편집 시트는 「누가 이미 선택돼 있나」를 uid로 판정하므로 이제 필요하다.
 * ⚠ **화면에 그리지는 않는다** — 그리는 것은 여전히 `assigneeNames`뿐이다.
 *
 * `createdBy`·`updatedBy`는 여전히 담지 않는다(쓰는 자리가 없다).
 * `startDate`·`endDate`는 담는다 — 새 주차를 **만들 때** 문서에 넣어야 한다.
 */
export interface DutySchedule {
  weekId: string
  startDate: string | null
  endDate: string | null
  /** 요일 → 끼니 → 담당자 표시 이름. 🔴 다섯 요일 키가 **항상** 있다. */
  assigneeNames: Readonly<Record<DayKey, ByMeal<readonly string[]>>>
  /** 같은 모양의 uid. 편집 시트 전용이다. */
  assigneeUids: Readonly<Record<DayKey, ByMeal<readonly string[]>>>
  /** 끼니별. 문서에 없으면 `null`이고 그때는 시간·장소 줄을 그리지 않는다. */
  patrolTime: ByMeal<string | null>
  patrolPlace: ByMeal<string | null>
  /** 🔴 마이그레이션 전 문서를 옛 형태에서 승격해 읽었는가. 보고용이다. */
  legacy: boolean
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
function toStrings(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : []
}

/** 다섯 요일 × 두 끼니가 **항상** 있는 형태. 없는 자리는 빈 배열이다. */
function emptyByDay(): Record<DayKey, ByMeal<readonly string[]>> {
  const out = {} as Record<DayKey, ByMeal<readonly string[]>>
  for (const day of WEEKDAYS) out[day.key] = { lunch: [], dinner: [] }
  return out
}

/**
 * 🔴 **폴백은 여기 한 곳뿐이다.**
 *
 * `…ByMeal`이 있으면 그것을 읽고, 없으면 **옛 맵을 중식으로 승격**한다.
 * 마이그레이션이 아직 안 돈 문서·새로 시딩된 옛 형태 문서가 여기로 온다.
 *
 * ⚠ 옛 형태를 「석식 없음」으로 읽는 것은 **추측이 아니다** — 옛 스키마에는 끼니 개념이
 * 아예 없었고 마이그레이션도 같은 규칙을 쓴다(`migrate-duty-meals.mjs`). 두 경로가
 * 같은 문장을 써야 마이그레이션 전후로 화면이 달라지지 않는다.
 */
function promote(byMeal: unknown, legacy: unknown): {
  map: Record<DayKey, ByMeal<readonly string[]>>
  usedLegacy: boolean
} {
  const out = emptyByDay()

  if (byMeal && typeof byMeal === 'object') {
    for (const day of WEEKDAYS) {
      const cell = (byMeal as Record<string, unknown>)[day.key]
      if (!cell || typeof cell !== 'object') continue
      const c = cell as Record<string, unknown>
      out[day.key] = { lunch: toStrings(c.lunch), dinner: toStrings(c.dinner) }
    }
    return { map: out, usedLegacy: false }
  }

  if (legacy && typeof legacy === 'object') {
    for (const day of WEEKDAYS) {
      out[day.key] = { lunch: toStrings((legacy as Record<string, unknown>)[day.key]), dinner: [] }
    }
    return { map: out, usedLegacy: true }
  }

  return { map: out, usedLegacy: false }
}

/** `{ lunch, dinner }` 문자열 맵. 옛 단일 문자열은 중식으로 승격한다. */
function promoteText(byMeal: unknown, legacy: unknown): ByMeal<string | null> {
  if (byMeal && typeof byMeal === 'object') {
    const c = byMeal as Record<string, unknown>
    return {
      lunch: typeof c.lunch === 'string' ? c.lunch : null,
      dinner: typeof c.dinner === 'string' ? c.dinner : null,
    }
  }
  return { lunch: typeof legacy === 'string' ? legacy : null, dinner: null }
}

interface StoredDuty {
  weekId?: string
  startDate?: string
  endDate?: string
  /* 옛 형태 — 🔴 앱은 **읽기 폴백에만** 쓴다. 쓰지 않는다. */
  assignments?: unknown
  assigneeNames?: unknown
  patrolTime?: unknown
  patrolPlace?: unknown
  /* W-21C 신설. */
  assignmentsByMeal?: unknown
  assigneeNamesByMeal?: unknown
  patrolTimeByMeal?: unknown
  patrolPlaceByMeal?: unknown
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
      const names = promote(data.assigneeNamesByMeal, data.assigneeNames)
      const uids = promote(data.assignmentsByMeal, data.assignments)
      result = {
        kind: 'ok',
        fromCache: snapshot.metadata.fromCache,
        schedule: {
          weekId: data.weekId ?? weekId,
          startDate: typeof data.startDate === 'string' ? data.startDate : null,
          endDate: typeof data.endDate === 'string' ? data.endDate : null,
          assigneeNames: names.map,
          assigneeUids: uids.map,
          patrolTime: promoteText(data.patrolTimeByMeal, data.patrolTime),
          patrolPlace: promoteText(data.patrolPlaceByMeal, data.patrolPlace),
          legacy: names.usedLegacy || uids.usedLegacy,
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

/* ============================================================================
   S9 순찰 일정 편성 (W-21C 기능 3) — §8.9.3 · §8.9.4 T-02·T-03 · design `19a`~`19e`
   ==========================================================================*/

/**
 * 담당자 후보 1명. design `19d`의 결과 행이 그리는 값 그대로다(이름 + 역할).
 *
 * 🔴 **`admin.ts`의 `Member`를 import하지 않는다.** 구조가 같아도 import하면 S8 전용
 * 모듈(승인 구독·양도 배치)이 S9 청크로 끌려 들어온다 — **타입이 겹치는 것과 모듈이
 * 겹치는 것은 다른 문제다**(W-21B §6.7).
 */
export interface DutyMember {
  uid: string
  name: string
  /** design `19d` 2줄째. `부원`·`차장`… 한국어 라벨은 화면이 만든다. */
  role: string
}

export type DutyMemberState =
  | { kind: 'ok'; members: readonly DutyMember[] }
  | { kind: 'failed'; code: string }

let membersCache: DutyMemberState | null = null

/** §4.4 R-01~R-04의 권한 순서. `admin.ts`와 **같은 순서**여야 사용자가 헷갈리지 않는다. */
const ROLE_RANK: Readonly<Record<string, number>> = {
  head: 0,
  vice: 1,
  member: 2,
  teacher: 3,
  dev: 4,
}

/**
 * §8.9.3 「`status='active'` 계정만」 — `users` where `departmentId` + `status`.
 *
 * 🔴 **`list`는 이미 열려 있다**(M-1 · `admin.ts`의 `fetchMembers`와 같은 질의라
 * **새 인덱스가 필요 없다**). 등식 2개뿐이고 정렬은 클라이언트가 한다.
 *
 * ⚠ **교사는 후보에서 뺀다.** §4.2 단서 3이 교사를 열람 전용으로 규정하므로 순찰
 * 담당자가 될 수 없다. 질의가 아니라 여기서 거른다 — 조건을 더하면 인덱스가 하나 는다.
 */
export async function fetchDutyMembers(force = false): Promise<DutyMemberState> {
  if (!force && membersCache) return membersCache

  try {
    const snapshot = await getDocs(
      query(
        collection(db, 'users'),
        where('departmentId', '==', DEPARTMENT_ID),
        where('status', '==', 'active'),
      ),
    )
    const members = snapshot.docs
      .map((snap) => {
        const data = snap.data() as { name?: string; role?: string }
        return { uid: snap.id, name: data.name ?? '', role: data.role ?? 'member' }
      })
      .filter((m) => m.role !== 'teacher')
    members.sort(
      (a, b) =>
        (ROLE_RANK[a.role] ?? 99) - (ROLE_RANK[b.role] ?? 99) ||
        a.name.localeCompare(b.name, 'ko'),
    )
    membersCache = { kind: 'ok', members }
  } catch (error: unknown) {
    /* 실패는 캐시하지 않는다 — `다시 시도`가 바로 재조회해야 한다. */
    return { kind: 'failed', code: errorCode(error, 'firestore/duty-members-failed') }
  }
  return membersCache
}

/** 편집 시트가 들고 있다가 그대로 넘기는 값. 화면이 만드는 유일한 쓰기 입력이다. */
export interface DutyDraft {
  weekId: string
  startDate: string
  endDate: string
  /** 요일 → 끼니 → 담당자 uid. 이름은 저장 시점에 `members`로 스냅샷한다. */
  byDay: Record<DayKey, ByMeal<readonly string[]>>
  patrolTime: ByMeal<string | null>
  patrolPlace: ByMeal<string | null>
}

export interface DutyActor {
  uid: string
  name: string
  role: string
}

export type DutyWriteResult = { ok: true } | { ok: false; code: string }

/** `{ mon: { lunch:[…], dinner:[…] } }`를 Firestore가 받는 평범한 객체로 편다. */
function toStored(map: Record<DayKey, ByMeal<readonly string[]>>) {
  const out: Record<string, { lunch: string[]; dinner: string[] }> = {}
  for (const day of WEEKDAYS) {
    out[day.key] = { lunch: [...map[day.key].lunch], dinner: [...map[day.key].dinner] }
  }
  return out
}

/** 편성된 요일 수. 감사 로그 `before`/`after`가 담는 유일한 값이다. */
export function countDays(map: Record<DayKey, ByMeal<readonly string[]>>, meal: MealKey): number {
  return WEEKDAYS.filter((d) => map[d.key][meal].length > 0).length
}

/**
 * §8.9.4 T-03 편성 저장 — **배치 2연산**(`dutySchedules` + `auditLogs`).
 *
 * 🔴 **`DUTY_UPDATE` 감사 로그를 남긴다.** §9.3.8 유니온에 있으면서 호출부가 0건이던
 * 값이고(W-20 §2.1②), 편성은 **부장 전용 특권 연산**이라 §14.2가 감사를 요구한다.
 * W-21B가 `RECORD_UPDATE`·`RECORD_DELETE`에 소비자를 만든 것과 같은 형태다.
 *
 * 🔴 **`before`/`after`에 담당자 이름·uid를 담지 않는다.** 편성 상세는 문서 자체에
 * 남고 그 문서는 지워지지 않는다 — 감사 로그가 그것을 복제할 이유가 없다. 남기는 것은
 * 「무엇이 몇 칸 달라졌나」(끼니별 편성 요일 수)뿐이고, 누가 바꿨는지는 `actorUid`에 있다.
 *
 * 🔴 **`updatedAt`을 배치 밖에서 만들지 마라** — `serverTimestamp()`다.
 * 🔴 **옛 필드 4개를 쓰지 않는다.** 규칙의 `hasOnly`가 그것을 막고(D-10), 새 앱이
 * 건드리면 마이그레이션을 되돌릴 근거가 사라진다.
 *
 * ⚠ **`await`한다.** S6의 「기다리면 스피너가 영원히 돈다」는 **오프라인 저장을 허용하기
 * 때문에** 성립하는 계약이다(W-12 §2.3). 편성은 §8.9.5가 오프라인에서 비활성으로
 * 규정하므로 그 함정에 걸리지 않는다 — `admin.ts`·W-21B의 배치와 같은 형태다.
 */
export async function saveDutySchedule(
  actor: DutyActor,
  draft: DutyDraft,
  /** 문서가 이미 있는가. `create`와 `update`는 규칙에서 **다른 문**이다. */
  exists: boolean,
  before: { lunchDays: number; dinnerDays: number },
): Promise<DutyWriteResult> {
  const membersState = membersCache
  const nameOf = new Map(
    membersState?.kind === 'ok' ? membersState.members.map((m) => [m.uid, m.name]) : [],
  )

  /** BR-59 — 이름은 **저장 시점 스냅샷**이다. 나중에 이름이 바뀌어도 과거 주차는 그대로다. */
  const names = {} as Record<DayKey, ByMeal<readonly string[]>>
  for (const day of WEEKDAYS) {
    names[day.key] = {
      lunch: draft.byDay[day.key].lunch.map((uid) => nameOf.get(uid) ?? ''),
      dinner: draft.byDay[day.key].dinner.map((uid) => nameOf.get(uid) ?? ''),
    }
  }

  const batch = writeBatch(db)
  const now = serverTimestamp()
  const ref = doc(db, 'dutySchedules', draft.weekId)

  /* 🔴 **규칙의 허용 키와 정확히 같다**(`editsDutyOnly`). 하나라도 더 쓰면 배치가 통째로 죽는다. */
  const payload = {
    assignmentsByMeal: toStored(draft.byDay),
    assigneeNamesByMeal: toStored(names),
    patrolTimeByMeal: { lunch: draft.patrolTime.lunch, dinner: draft.patrolTime.dinner },
    patrolPlaceByMeal: { lunch: draft.patrolPlace.lunch, dinner: draft.patrolPlace.dinner },
    updatedBy: actor.uid,
    updatedAt: now,
  }

  if (exists) {
    batch.update(ref, payload)
  } else {
    /* §8.9.5 EM-06 `지금 등록하기` — 문서가 없는 주차. 규칙의 create 문이 `weekId`와
       `createdBy`를 함께 검사한다(D-13·D-14). */
    batch.set(ref, {
      weekId: draft.weekId,
      startDate: draft.startDate,
      endDate: draft.endDate,
      createdBy: actor.uid,
      ...payload,
    })
  }

  batch.set(doc(db, 'auditLogs', crypto.randomUUID()), {
    actorUid: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    action: 'DUTY_UPDATE',
    targetType: 'dutySchedules',
    targetId: draft.weekId,
    before,
    after: {
      lunchDays: countDays(draft.byDay, 'lunch'),
      dinnerDays: countDays(draft.byDay, 'dinner'),
    },
    createdAt: now,
  })

  try {
    await batch.commit()
  } catch (error: unknown) {
    return { ok: false, code: errorCode(error, 'firestore/duty-save-failed') }
  }
  /* 저장한 주차의 캐시만 버린다. 🔴 다른 화면 캐시를 건드리지 않는다. */
  scheduleCache.delete(draft.weekId)
  return { ok: true }
}
