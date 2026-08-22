import { useContext, useEffect, useId, useRef, useState } from 'react'
import { OverlayRootContext } from './AppShell'
import { BottomSheet } from './BottomSheet'
import { ConfirmModal } from './ConfirmModal'
import { Field, type FieldHandle } from './Field'
import { PrimaryButton } from './PrimaryButton'
import { Segmented, type SegmentedItem } from './Segmented'
import { useToast } from './Toast'
import { useAuth } from '../contexts/AuthProvider'
import { cn } from '../lib/cn'
import { formatDateTimeKst } from '../lib/dateKeys'
import {
  capReasonText,
  checkDuplicate,
  REASON_TEXT_MAX,
  REASON_TEXT_MIN,
  validateReasonText,
  writeRecord,
  type ReasonCode,
} from '../lib/records'
import type { Student } from '../lib/roster'
import { spawnSparkle } from '../lib/sparkle'
import { clearHomeCache } from '../lib/stats'
import { useOnline } from '../lib/useOnline'
import { useOverlayTransition } from '../lib/useOverlayTransition'

/* ── §8.10 · §8.6 확정 문안. 새로 짓지 마라. ───────────────────────────── */
const TITLE = '기록 작성'
const LABEL_REASON = '적발 사유'
const LABEL_WHEN = '일시'
const BADGE_AUTO = '자동 입력'
const SAVE = '기록 저장'
/** §8.10.5 S6 하단 상시 안내. */
const NOTE_ONLINE = '저장 즉시 모든 부원에게 반영됩니다'
/** §8.6.5 오프라인 교체 문구. */
const NOTE_OFFLINE = '오프라인 저장 후 연결되면 전송됩니다'
/** §8.6.2 #7·#8. */
const ETC_LABEL = '기타 사유'
const ETC_PLACEHOLDER = '예: 명찰 미착용'
const ETC_HINT = '사실만 짧게 적어 주세요. 학생에 대한 평가나 별명은 쓰지 않습니다'
/** §8.10.1 TS-01 · TS-02. */
const TS_01 = '기록 저장됨'
const TS_02 = '기록 저장됨 · 연결되면 자동 전송'
/** §8.6.3 — §8.10 사전에 코드가 없다(보고서 §7 신규 후보). */
const NO_STUDENT = '학생 정보를 확인할 수 없습니다'
const NO_PERMISSION = '기록 작성 권한이 없습니다'
/** §11.4 E-2001. */
const E_2001 = '방금 같은 사유로 기록했습니다 (30분 내 중복 불가)'
/** §8.10.4 MD-05. */
const MD_05_TITLE = '중복 기록 확인'
const MD_05_BODY = '오늘 이미 같은 사유로 기록된 학생입니다. 계속할까요?'
const MD_05_CONFIRM = '계속'

/** §8.6.2 #6 — 좌 기본 선택. `Segmented`는 이 대응을 모른다. */
const REASONS: readonly SegmentedItem<ReasonCode>[] = [
  { value: 'DRESS', label: '복장 불량' },
  { value: 'SLIPPER', label: '실내화 미착용' },
  { value: 'ETC', label: '기타' },
]

/** §3.3 · §15.3 — 이 값을 **넘기면** 카운터가 danger색이 되고 그때부터만 낭독한다. */
const ETC_WARN_AT = 18

/** §8.6.4 T-04 접힘 0.18s. 펼침 0.24s는 CSS `-open` 쪽 선언이 갖는다. */
const ETC_COLLAPSE_MS = 180

/** §11.2 OP-04 권한 — `teacher`는 없다. */
const WRITER_ROLES = new Set(['member', 'vice', 'head', 'dev'])

/* design 12c 계열 인라인 배너 아이콘. `Login`·`Signup`이 각자 갖고 있는 것과 같은
   형태다 — 화면별 클래스 규약(`.s1-*`·`.s2-*`)을 따라 옮기지 않는다. */
function AlertIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 14 14"
      fill="none"
      className="mt-[1.5px] flex-none"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="5.6" stroke="#C0392B" strokeWidth="1.9" />
      <path d="M7 6.3v3.4" stroke="#C0392B" strokeWidth="1.9" strokeLinecap="round" />
      <circle cx="7" cy="4.4" r="0.95" fill="#C0392B" />
    </svg>
  )
}

interface RecordSheetProps {
  open: boolean
  /** 닫기 **요청**. 호출부는 `open`을 내리기만 한다(§3.5). */
  onClose: () => void
  /** 닫힘 모션까지 끝난 뒤 1회. S5의 행 탭 빗장을 여기서 푼다(§3.6). */
  onClosed?: () => void
  /** 닫힘 0.38s 동안 내용이 사라지면 안 되므로 호출부가 **즉시 비우지 않는다**. */
  student: Student | null
  grade: number
  classNo: number
  academicYear: number
}

/**
 * S6 기록 작성 시트 — PRD §8.6 · design `17a`~`17d`.
 *
 * 🔴 **초기화는 `key` 재마운트가 한다.** 호출부(S5)가 열 때마다 `key`를 올려
 * 이 컴포넌트를 새로 마운트하므로 `occurredAt`·`clientRecordId`·사유·기타 입력값이
 * **한 곳(마운트)에서** 초기화된다. `open`의 false→true를 `useEffect`로 감지해
 * 상태를 되돌리는 방식을 쓰지 마라 — 초기화 누락이 반드시 하나 생긴다(§3.5).
 *
 * 히스토리(N-02)는 `BottomSheet`가 이미 소유한다 — 같은 경로에 `state` 표식만 얹고
 * 표식이 사라지면 닫는다. `history.pushState`를 직접 부르는 코드는 이 트리에 없다.
 */
export function RecordSheet({
  open,
  onClose,
  onClosed,
  student,
  grade,
  classNo,
  academicYear,
}: RecordSheetProps) {
  const { profile } = useAuth()
  const toast = useToast()
  const online = useOnline()
  const overlayRoot = useContext(OverlayRootContext)
  const reasonLabelId = useId()

  /* 🔴 마운트 시각·마운트당 1개의 멱등키. 둘 다 **렌더에서 읽히므로** ref가 아니라
     지연 초기화 state다(`useRef`를 렌더에서 읽는 것은 react(refs) 위반이다).
     setter를 꺼내지 않으므로 값은 마운트 이후 절대 바뀌지 않는다 —
     `occurredAt`은 저장 시각이 아니라 시트 오픈 시각이고(EC-15 · T-01),
     `clientRecordId`는 MD-05 확인·재시도에도 같아야 한다(BR-02). */
  const [occurredAt] = useState(() => new Date())
  const [clientRecordId] = useState(() => crypto.randomUUID())

  const [reasonCode, setReasonCode] = useState<ReasonCode>('DRESS')
  const [reasonText, setReasonText] = useState('')
  const [banner, setBanner] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const etcRef = useRef<FieldHandle>(null)
  const etcRowRef = useRef<HTMLDivElement>(null)
  /* 🔴 상태가 아니라 ref다. `saving`은 같은 태스크의 5연타를 막지 못한다(W-06 §5-4). */
  const submittingRef = useRef(false)

  const isEtc = reasonCode === 'ETC'
  /* T-04 — 접힘 0.18s 동안 내용이 남아 있어야 역방향 모션이 보인다. */
  const { mounted: etcMounted, shown: etcShown } = useOverlayTransition(isEtc, ETC_COLLAPSE_MS)

  /**
   * T-03 — 펼침과 함께 **자동 포커스**.
   * AC-12 — 키보드가 올라오면 시트가 밀려 저장 버튼을 가릴 수 있다. 포커스 직후
   * `scrollIntoView({ block: 'nearest' })`로 보정한다. 스크롤 소유자는 여전히
   * `AppShell` 하나이고 시트 안에 스크롤 컨테이너를 만들지 않는다 —
   * `nearest`는 스크롤이 필요 없으면 아무 것도 하지 않는다.
   */
  useEffect(() => {
    if (!etcMounted) return
    etcRef.current?.focus()
    etcRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [etcMounted])

  const handleReason = (next: ReasonCode, event: React.MouseEvent<HTMLButtonElement>) => {
    if (next === reasonCode) return
    /* §7.4 「주 버튼 위 `#fff`」 — 선택된 쪽이 그라디언트라 녹색 파티클은 묻힌다. */
    spawnSparkle(overlayRoot, event.clientX, event.clientY, '#fff')
    setReasonCode(next)
    setBanner(null)
    /* 🔴 T-04 · EC-36 — `기타`를 떠나면 입력값을 **폐기**한다. 다시 골라도 빈 상태다. */
    if (next !== 'ETC') setReasonText('')
  }

  const finishAndClose = () => {
    /* 🔴 홈 캐시만 비운다. `clearRosterCache()`를 부르면 명부까지 버린다(W-11 §4-5). */
    clearHomeCache()
    onClose()
    /* BR-40 — `source`와 같은 기준(`navigator.onLine`)으로 가른다. */
    toast(navigator.onLine ? TS_01 : TS_02)
  }

  const commit = () => {
    if (!student || !profile) return
    writeRecord({
      clientRecordId: clientRecordId,
      student,
      grade,
      classNo,
      reasonCode,
      /* 🔴 `ETC`가 아니면 필드를 빼는 것이 아니라 `null`이다(§9.6 필수 조건 5). */
      reasonText: isEtc ? reasonText.trim() : null,
      occurredAt: occurredAt,
      academicYear,
      createdBy: profile.uid,
      createdByName: profile.name,
    })
    finishAndClose()
  }

  const handleSave = () => {
    /* 동기적으로 즉시 선다. 5연타가 여기서 1회로 줄어든다. */
    if (submittingRef.current) return
    submittingRef.current = true
    setSaving(true)
    void runSave()
  }

  const runSave = async () => {
    /* ── 사전 검증 ── */
    if (!student) {
      onClose()
      toast(NO_STUDENT)
      return
    }
    if (!profile || !WRITER_ROLES.has(profile.role) || profile.status !== 'active') {
      onClose()
      toast(NO_PERMISSION)
      return
    }
    if (isEtc && validateReasonText(reasonText) !== null) {
      /* 시트를 유지하고 인라인 에러 + shake. `Field`가 둘 다 소유한다. */
      etcRef.current?.validate()
      submittingRef.current = false
      setSaving(false)
      return
    }

    /* ── 중복 검사 (§2.4 · §3.8) ── */
    const verdict = await checkDuplicate(
      student.id,
      reasonCode,
      isEtc ? reasonText.trim() : null,
      occurredAt,
    )

    if (verdict.kind === 'blocked') {
      setBanner(E_2001)
      submittingRef.current = false
      setSaving(false)
      return
    }
    if (verdict.kind === 'confirm') {
      /* 빗장은 잠근 채로 둔다 — 확인 모달이 이 저장의 연장이다. */
      setConfirmOpen(true)
      return
    }
    if (verdict.kind === 'unknown') {
      /* 🔴 「중복 없음」과 뭉개지 않는다. 저장은 진행하고 MD-05는 띄우지 않는다 —
         기록 누락(P-02)이 중복보다 비싸고 재전송 중복은 멱등키(BR-02)가 흡수한다. */
      console.warn('[records] 중복 검사 실패 — 저장은 진행한다', verdict.code)
    }

    commit()
  }

  const handleConfirm = () => {
    setConfirmOpen(false)
    commit()
  }

  const handleConfirmCancel = () => {
    setConfirmOpen(false)
    /* 재시도가 가능해야 하므로 그 자리에서 푼다. 시트는 유지된다. */
    submittingRef.current = false
    setSaving(false)
  }

  const etcLength = reasonText.length
  const etcOverWarn = etcLength > ETC_WARN_AT
  const canSave = !isEtc || reasonText.trim().length >= REASON_TEXT_MIN
  const whenText = formatDateTimeKst(occurredAt)

  return (
    <>
      <BottomSheet open={open} onClose={onClose} onClosed={onClosed} title={TITLE}>
        {/* §8.6.5 에러 — 시트 상단 인라인 배너. `.s1-banner`·`.s2-banner`와 같은 형태다. */}
        {banner && (
          <div className="rs-banner" role="alert" aria-live="assertive">
            <AlertIcon />
            <span className="text-label font-bold text-sundo-danger">{banner}</span>
          </div>
        )}

        {/* §8.6.2 #4 학생 요약 카드. 아바타는 장식이라 이름 첫 글자를 읽히지 않는다. */}
        <div className="rs-card">
          <span className="rs-avatar" aria-hidden="true">
            {student?.name.slice(0, 1) ?? ''}
          </span>
          <span className="min-w-0">
            <span className="rs-name">{student?.name ?? ''}</span>
            <span className="rs-meta">
              {grade}학년 {classNo}반 · {student?.studentNo ?? ''}
            </span>
          </span>
        </div>

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
                    /* §15.3 — 18자를 넘긴 뒤에만 읽는다. */
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

        <div className="rs-label">{LABEL_WHEN}</div>
        <div
          className="rs-when"
          role="group"
          aria-readonly="true"
          aria-label={`발생 일시 ${whenText}, ${BADGE_AUTO}`}
        >
          <span className="rs-when-text" aria-hidden="true">
            {whenText}
          </span>
          <span className="rs-when-badge" aria-hidden="true">
            {BADGE_AUTO}
          </span>
        </div>

        <PrimaryButton
          label={SAVE}
          onClick={handleSave}
          disabled={!canSave}
          loading={saving}
          className="rs-save"
        />

        <div className="rs-note">
          <span className="rs-dot" aria-hidden="true" />
          <span className="rs-note-text">{online ? NOTE_ONLINE : NOTE_OFFLINE}</span>
        </div>
      </BottomSheet>

      {/* MD-05 — 좌 버튼 라벨은 `ConfirmModal`이 `취소`로 고정한다. */}
      <ConfirmModal
        open={confirmOpen}
        title={MD_05_TITLE}
        body={MD_05_BODY}
        confirmLabel={MD_05_CONFIRM}
        onConfirm={handleConfirm}
        onCancel={handleConfirmCancel}
      />
    </>
  )
}
