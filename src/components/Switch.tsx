import { cn } from '../lib/cn'

interface SwitchProps {
  checked: boolean
  onChange: (v: boolean) => void
  /** 잠금. S10 알림 토글은 MVP에서 잠금 상태로 들어간다. */
  locked?: boolean
  /** 잠금 안내 문구의 id (§15.3) */
  describedById?: string
  id?: string
}

/**
 * PRD §7.3 `switch` + §7.4 토글 노브.
 * 잠금은 disabled가 아니라 aria-disabled다. 초점을 유지해야 안내 문구가 낭독된다.
 */
export function Switch({ checked, onChange, locked = false, describedById, id }: SwitchProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-disabled={locked || undefined}
      aria-describedby={describedById}
      onClick={() => {
        if (!locked) onChange(!checked)
      }}
      className={cn('sw', checked && 'sw-on', locked && 'sw-locked')}
    >
      <span className="sw-knob" />
    </button>
  )
}
