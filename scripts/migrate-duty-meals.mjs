/**
 * W-21C — `dutySchedules` 중식/석식 마이그레이션 (§5.2 안 A · 사용자 확정)
 *
 * 🔴 **`--dry-run`이 기본값이다.** 실제 쓰기는 `--commit`을 명시했을 때만 일어난다.
 * 🔴 **옛 필드를 지우지 않는다.** 새 필드 4개를 **더할 뿐**이다 —
 *    그래서 마이그레이션과 앱 배포의 순서가 어느 쪽이어도 아무것도 깨지지 않는다.
 *
 * 왜 새 이름인가 — `patrolTime`·`patrolPlace`·`assignments`·`assigneeNames`는
 * **타입이 바뀐다**(string → map · 배열 → map). 같은 이름으로 타입을 바꾸면 옛 앱이
 * `[object Object] · [object Object]`를 그리거나(`patrolLine`) 요일 행을 **조용히 비운다**
 * (`toNameMap`의 `if (!Array.isArray(value)) continue`). 🔬 둘 다 코드에서 확인했다.
 *
 *   assignments        { mon: [uid] }            →  assignmentsByMeal   { mon: { lunch: [uid], dinner: [] } }
 *   assigneeNames      { mon: [name] }           →  assigneeNamesByMeal { mon: { lunch: [name], dinner: [] } }
 *   patrolTime         "07:50"                   →  patrolTimeByMeal    { lunch: "07:50", dinner: null }
 *   patrolPlace        "중앙 현관"                →  patrolPlaceByMeal   { lunch: "중앙 현관", dinner: null }
 *
 * ⚠ **변환은 기계적이다.** 옛 값을 **중식 자리에 그대로** 옮기고 석식은 비운다.
 *   `07:50`은 등교 지도 시각이므로 **부장이 앱에서 실제 중식/석식 시각으로 고쳐야 한다** —
 *   그 절차가 `database_ToDo/W-21C.md` §2.4다. 스크립트가 값을 지어내지 않는다.
 *
 * 되돌리는 법 — 🔴 **새 필드 4개를 지우면 끝이다.** 옛 필드는 손대지 않았으므로
 *   옛 앱이 그대로 돌아온다. `--revert --commit`이 그것을 한다.
 *
 * 사용법:
 *   node scripts/migrate-duty-meals.mjs                  dry-run (기본값 · 쓰기 0건)
 *   node scripts/migrate-duty-meals.mjs --commit         실제 실행
 *   node scripts/migrate-duty-meals.mjs --revert         되돌리기 dry-run
 *   node scripts/migrate-duty-meals.mjs --revert --commit  되돌리기 실행
 */

import fs from 'node:fs'
import process from 'node:process'
import { cert, initializeApp } from 'firebase-admin/app'
import { FieldValue, Firestore } from 'firebase-admin/firestore'

const EXPECTED_PROJECT_ID = 'sundo-dev-8ef38'

/** `src/lib/dateKeys.ts`의 `DAY_KEYS` 앞 5개. §9.3.6이 요구하는 맵 키다. */
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri']

/** 🔴 새 필드 4개. 되돌리기가 지우는 것도 정확히 이 넷이다. */
const NEW_FIELDS = [
  'assignmentsByMeal',
  'assigneeNamesByMeal',
  'patrolTimeByMeal',
  'patrolPlaceByMeal',
]

const argv = process.argv.slice(2)
const has = (flag) => argv.includes(flag)
const COMMIT = has('--commit')
const REVERT = has('--revert')

const log = (...a) => console.log(...a)
const rule = (t) => log(`\n${'━'.repeat(78)}\n${t}\n${'━'.repeat(78)}`)

/* ── 연결 ─────────────────────────────────────────────────────────────── */

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
if (!keyPath || !fs.existsSync(keyPath)) {
  console.error('\n🔴 GOOGLE_APPLICATION_CREDENTIALS 가 없거나 파일을 찾을 수 없다.\n')
  process.exit(1)
}
const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
if (key.project_id !== EXPECTED_PROJECT_ID) {
  console.error(`\n🔴 프로젝트가 다르다: ${key.project_id} (정본 ${EXPECTED_PROJECT_ID})\n`)
  process.exit(1)
}
initializeApp({ credential: cert(key), projectId: key.project_id })
const db = new Firestore({ projectId: key.project_id })

rule(`W-21C dutySchedules 중식/석식 마이그레이션 — ${REVERT ? '🔙 되돌리기' : '전진'}`)
log(`project = ${key.project_id}`)
log(COMMIT ? '🔴 --commit — 실제로 쓴다' : '🟡 dry-run — 쓰기 0건 (실행하려면 --commit)')

/* ── 변환 ─────────────────────────────────────────────────────────────── */

/** 배열이 아닌 값은 버린다(시딩 실수 방어 — `duty.ts`의 `toNameMap`과 같은 규율). */
function toArray(raw) {
  return Array.isArray(raw) ? raw.filter((v) => typeof v === 'string') : []
}

/**
 * `{ mon: [x] }` → `{ mon: { lunch: [x], dinner: [] } }`.
 * 🔴 **없는 요일도 키를 만든다** — 다섯 요일이 항상 있어야 화면 분기가 단순해진다.
 */
function toByMeal(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const out = {}
  for (const day of DAY_KEYS) {
    out[day] = { lunch: toArray(src[day]), dinner: [] }
  }
  return out
}

const snap = await db.collection('dutySchedules').get()
log(`\n대상 문서 ${snap.size}건`)

if (snap.size === 0) {
  log('🟡 문서가 없다. 할 일이 없다.')
  process.exit(0)
}

const plan = []

for (const doc of snap.docs) {
  const d = doc.data()
  const already = NEW_FIELDS.filter((f) => d[f] !== undefined)

  if (REVERT) {
    if (already.length === 0) {
      plan.push({ id: doc.id, ref: doc.ref, skip: '새 필드가 없다 — 이미 되돌려져 있다' })
      continue
    }
    const patch = {}
    for (const f of NEW_FIELDS) patch[f] = FieldValue.delete()
    plan.push({ id: doc.id, ref: doc.ref, patch, note: `새 필드 ${already.length}개 삭제` })
    continue
  }

  /* 🔴 **멱등이다.** 이미 새 필드가 넷 다 있으면 건너뛴다 — 두 번 돌려도 안전해야
     사용자가 dry-run 뒤 --commit을 마음 놓고 부를 수 있다. */
  if (already.length === NEW_FIELDS.length) {
    plan.push({ id: doc.id, ref: doc.ref, skip: '새 필드 4개가 이미 있다' })
    continue
  }

  const patch = {
    assignmentsByMeal: toByMeal(d.assignments),
    assigneeNamesByMeal: toByMeal(d.assigneeNames),
    /* 🔴 옛 값을 **중식 자리에** 그대로. 석식은 `null`이고 화면은 값이 없으면 줄을
       그리지 않는다(`duty.ts`의 「추측한 값을 그리지 않는다」 계약). */
    patrolTimeByMeal: { lunch: typeof d.patrolTime === 'string' ? d.patrolTime : null, dinner: null },
    patrolPlaceByMeal: { lunch: typeof d.patrolPlace === 'string' ? d.patrolPlace : null, dinner: null },
  }
  plan.push({ id: doc.id, ref: doc.ref, patch, before: d })
}

/* ── 요약 (실행 전에 눈으로 본다) ─────────────────────────────────────── */

rule('변환 결과 — 실행 전 확인')

for (const p of plan) {
  if (p.skip) {
    log(`\n  ┌ ${p.id}\n  └   ⏭  건너뛴다 — ${p.skip}`)
    continue
  }
  if (REVERT) {
    log(`\n  ┌ ${p.id}\n  └   🔙 ${p.note}: ${NEW_FIELDS.join(', ')}`)
    continue
  }
  const b = p.before
  log(`\n  ┌ ${p.id}`)
  log(`  │   patrolTime        ${JSON.stringify(b.patrolTime ?? null)}`)
  log(`  │     → patrolTimeByMeal   ${JSON.stringify(p.patch.patrolTimeByMeal)}`)
  log(`  │   patrolPlace       ${JSON.stringify(b.patrolPlace ?? null)}`)
  log(`  │     → patrolPlaceByMeal  ${JSON.stringify(p.patch.patrolPlaceByMeal)}`)
  for (const day of DAY_KEYS) {
    const oldIds = toArray((b.assignments ?? {})[day])
    const oldNames = toArray((b.assigneeNames ?? {})[day])
    const nx = p.patch.assignmentsByMeal[day]
    log(
      `  │   ${day}  담당 ${oldIds.length}명 ${JSON.stringify(oldNames)}` +
        `  →  중식 ${nx.lunch.length}명 · 석식 ${nx.dinner.length}명`,
    )
  }
  log('  └   🔴 옛 필드 4개는 **그대로 남는다**')
}

const toWrite = plan.filter((p) => !p.skip)
rule(`쓸 문서 ${toWrite.length}건 / 전체 ${plan.length}건`)

if (toWrite.length === 0) {
  log('할 일이 없다.')
  process.exit(0)
}

if (!COMMIT) {
  log('🟡 dry-run — 아무것도 쓰지 않았다.')
  log(`   실행하려면: node scripts/migrate-duty-meals.mjs ${REVERT ? '--revert ' : ''}--commit`)
  process.exit(0)
}

/* ── 실행 ─────────────────────────────────────────────────────────────── */

const batch = db.batch()
for (const p of toWrite) batch.update(p.ref, p.patch)
await batch.commit()

log(`✅ ${toWrite.length}건 ${REVERT ? '되돌렸다' : '갱신했다'}.`)
log(
  REVERT
    ? '   새 필드 4개를 지웠다. 옛 필드는 손대지 않았으므로 옛 앱이 그대로 돈다.'
    : '   🔴 옛 필드 4개는 그대로다. 되돌리려면 --revert --commit.',
)
