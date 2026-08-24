import { PolicyScreen } from '../components/PolicyScreen'
import { TERMS } from '../lib/policy'

/**
 * S-terms 서비스 이용약관 — `/policy/terms` · design `20g` · PRD §8.12.3.
 *
 * 레이아웃은 `PolicyScreen`이, 문안은 `lib/policy.ts`가 갖는다.
 * 🔴 **여기에 문장을 적지 마라.**
 */
export default function PolicyTerms() {
  return <PolicyScreen doc={TERMS} />
}
