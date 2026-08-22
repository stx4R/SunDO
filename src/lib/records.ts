import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
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
 * OP-04 기록 생성 — `setDoc(records/{clientRecordId}, payload)` **1건**.
 *
 * 🔴 **`await`하지 않는다. 이 함수는 Promise를 돌려주지 않는다.**
 * 오프라인 지속성이 켜져 있으면(`lib/firebase.ts`의 `persistentLocalCache`)
 * `setDoc`의 Promise는 **서버 확인까지 resolve되지 않는다.** 실측(W-12 §2.3):
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
export function writeRecord(draft: RecordDraft): void {
  void setDoc(doc(db, 'records', draft.clientRecordId), buildRecordPayload(draft)).catch(
    (error: unknown) => {
      /* 사용자에게 보여 줄 곳이 없다. 시트는 이미 닫혔고 재시도는 SDK 소유다.
         삼키되 흔적은 남긴다. */
      console.error('[records] 전송 실패', errorCode(error, 'unknown'), error)
    },
  )
}
