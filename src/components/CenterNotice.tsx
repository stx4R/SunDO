import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

interface CenterNoticeProps {
  /** 72px 원 안에 들어가는 28px 글리프. 시안이 없는 상태에서는 생략한다. */
  icon?: ReactNode
  /** 원 배경·글리프 색. `danger`는 `6j`·`6k`의 붉은 조합이다. */
  tone?: 'neutral' | 'danger'
  title: string
  hint?: string
  /** `다시 시도` 같은 복구 수단. 제목·힌트 아래 16px. */
  action?: ReactNode
}

/**
 * 빈 상태·에러 상태의 중앙 안내 블록. design `6e`(빈 상태) · `6j`·`6k`(에러) 원문이고
 * §20.7이 이 둘을 **화면을 가리지 않고** 채택하므로 앱 공용 패턴이다.
 *
 * S4 빈 상태(`등록된 반 정보가 없습니다`)에는 **시안이 없다.** PRD §8.4.5가 문구만
 * 규정하므로 아이콘 없이 문구만 그린다 — `6e`의 사람 글리프를 「반 정보 없음」에
 * 갖다 붙이면 §20.7.1 OV-05의 「임의로 새 디자인을 지어내지 마라」에 걸린다.
 *
 * `flex: 1`로 남은 높이를 채운다. 부모가 flex 컬럼이어야 세로 중앙에 선다.
 */
export function CenterNotice({ icon, tone = 'neutral', title, hint, action }: CenterNoticeProps) {
  return (
    <div className="cnote" role="status">
      {icon && (
        <div className={cn('cnote-icon', tone === 'danger' && 'cnote-icon-danger')}>{icon}</div>
      )}
      <p className="cnote-title">{title}</p>
      {hint && <p className="cnote-hint">{hint}</p>}
      {action}
    </div>
  )
}
