import { cn } from '../lib/cn'
import { ExternalLinkIcon } from './icons'

interface FooterProps {
  variant: 'full' | 'compact'
  /**
   * 🔴 **W-21 P-6 — 기본값이 생겼다.** W-05까지는 저장소에 로고 자산이 없어 `자` 이니셜로
   * 폴백했다(§8.1.2). `public/DSHS.png`가 들어오면서 그 폴백이 사라진다.
   * prop은 남겨 둔다 — 다른 로고를 넣을 자리를 미리 닫지 않는다.
   */
  logoSrc?: string
  /** 없으면 `<a href>`로 폴백한다. W-05가 라우터 링크로 교체한다. */
  onNavigate?: (path: string) => void
}

interface PolicyLink {
  path: string
  label: string
}

/* 문구·순서 고정(§6.4 C6). */
const POLICY: readonly PolicyLink[] = [
  { path: '/policy/privacy', label: '개인정보 처리방침' },
  { path: '/policy/terms', label: '서비스 이용약관' },
  { path: '/policy/oss', label: '오픈소스 라이선스' },
]

/**
 * PRD §6.4 Footer 상세(C6). design `14a`(전체형) · `14b`(축약형) · `14c`(320px 접힘).
 *
 * 배경을 깔지 않는다 — 스테이지 그라디언트가 비친다.
 * 독 여백 120px을 여기서 더하지 않는다 — `AppShell`이 이미 갖고 있다.
 */
export function Footer({ variant, logoSrc = '/DSHS.png', onNavigate }: FooterProps) {
  const full = variant === 'full'
  const links = full ? POLICY : POLICY.slice(0, 2)

  const linkProps = (path: string) =>
    onNavigate
      ? {
          href: path,
          onClick: (e: React.MouseEvent) => {
            e.preventDefault()
            onNavigate(path)
          },
        }
      : { href: path }

  return (
    <footer
      aria-label="사이트 정보"
      className={cn('ft', full ? 'pt-0' : 'pt-[18px]')}
    >
      {full && (
        <>
          <div className="ft-hr" />
          <div className="flex items-center pt-[22px]">
            {/* 🔴 W-21 P-6 — `alt=""`가 맞다. 바로 오른쪽의 `SunDO` / `자율생활부 ·
                대전대신고등학교`가 같은 정보를 이미 텍스트로 준다. 이름을 넣으면 스크린리더가
                두 번 읽는다. §8.10에 없는 문구를 새로 짓지 않는 것이 규약이고, 여기서는
                **문구가 필요 없다는 것이 답**이다(보고서 §3 P-6). */}
            <span className="ft-logo">
              <img src={logoSrc} alt="" className="h-full w-full object-cover" />
            </span>
            <div className="ml-[10px]">
              <div className="text-button font-bold tracking-[-0.01em] text-sundo-800">SunDO</div>
              <div className="mt-[2px] text-micro font-medium text-sundo-ink-70">
                자율생활부 · 대전대신고등학교
              </div>
            </div>
          </div>
        </>
      )}

      {/* 전체형은 로고 줄과 시각 간격 16px(= margin 1 + padding 15).
          축약형은 상단 패딩 18px에서 링크 자체 패딩 15px을 되돌린다. */}
      <div className={cn('ft-links', full ? 'ft-links-full mt-px' : 'mt-[-15px]')}>
        <div className="ft-row">
          <a className="ft-a" {...linkProps(links[0].path)}>
            {links[0].label}
          </a>
          <i className="ft-sep" aria-hidden="true" />
          <a className="ft-a" {...linkProps(links[1].path)}>
            {links[1].label}
          </a>
        </div>
        {full && (
          <>
            <i className="ft-sep ft-sep-outer" aria-hidden="true" />
            <a className="ft-a" {...linkProps(links[2].path)}>
              {links[2].label}
            </a>
          </>
        )}
      </div>

      <div className="ft-copy">© 2026 SunDO. All rights reserved.</div>

      <a
        className="ft-dev"
        href="https://stx4r.me/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Developed by <b>stx4R</b>
        <ExternalLinkIcon className="ml-[3px] text-sundo-ink-45" />
        <span className="sr-only">외부 링크로 이동</span>
      </a>
    </footer>
  )
}
