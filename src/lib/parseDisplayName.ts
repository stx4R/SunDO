import { fromStudentNo, isStudentNoInRange } from './studentNo'

/**
 * PRD §9.4.2 DR-08 · DR-09 · DR-11 — Google 표시 이름 파싱. 순수 함수다.
 *
 * 표시 이름 예: `26_20723유이준`
 * `26` = 현재 학년도 뒤 2자리 / `20723` = 학번 / `유이준` = 이름
 *
 * **이메일은 여기서 다루지 않는다.** DR-14 — 이메일 로컬 파트의 생일(MMDD)은
 * 파싱·저장·표시하지 않는다(§14.1 PR-05).
 */

export type ParseFail = 'format' | 'nameLength' | 'range'

export type ParseResult =
  | {
      ok: true
      /** DR-08 그룹 1. 현재 학년도 뒤 2자리 */
      academicYearShort: string
      memberStudentNo: string
      name: string
      memberGrade: number
      memberClassNo: number
      memberNumber: number
    }
  | { ok: false; reason: ParseFail }

/** DR-08. 그룹 3은 트림 후 2~10자여야 한다. */
const DISPLAY_NAME = /^(\d{2})_(\d{5})(.+)$/

const NAME_MIN = 2
const NAME_MAX = 10

/**
 * @param classCountByGrade 학년별 반 수. **선택 인자다** — 부서 문서가 로드되기 전에도
 *   파싱해야 하므로, 없으면 §9.4.1의 기본 범위(반 1~10)로 검증한다.
 *
 * 검사 순서는 DR-08(형식 → 이름 길이) → DR-09(학번 범위)다.
 * 실패는 DR-11의 `nameSource='manual'` 경로로 이어진다.
 * **교사 계정은 학번 체계가 없어 이 경로를 타는 것이 정상이다.**
 */
export function parseDisplayName(
  raw: string,
  classCountByGrade?: Record<number, number>,
): ParseResult {
  const matched = DISPLAY_NAME.exec(raw ?? '')
  if (!matched) return { ok: false, reason: 'format' }

  const [, academicYearShort, memberStudentNo, rawName] = matched

  const name = rawName.trim()
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return { ok: false, reason: 'nameLength' }
  }

  // DR-09 — 학번에서 역파생한 뒤 DR-03 범위를 검증한다.
  const parts = fromStudentNo(memberStudentNo)
  if (!parts || !isStudentNoInRange(parts, { classCountByGrade })) {
    return { ok: false, reason: 'range' }
  }

  return {
    ok: true,
    academicYearShort,
    memberStudentNo,
    name,
    memberGrade: parts.grade,
    memberClassNo: parts.classNo,
    memberNumber: parts.number,
  }
}
