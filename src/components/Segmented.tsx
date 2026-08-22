import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '../lib/cn'

export interface SegmentedItem<T extends string> {
  value: T
  label: string
}

interface SegmentedProps<T extends string> {
  items: readonly SegmentedItem<T>[]
  value: T
  onChange: (value: T, event: React.MouseEvent<HTMLButtonElement>) => void
  /** `radiogroup`의 접근 가능한 이름. 화면의 라벨 요소 id를 넘긴다(§15.3). */
  labelledBy?: string
  /**
   * 그룹이 무언가를 펼쳤는지. S6에서 `기타` 선택 시 `true`가 된다(§15.3 · §8.6.3).
   * **이 컴포넌트는 무엇이 펼쳐지는지 모른다.** 값만 그대로 전달한다.
   */
  expanded?: boolean
  /** 저장 중 잠금(§8.6.5 로딩). 항목이 `disabled`가 되고 인디케이터는 그대로 남는다. */
  disabled?: boolean
}

interface IndicatorBox {
  left: number
  top: number
  width: number
  height: number
}

/**
 * PRD §8.6.2 #6 세그먼트(`seg`). **공용이다** — S7 사유 변경 시트(§8.7.4 T-06)가
 * 같은 규격을 이어받는다. design `17a`~`17d` 원문.
 *
 * **이 컴포넌트는 사유를 모른다.** `DRESS`/`SLIPPER`/`ETC`와 라벨의 대응은
 * 호출부(`RecordSheet`)가 갖는다.
 *
 * 🔴 **선택 배경은 항목마다 켜고 끄지 않는다.** 절대 위치 인디케이터 **1개**가
 * 갖는다(독의 활성 알약과 같은 이유) — 항목마다 배경을 토글하면 T-02의
 * 「인디케이터 0.22s 가로 슬라이드」가 물리적으로 불가능하다.
 *
 * 🔴 **200% 확대에서만 2행(2+1)** — AC-11. 미디어 쿼리로 분기하지 않는다.
 * design 원문이 컨테이너 `flex-wrap: wrap` + 항목 `min-width: 6.5em`이라
 * **`em`이 커지면 레이아웃이 스스로 접는다.** 라벨은 어떤 경우에도 축약되지 않고
 * 높이 46은 두 경우 모두 유지된다. 인디케이터는 `offsetTop`까지 읽으므로
 * 2행에서도 선택 항목을 정확히 덮는다.
 */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  labelledBy,
  expanded,
  disabled = false,
}: SegmentedProps<T>) {
  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [box, setBox] = useState<IndicatorBox | null>(null)

  const selected = items.findIndex((item) => item.value === value)

  const measure = useCallback(() => {
    const el = itemRefs.current[selected]
    if (!el) {
      setBox(null)
      return
    }
    /* 컨테이너가 `position: relative`라 offset* 기준이 곧 인디케이터 좌표다.
       `getBoundingClientRect`를 쓰면 시트가 올라오는 0.38s 동안의 transform이
       섞여 들어와 첫 프레임 위치가 어긋난다. */
    setBox({
      left: el.offsetLeft,
      top: el.offsetTop,
      width: el.offsetWidth,
      height: el.offsetHeight,
    })
  }, [selected])

  /* 그리기 전에 끝나야 인디케이터가 한 프레임 엉뚱한 곳에 찍히지 않는다. */
  useLayoutEffect(() => {
    measure()
  }, [measure])

  /* 200% 확대·회전으로 줄바꿈이 바뀌면 좌표가 통째로 달라진다. */
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => measure())
    observer.observe(el)
    return () => observer.disconnect()
  }, [measure])

  return (
    <div
      ref={listRef}
      className="seg"
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-expanded={expanded}
    >
      {/* 측정 전에는 아예 마운트하지 않는다. 0폭에서 시작하면 첫 등장이
          가로로 늘어나는 전이로 보인다 — 새로 붙은 요소에는 전이가 걸리지 않는다. */}
      {box && (
        <span
          className="seg-ind"
          aria-hidden="true"
          style={{
            transform: `translate(${box.left}px, ${box.top}px)`,
            width: box.width,
            height: box.height,
          }}
        />
      )}

      {items.map((item, i) => (
        <button
          key={item.value}
          ref={(el) => {
            itemRefs.current[i] = el
          }}
          type="button"
          role="radio"
          aria-checked={item.value === value}
          disabled={disabled}
          className={cn('seg-item', item.value === value && 'seg-item-on')}
          onClick={(event) => onChange(item.value, event)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
