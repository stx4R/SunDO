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

/** 🔴 다섯 번째 캐시다. `clearHomeCache`·`clearRosterCache`·`clearRecordsCache`·`clearDutyCache`를 부르지 마라. */
export function clearAdminCache(): void {
  codeCache = null
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

type AuditAction = 'USER_APPROVE' | 'USER_REJECT' | 'CODE_ISSUE'

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
