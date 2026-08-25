import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore'
import { db } from './firebase'
import { toDateKey, toWeekKey } from './dateKeys'
import { countOrProbe } from './roster'

/**
 * PRD §12.1 카운터 정의 · §12.3 집계 성능 · §8.3.2.
 *
 * **화면은 Firestore를 직접 부르지 않는다.** 이 파일이 S3의 유일한 통로다
 * (`lib/signup.ts`가 S2에 대해 갖는 것과 같은 계약 — W-08 §3.1).
 *
 * 🔴 **조회 실패를 「0건」으로 읽지 마라.** `{ ok | failed }` 판별 유니온으로 돌려주고
 * `throw`하지 않는다. 실패를 0으로 뭉개면 오프라인에서 **「오늘 0건」이라는 거짓말**이
 * 뜬다 — §8.3.5는 실패를 `-` + ER-08로, 빈 상태를 `0 건`으로 **따로** 규정한다.
 *
 * 🟡 **`getDoc`·집계 질의의 캐시 폴백 위험이 여기에도 있다**(W-05 §9 · W-17 항목).
 * 서버 조회가 실패하면 SDK가 로컬 캐시로 떨어질 수 있어 「실패」가 「성공(옛 값)」으로
 * 보일 수 있다. **이번 회차에서 고치지 않는다** — 그 폴백이 곧 §8.3.5의 오프라인 캐시값이다.
 */

/** §9.3.1 — 단일 부서 고정값. `lib/signup.ts`와 같은 값이다. */
export const DEPARTMENT_ID = 'dshs-jayul'

export type StatsResult =
  | { kind: 'ok'; today: number; week: number }
  | { kind: 'failed'; code: string }

export type DeptResult =
  | { kind: 'ok'; academicYear: number; classCountByGrade: Readonly<Record<string, number>> }
  | { kind: 'failed'; code: string }

export type RosterResult =
  | { kind: 'ok'; byGrade: Readonly<Record<number, number>> }
  | { kind: 'failed'; code: string }

/** §8.3.2 — 학년은 1~3 고정이다(§8.3.3 「학년 버튼의 유효 범위는 1~3으로 고정」). */
export const GRADES = [1, 2, 3] as const

/**
 * §12.3 「화면 진입 시 1회 조회 후 세션 내 재사용」.
 *
 * **모듈 수준에 둔다.** S3는 탭을 옮길 때마다 `ScreenTransition`의 `key`가 바뀌어
 * 통째로 다시 마운트되므로(T-02), 컴포넌트 상태에 캐시를 두면 재진입마다 재조회가 돈다.
 * §8.3.4 T-02는 **재조회하지 않고 애니메이션만** 다시 돌라고 규정한다.
 *
 * `force`는 T-05(당겨서 새로고침)와 N-06(30분 백그라운드 복귀)만 쓴다.
 */
let statsCache: StatsResult | null = null
let deptCache: DeptResult | null = null
let rosterCache: RosterResult | null = null

/** 테스트·재조회에서 세션 캐시를 비운다. */
export function clearHomeCache(): void {
  statsCache = null
  deptCache = null
  rosterCache = null
}

function errorCode(error: unknown, fallback: string): string {
  return (error as { code?: string })?.code ?? fallback
}

/**
 * 🔴 **W-21C 결함 3 — 수치를 그리는 자리의 집계.** 근거는 `lib/roster.ts`의
 * `countOrProbe` 위 블록에 있다(같은 결함의 두 얼굴이다).
 *
 * 여기는 `countOrProbe`와 달리 **정확한 수가 필요하다**(§8.3.2 #3이 `{n} 건`을 그린다).
 * 그래서 폴백이 `limit(1)`이 아니라 **전량 `getDocs`**다.
 *
 * 💰 **온라인 비용은 그대로 1읽기다** — `getCountFromServer`가 먼저 서고, `getDocs`는
 * 그것이 실패했을 때만 돈다(사실상 오프라인). 오프라인의 `getDocs`는 **캐시에서** 읽으므로
 * 서버 읽기가 아니다. ⇒ 이 변경의 과금 증가는 **0**이다.
 *
 * 🔴 `fromCache && 비어 있음`은 「모른다」다. `0`으로 그리면 §8.3.5가 금지한 거짓말이 된다.
 */
async function countWithCacheFallback(q: ReturnType<typeof query>): Promise<number | null> {
  try {
    return (await getCountFromServer(q)).data().count
  } catch {
    const snapshot = await getDocs(q)
    if (snapshot.empty && snapshot.metadata.fromCache) return null
    return snapshot.size
  }
}

/**
 * §12.1 오늘 기록 · 이번 주 — `getCountFromServer` **2회**.
 *
 * `academicYear` 필터를 **붙이지 않는다.** `dateKey`·`weekKey`가 특정 일자·주차를
 * 가리키므로 학년도가 이미 결정되고, IX-03·IX-04에도 `academicYear`가 없다.
 * 조건을 하나 더 붙이면 설계된 인덱스와 어긋난다(지시서 §2.4).
 */
export async function fetchHomeStats(now: Date, force = false): Promise<StatsResult> {
  if (!force && statsCache) return statsCache

  const records = collection(db, 'records')
  try {
    const [today, week] = await Promise.all([
      countWithCacheFallback(
        query(records, where('status', '==', 'active'), where('dateKey', '==', toDateKey(now))),
      ),
      countWithCacheFallback(
        query(records, where('status', '==', 'active'), where('weekKey', '==', toWeekKey(now))),
      ),
    ])
    /* 🔴 **하나라도 모르면 둘 다 `-`다.** 「오늘은 3건인데 이번 주는 모른다」를 그릴 자리가
       §8.3.2에 없고, 반쪽만 채우면 사용자가 나머지를 0으로 읽는다. */
    if (today === null || week === null) {
      return { kind: 'failed', code: 'firestore/stats-offline' }
    }
    statsCache = { kind: 'ok', today, week }
  } catch (error: unknown) {
    /* 실패는 캐시하지 않는다. 다음 진입에서 다시 시도해야 한다. */
    return { kind: 'failed', code: errorCode(error, 'firestore/stats-failed') }
  }
  return statsCache
}

/**
 * §5.2 — `departments/dshs-jayul`을 `getDoc` **1회**로 읽는다.
 *
 * 쓰는 값은 `classCountByGrade`(학년 버튼 부제)와 `academicYear`(학생 카운트 조건) 둘이다.
 * **`maxNumberPerClass`는 읽지 않는다 — S5가 쓴다.**
 */
export async function fetchDepartment(force = false): Promise<DeptResult> {
  if (!force && deptCache) return deptCache

  try {
    const snapshot = await getDoc(doc(db, 'departments', DEPARTMENT_ID))
    if (!snapshot.exists()) {
      return { kind: 'failed', code: 'firestore/department-missing' }
    }
    const data = snapshot.data() as {
      academicYear?: number
      classCountByGrade?: Record<string, number>
    }
    deptCache = {
      kind: 'ok',
      academicYear: data.academicYear ?? 0,
      /* 🔴 Firestore 맵의 키는 **문자열**이다. 숫자 키로 읽지 마라(W-09 §7-3). */
      classCountByGrade: data.classCountByGrade ?? {},
    }
  } catch (error: unknown) {
    return { kind: 'failed', code: errorCode(error, 'firestore/department-failed') }
  }
  return deptCache
}

/**
 * §8.3.2 #5 — 학년별 학생 명부 유무. 카운트가 0이면 그 학년 버튼이 비활성이다.
 *
 * `students` where `academicYear == {부서값}` and `isActive == true` and `grade == n` × 3.
 * `Promise.all`로 병렬 실행한다.
 *
 * **`students` 컬렉션이 아직 없으면 3개 전부 0이 나오고 그것이 정확한 동작이다**(지시서 §5.3).
 * 비었다고 버튼을 억지로 활성으로 두지 마라 — 탭하면 존재하지 않는 반 목록으로 들어간다.
 */
export async function fetchGradeRosterCounts(
  academicYear: number,
  force = false,
): Promise<RosterResult> {
  if (!force && rosterCache) return rosterCache

  const students = collection(db, 'students')
  try {
    /* 🔴 **`countOrProbe`다** — 이 값의 소비자는 `isEmptyGrade`의 `> 0` 하나뿐이라
       정확한 수가 필요 없다. 오프라인 폴백이 `limit(1)`이라 학년당 **1건**이다. */
    const counts = await Promise.all(
      GRADES.map((grade) =>
        countOrProbe(
          query(
            students,
            where('academicYear', '==', academicYear),
            where('isActive', '==', true),
            where('grade', '==', grade),
          ),
        ),
      ),
    )
    if (counts.some((c) => c === null)) {
      return { kind: 'failed', code: 'firestore/roster-offline' }
    }
    const byGrade: Record<number, number> = {}
    GRADES.forEach((grade, i) => {
      byGrade[grade] = counts[i] as number
    })
    rosterCache = { kind: 'ok', byGrade }
  } catch (error: unknown) {
    return { kind: 'failed', code: errorCode(error, 'firestore/roster-failed') }
  }
  return rosterCache
}
