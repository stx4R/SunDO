/**
 * W-16 규칙 테스트 러너.
 *   npm run rules:test        → 에뮬레이터를 띄우고 전량 실행
 *
 * 🔴 **거부 케이스 역검증** — `RULES_MUTATE=<이름>`을 주면 규칙의 한 조건을 일부러 열고
 *    돌린다. 그때 **빨개지는 테스트가 있어야** 그 조건이 실제로 일하고 있다는 증거다.
 *    「통과」만 확인하면 조건을 아예 안 쓴 규칙도 통과한다(§6 함정 1 · DoD 10).
 *    변형 목록은 `mutations.mjs`에 있다.
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync, unlinkSync } from 'node:fs'
import { startEnv, stopEnv, report } from './harness.mjs'
import { MUTATIONS } from './mutations.mjs'
import { run as records } from './suite-records.mjs'
import { run as users } from './suite-users.mjs'
import { run as admin } from './suite-admin.mjs'
import { run as batches } from './suite-batches.mjs'
import { run as recordcount } from './suite-recordcount.mjs'

const RULES = 'firestore.rules'
const BACKUP = 'firestore.rules.mutbak'
/**
 * 🔴 저장소의 규칙 파일은 CRLF다(Windows). 변형 조각은 LF로 적혀 있다.
 * ⚠ **양쪽 모두 정규화한다.** `core.autocrlf`가 켜진 환경에서 새로 clone하면
 *   `mutations.mjs`까지 CRLF가 되어, 규칙만 정규화하면 조각을 영원히 못 찾는다.
 */
const CRLF = String.fromCharCode(13) + String.fromCharCode(10)
const lf = (t) => t.split(CRLF).join('\n')
const name = process.env.RULES_MUTATE
/* 🔴 종료 코드 판정이 이 변형의 `breaks`를 봐야 한다 — 아래 마지막 블록. */
let mut = null

if (name) {
  const m = MUTATIONS.find((x) => x.name === name)
  mut = m
  if (!m) {
    console.error(`알 수 없는 변형: ${name}\n가능한 값: ${MUTATIONS.map((x) => x.name).join(', ')}`)
    process.exit(2)
  }
  /* 비교·치환 전에 줄바꿈을 정규화한다. 원복은 바이트 사본(BACKUP)에서 하므로
     원래 줄바꿈이 그대로 보존된다. */
  const src = lf(readFileSync(RULES, 'utf8'))
  if (!src.includes(lf(m.from))) {
    console.error(`변형 «${name}»의 원본 조각을 규칙에서 찾지 못했다. 규칙이 바뀌었으면 mutations.mjs를 갱신하라.`)
    process.exit(2)
  }
  copyFileSync(RULES, BACKUP)
  writeFileSync(RULES, src.split(lf(m.from)).join(lf(m.to)), 'utf8')
  console.log(`\n🔬 역검증 변형 «${name}» — ${m.why}`)
  console.log(
    m.breaks.length
      ? `   기대: ${m.breaks.join(', ')} 가 빨개진다\n`
      : '   기대: 🔴 **아무것도 빨개지지 않는다** — 이 조건은 혼자서는 아무것도 막지 않는다\n',
  )
}

let code = 1
try {
  await startEnv()
  await records()
  await users()
  await admin()
  await batches()
  await recordcount()
  code = report() === 0 ? 0 : 1
} finally {
  await stopEnv()
  if (name && existsSync(BACKUP)) {
    copyFileSync(BACKUP, RULES)
    unlinkSync(BACKUP)
    console.log('\n규칙 원본을 되돌렸다.')
  }
}

if (name) {
  /* 역검증에서는 **실패가 정상**이다. 종료 코드를 뒤집어 CI가 오해하지 않게 한다.
     🔴 단 `breaks`가 **빈 변형은 전량 통과가 정답**이다 — 「그 조건은 혼자서는 아무것도
     막지 않는다」가 측정 결과 자체인 경우다(`no-dollar-anchor` · W-16 Q-5 실측). */
  const wantRed = mut.breaks.length > 0
  const red = code !== 0
  if (wantRed) {
    console.log(
      red
        ? '\n✅ 변형이 테스트를 빨갛게 만들었다 — 조건이 실제로 일한다.'
        : '\n🔴 변형했는데 아무것도 빨개지지 않았다 — 그 조건은 일하고 있지 않다.',
    )
  } else {
    console.log(
      red
        ? '\n🔴 아무것도 빨개지지 않아야 하는 변형인데 빨개졌다 — 실측을 다시 하라.'
        : '\n✅ 예상대로 아무것도 빨개지지 않았다 — 이 조건은 혼자서는 아무것도 막지 않는다.',
    )
  }
  process.exit(wantRed === red ? 0 : 1)
}
process.exit(code)
