import { useState } from 'react'
import { BottomSheet } from './BottomSheet'
import { cn } from '../lib/cn'
import type { DayKey } from '../lib/dateKeys'
import { ATTENDANCE_LABEL, markKey, type AttendanceMap } from '../lib/attendance'
import { isWeekend, MEALS, WEEKDAYS, type DutySchedule, type MealKey } from '../lib/duty'

/* ── 🔴 W-25 기능 4 — 아래 문구는 전부 이 회차가 새로 짓는다(§8.10 사전에 없다). ── */
const TITLE = '출석 체크'
/** 사용자 원문. 하단 초록 텍스트다. */
const UNLOCK = '과거 혹은 미래의 출석 여부를 기록할까요?'
/** 잠금이 풀린 뒤 그 자리에 남는 말. 초록 텍스트가 사라지기만 하면 무슨 일이 났는지 모른다. */
const UNLOCKED = '이번 주 전체 요일을 기록할 수 있습니다'
/** 편성이 아예 없는 주차. 「담당자가 없으면 찍을 것도 없다」를 그대로 말한다. */
const EMPTY = '이 주차에 편성된 담당자가 없습니다'
/** 오늘이 토·일이면 잠긴 상태에서 찍을 수 있는 칸이 하나도 없다. */
const WEEKEND_HINT = '주말에는 아래 안내를 눌러 요일을 선택해 주세요'

/** 색은 §7.1 토큰이다. 여기서 리터럴을 짓지 않는다. */
const TONE_CLASS: Readonly<Record<string, string>> = {
  present: 'at-row-present',
  late: 'at-row-late',
  absent: 'at-row-absent',
}

interface AttendanceSheetProps {
  open: boolean
  onClose: () => void
  onClosed?: () => void
  /** design `19a`와 같은 형태의 우측 주차 칩. */
  weekLabel: string
  /** `null`이면 이 주차에 문서가 없다 — 편성이 0이므로 찍을 칸도 0이다. */
  schedule: DutySchedule | null
  marks: AttendanceMap
  /** 오늘 요일. 잠금 기본값이 이 하나로 갈린다. */
  todayKey: DayKey
  onPick: (day: DayKey, meal: MealKey, uid: string, name: string) => void
}

/**
 * W-25 기능 4 ① — **주차별 담당자 출석 표.** S9 우상단 `출석 체크`가 여는 시트다.
 *
 * 🔴 **design 산출물에 이 화면의 시안이 0건이다**(전수 확인). 그래서 **새 규격을
 * 짓지 않고** 이미 있는 두 부품의 배치를 그대로 빌렸다 —
 * 요일 배지·끼니 라벨은 `19a`(편집 시트)의 `.de-badge`·`.de-meal-label`,
 * 담당자 행은 S8 부원 행(`.mrow-*`)의 「이름 + 우측 상태」 구조다.
 *
 * 🔴 **기본값은 「오늘만」이다**(사용자 요구). 다른 요일 행은 `disabled`이고,
 * 하단 초록 텍스트를 누르면 **그 주 전체**가 열린다. ⚠ 「과거 혹은 미래」라는
 * 문구가 다른 **주차**를 뜻하지 않는다 — 사용자 원문이 「해당 버튼을 클릭한 주(Week)에
 * 등록된 담당자들의 날짜(월~금)별」로 범위를 그 주 안으로 못 박았다.
 *
 * 🔴 **권한 판정을 여기서 하지 않는다.** 이 시트가 떠 있다는 것은 호출부가 이미
 * 「차장 이상」으로 걸렀다는 뜻이다 — 판정이 두 곳에 있으면 두 곳이 갈린다
 * (`RecordActionSheet`와 같은 규율).
 */
export function AttendanceSheet({
  open,
  onClose,
  onClosed,
  weekLabel,
  schedule,
  marks,
  todayKey,
  onPick,
}: AttendanceSheetProps) {
  /** 🔴 `key` 재마운트로 열리므로 잠금은 열 때마다 다시 걸린다(§3.5). */
  const [unlocked, setUnlocked] = useState(false)

  /* 편성된 칸이 하나라도 있는가. 없으면 표 대신 한 줄로 말한다. */
  const hasAny = WEEKDAYS.some((d) =>
    MEALS.some((m) => (schedule?.assigneeNames[d.key]?.[m.key]?.length ?? 0) > 0),
  )

  return (
    <BottomSheet open={open} onClose={onClose} onClosed={onClosed}>
      {/* `19a`와 같은 머리 — 제목 + 우측 주차 칩. */}
      <div className="de-head">
        <h2 className="de-title">{TITLE}</h2>
        <span className="de-week">{weekLabel}</span>
      </div>

      {!hasAny ? (
        <p className="de-loading">{EMPTY}</p>
      ) : (
        <div className="de-days">
          {WEEKDAYS.map((day) => {
            /* 🔴 주말이면 `todayKey`가 `sat`·`sun`이라 **어느 행과도 같지 않다** —
               잠금을 풀기 전에는 전부 비활성이 된다. 그것이 옳은 결과다. */
            const dayOpen = unlocked || day.key === todayKey
            return (
              <div key={day.key} className={cn('de-day', !dayOpen && 'at-day-locked')}>
                <span className="de-badge" aria-hidden="true">
                  {day.label}
                </span>
                <div className="de-meals">
                  {MEALS.map((meal) => {
                    const names = schedule?.assigneeNames[day.key]?.[meal.key] ?? []
                    const uids = schedule?.assigneeUids[day.key]?.[meal.key] ?? []
                    if (names.length === 0) return null
                    return (
                      <div key={meal.key} className="de-meal">
                        <span className="de-meal-label">{meal.label}</span>
                        <div className="at-rows">
                          {names.map((name, i) => {
                            /* 🔴 이름과 uid는 **같은 인덱스**가 같은 사람이다(`duty.ts` 계약). */
                            const uid = uids[i] ?? ''
                            const mark = uid ? marks[markKey(day.key, meal.key, uid)] : undefined
                            return (
                              <button
                                key={`${uid}-${i}`}
                                type="button"
                                className={cn(
                                  'at-row',
                                  mark && TONE_CLASS[mark.status],
                                )}
                                /* uid가 없는 칸은 옛 형태에서 승격된 이름뿐인 편성이다 —
                                   어느 계정인지 모르므로 찍을 수 없다. */
                                disabled={!dayOpen || !uid}
                                aria-label={`${day.label}요일 ${meal.label} ${name} 출석 ${
                                  mark ? ATTENDANCE_LABEL[mark.status] : '미기록'
                                }`}
                                onClick={() => onPick(day.key, meal.key, uid, name)}
                              >
                                <span className="at-row-name">{name}</span>
                                <span className="at-row-state" aria-hidden="true">
                                  {mark ? ATTENDANCE_LABEL[mark.status] : '—'}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 🔴 사용자 요구 — 하단 **초록** 텍스트. 누르면 그 주 전체가 열린다.
          한 번 열리면 되돌리는 버튼을 두지 않는다: 잠금은 실수 방지용이고,
          「다시 잠근다」는 아무 것도 지켜 주지 않으면서 조작만 하나 늘린다. */}
      {hasAny &&
        (unlocked ? (
          <p className="at-unlocked">{UNLOCKED}</p>
        ) : (
          <button type="button" className="at-unlock" onClick={() => setUnlocked(true)}>
            {UNLOCK}
          </button>
        ))}
      {hasAny && !unlocked && isWeekend(todayKey) && <p className="at-unlocked">{WEEKEND_HINT}</p>}
    </BottomSheet>
  )
}
