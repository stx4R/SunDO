/**
 * 🔴 W-16 §2.3 Q-1~Q-4 실측 — **이 넷이 규칙 구조를 결정한다.**
 * 통과/실패가 아니라 **관측값**을 찍는다. `npm run rules:probe`.
 */
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import {
  collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore'

const host = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'
const [h, p] = host.split(':')
const line = (k, v) => console.log(`  ${String(k).padEnd(46)} ${v}`)

async function withRules(rules, fn) {
  const env = await initializeTestEnvironment({
    projectId: 'demo-sundo-probe',
    firestore: { rules, host: h, port: Number(p) },
  })
  try {
    await env.clearFirestore()
    return await fn(env)
  } finally {
    await env.cleanup()
  }
}
const ok = async (pr) => {
  try {
    await pr
    return '허용'
  } catch (e) {
    return `거부 (${(e && e.code) || String(e).slice(0, 40)})`
  }
}

const HEAD = `rules_version = '2';\nservice cloud.firestore {\n  match /databases/{db}/documents {\n`
const TAIL = `  }\n}\n`

/* ── Q-1 ─────────────────────────────────────────────────────────────── */
console.log('\n🔴 Q-1 — `list` 질의에서 경로 와일드카드(`uid`) 조건을 쓸 수 있는가')
await withRules(
  HEAD +
    `    match /users/{uid} {
      // 부록 B 원문 그대로: 본인 조건과 부서원 조건을 \`allow read\`로 뭉쳤다.
      allow read: if request.auth.uid == uid || true;
      allow write: if true;
    }\n` +
    TAIL,
  async (env) => {
    const db = env.authenticatedContext('u1').firestore()
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'users/u1'), { n: 1 })
      await setDoc(doc(c.firestore(), 'users/u2'), { n: 2 })
    })
    line('allow read (뭉침) · 단건 get(본인)', await ok(getDoc(doc(db, 'users/u1'))))
    line('allow read (뭉침) · 단건 get(남)', await ok(getDoc(doc(db, 'users/u2'))))
    line('allow read (뭉침) · list 전체', await ok(getDocs(collection(db, 'users'))))
  },
)
await withRules(
  HEAD +
    `    match /users/{uid} {
      // 본인 조건만 남긴 경우 — list가 증명 불가한지 본다.
      allow read: if request.auth.uid == uid;
      allow write: if true;
    }\n` +
    TAIL,
  async (env) => {
    const db = env.authenticatedContext('u1').firestore()
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'users/u1'), { n: 1 })
    })
    line('allow read (본인만) · 단건 get(본인)', await ok(getDoc(doc(db, 'users/u1'))))
    line('allow read (본인만) · list 전체', await ok(getDocs(collection(db, 'users'))))
    line('allow read (본인만) · list where(__name__==본인)', await ok(
      getDocs(query(collection(db, 'users'), where('__name__', '==', 'u1'))),
    ))
  },
)
await withRules(
  HEAD +
    `    match /users/{uid} {
      allow get: if request.auth.uid == uid;
      allow list: if request.auth != null;
      allow write: if true;
    }\n` +
    TAIL,
  async (env) => {
    const db = env.authenticatedContext('u1').firestore()
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'users/u1'), { n: 1 })
      await setDoc(doc(c.firestore(), 'users/u2'), { n: 2 })
    })
    line('get/list 분리 · 단건 get(본인)', await ok(getDoc(doc(db, 'users/u1'))))
    line('get/list 분리 · 단건 get(남)', await ok(getDoc(doc(db, 'users/u2'))))
    line('get/list 분리 · list 전체', await ok(getDocs(collection(db, 'users'))))
  },
)

/* ── Q-2 ─────────────────────────────────────────────────────────────── */
console.log('\n🔴 Q-2 — 배치 안 `get(다른 문서)`가 보는 것은 배치 **이전** 상태인가')
await withRules(
  HEAD +
    `    match /dept/{id} { allow read, write: if true; }
    match /users/{uid} {
      allow read: if true;
      // 같은 배치가 dept.headUid를 대상 uid로 바꾼다. 규칙이 그것을 볼 수 있는가?
      allow write: if get(/databases/$(db)/documents/dept/d1).data.headUid == uid;
    }\n` +
    TAIL,
  async (env) => {
    const db = env.authenticatedContext('u1').firestore()
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'dept/d1'), { headUid: 'old' })
      await setDoc(doc(c.firestore(), 'users/target'), { role: 'member' })
    })
    const b = writeBatch(db)
    b.update(doc(db, 'dept/d1'), { headUid: 'target' })
    b.update(doc(db, 'users/target'), { role: 'head' })
    line('배치가 같은 배치의 dept 변경을 근거로 users write', await ok(b.commit()))
    line('  → 허용이면 get()이 배치 **이후**를 본다', '')
    line('  → 거부면 get()이 배치 **이전**을 본다 (자기 배치를 스스로 거부)', '')
  },
)

/* ── Q-3 ─────────────────────────────────────────────────────────────── */
console.log('\n🔴 Q-3 — 배치의 한 연산이 거부되면 나머지는 어떻게 되는가')
await withRules(
  HEAD +
    `    match /okc/{id}  { allow read, write: if true; }
    match /noc/{id} { allow read: if true; allow write: if false; }\n` +
    TAIL,
  async (env) => {
    const db = env.authenticatedContext('u1').firestore()
    const b = writeBatch(db)
    b.set(doc(db, 'okc/a'), { v: 1 })
    b.set(doc(db, 'noc/b'), { v: 1 })
    b.set(doc(db, 'okc/c'), { v: 1 })
    line('3연산 중 2번째만 거부되는 배치', await ok(b.commit()))
    let survived = 0
    await env.withSecurityRulesDisabled(async (c) => {
      for (const path of ['okc/a', 'okc/c']) {
        const s = await getDoc(doc(c.firestore(), path))
        if (s.exists()) survived += 1
      }
    })
    line('거부 뒤 실제로 남은 허용 연산 문서 수', `${survived} / 2`)
  },
)

/* ── Q-4 ─────────────────────────────────────────────────────────────── */
console.log('\n🔴 Q-4 — 규칙 안 `get()`의 호출 횟수와 과금')
await withRules(
  HEAD +
    `    match /users/{uid} { allow read, write: if true; }
    match /probe/{id} {
      // 같은 문서를 4번 참조한다. 캐시되면 1회, 아니면 4회로 계산된다.
      allow write: if get(/databases/$(db)/documents/users/u1).data.role == 'head'
        && get(/databases/$(db)/documents/users/u1).data.status == 'active'
        && get(/databases/$(db)/documents/users/u1).data.role != 'x'
        && get(/databases/$(db)/documents/users/u1).data.status != 'y';
    }\n` +
    TAIL,
  async (env) => {
    const db = env.authenticatedContext('u1').firestore()
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'users/u1'), { role: 'head', status: 'active' })
    })
    line('같은 문서를 4번 참조하는 규칙 · 단건 write', await ok(setDoc(doc(db, 'probe/p1'), { v: 1 })))
    const b = writeBatch(db)
    for (let i = 0; i < 4; i += 1) b.set(doc(db, `probe/b${i}`), { v: 1 })
    line('같은 규칙 · 4연산 배치', await ok(b.commit()))
    line('  → 규칙 평가는 **연산마다** 1회 돈다(문서 4개 = 평가 4회)', '')
  },
)

/* ── Q-4 확장 ────────────────────────────────────────────────────────── */
console.log('\n🔴 Q-4 확장 — `get()` 상한과 캐시. **무엇이 과금되는가**를 수치로 본다')

/** `n`개의 `get()`을 요구하는 규칙. `same`이면 **같은 문서**를 n번 본다. */
function costRule(n, same) {
  const calls = Array.from(
    { length: n },
    (_, i) => `get(/databases/$(db)/documents/costs/${same ? 'c0' : 'c' + i}).data.v == 1`,
  ).join('\n        && ')
  return (
    HEAD +
    `    match /costs/{id} { allow read, write: if true; }
    match /probe/{id} { allow write: if ${calls}; }\n` +
    TAIL
  )
}
async function cost(n, same, label, batchOps = 0) {
  await withRules(costRule(n, same), async (env) => {
    const db = env.authenticatedContext('u1').firestore()
    await env.withSecurityRulesDisabled(async (c) => {
      for (let i = 0; i < 20; i += 1) await setDoc(doc(c.firestore(), `costs/c${i}`), { v: 1 })
    })
    if (batchOps === 0) {
      line(label, await ok(setDoc(doc(db, 'probe/p1'), { v: 1 })))
    } else {
      const b = writeBatch(db)
      for (let i = 0; i < batchOps; i += 1) b.set(doc(db, `probe/b${i}`), { v: 1 })
      line(label, await ok(b.commit()))
    }
  })
}
/* 단건 요청의 상한 — 어디서 끊기는지 본다. */
await cost(9, false, '단건 write · 서로 다른 문서 get() 9회')
await cost(10, false, '단건 write · 서로 다른 문서 get() 10회')
await cost(11, false, '🔴 단건 write · 서로 다른 문서 get() 11회')
/* 같은 문서를 여러 번 봐도 되는가 = 캐시되는가 = 과금 단위가 「호출」이 아니라 「문서」인가 */
await cost(15, true, '🔴 단건 write · **같은** 문서 get() 15회 (캐시 여부)')
/* 배치의 상한이 연산마다인지 요청 전체인지 — 3연산 × 8회 = 총 24회 */
await cost(8, false, '배치 3연산 · 연산마다 서로 다른 문서 get() 8회 (합계 24)', 3)
await cost(6, false, '배치 4연산 · 연산마다 서로 다른 문서 get() 6회 (합계 24)', 4)

/* ── Q-5 (신규) ──────────────────────────────────────────────────────── */
console.log('\n🔴 Q-5(신규) — 도메인 정규식에서 `$` 앵커가 **실제로** 막는 것')
const EMAILS = ['ok@dshs.kr', 'attacker@dshs.kr.evil.com', 'dshs.kr@evil.com']
for (const re of ['.*@dshs[.]kr$', '.*@dshs[.]kr', '.*@dshs[.]kr.*']) {
  await withRules(
    HEAD + `    match /gate/{id} { allow read: if request.auth.token.email.matches('${re}'); }\n` + TAIL,
    async (env) => {
      for (const email of EMAILS) {
        const db = env.authenticatedContext(`u-${EMAILS.indexOf(email)}`, { email }).firestore()
        line(`matches('${re}')  ←  ${email}`, await ok(getDoc(doc(db, 'gate/g1'))))
      }
    },
  )
}

/* ── 참고: 규칙 파일이 실제로 로드되는가 ─────────────────────────────── */
console.log('\n참고 — 실제 `firestore.rules`가 로드되면 PRD 밖 컬렉션이 거부된다')
await withRules(readFileSync('firestore.rules', 'utf8'), async (env) => {
  const db = env.authenticatedContext('u1', { email: 'u1@dshs.kr' }).firestore()
  line('학교 계정이 `zzruleprobe` 읽기', await ok(getDoc(doc(db, 'zzruleprobe/x'))))
  line('학교 계정이 `zzruleprobe` 쓰기', await ok(setDoc(doc(db, 'zzruleprobe/x'), { a: 1 })))
  line('프로필 없는 학교 계정이 `inviteCodes` 단건 get', await ok(
    getDoc(doc(db, 'departments/dshs-jayul/inviteCodes/DJSN-2691')),
  ))
  line('프로필 없는 학교 계정이 남의 `users` 읽기', await ok(getDoc(doc(db, 'users/other'))))
  line('프로필 없는 학교 계정이 남의 `users` 쓰기', await ok(
    updateDoc(doc(db, 'users/other'), { role: 'head' }),
  ))
})

console.log('')
process.exit(0)
