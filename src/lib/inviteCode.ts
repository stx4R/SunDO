/**
 * PRD §8.2.3 · §9.3.3 — 가입 코드 형식과 입력 중 변형. **순수 함수다.**
 *
 * 화면 없이 실측할 수 있어야 하므로 DOM·Firestore를 참조하지 않는다.
 * 서버 조회는 `src/lib/signup.ts`가 한다.
 */

/** §9.3.3 `code` 제약. 9자 고정이다. */
export const INVITE_CODE_PATTERN = /^[A-Z]{4}-[0-9]{4}$/

/** 형식이 완성된 코드의 길이(`XXXX-9999`). */
export const INVITE_CODE_LENGTH = 9

/** 구분자를 뺀 실제 입력 문자 수. */
const CODE_CHARS = 8

/** 구분자 삽입 지점. 여기까지 차면 `-`가 붙는다(T-02). */
const SEPARATOR_AT = 4

/** 대문자화한 뒤 남길 문자. 구분자·공백·한글·기호는 전부 버린다. */
const KEEP = /[A-Z0-9]/

export interface CodeInput {
  value: string
  /** `selectionStart`. 변형 후의 위치다 */
  caret: number
}

/**
 * 입력값을 정규화하고 **캐럿 위치를 함께 옮긴다.**
 *
 * 값만 바꿔서 제어 컴포넌트에 되돌려 주면 브라우저가 캐럿을 문자열 끝으로 민다.
 * 중간을 고치던 사용자는 커서가 튀는 것을 본다 — 그래서 위치를 같이 계산한다.
 *
 * 규칙(§5.1)
 * - 즉시 대문자화한다
 * - `[A-Z0-9]`가 아닌 문자는 버린다(붙여넣은 `-`·공백·소문자 포함)
 * - 8자를 넘는 입력은 버린다
 * - 4자가 차면 `-`를 자동으로 넣는다
 *
 * **문자 종류(앞 4자가 영문인지)는 검사하지 않는다.** 그것은 형식 검증의 일이고,
 * 타이핑 도중에 문자를 골라 버리면 잘못 누른 키가 조용히 사라져 원인을 알 수 없다.
 */
export function formatInviteCode(raw: string, caret: number): CodeInput {
  const upper = (raw ?? '').toUpperCase()
  const bounded = Math.max(0, Math.min(caret, upper.length))

  let kept = ''
  let keptBeforeCaret = 0

  for (let i = 0; i < upper.length && kept.length < CODE_CHARS; i += 1) {
    const ch = upper[i]
    if (!KEEP.test(ch)) continue
    kept += ch
    if (i < bounded) keptBeforeCaret += 1
  }

  const value =
    kept.length >= SEPARATOR_AT
      ? `${kept.slice(0, SEPARATOR_AT)}-${kept.slice(SEPARATOR_AT)}`
      : kept

  /* 구분자 앞(=4)까지는 그대로, 그 뒤는 구분자 1칸만큼 밀린다.
     정확히 4일 때 5가 아니라 4에 두는 것이 의도다 — 5에 두면 `-` 위에서 누른
     백스페이스가 매번 같은 값으로 되돌아가 지워지지 않는 키가 된다. */
  const next = keptBeforeCaret <= SEPARATOR_AT ? keptBeforeCaret : keptBeforeCaret + 1

  return { value, caret: Math.min(next, value.length) }
}

/** §8.2.3 형식 검사. `formatInviteCode`를 거친 값에도 앞 4자가 숫자인 경우가 남는다. */
export function isInviteCodeComplete(value: string): boolean {
  return INVITE_CODE_PATTERN.test(value)
}
