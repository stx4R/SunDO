import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react'
import { cn } from '../lib/cn'
import { AdminIcon, DutyIcon, HomeIcon, RecordsIcon, SettingsIcon } from './icons'

export type DockTab = 'home' | 'records' | 'duty' | 'admin' | 'settings'

export type DockRole = 'member' | 'vice' | 'head' | 'teacher' | 'dev'

interface DockProps {
  active: DockTab
  onChange: (tab: DockTab) => void
  role: DockRole
}

interface TabDef {
  id: DockTab
  label: string
  Icon: ComponentType<{ className?: string }>
  /** false면 항목 자체를 렌더링하지 않는다. 숨김이 아니다(§7.3). */
  memberVisible: boolean
}

/* 순서 고정. PRD §6.2 표와 같다. */
const TABS: readonly TabDef[] = [
  { id: 'home', label: '홈', Icon: HomeIcon, memberVisible: true },
  { id: 'records', label: '기록', Icon: RecordsIcon, memberVisible: true },
  { id: 'duty', label: '일정', Icon: DutyIcon, memberVisible: true },
  { id: 'admin', label: '관리', Icon: AdminIcon, memberVisible: false },
  { id: 'settings', label: '설정', Icon: SettingsIcon, memberVisible: true },
]

/** §7.3 — 항목 사이가 이 값보다 좁아지면 폭을 54까지만 줄인다. */
const MIN_ITEM_GAP = 8

/** `.dock-item` / `.dock-tight .dock-item`의 폭. CSS와 같은 값을 본다. */
const ITEM_W = 58
const ITEM_W_TIGHT = 54

/**
 * PRD §6.2 하단 독. design `15a`~`15d`.
 *
 * 라우터에 의존하지 않는다. 라우트 이동은 W-05가 `onChange`에 연결한다.
 * 여백도 만들지 않는다 — `AppShell`이 `hasDock`으로 이미 소유한다.
 * 스테이지 기준 `position: absolute`이므로 스테이지의 직계 자식으로 둔다.
 */
export function Dock({ active, onChange, role }: DockProps) {
  const tabs = TABS.filter((t) => role !== 'member' || t.memberVisible)

  const dockRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef(new Map<DockTab, HTMLButtonElement>())

  const [pill, setPill] = useState<{ x: number; w: number } | null>(null)
  /* 첫 페인트에서 알약이 translateX(0)부터 미끄러지지 않게 한다. */
  const [animate, setAnimate] = useState(false)
  const [squeeze, setSqueeze] = useState<'' | 'dock-tight' | 'dock-tight dock-tighter'>('')

  /* 알약 위치. 항목 배경을 켜고 끄는 대신 요소 1개를 옮긴다(§7.4). */
  useLayoutEffect(() => {
    const el = itemRefs.current.get(active)
    if (!el) {
      setPill(null)
      return
    }
    setPill({ x: el.offsetLeft, w: el.offsetWidth })
  }, [active, tabs.length, squeeze])

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true))
    return () => cancelAnimationFrame(id)
  }, [])

  /* 간격이 8px 미만이면 폭을 54까지만 줄이고, 그래도 부족하면 아이콘을 19px로
     줄인다. 라벨은 어떤 경우에도 축약하지 않는다(§7.3).
     현재 폭을 실측해 한 단계씩 내려가면 안 된다 — 좁힌 뒤에는 간격이 다시 8px을
     넘어 원복하고, 원복하면 또 좁아져 setState가 무한히 돈다(React #185).
     가용 폭에서 결과를 직접 계산해 같은 폭이면 항상 같은 값이 나오게 한다. */
  useLayoutEffect(() => {
    const dock = dockRef.current
    if (!dock) return

    const measure = () => {
      const cs = getComputedStyle(dock)
      const inner = dock.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const n = tabs.length
      /* space-around는 남는 폭을 항목마다 양옆으로 나눠 항목 사이가 free/n이 된다.
         free/(n-1)로 계산하면 실제보다 넉넉하게 잡힌다. */
      const fits = (w: number) => n * (w + MIN_ITEM_GAP) <= inner
      setSqueeze(fits(ITEM_W) ? '' : fits(ITEM_W_TIGHT) ? 'dock-tight' : 'dock-tight dock-tighter')
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(dock)
    return () => ro.disconnect()
  }, [tabs.length])

  return (
    <div ref={dockRef} role="tablist" aria-label="주요 화면" className={cn('dock', squeeze)}>
      {pill && (
        <span
          className={cn('dock-pill', animate && 'dock-pill-anim')}
          style={{ width: pill.w, transform: `translateX(${pill.x}px)` }}
          aria-hidden="true"
        />
      )}

      {tabs.map(({ id, label, Icon }) => {
        const isActive = id === active
        return (
          <button
            key={id}
            ref={(el) => {
              if (el) itemRefs.current.set(id, el)
              else itemRefs.current.delete(id)
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-active={isActive}
            onClick={() => onChange(id)}
            className="dock-item"
          >
            <Icon className="dock-icon" />
            <span className="dock-label">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
