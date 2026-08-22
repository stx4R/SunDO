/**
 * PRD §9.3.5 `dateKey`·`weekKey` + BR-44·BR-45·BR-46 + DR-06.
 *
 * **순수 함수다.** DOM·Firestore·React를 참조하지 않는다(`lib/inviteCode.ts`와 같은 성격).
 *
 * BR-44 — 앱의 모든 일자·주차 경계는 **KST 기준**이고 기기 시간대 설정과 무관하다.
 * 그래서 `getFullYear()` 같은 로컬 접근자를 쓰지 않는다. UTC로 +9시간 민 뒤
 * **UTC 접근자로 읽는다** — 그 값이 곧 KST 벽시계다. 의존성 0으로 끝난다.
 */

/** KST = UTC+9. 대한민국은 서머타임을 쓰지 않으므로 고정 오프셋이 정확하다. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000

/** 인자를 KST 벽시계로 민 `Date`. 이후 **UTC 접근자로만** 읽어야 한다. */
function toKst(d: Date): Date {
  return new Date(d.getTime() + KST_OFFSET_MS)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * KST `YYYY-MM-DD` (§9.3.5 · BR-45 — 하루 경계는 00:00:00~23:59:59.999).
 */
export function toDateKey(d: Date): string {
  const k = toKst(d)
  return `${k.getUTCFullYear()}-${pad2(k.getUTCMonth() + 1)}-${pad2(k.getUTCDate())}`
}

/**
 * KST `YYYY-MM` (§9.3.5 `monthKey` · DR-05 · §12.1 「이번 달」 카운터).
 *
 * `toDateKey`와 **같은 `toKst()`를 통과한다.** 월 경계를 따로 계산하지 않는 것이
 * 핵심이다 — 세 함수가 서로 다른 경로로 KST를 구하면 자정 전후에 세 키가
 * 서로 다른 날을 가리킬 수 있다(W-12 지시서 §3.9).
 */
export function toMonthKey(d: Date): string {
  const k = toKst(d)
  return `${k.getUTCFullYear()}-${pad2(k.getUTCMonth() + 1)}`
}

/** KST 요일 표기. `getUTCDay()`는 `toKst()` 이후이므로 KST 요일이다. */
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const

/**
 * BR-47 화면 표기 형식 `{M}월 {D}일 ({요일}) {HH}:{mm}` (S6 일시 행 · §8.6.2 #10).
 *
 * **여기 두는 이유**: 같은 `toKst()`를 쓰기 위해서다. 화면 쪽에 따로 만들면
 * KST 변환이 네 벌째가 되고, 그 순간 표시된 일시와 저장된 `dateKey`가
 * 자정 전후에 갈릴 수 있다. `toKst`를 export해 밖에서 쓰게 하는 쪽은
 * 「이후 UTC 접근자로만 읽어야 한다」는 제약이 호출부로 새어 나가 더 위험하다.
 */
export function formatDateTimeKst(d: Date): string {
  const k = toKst(d)
  const month = k.getUTCMonth() + 1
  const date = k.getUTCDate()
  const weekday = WEEKDAY_KO[k.getUTCDay()]
  return `${month}월 ${date}일 (${weekday}) ${pad2(k.getUTCHours())}:${pad2(k.getUTCMinutes())}`
}

/**
 * KST ISO-8601 주차 `YYYY-Www` (DR-06 · BR-46 — **월요일 시작**).
 *
 * ISO 주차의 정의는 「그 주의 **목요일**이 속한 해가 주차연도」다. 그래서 연말·연초에
 * 주차연도와 달력연도가 갈린다 — 12월 29~31일이 다음 해 `W01`이 되거나, 1월 1~3일이
 * 전년도 `W52`/`W53`이 된다. **`getUTCFullYear()`를 그대로 쓰면 그 두 경우가 틀린다.**
 *
 * 계산: ① 이 날짜가 속한 주의 목요일로 이동해 주차연도를 얻는다.
 *      ② 그 해 1월 4일(항상 W01에 속한다)이 속한 주의 목요일을 구한다.
 *      ③ 두 목요일의 간격을 7일로 나누고 1을 더한다.
 */
export function toWeekKey(d: Date): string {
  const k = toKst(d)
  /* 시각을 버리고 날짜만 남긴다. 아래 산술이 정확히 7일 배수가 되어야 한다. */
  const target = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate())

  /* 월=0 … 일=6. `getUTCDay()`는 일=0이라 그대로 쓰면 주가 일요일에 시작한다(BR-46 위반). */
  const dayIndex = (new Date(target).getUTCDay() + 6) % 7
  const thursday = target + (3 - dayIndex) * DAY_MS
  const isoYear = new Date(thursday).getUTCFullYear()

  /* 1월 4일은 ISO 정의상 **반드시** W01에 속한다. 그 주의 목요일이 기준점이다. */
  const jan4 = Date.UTC(isoYear, 0, 4)
  const jan4DayIndex = (new Date(jan4).getUTCDay() + 6) % 7
  const firstThursday = jan4 + (3 - jan4DayIndex) * DAY_MS

  const week = 1 + Math.round((thursday - firstThursday) / (7 * DAY_MS))
  return `${isoYear}-W${pad2(week)}`
}
