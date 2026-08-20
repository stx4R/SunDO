import { useEffect, useRef, useState } from 'react'
import { AppShell } from './components/AppShell'
import { Chip, FilterChip } from './components/Chip'
import { Dock, type DockTab } from './components/Dock'
import { Field, type FieldHandle } from './components/Field'
import { Footer } from './components/Footer'
import { GlassCard } from './components/GlassCard'
import { NeuButton } from './components/NeuButton'
import { Pill } from './components/Pill'
import { PrimaryButton } from './components/PrimaryButton'
import { Switch } from './components/Switch'
import { cn } from './lib/cn'

/* W-03A·W-03B 검증용 스토리 페이지. 화면 구현이 아니라 DoD 실측 대상이다. */

/* 독은 스테이지 기준 absolute다. 스토리에서 실치수를 재려면 스테이지와 같은
   430px 폭의 relative 박스가 필요하다. AppShell 본문은 좌우 22px이 빠진
   386px이라 음수 마진으로 되돌린다. */
function StageBox({ children, h }: { children: React.ReactNode; h: number }) {
  return (
    <div className="relative -mx-[22px] overflow-hidden" style={{ height: h }}>
      {children}
    </div>
  )
}

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

  /* --- W-03B --- */
  const [loading, setLoading] = useState(true)
  const [disabledTaps, setDisabledTaps] = useState(0)
  const [filter, setFilter] = useState('전체')
  const [tab, setTab] = useState<DockTab>('home')
  const [dockRole, setDockRole] = useState(false) // true = member(4탭)

  const [notifyOn, setNotifyOn] = useState(true)
  const [notifyOff, setNotifyOff] = useState(false)
  const [lockedOn] = useState(true)
  const [lockedOff] = useState(false)

  const focusRef = useRef<FieldHandle>(null)
  const okRef = useRef<FieldHandle>(null)
  const errRef = useRef<FieldHandle>(null)

  /* 7상태를 동시에 보이게 하려면 상태 2·4·5를 착수 시점에 만들어야 한다.
     성공(4)은 이제 blur에서만 켜지므로(W-03B §1) focus → blur를 1회 돌린다.
     실제 사용자 경로와 같은 경로라 우회가 아니다. */
  useEffect(() => {
    okRef.current?.focus()
    ;(document.activeElement as HTMLElement | null)?.blur()
    errRef.current?.validate()
    focusRef.current?.focus()
  }, [])

  return (
    <AppShell hasDock={hasDock}>
      <header>
        <h1 className={cn('text-h1', 'font-bold', 'text-sundo-900')}>공통 컴포넌트</h1>
        <p className={cn('mt-1', 'text-caption', 'font-medium', 'text-sundo-ink-60')}>
          W-03A AppShell · Field · Switch / W-03B 표면 6종 · Dock · Footer
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

      <Section title="GLASSCARD — radius 4종 · rise 스태거">
        <div className="flex flex-col gap-3">
          {([24, 22, 20, 18] as const).map((r, i) => (
            <GlassCard
              key={r}
              radius={r}
              riseDelay={50 + i * 150}
              className="p-4"
            >
              <div className={cn('text-row', 'font-bold', 'text-sundo-900')}>radius {r}</div>
              <div className={cn('mt-1', 'text-micro', 'font-medium', 'text-sundo-ink-70')}>
                riseDelay {50 + i * 150}ms
              </div>
            </GlassCard>
          ))}
        </div>
      </Section>

      <Section title="NEUBUTTON — 누르면 그림자 반전 + scale 0.98">
        <div className="flex gap-3">
          <NeuButton radius={22} className="flex-1 px-4 py-4">
            <div className={cn('text-grade', 'font-bold', 'text-sundo-800')}>1학년</div>
          </NeuButton>
          <NeuButton radius={20} className="flex-1 px-4 py-4">
            <div className={cn('text-classno', 'font-bold', 'text-sundo-800')}>7</div>
          </NeuButton>
        </div>
      </Section>

      <Section title="PRIMARYBUTTON — 4상태">
        <Slot n="기본 — 라벨 광택 스윕">
          <PrimaryButton label="기록 저장" />
        </Slot>

        <Slot n="로딩 — 스피너 18px · 광택 정지">
          <PrimaryButton label="기록 저장" loading={loading} />
        </Slot>

        <Slot n="비활성 — 투명도 0.45 · 탭 차단">
          <PrimaryButton
            label="기록 저장"
            disabled
            onClick={() => setDisabledTaps((n) => n + 1)}
          />
          <div
            id="disabled-taps"
            className={cn('mt-1.5', 'text-micro', 'font-medium', 'text-sundo-ink-70')}
          >
            눌린 횟수 {disabledTaps}
          </div>
        </Slot>

        <div className="flex items-center justify-between gap-3">
          <span className={cn('text-row', 'font-medium', 'text-sundo-900')}>로딩 토글</span>
          <Switch checked={loading} onChange={setLoading} />
        </div>
      </Section>

      <Section title="CHIP · FILTERCHIP · PILL">
        <Slot n="Chip — 정적 표시">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip>28명</Chip>
            <Chip>부장</Chip>
            <Chip>동기화됨</Chip>
          </div>
        </Slot>

        <Slot n="FilterChip — 4개 · gap 6 · 한 줄 · 가로 스크롤 없음">
          <div id="filter-row" className="flex gap-1.5 overflow-x-hidden">
            {['전체', '복장 불량', '실내화 미착용', '기타'].map((f) => (
              <FilterChip key={f} label={f} active={filter === f} onClick={() => setFilter(f)} />
            ))}
          </div>
        </Slot>

        <Slot n="Pill — soft · fill · line">
          <div className="flex flex-wrap items-center gap-2">
            <Pill variant="soft">승인</Pill>
            <Pill variant="fill">양도</Pill>
            <Pill variant="line">거절</Pill>
          </div>
        </Slot>
      </Section>

      <Section title="DOCK — 5탭 / 부원 4탭">
        <div className="flex items-center justify-between gap-3">
          <span className={cn('text-row', 'font-medium', 'text-sundo-900')}>
            role — {dockRole ? 'member (4탭)' : 'head (5탭)'}
          </span>
          <Switch checked={dockRole} onChange={setDockRole} />
        </div>

        <StageBox h={120}>
          <Dock active={tab} onChange={setTab} role={dockRole ? 'member' : 'head'} />
        </StageBox>

        <div className={cn('text-micro', 'font-medium', 'text-sundo-ink-70')}>
          현재 탭 <span id="dock-active">{tab}</span>
        </div>
      </Section>

      <Section title="FOOTER — 전체형 / 축약형">
        <Slot n="14a 전체형 — S10">
          <div id="ft-full" className="-mx-[22px]">
            <Footer variant="full" />
          </div>
        </Slot>

        <Slot n="14b 축약형 — S1 · S2-1">
          <div id="ft-compact" className="-mx-[22px]">
            <Footer variant="compact" />
          </div>
        </Slot>
      </Section>

      <div className="h-6.5" />
    </AppShell>
  )
}
