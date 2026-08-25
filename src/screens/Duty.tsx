import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CenterNotice } from '../components/CenterNotice'
import { DutyEditSheet } from '../components/DutyEditSheet'
import { DutyEmptyIcon, LoadErrorIcon } from '../components/icons'
import { NeuButton } from '../components/NeuButton'
import { PrimaryButton } from '../components/PrimaryButton'
import { useToast } from '../components/Toast'
import { useAuth } from '../contexts/AuthProvider'
import { formatWeekLabel, toDayKey, toWeekdayKo, toWeekKey } from '../lib/dateKeys'
import {
  clearDutyCache,
  countDays,
  fetchDutySchedule,
  fetchPatrolDefaults,
  isWeekend,
  MEALS,
  saveDutySchedule,
  WEEKDAYS,
  type DutyActor,
  type DutyDraft,
  type DutyResult,
  type DutySchedule,
  type MealKey,
  type PatrolDefaults,
} from '../lib/duty'
import { useOnline } from '../lib/useOnline'
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
/**
 * §8.10.5 S9 하단 — 상시 안내 문구.
 *
 * 🔴 **W-21C 결정 2로 교체됐다.** 원문은 `다음 주 일정은 부장·차장이 등록합니다`인데
 * 편집이 **부장 전용**이 되면서 사실이 아니게 됐다. §8.10.5 개정 대상이다(보고서 §9 ①).
 */
const HINT = '다음 주 일정은 부장이 등록합니다'
const TODAY_CHIP = '오늘'
/** §8.9.2 #3 · §8.9.5 EM-06 보조 버튼 — PRD 확정 문안. */
const BTN_EDIT = '일정 편집'
const BTN_CREATE = '지금 등록하기'
/** §8.10.1 TS-11. */
const TS_11 = '순찰 일정을 저장했습니다'
/** §8.10.3에 편성 실패 코드가 없다. ER-07(저장 실패)을 그대로 쓴다 — 보고서 §9. */
const ER_07 = '저장에 실패했습니다. 다시 시도해 주세요'

/** §12.3 「앱 30분 이상 백그라운드 후 복귀」 — N-06이 T-07과 같은 경로를 탄다. */
const STALE_MS = 30 * 60 * 1000

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** 담당자 이름을 ` · `로 연결한다(§8.9.2 #5). */
function joinNames(names: readonly string[] | undefined): string {
  return (names ?? []).join(' · ')
}

/**
 * `{순찰 시간} · {장소}`. 둘 중 하나라도 없으면 줄 자체를 그리지 않는다(추측하지 않는다).
 *
 * 🔴 **W-21C — 끼니별이다.** 부서 기본값(`departments.patrolTime`)은 여전히 단일 문자열이라
 * **중식 자리에만** 떨어뜨린다. 석식 기본값이라는 것이 §9.3.2에 없고, 없는 값을 지어내
 * 「석식 07:50」을 그리면 그것이 곧 거짓말이다.
 */
function patrolLine(
  schedule: DutySchedule | null,
  defaults: PatrolDefaults | null,
  meal: MealKey,
): string | null {
  const fallbackTime = meal === 'lunch' ? (defaults?.patrolTime ?? null) : null
  const fallbackPlace = meal === 'lunch' ? (defaults?.patrolPlace ?? null) : null
  const time = schedule?.patrolTime[meal] ?? fallbackTime
  const place = schedule?.patrolPlace[meal] ?? fallbackPlace
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
  /**
   * 재조회 열쇠. 🔴 **편성 저장이 `now`를 건드리지 않고 다시 읽게 하는 유일한 통로다** —
   * `now`를 갈면 주 경계가 다시 계산되고(T-05) 부서 기본값·다음 주 문서까지 버려진다.
   */
  const [reloadKey, setReloadKey] = useState(0)

  const titleRef = useRef<HTMLHeadingElement>(null)
  /* N-06 판정용. 마지막으로 조회한 시각이다. */
  const lastFetchedRef = useRef(0)

  /* ── W-21C 기능 3 — 편집(부장만) ──────────────────────────────────────── */
  const { profile } = useAuth()
  const toast = useToast()
  const online = useOnline()
  const [editOpen, setEditOpen] = useState(false)
  /** 열 때마다 올려 시트를 새로 마운트한다 — 초기화가 한 곳(마운트)에 모인다. */
  const [editKey, setEditKey] = useState(0)
  const [saving, setSaving] = useState(false)
  /* 🔴 상태가 아니라 ref다. `saving`은 같은 태스크의 연타를 막지 못한다(W-06 §5-4). */
  const savingRef = useRef(false)

  /**
   * 🔴 **결정 2 — 부장(과 Dev)만이다.** `firestore.rules`의 `dutySchedules` update가
   * `isHead()`이고 그 함수는 `role in ['head','dev']`다 — **같은 문장이어야 한다.**
   * ⚠ §8.9.2 #3의 「차장 이상」은 이 결정으로 무효가 됐다(보고서 §9 ①).
   */
  const canEdit =
    profile?.status === 'active' && (profile.role === 'head' || profile.role === 'dev')

  const actor = useMemo<DutyActor | null>(
    () => (profile ? { uid: profile.uid, name: profile.name, role: profile.role } : null),
    [profile],
  )

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
       이 효과가 다시 돌지 않는다. `clearDutyCache()`만으로는 재조회가 일어나지 않는다.
       `reloadKey`는 편성 저장 뒤 **`now`를 건드리지 않고** 다시 읽게 한다(T-03). */
  }, [weekId, now, reloadKey])

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

  /* 🔴 EM-06은 **서버가 확인한 부재**일 때만이다. 실측(보고서 §1-3 P1)상 캐시에 없는 문서를
     오프라인에서 `getDoc`하면 `exists() === false`가 아니라 `unavailable`로 **throw**한다 —
     그래서 `empty`에 도달했다는 사실 자체가 이미 서버 확인의 증거다. W-13의 `onSnapshot`
     (빈 캐시에서 빈 스냅샷을 쏜다)과 **정반대**이고, 그래서 여기서는 추가 조건이 필요 없다. */
  const empty = duty?.kind === 'empty'

  /* 다음 주 미리보기는 **문서가 있을 때만** 그린다. 없을 때 쓸 문구가 §8.10.2에 없어
     블록 자체를 그리지 않는다(지시서 §3.7 · 보고서 §7 신규 항목). */
  const preview = nextDuty?.kind === 'ok' ? nextDuty.schedule : null

  /* T-02 — 편집 시트 오픈. `key`를 올려 **마운트에서** 초기값을 잡는다(§3.5 계약). */
  const openEdit = () => {
    if (!online || saving) return
    setEditKey((n) => n + 1)
    setEditOpen(true)
  }

  /**
   * T-03 — 저장 → 토스트 TS-11 → 재조회.
   *
   * 🔴 **저장 성공 뒤에 `refresh()`를 부르지 않는다.** 그것은 `now`를 갈아 주 경계를
   * 다시 계산하고 부서 기본값·다음 주 문서까지 버린다. `saveDutySchedule`이 그 주차
   * 캐시만 지웠으므로 **재조회 열쇠만** 올린다.
   */
  const handleSave = (draft: DutyDraft) => {
    if (!actor || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    void (async () => {
      const before = schedule
        ? {
            lunchDays: countDays(schedule.assigneeUids, 'lunch'),
            dinnerDays: countDays(schedule.assigneeUids, 'dinner'),
          }
        : { lunchDays: 0, dinnerDays: 0 }
      const result = await saveDutySchedule(actor, draft, schedule !== null, before)
      savingRef.current = false
      setSaving(false)
      if (!result.ok) {
        toast(ER_07)
        return
      }
      setEditOpen(false)
      setDuty(null)
      setNextDuty(null)
      setReloadKey((n) => n + 1)
      toast(TS_11)
    })()
  }

  return (
    <main data-screen="S9" aria-labelledby="scr-s9" className="flex min-h-full flex-col">
      {/* 🔴 **W-23 A-5(b)(d)(B-05) — 이 줄에서 둘이 나갔다.**
          ① 주차 표기(`8월 4주차`)는 `오늘 순찰` 카드 **안 우상단**으로 옮겼다(PM 요구).
             🔴 `weekId`를 다시 계산하지 않는다 — `formatWeekLabel(now)` **같은 호출**이 자리만 옮겼다.
          ② `일정 편집`은 우상단에서 **완전히 빠져** 요일 카드 아래로 내려갔다(§8.9.2 #3 위치 개정). */}
      <div className="d-head">
        <h1 ref={titleRef} id="scr-s9" tabIndex={-1} className="d-title">
          {TITLE}
        </h1>
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
        /* EM-06 — design `6h`. 🔴 **W-21C가 `지금 등록하기`를 만들었다**(§8.9.5).
           §17.1의 「S9 편집 제외」가 결정 1로 무효가 됐고, 이 버튼이 없으면 문서가 없는
           주차는 **영영 편성할 수 없다.** 🔴 부장에게만 렌더한다. */
        <>
          <CenterNotice
            icon={<DutyEmptyIcon />}
            title={EM_06}
            action={
              canEdit ? (
                <NeuButton
                  radius={15}
                  className="cnote-retry"
                  disabled={!online || saving}
                  onClick={openEdit}
                >
                  {BTN_CREATE}
                </NeuButton>
              ) : undefined
            }
          />
          <p className="d-hint">{HINT}</p>
        </>
      ) : (
        <>
          {weekend ? (
            /* T-04 — 오늘 카드 **자리에** 종료 안내가 온다. 다음 주 미리보기가 그 안에 붙는다. */
            <section className="dcard" aria-label={WEEKEND_DONE}>
              <div className="dcard-head">
                <p className="dcard-top">{WEEKEND_DONE}</p>
                {/* W-23 A-5(d) — 주차 표기. §8.9.2 #2의 `12px/700`은 그대로이고 색만
                    카드 표면(진초록)에 맞춘다. 🔴 `weekId` 재계산 0. */}
                <span className="d-week d-week-on-card">{formatWeekLabel(now)}</span>
              </div>
              {preview && (
                <>
                  <div className="dcard-chips">
                    <span className="dchip">{formatWeekLabel(new Date(now.getTime() + WEEK_MS))}</span>
                  </div>
                  {MEALS.map((meal) => {
                    const l = patrolLine(preview, defaults, meal.key)
                    return l && <p key={meal.key} className="dcard-foot">{`${meal.label} ${l}`}</p>
                  })}
                </>
              )}
            </section>
          ) : (
            /* §8.9.2 #4 — 오늘 순찰 카드.
               🔴 **W-21C — 끼니 블록 2개.** 담당자가 없는 끼니는 **블록 자체를 그리지 않는다**
               (§8.10에 「석식 없음」 문구가 없고, 빈 라벨만 남기면 고장으로 보인다). */
            <section className="dcard">
              <div className="dcard-head">
                <p className="dcard-top">{TODAY_PREFIX + toWeekdayKo(now) + '요일'}</p>
                {/* W-23 A-5(d) — 주차 표기가 `.d-head`에서 여기로 왔다. */}
                <span className="d-week d-week-on-card">{formatWeekLabel(now)}</span>
              </div>
              {MEALS.map((meal) => {
                const names = schedule?.assigneeNames[todayKey]?.[meal.key] ?? []
                const l = patrolLine(schedule, defaults, meal.key)
                if (names.length === 0 && !l) return null
                return (
                  <div key={meal.key} className="dcard-meal">
                    <p className="dcard-meal-label">{meal.label}</p>
                    {names.length > 0 && (
                      <ul className="dcard-chips">
                        {names.map((name, i) => (
                          <li key={`${name}-${i}`} className="dchip">
                            {name}
                          </li>
                        ))}
                      </ul>
                    )}
                    {l && <p className="dcard-foot">{l}</p>}
                  </div>
                )
              })}
            </section>
          )}

          {/* §8.9.2 #5 — 요일 행 5개(월~금 고정).
              🔴 **W-21C 결정 3 — 요일 행 안에 중식·석식 두 줄.** 탭이 아니다.
              담당자가 없는 끼니는 줄을 그리지 않는다 — 「중식」 라벨만 덩그러니 남는 것보다
              아무것도 없는 편이 사실에 가깝다(design `19`에 이 상태의 시안이 없다 · 보고서 §9 ③). */}
          <ul className="glass rounded-22 dlist">
            {WEEKDAYS.map((day) => {
              /* 🔴 주말에는 강조 행이 0개다 — `todayKey`가 `sat`·`sun`이면 어느 행과도 같지 않다. */
              const today = day.key === todayKey
              const cell = schedule?.assigneeNames[day.key]
              return (
                <li key={day.key} className={today ? 'drow drow-today' : 'drow'}>
                  <span className="dbadge" aria-hidden="true">
                    {day.label}
                  </span>
                  <span className="drow-meals">
                    <span className="sr-only">{day.label}요일 </span>
                    {MEALS.map((meal) => {
                      const names = cell?.[meal.key] ?? []
                      if (names.length === 0) return null
                      return (
                        <span key={meal.key} className="drow-meal">
                          <span className="dmeal">{meal.label}</span>
                          <span className="drow-name">{joinNames(names)}</span>
                        </span>
                      )
                    })}
                  </span>
                  {/* AC-03 — 오늘을 색만으로 전달하지 않는다. 이 칩의 **텍스트**가 그 역할이다. */}
                  {today && <span className="dtoday">{TODAY_CHIP}</span>}
                </li>
              )
            })}
          </ul>

          {/* 🔴 **W-23 A-5(a)(b)(c)(B-05) — 안내 문구 자리에 `일정 편집`이 들어왔다.**
              PM 지시는 「문구를 지우고 그 자리에 버튼」이지만, 버튼은 **부장에게만** 렌더된다
              (부재 처리 — 아래 `disabled` 단서 참조). 문구를 전원에게서 지우면 부장이 아닌
              사람은 그 자리에 **아무것도 보지 못하고** 「다음 주는 누가 등록하는가」를 알 길이
              없어진다 — §8.10.5 조항이 통째로 사라지는 것이다. ⇒ **사용자 확정: 부장은 버튼,
              나머지는 기존 문구.** 보고서 §2에 근거를 적었다.
              🔴 **디자인은 `PrimaryButton`(§7.3 `btnp`) 그대로다 — 새 스타일을 만들지 않았다.**
              ⚠ 오프라인·저장 중에는 `disabled`다. 역할은 「영영 안 된다」(부재)이고
              오프라인은 「지금은 안 되지만 곧 된다」(비활성)라 표현이 갈린다(§8.9.5). */}
          {canEdit ? (
            <PrimaryButton
              label={BTN_EDIT}
              onClick={openEdit}
              disabled={!online || saving}
              className="d-editbtn"
            />
          ) : (
            <p className="d-hint">{HINT}</p>
          )}
        </>
      )}

      {/* 🔴 `key`가 마운트를 가른다 — 초기값(현재 편성)이 한 곳에서 잡힌다(§3.5). */}
      {canEdit && (
        <DutyEditSheet
          key={editKey}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          weekId={weekId}
          weekLabel={formatWeekLabel(now)}
          schedule={schedule}
          defaults={defaults}
          saving={saving}
          onSave={handleSave}
        />
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
        {/* W-23 A-5(d) — 주차 표기가 카드 안으로 들어오면서 로딩 자리도 함께 왔다.
            §8.9.2 #2의 「로딩 중에는 스켈레톤」이 `.d-head`에서 여기로 옮겨진 것이다. */}
        <div className="dcard-head">
          <span className="skel w-[92px]" />
          <span className="skel h-[12px] w-[60px]" />
        </div>
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
