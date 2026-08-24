import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from './firebase'
import type { ParseResult } from './parseDisplayName'

/**
 * PRD §11.2 OP-01 가입 신청 — 코드 조회와 배치 쓰기.
 *
 * **화면은 Firestore를 직접 부르지 않는다.** 이 파일이 유일한 통로다.
 *
 * W-08 §0.2 결정 1이 반영돼 있다.
 * - **안 1**: `inviteCodes`의 문서 ID가 코드 문자열 자체다. 조회는 **단건 `get` 1회**이고
 *   `where`·`getDocs`를 쓰지 않는다 — Rules가 연 것은 단건 `get` 하나뿐이다.
 * - **안 2**: `useCount` 증가는 신청 시점이 아니라 **부장 승인 시점(OP-09)** 이다.
 *   그래서 배치가 §11.2의 3건이 아니라 **2건**이다. OP-09 쪽은 W-11이 붙인다.
 */

/** §9.3.1 — 단일 부서 고정값. 부서 선택 화면은 존재하지 않는다. */
export const DEPARTMENT_ID = 'dshs-jayul'

/**
 * W-19 결정 3 — **동의 시각을 남긴다.** W-18 §8-2가 「동의를 받았다를 증명할 수 없다」를
 * 올렸고 이 두 필드가 그것을 닫는다.
 *
 * 🔴 **버전 값은 `package.json`의 앱 버전이다.** 정책 문안에는 버전·시행일 필드가 없고
 * (`lib/policy.ts`), 저장소에 존재하는 유일한 버전 식별자가 이것이다. 문안이 바뀌는
 * 회차마다 버전이 오르므로 사실상 문서 버전과 1:1이다. **새 상수를 발명하지 않았다.**
 *
 * ⚠ **소급하지 않는다.** 이 코드 이전에 만들어진 계정에는 두 필드가 **없다** — 그것이 사실이다.
 * 「동의 시점부터 기록한다」 같은 문장을 처리방침에 만들지도 마라(§8.10에 없다).
 *
 * 🔴 두 필드를 **create와 update 양쪽에** 쓴다. 재가입도 S2에서 동의를 다시 받기 때문이다.
 * 신규에만 쓰면 재가입자 문서에 **오늘 동의한 적 없는 옛 시각·옛 버전**이 남아,
 * 증명하려고 만든 필드가 반대를 증명하게 된다. 그래서 `firestore.rules`의
 * `reapply()` `hasOnly` 목록을 2키 넓혔다(W-19 결정 4 · 계약 4-2 이탈).
 */
function agreement() {
  return { agreedAt: serverTimestamp(), agreedPolicyVersion: __APP_VERSION__ }
}

/** §9.3.3 문서 중 판정에 쓰는 필드만 읽는다. */
interface InviteCodeDoc {
  code?: string
  isActive?: boolean
  expiresAt?: { toMillis?: () => number } | null
  useCount?: number
  maxUses?: number
}

/**
 * 코드 조회 결과.
 *
 * 🔴 **`null`로 "없음"과 "실패"를 뭉개지 않는다.** 조회가 실패한 것을 "없는 코드"로
 * 읽으면 정상 코드를 가진 사용자에게 존재하지 않는다고 말하게 된다(W-05 §9와 같은 종류).
 */
export type CodeLookup =
  /** 사용 가능 */
  | { kind: 'ok'; codeId: string }
  /** E-1001 문서 없음 */
  | { kind: 'missing' }
  /** E-1002 비활성·만료·한도 초과(BR-14) */
  | { kind: 'unusable' }
  /** 조회 자체가 실패했다. 인라인 에러가 아니라 상단 배너(ER-01)로 간다 */
  | { kind: 'failed'; errorCode: string }

/**
 * 안 1 — `departments/{deptId}/inviteCodes/{code}` **단건 `get`**.
 *
 * 코드를 이미 아는 사람만 1건을 읽는다. 목록 조회(`list`)는 여전히 `head`·`dev` 전용이므로
 * **`query`·`where`·`getDocs`를 쓰지 마라.** 하나라도 쓰면 규칙에 막힌다.
 */
export async function lookupInviteCode(codeId: string): Promise<CodeLookup> {
  let snapshot
  try {
    snapshot = await getDoc(doc(db, 'departments', DEPARTMENT_ID, 'inviteCodes', codeId))
  } catch (error: unknown) {
    /* 네트워크·권한 거부·타임아웃이 여기로 온다. **1번(문서 없음)이 아니다.** */
    const code = (error as { code?: string })?.code ?? 'firestore/invite-code-lookup-failed'
    return { kind: 'failed', errorCode: code }
  }

  if (!snapshot.exists()) return { kind: 'missing' }

  const data = snapshot.data() as InviteCodeDoc

  if (data.isActive !== true) return { kind: 'unusable' }

  /* `expiresAt`은 Timestamp다. 값이 없으면 만료 판정을 하지 않는다 —
     없는 필드를 "이미 지났다"로 읽으면 정상 코드가 막힌다. */
  const expiresAt = data.expiresAt?.toMillis?.()
  if (typeof expiresAt === 'number' && expiresAt <= Date.now()) return { kind: 'unusable' }

  /* BR-14 — 유효기간 안이어도 한도를 채우면 쓸 수 없다. */
  const useCount = data.useCount ?? 0
  const maxUses = data.maxUses ?? 0
  if (useCount >= maxUses) return { kind: 'unusable' }

  return { kind: 'ok', codeId: snapshot.id }
}

export interface SignupSubmission {
  uid: string
  email: string
  /** 확정된 표시 이름. 파싱값 또는 폴백 입력값 */
  name: string
  nameSource: 'parsed' | 'manual'
  displayNameRaw: string
  parsed: ParseResult | null
  codeId: string
  /**
   * `approvalRequests` 문서 ID. **제출을 시작할 때 1회 만들고 재시도에도 재사용한다**
   * (§11.1 멱등성). 매번 새로 만들면 재시도가 문서를 늘린다.
   */
  requestId: string
  /** `noProfile`이면 생성, `withdrawn`·`rejected`면 재활성이다 */
  reactivate: boolean
}

export type SubmitResult = { ok: true } | { ok: false; errorCode: string }

/**
 * OP-01 배치. **2건이다** — `users/{uid}` + `approvalRequests/{reqId}`.
 * `inviteCodes` 쓰기는 없다(안 2). 🔴 **W-19가 필드를 2개 더했어도 연산 수는 그대로다** —
 * 2연산 계약을 깨지 않았다.
 *
 * ⚠ **호출부는 S2 하나뿐이고, 그 화면이 동의 체크박스를 제출 조건에 넣는다**
 * (`Signup.tsx`의 `disabled = !codeFilled || !online || !agreed`).
 * 그래서 여기서 `agreed`를 다시 받지 않는다 — 받으면 `false`로 부를 수 있는 경로를
 * 만드는 셈이고, 그 경로는 `agreedAt`이 있는 문서를 동의 없이 만든다.
 *
 * `writeBatch`가 원자적이므로 부분 생성 문서가 남지 않는다. 롤백 코드를 따로 쓰지 마라.
 */
export async function submitSignup(input: SignupSubmission): Promise<SubmitResult> {
  const batch = writeBatch(db)
  const userRef = doc(db, 'users', input.uid)
  const parsed = input.parsed?.ok ? input.parsed : null

  if (input.reactivate) {
    /* BR-61 — 기존 uid를 그대로 재활성한다.
       §0.2 결정 2가 허용한 필드 부분집합만 쓴다.
       **`createdAt`·`recordCount`·`email`·`uid`를 다시 쓰지 마라** — 불변이고,
       다시 쓰면 재신청이 가입 시각과 누적 작성 건수를 지운다(BR-28의 기록 보존과 충돌한다). */
    batch.update(userRef, {
      status: 'pending',
      /* BR-62 — 이전 역할(차장 등)을 복원하지 않는다. */
      role: 'member',
      withdrawnAt: null,
      rejectReason: null,
      inviteCodeId: input.codeId,
      updatedAt: serverTimestamp(),
      ...agreement(),
    })
  } else {
    /* §11.2 OP-01 요청 JSON 전문 + `updatedAt`.
       `updatedAt`은 §9.3.1이 필수로 규정하는데 OP-01 예시에 빠져 있다(보고서 §5). */
    batch.set(userRef, {
      uid: input.uid,
      email: input.email,
      name: input.name,
      nameSource: input.nameSource,
      displayNameRaw: input.displayNameRaw,
      memberStudentNo: parsed?.memberStudentNo ?? null,
      memberGrade: parsed?.memberGrade ?? null,
      memberClassNo: parsed?.memberClassNo ?? null,
      memberNumber: parsed?.memberNumber ?? null,
      role: 'member',
      status: 'pending',
      departmentId: DEPARTMENT_ID,
      inviteCodeId: input.codeId,
      notificationPrefs: { duty: true, approval: true },
      createdAt: serverTimestamp(),
      recordCount: 0,
      updatedAt: serverTimestamp(),
      ...agreement(),
    })
  }

  /* BR-28 — 재신청도 **새 문서**다. 기존 신청 문서를 덮어쓰거나 지우지 않는다. */
  batch.set(doc(db, 'approvalRequests', input.requestId), {
    uid: input.uid,
    email: input.email,
    name: input.name,
    inviteCodeId: input.codeId,
    status: 'pending',
    createdAt: serverTimestamp(),
  })

  try {
    await batch.commit()
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code ?? 'firestore/signup-batch-failed'
    return { ok: false, errorCode: code }
  }
  return { ok: true }
}

/** §11.1 멱등성 — `{uid}_{제출 시각 밀리초}`. 재시도에서 다시 부르지 마라. */
export function newRequestId(uid: string): string {
  return `${uid}_${Date.now()}`
}
