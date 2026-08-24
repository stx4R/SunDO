import { useNavigate, useLocation } from 'react-router'
import { Chip } from './Chip'
import { GlassCard } from './GlassCard'
import { PrimaryButton } from './PrimaryButton'
import type { PolicyDoc } from '../lib/policy'

/* §8.12.1 규격 표의 확정 문안. `.back`의 이름은 S2·S4·S5와 같은 것을 쓴다. */
const BACK_LABEL = '이전 화면으로'
const CONFIRM = '확인'

/**
 * 정책 문서 3종의 공용 셸 — PRD §8.12.1 · design `20i`·`20g`·`20h`.
 *
 * 🔴 **세 화면은 이 컴포넌트 하나를 공유한다.** §8.12.1이 「세 화면은 동일한 레이아웃을
 * 쓰고 제목·소제목·본문만 교체한다. **별도 디자인을 만들지 않는다**」로 규정하므로
 * 셸이 하나인 것이 규격의 직접 표현이다. 화면 파일 3개는 문서를 고르는 한 줄만 갖는다.
 *
 * **Footer를 그리지 않는다**(§8.12.1 · §6.4). 재귀 링크가 되기 때문이다 —
 * 「자기 화면 링크 비활성」이 아니라 **Footer 자체가 없는 것**이 규격이다.
 *
 * 🔴 **`AppShell`의 여백 계약을 건드리지 않는다.** 상단 `safe-area + 26px`과 좌우 22px은
 * 여전히 `AppShell` 소유다. 이 화면이 더하는 것은 design 원문의 하단 `16px 0 26px`뿐이다.
 *
 * 🔴 **카드 내부 스크롤이 성립하려면 높이 사슬이 확정이어야 한다.**
 * `AppShell`의 스크롤 영역은 높이가 확정(`h-dvh` 안의 `flex-1`)이지만 그 사이에
 * `ScreenTransition`의 `.blur-in`이 끼어 있고 그것은 높이가 `auto`다. 그래서
 * `.pol`의 `height:100%`가 끊긴다. `.blur-in`의 기존 선언을 고치면 화면 12종이 함께
 * 움직이므로, `index.css`에 **`.blur-in:has(> .pol)`** 규칙을 따로 뒀다 —
 * 정책 화면일 때만 매치하므로 다른 화면의 computed는 정의상 한 칸도 바뀌지 않는다.
 */
export function PolicyScreen({ doc }: { doc: PolicyDoc }) {
  const navigate = useNavigate()
  const location = useLocation()

  /**
   * §6.1 이탈 규칙 — `뒤로` → **직전 화면**. `확인`도 같은 동작이다(§8.12.1 하단 고정 행).
   *
   * 🔴 **직접 URL 진입에는 돌아갈 앱 화면이 없다**(EC-44가 만드는 상태다). react-router는
   * 히스토리 스택의 첫 엔트리에 `location.key === 'default'`를 준다. 그때 `navigate(-1)`을
   * 하면 앱 **밖으로** 나가므로 `/`로 보낸다 — `RequireAuth`의 `LANDING` 표가 인증 상태에
   * 맞는 화면을 고르므로 여기서 상태를 다시 판정하지 않는다(정책 화면은 인증을 기다리지 않는다).
   */
  const leave = () => {
    if (location.key === 'default') navigate('/', { replace: true })
    else navigate(-1)
  }

  return (
    <main
      data-screen={doc.screen}
      aria-labelledby={`scr-${doc.screen}`}
      className="pol"
    >
      {/* design 원문 `display:flex;align-items:center;gap:9px;flex:none`. */}
      <div className="pol-head">
        <button type="button" className="back" aria-label={BACK_LABEL} onClick={leave}>
          {/* design `20i`·`20g`·`20h` 원문 — 왼쪽 화살표 13px. S2·S4·S5와 같은 path다. */}
          <span>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <path
                d="M8.4 2.4L3.7 6.5L8.4 10.6"
                stroke="#1F5138"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>

        {/* design은 `white-space:nowrap`이지만 루트 32px·200%에서 제목이 스테이지를
            넘긴다. 가로 스크롤 0(AC-05)이 우선이라 줄바꿈을 허용하고 `min-w-0`으로
            줄인다 — 기본 폭에서는 세 제목 모두 1줄이라 시안과 같다(보고서 §3). */}
        <h1 id={`scr-${doc.screen}`} className="pol-title">
          {doc.title}
        </h1>
      </div>

      <GlassCard radius={22} riseDelay={100} className="pol-card">
        {doc.head && (
          <div className="pol-cardhead">
            {doc.head.kind === 'chips' ? (
              <>
                <p className="pol-chiplabel">{doc.head.label}</p>
                <div className="pol-chips">
                  {doc.head.chips.map((c) => (
                    <Chip key={c}>{c}</Chip>
                  ))}
                </div>
              </>
            ) : (
              <p className="pol-note">{doc.head.text}</p>
            )}
            <div className="pol-hr" />
          </div>
        )}

        {/* 🔴 스크롤 주체는 이 요소다. 카드가 아니라 여기에 `overflow-y`가 붙어야
            상단 고정 블록(칩 줄·안내 줄)이 함께 밀려 올라가지 않는다. */}
        <div className={doc.head ? 'pol-scroll pol-scroll-gap' : 'pol-scroll'}>
          <div className="pol-secs">
            {doc.sections.map((sec) => (
              <section key={sec.heading}>
                <h2 className="pol-h">{sec.heading}</h2>
                {sec.body.map((p, i) => (
                  <p key={i} className={i === 0 ? 'pol-p' : 'pol-p pol-p-next'}>
                    {p}
                  </p>
                ))}
              </section>
            ))}
          </div>
        </div>
      </GlassCard>

      {/* design 원문 `flex:none;padding:16px 0 26px`. 독 여백 120px은 여기 없다 —
          정책 화면은 독이 숨김이고 `AppShell`의 하단 여백이 0이다. */}
      <div className="pol-foot">
        <PrimaryButton label={CONFIRM} onClick={leave} />
      </div>
    </main>
  )
}
