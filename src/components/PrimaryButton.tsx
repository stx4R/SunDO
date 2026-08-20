import { cn } from '../lib/cn'

interface PrimaryButtonProps {
  label: string
  onClick?: () => void
  loading?: boolean
  disabled?: boolean
  className?: string
}

/**
 * PRD §7.3 `btnp` + §7.4 `shine`. 4상태(기본 · 눌림 · 비활성 · 로딩).
 * 로딩은 라벨을 스피너로 **교체**한다(design 원문). 라벨이 사라지므로
 * `.shine` 노드도 함께 사라져 광택 스윕이 정지한다.
 */
export function PrimaryButton({
  label,
  onClick,
  loading = false,
  disabled = false,
  className,
}: PrimaryButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      /* 로딩 중 재탭 차단도 여기서 함께 처리한다. */
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      /* 로딩 중에는 텍스트가 없으므로 접근 가능한 이름을 여기서 유지한다. */
      aria-label={label}
      className={cn(
        'btnp flex w-full items-center justify-center',
        /* 로딩은 투명도를 낮추지 않는다. 비활성만 0.45다(§6.3). */
        disabled && !loading && 'opacity-45',
        className,
      )}
    >
      {loading ? <span className="btnp-spin" aria-hidden="true" /> : <span className="shine">{label}</span>}
    </button>
  )
}
