import { BottomSheet } from './BottomSheet'
import { cn } from '../lib/cn'
import { formatTimeKst } from '../lib/dateKeys'
import type { RecordRow } from '../lib/records'

/* ── §8.10 · design `18b` 확정 문안. 새로 짓지 마라. ────────────────────── */
const ACT_EDIT = '사유 변경'
const ACT_DELETE = '기록 삭제'
const ACT_CANCEL = '취소'

/** §8.7.2 #8 — 태그 라벨과 같은 3종. 요약 2줄째의 첫 조각이다. */
const REASON_LABEL: Readonly<Record<RecordRow['reasonCode'], string>> = {
  DRESS: '복장 불량',
  SLIPPER: '실내화 미착용',
  ETC: '기타',
}

/**
 * design `18b`·`18c`·`18d`의 요약 카드 — **세 시안이 같은 요소를 쓴다.**
 *
 * 2줄째 형식은 `18b` 원문이다: `기타 · 명찰 미착용 · 08:32 · 작성 부원1`.
 * 🔴 `기타`가 아니면 기입 문구 조각이 **통째로 빠진다**(`18c` 원문
 * `복장 불량 · 08:32 · 작성 부원1`) — 빈 조각과 ` · `를 남기지 마라.
 *
 * 🔴 **아바타는 `DSHSS.png` 고정이다**(W-21 결정 4). 시안의 「이름 첫 글자 + 그라디언트」를
 * 따르지 않는다 — 그 결정이 일반 학생 아바타를 정적 이미지로 통일했고, S6 기록 작성
 * 카드(`RecordSheet`)가 이미 같은 형태다. 두 화면이 같은 학생을 다르게 그리면 안 된다.
 */
export function RecordSummaryCard({ row, gap = false }: { row: RecordRow; gap?: boolean }) {
  const parts = [
    REASON_LABEL[row.reasonCode],
    ...(row.reasonText === null ? [] : [row.reasonText]),
    formatTimeKst(row.occurredAt),
    `작성 ${row.createdByName}`,
  ]
  return (
    /* `gap`은 시트에 제목이 있을 때(`18c`·`18d`)만 참이다 — `18b`는 그랩 핸들 바로 아래다. */
    <div className={cn('rae-card', gap && 'rae-card-gap')}>
      <span className="rs-avatar" aria-hidden="true">
        <img src="/DSHSS.png" alt="" className="h-full w-full object-cover" />
      </span>
      <span className="min-w-0">
        <span className="rae-sum-top">
          {row.studentName} <span className="rae-sum-no">{row.studentNo}</span>
        </span>
        <span className="rae-sum-bot">{parts.join(' · ')}</span>
      </span>
    </div>
  )
}

function PencilIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M13.4 3.3l3.3 3.3-9.1 9.1H4.3v-3.3l9.1-9.1z"
        stroke="#1F5138"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M11.6 5.1l3.3 3.3" stroke="#1F5138" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M3.6 6.2h12.8M8 3.4h4M6.2 6.2l.8 9.4a1.3 1.3 0 001.3 1.2h3.4a1.3 1.3 0 001.3-1.2l.8-9.4"
        stroke="#C0392B"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface RecordActionSheetProps {
  open: boolean
  onClose: () => void
  onClosed?: () => void
  /** 닫힘 0.38s 동안 내용이 남아 있어야 하므로 호출부가 **즉시 비우지 않는다**. */
  row: RecordRow | null
  onEdit: () => void
  onDelete: () => void
}

/**
 * S7 기록 액션 시트 — §8.7.4 T-04 · design `18b`.
 *
 * 🔴 **제목이 없다.** `18b` 원문에 제목 줄이 없고 요약 카드가 곧 맥락이다.
 * `BottomSheet`의 `title`을 넘기지 않으면 그랩 핸들 바로 아래가 카드다.
 *
 * 🔴 **권한 판정을 여기서 하지 않는다.** 이 시트가 떠 있다는 것은 이미 호출부가
 * `canEditRecord()`로 걸렀다는 뜻이다 — 판정이 두 곳에 있으면 두 곳이 갈린다.
 */
export function RecordActionSheet({
  open,
  onClose,
  onClosed,
  row,
  onEdit,
  onDelete,
}: RecordActionSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} onClosed={onClosed}>
      {row && <RecordSummaryCard row={row} />}

      <div className="rae-menu">
        <button type="button" className="rae-item" onClick={onEdit}>
          <PencilIcon />
          <span className="rae-item-label">{ACT_EDIT}</span>
        </button>
        <button type="button" className="rae-item rae-item-danger" onClick={onDelete}>
          <TrashIcon />
          <span className="rae-item-label">{ACT_DELETE}</span>
        </button>
      </div>

      {/* `18b` 원문 — 목록과 떨어진 별도 표면. 확인 모달의 `취소`와 다른 요소다. */}
      <button type="button" className="rae-cancel" onClick={onClose}>
        {ACT_CANCEL}
      </button>
    </BottomSheet>
  )
}
