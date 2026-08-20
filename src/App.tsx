import { cn } from './lib/cn'

// W-02 검증용 쇼케이스. W-03 AppShell 작업에서 폐기한다.

const COLORS = [
  'sundo-900',
  'sundo-800',
  'sundo-700',
  'sundo-500',
  'sundo-300',
  'sundo-bg-top',
  'sundo-bg-bottom',
  'sundo-bg-outer',
  'sundo-glass',
  'sundo-sheet',
  'sundo-neu-from',
  'sundo-neu-to',
  'sundo-border-light',
  'sundo-divider',
  'sundo-tint-08',
  'sundo-tint-10',
  'sundo-tint-12',
  'sundo-ink-60',
  'sundo-ink-70',
  'sundo-danger',
  'sundo-danger-active',
  'sundo-control',
  'sundo-line-surface',
  'sundo-line-border',
]

// Tailwind는 클래스명을 소스에서 정적으로 훑는다. 문자열을 조립하면 감지되지 않으므로
// 전부 온전한 리터럴로 적는다.
const COLOR_SWATCH: Record<string, string> = {
  'sundo-900': 'bg-sundo-900',
  'sundo-800': 'bg-sundo-800',
  'sundo-700': 'bg-sundo-700',
  'sundo-500': 'bg-sundo-500',
  'sundo-300': 'bg-sundo-300',
  'sundo-bg-top': 'bg-sundo-bg-top',
  'sundo-bg-bottom': 'bg-sundo-bg-bottom',
  'sundo-bg-outer': 'bg-sundo-bg-outer',
  'sundo-glass': 'bg-sundo-glass',
  'sundo-sheet': 'bg-sundo-sheet',
  'sundo-neu-from': 'bg-sundo-neu-from',
  'sundo-neu-to': 'bg-sundo-neu-to',
  'sundo-border-light': 'bg-sundo-border-light',
  'sundo-divider': 'bg-sundo-divider',
  'sundo-tint-08': 'bg-sundo-tint-08',
  'sundo-tint-10': 'bg-sundo-tint-10',
  'sundo-tint-12': 'bg-sundo-tint-12',
  'sundo-ink-60': 'bg-sundo-ink-60',
  'sundo-ink-70': 'bg-sundo-ink-70',
  'sundo-danger': 'bg-sundo-danger',
  'sundo-danger-active': 'bg-sundo-danger-active',
  'sundo-control': 'bg-sundo-control',
  'sundo-line-surface': 'bg-sundo-line-surface',
  'sundo-line-border': 'bg-sundo-line-border',
}

const TYPE = [
  ['h1', 'text-h1', '28px 화면 대제목'],
  ['h2', 'text-h2', '24px 하위 화면 제목'],
  ['sheet', 'text-sheet', '19px 바텀시트 제목'],
  ['grade', 'text-grade', '21px 학년 버튼'],
  ['classno', 'text-classno', '23px 반 숫자'],
  ['stat', 'text-stat', '24px 통계 수치'],
  ['body', 'text-body', '15px 본문'],
  ['button', 'text-button', '16px 버튼 라벨'],
  ['row', 'text-row', '14.5px 기록 행'],
  ['label', 'text-label', '12px 폼 라벨'],
  ['caption', 'text-caption', '11.5px 학번 보조'],
  ['micro', 'text-micro', '11px 브레드크럼'],
  ['dock', 'text-dock', '10px 탭 라벨'],
] as const

const SPACING = [
  ['1.5', 'p-1.5', 6],
  ['2', 'p-2', 8],
  ['2.5', 'p-2.5', 10],
  ['3', 'p-3', 12],
  ['3.5', 'p-3.5', 14],
  ['4', 'p-4', 16],
  ['4.5', 'p-4.5', 18],
  ['5.5', 'p-5.5', 22],
  ['6.5', 'p-6.5', 26],
] as const

const RADII = [
  ['pill', 'rounded-pill'],
  ['28', 'rounded-28'],
  ['26', 'rounded-26'],
  ['24', 'rounded-24'],
  ['22', 'rounded-22'],
  ['20', 'rounded-20'],
  ['18', 'rounded-18'],
  ['16', 'rounded-16'],
  ['15', 'rounded-15'],
  ['14', 'rounded-14'],
  ['12', 'rounded-12'],
  ['11', 'rounded-11'],
] as const

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-label font-bold text-sundo-ink-70">{title}</h2>
      {children}
    </section>
  )
}

function App() {
  return (
    <div className="min-h-screen bg-sundo-bg-outer">
      <div
        className="mx-auto flex max-w-[430px] flex-col gap-8 p-6.5"
        style={{ background: 'var(--gradient-stage)' }}
      >
        <h1 className="text-h1 font-bold text-sundo-900">디자인 토큰 확인</h1>

        <Section title="컬러 24">
          <div className="grid grid-cols-4 gap-2">
            {COLORS.map((name) => (
              <div key={name} className="flex flex-col gap-1">
                <div
                  data-probe="color"
                  data-name={name}
                  className={cn(
                    'h-10 rounded-12 border border-sundo-divider',
                    COLOR_SWATCH[name],
                  )}
                />
                <span className="text-micro text-sundo-ink-60">{name.replace('sundo-', '')}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="타이포그래피 13">
          <div className="flex flex-col gap-1">
            {/* cn()으로 묶지 않는다. tailwind-merge 기본 설정은 커스텀 글꼴 크기(text-h1)와
                커스텀 색(text-sundo-900)을 같은 text-* 그룹으로 보고 앞의 것을 버린다.
                W-02 보고서 §6 참조. extendTailwindMerge 도입은 W-03 판단이다. */}
            {TYPE.map(([key, cls, desc]) => (
              <p key={key} data-probe="type" data-name={key} className={`${cls} text-sundo-900`}>
                {desc}
              </p>
            ))}
          </div>
        </Section>

        <Section title="간격 9 (커스텀 토큰 없이 기본 --spacing 배수)">
          <div className="flex flex-wrap gap-2">
            {SPACING.map(([key, cls, px]) => (
              <div
                key={key}
                data-probe="spacing"
                data-name={key}
                data-expect={px}
                className={cn('rounded-12 bg-sundo-tint-08', cls)}
              >
                <div className="size-2 rounded-pill bg-sundo-800" />
              </div>
            ))}
          </div>
        </Section>

        <Section title="반경 12">
          <div className="flex flex-wrap gap-2">
            {RADII.map(([key, cls]) => (
              <div
                key={key}
                data-probe="radius"
                data-name={key}
                className={cn('flex size-14 items-center justify-center bg-sundo-tint-10', cls)}
              >
                <span className="text-micro font-bold text-sundo-800">{key}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="그림자 3 · 이징 1">
          <div className="flex flex-wrap items-center gap-3">
            <div data-probe="shadow" data-name="glass" className="rounded-20 bg-white p-4 shadow-glass">
              <span className="text-micro font-bold text-sundo-800">shadow-glass</span>
            </div>
            <div data-probe="shadow" data-name="primary" className="rounded-20 bg-white p-4 shadow-primary">
              <span className="text-micro font-bold text-sundo-800">shadow-primary</span>
            </div>
            <div data-probe="shadow" data-name="neu" className="rounded-20 bg-white p-4 shadow-neu">
              <span className="text-micro font-bold text-sundo-800">shadow-neu</span>
            </div>
            <div
              data-probe="ease"
              data-name="sundo"
              className="rounded-20 bg-white p-4 transition-transform duration-200 ease-sundo"
            >
              <span className="text-micro font-bold text-sundo-800">ease-sundo</span>
            </div>
          </div>
        </Section>

        <Section title="표면 스타일 11">
          <div data-probe="surface" data-name="glass" className="glass rounded-20 p-4.5">
            <p className="text-label font-bold text-sundo-ink-70">glass</p>
            <p className="text-stat font-bold text-sundo-800 tabular-nums">128</p>
          </div>

          <div data-probe="surface" data-name="neu" className="neu rounded-22 p-5.5">
            <p className="text-grade font-bold text-sundo-900">neu · 눌러보면 그림자가 반전됩니다</p>
          </div>

          <button data-probe="surface" data-name="btnp" className="btnp w-full">
            <span data-probe="surface" data-name="shine" className="shine">
              btnp + shine
            </span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <span data-probe="surface" data-name="chip" className="chip">
              chip 24명
            </span>
            <span data-probe="surface" data-name="fchip" className="fchip">
              fchip 비활성
            </span>
            <span data-probe="surface" data-name="fchip-on" className="fchip fchip-on">
              fchip 활성
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span data-probe="surface" data-name="pill-soft" className="pill pill-soft">
              양도
            </span>
            <span data-probe="surface" data-name="pill-fill" className="pill pill-fill">
              승인
            </span>
            <span data-probe="surface" data-name="pill-line" className="pill pill-line">
              거절
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span data-probe="surface" data-name="tagf" className="tagf">
              복장 불량
            </span>
            <span data-probe="surface" data-name="tagl" className="tagl">
              실내화 미착용
            </span>
            <span data-probe="surface" data-name="tage" className="tage">
              기타
            </span>
          </div>
        </Section>

        <Section title="cn() 병합">
          <div data-probe="cn" className={cn('rounded-11', 'p-4', 'bg-sundo-tint-10')}>
            <span className="text-micro font-bold text-sundo-800">cn('rounded-11','p-4')</span>
          </div>
        </Section>
      </div>
    </div>
  )
}

export default App
