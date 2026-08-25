import {
  collection,
  disableNetwork,
  doc,
  documentId,
  enableNetwork,
  getCountFromServer,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  Timestamp,
  waitForPendingWrites,
  where,
  writeBatch,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from './firebase'
import { toDateKey, toMonthKey, toWeekKey } from './dateKeys'
import type { Student } from './roster'

/**
 * PRD §9.3.5 `records` · §10.1 중복 규칙 · §11.2 OP-04.
 *
 * **화면은 Firestore를 직접 부르지 않는다.** `lib/stats.ts`가 S3에, `lib/roster.ts`가
 * S4·S5에 대해 갖는 것과 같은 계약이다.
 *
 * 🔴 **이 파일은 `records` 문서 1건만 쓴다.** `users.recordCount` 증가도,
 * `auditLogs`도 붙이지 마라 — §9.6·부록 B의 자기 갱신 허용 키에 `recordCount`가 없고
 * §9.3.8 `action` 목록에 기록 생성이 없다. 지금 넣으면 W-04 임시 catch-all 규칙 덕에
 * 통과하다가 W-15가 §9.6 본편을 배포하는 순간 기록 저장이 통째로 막힌다.
 * 규칙 개정 요청은 `database_ToDo/W-12.md` §3에 올려 두었다.
 */

/** §8.6.3 · §9.3.5 — 값 3종 고정. */
export type ReasonCode = 'DRESS' | 'SLIPPER' | 'ETC'

/** §8.6.3 — 트림 후 2~20자. */
export const REASON_TEXT_MIN = 2
export const REASON_TEXT_MAX = 20

/** §8.10.3 ER-15 · ER-16 · ER-17 — 이 세 개뿐이다. */
export const ER_15 = '기타 사유를 입력해 주세요'
export const ER_16 = '2자 이상 입력해 주세요'
export const ER_17 = '20자를 넘을 수 없습니다'

/**
 * §8.6.3 기타 사유 입력 규칙 — 21번째 글자부터 입력되지 않는다.
 *
 * 🔴 `input`에 직접 닿지 않고 `Field`의 `transform`으로 넘긴다(§7.3 · DS-06).
 * `Field`가 캐럿 복원까지 맡으므로 문자열만 다루면 된다.
 *
 * **여기 두는 이유**: BR-07a의 사유 변경(S7 · W-13)이 같은 2~20자 규칙을 쓴다.
 * `Segmented`와 같은 이유로 화면이 아니라 도메인에 둔다.
 */
export function capReasonText(raw: string, caret: number): { value: string; caret: number } {
  if (raw.length <= REASON_TEXT_MAX) return { value: raw, caret }
  return { value: raw.slice(0, REASON_TEXT_MAX), caret: Math.min(caret, REASON_TEXT_MAX) }
}

/**
 * ER-15 / ER-16 / ER-17. `Field`의 `validate` 계약(통과=`null`)을 그대로 따른다.
 *
 * ⚠ **ER-17은 UI에서 도달하지 않는다.** `capReasonText`가 21번째 글자를 막아
 * 트림 후 길이가 20을 넘을 수 없기 때문이다. 규격이 요구하는 문구라 방어로 남기고
 * 그 사실을 보고서 §2 DoD 12와 §7에 적었다.
 */
export function validateReasonText(v: string): string | null {
  const t = v.trim()
  if (t.length === 0) return ER_15
  if (t.length < REASON_TEXT_MIN) return ER_16
  if (t.length > REASON_TEXT_MAX) return ER_17
  return null
}

/** BR-01 — 30분. */
const DUPLICATE_WINDOW_MS = 30 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000

export interface RecordDraft {
  /** 🔴 시트 1회 오픈당 1개. MD-05 확인 후 저장·재시도에도 **같은 값**이어야 한다(BR-02). */
  clientRecordId: string
  student: Student
  grade: number
  classNo: number
  reasonCode: ReasonCode
  /** `ETC`면 트림된 2~20자, 그 외에는 🔴 **반드시 `null`**(§9.6 필수 조건 5). */
  reasonText: string | null
  /** 시트 **오픈** 시각. 저장 시각이 아니다(EC-15). */
  occurredAt: Date
  academicYear: number
  createdBy: string
  createdByName: string
}

/**
 * 중복 판정 결과.
 *
 * 🔴 `unknown`을 `none`과 뭉개지 마라. 조회가 실패한 것과 「중복이 없다」는 다르다.
 * 호출부는 둘 다 저장을 진행하지만 `unknown`에서는 **MD-05를 띄우지 않는다**(§3.8).
 */
export type DuplicateVerdict =
  | { kind: 'none' }
  /** 같은 사유 · 30분 이내 → 차단(E-2001) */
  | { kind: 'blocked' }
  /** 같은 사유 · 30분 초과 · 같은 날 → MD-05 확인 후 저장(BR-03) */
  | { kind: 'confirm' }
  /** 조회 자체가 실패했다. 저장은 막지 않는다(P-02 > 중복). */
  | { kind: 'unknown'; code: string }

interface StoredRecord {
  reasonCode?: string
  reasonText?: string | null
  status?: string
  occurredAt?: Timestamp
  dateKey?: string
}

function errorCode(error: unknown, fallback: string): string {
  return (error as { code?: string })?.code ?? fallback
}

/**
 * BR-01 · BR-01a · BR-03 · BR-04 — 클라이언트 1차 중복 검사.
 *
 * 🔴 **질의는 등식(`in` 포함)뿐이다.** `orderBy`도 범위 조건도 없다 —
 * 자동 단일 필드 인덱스 병합으로 도는 형태이고, 그래서 **IX-06이 없어도 동작한다**
 * (IX-06은 아직 미생성이다). 인덱스가 없는 상태에서 `orderBy`를 붙이면
 * `failed-precondition`이 떨어지고, W-11 DoD 18의 교훈대로 그 실패를
 * 「중복 없음」으로 읽으면 안 된다.
 *
 * 🔴 **항상 어제+오늘 2일치를 읽는다.** 00:10에 작성하면 30분 창이 전날 23:40까지
 * 걸친다. 분기하지 않는 이유는 등식 `in`이라 비용 차이가 없고 경계 버그가 사라지기
 * 때문이다. 나머지 판정(30분 창·사유·`reasonText`·`status`)은 전부 클라이언트다 —
 * 한 학생의 하루치는 많아야 몇 건이다.
 *
 * §8.6.3의 「30분 초과 + 같은 날 같은 사유 → MD-05」도 **같은 결과 집합으로**
 * 판정된다. 추가 질의는 0회다.
 */
export async function checkDuplicate(
  studentDocId: string,
  reasonCode: ReasonCode,
  reasonText: string | null,
  occurredAt: Date,
): Promise<DuplicateVerdict> {
  const todayKey = toDateKey(occurredAt)
  const yesterdayKey = toDateKey(new Date(occurredAt.getTime() - DAY_MS))

  let docs
  try {
    const snapshot = await getDocs(
      query(
        collection(db, 'records'),
        where('studentDocId', '==', studentDocId),
        where('dateKey', 'in', [yesterdayKey, todayKey]),
      ),
    )
    docs = snapshot.docs.map((snap) => snap.data() as StoredRecord)
  } catch (error: unknown) {
    return { kind: 'unknown', code: errorCode(error, 'firestore/duplicate-check-failed') }
  }

  const wanted = reasonText === null ? null : reasonText.trim()
  let sameDay = false

  for (const record of docs) {
    if (record.status !== 'active') continue
    if (record.reasonCode !== reasonCode) continue
    /* BR-01a — `ETC`는 기입 문구까지 같아야 중복이다. 다르면 별건으로 저장한다. */
    if (reasonCode === 'ETC' && (record.reasonText ?? '').trim() !== wanted) continue

    const at = record.occurredAt?.toDate?.()
    if (!at) continue
    if (Math.abs(occurredAt.getTime() - at.getTime()) <= DUPLICATE_WINDOW_MS) {
      return { kind: 'blocked' }
    }
    if (record.dateKey === todayKey) sameDay = true
  }

  return sameDay ? { kind: 'confirm' } : { kind: 'none' }
}

/** §3.10 문서 형상. 테스트·보고서 대조가 이 함수 하나만 보면 되도록 분리했다. */
export function buildRecordPayload(draft: RecordDraft) {
  return {
    studentDocId: draft.student.id,
    studentNo: draft.student.studentNo,
    /* 작성 시점 스냅샷. 학생 이름이 뒤에 바뀌어도 이 값은 따라가지 않는다. */
    studentName: draft.student.name,
    grade: draft.grade,
    classNo: draft.classNo,
    reasonCode: draft.reasonCode,
    reasonText: draft.reasonText,
    occurredAt: Timestamp.fromDate(draft.occurredAt),
    /* 🔴 화면(S3 카운트)과 같은 함수다. UTC로 만들면 KST 09:00 이전 기록이 전날로 잡힌다. */
    dateKey: toDateKey(draft.occurredAt),
    weekKey: toWeekKey(draft.occurredAt),
    monthKey: toMonthKey(draft.occurredAt),
    academicYear: draft.academicYear,
    createdBy: draft.createdBy,
    createdByName: draft.createdByName,
    createdAt: serverTimestamp(),
    status: 'active',
    /* BR-40 — 오프라인 저장 건 표시. */
    source: navigator.onLine ? 'app' : 'offline',
  }
}

/**
 * OP-04 기록 생성 — **배치 2연산**(`records` create + `users/{본인}.recordCount` +1).
 *
 * 🔴 **W-16에서 1건 → 2연산이 됐다**(`recordCount` A안 ② — 결정 R-a).
 * ①(규칙)과 ②(코드)는 **같은 회차**여야 한다. ②를 먼저 하면 규칙 배포 순간 저장이
 * 통째로 막히고, ③(감소 · v1.1)을 먼저 하면 값이 음수가 된다.
 * 규칙은 `users` 자기 갱신 허용 키에 `recordCount`를 열고 **「+1만」**을 강제한다.
 *
 * ⚠ **`batch.update`는 대상 문서가 없으면 배치 전체를 실패시킨다**(W-15A §4-2).
 * `users/{본인}`은 로그인 상태에서만 이 경로에 도달하므로 **항상 존재한다** —
 * `AuthProvider`가 문서를 읽어 `status === 'active'`를 확인한 뒤에야 S6에 들어온다.
 * 그 전제가 깨지면(문서 삭제) 저장이 조용히 실패한다.
 *
 * 🔴 **`await`하지 않는다. 이 함수는 Promise를 돌려주지 않는다.**
 * 오프라인 지속성이 켜져 있으면(`lib/firebase.ts`의 `persistentLocalCache`)
 * `setDoc`·`batch.commit()`의 Promise는 **서버 확인까지 resolve되지 않는다.** 실측(W-12 §2.3):
 * `disableNetwork()` 뒤 `setDoc` promise는 8,000ms 후에도 pending인데,
 * 같은 문서를 즉시 `getDoc`하면 11ms에 `exists()=true`·`hasPendingWrites=true`로
 * 돌아온다. SDK 원문도 같다 — 「The userCallback is resolved once the write was
 * acked/rejected by the backend」(`@firebase/firestore` `syncEngineWrite` 주석).
 *
 * 기다리면 음영 구간에서 스피너가 영원히 돈다 — W-08에서 실제로 터진 실패다.
 * Firestore가 로컬에 커밋한 시점에 데이터는 이미 안전하고(BR-38), 전송은 SDK가 맡는다.
 *
 * **그래서 서버 거부(규칙 위반·시각 위조)는 이 계층에서 관측되지 않는다.**
 * T-07(저장 실패 → 시트 유지 + 롤백)은 사전 검증 실패에만 적용된다.
 * 조용히 실패하는 오프라인 큐 경로는 W-17이 이어받는다(`database_ToDo/W-12.md` §5).
 */
/* ============================================================================
   전송 대기 큐 (W-20) — BR-40 · BR-41 · NT-07 · EC-01 · EC-02
   ==========================================================================*/

/**
 * 🔴 **Firestore Web SDK는 「대기 중인 쓰기가 몇 건인가」를 노출하지 않는다.**
 * 큐 수준 API는 `waitForPendingWrites()` 하나이고 그것은 **건수를 주지 않는다.**
 * 그래서 두 근거를 합쳐 센다.
 *
 * | 근거 | 세는 것 | 강점 | 한계 |
 * | --- | --- | --- | --- |
 * | 세션 카운터(아래) | 이 세션이 넣은 쓰기 | **필터와 무관하다** | 🔴 앱을 껐다 켜면 0이 된다(EC-02) |
 * | 스냅샷 `hasPendingWrites` | 캐시가 들고 있는 문서 | **재실행 뒤에도 남는다** | S7의 **현재 필터** 안에서만 보인다 |
 *
 * ⇒ 화면은 **둘의 최댓값**을 쓴다(`Records.tsx`). 어느 한쪽만으로는 규격을 못 채운다.
 */
let sessionPending = 0
/** 구독자가 없는 동안 끝난 플러시를 잃지 않기 위한 보관함. S4·S5는 `DockLayout` 밖이다. */
let unreportedFlush = 0
let flushArmed = false
const countWatchers = new Set<(pending: number) => void>()
const flushWatchers = new Set<(flushed: number) => void>()

function notifyCount() {
  for (const fn of countWatchers) fn(sessionPending)
}

/**
 * 🔴 `waitForPendingWrites()`는 **이 클라이언트의 대기 쓰기가 전부 서버에 확인되면**
 * resolve한다. 오프라인이면 계속 pending이므로 「전송 완료」의 정확한 신호가 된다.
 * ⚠ 대기 쓰기가 없으면 **즉시** resolve한다 — 그래서 `flushArmed`로 한 번만 건다.
 */
function armFlushWatch() {
  if (flushArmed) return
  flushArmed = true
  void waitForPendingWrites(db)
    .then(() => {
      const flushed = sessionPending
      sessionPending = 0
      flushArmed = false
      notifyCount()
      if (flushed <= 0) return
      /* 🔴 구독자가 없으면 **버리지 않고 쌓아 둔다.** 오프라인 기록은 S5(반 학생 목록)에서
         작성되는데 그 화면은 `DockLayout` 밖이라 토스트 구독자가 없다 — 버리면
         NT-07이 「가장 필요한 순간에만」 안 뜬다. */
      if (flushWatchers.size === 0) unreportedFlush += flushed
      else for (const fn of flushWatchers) fn(flushed)
    })
    .catch(() => {
      /**
       * 🔴 **로그아웃하면 여기로 온다.** SDK 원문 실측 —
       * `__PRIVATE_rejectOutstandingPendingWritesCallbacks(r, "'waitForPendingWrites' promise
       * is rejected due to a user change.")` (`@firebase/firestore` `common-*.esm.js:25655`).
       *
       * 🔴 **카운터를 되돌리지 않는다.** 쓰기가 사라진 것이 아니라 **그 사용자의 큐로
       * 옮겨 간 것**이다 — 같은 파일의 `__PRIVATE_localStoreHandleUserChange`가 큐를
       * 통째로 갈아 끼우고(`removedBatchIds`/`addedBatchIds`), IndexedDB의 큐는
       * **사용자별로 나뉘어 있다**(`IndexedDbMutationQueue.Kr(user, …)`).
       * ⇒ 그 사용자가 다시 로그인하기 전에는 전송되지 않는다. 보고서 §4-2가 이 사실 위에 선다.
       */
      flushArmed = false
    })
}

/**
 * BR-41 배지 — **건수만** 본다. 구독 즉시 현재 값을 한 번 보낸다.
 *
 * 🔴 **플러시 이벤트와 갈라 둔 이유.** React는 자식 effect를 부모보다 **먼저** 돌린다.
 * 한 통로로 두면 S7(자식)이 `DockLayout`(부모)보다 먼저 구독해 **밀린 플러시를 가로채고**
 * NT-07 토스트가 조용히 사라진다. 통로가 둘이면 그 순서에 의존하지 않는다.
 */
export function watchPendingCount(onChange: (pending: number) => void): () => void {
  countWatchers.add(onChange)
  onChange(sessionPending)
  return () => {
    countWatchers.delete(onChange)
  }
}

/** NT-07 토스트 — **플러시 완료만** 본다. 밀려 있던 것이 있으면 구독 즉시 한 번 준다. */
export function watchPendingFlush(onFlushed: (flushed: number) => void): () => void {
  flushWatchers.add(onFlushed)
  if (unreportedFlush > 0) {
    const missed = unreportedFlush
    unreportedFlush = 0
    onFlushed(missed)
  }
  return () => {
    flushWatchers.delete(onFlushed)
  }
}

/**
 * §8.7.3 #4 「탭 시 즉시 재전송 시도」.
 *
 * ⚠ **SDK에 「지금 보내라」 API가 없다.** 연결을 껐다 켜서 재연결을 강제하는 것이
 * 표준 관용구다. `enableNetwork`만 부르면 이미 켜져 있을 때 아무 일도 하지 않는다.
 * 🔴 **이것은 쓰기를 만들지 않는다** — 큐에 있는 것을 보낼 기회를 줄 뿐이다.
 */
export async function retryPendingWrites(): Promise<void> {
  try {
    await disableNetwork(db)
    await enableNetwork(db)
    armFlushWatch()
  } catch (error: unknown) {
    console.warn('[records] 재전송 시도 실패', errorCode(error, 'unknown'))
  }
}

export function writeRecord(draft: RecordDraft): void {
  const batch = writeBatch(db)
  batch.set(doc(db, 'records', draft.clientRecordId), buildRecordPayload(draft))
  /* 결정 R-a ② — 비정규화 카운터. 규칙이 「+1만」을 강제하므로 임의 값을 넣을 수 없다. */
  batch.update(doc(db, 'users', draft.createdBy), {
    recordCount: increment(1),
    updatedAt: serverTimestamp(),
  })
  /* BR-40·BR-41 — 큐에 들어간 것으로 센다. 🔴 **`commit()`을 기다리지 않는다**는
     계약은 그대로다. 여기서 세는 것은 「보냈다」가 아니라 「로컬에 커밋됐다」이고,
     그 둘이 갈리는 것이 곧 오프라인이다. */
  sessionPending += 1
  notifyCount()
  armFlushWatch()

  /* 🔴 `void` 그대로다 — 호출부가 실수로 기다릴 방법이 없어야 한다(W-12 §5-3). */
  void batch.commit().catch((error: unknown) => {
    /* 사용자에게 보여 줄 곳이 없다. 시트는 이미 닫혔고 재시도는 SDK 소유다.
       삼키되 흔적은 남긴다. */
    console.error('[records] 전송 실패', errorCode(error, 'unknown'), error)
  })
}

/* ============================================================================
   S7 기록 조회 (W-13) — 목록 구독 · 페이지네이션 · 카운터 · 작성자 상태
   ==========================================================================*/

/** §8.7.3 — 단일 선택. `ALL`은 `reasonCode` 조건을 **걸지 않는다**는 뜻이다. */
export type RecordFilter = 'ALL' | ReasonCode

/** §8.7.2 #9 — 30건 단위. 구독(첫 페이지)과 정적 페이지가 같은 값을 쓴다. */
export const RECORD_PAGE_SIZE = 30

/**
 * `documentId() in [...]` 묶음 상한.
 *
 * 🔴 **클라이언트 SDK는 이 개수를 검증하지 않는다**(W-13 §1-3 P3 실측:
 * 31개를 넣어도 `getDocs`가 던지지 않는다). 상한은 서버 규격이므로
 * 넘긴 채로 실기기에 나가면 `invalid-argument`로 터진다. 여기서 잘라 둔다.
 */
const AUTHOR_CHUNK = 30

/**
 * §8.7.2 #7·#8-1·#8-2가 그리는 값 + 「쓰지 않는 5필드」.
 *
 * 🔴 **5필드는 W-12가 만든 문서에 키 자체가 없다**(W-12 §5-4). `?? null`로 읽고
 * `'updatedAt' in data`로 「수정된 적 있음」을 판정하지 마라 — 그렇게 하면
 * W-12가 만든 문서와 v1.1이 수정한 문서가 **다르게 보인다**.
 * 반대로 `reasonText`는 항상 존재하고 `ETC`가 아니면 명시적 `null`이다.
 */
export interface RecordRow {
  id: string
  studentName: string
  studentNo: string
  reasonCode: ReasonCode
  reasonText: string | null
  occurredAt: Date
  /** §3.5 날짜 그룹 · ST-04 카운터 증가 판정. 🔴 `Date` 산술로 다시 만들지 마라. */
  dateKey: string
  weekKey: string
  monthKey: string
  createdBy: string
  createdByName: string
  updatedBy: string | null
  updatedAt: Date | null
  deletedBy: string | null
  deletedAt: Date | null
  deleteReason: string | null
}

/**
 * 무한 스크롤 커서. 화면은 `firebase/firestore`를 import하지 않으므로
 * **불투명 값**으로만 들고 다닌다(§0.3 — `records.ts`가 유일한 통로다).
 */
export type RecordCursor = QueryDocumentSnapshot<DocumentData>

export interface RecordPage {
  rows: RecordRow[]
  /** 이 페이지의 **마지막 문서**. `startAfter`에 그대로 넣는다. */
  cursor: RecordCursor | null
  hasMore: boolean
}

export type RecordPageResult = ({ kind: 'ok' } & RecordPage) | { kind: 'failed'; code: string }

/** 구독 콜백 1회분. `fromCache`가 §3.2 동기화 칩의 유일한 근거다. */
export interface RecordListenSnapshot extends RecordPage {
  fromCache: boolean
  /**
   * W-20 — 이 스냅샷 안에서 아직 서버 확인을 못 받은 문서 수(BR-41의 두 번째 근거).
   * ⚠ **현재 필터 안에서만 보인다.** 필터와 무관한 값은 세션 카운터가 맡는다.
   */
  pendingWrites: number
}

function isReasonCode(v: unknown): v is ReasonCode {
  return v === 'DRESS' || v === 'SLIPPER' || v === 'ETC'
}

interface StoredRecordFull extends StoredRecord {
  studentName?: string
  studentNo?: string
  weekKey?: string
  monthKey?: string
  createdBy?: string
  createdByName?: string
  updatedBy?: string
  updatedAt?: Timestamp
  deletedBy?: string
  deletedAt?: Timestamp
  deleteReason?: string
}

function toRow(snap: QueryDocumentSnapshot<DocumentData>): RecordRow {
  const data = snap.data() as StoredRecordFull
  const occurredAt = data.occurredAt?.toDate?.() ?? new Date(0)
  return {
    id: snap.id,
    studentName: data.studentName ?? '',
    studentNo: data.studentNo ?? '',
    /* §9.6 필수 조건 5가 값 3종을 강제하므로 규칙 배포 후에는 도달하지 않는다.
       그래도 행을 버리지 않는다 — 기록 누락(P-02)이 오분류보다 비싸다. */
    reasonCode: isReasonCode(data.reasonCode) ? data.reasonCode : 'ETC',
    reasonText: data.reasonText ?? null,
    occurredAt,
    /* 저장된 키를 그대로 읽는다. 없으면 **같은 함수로** 만든다 — 화면과 집계가
       다른 규칙으로 키를 만들면 카운트가 영원히 어긋난다(W-10 §1-4). */
    dateKey: data.dateKey ?? toDateKey(occurredAt),
    weekKey: data.weekKey ?? toWeekKey(occurredAt),
    monthKey: data.monthKey ?? toMonthKey(occurredAt),
    createdBy: data.createdBy ?? '',
    createdByName: data.createdByName ?? '',
    /* 🔴 5필드 — 부재를 `null`과 같게 읽는 것이 읽는 쪽의 책임이다(W-12 §5-4). */
    updatedBy: data.updatedBy ?? null,
    updatedAt: data.updatedAt?.toDate?.() ?? null,
    deletedBy: data.deletedBy ?? null,
    deletedAt: data.deletedAt?.toDate?.() ?? null,
    deleteReason: data.deleteReason ?? null,
  }
}

function toPage(docs: QueryDocumentSnapshot<DocumentData>[]): RecordPage {
  return {
    rows: docs.map(toRow),
    cursor: docs.length > 0 ? docs[docs.length - 1] : null,
    hasMore: docs.length === RECORD_PAGE_SIZE,
  }
}

/**
 * OP-05 원문 그대로. **시간 범위 조건을 걸지 않는다** —
 * §8.7.3의 「기본 최근 30일」은 `limit(30)` 페이지네이션이 만족하고,
 * 범위 조건을 걸면 무한 스크롤이 그 경계를 넘지 못한다(지시서 §2.4).
 *
 * 🔴 이 형태가 IX-01(`ALL`)·IX-02(사유 필터)를 요구한다. 둘 다 아직 미생성이라
 * 실기기에서는 `failed-precondition`이 떨어진다 — 그 실패는 **ER-02**이지
 * 「기록 없음」이 아니다(`database_ToDo/W-13.md` §1).
 */
function recordsQuery(academicYear: number, filter: RecordFilter, after: RecordCursor | null) {
  const constraints: QueryConstraint[] = [
    where('academicYear', '==', academicYear),
    where('status', '==', 'active'),
  ]
  if (filter !== 'ALL') constraints.push(where('reasonCode', '==', filter))
  constraints.push(orderBy('occurredAt', 'desc'))
  if (after) constraints.push(startAfter(after))
  constraints.push(limit(RECORD_PAGE_SIZE))
  return query(collection(db, 'records'), ...constraints)
}

/**
 * §3.7 — **구독은 첫 페이지 1개뿐이다.** 과거 페이지는 `fetchRecordPage`의 정적 배열이다.
 *
 * 🔴 `includeMetadataChanges: true`가 **필수다.** 기본값(`false`)에서는
 * `QueryListener.shouldRaiseEvent`가 「문서 변화 0건 + 메타데이터만 변함」을
 * 통째로 버린다 — `syncStateChanged`는 `includeMetadataChanges === true`일 때만
 * 통과한다(SDK 원문, 보고서 §1-3 P4). 기본값으로 두면 캐시 스냅샷 이후
 * `fromCache: true → false` 전환이 **콜백으로 오지 않고** §3.2의 동기화 칩이
 * 영원히 「동기화 지연」에 머문다.
 *
 * 🔴 **반환한 해제 함수를 반드시 호출한다.** 독 이동은 `replace`라 화면이
 * 언마운트되고, 해제하지 않으면 탭을 오갈 때마다 구독이 쌓인다 —
 * 같은 질의에 건 구독 2개가 **둘 다** 콜백을 받는 것을 실측했다(보고서 §1-3 P2).
 */
export function subscribeRecords(
  academicYear: number,
  filter: RecordFilter,
  onData: (snapshot: RecordListenSnapshot) => void,
  onFailed: (code: string) => void,
): () => void {
  return onSnapshot(
    recordsQuery(academicYear, filter, null),
    { includeMetadataChanges: true },
    (snapshot) => {
      onData({
        ...toPage(snapshot.docs),
        fromCache: snapshot.metadata.fromCache,
        pendingWrites: snapshot.docs.filter((d) => d.metadata.hasPendingWrites).length,
      })
    },
    (error: unknown) => {
      /* 🔴 실패를 빈 배열로 흘리지 마라. ER-02이고 EM-02가 아니다(§8.7.2). */
      onFailed(errorCode(error, 'firestore/records-listen-failed'))
    },
  )
}

/**
 * §3.7-2 — `더 보기` 정적 페이지. **구독하지 않는다.**
 *
 * 커서는 호출부가 고정해 둔 **첫 페이지의 마지막 문서**다(§3.7-4). 새 기록이
 * 들어와 첫 페이지가 밀려도 커서가 움직이지 않으므로 구멍이 생기지 않고,
 * 밀려난 문서는 호출부의 ID Map에 이미 남아 있다.
 */
export async function fetchRecordPage(
  academicYear: number,
  filter: RecordFilter,
  after: RecordCursor | null,
): Promise<RecordPageResult> {
  try {
    const snapshot = await getDocs(recordsQuery(academicYear, filter, after))
    return { kind: 'ok', ...toPage(snapshot.docs) }
  } catch (error: unknown) {
    return { kind: 'failed', code: errorCode(error, 'firestore/records-page-failed') }
  }
}

/* --- 카운터 3종 (§12.1 · §12.3) ------------------------------------------ */

export type RecordCountsResult =
  | { kind: 'ok'; today: number; week: number; month: number }
  | { kind: 'failed'; code: string }

/**
 * §12.3 「화면 진입 시 1회 조회 후 세션 내 재사용」. 모듈 수준이다 —
 * S7도 탭을 옮길 때마다 `ScreenTransition`의 `key`가 바뀌어 다시 마운트된다.
 *
 * 🔴 **`stats.ts`의 홈 캐시와 분리한다.** 묶으면 S7의 당겨서 새로고침이
 * 홈 통계·부서·명부 카운트까지 버린다(W-11 §4-5가 `roster.ts`를 가른 이유와 같다).
 */
let countsCache: RecordCountsResult | null = null

/** uid → 탈퇴 여부. **성공한 조회만** 담는다(실패를 「탈퇴 아님」으로 굳히지 않는다). */
const authorWithdrawnCache = new Map<string, boolean>()

/** T-07 당겨서 새로고침. 🔴 `clearHomeCache()`·`clearRosterCache()`와 별개다. */
export function clearRecordsCache(): void {
  countsCache = null
  authorWithdrawnCache.clear()
}

/**
 * §12.1 오늘·이번 주·이번 달 — `getCountFromServer` **3회**.
 *
 * 등식 2개뿐이라 인덱스가 필요 없다(IX-03·IX-04·IX-05가 미생성이어도 돈다 —
 * W-10 실측 W10-1·W10-2 선례). `academicYear`를 붙이지 않는 이유도 같다:
 * 세 키가 특정 일자·주차·월을 가리켜 학년도가 이미 결정되고, 설계된 인덱스에도 없다.
 *
 * 🔴 ST-03 — **사유 필터를 여기에 걸지 마라.** 필터는 목록만 바꾼다.
 */
export async function fetchRecordCounts(now: Date, force = false): Promise<RecordCountsResult> {
  if (!force && countsCache) return countsCache

  const records = collection(db, 'records')
  const active = where('status', '==', 'active')
  try {
    /* 🔴 **W-21C 결함 3.** `getCountFromServer`는 오프라인에서 항상 throw한다(캐시 경로가
       SDK에 없다). 실패하면 `getDocs`로 캐시에서 센다 — 근거는 `lib/roster.ts`의
       `countOrProbe` 위 블록에 있다. 💰 온라인 비용은 그대로 3읽기다. */
    const [today, week, month] = await Promise.all([
      countWithCacheFallback(query(records, active, where('dateKey', '==', toDateKey(now)))),
      countWithCacheFallback(query(records, active, where('weekKey', '==', toWeekKey(now)))),
      countWithCacheFallback(query(records, active, where('monthKey', '==', toMonthKey(now)))),
    ])
    /* 🔴 하나라도 모르면 셋 다 `-`다(§8.7.5 에러 행). 반쪽을 0으로 그리지 않는다. */
    if (today === null || week === null || month === null) {
      return { kind: 'failed', code: 'firestore/record-counts-offline' }
    }
    countsCache = { kind: 'ok', today, week, month }
  } catch (error: unknown) {
    /* 실패는 캐시하지 않는다. 다음 진입에서 다시 시도해야 한다. */
    return { kind: 'failed', code: errorCode(error, 'firestore/record-counts-failed') }
  }
  return countsCache
}

/**
 * `stats.ts`의 같은 이름 함수와 **같은 문장**이다.
 *
 * 🔴 **한 곳으로 합치지 않았다.** `records.ts`가 `stats.ts`를 import하면 S3의 부서·명부
 * 캐시가 S6·S7 청크로 끌려 들어오고, 반대로도 같다 — 세 `lib`을 가른 이유가 정확히
 * 그 캐시 수명이다(W-11 §4-5 · W-13 §4-3). **11줄을 복제하는 편이 싸다.**
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

/* --- 작성자 탈퇴 상태 (BR-58 · §8.7.2 #8-2) ------------------------------- */

/**
 * 🔴 **목록 30건에 질의 30회를 내지 않는다.** uid를 중복 제거해
 * `documentId() in [...]` **묶음**으로 읽는다. 상한(30)을 넘으면 청크로 나눈다.
 *
 * ⚠ §9.6은 부원에게 `users`의 이름·역할만 노출한다. **여기서 읽는 값은 `status`
 * 하나뿐이고** 이메일 등 다른 필드는 화면으로 나가지 않는다.
 *
 * 🔴 **조회 실패는 「탈퇴 아님」쪽으로 떨어진다.** 반대로 하면 멀쩡한 부원에게
 * 취소선이 붙는다 — 실패를 캐시하지도 않는다(다음 조회에서 다시 시도한다).
 */
export async function fetchWithdrawnAuthors(
  uids: readonly string[],
): Promise<ReadonlySet<string>> {
  const missing = [...new Set(uids)].filter((uid) => uid !== '' && !authorWithdrawnCache.has(uid))

  for (let i = 0; i < missing.length; i += AUTHOR_CHUNK) {
    const chunk = missing.slice(i, i + AUTHOR_CHUNK)
    try {
      const snapshot = await getDocs(
        query(collection(db, 'users'), where(documentId(), 'in', chunk)),
      )
      const seen = new Set<string>()
      for (const snap of snapshot.docs) {
        seen.add(snap.id)
        authorWithdrawnCache.set(
          snap.id,
          (snap.data() as { status?: string }).status === 'withdrawn',
        )
      }
      /* 문서가 없는 uid도 「탈퇴 아님」으로 굳힌다 — 없는 계정에 취소선을 긋지 않는다. */
      for (const uid of chunk) if (!seen.has(uid)) authorWithdrawnCache.set(uid, false)
    } catch (error: unknown) {
      console.warn('[records] 작성자 상태 조회 실패', errorCode(error, 'unknown'))
      /* 삼킨다. 캐시에 아무것도 넣지 않으므로 이 uid들은 취소선 없이 그려진다. */
    }
  }

  const withdrawn = new Set<string>()
  for (const uid of new Set(uids)) if (authorWithdrawnCache.get(uid) === true) withdrawn.add(uid)
  return withdrawn
}

/* ============================================================================
   S7 기록 수정·삭제 (W-21B 기능 9) — §8.7.4 T-04~T-06 · §10.2 · design `18b`~`18d`
   ==========================================================================*/

/**
 * 🔴 **`admin.ts`의 `Actor`를 import하지 않는다.** 구조가 같아 값은 그대로 통하지만,
 * import하면 S8 전용 모듈(`fetchMembers`·`subscribePendingRequests`·양도 배치)이
 * S7 청크로 끌려 들어온다. 타입이 겹치는 것과 모듈이 겹치는 것은 다른 문제다.
 */
export interface RecordActor {
  uid: string
  name: string
  role: string
  status: string
}

export type RecordWriteResult = { ok: true } | { ok: false; code: string }

/** §9.3.8 `action` 유니온에서 **이번 회차가 소비자를 만드는 두 값**(W-20 §2.1② 해소). */
type RecordAuditAction = 'RECORD_UPDATE' | 'RECORD_DELETE'

/** BR-06 승계분. 🔴 `member`는 여기 없다 — 본인 기록은 아래 소유자 절이 연다. */
const EDITOR_ROLES = new Set(['vice', 'head', 'dev'])

/**
 * 🔴 **`firestore.rules`의 `canEditRecord()`와 같은 문장이다.**
 *
 * ```
 * isActive() && (resource.data.createdBy == request.auth.uid || isVice())
 * ```
 *
 * 한쪽만 고치면 화면이 규칙보다 넓어져 「눌렀는데 실패」가 되거나, 좁아져
 * 「할 수 있는데 안 보임」이 된다 — W-17F 결함 1이 정확히 그 형태였다.
 * **둘을 함께 고쳐라.** 규칙 쪽 근거와 PRD BR-05 충돌은 그 파일 주석에 있다.
 */
export function canEditRecord(
  actor: RecordActor | null,
  row: Pick<RecordRow, 'createdBy'>,
): boolean {
  if (!actor || actor.status !== 'active') return false
  return row.createdBy === actor.uid || EDITOR_ROLES.has(actor.role)
}

/**
 * §9.3.8 감사 로그 1건을 배치에 **넣기만** 한다(`admin.ts`의 `appendAudit`과 같은 계약).
 *
 * 🔴 **`before`/`after`에 학생 이름·학번을 담지 마라**(W-18 §2.1① · §14.3 익명화와 양립).
 * 누구의 기록인지는 `targetId`(= 문서 ID)로 역추적한다.
 *
 * ⚠ `reasonText`는 담는다 — BR-07b가 「정정 이력은 `before`/`after`와 함께 남긴다」로
 * **명시**한다. 정정 전 문구가 감사 로그에 영구 보존된다는 뜻이고(감사 로그는 수정·삭제
 * 전면 금지), 그것이 BR-07b가 원하는 바다. 학생을 특정하는 값은 여전히 들어가지 않는다.
 */
function appendRecordAudit(
  batch: ReturnType<typeof writeBatch>,
  actor: RecordActor,
  action: RecordAuditAction,
  recordId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): void {
  batch.set(doc(db, 'auditLogs', crypto.randomUUID()), {
    actorUid: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    targetType: 'records',
    targetId: recordId,
    before,
    after,
    createdAt: serverTimestamp(),
  })
}

/**
 * T-06 사유 변경 — **배치 2연산**(`records` update + `auditLogs` create).
 *
 * 🔴 **BR-09를 보장하는 것은 배치의 원자성이다.** 「감사 로그 생성 실패 시 수정도 실패
 * 처리한다」를 규칙은 표현할 수 없다(형제 연산을 못 본다 — Q-2). 한 연산이라도 거부되면
 * 남는 문서가 **0/2**라는 Q-3 실측이 그 자리를 대신한다. B-24가 그것을 잠근다.
 *
 * 🔴 **BR-07a — `ETC`가 아니면 `reasonText`는 `null`이다.** 호출부가 트림해 넘기고
 * 여기서 다시 판정하지 않는다. 규칙의 `validReason()`이 마지막 관문이다.
 *
 * 🔴 **`writeRecord`와 달리 `await`한다.** S6의 「기다리면 스피너가 영원히 돈다」는
 * **오프라인 저장을 허용하기 때문에** 성립하는 계약이다(W-12 §2.3). S7의 수정·삭제는
 * 오프라인에서 **진입 자체를 막으므로**(§8.7.5 · `Records.tsx`) 같은 함정에 걸리지 않고,
 * 결과를 알아야 토스트·목록 갱신을 가를 수 있다. `admin.ts`의 배치 4종과 같은 형태다.
 */
export async function updateRecordReason(
  actor: RecordActor,
  row: RecordRow,
  reasonCode: ReasonCode,
  reasonText: string | null,
): Promise<RecordWriteResult> {
  const batch = writeBatch(db)
  const now = serverTimestamp()

  /* 🔴 **규칙의 허용 키 4개와 정확히 같다**(`editsReasonOnly`). 하나라도 더 쓰면
     `hasOnly`에 걸려 배치가 통째로 죽는다 — `account.ts`의 탈퇴 3키와 같은 규율이다. */
  batch.update(doc(db, 'records', row.id), {
    reasonCode,
    reasonText,
    updatedBy: actor.uid,
    updatedAt: now,
  })

  appendRecordAudit(
    batch,
    actor,
    'RECORD_UPDATE',
    row.id,
    { reasonCode: row.reasonCode, reasonText: row.reasonText },
    { reasonCode, reasonText },
  )

  try {
    await batch.commit()
  } catch (error: unknown) {
    return { ok: false, code: errorCode(error, 'firestore/record-update-failed') }
  }
  return { ok: true }
}

/**
 * T-05 소프트 삭제 — **배치 2연산**. BR-08: 문서를 지우지 않는다.
 *
 * S7 목록 질의가 `status == 'active'`이므로 삭제된 문서는 **질의에서 저절로 빠진다**
 * (W-13). 🔴 다만 화면의 병합 Map은 **합집합**이라 스스로 지워지지 않는다 —
 * 목록에서 빼는 것은 호출부의 몫이다(`Records.tsx`의 `dropRow`).
 *
 * 🔴 **`users.recordCount`를 감소시키지 않는다.**
 * ① 삭제자가 작성자가 아닐 수 있는데(차장이 부원 기록을 지운다) 규칙의 자기 갱신
 *    경로(`selfSync`)는 **본인 문서만** 연다. 남의 카운터를 내리려면 「남의 카운터를
 *    임의로 바꾸는 문」을 새로 열어야 한다 — B-30이 그것을 실측으로 보여 준다.
 * ② 본인이 지우는 경우도 규칙이 「+1만」이라 −1이 거부된다(RC-3 · B-31).
 * ③ 화면에 `recordCount`를 그리는 자리가 **0곳**이다(소비자 조사 — 보고서 §6).
 * ⇒ `recordCount`는 「작성 횟수」이지 「현재 유효 기록 수」가 아니다. W-16 §7의 v1.1
 *   예약을 이 회차가 **닫지 않는다**. 근거는 보고서 §6에 있다.
 */
export async function deleteRecord(
  actor: RecordActor,
  row: RecordRow,
): Promise<RecordWriteResult> {
  const batch = writeBatch(db)
  const now = serverTimestamp()

  /* 🔴 규칙의 허용 키 3개와 정확히 같다(`softDeletesRecord`).
     ⚠ `updatedAt`을 **쓰지 않는다** — §9.3.5가 그 쌍을 「사유 변경 시 기록」으로
     규정하고, 규칙의 허용 키에도 없어 쓰면 배치가 죽는다. */
  batch.update(doc(db, 'records', row.id), {
    status: 'deleted',
    deletedBy: actor.uid,
    deletedAt: now,
  })

  appendRecordAudit(
    batch,
    actor,
    'RECORD_DELETE',
    row.id,
    { status: 'active', reasonCode: row.reasonCode },
    { status: 'deleted' },
  )

  try {
    await batch.commit()
  } catch (error: unknown) {
    return { ok: false, code: errorCode(error, 'firestore/record-delete-failed') }
  }
  return { ok: true }
}
