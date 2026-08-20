/**
 * PRD §9.4 DR-01 · DR-02 · DR-03 — 학번 파생 규칙. 순수 함수만 둔다.
 * W-08(학생 명부 임포트)이 같은 함수를 다시 쓴다.
 */

/** §9.4.1 표시 이름의 학번 구간은 `2`=학년 `07`=반 `23`=번호로 고정 5자리다. */
export const STUDENT_NO_PATTERN = /^[1-3][0-9]{4}$/

/** §9.4.1 "반(01~10)". 부서 문서를 아직 못 읽었을 때 쓰는 기본값이다. */
export const DEFAULT_CLASS_COUNT = 10

/** DR-04 — 번호가 99를 넘는 학교로 확장하면 규칙을 재정의해야 한다. */
export const DEFAULT_MAX_NUMBER = 99

export interface StudentNoParts {
  grade: number
  classNo: number
  number: number
}

export interface RangeOptions {
  /** 학년별 반 수. 없으면 전 학년 `DEFAULT_CLASS_COUNT`. */
  classCountByGrade?: Record<number, number>
  maxNumberPerClass?: number
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** DR-01 — `2학년 3반 3번` → `20303`. 범위 검증은 하지 않는다. */
export function toStudentNo({ grade, classNo, number }: StudentNoParts): string {
  return String(grade) + pad2(classNo) + pad2(number)
}

/**
 * DR-02 — `20303` → `{ grade: 2, classNo: 3, number: 3 }`.
 * 5자리 숫자가 아니면 `null`이다. 범위 검증은 `isStudentNoInRange`가 한다.
 */
export function fromStudentNo(no: string): StudentNoParts | null {
  if (!/^[0-9]{5}$/.test(no)) return null
  return {
    grade: Number(no[0]),
    classNo: Number(no.slice(1, 3)),
    number: Number(no.slice(3, 5)),
  }
}

/** DR-03 — `grade ∈ [1,3]`, `classNo ∈ [1, classCountByGrade[grade]]`, `number ∈ [1, max]`. */
export function isStudentNoInRange(
  { grade, classNo, number }: StudentNoParts,
  { classCountByGrade, maxNumberPerClass = DEFAULT_MAX_NUMBER }: RangeOptions = {},
): boolean {
  if (grade < 1 || grade > 3) return false
  const classCount = classCountByGrade?.[grade] ?? DEFAULT_CLASS_COUNT
  if (classNo < 1 || classNo > classCount) return false
  return number >= 1 && number <= maxNumberPerClass
}
