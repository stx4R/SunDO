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
 * BR-47 시각 표기 `HH:mm` (S7 기록 행 · §8.7.2 #7).
 *
 * `formatDateTimeKst`와 **같은 `toKst()`를 통과한다.** 화면에서
 * `getHours()`로 다시 만들면 기기 시간대가 KST가 아닐 때 목록 시각과
 * 날짜 그룹 헤더가 서로 다른 날을 가리킨다.
 */
export function formatTimeKst(d: Date): string {
  const k = toKst(d)
  return `${pad2(k.getUTCHours())}:${pad2(k.getUTCMinutes())}`
}

/**
 * BR-47 날짜 표기 `{M}월 {D}일 ({요일})` — S7 날짜 그룹 헤더(§8.7.2 #6).
 *
 * 🔴 인자가 `Date`가 아니라 **`dateKey` 문자열**이다. `Date`를 받으면 호출부가
 * 「오늘·어제」를 다시 `Date` 산술로 판정하고 싶어지는데, 그 순간 KST 경계가
 * 어긋난다(지시서 §3.5). 판정은 `toDateKey(now)`와의 **문자열 비교**로 하고
 * 표기는 이 함수가 한다 — 키 자체가 이미 KST 벽시계라 여기서는 시간대 변환이
 * 일어나지 않는다(`Date.UTC`는 달력 계산일 뿐이다).
 */
export function formatDateKeyLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const weekday = WEEKDAY_KO[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${m}월 ${d}일 (${weekday})`
}

/** KST 요일 키. `dutySchedules.assignments`·`assigneeNames`의 맵 키와 같은 문자열이다(§9.3.6). */
export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

export type DayKey = (typeof DAY_KEYS)[number]

/**
 * KST 요일 키. `getDay()`로 읽으면 기기 시간대가 KST가 아닐 때 자정 전후로 하루가 밀린다.
 *
 * `getUTCDay()`는 일=0이라 `DAY_KEYS`(월 시작)와 어긋난다 — `+6 % 7`로 맞춘다(`toWeekKey`와 같은 보정).
 */
export function toDayKey(d: Date): DayKey {
  const k = toKst(d)
  return DAY_KEYS[(k.getUTCDay() + 6) % 7]
}

/** KST 요일 한 글자. 화면이 `${toWeekdayKo(now)}요일`로 조립한다(BR-47). */
export function toWeekdayKo(d: Date): string {
  return WEEKDAY_KO[toKst(d).getUTCDay()]
}

/**
 * BR-47 주차 표기 `{M}월 {n}주차` · BR-48 「해당 월의 첫 월요일이 속한 주를 1주차로 센다」.
 *
 * 🔴 **BR-48의 공백을 이렇게 메운다** — 첫 월요일 **이전** 날짜가 몇 주차인지 규격이 말하지 않는다
 * (예: 2026-08-01(토)은 8월 1주차인가 7월 마지막 주차인가). **그 주의 월요일이 속한 달을 기준 달로
 * 삼고, 그 달의 첫 월요일을 1주차로 센다.** 이러면 모든 주가 정확히 하나의 `(월, n주차)`에 대응해
 * 중복도 공백도 없다. 신규 확정값이므로 보고서 §7에 올렸다.
 *
 * 🔴 **인자가 `weekId` 문자열이 아니라 `Date`인 이유**: `YYYY-Www`에서 월을 되찾으려면 ISO 달력을
 * 역산해야 하고, 그 순간 **KST 계산이 한 벌 더 생긴다**(§0.4가 금지한다). `formatDateKeyLabel`이
 * 문자열을 받는 것은 `YYYY-MM-DD`가 표시에 필요한 값을 이미 통째로 담고 있기 때문이고, 주차 표기는
 * 그렇지 않다. 호출부는 `toWeekKey(now)`에 넘긴 것과 **같은 `now`**를 넘겨야 한다.
 *
 * 아래 산술은 KST 벽시계에서 뽑은 연·월·일로 만든 `Date.UTC` 위에서만 돈다 — 시간대 변환이
 * 다시 일어나지 않는 순수 달력 계산이다(`formatDateKeyLabel`과 같은 기법).
 */
export function formatWeekLabel(d: Date): string {
  const k = toKst(d)
  /* 월=0 … 일=6. 이 주의 월요일로 되돌린다. */
  const dayIndex = (k.getUTCDay() + 6) % 7
  const monday = new Date(
    Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() - dayIndex),
  )

  /* 기준 달은 **월요일이 속한 달**이다. */
  const year = monday.getUTCFullYear()
  const month = monday.getUTCMonth()
  const firstDayIndex = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7
  /* 1일이 월요일이면 그날이 첫 월요일이다(`% 7`이 0을 만든다). */
  const firstMondayDate = 1 + ((7 - firstDayIndex) % 7)

  const week = Math.floor((monday.getUTCDate() - firstMondayDate) / 7) + 1
  return `${month + 1}월 ${week}주차`
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
