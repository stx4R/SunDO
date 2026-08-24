import { PolicyScreen } from '../components/PolicyScreen'
import { PRIVACY } from '../lib/policy'

/**
 * S-privacy 개인정보 처리방침 — `/policy/privacy` · design `20i` · PRD §8.12.2.
 *
 * 레이아웃은 `PolicyScreen`이, 문안은 `lib/policy.ts`가 갖는다(§8.12.1 —
 * 「세 화면은 동일한 레이아웃을 쓰고 제목·소제목·본문만 교체한다」).
 * 🔴 **여기에 문장을 적지 마라.** 본문의 사실 대조표는 `reports/W-18.md` §3이다.
 */
export default function PolicyPrivacy() {
  return <PolicyScreen doc={PRIVACY} />
}
