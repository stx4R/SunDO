import { useEffect, useMemo, useRef, useState } from 'react'
import { AssigneePopover } from './AssigneePopover'
import { BottomSheet } from './BottomSheet'
import { ConfirmModal } from './ConfirmModal'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'
import { PrimaryButton } from './PrimaryButton'
import { formatWeekLabel, toWeekKey, toWeekRange, type DayKey } from '../lib/dateKeys'
import {
  countDays,
  fetchDutyMembers,
  fetchDutySchedule,
  MAX_ASSIGNEES,
  MEALS,
  WEEKDAYS,
  type ByMeal,
  type DutyDraft,
  type DutyMember,
  type MealKey,
} from '../lib/duty'

/* ── §8.9 · design `19a`~`19c` 확정 문안. ─────────────────────────────── */
const TITLE = '순찰 일정 편집'
const SAVE = '일정 저장'
/** design `19a` 원문 — 요일 행 끝의 점선 칩. */
const ADD_ASSIGNEE = '+ 담당자'

/**
 * §8.9.3 입력 검증 — **PRD가 문구를 고정한다.**
 *
 * 🔴 **W-25 B-2 — 순찰 시간·장소 검증 4종이 여기서 사라졌다.** 두 필드를 화면에서
 * 전부 걷어내라는 요구(보고서 §2 결정 2)로 **검증할 입력 자체가 없어졌다.**
 * 남은 것은 담당자 검증 2종뿐이다.
 */
const ER_NO_ASSIGNEE = '요일마다 담당자를 1명 이상 지정해 주세요'
const ER_TOO_MANY = `한 요일에 최대 ${MAX_ASSIGNEES}명까지 지정할 수 있습니다`

/* ── 🔴 W-25 B-3 주차 이동 — 아래 4개는 이 회차가 새로 짓는 문구다(보고서 §9 ③). ── */
const PREV_WEEK = '이전 주'
const NEXT_WEEK = '다음 주'
/** 주차를 옮기는 동안 편성 칸이 비어 보이면 「지워졌다」로 읽힌다. 한 줄로 말한다. */
const LOADING_WEEK = '일정을 불러오는 중입니다'
const ER_WEEK_FAILED = '이 주차를 불러오지 못했습니다'
/** §8.10.4 MD-XX에 없다 — 이 회차 신설. 좌 버튼은 `ConfirmModal`이 `취소`로 고정한다. */
const MD_DIRTY_TITLE = '저장하지 않은 변경'
const MD_DIRTY_BODY = '이 주차에 저장하지 않은 변경이 있습니다. 주차를 옮기면 사라집니다.'
const MD_DIRTY_CONFIRM = '이동'

interface DutyEditSheetProps {
  open: boolean
  onClose: () => void
  /**
   * 🔴 **`weekId`가 아니라 기준 `Date`다.** 주차 이동이 붙으면서 시트가 **여러 주차**를
   * 다루게 됐고, `weekId` 문자열에서 이웃 주차를 구하려면 ISO 달력을 역산해야 한다 —
   * `dateKeys.ts`가 금지하는 「KST 계산 한 벌 더」다. 호출부가 넘긴 `now`에
   * ±7일을 더해 `toWeekKey`·`formatWeekLabel`·`toWeekRange`에 **그대로** 넘긴다.
   */
  baseDate: Date
  saving: boolean
  /**
   * 🔴 **`exists`·`before`를 시트가 함께 넘긴다.** 호출부(S9)는 「이번 주」만 알고
   * 있는데 저장 대상은 시트가 고른 주차다 — 문서 존재 여부와 감사 로그의 `before`를
   * 호출부가 계산하면 **다른 주차의 값**을 쓰게 된다(W-21C에서는 주차가 하나뿐이라
   * 드러나지 않던 결합이다).
   */
  onSave: (draft: DutyDraft, exists: boolean, before: { lunchDays: number; dinnerDays: number }) => void
}

type ByDay = Record<DayKey, ByMeal<readonly string[]>>

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** 🔴 다섯 요일 × 두 끼니가 **항상** 있는 형태. `duty.ts`의 읽기 계층과 같은 계약이다. */
function emptyByDay(): ByDay {
  const out = {} as ByDay
  for (const day of WEEKDAYS) out[day.key] = { lunch: [], dinner: [] }
  return out
}

/** 두 편성이 같은가. `dirty` 판정 전용 — 순서까지 같아야 같다고 본다. */
function sameByDay(a: ByDay, b: ByDay): boolean {
  return WEEKDAYS.every((d) =>
    MEALS.every((m) => {
      const x = a[d.key][m.key]
      const y = b[d.key][m.key]
      return x.length === y.length && x.every((uid, i) => uid === y[i])
    }),
  )
}

/**
 * S9 순찰 일정 편집 시트 — §8.9.3·§8.9.4 T-02·T-03 · design `19a`(기본)·`19b`(포커스)·
 * `19c`(에러) · `19d`·`19e`(담당자 팝오버).
 *
 * 🔴 **초기화는 `key` 재마운트가 한다**(§3.5 · `RecordSheet`·`ReasonEditSheet`와 같은 계약).
 *
 * ── 🔴 W-25가 바꾼 것 셋 ────────────────────────────────────────────────
 * ① **끼니 라벨·순서** — `MEALS` 배열 하나가 정한다. 이 파일에 `중식`·`아침 선도`
 *    리터럴이 없다(`duty.ts` 참조).
 * ② **순찰 시간·장소 4필드가 통째로 빠졌다.** `Field`·`validateTime`·`validatePlace`·
 *    `capPlace`·`fieldRefs`가 전부 함께 사라졌다 — 이 시트는 이제 **담당자만** 다룬다.
 * ③ **주차 이동(←/→)이 붙었다.** ⚠ **PRD §8.9.3의 「이번 주 또는 다음 주만」이
 *    폐기됐다**(사용자 확정 · 보고서 §2 결정 3). 그 조항의 마지막 방어선이 이 시트였고
 *    (규칙은 ISO 주차를 계산할 수 없다 — `firestore.rules`의 `dutySchedules` 주석),
 *    이제 **아무 주차나 열 수 있다.** 대신 저장할 때마다 `DUTY_UPDATE` 감사 로그가
 *    `targetId = weekId`로 남아 「누가 어느 주를 건드렸나」는 추적된다.
 *
 * 🔴 **주차마다 문서를 시트가 직접 읽는다.** 호출부가 넘겨 주던 `schedule` prop이
 * 사라졌다 — `fetchDutySchedule`이 `weekId`로 캐시하므로 이번 주는 S9가 이미 읽어
 * 둔 것을 그대로 받고(추가 읽기 0), 다른 주차만 1건씩 더 읽는다.
 */
export function DutyEditSheet({ open, onClose, baseDate, saving, onSave }: DutyEditSheetProps) {
  /** 기준 주에서 몇 주 떨어졌나. 🔴 범위 제한이 **없다**(결정 3). */
  const [offset, setOffset] = useState(0)

  const viewDate = useMemo(
    () => new Date(baseDate.getTime() + offset * WEEK_MS),
    [baseDate, offset],
  )
  const weekId = toWeekKey(viewDate)
  const weekLabel = formatWeekLabel(viewDate)

  /**
   * 🔴 **불러온 주차 하나.** `weekId`를 **함께** 담는 것이 핵심이다 — 그래야
   * 「지금 보고 있는 주차가 이미 로드됐는가」를 **렌더에서 파생**할 수 있고,
   * 효과에서 `setWeekState('loading')`을 동기로 부르지 않아도 된다
   * (oxlint `react(set-state-in-effect)` · 기준선 18개를 늘리지 않는다).
   */
  const [loaded, setLoaded] = useState<{
    id: string
    byDay: ByDay
    /** 이 주차에 문서가 있는가. `create`와 `update`는 규칙에서 **다른 문**이다. */
    exists: boolean
    status: 'ok' | 'failed'
  } | null>(null)
  /** 사용자의 작업 사본. 🔴 **어느 주차의 것인지 함께 들고 다닌다.** */
  const [edit, setEdit] = useState<{ id: string; byDay: ByDay } | null>(null)
  /** ←/→ 를 눌렀는데 저장하지 않은 변경이 있을 때 대기시킬 목적지. */
  const [pendingOffset, setPendingOffset] = useState<number | null>(null)

  /** 열려 있는 팝오버의 `{요일}-{끼니}`. `null`이면 닫혀 있다. */
  const [picking, setPicking] = useState<{ day: DayKey; meal: MealKey } | null>(null)
  /** §8.9.3 담당자 검증 — 저장을 눌렀을 때만 뜬다(입력 중에 빨갛게 하지 않는다). */
  const [assigneeError, setAssigneeError] = useState<string | null>(null)

  /**
   * 🔴 **담당자 후보를 여기서 읽는다.** 팝오버가 아니라 시트가 갖는 이유 둘:
   * ① 칩에 그릴 이름을 uid로 되찾아야 한다 ② `saveDutySchedule`이 이름 스냅샷을
   * 만들 때 **같은 목록**을 봐야 한다(`duty.ts`의 `membersCache`).
   */
  const [members, setMembers] = useState<readonly DutyMember[]>([])

  useEffect(() => {
    if (!open) return
    let alive = true
    void fetchDutyMembers().then((state) => {
      if (alive && state.kind === 'ok') setMembers(state.members)
    })
    return () => {
      alive = false
    }
  }, [open])

  /**
   * 🔴 **주차가 바뀌면 그 주차 문서를 읽어 편성을 갈아 끼운다.**
   * `open`이 의존성에 있는 이유: 시트가 닫혀 있는 동안은 읽지 않는다(S9 진입만으로
   * 편집용 질의가 나가면 안 된다). `key` 재마운트로 열리므로 `offset`은 항상 0에서 시작한다.
   */
  useEffect(() => {
    if (!open) return
    let alive = true
    void fetchDutySchedule(weekId).then((result) => {
      if (!alive) return
      const next = emptyByDay()
      if (result.kind === 'ok') {
        for (const day of WEEKDAYS) {
          const cell = result.schedule.assigneeUids[day.key]
          next[day.key] = { lunch: [...cell.lunch], dinner: [...cell.dinner] }
        }
      }
      /* 🔴 **`weekId`를 함께 담는다.** 늦게 도착한 응답이 다른 주차를 덮어쓰지 못한다 —
         `alive` 가드만으로는 「같은 마운트 안에서 주차를 두 번 옮긴」 경우를 못 막는다. */
      setLoaded({
        id: weekId,
        byDay: next,
        exists: result.kind === 'ok',
        status: result.kind === 'failed' ? 'failed' : 'ok',
      })
    })
    return () => {
      alive = false
    }
  }, [open, weekId])

  /** uid → 이름. 🔴 **칩은 편집 중인 uid를 그리므로 저장된 스냅샷이 아니라 이 맵을 본다.** */
  const nameOf = useMemo(() => new Map(members.map((m) => [m.uid, m.name])), [members])

  /* 🔴 상태가 아니라 ref다(W-06 §5-4). */
  const submittingRef = useRef(false)

  useEffect(() => {
    if (!open) submittingRef.current = false
  }, [open])

  /* ── 🔴 아래 넷은 전부 **렌더에서 파생된다.** 효과가 상태를 하나도 만들지 않는다. ── */

  /** 보고 있는 주차가 곧 불러온 주차일 때만 값이 있다. */
  const current = loaded?.id === weekId ? loaded : null
  const weekState: 'loading' | 'ok' | 'failed' = current === null ? 'loading' : current.status
  /** 작업 사본이 이 주차의 것이면 그것을, 아니면 불러온 그대로를 그린다. */
  const byDay = edit?.id === weekId ? edit.byDay : (current?.byDay ?? emptyByDay())
  const dirty = weekState === 'ok' && current !== null && !sameByDay(byDay, current.byDay)

  /**
   * ←/→. 🔴 **저장하지 않은 변경이 있으면 확인 모달을 먼저 띄운다.**
   * 조용히 버리면 「분명히 넣었는데 사라졌다」가 되고, 막아 버리면 실수로 한 번
   * 탭한 사람이 갇힌다 — 둘 다 나쁘다. 물어보는 것이 옳다.
   */
  const move = (delta: number) => {
    if (saving || weekState === 'loading') return
    const next = offset + delta
    if (dirty) {
      setPendingOffset(next)
      return
    }
    setAssigneeError(null)
    setOffset(next)
  }

  /** 🔴 편집은 **언제나 이 함수를 통한다** — 작업 사본에 주차 표를 함께 박기 위해서다. */
  const applyEdit = (next: ByDay) => setEdit({ id: weekId, byDay: next })

  const toggle = (day: DayKey, meal: MealKey, member: DutyMember) => {
    setAssigneeError(null)
    const cur = byDay[day][meal]
    const has = cur.includes(member.uid)
    /* §8.9.3 상한 4명. 🔴 넘으면 **추가하지 않고** 인라인으로 알린다. */
    if (!has && cur.length >= MAX_ASSIGNEES) {
      setAssigneeError(ER_TOO_MANY)
      return
    }
    const list = has ? cur.filter((u) => u !== member.uid) : [...cur, member.uid]
    applyEdit({ ...byDay, [day]: { ...byDay[day], [meal]: list } })
  }

  const removeAt = (day: DayKey, meal: MealKey, uid: string) => {
    setAssigneeError(null)
    applyEdit({
      ...byDay,
      [day]: { ...byDay[day], [meal]: byDay[day][meal].filter((u) => u !== uid) },
    })
  }

  /**
   * §8.9.3 — 한 끼니라도 담당자가 있으면 그 끼니는 **다섯 요일 전부** 채워야 한다.
   * 🔴 **담당자가 아예 없는 끼니는 검증하지 않는다** — 「아침 선도는 안 한다」가
   *   정당한 상태다. §8.9.3은 끼니 개념 이전에 쓰였다(W-21C 결정 1이 신설했다).
   */
  const hasMeal = (meal: MealKey) => WEEKDAYS.some((d) => byDay[d.key][meal].length > 0)
  const activeMeals = MEALS.filter((m) => hasMeal(m.key))

  const handleSave = () => {
    if (submittingRef.current || saving || current === null || weekState !== 'ok') return

    /* 담당자 — 편성된 끼니는 **다섯 요일 전부** 1명 이상이어야 한다(§8.9.3). */
    for (const meal of activeMeals) {
      if (WEEKDAYS.some((d) => byDay[d.key][meal.key].length === 0)) {
        setAssigneeError(ER_NO_ASSIGNEE)
        return
      }
    }

    submittingRef.current = true
    /* 🔴 새 주차의 `startDate`·`endDate`는 **여기서 계산한다.** W-21C는 `schedule`의
       값을 되썼고 문서가 없으면 `''`를 저장했다 — §9.3.6이 「필수 · `YYYY-MM-DD`」로
       규정하는 필드다. 주차 이동이 붙으면서 「문서가 없는 주차」가 흔해졌다. */
    const range = toWeekRange(viewDate)
    onSave(
      { weekId, startDate: range.startDate, endDate: range.endDate, byDay },
      current.exists,
      {
        lunchDays: countDays(current.byDay, 'lunch'),
        dinnerDays: countDays(current.byDay, 'dinner'),
      },
    )
  }

  return (
    <>
      <BottomSheet open={open} onClose={onClose}>
        {/* design `19a` 원문 — 제목 + 우측 주차 칩이 한 줄이다. `BottomSheet`의 `title`을
            쓰지 않는 이유가 그것이다(그쪽은 제목 한 줄만 그린다).
            🔴 **W-25 B-3 — 주차 칩 좌우에 이동 버튼이 붙었다.** 칩의 규격(`19a` 원문)은
            그대로이고 형제 둘이 늘었을 뿐이다. */}
        <div className="de-head">
          <h2 className="de-title">{TITLE}</h2>
          <div className="de-nav">
            <button
              type="button"
              className="de-navbtn"
              aria-label={PREV_WEEK}
              disabled={saving || weekState === 'loading'}
              onClick={() => move(-1)}
            >
              <ChevronLeftIcon />
            </button>
            {/* 🔴 `aria-live`가 있어야 화살표를 누른 스크린 리더 사용자가 어느 주로
                옮겨졌는지 안다 — 버튼 라벨은 `이전 주`로 고정이라 알려 주지 못한다. */}
            <span className="de-week" aria-live="polite">
              {weekLabel}
            </span>
            <button
              type="button"
              className="de-navbtn"
              aria-label={NEXT_WEEK}
              disabled={saving || weekState === 'loading'}
              onClick={() => move(1)}
            >
              <ChevronRightIcon />
            </button>
          </div>
        </div>

        {weekState === 'failed' ? (
          <p className="de-err" role="alert">
            {ER_WEEK_FAILED}
          </p>
        ) : weekState === 'loading' ? (
          /* 🔴 빈 편성표를 그리지 않는다 — 「담당자가 전부 지워졌다」로 읽힌다. */
          <p className="de-loading">{LOADING_WEEK}</p>
        ) : (
          <div className="de-days">
            {WEEKDAYS.map((day) => (
              <div key={day.key} className="de-day">
                <span className="de-badge" aria-hidden="true">
                  {day.label}
                </span>
                <div className="de-meals">
                  {MEALS.map((meal) => {
                    const uids = byDay[day.key][meal.key]
                    return (
                      <div key={meal.key} className="de-meal">
                        <span className="de-meal-label">{meal.label}</span>
                        <div className="de-chips">
                          {uids.map((uid) => (
                            <button
                              key={uid}
                              type="button"
                              className="de-chip"
                              aria-label={`${day.label}요일 ${meal.label} ${nameOf.get(uid) ?? uid} 담당 해제`}
                              onClick={() => removeAt(day.key, meal.key, uid)}
                            >
                              <span>{nameOf.get(uid) ?? uid}</span>
                              {/* design `19a` 원문 — 12px X. */}
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                                <path
                                  d="M3 3l6 6M9 3l-6 6"
                                  stroke="#1F5138"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                />
                              </svg>
                            </button>
                          ))}
                          <button
                            type="button"
                            className="de-add"
                            aria-label={`${day.label}요일 ${meal.label} 담당자 추가`}
                            onClick={() => setPicking({ day: day.key, meal: meal.key })}
                          >
                            {ADD_ASSIGNEE}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {assigneeError && (
          <p className="de-err" role="alert">
            {assigneeError}
          </p>
        )}

        <PrimaryButton
          label={SAVE}
          onClick={handleSave}
          loading={saving}
          disabled={weekState !== 'ok'}
          className="de-save"
        />

        {/* design `19d`·`19e` — 시트 위에 뜨는 팝오버. */}
        <AssigneePopover
          open={picking !== null}
          onClose={() => setPicking(null)}
          members={members}
          selected={picking ? byDay[picking.day][picking.meal] : []}
          onToggle={(member) => {
            if (picking) toggle(picking.day, picking.meal, member)
          }}
        />
      </BottomSheet>

      {/* 🔴 시트 **밖**이다 — `RecordSheet`의 MD-05와 같은 형태다(z 55 > 50). */}
      <ConfirmModal
        open={pendingOffset !== null}
        title={MD_DIRTY_TITLE}
        body={MD_DIRTY_BODY}
        confirmLabel={MD_DIRTY_CONFIRM}
        destructive
        onConfirm={() => {
          if (pendingOffset !== null) setOffset(pendingOffset)
          /* 🔴 작업 사본을 버린다 — 남겨 두면 그 주차로 되돌아왔을 때 「버린 변경」이
             되살아난다. `edit`은 주차 표를 갖고 있어 그대로 두면 조용히 부활한다. */
          setEdit(null)
          setAssigneeError(null)
          setPendingOffset(null)
        }}
        onCancel={() => setPendingOffset(null)}
      />
    </>
  )
}
