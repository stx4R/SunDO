import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'
import { generateInviteCode } from './inviteCode'
import { DEPARTMENT_ID } from './stats'

/**
 * PRD §8.8 S8 관리 · §9.3.3 · §9.3.7 · §9.3.8 · §11.2 OP-09·OP-10 · §10.3.
 *
 * **화면은 Firestore를 직접 부르지 않는다.** 6번째 `lib`이고 계약은 앞선 다섯과 같다.
 *
 * 🔴 **이 파일이 앱에서 처음으로 남의 계정 상태를 바꾼다.** 배치 쓰기·감사 로그·
 * `inviteCodes` 생성이 전부 처음이고 셋이 한 트랜잭션에 묶인다.
 * **부분 성공은 없다** — 모든 쓰기는 `writeBatch` 하나로 커밋한다.
 *
 * ⚠ **`batch.commit()`은 오프라인에서 resolve되지 않는다**(W-08 §5-7 · W-12 §1-3과 같은 성질).
 * 그래서 화면이 `useOnline()`으로 액션을 **먼저 막는다**(§8.8.6). 커밋 시작 직후 끊기는
 * 좁은 창은 여기서 막지 못하고 오프라인 회차가 이어받는다 — `database_ToDo/W-15A.md` §7.
 */

/** `departments/{deptId}/inviteCodes/{codeId}` — 🔴 **하위 컬렉션이다**(§9.3.3). */
const INVITE_CODES = ['departments', DEPARTMENT_ID, 'inviteCodes'] as const

/** §9.3.3 기본값. `[결정 필요 D-08]`이라 값을 바꾸려면 PRD가 먼저다. */
const MAX_USES = 30
/** BR-13 — 발급 후 14일. */
const CODE_TTL_MS = 14 * 24 * 60 * 60 * 1000
/** BR-16 · §11.5 — 시간당 5회. */
export const REISSUE_LIMIT_PER_HOUR = 5
const HOUR_MS = 60 * 60 * 1000

function errorCode(error: unknown, fallback: string): string {
  return (error as { code?: string })?.code ?? fallback
}

function toDate(v: unknown): Date | null {
  return (v as { toDate?: () => Date })?.toDate?.() ?? null
}

/* --- ① 부서 가입 코드 --------------------------------------------------- */

/**
 * 🔴 **`none`은 에러가 아니다.** `departments.activeInviteCodeId`가 `null`인 상태가
 * 실제로 존재한다(아직 시딩되지 않았다 — §8.8.6에 이 행이 없다). 「코드 없음」과
 * 「못 읽었다」를 뭉개면 ER-06이 잘못 뜬다.
 *
 * 🔴 **`getDoc` 경로라 추가 조건이 필요 없다.** 서버에 못 닿으면 `unavailable`로 **throw**하므로
 * (W-14 §1-3 P1) `none`에 도달했다는 것 자체가 서버 확인의 증거다.
 */
export type InviteCodeState =
  | {
      kind: 'ok'
      codeId: string
      issuedAt: Date | null
      expiresAt: Date | null
      useCount: number
      maxUses: number
    }
  | { kind: 'none' }
  | { kind: 'failed'; code: string }

interface StoredCode {
  code?: string
  issuedAt?: unknown
  expiresAt?: unknown
  useCount?: number
  maxUses?: number
}

let codeCache: InviteCodeState | null = null
let memberCache: MemberListState | null = null

/**
 * 🔴 다섯 번째 캐시다. `clearHomeCache`·`clearRosterCache`·`clearRecordsCache`·`clearDutyCache`를 부르지 마라.
 *
 * 🔴 **여섯 번째 `clear*Cache`를 만들지 않는다.** W-15B가 부원 목록 캐시를 더하면서
 * 이 함수를 **넓혔다** — `admin.ts`가 화면과 Firestore 사이의 유일한 통로인 이상
 * 이 파일의 캐시를 비우는 함수도 하나여야 한다.
 */
export function clearAdminCache(): void {
  codeCache = null
  memberCache = null
}

/**
 * §8.8.3 #2 — `departments` → `inviteCodes` 단건 2연쇄.
 *
 * 🔴 **`activeInviteCodeId`가 가리키는 문서가 사라졌어도 `none`이다.** 그 상태에서
 * `재발급`이 첫 코드를 만든다(§2.3-B). 「가리키는 문서가 없다」는 실패가 아니다.
 */
export async function fetchActiveInviteCode(force = false): Promise<InviteCodeState> {
  if (!force && codeCache) return codeCache

  let result: InviteCodeState
  try {
    const dept = await getDoc(doc(db, 'departments', DEPARTMENT_ID))
    const activeId = (dept.data() as { activeInviteCodeId?: string | null } | undefined)
      ?.activeInviteCodeId
    if (!dept.exists() || !activeId) {
      result = { kind: 'none' }
    } else {
      const snapshot = await getDoc(doc(db, ...INVITE_CODES, activeId))
      if (!snapshot.exists()) {
        result = { kind: 'none' }
      } else {
        const data = snapshot.data() as StoredCode
        result = {
          kind: 'ok',
          codeId: snapshot.id,
          issuedAt: toDate(data.issuedAt),
          expiresAt: toDate(data.expiresAt),
          useCount: data.useCount ?? 0,
          maxUses: data.maxUses ?? MAX_USES,
        }
      }
    }
  } catch (error: unknown) {
    /* 실패는 캐시하지 않는다. `다시 시도`가 바로 재조회해야 한다. */
    return { kind: 'failed', code: errorCode(error, 'firestore/invite-code-failed') }
  }
  codeCache = result
  return result
}

/**
 * BR-16 레이트 리밋 — 1시간 내 발급 건수.
 *
 * **단일 필드 범위 조건 1개**라 자동 인덱스로 돈다(복합 인덱스 요구 0건).
 * 🔴 실패하면 `null`이다 — **막지 않는다.** 세지 못한 것을 「한도 초과」로 읽으면
 * 정상 부장이 코드를 못 만든다(W-12 §3.8 「조회 실패는 중복 없음이 아니다」와 같은 정신의 반대편).
 */
export async function countRecentIssues(now: Date): Promise<number | null> {
  try {
    const snapshot = await getDocs(
      query(
        collection(db, ...INVITE_CODES),
        where('issuedAt', '>=', Timestamp.fromDate(new Date(now.getTime() - HOUR_MS))),
      ),
    )
    return snapshot.size
  } catch (error: unknown) {
    console.warn('[admin] 발급 이력 조회 실패', errorCode(error, 'unknown'))
    return null
  }
}

/* --- ② 부원 · 권한 양도 ------------------------------------------------- */

/**
 * §8.8.3 #6 — 부원 행에 그리는 값. 🔴 **이메일을 담지 않는다.**
 * §8.8.3 #6이 아바타 + 이름 + 역할만 규정하고, 부원이 보는 목록은 이름·역할만이라는
 * §4.2 단서 1과도 맞다(W-14 결정 3의 클라이언트 규율).
 */
export interface Member {
  uid: string
  name: string
  role: string
}

/** 🔴 **실패 ≠ 없음.** 조회 실패를 빈 목록으로 떨어뜨리면 EM-05가 거짓으로 뜬다. */
export type MemberListState = { kind: 'ok'; members: Member[] } | { kind: 'failed'; code: string }

/**
 * §4.4 R-01~R-04 · BR-24의 권한 순서. **알파벳 순이 아니다.**
 *
 * 🔴 IX-10의 `role ASC`는 `dev`·`head`·`member`·`teacher`·`vice` 순이라
 * 조직도와 아무 관계가 없다. 사람이 목록에서 찾는 순서(부장 → 차장 → 부원 → 교사 → Dev)로
 * **클라이언트에서** 정렬한다 — §7 신규 항목으로 올렸다.
 */
const ROLE_RANK: Readonly<Record<string, number>> = {
  head: 0,
  vice: 1,
  member: 2,
  teacher: 3,
  dev: 4,
}

/** BR-20 · R-08 · BR-59 · US-H-03 AC-4 — 양도 대상 자격. 본인 제외는 호출부가 판단한다. */
export function isTransferTarget(member: Pick<Member, 'role'>): boolean {
  return member.role === 'member' || member.role === 'vice'
}

/**
 * §8.8.3 #6 — `users` where `departmentId ==` + `status == 'active'`.
 *
 * 🔴 **등식 2개뿐이고 `orderBy`를 서버에 맡기지 않는다.** §9.5 IX-10은 미생성이고
 * `role ASC`는 알파벳 순이라 의미도 없다. 실사용 규모가 약 40명이라 정렬은 클라이언트가
 * 한다(W-15A의 승인 대기 목록과 같은 판단 — **S8은 인덱스를 0건 요구한다**).
 *
 * ⚠ **`users`를 `list`로 읽는 것은 앱에서 이번이 처음이다**(W-13은 `documentId() in` 묶음이었다).
 * 규칙 회차 재검증 항목이다 — `database_ToDo/W-15B.md` §3.
 *
 * 🔴 **탈퇴·승인 대기 계정은 질의 단계에서 이미 빠진다**(`status == 'active'`) —
 * R-08 · BR-59 · US-H-03 AC-4가 여기서 함께 지켜진다. 별도 필터를 덧붙이지 마라.
 */
export async function fetchMembers(force = false): Promise<MemberListState> {
  if (!force && memberCache) return memberCache

  try {
    const snapshot = await getDocs(
      query(
        collection(db, 'users'),
        where('departmentId', '==', DEPARTMENT_ID),
        where('status', '==', 'active'),
      ),
    )
    const members = snapshot.docs.map((snap) => {
      const data = snap.data() as { name?: string; role?: string }
      return { uid: snap.id, name: data.name ?? '', role: data.role ?? 'member' }
    })
    /* 역할 권한 순 → 이름 가나다. 표에 없는 역할은 뒤로 보낸다. */
    members.sort(
      (a, b) =>
        (ROLE_RANK[a.role] ?? 99) - (ROLE_RANK[b.role] ?? 99) ||
        a.name.localeCompare(b.name, 'ko'),
    )
    memberCache = { kind: 'ok', members }
  } catch (error: unknown) {
    /* 실패는 캐시하지 않는다. `다시 시도`가 바로 재조회해야 한다. */
    return { kind: 'failed', code: errorCode(error, 'firestore/members-failed') }
  }
  return memberCache
}

/* --- ③ 가입 승인 대기 --------------------------------------------------- */

export interface PendingRequest {
  id: string
  uid: string
  name: string
  email: string
  /** 승인 배치의 `useCount` 대상. 🔴 없을 수 있다 — 그때는 그 연산만 건너뛴다. */
  inviteCodeId: string | null
  createdAt: Date | null
}

export interface PendingSnapshot {
  requests: PendingRequest[]
  fromCache: boolean
}

/**
 * §8.8.3 #9·#10 — `approvalRequests` where `status == 'pending'`.
 *
 * 🔴 **등식 1개뿐이고 `orderBy`를 서버에 맡기지 않는다.** IX-11이 미생성이라
 * `orderBy`를 붙이면 `failed-precondition`으로 죽는다. 승인 대기는 많아야 수십 건이라
 * **클라이언트 정렬**로 충분하다(W-12의 등식 전용 설계와 같은 판단).
 *
 * 🔴 **구독이 정당한 화면이다** — 목록형이고 **변경 주체가 앱 안에 여럿이다**
 * (다른 부장·Dev가 동시에 처리하고, S2 가입 신청이 실시간으로 들어온다 — T-07).
 * W-14의 S9와 갈리는 지점이 이것이다.
 *
 * 🔴 `includeMetadataChanges: true`가 없으면 `fromCache` 전환을 관측할 수 없다(W-13 §4-1).
 * 🔴 **반환한 해제 함수를 반드시 호출한다.** 독 이동은 `replace`라 화면이 언마운트된다.
 */
export function subscribePendingRequests(
  onData: (snapshot: PendingSnapshot) => void,
  onFailed: (code: string) => void,
): () => void {
  return onSnapshot(
    query(collection(db, 'approvalRequests'), where('status', '==', 'pending')),
    { includeMetadataChanges: true },
    (snapshot) => {
      const requests = snapshot.docs.map((snap) => {
        const data = snap.data() as {
          uid?: string
          name?: string
          email?: string
          inviteCodeId?: string
          createdAt?: unknown
        }
        return {
          id: snap.id,
          uid: data.uid ?? '',
          name: data.name ?? '',
          email: data.email ?? '',
          inviteCodeId: data.inviteCodeId ?? null,
          createdAt: toDate(data.createdAt),
        }
      })
      /* 클라이언트 정렬 — `createdAt` 내림차순. 값이 없는 문서는 뒤로 보낸다. */
      requests.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      onData({ requests, fromCache: snapshot.metadata.fromCache })
    },
    (error: unknown) => onFailed(errorCode(error, 'firestore/pending-listen-failed')),
  )
}

/* --- 쓰기 3종 ----------------------------------------------------------- */

/** §9.3.8 — 감사 로그의 행위자 스냅샷. */
export interface Actor {
  uid: string
  name: string
  role: string
}

export type WriteResult = { ok: true } | { ok: false; code: string }

/**
 * §9.3.8의 `action` 목록에서 **이번 회차에 쓰는 값만** 늘린다.
 * 🔴 `ROLE_CHANGE`를 넣지 않았다 — 부장의 부원↔차장 역할 변경(§4.2 BR-24)은
 * §8.8.3 요소 표에 UI가 없고 ⑥ Dev 도구(v1.2) 소유다. 쓰지 않는 값을 미리 열지 않는다.
 */
type AuditAction = 'USER_APPROVE' | 'USER_REJECT' | 'CODE_ISSUE' | 'HEAD_TRANSFER'

/**
 * §9.3.8 전 필드. **배치에 넣기만 하고 커밋은 호출부가 한다** — 감사 로그만 따로
 * 커밋하면 「본 연산은 실패했는데 로그만 남는」 상태가 생긴다.
 *
 * 🔴 **`before`/`after`에 개인정보를 통째로 담지 마라.** 결정 3(W-14)의 클라이언트 규율이
 * 여기에도 적용된다 — 상태 전이 요약이면 충분하다. 이름·이메일은 `targetId`(uid)로 역추적한다.
 *
 * 문서 ID는 `crypto.randomUUID()`다(W-12 `clientRecordId` 선례). 재시도해도 같은 배치가
 * 통째로 다시 돌기 때문에 멱등키가 아니라 **충돌 없는 새 ID**면 된다.
 */
function appendAudit(
  batch: ReturnType<typeof writeBatch>,
  actor: Actor,
  action: AuditAction,
  targetType: string,
  targetId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): void {
  batch.set(doc(db, 'auditLogs', crypto.randomUUID()), {
    actorUid: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    targetType,
    targetId,
    before,
    after,
    createdAt: serverTimestamp(),
  })
}

/**
 * OP-09 승인 — **배치 4연산**(`inviteCodeId`가 없으면 3연산).
 *
 * 🔴 **한도를 검사하지 않는다**(W-15A 결정 1). `useCount >= maxUses`여도 승인은 성공하고
 * `useCount`는 그대로 +1 된다. BR-14의 실질 게이트는 **신청 시점(S2)**이고, 승인은 부장의
 * 명시적 판단이라 사람이 이미 게이트다. **한도 초과 경고 UI를 만들지 마라** — §8.10에 문구가 없다.
 *
 * 🔴 **`inviteCodeId`가 없거나 코드 문서가 사라졌으면 `useCount` 갱신만 건너뛰고 승인은 진행한다.**
 * 코드 문서 때문에 사람의 가입이 막히면 안 된다. `batch.update`는 문서가 없으면 배치 전체를
 * 실패시키므로, **존재를 미리 확인**하고 없으면 연산을 빼는 방식이어야 한다.
 */
export async function approveRequest(actor: Actor, request: PendingRequest): Promise<WriteResult> {
  const batch = writeBatch(db)
  const now = serverTimestamp()

  batch.update(doc(db, 'users', request.uid), {
    status: 'active',
    approvedBy: actor.uid,
    approvedAt: now,
    updatedAt: now,
  })
  batch.update(doc(db, 'approvalRequests', request.id), {
    status: 'approved',
    decidedBy: actor.uid,
    decidedAt: now,
  })

  /* W-08 §0.2 안 2 — `useCount` 증가는 신청이 아니라 **승인** 시점이다. */
  let countedCode: string | null = null
  if (request.inviteCodeId) {
    try {
      const codeRef = doc(db, ...INVITE_CODES, request.inviteCodeId)
      if ((await getDoc(codeRef)).exists()) {
        batch.update(codeRef, { useCount: increment(1) })
        countedCode = request.inviteCodeId
      }
    } catch (error: unknown) {
      /* 코드 문서를 못 읽은 것으로 승인을 막지 않는다. */
      console.warn('[admin] 코드 문서 확인 실패 — useCount를 건너뛴다', errorCode(error, 'unknown'))
    }
  }

  appendAudit(batch, actor, 'USER_APPROVE', 'users', request.uid, { status: 'pending' }, {
    status: 'active',
    /* 어느 코드가 소모됐는지는 감사 대상이다. 개인정보가 아니다. */
    inviteCodeCounted: countedCode,
  })

  try {
    await batch.commit()
  } catch (error: unknown) {
    return { ok: false, code: errorCode(error, 'firestore/approve-failed') }
  }
  return { ok: true }
}

/**
 * OP-09 거절 — **배치 3연산**. 🔴 **`useCount`를 건드리지 않는다.**
 *
 * 🔴 `rejectReason`은 **`null`**이다. §8.8.4는 「선택 입력, 최대 100자」를 규정하는데
 * §8.8.3 요소 표에도 MD-03에도 **입력란이 없다** — 없는 UI의 값을 지어내지 않는다(§2.3-A).
 */
export async function rejectRequest(actor: Actor, request: PendingRequest): Promise<WriteResult> {
  const batch = writeBatch(db)
  const now = serverTimestamp()

  batch.update(doc(db, 'users', request.uid), {
    status: 'rejected',
    rejectReason: null,
    updatedAt: now,
  })
  batch.update(doc(db, 'approvalRequests', request.id), {
    status: 'rejected',
    decidedBy: actor.uid,
    decidedAt: now,
  })
  appendAudit(
    batch,
    actor,
    'USER_REJECT',
    'users',
    request.uid,
    { status: 'pending' },
    { status: 'rejected' },
  )

  try {
    await batch.commit()
  } catch (error: unknown) {
    return { ok: false, code: errorCode(error, 'firestore/reject-failed') }
  }
  return { ok: true }
}

export type ReissueResult = { ok: true; codeId: string } | { ok: false; code: string }

/**
 * OP-10 코드 재발급 — **배치 4연산**(기존 코드가 없으면 3연산).
 *
 * 🔴 **문서 ID = 코드 문자열**이고 `code` 필드도 같은 값이다(W-08 §0.2 안 1 ·
 * Rules가 `data.code == codeId`를 강제한다 — `database_ToDo/W-08.md` §2-1).
 *
 * 🔴 **기존 코드가 없으면 만료 단계를 건너뛴다**(§2.3-B). 첫 코드를 앱에서 만드는 경로다.
 *
 * BR-11 — 부서에 `isActive: true` 코드는 최대 1개다. 그 불변식을 **같은 배치**가 지킨다:
 * 기존 코드를 끄는 연산과 새 코드를 켜는 연산이 함께 커밋되거나 함께 실패한다.
 */
export async function reissueInviteCode(
  actor: Actor,
  currentCodeId: string | null,
): Promise<ReissueResult> {
  const codeId = generateInviteCode()
  const batch = writeBatch(db)
  const now = serverTimestamp()

  if (currentCodeId) {
    /* BR-12 — 같은 트랜잭션에서 즉시 만료. */
    batch.update(doc(db, ...INVITE_CODES, currentCodeId), {
      isActive: false,
      revokedAt: now,
    })
  }

  /* §9.3.3 전 필드 8종. `expiresAt`은 클라이언트 시계 + 14일이다 —
     `issuedAt`이 서버 센티널이라 클라이언트가 그 값에 더할 수 없다. 14일 창에서
     기기 시계 오차는 무의미하다(BR-13). */
  batch.set(doc(db, ...INVITE_CODES, codeId), {
    code: codeId,
    issuedBy: actor.uid,
    issuedAt: now,
    expiresAt: Timestamp.fromDate(new Date(Date.now() + CODE_TTL_MS)),
    isActive: true,
    revokedAt: null,
    useCount: 0,
    maxUses: MAX_USES,
  })

  batch.update(doc(db, 'departments', DEPARTMENT_ID), {
    activeInviteCodeId: codeId,
    updatedAt: now,
  })

  appendAudit(
    batch,
    actor,
    'CODE_ISSUE',
    'inviteCodes',
    codeId,
    currentCodeId ? { activeInviteCodeId: currentCodeId } : null,
    { activeInviteCodeId: codeId },
  )

  try {
    await batch.commit()
  } catch (error: unknown) {
    return { ok: false, code: errorCode(error, 'firestore/reissue-failed') }
  }
  clearAdminCache()
  return { ok: true, codeId }
}

/**
 * OP-11 E-3003 — 화면이 이 코드로 §8.8.4의 `양도할 수 없는 계정입니다`를 고른다.
 * 통신 실패와 **대상 부적격**은 사용자가 할 수 있는 일이 다르므로 코드로 갈라 둔다.
 */
export const CODE_INELIGIBLE_TARGET = 'admin/ineligible-target'

/**
 * OP-11 부장 권한 양도 — **배치 4연산**(현 부장 문서가 없으면 3연산).
 *
 * 🔴 **이 앱에서 유일하게 되돌릴 수 없는 조작이다.** 넘긴 사람은 그것을 되돌릴 권한이 없다.
 * 빗장(호출부 `lockRef`) · 확인 모달(MD-02) · 대상 검증(여기) 세 겹을 전부 지킨다.
 *
 * 🔴 **강등 대상은 「본인」이 아니라 `departments/{id}.headUid`가 가리키는 사람이다.**
 * R-02·BR-19의 문언은 「본인 → member」지만 그것은 실행자가 `head`인 경우만 참이다 —
 * §4.1이 Dev에게 전 기능 접근을 주므로(결정 2) Dev도 양도할 수 있고, 그때 강등 대상은
 * 본인이 아니다. `headUid`를 읽으면 두 경로가 **한 형태**가 된다. §7 신규 항목이다.
 *
 * **커밋 전 확인**(W-15A §4-2 — `batch.update`는 대상 문서가 없으면 배치 전체를 실패시킨다)
 * 1. 대상 문서: 존재 · `status === 'active'` · `role ∈ {member, vice}` (BR-20)
 * 2. 대상이 본인이면 거부 (BR-21 — 부장은 자기 역할을 직접 바꿀 수 없다)
 * 3. 현 부장 문서: 없거나 `role !== 'head'`면 **그 연산만 빼고 승격 3연산으로 진행**한다.
 *    🔴 BR-23의 「부장 0명」 복구 경로가 실제로 그 상태이고, 그 상태에서 양도가 막히면
 *    복구할 방법이 없어진다.
 *
 * 🔴 **클라이언트 배치는 「부장 정확히 1명」(BR-18)을 보장하지 못한다.** 네 연산이
 * 원자적으로 함께 적용될 뿐, 같은 순간 다른 부장·Dev가 다른 사람에게 양도하는 경쟁은
 * 막지 못한다. 실질 보장은 Rules(§9.6 필수 조건 3)와 BR-23의 Dev 복구 경로다 —
 * `database_ToDo/W-15B.md` §4가 규칙 회차로 넘긴다.
 */
export async function transferHead(actor: Actor, target: Member): Promise<WriteResult> {
  /* BR-21 — 본인은 대상이 될 수 없다. 목록에서 본인 행의 pill을 빼는 것만으로는 부족하다. */
  if (!target.uid || target.uid === actor.uid) {
    return { ok: false, code: CODE_INELIGIBLE_TARGET }
  }

  let currentHeadUid: string | null = null
  let demoteHead = false
  try {
    const targetSnap = await getDoc(doc(db, 'users', target.uid))
    const targetData = targetSnap.data() as { role?: string; status?: string } | undefined
    /* 🔴 목록을 그린 뒤 대상이 탈퇴했을 수 있다. 실제 문서를 다시 본다. */
    if (
      !targetSnap.exists() ||
      targetData?.status !== 'active' ||
      !isTransferTarget({ role: targetData?.role ?? '' })
    ) {
      return { ok: false, code: CODE_INELIGIBLE_TARGET }
    }

    const deptSnap = await getDoc(doc(db, 'departments', DEPARTMENT_ID))
    currentHeadUid =
      (deptSnap.data() as { headUid?: string | null } | undefined)?.headUid ?? null

    if (currentHeadUid && currentHeadUid !== target.uid) {
      const headSnap = await getDoc(doc(db, 'users', currentHeadUid))
      /* BR-23 복구 경로 — 문서가 없거나 이미 `head`가 아니면 강등할 것이 없다. */
      demoteHead =
        headSnap.exists() && (headSnap.data() as { role?: string } | undefined)?.role === 'head'
    }
  } catch (error: unknown) {
    /* 🔴 읽기 실패를 「강등 대상 없음」으로 읽지 마라 — 부장이 2명이 된다.
       `unavailable`이면 어차피 커밋도 resolve되지 않는다(W-15A §4-7). */
    return { ok: false, code: errorCode(error, 'firestore/transfer-precheck-failed') }
  }

  const batch = writeBatch(db)
  const now = serverTimestamp()

  batch.update(doc(db, 'users', target.uid), { role: 'head', updatedAt: now })
  if (demoteHead && currentHeadUid) {
    batch.update(doc(db, 'users', currentHeadUid), { role: 'member', updatedAt: now })
  }
  batch.update(doc(db, 'departments', DEPARTMENT_ID), {
    headUid: target.uid,
    updatedAt: now,
  })

  /* 🔴 `before`/`after`에 이름·이메일을 담지 않는다(W-15A §4-9의 규율).
     누가 누구에게 넘겼는지는 `actorUid`와 `targetId`(uid)로 역추적한다.
     `actorRole`이 `dev`면 그대로 기록된다 — §4.1 · US-D-01 AC-2가 요구하는 바다. */
  appendAudit(
    batch,
    actor,
    'HEAD_TRANSFER',
    'users',
    target.uid,
    { headUid: currentHeadUid },
    { headUid: target.uid },
  )

  try {
    await batch.commit()
  } catch (error: unknown) {
    return { ok: false, code: errorCode(error, 'firestore/transfer-failed') }
  }
  /* 두 계정의 역할이 바뀌었으므로 목록 캐시가 곧 거짓이다(`reissueInviteCode` 선례). */
  clearAdminCache()
  return { ok: true }
}
