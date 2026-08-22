import { collection, getCountFromServer, getDocs, orderBy, query, where } from 'firebase/firestore'
import { db } from './firebase'
import { toStudentNo } from './studentNo'

/**
 * PRD §8.4.2 · §8.5.2 · §9.3.4 — S4 반별 인원 수 · S5 학생 명부.
 *
 * **화면은 Firestore를 직접 부르지 않는다.** `lib/stats.ts`가 S3에 대해 갖는 것과
 * 같은 계약이고, 판별 유니온 `{ ok | failed }`를 그대로 따른다(W-10 §5-3).
 *
 * 🔴 **조회 실패를 「0명」이나 「빈 목록」으로 읽지 마라.** 실패는 ER-03/ER-04 +
 * `다시 시도`이고 0은 EM-01이다. 뭉개면 오프라인에서 「이 반에 학생이 없습니다」라는
 * **거짓말**이 뜬다. 이번 회차에서는 특히 중요하다 — IX-08이 아직 콘솔에 없어
 * `failed-precondition`이 **실제로** 뜬다(`database_ToDo/W-11.md` §2).
 *
 * `stats.ts`와 파일을 나눈 이유: `stats.ts`의 문서 주석이 스스로를 「S3의 유일한
 * 통로」로 규정하고 세션 캐시도 `clearHomeCache()` 하나로 묶여 있다. S4·S5의 캐시가
 * 홈 캐시와 함께 비워지면 T-05(홈 당겨서 새로고침)가 명부까지 버린다.
 */

/** §9.3.4 학생 문서에서 화면이 쓰는 부분만. `isActive`는 이미 걸러진 뒤다. */
export interface Student {
  /** 문서 ID `{academicYear}_{studentNo}`. W-12가 `records.studentDocId`로 쓴다. */
  id: string
  /** §8.5.3 표시 학번 5자리. */
  studentNo: string
  name: string
  number: number
}

export type ClassCountsResult =
  | { kind: 'ok'; byClass: Readonly<Record<number, number>> }
  | { kind: 'failed'; code: string }

export type StudentsResult =
  | { kind: 'ok'; students: readonly Student[] }
  | { kind: 'failed'; code: string }

/**
 * §12.3 「화면 진입 시 1회 조회 후 세션 내 재사용」. 모듈 수준에 둔다 —
 * `ScreenTransition`의 `key`가 경로라서 S4→S5→S4 왕복이 매번 새 마운트다(W-10 §4-9).
 *
 * **실패는 캐시하지 않는다.** 다음 진입에서 다시 시도해야 한다.
 */
const countsCache = new Map<string, ClassCountsResult>()
const studentsCache = new Map<string, StudentsResult>()

/** 테스트·재조회용. 홈 캐시(`clearHomeCache`)와 별개다. */
export function clearRosterCache(): void {
  countsCache.clear()
  studentsCache.clear()
}

function errorCode(error: unknown, fallback: string): string {
  return (error as { code?: string })?.code ?? fallback
}

/**
 * §8.4.2 #4 — 반별 **활성** 학생 수. 0인 반이 `opacity 0.5` + TS-15가 된다.
 *
 * `students` where `academicYear` and `isActive == true` and `grade` and `classNo`
 * 등식 카운트를 반 수만큼 `Promise.all`로 병렬 실행한다.
 *
 * **복합 인덱스가 필요 없다** — 실측으로 확인했다(`database_ToDo/W-11.md` §1, W11-3).
 * 설계상으로도 IX-09가 정확히 이 조합이다.
 */
export async function fetchClassCounts(
  academicYear: number,
  grade: number,
  classCount: number,
  force = false,
): Promise<ClassCountsResult> {
  const key = `${academicYear}:${grade}`
  const cached = countsCache.get(key)
  if (!force && cached) return cached

  const students = collection(db, 'students')
  try {
    const classNos = Array.from({ length: classCount }, (_, i) => i + 1)
    const counts = await Promise.all(
      classNos.map((classNo) =>
        getCountFromServer(
          query(
            students,
            where('academicYear', '==', academicYear),
            where('isActive', '==', true),
            where('grade', '==', grade),
            where('classNo', '==', classNo),
          ),
        ),
      ),
    )
    const byClass: Record<number, number> = {}
    classNos.forEach((classNo, i) => {
      byClass[classNo] = counts[i].data().count
    })
    const result: ClassCountsResult = { kind: 'ok', byClass }
    countsCache.set(key, result)
    return result
  } catch (error: unknown) {
    return { kind: 'failed', code: errorCode(error, 'firestore/class-counts-failed') }
  }
}

/**
 * §8.5.2 — 한 반의 학생 명부.
 *
 * 🔴 **서버 질의에 `isActive`를 넣지 않는다.** 등식 3개 + `orderBy('number')`가
 * 정확히 **IX-08**(`academicYear, grade, classNo, number`)이고, `isActive`를 더하면
 * PRD §9.5에 없는 인덱스가 하나 늘어난다(실측 W11-1 ≠ W11-2). 한 반은 최대 37명
 * (`maxNumberPerClass`, D-04)이라 비활성 몇 명을 더 읽는 비용이 무의미하게 작다.
 * **거르는 위치가 달라도 결과는 같다** — S4의 카운트와 S5의 행 수가 일치한다.
 *
 * 🔴 **정렬 키가 `number`인데 §8.5.3은 `studentNo` 오름차순을 요구한다 — 같은 순서다.**
 * `academicYear`·`grade`·`classNo`가 등식으로 고정된 집합에서 DR-01
 * (`studentNo = grade + pad2(classNo) + pad2(number)`)의 앞 3자리는 상수이므로
 * 두 순서가 항등이다. 설계된 인덱스를 쓰면서 §8.5.3을 충족한다.
 */
export async function fetchStudents(
  academicYear: number,
  grade: number,
  classNo: number,
  force = false,
): Promise<StudentsResult> {
  const key = `${academicYear}:${grade}:${classNo}`
  const cached = studentsCache.get(key)
  if (!force && cached) return cached

  try {
    const snapshot = await getDocs(
      query(
        collection(db, 'students'),
        where('academicYear', '==', academicYear),
        where('grade', '==', grade),
        where('classNo', '==', classNo),
        orderBy('number', 'asc'),
      ),
    )
    const students = snapshot.docs
      .map((docSnap) => {
        const data = docSnap.data() as {
          studentNo?: string
          name?: string
          number?: number
          isActive?: boolean
        }
        return {
          id: docSnap.id,
          /* §9.3.4는 `studentNo`를 필수로 두지만, 없으면 DR-01로 유도한다.
             화면에 빈 학번이 뜨는 것보다 낫다. */
          studentNo:
            data.studentNo ?? toStudentNo({ grade, classNo, number: data.number ?? 0 }),
          name: data.name ?? '',
          number: data.number ?? 0,
          isActive: data.isActive ?? false,
        }
      })
      /* 🔴 §2.2 B안 — 활성 필터는 **여기**(클라이언트)다. 서버 질의에 넣지 마라. */
      .filter((student) => student.isActive)
      .map(({ id, studentNo, name, number }) => ({ id, studentNo, name, number }))

    const result: StudentsResult = { kind: 'ok', students }
    studentsCache.set(key, result)
    return result
  } catch (error: unknown) {
    return { kind: 'failed', code: errorCode(error, 'firestore/students-failed') }
  }
}
