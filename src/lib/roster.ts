import {
  collection,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
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

/* ============================================================================
   🔴 W-21C 결함 3 — 오프라인에서 집계 질의가 전부 죽는다 (W-21 §6.1 · 원인 확정)

   `getCountFromServer`는 **로컬 캐시 경로가 아예 없다** — SDK 원문이
   `invokeRunAggregationQueryRpc`로 직행하고 `TODO(b/277628384): check canUseNetwork()`가
   남아 있다. ⇒ 오프라인에서 **항상 throw**한다.

   🔴 **W-21은 이것을 「설계 회차 규모」로 판정했다**(집계를 `getDocs`로 바꾸면 S3 진입마다
      학생 1,033건). 🔬 **소비자를 세어 보니 그 전제가 틀렸다** —
      S3의 학년 버튼도 S4의 반 버튼도 **인원 수치를 그리지 않는다.**
      `isEmptyGrade`·`isEmptyClass`가 `> 0`만 보므로 필요한 것은 **존재 여부**뿐이고,
      `limit(1)`이면 학년당 **1건**이다(보고서 §6).

   그래서 두 단계로 센다.
     ① `getCountFromServer` — 온라인 비용은 **그대로 1읽기**다
     ② 실패하면 `getDocs` — 🔴 **오프라인에서도 resolve한다**(캐시에서 읽는다)

   🔴 **`fromCache && 비어 있음`을 「0건」으로 읽지 마라.** 그것은 「캐시가 아무것도 모른다」
      이지 「없다」가 아니다 — W-10 §5-3이 막으려던 거짓말과 같은 종류다. `null`을 돌려주고
      호출부가 실패로 떨어뜨린다.
   ==========================================================================*/

/**
 * 존재 여부만 필요한 자리의 카운트. **정확한 수가 필요 없다.**
 *
 * @returns 건수 · 🔴 판정 불가면 `null`(오프라인 + 캐시 미스)
 */
export async function countOrProbe(q: ReturnType<typeof query>): Promise<number | null> {
  try {
    return (await getCountFromServer(q)).data().count
  } catch {
    /* 오프라인. 🔴 `limit(1)`이라 캐시가 있어도 1건만 읽는다 — 존재 여부에는 그것으로 족하다. */
    const snapshot = await getDocs(query(q, limit(1)))
    if (snapshot.empty && snapshot.metadata.fromCache) return null
    return snapshot.size
  }
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
        countOrProbe(
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
    /* 🔴 **한 반이라도 오프라인 폴백조차 실패하면 전체를 실패로 본다.** 일부만 0으로
       채우면 그 반들이 `opacity 0.5` + TS-15가 되어 「명부가 비었다」는 거짓말이 된다. */
    if (counts.some((c) => c === null)) {
      return { kind: 'failed', code: 'firestore/class-counts-offline' }
    }
    const byClass: Record<number, number> = {}
    classNos.forEach((classNo, i) => {
      byClass[classNo] = counts[i] as number
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

    /**
     * 🔴 **W-21C 결함 4의 곁가지 — 이 파일의 문서 주석이 경고하던 것을 이제 막는다.**
     *
     * `getDocs`는 오프라인에서 **reject하지 않고 빈 결과를 조용히 돌려준다**(SDK 원문 —
     * `r.fromCache && "server" === i.source ? reject : resolve`). 캐시에 없는 반을 열면
     * **EM-01 「이 반에 등록된 학생이 없습니다」라는 거짓말**이 떴다.
     * ⇒ `fromCache && 비어 있음`은 **모른다**이지 **없다**가 아니다. ER-03으로 떨어뜨린다.
     *
     * ⚠ **관측된 ER-03(결함 4 본체)의 원인은 아직 미확정이다** — 기기에 디버거를 붙여
     *   `errorCode`의 실제 값을 봐야 갈린다. 여기서 고친 것은 **코드에서 보이는 거짓말**
     *   하나뿐이고, 그 사실을 보고서 §6에 그대로 적었다.
     */
    if (students.length === 0 && snapshot.empty && snapshot.metadata.fromCache) {
      return { kind: 'failed', code: 'firestore/students-offline' }
    }

    const result: StudentsResult = { kind: 'ok', students }
    studentsCache.set(key, result)
    return result
  } catch (error: unknown) {
    return { kind: 'failed', code: errorCode(error, 'firestore/students-failed') }
  }
}

/* ============================================================================
   🔴 W-21C 기능 4 — 학생 검색 (§2.4 · 결정 3)

   **방식: 전량 로드 + 클라이언트 필터.** 근거 넷(보고서 §6):
     ① 🔬 **새 질의도 새 인덱스도 없다** — `fetchStudents`를 반마다 부를 뿐이고 그것은
        IX-08을 그대로 쓴다. 검색을 위해 만든 질의가 **0개**다
     ② 🔴 **캐시를 공유한다** — S4→S5로 들어간 반은 이미 `studentsCache`에 있어
        검색이 그만큼 싸진다. 반대로 검색이 채운 캐시는 S5 진입을 공짜로 만든다
     ③ 🔴 **이름 중간 일치가 된다**(「준」으로 「김준서」). prefix 질의로는 불가능하고
        사용자가 원한 동작이다
     ④ §14.1 — **실질 차이가 없다.** 부원은 이미 S4→S5로 **전 학년·전 반을 열람할 수 있고**
        PR-01의 4필드(학년·반·번호·이름)를 그대로 본다. 검색은 **접근 범위를 넓히지 않고**
        도달 경로만 줄인다. ⚠ 다만 오프라인 캐시에 명부가 더 오래 남는다 — 그 사실은
        보고서 §6에 적었다(PR-04와 같은 층의 잔여 위험이다)

   🔴 **한 번에 전부 받지 않는다.** 학년×반을 순차로 채우며 **첫 결과부터 흘린다** —
      1,033건을 다 받을 때까지 사용자가 빈 화면을 보지 않아야 한다.
   ==========================================================================*/

export interface StudentHit extends Student {
  grade: number
  classNo: number
}

/** §9.4.1 표시 학번은 고정 5자리다(`{학년}{반2}{번호2}`). */
export const STUDENT_NO_LEN = 5

/**
 * 🔴 **W-26 — 입력을 숫자 5자리로 못 박는다.** `Field`의 `transform` 계약이다
 * (`capReasonText`·`capPlace`와 같은 형태).
 *
 * 사용자 요구로 **검색은 학번만** 받는다. 숫자가 아닌 글자를 애초에 못 들어오게 하면
 * ① 키보드를 `numeric` **고정**으로 둘 수 있고(이전에는 입력에 따라 `text`↔`numeric`이
 * 바뀌었고 iOS에서 그 순간 키보드가 갈아 끼워지며 입력이 끊겼다)
 * ② 아래 `scopeForStudentNo`가 **항상** 성립한다.
 */
export function capStudentNo(raw: string, caret: number): { value: string; caret: number } {
  let value = ''
  let next = caret
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]
    if (ch >= '0' && ch <= '9') {
      if (value.length < STUDENT_NO_LEN) value += ch
      else if (i < caret) next -= 1
    } else if (i < caret) {
      /* 지워진 글자가 캐럿 앞에 있었으면 캐럿도 그만큼 당긴다. */
      next -= 1
    }
  }
  return { value, caret: Math.max(0, Math.min(next, value.length)) }
}

/** 🔴 입력 판정 — 이제 **학번만** 받는다. 숫자 1~5자리면 참이다. */
export function isStudentNoQuery(q: string): boolean {
  const t = q.trim()
  return t.length > 0 && t.length <= STUDENT_NO_LEN && /^[0-9]+$/.test(t)
}

/**
 * §2.4 — 🔴 **W-26 사용자 확정: 학번 「앞자리부터 일치」다.**
 *
 * ⚠ **이전에는 「포함」이었고 이름도 받았다.** 둘 다 이 회차가 닫았다 —
 * 이름 검색은 사용자가 명시적으로 뺐고(「학번만 가능하도록」), 포함 일치는
 * **앞자리로 반을 특정할 수 없게 만들어** 전 학년 24개 반을 매번 훑게 하는 원인이었다.
 * `303`으로 `20303`을 찾는 동작은 사라진다 — 선택지와 대가를 적어 확정받았다.
 */
export function matchStudent(student: Student, q: string): boolean {
  const t = q.trim()
  if (t === '') return false
  return student.studentNo.startsWith(t)
}

/**
 * 🔴 **W-26 — 검색이 훑을 (학년, 반)을 「학번 앞자리」로 좁힌다.**
 *
 * 학번은 DR-01상 `{학년1}{반2}{번호2}`이므로 **앞자리가 곧 조회 대상 좌표**다.
 * 앞자리 일치(`startsWith`)와 짝을 이루면 **결과를 하나도 놓치지 않으면서**
 * 조회 대상이 이렇게 줄어든다:
 *
 * | 입력 | 훑는 반 |
 * | --- | --- |
 * | `2` | 2학년 전체(최대 10개) |
 * | `20` · `21` | 반 번호가 그 숫자로 시작하는 반(1~9 또는 10) |
 * | `203` 이상 | 🔴 **정확히 1개 반** |
 *
 * 🔬 **지금 느린 이유가 이것이었다** — 이전 `searchScope`는 입력과 무관하게 **24개 반
 * 전부**를 돌려주었고 `searchStudents`가 그것을 **순차로 하나씩 기다리며** 조회했다.
 * 5자리를 다 친 경우가 24 → 1로 줄어든다.
 *
 * ⚠ **범위를 벗어난 입력은 빈 배열이다.** 학년이 4거나 반이 개설 수를 넘으면 찾을
 * 학생이 존재할 수 없다 — 없는 반을 조회하지 않는 것이 옳다.
 */
export function scopeForStudentNo(
  q: string,
  classCountByGrade: Readonly<Record<string, number>>,
): readonly { grade: number; classNo: number }[] {
  const t = q.trim()
  if (t === '' || !/^[0-9]{1,5}$/.test(t)) return []

  const grade = Number(t[0])
  if (grade < 1 || grade > 3) return []
  const count = classCountByGrade[String(grade)] ?? 0

  const out: { grade: number; classNo: number }[] = []
  /* 🔴 반 번호는 **2자리 0채움**이다(`toStudentNo`의 `pad2`). 문자열 접두사로 비교해야
     `1`이 `1반`과 `10반`을 함께 잡는다 — 숫자로 비교하면 그 관계가 사라진다. */
  const classPrefix = t.slice(1, 3)
  for (let classNo = 1; classNo <= count; classNo += 1) {
    if (String(classNo).padStart(2, '0').startsWith(classPrefix)) out.push({ grade, classNo })
  }
  return out
}

/**
 * 한 반씩 받아 **부분 결과를 즉시 흘린다.**
 *
 * 🔴 **이미 캐시에 있는 반은 질의 0회다** — `fetchStudents`의 `studentsCache`가 그대로 산다.
 * 🔴 **취소 가능해야 한다** — 사용자가 입력을 바꾸면 남은 반을 더 받을 이유가 없다.
 *   `signal.aborted`를 매 반마다 본다.
 *
 * @param onPartial 지금까지 모인 결과. 반이 끝날 때마다 부른다
 * @returns 최종 결과와 실패한 반 수.
 *   🔴 **`hits`를 함께 돌려주는 것이 W-26의 변경점이다.** 훑을 반이 **0개**인 입력
 *   (예: 없는 학년·개설되지 않은 반)에서는 `onPartial`이 **한 번도 불리지 않아**
 *   화면에 **직전 검색어의 결과가 그대로 남았다.** 호출부가 종료 시점에 이 값으로
 *   덮어쓰면 그 거짓말이 사라진다 — 반대로 진행 중에는 옛 결과를 그대로 두어
 *   글자를 칠 때마다 목록이 비었다 채워지는 깜빡임을 만들지 않는다.
 */
export async function searchStudents(
  academicYear: number,
  scope: readonly { grade: number; classNo: number }[],
  query_: string,
  onPartial: (hits: readonly StudentHit[], done: number) => void,
  signal: { aborted: boolean },
): Promise<{ failed: number; hits: readonly StudentHit[] }> {
  const hits: StudentHit[] = []
  let failed = 0
  let done = 0

  /**
   * 🔴 **W-26 — 순차 `for await`에서 병렬로 바꿨다.**
   *
   * 🔬 이전 판은 반 하나를 **다 기다린 뒤** 다음 반을 조회했다. 24개 반이면 왕복이
   * 24번 줄지어 서고, 모바일에서 반당 200~400ms면 **수 초**다 — 사용자가 본
   * 「학번을 쳐도 안 나온다 · 뻑뻑하다」의 실체다. 앞자리 좁히기(`scopeForStudentNo`)가
   * 대부분을 1개 반으로 줄이지만, 1자리만 친 순간(최대 10개 반)에는 병렬이 필요하다.
   *
   * ⚠ **스트리밍은 그대로다** — `Promise.all`로 묶되 각 반이 끝나는 **그 자리에서**
   * `onPartial`을 부른다. 결과를 다 모을 때까지 기다리지 않는다.
   * ⚠ **취소돼도 진행 중인 조회를 죽이지 않는다** — 그 결과는 `studentsCache`를 채워
   *   다음 검색을 공짜로 만든다. 화면에만 반영하지 않는다.
   */
  await Promise.all(
    scope.map(async ({ grade, classNo }) => {
      const result = await fetchStudents(academicYear, grade, classNo)
      if (signal.aborted) return
      done += 1
      if (result.kind === 'failed') {
        failed += 1
        return
      }
      for (const student of result.students) {
        if (matchStudent(student, query_)) hits.push({ ...student, grade, classNo })
      }
      /* 학번 오름차순 — S5와 같은 순서다(DR-01상 학년·반·번호 순과 항등).
         🔴 병렬이라 도착 순서가 반 순서와 다르다 — 매번 정렬해야 목록이 튀지 않는다. */
      hits.sort((a, b) => a.studentNo.localeCompare(b.studentNo))
      onPartial([...hits], done)
    }),
  )

  return { failed, hits }
}
