import { useId, useState } from 'react'
import { BottomSheet } from './BottomSheet'
import { PrimaryButton } from './PrimaryButton'
import { Segmented, type SegmentedItem } from './Segmented'
import { ATTENDANCE_LABEL, type AttendanceStatus } from '../lib/attendance'
import { WEEKDAYS, MEALS, type MealKey } from '../lib/duty'
import type { DayKey } from '../lib/dateKeys'

/* ── 🔴 W-25 기능 4 — §8.10 사전에 없는 문구다(보고서 §9 ③). ───────────── */
const TITLE = '출석 기록'
const LABEL_STATE = '출석 여부'
const SAVE = '출석 저장'

/**
 * §7.1 토큰. 🔴 **리터럴을 새로 짓지 않았다** — 초록은 주 버튼 그라디언트,
 * 빨강은 `--color-sundo-danger`, 노랑은 §7.1의 `warn` 계열이다.
 * 값 자체는 `index.css`가 갖고 여기서는 변수 이름만 부른다.
 */
const TONE: Readonly<Record<AttendanceStatus, string>> = {
  present: 'var(--gradient-primary)',
  late: 'var(--color-sundo-warn)',
  absent: 'var(--color-sundo-danger)',
}

/** 🔴 표시 순서는 사용자 원문 그대로다 — 정상 · 지각 · 불참. */
const ITEMS: readonly SegmentedItem<AttendanceStatus>[] = [
  { value: 'present', label: ATTENDANCE_LABEL.present },
  { value: 'late', label: ATTENDANCE_LABEL.late },
  { value: 'absent', label: ATTENDANCE_LABEL.absent },
]

const DAY_LABEL = new Map(WEEKDAYS.map((d) => [d.key, d.label]))
const MEAL_LABEL = new Map(MEALS.map((m) => [m.key, m.label]))

export interface AttendanceTarget {
  day: DayKey
  meal: MealKey
  uid: string
  name: string
  /** 이미 찍혀 있으면 그 값에서 시작한다(사용자 요구 — 기록된 출석의 수정). */
  current: AttendanceStatus | null
}

interface AttendanceMarkSheetProps {
  open: boolean
  onClose: () => void
  onClosed?: () => void
  /** 닫힘 0.38s 동안 내용이 남아 있어야 하므로 호출부가 **즉시 비우지 않는다**. */
  target: AttendanceTarget | null
  saving: boolean
  onSave: (status: AttendanceStatus) => void
}

/**
 * W-25 기능 4 ② — **한 담당자의 출석을 찍는 시트.**
 *
 * 🔴 **사용자 요구가 「기존 웹의 `기록 작성`과 똑같은 위젯」이다.** 그래서 `RecordSheet`의
 * 뼈대를 그대로 쓴다 — 제목 · 아바타 요약 카드 · 라벨 + `Segmented` · 주 버튼.
 * 클래스도 `.rs-*`를 **그대로** 재사용한다(새 규격을 짓지 않는다).
 *
 * 🔴 **다른 점 셋이 전부 요구 원문이다.**
 * ① 세그먼트 3종이 `복장 불량`·`실내화 미착용`·`기타` → `정상`·`지각`·`불참`
 * ② **`일시` 라벨과 그 아래 날짜 상자를 지웠다.** 출석은 「언제 일어났나」가 아니라
 *    「그 칸에 나왔나」라 시각 입력이 의미를 갖지 않는다 — 찍은 시각은 문서의
 *    `at`에 서버가 박는다(`attendance.ts`).
 * ③ 인디케이터 색이 선택값에 따라 초록·노랑·빨강으로 갈린다.
 *
 * 🔴 **`기타` 자유 기입이 없다.** 세 값 중 하나가 전부이므로 `Field`도 카운터도
 * 중복 검사도 오지 않는다 — `RecordSheet`의 절반은 여기 존재할 이유가 없다.
 *
 * ⚠ **아바타는 `/DSHS.png`다** — 대상이 명부 학생이 아니라 **가입 계정(부원)**이라
 * S8 부원 행(`.mrow-av`)과 같은 이미지를 쓴다(W-21 결정 4).
 */
export function AttendanceMarkSheet({
  open,
  onClose,
  onClosed,
  target,
  saving,
  onSave,
}: AttendanceMarkSheetProps) {
  const labelId = useId()
  /**
   * 🔴 **초기값은 마운트에서 한 번만 잡는다**(§3.5). 호출부가 열 때마다 `key`를 올려
   * 새로 마운트하므로 「이미 찍힌 값에서 시작」이 한 곳에서 끝난다.
   * ⚠ 아직 안 찍힌 칸은 `정상`에서 시작한다 — §8.6.2 #6의 「좌 기본 선택」과 같은 규율이다.
   */
  const [status, setStatus] = useState<AttendanceStatus>(() => target?.current ?? 'present')

  const meta = target
    ? `${DAY_LABEL.get(target.day) ?? ''}요일 · ${MEAL_LABEL.get(target.meal) ?? ''}`
    : ''

  return (
    <BottomSheet open={open} onClose={onClose} onClosed={onClosed} title={TITLE}>
      {/* §8.6.2 #4와 같은 요약 카드. 아바타는 장식이라 읽히지 않는다. */}
      <div className="rs-card">
        <span className="rs-avatar" aria-hidden="true">
          <img src="/DSHS.png" alt="" className="h-full w-full object-cover" />
        </span>
        <span className="min-w-0">
          <span className="rs-name">{target?.name ?? ''}</span>
          <span className="rs-meta">{meta}</span>
        </span>
      </div>

      <div id={labelId} className="rs-label">
        {LABEL_STATE}
      </div>
      <Segmented
        items={ITEMS}
        value={status}
        onChange={(next) => setStatus(next)}
        labelledBy={labelId}
        disabled={saving}
        indicatorColor={TONE[status]}
      />

      <PrimaryButton
        label={SAVE}
        onClick={() => onSave(status)}
        loading={saving}
        disabled={target === null}
        className="rs-save"
      />
    </BottomSheet>
  )
}
