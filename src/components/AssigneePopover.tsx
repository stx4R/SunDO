import { useEffect, useMemo, useRef, useState } from 'react'
import { Field, type FieldHandle } from './Field'
import type { DutyMember } from '../lib/duty'

/** design `19d`·`19e` 원문 — 검색 입력의 Floating Label. */
const LABEL_SEARCH = '이름 검색'

/**
 * §4.4 역할 라벨. design `19d`의 결과 행 2줄째가 그리는 값이다.
 * 🔴 `Dev`는 §8.10.6의 **고정 영문 문자열**이라 번역하지 않는다.
 */
const ROLE_LABEL: Readonly<Record<string, string>> = {
  head: '부장',
  vice: '차장',
  member: '부원',
  dev: 'Dev',
}

interface AssigneePopoverProps {
  open: boolean
  onClose: () => void
  members: readonly DutyMember[]
  /** 지금 이 자리에 선택돼 있는 uid. 체크 표시가 이 값을 본다. */
  selected: readonly string[]
  onToggle: (member: DutyMember) => void
}

/**
 * 담당자 선택 팝오버 — design `19d`(값 없음) · `19e`(포커스 · 라벨 떠오름).
 *
 * 🔴 **`BottomSheet`를 겹쳐 쓰지 않는다.** 시안이 시트 **위에 떠 있는 카드**이고
 * (`left/right 22px; top 132px; radius 20`), `BottomSheet`를 하나 더 쌓으면 히스토리
 * 엔트리가 둘이 되어 뒤로가기가 헛돈다(W-21B에서 액션 시트로 겪은 것과 같은 자리).
 * 대신 **시트 안에 절대 배치**하고 딤은 시트가 이미 갖고 있다.
 *
 * 🔴 **검색은 클라이언트 필터다.** 후보가 부원 수(약 40명)라 질의를 만들 이유가 없고,
 * 그래서 **이름 중간 일치가 된다**(「준」으로 「김준서」를 찾는다).
 *
 * ⚠ **닫기 수단이 배경 탭 하나뿐이다** — design `19d`·`19e`에 닫기 버튼이 없다.
 *   ESC도 함께 받는다(AC-09 · `BottomSheet`가 같은 규율을 쓴다).
 */
export function AssigneePopover({ open, ...rest }: AssigneePopoverProps) {
  /**
   * 🔴 **열릴 때만 마운트한다.** 검색어 초기화를 `useEffect`의 `setQ('')`로 하면
   * 「효과 안에서 동기 setState」가 되어 렌더가 한 번 더 돈다(oxlint
   * `react(set-state-in-effect)`). **마운트가 곧 초기화**이면 그 코드가 아예 없어진다 —
   * `RecordSheet`·`ReasonEditSheet`가 `key` 재마운트로 하는 것과 같은 계약이고,
   * 여기서는 `open`이 그 `key` 노릇을 한다.
   */
  if (!open) return null
  return <AssigneePopoverBody {...rest} />
}

function AssigneePopoverBody({
  onClose,
  members,
  selected,
  onToggle,
}: Omit<AssigneePopoverProps, 'open'>) {
  const [q, setQ] = useState('')
  const searchRef = useRef<FieldHandle>(null)

  /* 마운트 직후 포커스. 🔴 setState가 아니라 DOM 명령이라 위 규칙에 걸리지 않는다. */
  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    /* 🔴 캡처 단계다 — `BottomSheet`의 ESC 핸들러보다 먼저 받아야 팝오버만 닫힌다. */
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const shown = useMemo(() => {
    const t = q.trim()
    if (t === '') return members
    return members.filter((m) => m.name.includes(t))
  }, [members, q])

  return (
    <>
      {/* 배경 탭으로 닫는다. 시안에 닫기 버튼이 없다. */}
      <button type="button" className="ap-scrim" aria-label="담당자 선택 닫기" onClick={onClose} />
      <div className="ap" role="dialog" aria-label={LABEL_SEARCH}>
        {/* 🔴 `leadingIcon`이 좌측 기준선을 44px로 민다 — design `19e`의 `padding-left:44px`와
            같은 값이다. `Field`의 주석이 「S9 검색」을 이미 사용처로 예고하고 있었다. */}
        <Field
          ref={searchRef}
          label={LABEL_SEARCH}
          value={q}
          onChange={setQ}
          leadingIcon={<SearchIcon />}
        />

        <ul className="ap-list">
          {shown.map((m) => {
            const on = selected.includes(m.uid)
            return (
              <li key={m.uid}>
                <button
                  type="button"
                  className="ap-row"
                  aria-pressed={on}
                  onClick={() => onToggle(m)}
                >
                  <span className={on ? 'ap-avatar ap-avatar-on' : 'ap-avatar'} aria-hidden="true">
                    {m.name.slice(0, 1)}
                  </span>
                  <span className="ap-who">
                    <span className="ap-name">{m.name}</span>
                    <span className="ap-role">{ROLE_LABEL[m.role] ?? m.role}</span>
                  </span>
                  {/* AC-03 — 선택을 색만으로 전달하지 않는다. `aria-pressed`가 상태를 말한다. */}
                  <span className={on ? 'ap-check ap-check-on' : 'ap-check'} aria-hidden="true">
                    {on && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path
                          d="M2.6 6.2l2.4 2.4 4.4-5"
                          stroke="#fff"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}

/** design `19d` 원문 — 16px 돋보기. */
function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.8" stroke="rgba(20,53,38,0.45)" strokeWidth="1.9" />
      <path
        d="M10.6 10.6l3 3"
        stroke="rgba(20,53,38,0.45)"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  )
}
