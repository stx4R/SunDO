import { doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore'
import { clearAdminCache, type Actor, type WriteResult } from './admin'
import { clearDutyCache } from './duty'
import { db } from './firebase'
import { clearRecordsCache } from './records'
import { clearRosterCache } from './roster'
import { clearHomeCache } from './stats'

/**
 * S10 설정의 쓰기 경로 — PRD §8.11 · §9.3.1 · §10.10 BR-56·BR-57 · §11.2 · §14.3.
 *
 * 🔴 **S10은 실규칙 위에서 만들어지는 첫 화면이다.** W-16D가 `firestore.rules`를
 * 배포했고(`2026-08-24T00:36:15Z`) W-04 임시 catch-all은 사라졌다. 여기서 쓰기가
 * 거부되면 사고가 아니라 **규칙이 일하고 있다는 신호**다 — 규칙이 아니라 이 파일을 고친다.
 *
 * 🔴 **`selfWithdraw()`가 허용하는 키는 정확히 3개다**(`firestore.rules`):
 *
 * ```
 * resource.data.status == 'active'
 * resource.data.role != 'head'                                   // BR-56 · R-07
 * request.resource.data.status == 'withdrawn'
 * affectedKeys().hasOnly(['status', 'withdrawnAt', 'updatedAt'])
 * ```
 *
 * 하나라도 더 쓰면 **탈퇴가 통째로 거부된다**(`SEC-9c`). `recordCount`·`name`·
 * `anonymizedAt`을 같이 쓰지 마라 — 특히 `recordCount`는 탈퇴해도 보존돼야 한다(C7).
 */

/**
 * §9.3.8 `action`에 **이번 회차가 더하는 값**.
 *
 * 🔴 **발명이 아니다** — BR-57이 이미 `auditLogs(USER_WITHDRAW)`라는 이름을 주고 있는데
 * §9.3.8의 유니온(10종)에 그것이 빠져 있다. **PRD 내부 두 조항이 어긋난 상태**이고
 * 이 상수는 그 누락을 보정한다. 어긋남 자체는 보고서 §7에 올렸다.
 *
 * ⚠ `firestore.rules`의 `auditLogs` create는 `actorUid == request.auth.uid`만 검사하고
 * **`action`을 보지 않는다.** 그래서 이 값을 더하는 데 **규칙 재배포가 필요 없다**
 * (실측: `firestore.rules` diff 0줄로 탈퇴 배치가 통과한다).
 */
const ACTION_WITHDRAW = 'USER_WITHDRAW'

/**
 * OP — 계정 탈퇴. 🔴 **배치 2연산이다**(`users` update + `auditLogs` create).
 *
 * BR-57은 배치를 **4연산**으로 규정하지만 나머지 둘은 실행할 수 없다.
 *
 * | BR-57 구성원 | 판정 |
 * | --- | --- |
 * | `users` 3키 update | ✅ |
 * | `auditLogs(USER_WITHDRAW)` | ✅ (위 주석) |
 * | 🔴 `departments.memberCount` 감소 | **넣지 않는다** — `departments` update가 `isHead()`인데
 *   탈퇴하는 본인은 `head`가 아니다. 넣으면 그 연산이 거부되고 **배치 전체가 죽는다**
 *   (`reports/W-16.md` §2.3 Q-3 실측 — 3연산 중 1개가 거부되면 남은 문서 0/2).
 *   게다가 W-16D 실측으로 `memberCount`는 **아무도 읽지 않는 죽은 필드**임이 확정됐다 |
 *
 * 🔴 **감사 로그에 이름·이메일을 담지 않는다.** `before`/`after`는 상태 전이 요약뿐이고
 * 누구인지는 `targetId`(uid)로 역추적한다. `admin.ts`의 `HEAD_TRANSFER`가
 * `{ headUid }`만 담은 것과 같은 규율이다(W-15A §4-9). 🔴 **이 규율이 §14.3 익명화(v1.2)와
 * 양립하는 근거다** — 익명화가 `users`의 `name`·`email`을 덮어도 이 로그는 uid만 갖는다.
 * 그리고 §9.6이 `auditLogs` 수정·삭제를 전면 금지하므로 **익명화를 넘어 살아남는 유일한 기록**이다.
 *
 * 🔴 **`await`하지 않는다. Promise를 돌려주지 않는다.**
 * `records.ts`의 `writeRecord`와 같은 형태다 — 오프라인 지속성(`persistentLocalCache`)이
 * 켜져 있으면 `batch.commit()`의 Promise는 **서버 확인까지 resolve되지 않는다**
 * (W-12 §2.3 실측: `disableNetwork()` 뒤 8,000ms 후에도 pending).
 *
 * ⚠ **호출부는 이 함수 직후 `signOut`을 부른다.** 두 계약이 처음 만나는 자리다 —
 * 화면이 §8.11.5대로 **오프라인에서 탈퇴 버튼을 비활성**으로 두므로 「큐에 넣고 로그아웃」
 * 조합은 설계상 생기지 않는다. 온라인 경로의 실측 결과는 보고서 §4에 있다.
 *
 * ⚠ **`update`는 대상 문서가 없으면 배치 전체를 실패시킨다**(W-15A §4-2).
 * `users/{본인}`은 `AuthProvider`가 문서를 읽어 `status === 'active'`를 확인한 뒤에야
 * S10에 들어오므로 **항상 존재한다.** 그 전제가 깨지면(문서 삭제) 탈퇴가 조용히 실패한다.
 */
export function withdrawAccount(actor: Actor): void {
  const batch = writeBatch(db)
  const now = serverTimestamp()

  /* 🔴 정확히 3개. 늘리지 마라 — `selfWithdraw()`의 `hasOnly`가 배치를 통째로 거부한다. */
  batch.update(doc(db, 'users', actor.uid), {
    status: 'withdrawn',
    withdrawnAt: now,
    updatedAt: now,
  })

  /* 문서 ID는 `crypto.randomUUID()` — `admin.ts`의 `appendAudit`과 같은 선례다.
     재시도해도 배치가 통째로 다시 도므로 멱등키가 아니라 충돌 없는 새 ID면 된다. */
  batch.set(doc(db, 'auditLogs', crypto.randomUUID()), {
    actorUid: actor.uid,
    /* §9.3.8이 `actorName`·`actorRole`을 **필수**로 규정한다. 행위자 스냅샷이라
       `before`/`after`의 「개인정보를 담지 마라」와 층이 다르다. */
    actorName: actor.name,
    actorRole: actor.role,
    action: ACTION_WITHDRAW,
    targetType: 'users',
    targetId: actor.uid,
    before: { status: 'active' },
    after: { status: 'withdrawn' },
    createdAt: serverTimestamp(),
  })

  void batch.commit().catch((error: unknown) => {
    /* 시트가 아니라 화면이 통째로 사라진 뒤라 사용자에게 보여 줄 곳이 없다.
       삼키되 흔적은 남긴다 — `records.ts`와 같은 처리다. */
    console.error('[account] 탈퇴 전송 실패', (error as { code?: string })?.code ?? 'unknown', error)
  })
}

/**
 * §8.11.4 T-03 — 알림 토글. `users.notificationPrefs` **저장만** 한다.
 *
 * ⚠ **Web Push 발송은 v1.1이다**(§13.1 · D-12). MVP는 값만 보관한다.
 *
 * 🔴 `selfSync()`의 허용 키에 `notificationPrefs`·`updatedAt`이 **둘 다 있다**
 * (`firestore.rules`). 다른 키를 함께 쓰면 `hasOnly`에 걸린다.
 *
 * 여기서는 `await`한다 — T-03이 「실패 시 원복」을 요구하므로 결과를 알아야 한다.
 * 화면이 §8.11.5대로 오프라인에서 토글을 잠그므로 「resolve되지 않는 Promise」는
 * 설계상 도달하지 않는다.
 */
export async function saveNotificationPrefs(
  uid: string,
  prefs: { duty: boolean; approval: boolean },
): Promise<WriteResult> {
  try {
    await updateDoc(doc(db, 'users', uid), {
      notificationPrefs: prefs,
      updatedAt: serverTimestamp(),
    })
    return { ok: true }
  } catch (error: unknown) {
    return { ok: false, code: (error as { code?: string })?.code ?? 'firestore/prefs-failed' }
  }
}

/**
 * §8.11.4 T-05 `데이터 새로고침` — 세션 캐시 **전량** 무효화.
 *
 * 🔴 **여섯 번째 `clear*Cache`가 아니다.** 이 함수는 자기 캐시를 갖지 않는다 —
 * 기존 **5종**(`admin`·`duty`·`records`·`roster`·`stats`)을 부르기만 하는 집합자다
 * (W-15B §3.10이 금지한 것은 「새 캐시를 하나 더 만드는 것」이다).
 *
 * ⚠ **새 캐시 모듈이 생기면 여기에 한 줄을 더해야 한다.** 빠뜨리면 「새로고침했는데
 * 옛 데이터가 남는」 상태가 조용히 만들어진다. 그 사실을 잊지 않도록 5종을 한 곳에 모았다.
 */
export function refreshSessionCaches(): void {
  clearAdminCache()
  clearDutyCache()
  clearRecordsCache()
  clearRosterCache()
  clearHomeCache()
}
