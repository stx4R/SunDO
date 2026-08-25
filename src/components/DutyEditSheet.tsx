import { useEffect, useMemo, useRef, useState } from 'react'
import { AssigneePopover } from './AssigneePopover'
import { BottomSheet } from './BottomSheet'
import { Field, type FieldHandle } from './Field'
import { PrimaryButton } from './PrimaryButton'
import type { DayKey } from '../lib/dateKeys'
import {
  fetchDutyMembers,
  MAX_ASSIGNEES,
  MEALS,
  WEEKDAYS,
  type ByMeal,
  type DutyDraft,
  type DutyMember,
  type DutySchedule,
  type MealKey,
  type PatrolDefaults,
} from '../lib/duty'

/* ── §8.9 · design `19a`~`19c` 확정 문안. ─────────────────────────────── */
const TITLE = '순찰 일정 편집'
const SAVE = '일정 저장'
/** design `19a` 원문 — 요일 행 끝의 점선 칩. */
const ADD_ASSIGNEE = '+ 담당자'
/** design `19a` 원문 필드 라벨. */
const LABEL_TIME = '순찰 시간'
const LABEL_PLACE = '순찰 장소'

/**
 * §8.9.3 입력 검증 — **PRD가 문구를 고정한다.**
 *
 * 🔴 **`19c`와 §8.9.3은 충돌이 아니라 두 상태다**(사용자 확정 · 보고서 §9 ④).
 * S6의 ER-15/ER-16이 정확히 같은 형태다 — 빈 값과 「짧다」를 갈라 말한다.
 */
const ER_PLACE_EMPTY = '순찰 장소를 입력해 주세요'
const ER_PLACE_SHORT = '장소를 2자 이상 입력해 주세요'
const ER_TIME_FORMAT = '시간 형식이 올바르지 않습니다 (예: 07:50)'
const ER_NO_ASSIGNEE = '요일마다 담당자를 1명 이상 지정해 주세요'
const ER_TOO_MANY = `한 요일에 최대 ${MAX_ASSIGNEES}명까지 지정할 수 있습니다`

/** §8.9.3 순찰 장소 2~20자. `records`의 `reasonText`와 같은 상·하한이다. */
const PLACE_MIN = 2
const PLACE_MAX = 20

/** §8.9.3 `HH:mm` 24시간제. */
const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

function validatePlace(v: string): string | null {
  const t = v.trim()
  if (t.length === 0) return ER_PLACE_EMPTY
  if (t.length < PLACE_MIN) return ER_PLACE_SHORT
  return null
}

function validateTime(v: string): string | null {
  return TIME_RE.test(v.trim()) ? null : ER_TIME_FORMAT
}

/** 21번째 글자부터 입력되지 않는다. `capReasonText`와 같은 계약이다(§7.3 `transform`). */
function capPlace(raw: string, caret: number): { value: string; caret: number } {
  if (raw.length <= PLACE_MAX) return { value: raw, caret }
  return { value: raw.slice(0, PLACE_MAX), caret: Math.min(caret, PLACE_MAX) }
}

interface DutyEditSheetProps {
  open: boolean
  onClose: () => void
  weekId: string
  /** `8월 4주차` — design `19a`의 우측 칩. */
  weekLabel: string
  /** `null`이면 문서가 없는 주차다(§8.9.5 EM-06 → `지금 등록하기`). */
  schedule: DutySchedule | null
  defaults: PatrolDefaults | null
  saving: boolean
  onSave: (draft: DutyDraft) => void
}

type ByDay = Record<DayKey, ByMeal<readonly string[]>>

/** 🔴 다섯 요일 × 두 끼니가 **항상** 있는 형태. `duty.ts`의 읽기 계층과 같은 계약이다. */
function initialByDay(schedule: DutySchedule | null): ByDay {
  const out = {} as ByDay
  for (const day of WEEKDAYS) {
    const cell = schedule?.assigneeUids[day.key]
    out[day.key] = { lunch: [...(cell?.lunch ?? [])], dinner: [...(cell?.dinner ?? [])] }
  }
  return out
}

/**
 * S9 순찰 일정 편집 시트 — §8.9.3·§8.9.4 T-02·T-03 · design `19a`(기본)·`19b`(포커스)·
 * `19c`(에러) · `19d`·`19e`(담당자 팝오버).
 *
 * 🔴 **초기화는 `key` 재마운트가 한다**(§3.5 · `RecordSheet`·`ReasonEditSheet`와 같은 계약).
 *
 * 🔴 **design `19`에 중식/석식이 없다.** 결정 3(요일 행 안에 두 줄)이 방향을 주고, 아래
 * 규격 공백을 이 회차가 채웠다 — **전부 보고서 §9 ③에 올렸다**:
 *   ① 요일 행이 `19a`의 1줄에서 **끼니 2줄**로 늘어난다. 배지·칩·점선 칩 규격은 `19a` 원문 그대로다
 *   ② 시간·장소 필드가 2개에서 **4개**(끼니 × 2)가 된다. `19a`의 `display:flex;gap:10px`
 *      한 줄을 **끼니마다 한 줄씩** 두 줄로 쌓았다
 *   ③ 끼니 구분 라벨(`중식`·`석식`)은 신설이다 — `19a`에 대응 요소가 없다
 *
 * ⚠ **§8.9.3의 「이번 주 또는 다음 주만」은 이 시트가 막지 않는다.** 시트는 호출부가 준
 * `weekId` 하나만 편집하고 주차를 고르는 UI가 없다 — 규격이 요구하는 제약이 **구조적으로**
 * 성립한다. 규칙도 이것을 표현할 수 없다(보고서 §4).
 */
export function DutyEditSheet({
  open,
  onClose,
  weekId,
  weekLabel,
  schedule,
  defaults,
  saving,
  onSave,
}: DutyEditSheetProps) {
  const [byDay, setByDay] = useState<ByDay>(() => initialByDay(schedule))
  const [time, setTime] = useState<ByMeal<string>>(() => ({
    lunch: schedule?.patrolTime.lunch ?? defaults?.patrolTime ?? '',
    dinner: schedule?.patrolTime.dinner ?? '',
  }))
  const [place, setPlace] = useState<ByMeal<string>>(() => ({
    lunch: schedule?.patrolPlace.lunch ?? defaults?.patrolPlace ?? '',
    dinner: schedule?.patrolPlace.dinner ?? '',
  }))
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

  /** uid → 이름. 🔴 **칩은 편집 중인 uid를 그리므로 저장된 스냅샷이 아니라 이 맵을 본다.** */
  const nameOf = useMemo(() => new Map(members.map((m) => [m.uid, m.name])), [members])

  const fieldRefs = useRef<Record<string, FieldHandle | null>>({})
  /* 🔴 상태가 아니라 ref다(W-06 §5-4). */
  const submittingRef = useRef(false)

  useEffect(() => {
    if (!open) submittingRef.current = false
  }, [open])

  const toggle = (day: DayKey, meal: MealKey, member: DutyMember) => {
    setAssigneeError(null)
    setByDay((prev) => {
      const cur = prev[day][meal]
      const has = cur.includes(member.uid)
      /* §8.9.3 상한 4명. 🔴 넘으면 **추가하지 않고** 인라인으로 알린다. */
      if (!has && cur.length >= MAX_ASSIGNEES) {
        setAssigneeError(ER_TOO_MANY)
        return prev
      }
      const next = has ? cur.filter((u) => u !== member.uid) : [...cur, member.uid]
      return { ...prev, [day]: { ...prev[day], [meal]: next } }
    })
  }

  const removeAt = (day: DayKey, meal: MealKey, uid: string) => {
    setAssigneeError(null)
    setByDay((prev) => ({
      ...prev,
      [day]: { ...prev[day], [meal]: prev[day][meal].filter((u) => u !== uid) },
    }))
  }

  /**
   * §8.9.3 — 한 끼니라도 담당자가 있으면 그 끼니의 시간·장소가 필수다.
   * 🔴 **담당자가 아예 없는 끼니는 검증하지 않는다** — 「석식은 안 한다」가 정당한 상태다.
   *   §8.9.3은 끼니 개념 이전에 쓰였고(결정 1이 신설했다), 「편성하지 않은 끼니」에
   *   시간·장소를 강요하면 중식만 도는 주차를 저장할 수 없다.
   */
  const hasMeal = (meal: MealKey) => WEEKDAYS.some((d) => byDay[d.key][meal].length > 0)
  const activeMeals = MEALS.filter((m) => hasMeal(m.key))

  const handleSave = () => {
    if (submittingRef.current || saving) return

    /* ① 담당자 — 편성된 끼니는 **다섯 요일 전부** 1명 이상이어야 한다(§8.9.3). */
    for (const meal of activeMeals) {
      if (WEEKDAYS.some((d) => byDay[d.key][meal.key].length === 0)) {
        setAssigneeError(ER_NO_ASSIGNEE)
        return
      }
    }

    /* ② 시간·장소 — `Field`가 인라인 에러 + shake를 소유한다. */
    for (const meal of activeMeals) {
      const t = fieldRefs.current[`time-${meal.key}`]
      const p = fieldRefs.current[`place-${meal.key}`]
      if (validateTime(time[meal.key]) !== null) {
        t?.validate()
        return
      }
      if (validatePlace(place[meal.key]) !== null) {
        p?.validate()
        return
      }
    }

    submittingRef.current = true
    onSave({
      weekId,
      startDate: schedule?.startDate ?? '',
      endDate: schedule?.endDate ?? '',
      byDay,
      /* 🔴 편성이 없는 끼니는 `null`이다 — 빈 문자열을 저장하면 조회 화면이
         `" · 중앙 현관"`처럼 반쪽짜리 줄을 그린다(`patrolLine`은 둘 다 있을 때만 그린다). */
      patrolTime: {
        lunch: hasMeal('lunch') ? time.lunch.trim() || null : null,
        dinner: hasMeal('dinner') ? time.dinner.trim() || null : null,
      },
      patrolPlace: {
        lunch: hasMeal('lunch') ? place.lunch.trim() || null : null,
        dinner: hasMeal('dinner') ? place.dinner.trim() || null : null,
      },
    })
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      {/* design `19a` 원문 — 제목 + 우측 주차 칩이 한 줄이다. `BottomSheet`의 `title`을
          쓰지 않는 이유가 그것이다(그쪽은 제목 한 줄만 그린다). */}
      <div className="de-head">
        <h2 className="de-title">{TITLE}</h2>
        <span className="de-week">{weekLabel}</span>
      </div>

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

      {assigneeError && (
        <p className="de-err" role="alert">
          {assigneeError}
        </p>
      )}

      {/* 🔴 규격 공백 ② — `19a`의 한 줄(시간·장소)을 **끼니마다 한 줄씩** 쌓았다. */}
      {MEALS.map((meal) => (
        <div key={meal.key} className="de-patrol">
          <span className="de-meal-label">{meal.label}</span>
          <div className="de-patrol-row">
            <Field
              ref={(h) => {
                fieldRefs.current[`time-${meal.key}`] = h
              }}
              label={LABEL_TIME}
              placeholder="07:50"
              value={time[meal.key]}
              onChange={(v) => setTime((p) => ({ ...p, [meal.key]: v }))}
              validate={validateTime}
              submitting={saving}
            />
            <Field
              ref={(h) => {
                fieldRefs.current[`place-${meal.key}`] = h
              }}
              label={LABEL_PLACE}
              placeholder="중앙 현관"
              value={place[meal.key]}
              onChange={(v) => setPlace((p) => ({ ...p, [meal.key]: v }))}
              transform={capPlace}
              validate={validatePlace}
              submitting={saving}
            />
          </div>
        </div>
      ))}

      <PrimaryButton label={SAVE} onClick={handleSave} loading={saving} className="de-save" />

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
  )
}
