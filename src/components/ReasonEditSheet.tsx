import { useContext, useEffect, useId, useRef, useState } from 'react'
import { OverlayRootContext } from './AppShell'
import { BottomSheet } from './BottomSheet'
import { Field, type FieldHandle } from './Field'
import { PrimaryButton } from './PrimaryButton'
import { RecordSummaryCard } from './RecordActionSheet'
import { Segmented, type SegmentedItem } from './Segmented'
import { cn } from '../lib/cn'
import {
  capReasonText,
  REASON_TEXT_MAX,
  REASON_TEXT_MIN,
  validateReasonText,
  type ReasonCode,
  type RecordRow,
} from '../lib/records'
import { spawnSparkle } from '../lib/sparkle'
import { useOverlayTransition } from '../lib/useOverlayTransition'

/* ── §8.10 · design `18c`·`18d` 확정 문안. ─────────────────────────────── */
const TITLE = '사유 변경'
const LABEL_REASON = '적발 사유'
const SAVE = '변경 저장'
/** §8.6.2 #7·#8 — S6와 **같은 문구**다. 규격이 「S6와 동일 규격」을 요구한다(§8.7.4 T-06). */
const ETC_LABEL = '기타 사유'
const ETC_PLACEHOLDER = '예: 명찰 미착용'
const ETC_HINT = '사실만 짧게 적어 주세요. 학생에 대한 평가나 별명은 쓰지 않습니다'

/** §8.6.2 #6과 같은 3분할. `RecordSheet`와 값·순서가 같아야 한다. */
const REASONS: readonly SegmentedItem<ReasonCode>[] = [
  { value: 'DRESS', label: '복장 불량' },
  { value: 'SLIPPER', label: '실내화 미착용' },
  { value: 'ETC', label: '기타' },
]

/** §3.3 · §15.3 — 이 값을 넘기면 카운터가 danger색이 되고 그때부터만 낭독한다. */
const ETC_WARN_AT = 18

/** §8.6.4 T-04 접힘 0.18s. 펼침 0.24s는 CSS `-open` 쪽 선언이 갖는다. */
const ETC_COLLAPSE_MS = 180

interface ReasonEditSheetProps {
  open: boolean
  onClose: () => void
  onClosed?: () => void
  /** 닫힘 모션 동안 내용이 남아야 하므로 호출부가 즉시 비우지 않는다. */
  row: RecordRow | null
  saving: boolean
  onSave: (reasonCode: ReasonCode, reasonText: string | null) => void
}

/**
 * S7 사유 변경 시트 — §8.7.4 T-06 · §10.2 BR-07·BR-07a · design `18c`(비 `기타`) ·
 * `18d`(`기타` · **기존 값 채움**).
 *
 * 🔴 **초기화는 `key` 재마운트가 한다.** 호출부가 열 때마다 `key`를 올려 이 컴포넌트를
 * 새로 마운트하므로 사유·기입값이 **한 곳(마운트)에서** 초기화된다. `RecordSheet`와
 * 같은 계약이다 — `open`의 false→true를 effect로 감지하는 방식을 쓰지 마라(§3.5).
 *
 * 🔴 **`18d`의 「기존 값 채움」이 여기서 성립한다** — 마운트 시 `row.reasonText`를
 * 초기값으로 잡는다. `RecordSheet`는 항상 빈 값으로 시작하고 이 시트는 그러지 않는다.
 *
 * ⚠ **`기타`를 떠나면 기입값을 폐기한다**(EC-36 · S6와 같다). 다시 `기타`를 골라도
 *   빈 상태로 돌아온다 — 원래 값이 되살아나지 않는다. 두 시트의 동작을 갈라 두면
 *   같은 세그먼트가 화면마다 다르게 굴어 사용자가 예측할 수 없다.
 */
export function ReasonEditSheet({
  open,
  onClose,
  onClosed,
  row,
  saving,
  onSave,
}: ReasonEditSheetProps) {
  const overlayRoot = useContext(OverlayRootContext)
  const reasonLabelId = useId()

  /* 🔴 지연 초기화 state. setter가 있지만 초기값은 마운트 시점의 `row`가 정한다 —
     닫힘 모션 동안 `row`가 살아 있어야 하므로 호출부가 비우지 않는 것과 짝이다. */
  const [reasonCode, setReasonCode] = useState<ReasonCode>(() => row?.reasonCode ?? 'DRESS')
  const [reasonText, setReasonText] = useState(() => row?.reasonText ?? '')

  const etcRef = useRef<FieldHandle>(null)
  const etcRowRef = useRef<HTMLDivElement>(null)
  /* 🔴 상태가 아니라 ref다. `saving`은 같은 태스크의 5연타를 막지 못한다(W-06 §5-4). */
  const submittingRef = useRef(false)

  const isEtc = reasonCode === 'ETC'
  const { mounted: etcMounted, shown: etcShown } = useOverlayTransition(isEtc, ETC_COLLAPSE_MS)

  /**
   * T-03 — 펼침과 함께 자동 포커스.
   * ⚠ **`18d`는 처음부터 펼쳐진 채로 열린다.** 그때도 포커스를 옮기는 것이 맞다 —
   * 사용자가 고치러 들어온 값이 곧 그 필드다.
   */
  useEffect(() => {
    if (!etcMounted) return
    etcRef.current?.focus()
    etcRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [etcMounted])

  const handleReason = (next: ReasonCode, event: React.MouseEvent<HTMLButtonElement>) => {
    if (next === reasonCode) return
    /* §7.4 「주 버튼 위 `#fff`」 — `18c`의 sparkle이 그것이다. */
    spawnSparkle(overlayRoot, event.clientX, event.clientY, '#fff')
    setReasonCode(next)
    /* 🔴 BR-07a · EC-36 — `기타`를 떠나면 기입값을 폐기한다. */
    if (next !== 'ETC') setReasonText('')
  }

  const handleSave = () => {
    if (submittingRef.current || saving) return
    if (isEtc && validateReasonText(reasonText) !== null) {
      /* 시트를 유지하고 인라인 에러 + shake. `Field`가 둘 다 소유한다. */
      etcRef.current?.validate()
      return
    }
    submittingRef.current = true
    /* 🔴 BR-07a — `ETC`가 아니면 필드를 빼는 것이 아니라 `null`이다(§9.6 필수 조건 5). */
    onSave(reasonCode, isEtc ? reasonText.trim() : null)
  }

  const etcLength = reasonText.length
  const etcOverWarn = etcLength > ETC_WARN_AT
  const canSave = !isEtc || reasonText.trim().length >= REASON_TEXT_MIN

  return (
    <BottomSheet open={open} onClose={onClose} onClosed={onClosed} title={TITLE}>
      {row && <RecordSummaryCard row={row} gap />}

      <div id={reasonLabelId} className="rs-label">
        {LABEL_REASON}
      </div>
      <Segmented
        items={REASONS}
        value={reasonCode}
        onChange={handleReason}
        labelledBy={reasonLabelId}
        expanded={isEtc}
        disabled={saving}
      />

      {etcMounted && (
        <div className={cn('rs-etc', etcShown && 'rs-etc-open')}>
          <div ref={etcRowRef} className="rs-etc-row">
            <Field
              ref={etcRef}
              label={ETC_LABEL}
              placeholder={ETC_PLACEHOLDER}
              value={reasonText}
              onChange={setReasonText}
              transform={capReasonText}
              validate={validateReasonText}
              submitting={saving}
              counter={
                <span
                  className={cn('rs-count', etcOverWarn && 'rs-count-warn')}
                  aria-live={etcOverWarn ? 'polite' : 'off'}
                >
                  {etcLength}/{REASON_TEXT_MAX}
                </span>
              }
            />
            {/* 에러가 뜨면 `Field`의 문구가 이 자리를 대신한다(design `17d`). */}
            <div className="rs-hint">{ETC_HINT}</div>
          </div>
        </div>
      )}

      <PrimaryButton
        label={SAVE}
        onClick={handleSave}
        disabled={!canSave}
        loading={saving}
        className="rs-save"
      />
    </BottomSheet>
  )
}
