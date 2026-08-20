import { useEffect, useRef, useState } from 'react'
import { AppShell } from './components/AppShell'
import { Field, type FieldHandle } from './components/Field'
import { Switch } from './components/Switch'
import { cn } from './lib/cn'

/* W-03A 검증용 스토리 페이지. 화면 구현이 아니라 §8 DoD 실측 대상이다. */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6.5">
      <h2 className={cn('text-label', 'font-bold', 'text-sundo-ink-70')}>{title}</h2>
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </section>
  )
}

function Slot({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={cn('mb-1.5', 'text-micro', 'font-bold', 'text-sundo-700')}>{n}</div>
      {children}
    </div>
  )
}

function PersonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="7" r="3.2" stroke="rgba(20,53,38,0.45)" strokeWidth="1.7" />
      <path
        d="M4.2 16.2c.9-2.7 3.1-4.1 5.8-4.1s4.9 1.4 5.8 4.1"
        stroke="rgba(20,53,38,0.45)"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}

const required = (msg: string) => (v: string) => (v.trim() ? null : msg)

export default function App() {
  const [hasDock, setHasDock] = useState(false)

  const [empty, setEmpty] = useState('')
  const [filled, setFilled] = useState('유이준')
  const [focused, setFocused] = useState('')
  const [caret, setCaret] = useState('')
  const [okValue, setOkValue] = useState('유이준')
  const [errValue, setErrValue] = useState('')
  const [checkingValue, setCheckingValue] = useState('SUNDO24')
  const [roValue] = useState('2026-08-20 08:32')
  const [subValue, setSubValue] = useState('제출 중입니다')
  const [iconValue, setIconValue] = useState('')

  const [notifyOn, setNotifyOn] = useState(true)
  const [notifyOff, setNotifyOff] = useState(false)
  const [lockedOn] = useState(true)
  const [lockedOff] = useState(false)

  const focusRef = useRef<FieldHandle>(null)
  const okRef = useRef<FieldHandle>(null)
  const errRef = useRef<FieldHandle>(null)

  /* 7상태를 동시에 보이게 하려면 상태 2·4·5를 착수 시점에 만들어야 한다.
     전용 프로퍼티를 늘리지 않고 공개 ref API만 쓴다. */
  useEffect(() => {
    okRef.current?.validate()
    errRef.current?.validate()
    focusRef.current?.focus()
  }, [])

  return (
    <AppShell hasDock={hasDock}>
      <header>
        <h1 className={cn('text-h1', 'font-bold', 'text-sundo-900')}>공통 컴포넌트</h1>
        <p className={cn('mt-1', 'text-caption', 'font-medium', 'text-sundo-ink-60')}>
          W-03A — AppShell · Field · Switch
        </p>
      </header>

      <Section title="FIELD — 7상태">
        <Slot n="1 라벨 부상 — 비어 있고 비포커스 (세로 중앙)">
          <Field label="순찰 장소" value={empty} onChange={setEmpty} />
        </Slot>

        <Slot n="1 라벨 부상 — 값 있음 (상단 9px)">
          <Field label="이름" value={filled} onChange={setFilled} />
        </Slot>

        <Slot n="2 포커스 — 테두리 1.5px · 포커스 링 · 배경 상향">
          <Field
            ref={focusRef}
            label="담당자 이름"
            value={focused}
            onChange={setFocused}
            placeholder="예) 유이준"
          />
        </Slot>

        <Slot n="3 커서 — caret-color #2E6B4C (클릭하면 초록 커서)">
          <Field
            label="순찰 시간"
            value={caret}
            onChange={setCaret}
            inputMode="numeric"
            placeholder="예) 08:30"
          />
        </Slot>

        <Slot n="4 성공 — 체크 드로잉 0.28s + 필드 y -2→0">
          <Field
            ref={okRef}
            label="이름"
            value={okValue}
            onChange={setOkValue}
            validate={required('이름을 입력해 주세요')}
          />
        </Slot>

        <Slot n="5 실패 — shake 1회 + 에러 문구 펼침">
          <Field
            ref={errRef}
            label="순찰 장소"
            value={errValue}
            onChange={setErrValue}
            validate={required('순찰 장소를 입력해 주세요')}
          />
        </Slot>

        <Slot n="6 검사 중 — 우측 스피너 16px">
          <Field
            label="가입 코드"
            value={checkingValue}
            onChange={setCheckingValue}
            checking
            maxLength={8}
          />
        </Slot>

        <Slot n="7 읽기 전용 — 틴트 배경 · 자물쇠 · 커서 없음">
          <Field label="발생 일시" value={roValue} onChange={() => {}} readOnly inputMode="numeric" />
        </Slot>
      </Section>

      <Section title="FIELD — 추가 상태">
        <Slot n="제출 중 — 전체 투명도 0.6">
          <Field label="기타 사유" value={subValue} onChange={setSubValue} submitting />
        </Slot>

        <Slot n="leadingIcon — 좌측 기준선 44px">
          <Field
            label="담당자 이름 검색"
            value={iconValue}
            onChange={setIconValue}
            leadingIcon={<PersonIcon />}
          />
        </Slot>
      </Section>

      <Section title="SWITCH">
        <div className="flex items-center justify-between gap-3">
          <span className={cn('text-row', 'font-medium', 'text-sundo-900')}>켜짐</span>
          <Switch checked={notifyOn} onChange={setNotifyOn} />
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className={cn('text-row', 'font-medium', 'text-sundo-900')}>꺼짐</span>
          <Switch checked={notifyOff} onChange={setNotifyOff} />
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className={cn('text-row', 'font-medium', 'text-sundo-900')}>잠금 — 켜짐</span>
          <Switch checked={lockedOn} onChange={() => {}} locked describedById="sw-lock-note" />
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className={cn('text-row', 'font-medium', 'text-sundo-900')}>잠금 — 꺼짐</span>
          <Switch checked={lockedOff} onChange={() => {}} locked describedById="sw-lock-note" />
        </div>

        <p id="sw-lock-note" className={cn('text-micro', 'font-medium', 'text-sundo-ink-70')}>
          홈 화면에 추가하면 알림을 받을 수 있습니다
        </p>
      </Section>

      <Section title="APPSHELL">
        <div className="flex items-center justify-between gap-3">
          <span className={cn('text-row', 'font-medium', 'text-sundo-900')}>
            hasDock — 상단 26px ↔ 34px
          </span>
          <Switch checked={hasDock} onChange={setHasDock} />
        </div>
      </Section>

      <div className="h-6.5" />
    </AppShell>
  )
}
