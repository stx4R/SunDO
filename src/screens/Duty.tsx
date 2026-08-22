import { useCallback, useEffect, useRef, useState } from 'react'
import { CenterNotice } from '../components/CenterNotice'
import { DutyEmptyIcon, LoadErrorIcon } from '../components/icons'
import { NeuButton } from '../components/NeuButton'
import { formatWeekLabel, toDayKey, toWeekdayKo, toWeekKey } from '../lib/dateKeys'
import {
  clearDutyCache,
  fetchDutySchedule,
  fetchPatrolDefaults,
  isWeekend,
  WEEKDAYS,
  type DutyResult,
  type DutySchedule,
  type PatrolDefaults,
} from '../lib/duty'
import { usePullToRefresh } from '../lib/usePullToRefresh'

/**
 * S9 선도 일정 — `/duty` · PRD §8.9 · §9.3.6 · design `1j`(채택본, **`舊 version.`**) ·
 * `6h`(EM-06) · `6j`(ER-05).
 *
 * **여백을 만들지 마라.** 상단 `safe-area + 34px`·하단 120px은 `AppShell`이 `hasDock`으로
 * 이미 소유한다. **`<OfflineBanner />`도 그리지 마라** — 전역 1개다.
 * 화면 전환 `blurIn`은 `ScreenTransition`이 이미 감싼다.
 *
 * 🔴 **편집 진입점이 하나도 없다.** §17.1이 「S9 편집」을 MVP 제외로 규정한다 —
 * `일정 편집` 버튼도, EM-06의 `지금 등록하기`도 만들지 않는다. **비활성으로 두지도 마라.**
 * 역할 분기(`vice` 이상)를 미리 심는 것도 같은 이유로 금지다.
 *
 * 🔴 **`onSnapshot`을 켜지 않고 `users`를 읽지 않는다.** 이유는 `lib/duty.ts` 문서 주석에 있다.
 */

/* §8.9.2 · §8.10 — 확정 문안이다. 새로 짓지 마라. */
const TITLE = '선도 일정'
const TODAY_PREFIX = '오늘 순찰 · '
/** §8.9.4 T-04 원문. ⚠ §8.10.2 사전에는 없다 — 보고서 §7 신규 항목이다. */
const WEEKEND_DONE = '이번 주 순찰이 종료되었습니다'
/** §8.10.2 EM-06. 🔴 보조 문구의 `지금 등록하기` 버튼은 만들지 않는다. */
const EM_06 = '이번 주 순찰 일정이 아직 등록되지 않았습니다'
/** §8.10.3 ER-05. */
const ER_05 = '일정을 불러오지 못했습니다'
const RETRY = '다시 시도'
/** §8.10.5 S9 하단 — 상시 안내 문구. */
const HINT = '다음 주 일정은 부장·차장이 등록합니다'
const TODAY_CHIP = '오늘'

/** §12.3 「앱 30분 이상 백그라운드 후 복귀」 — N-06이 T-07과 같은 경로를 탄다. */
const STALE_MS = 30 * 60 * 1000

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** 담당자 이름을 ` · `로 연결한다(§8.9.2 #5). */
function joinNames(names: readonly string[] | undefined): string {
  return (names ?? []).join(' · ')
}

/** `{순찰 시간} · {장소}`. 둘 중 하나라도 없으면 줄 자체를 그리지 않는다(추측하지 않는다). */
function patrolLine(schedule: DutySchedule | null, defaults: PatrolDefaults | null): string | null {
  const time = schedule?.patrolTime ?? defaults?.patrolTime ?? null
  const place = schedule?.patrolPlace ?? defaults?.patrolPlace ?? null
  if (!time || !place) return null
  return `${time} · ${place}`
}

export default function Duty() {
  /* 🔴 마운트 시점의 `now`를 고정한다(T-05). 자정을 감시하는 타이머를 만들지 마라 —
     T-05의 문언은 「월요일 00:00 이후 **첫 진입 시**」다. 당겨서 새로고침·재진입에서만 갈린다.
     ref가 아니라 **상태**인 이유는 W-13 §4-11과 같다(렌더 중 `ref.current`를 읽지 않는다). */
  const [now, setNow] = useState(() => new Date())
  const [duty, setDuty] = useState<DutyResult | null>(null)
  const [nextDuty, setNextDuty] = useState<DutyResult | null>(null)
  const [defaults, setDefaults] = useState<PatrolDefaults | null>(null)

  const titleRef = useRef<HTMLHeadingElement>(null)
  /* N-06 판정용. 마지막으로 조회한 시각이다. */
  const lastFetchedRef = useRef(0)

  /* §15.3 — 화면 전환 시 제목으로 포커스를 옮긴다. */
  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  /* 🔴 `weekId`는 `toWeekKey`의 반환값 **그대로**다. 주차를 여기서 다시 계산하지 않는다. */
  const weekId = toWeekKey(now)
  const todayKey = toDayKey(now)
  const weekend = isWeekend(todayKey)
  /* 🔴 다음 주 문서는 **주말에만** 읽는다(§8.9.4 T-04). 평일 질의 1건 · 주말 2건. */
  const nextWeekId = weekend ? toWeekKey(new Date(now.getTime() + WEEK_MS)) : null

  useEffect(() => {
    let alive = true
    void (async () => {
      const [schedule, patrol] = await Promise.all([
        fetchDutySchedule(weekId),
        fetchPatrolDefaults(),
      ])
      if (!alive) return
      setDuty(schedule)
      setDefaults(patrol)
      lastFetchedRef.current = Date.now()
    })()
    return () => {
      alive = false
    }
    /* 🔴 `now`가 의존성에 있는 이유: T-07이 같은 주 안에서 새로고침하면 `weekId`가 그대로라
       이 효과가 다시 돌지 않는다. `clearDutyCache()`만으로는 재조회가 일어나지 않는다. */
  }, [weekId, now])

  useEffect(() => {
    /* 평일에는 아무 것도 하지 않는다 — 여기서 `setNextDuty(null)`을 부르면 평일 렌더마다
       불필요한 렌더가 한 번씩 더 돈다. 미리보기는 `weekend` 분기 안에서만 읽히고,
       주말 → 평일 전환은 `refresh()`가 이미 비운다. */
    if (nextWeekId === null) return
    let alive = true
    void fetchDutySchedule(nextWeekId).then((result) => {
      if (alive) setNextDuty(result)
    })
    return () => {
      alive = false
    }
  }, [nextWeekId, now])

  /* T-07 — 당겨서 새로고침. 🔴 `clearDutyCache()`만 부른다. 다른 화면 캐시를 버리지 않는다. */
  const refresh = useCallback(() => {
    clearDutyCache()
    setDuty(null)
    setNextDuty(null)
    setDefaults(null)
    /* 새 `now`가 `weekId`를 바꾸면 위 효과가 다시 돈다 — 주 경계가 여기서 갈린다(T-05). */
    setNow(new Date())
  }, [])

  usePullToRefresh(refresh)

  /* N-06 — 30분 이상 백그라운드 후 복귀는 **T-07과 같은 경로**다(§12.3).
     🔴 타이머가 아니라 `visibilitychange`다. 자정 감시가 아니다. */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastFetchedRef.current < STALE_MS) return
      refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  const failed = duty?.kind === 'failed'
  const schedule = duty?.kind === 'ok' ? duty.schedule : null
  const line = patrolLine(schedule, defaults)

  /* 🔴 EM-06은 **서버가 확인한 부재**일 때만이다. 실측(보고서 §1-3 P1)상 캐시에 없는 문서를
     오프라인에서 `getDoc`하면 `exists() === false`가 아니라 `unavailable`로 **throw**한다 —
     그래서 `empty`에 도달했다는 사실 자체가 이미 서버 확인의 증거다. W-13의 `onSnapshot`
     (빈 캐시에서 빈 스냅샷을 쏜다)과 **정반대**이고, 그래서 여기서는 추가 조건이 필요 없다. */
  const empty = duty?.kind === 'empty'

  /* 다음 주 미리보기는 **문서가 있을 때만** 그린다. 없을 때 쓸 문구가 §8.10.2에 없어
     블록 자체를 그리지 않는다(지시서 §3.7 · 보고서 §7 신규 항목). */
  const preview = nextDuty?.kind === 'ok' ? nextDuty.schedule : null
  const previewLine = preview ? patrolLine(preview, defaults) : null

  return (
    <main data-screen="S9" aria-labelledby="scr-s9" className="flex min-h-full flex-col">
      <div className="d-head">
        <h1 ref={titleRef} id="scr-s9" tabIndex={-1} className="d-title">
          {TITLE}
        </h1>
        {/* §8.9.2 #2 — 로딩 중에는 스켈레톤. `weekId`는 이미 알지만 문서 상태와 함께 뜬다. */}
        {duty === null ? (
          <span className="skel" aria-hidden="true" />
        ) : (
          <p className="d-week">{formatWeekLabel(now)}</p>
        )}
      </div>

      {failed ? (
        /* §8.9.5 에러 — ER-05 + `다시 시도`(design `6j`). */
        <CenterNotice
          tone="danger"
          icon={<LoadErrorIcon />}
          title={ER_05}
          action={
            <NeuButton radius={15} className="cnote-retry" onClick={refresh}>
              {RETRY}
            </NeuButton>
          }
        />
      ) : duty === null ? (
        <DutySkeleton />
      ) : empty ? (
        /* EM-06 — design `6h`. 🔴 `지금 등록하기` 버튼은 **없다**(§17.1 MVP 제외). */
        <>
          <CenterNotice icon={<DutyEmptyIcon />} title={EM_06} />
          <p className="d-hint">{HINT}</p>
        </>
      ) : (
        <>
          {weekend ? (
            /* T-04 — 오늘 카드 **자리에** 종료 안내가 온다. 다음 주 미리보기가 그 안에 붙는다. */
            <section className="dcard" aria-label={WEEKEND_DONE}>
              <p className="dcard-top">{WEEKEND_DONE}</p>
              {preview && (
                <>
                  <div className="dcard-chips">
                    <span className="dchip">{formatWeekLabel(new Date(now.getTime() + WEEK_MS))}</span>
                  </div>
                  {previewLine && <p className="dcard-foot">{previewLine}</p>}
                </>
              )}
            </section>
          ) : (
            /* §8.9.2 #4 — 오늘 순찰 카드. */
            <section className="dcard">
              <p className="dcard-top">{TODAY_PREFIX + toWeekdayKo(now) + '요일'}</p>
              {(schedule?.assigneeNames[todayKey] ?? []).length > 0 && (
                <ul className="dcard-chips">
                  {schedule?.assigneeNames[todayKey]?.map((name, i) => (
                    <li key={`${name}-${i}`} className="dchip">
                      {name}
                    </li>
                  ))}
                </ul>
              )}
              {line && <p className="dcard-foot">{line}</p>}
            </section>
          )}

          {/* §8.9.2 #5 — 요일 행 5개(월~금 고정). */}
          <ul className="glass rounded-22 dlist">
            {WEEKDAYS.map((day) => {
              /* 🔴 주말에는 강조 행이 0개다 — `todayKey`가 `sat`·`sun`이면 어느 행과도 같지 않다. */
              const today = day.key === todayKey
              return (
                <li key={day.key} className={today ? 'drow drow-today' : 'drow'}>
                  <span className="dbadge" aria-hidden="true">
                    {day.label}
                  </span>
                  <span className="drow-name">
                    <span className="sr-only">{day.label}요일 </span>
                    {joinNames(schedule?.assigneeNames[day.key])}
                  </span>
                  {/* AC-03 — 오늘을 색만으로 전달하지 않는다. 이 칩의 **텍스트**가 그 역할이다. */}
                  {today && <span className="dtoday">{TODAY_CHIP}</span>}
                </li>
              )
            })}
          </ul>

          <p className="d-hint">{HINT}</p>
        </>
      )}
    </main>
  )
}

/**
 * §8.9.5 로딩 — 카드·행 스켈레톤.
 *
 * 🔴 **S9 전용 스켈레톤 시안이 없다**(`6a`~`6d`는 학생 목록·기록 조회·반 선택·홈이다).
 * 새 디자인을 지어내지 않고 `.skel`을 실물 요소의 자리·크기에 맞춰 조립했다 —
 * 카드 3줄(제목/칩 2개/하단), 행 5개(배지 + 이름). 보고서 §7 신규 항목이다.
 */
function DutySkeleton() {
  return (
    <div aria-hidden="true">
      <section className="glass rounded-22 dcard-skel">
        <span className="skel w-[92px]" />
        <div className="dcard-chips">
          <span className="skel h-[33px] w-[74px] rounded-pill" />
          <span className="skel h-[33px] w-[74px] rounded-pill" />
        </div>
        <span className="skel mt-3 block h-[11px] w-[140px]" />
      </section>
      <ul className="glass rounded-22 dlist">
        {WEEKDAYS.map((day) => (
          <li key={day.key} className="drow">
            <span className="skel h-[34px] w-[34px] rounded-12" />
            <span className="skel h-[14px] w-[110px]" />
          </li>
        ))}
      </ul>
    </div>
  )
}
