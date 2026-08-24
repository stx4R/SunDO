import { PolicyScreen } from '../components/PolicyScreen'
import { OSS } from '../lib/policy'

/**
 * S-oss 오픈소스 라이선스 — `/policy/oss` · design `20h` · PRD §8.12.4.
 *
 * 레이아웃은 `PolicyScreen`이, 목록은 `lib/policy.ts`가 갖는다.
 * 🔴 **목록은 `package.json`의 `dependencies`와 1:1이다.** 늘리거나 줄이지 마라.
 */
export default function PolicyOss() {
  return <PolicyScreen doc={OSS} />
}
