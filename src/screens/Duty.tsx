import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AttendanceMarkSheet, type AttendanceTarget } from '../components/AttendanceMarkSheet'
import { AttendanceSheet } from '../components/AttendanceSheet'
import { CenterNotice } from '../components/CenterNotice'
import { DutyEditSheet } from '../components/DutyEditSheet'
import { ClipboardCheckIcon, DutyEmptyIcon, LoadErrorIcon } from '../components/icons'
import { NeuButton } from '../components/NeuButton'
import { PrimaryButton } from '../components/PrimaryButton'
import { useToast } from '../components/Toast'
import { useAuth } from '../contexts/AuthProvider'
import { cn } from '../lib/cn'
import {
  clearAttendanceCache,
  fetchAttendance,
  markAttendance,
  markKey,
  type AttendanceMap,
  type AttendanceStatus,
} from '../lib/attendance'
import { formatWeekLabel, toDayKey, toWeekdayKo, toWeekKey } from '../lib/dateKeys'
import {
  clearDutyCache,
  fetchDutySchedule,
  isWeekend,
  MEALS,
  saveDutySchedule,
  WEEKDAYS,
  type DutyActor,
  type DutyDraft,
  type DutyResult,
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
 * ── 🔴 W-25가 바꾼 것 셋 ────────────────────────────────────────────────
 * ① **순찰 시간·장소 줄이 통째로 사라졌다**(`patrolLine()`·`fetchPatrolDefaults()` 소멸).
 * ② **끼니 라벨·순서**는 `duty.ts`의 `MEALS` 하나가 정한다 — 이 파일에 리터럴이 없다.
 * ③ **출석 체크가 붙었다.** 우상단 버튼은 **차장 이상**에게만 보이고, 찍힌 결과는
 *   요일 행의 담당자 **이름 색**으로 **전원에게** 보인다.
 *
 * 🔴 **`onSnapshot`을 켜지 않고 `users`를 읽지 않는다.** 이유는 `lib/duty.ts` 문서 주석에 있다.
 */

/* §8.9.2 · §8.10 — 확정 문안이다. 새로 짓지 마라. */
const TITLE = '선도 일정'
const TODAY_PREFIX = '오늘 순찰 · '
/** §8.9.4 T-04 원문. ⚠ §8.10.2 사전에는 없다 — W-14 보고서 §7 신규 항목이다. */
const WEEKEND_DONE = '이번 주 순찰이 종료되었습니다'
/** §8.10.2 EM-06. */
const EM_06 = '이번 주 순찰 일정이 아직 등록되지 않았습니다'
/** §8.10.3 ER-05. */
const ER_05 = '일정을 불러오지 못했습니다'
const RETRY = '다시 시도'
/**
 * §8.10.5 S9 하단 — 상시 안내 문구.
 *
 * 🔴 **W-21C 결정 2로 교체됐다.** 원문은 `다음 주 일정은 부장·차장이 등록합니다`인데
 * 편집이 **부장 전용**이 되면서 사실이 아니게 됐다. §8.10.5 개정 대상이다.
 */
const HINT = '다음 주 일정은 부장이 등록합니다'
const TODAY_CHIP = '오늘'
/** §8.9.2 #3 · §8.9.5 EM-06 보조 버튼 — PRD 확정 문안. */
const BTN_EDIT = '일정 편집'
const BTN_CREATE = '지금 등록하기'
/** §8.10.1 TS-11. */
const TS_11 = '순찰 일정을 저장했습니다'
/** §8.10.3에 편성 실패 코드가 없다. ER-07(저장 실패)을 그대로 쓴다. */
const ER_07 = '저장에 실패했습니다. 다시 시도해 주세요'

/* ── 🔴 W-25 기능 4 — §8.10 사전에 없는 문구 2종(보고서 §9 ③). ────────── */
const BTN_ATTENDANCE = '출석 체크'
const TS_ATTENDANCE = '출석을 기록했습니다'

/** §12.3 「앱 30분 이상 백그라운드 후 복귀」 — N-06이 T-07과 같은 경로를 탄다. */
const STALE_MS = 30 * 60 * 1000

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * 🔴 **W-25 — 출석 색은 여기 한 곳에서만 이름으로 바뀐다.**
 * `null`이면 클래스가 붙지 않아 `.drow-name`의 기본색(진초록 잉크)이 그대로 남는다 —
 * **미기록 이름은 한 픽셀도 달라지지 않는다.**
 */
const NAME_TONE: Readonly<Record<AttendanceStatus, string>> = {
  present: 'dname-present',
  late: 'dname-late',
  absent: 'dname-absent',
}

export default function Duty() {
  /* 🔴 마운트 시점의 `now`를 고정한다(T-05). 자정을 감시하는 타이머를 만들지 마라 —
     T-05의 문언은 「월요일 00:00 이후 **첫 진입 시**」다. 당겨서 새로고침·재진입에서만 갈린다.
     ref가 아니라 **상태**인 이유는 W-13 §4-11과 같다(렌더 중 `ref.current`를 읽지 않는다). */
  const [now, setNow] = useState(() => new Date())
  const [duty, setDuty] = useState<DutyResult | null>(null)
  const [nextDuty, setNextDuty] = useState<DutyResult | null>(null)
  /**
   * 🔴 **출석 표시는 실패해도 화면을 막지 않는다.** 못 읽으면 빈 맵이고 이름은
   * 기본색으로 남는다 — 일정 조회가 성공했는데 출석 때문에 ER-05를 띄우면
   * 「일정이 사라졌다」는 더 큰 거짓말이 된다.
   */
  const [marks, setMarks] = useState<AttendanceMap>({})
  /**
   * 재조회 열쇠. 🔴 **편성 저장이 `now`를 건드리지 않고 다시 읽게 하는 유일한 통로다** —
   * `now`를 갈면 주 경계가 다시 계산되고(T-05) 다음 주 문서까지 버려진다.
   */
  const [reloadKey, setReloadKey] = useState(0)

  const titleRef = useRef<HTMLHeadingElement>(null)
  /* N-06 판정용. 마지막으로 조회한 시각이다. */
  const lastFetchedRef = useRef(0)

  /* ── W-21C 기능 3 — 편성 편집(부장만) ───────────────────────────────── */
  const { profile } = useAuth()
  const toast = useToast()
  const online = useOnline()
  const [editOpen, setEditOpen] = useState(false)
  /** 열 때마다 올려 시트를 새로 마운트한다 — 초기화가 한 곳(마운트)에 모인다. */
  const [editKey, setEditKey] = useState(0)
  const [saving, setSaving] = useState(false)
  /* 🔴 상태가 아니라 ref다. `saving`은 같은 태스크의 연타를 막지 못한다(W-06 §5-4). */
  const savingRef = useRef(false)

  /* ── 🔴 W-25 기능 4 — 출석 체크(차장 이상) ──────────────────────────── */
  const [attOpen, setAttOpen] = useState(false)
  const [attKey, setAttKey] = useState(0)
  const [markOpen, setMarkOpen] = useState(false)
  const [markSheetKey, setMarkSheetKey] = useState(0)
  /** 닫힘 0.38s 동안 내용이 남아 있어야 하므로 **즉시 비우지 않는다**. */
  const [markTarget, setMarkTarget] = useState<AttendanceTarget | null>(null)
  const [marking, setMarking] = useState(false)
  const markingRef = useRef(false)
  /**
   * 🔴 **시트를 겹치지 않는다** — 하나를 닫고 그 **닫힘이 끝난 뒤** 다음을 연다.
   * W-21B의 `RecordActionSheet` → `ReasonEditSheet`와 **같은 형태**다. 겹치면
   * 포커스 트랩이 둘 동시에 살아 Tab이 두 시트 사이에서 튄다(§15.3).
   */
  const nextSheetRef = useRef<'mark' | 'back' | null>(null)

  /**
   * 🔴 **결정 2 — 편성은 부장(과 Dev)만이다.** `firestore.rules`의 `dutySchedules` update가
   * `isHead()`이고 그 함수는 `role in ['head','dev']`다 — **같은 문장이어야 한다.**
   */
  const canEdit =
    profile?.status === 'active' && (profile.role === 'head' || profile.role === 'dev')

  /**
   * 🔴 **W-25 — 출석 체크는 「차장급 이상」이다**(사용자 원문).
   * `firestore.rules`의 `dutyAttendance` write가 `isVice()`이고 그 함수는
   * `role in ['vice','head','dev']`다 — **같은 문장이어야 한다.**
   * ⚠ **`teacher`는 들어가지 않는다.** §4.2 단서 3이 교사를 열람 전용으로 규정한다.
   */
  const canCheck =
    profile?.status === 'active' &&
    (profile.role === 'vice' || profile.role === 'head' || profile.role === 'dev')

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
  /* 🔴 다음 주 문서는 **주말에만** 읽는다(§8.9.4 T-04). */
  const nextWeekId = weekend ? toWeekKey(new Date(now.getTime() + WEEK_MS)) : null

  useEffect(() => {
    let alive = true
    void (async () => {
      /* 🔴 문서 ID 직접 조회 2건. 인덱스가 필요 없고 병렬이라 왕복이 1회다. */
      const [schedule, attendance] = await Promise.all([
        fetchDutySchedule(weekId),
        fetchAttendance(weekId),
      ])
      if (!alive) return
      setDuty(schedule)
      setMarks(attendance.kind === 'ok' ? attendance.marks : {})
      lastFetchedRef.current = Date.now()
    })()
    return () => {
      alive = false
    }
    /* 🔴 `now`가 의존성에 있는 이유: T-07이 같은 주 안에서 새로고침하면 `weekId`가 그대로라
       이 효과가 다시 돌지 않는다. `reloadKey`는 저장 뒤 **`now`를 건드리지 않고** 다시 읽게 한다. */
  }, [weekId, now, reloadKey])

  useEffect(() => {
    /* 평일에는 아무 것도 하지 않는다 — 여기서 `setNextDuty(null)`을 부르면 평일 렌더마다
       불필요한 렌더가 한 번씩 더 돈다. */
    if (nextWeekId === null) return
    let alive = true
    void fetchDutySchedule(nextWeekId).then((result) => {
      if (alive) setNextDuty(result)
    })
    return () => {
      alive = false
    }
  }, [nextWeekId, now])

  /* T-07 — 당겨서 새로고침. 🔴 **S9가 소유한 캐시 둘만** 버린다. */
  const refresh = useCallback(() => {
    clearDutyCache()
    clearAttendanceCache()
    setDuty(null)
    setNextDuty(null)
    setMarks({})
    /* 새 `now`가 `weekId`를 바꾸면 위 효과가 다시 돈다 — 주 경계가 여기서 갈린다(T-05). */
    setNow(new Date())
  }, [])

  usePullToRefresh(refresh)

  /* N-06 — 30분 이상 백그라운드 후 복귀는 **T-07과 같은 경로**다(§12.3). */
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

  /* 🔴 EM-06은 **서버가 확인한 부재**일 때만이다(W-14 §1-3 P1 실측). */
  const empty = duty?.kind === 'empty'

  /* 다음 주 미리보기는 **문서가 있을 때만** 그린다(§8.10.2에 없을 때 쓸 문구가 없다). */
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
   * 🔴 **`exists`·`before`는 시트가 준다.** 시트가 이번 주가 아닌 주차를 편집할 수
   * 있게 되면서(W-25 B-3) 이 화면이 아는 「이번 주 문서」로 그 둘을 계산하면
   * **다른 주차의 값**을 감사 로그에 적고 `create`/`update` 문을 잘못 고른다.
   */
  const handleSave = (
    draft: DutyDraft,
    exists: boolean,
    before: { lunchDays: number; dinnerDays: number },
  ) => {
    if (!actor || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    void (async () => {
      const result = await saveDutySchedule(actor, draft, exists, before)
      savingRef.current = false
      setSaving(false)
      if (!result.ok) {
        toast(ER_07)
        return
      }
      setEditOpen(false)
      /* 🔴 저장한 주차가 이번 주가 아닐 수 있다 — 그때는 화면에 보이는 것이
         아무것도 안 바뀌는 것이 **정상**이다. 재조회는 그대로 돌린다(이번 주를
         저장했을 때 화면이 낡은 채로 남지 않게). */
      setDuty(null)
      setNextDuty(null)
      setReloadKey((n) => n + 1)
      toast(TS_11)
    })()
  }

  /* ── 출석 체크 흐름 ────────────────────────────────────────────────── */

  const openAttendance = () => {
    if (!online || marking) return
    /* 🔴 `key`를 올려 잠금(`unlocked`)이 열 때마다 다시 걸리게 한다(§3.5). */
    setAttKey((n) => n + 1)
    setAttOpen(true)
  }

  /** 표에서 한 사람을 골랐다 — 표를 닫고, 닫힘이 끝나면 기록 시트를 연다. */
  const pickAssignee = (
    day: AttendanceTarget['day'],
    meal: AttendanceTarget['meal'],
    uid: string,
    name: string,
  ) => {
    setMarkTarget({ day, meal, uid, name, current: marks[markKey(day, meal, uid)]?.status ?? null })
    nextSheetRef.current = 'mark'
    setAttOpen(false)
  }

  const handleAttendanceClosed = () => {
    if (nextSheetRef.current !== 'mark') return
    nextSheetRef.current = null
    setMarkSheetKey((n) => n + 1)
    setMarkOpen(true)
  }

  const handleMarkClosed = () => {
    setMarkTarget(null)
    if (nextSheetRef.current !== 'back') return
    nextSheetRef.current = null
    /* 🔴 `attKey`를 **올리지 않는다** — 올리면 표가 새로 마운트돼 「그 주 전체 열기」가
       사람을 한 명 찍을 때마다 풀린다. 돌아왔을 때 잠금 상태가 그대로여야 한다. */
    setAttOpen(true)
  }

  const handleMark = (status: AttendanceStatus) => {
    if (!profile || !markTarget || markingRef.current) return
    markingRef.current = true
    setMarking(true)
    const target = markTarget
    void (async () => {
      const result = await markAttendance(
        { uid: profile.uid, name: profile.name },
        weekId,
        target.day,
        target.meal,
        target.uid,
        status,
      )
      markingRef.current = false
      setMarking(false)
      if (!result.ok) {
        toast(ER_07)
        return
      }
      /* `markAttendance`가 그 주차 캐시를 이미 버렸다 — 그대로 다시 읽는다. */
      const fresh = await fetchAttendance(weekId)
      if (fresh.kind === 'ok') setMarks(fresh.marks)
      nextSheetRef.current = 'back'
      setMarkOpen(false)
      toast(TS_ATTENDANCE)
    })()
  }

  return (
    <main data-screen="S9" aria-labelledby="scr-s9" className="flex min-h-full flex-col">
      {/* 🔴 **W-23 A-5(b)(d)(B-05)** — 주차 표기는 `오늘 순찰` 카드 안 우상단이고
          `일정 편집`은 요일 카드 아래다.
          🔴 **W-25 — 비어 있던 이 줄의 우측에 `출석 체크`가 들어왔다**(사용자 요구).
          차장 미만에게는 **렌더되지 않는다** — 비활성으로 두지 않는다(§8.9.5의
          「부재」와 「비활성」 구분). 오프라인에서만 `disabled`다. */}
      <div className="d-head">
        <h1 ref={titleRef} id="scr-s9" tabIndex={-1} className="d-title">
          {TITLE}
        </h1>
        {canCheck && (
          <button
            type="button"
            className="d-attbtn"
            disabled={!online || marking}
            onClick={openAttendance}
          >
            <ClipboardCheckIcon />
            <span>{BTN_ATTENDANCE}</span>
          </button>
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
        /* EM-06 — design `6h`. 🔴 부장에게만 `지금 등록하기`를 렌더한다. */
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
            /* T-04 — 오늘 카드 **자리에** 종료 안내가 온다. 다음 주 미리보기가 그 안에 붙는다.
               🔴 **W-25 — 시간·장소 줄이 빠지면서 미리보기는 주차 칩 하나만 남는다.** */
            <section className="dcard" aria-label={WEEKEND_DONE}>
              <div className="dcard-head">
                <p className="dcard-top">{WEEKEND_DONE}</p>
                <span className="d-week d-week-on-card">{formatWeekLabel(now)}</span>
              </div>
              {preview && (
                <div className="dcard-chips">
                  <span className="dchip">{formatWeekLabel(new Date(now.getTime() + WEEK_MS))}</span>
                </div>
              )}
            </section>
          ) : (
            /* §8.9.2 #4 — 오늘 순찰 카드.
               🔴 **끼니 블록 2개.** 담당자가 없는 끼니는 **블록 자체를 그리지 않는다**
               (§8.10에 「그 끼니 없음」 문구가 없고, 빈 라벨만 남기면 고장으로 보인다).
               ⚠ **여기 칩에는 출석 색을 얹지 않는다** — 카드는 진초록 그라디언트라
               칩 글자가 이미 흰색이고, 사용자 요구는 「이름 색이 **검은색에서**
               바뀐다」로 요일 행을 가리킨다. */
            <section className="dcard">
              <div className="dcard-head">
                <p className="dcard-top">{TODAY_PREFIX + toWeekdayKo(now) + '요일'}</p>
                <span className="d-week d-week-on-card">{formatWeekLabel(now)}</span>
              </div>
              {MEALS.map((meal) => {
                const names = schedule?.assigneeNames[todayKey]?.[meal.key] ?? []
                if (names.length === 0) return null
                return (
                  <div key={meal.key} className="dcard-meal">
                    <p className="dcard-meal-label">{meal.label}</p>
                    <ul className="dcard-chips">
                      {names.map((name, i) => (
                        <li key={`${name}-${i}`} className="dchip">
                          {name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </section>
          )}

          {/* §8.9.2 #5 — 요일 행 5개(월~금 고정). 요일 행 안에 끼니 두 줄이다.
              🔴 **W-25 — 담당자 이름이 하나씩 별도 `<span>`이 됐다.** 예전에는 ` · `로
              이어 붙인 문자열 하나였고 그래서 **한 사람만 색을 바꿀 수 없었다.**
              구분자도 이제 요소다 — 이름 사이에만 들어간다. */}
          <ul className="glass rounded-22 dlist">
            {WEEKDAYS.map((day) => {
              /* 🔴 주말에는 강조 행이 0개다 — `todayKey`가 `sat`·`sun`이면 어느 행과도 같지 않다. */
              const today = day.key === todayKey
              return (
                <li key={day.key} className={today ? 'drow drow-today' : 'drow'}>
                  <span className="dbadge" aria-hidden="true">
                    {day.label}
                  </span>
                  <span className="drow-meals">
                    <span className="sr-only">{day.label}요일 </span>
                    {MEALS.map((meal) => {
                      const names = schedule?.assigneeNames[day.key]?.[meal.key] ?? []
                      const uids = schedule?.assigneeUids[day.key]?.[meal.key] ?? []
                      if (names.length === 0) return null
                      return (
                        <span key={meal.key} className="drow-meal">
                          <span className="dmeal">{meal.label}</span>
                          <span className="drow-name">
                            {names.map((name, i) => {
                              /* 🔴 이름과 uid는 **같은 인덱스**가 같은 사람이다(`duty.ts` 계약). */
                              const uid = uids[i]
                              const mark = uid ? marks[markKey(day.key, meal.key, uid)] : undefined
                              return (
                                <span key={`${name}-${i}`}>
                                  {i > 0 && ' · '}
                                  <span className={cn(mark && NAME_TONE[mark.status])}>{name}</span>
                                </span>
                              )
                            })}
                          </span>
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

          {/* 🔴 **W-23 A-5(a)(b)(c)(B-05)** — 부장은 버튼, 나머지는 기존 문구.
              문구를 전원에게서 지우면 부장이 아닌 사람은 「다음 주는 누가 등록하는가」를
              알 길이 없어진다(§8.10.5 조항이 통째로 사라진다). */}
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

      {/* 🔴 `key`가 마운트를 가른다 — 초기값(주차 오프셋 0 · 현재 편성)이 한 곳에서 잡힌다. */}
      {canEdit && (
        <DutyEditSheet
          key={editKey}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          baseDate={now}
          saving={saving}
          onSave={handleSave}
        />
      )}

      {/* 🔴 W-25 — 두 시트는 **겹치지 않는다.** `onClosed`가 다음 시트를 연다. */}
      {canCheck && (
        <>
          <AttendanceSheet
            key={attKey}
            open={attOpen}
            onClose={() => setAttOpen(false)}
            onClosed={handleAttendanceClosed}
            weekLabel={formatWeekLabel(now)}
            schedule={schedule}
            marks={marks}
            todayKey={todayKey}
            onPick={pickAssignee}
          />
          <AttendanceMarkSheet
            key={markSheetKey}
            open={markOpen}
            onClose={() => setMarkOpen(false)}
            onClosed={handleMarkClosed}
            target={markTarget}
            saving={marking}
            onSave={handleMark}
          />
        </>
      )}
    </main>
  )
}

/**
 * §8.9.5 로딩 — 카드·행 스켈레톤.
 *
 * 🔴 **S9 전용 스켈레톤 시안이 없다**(`6a`~`6d`는 학생 목록·기록 조회·반 선택·홈이다).
 * 새 디자인을 지어내지 않고 `.skel`을 실물 요소의 자리·크기에 맞춰 조립했다.
 */
function DutySkeleton() {
  return (
    <div aria-hidden="true">
      <section className="glass rounded-22 dcard-skel">
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
