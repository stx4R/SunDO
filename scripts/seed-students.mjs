/**
 * W-16D — 학생 명부 임포트 (`students` 1,033건 · 30개 반)
 *
 * PRD §9.3.4(문서 규격) · §9.4.1 DR-01(학번 파생) · `database_ToDo/W-11.md` §5-3(타입) ·
 * `database_ToDo/W-12.md` §6(문서 ID) · `database_ToDo/W-16.md` · 지시서 W-16D §2.
 *
 * 🔴 **`--dry-run`이 기본값이다.** 실제 쓰기는 `--commit`을 명시했을 때만 일어난다.
 *
 * 🔴 **`studentNo`를 여기서 다시 만들지 마라.** `src/lib/studentNo.ts`의 `toStudentNo`가
 *    DR-01의 유일한 구현이고 앱(`lib/roster.ts`)이 같은 함수를 쓴다. 파생 규칙이 두 벌이
 *    되면 명부와 화면이 갈리는 순간을 아무도 못 잡는다(`dateKeys.ts`가 KST 변환을 한 곳에
 *    모아 둔 것과 같은 이유다). Node 24의 타입 스트리핑으로 `.ts`를 그대로 import한다.
 *
 * 🔴 **이름을 출력하지 마라**(§14.1 PR-02). 통계와 문서 ID만 낸다. `--inspect`의 이름은
 *    첫 글자만 남기고 마스킹한다.
 *
 * 자격 증명: 환경변수 `GOOGLE_APPLICATION_CREDENTIALS`가 가리키는 서비스 계정 키.
 * 🔴 키 경로를 코드에 박지 않는다. 키 파일은 `.gitignore`가 막는다(지시서 §2.4).
 *
 * 사용법
 *   node scripts/seed-students.mjs --inspect            기존 문서 덤프 (읽기 전용)
 *   node scripts/seed-students.mjs                      dry-run (기본값 · 쓰기 0건)
 *   node scripts/seed-students.mjs --prune              임포트 + 잔존분 비활성 (둘 다 dry-run)
 *   node scripts/seed-students.mjs --prune --commit     실제 실행
 *   node scripts/seed-students.mjs --delete-ids=a,b --commit   명시한 ID만 삭제
 */

import fs from 'node:fs'
import process from 'node:process'
import { cert, initializeApp } from 'firebase-admin/app'
import { FieldValue, Firestore } from 'firebase-admin/firestore'
import { toStudentNo } from '../src/lib/studentNo.ts'

/* ── 상수 ─────────────────────────────────────────────────────────────── */

/** 🔴 `.firebaserc`의 `default`. 다른 프로젝트면 실행을 거부한다(`sundo-c5095`·`sundo-dev` 사고 방지). */
const EXPECTED_PROJECT_ID = 'sundo-dev-8ef38'

/** 지시서 §2.1. 부서 문서 `academicYear`와 **정확히 같아야** 한다(number, 문자열 아님). */
const ACADEMIC_YEAR = 2026

const DEFAULT_CSV = 'database_ToDo/2026_학생명부_임포트.csv'

/** Firestore `writeBatch` 상한. */
const BATCH_SIZE = 500

const EXPECTED_HEADER = 'grade,classNo,number,name'

/* ── 인자 ─────────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2)
const has = (flag) => argv.includes(flag)
const valueOf = (prefix) => {
  const hit = argv.find((a) => a.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : null
}

const MODE_INSPECT = has('--inspect')
const MODE_PRUNE = has('--prune')
const COMMIT = has('--commit')
const DELETE_IDS = (valueOf('--delete-ids=') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const CSV_PATH = valueOf('--csv=') ?? DEFAULT_CSV

/* ── 출력 도우미 ──────────────────────────────────────────────────────── */

const log = (...a) => console.log(...a)
const fail = (msg) => {
  console.error(`\n🔴 ${msg}\n`)
  process.exit(1)
}

/** §14.1 PR-02 — 이름은 첫 글자만 남긴다. */
const maskName = (name) =>
  typeof name === 'string' && name.length > 0 ? name[0] + '*'.repeat(Math.max(1, name.length - 1)) : '(없음)'

/** 값과 **타입**을 함께 보인다 — `academicYear`가 문자열 `"2026"`이면 등식 질의가 조용히 빗나간다. */
const typed = (v) => {
  if (v === undefined) return '(필드없음)'
  if (v === null) return 'null'
  return `${JSON.stringify(v)}:${typeof v}`
}

/* ── Firestore ────────────────────────────────────────────────────────── */

function connect() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!keyPath) {
    fail(
      '환경변수 GOOGLE_APPLICATION_CREDENTIALS 가 없다.\n' +
        '   서비스 계정 키 경로를 지정하고 다시 실행하라. 코드에 경로를 박지 않는다.',
    )
  }
  if (!fs.existsSync(keyPath)) fail(`서비스 계정 키를 찾을 수 없다: ${keyPath}`)

  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
  if (key.project_id !== EXPECTED_PROJECT_ID) {
    fail(
      `프로젝트가 다르다. 키의 project_id = ${key.project_id}\n` +
        `   정본은 ${EXPECTED_PROJECT_ID} 다(database_ToDo/W-16.md §2.1).`,
    )
  }

  initializeApp({ credential: cert(key), projectId: key.project_id })
  log(`project = ${key.project_id}  ·  key = ${key.client_email}`)
  return new Firestore({ projectId: key.project_id })
}

/* ── CSV ──────────────────────────────────────────────────────────────── */

function readCsv(path) {
  if (!fs.existsSync(path)) fail(`CSV를 찾을 수 없다: ${path}`)
  let raw = fs.readFileSync(path, 'utf8')
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1) // BOM

  const lines = raw.split(/\r?\n/)
  const header = lines[0]?.trim()
  if (header !== EXPECTED_HEADER) {
    fail(`헤더가 다르다.\n   기대: ${EXPECTED_HEADER}\n   실제: ${header}`)
  }

  const problems = []
  const rows = []

  lines.slice(1).forEach((line, i) => {
    if (line.trim() === '') return
    const lineNo = i + 2
    const cols = line.split(',')
    if (cols.length !== 4) {
      problems.push(`${lineNo}행: 열이 ${cols.length}개(4개여야 한다)`)
      return
    }
    const grade = Number(cols[0])
    const classNo = Number(cols[1])
    const number = Number(cols[2])
    const name = cols[3].trim()

    /* PRD §9.3.4 제약. 🔴 결번(전학·자퇴 자리)은 정상이므로 연속성은 검사하지 않는다. */
    if (!Number.isInteger(grade) || grade < 1 || grade > 3) problems.push(`${lineNo}행: grade`)
    if (!Number.isInteger(classNo) || classNo < 1) problems.push(`${lineNo}행: classNo`)
    if (!Number.isInteger(number) || number < 1) problems.push(`${lineNo}행: number`)
    if (name.length < 2 || name.length > 10) problems.push(`${lineNo}행: name 길이 ${name.length}`)

    /* 🔴 DR-01의 유일한 구현. 여기서 다시 만들지 않는다. */
    const studentNo = toStudentNo({ grade, classNo, number })
    rows.push({ id: `${ACADEMIC_YEAR}_${studentNo}`, studentNo, grade, classNo, number, name })
  })

  return { rows, problems }
}

function summarize(rows) {
  const byGrade = {}
  const byClass = {}
  const seen = new Map()
  for (const r of rows) {
    byGrade[r.grade] = (byGrade[r.grade] ?? 0) + 1
    const key = `${r.grade}-${r.classNo}`
    byClass[key] = (byClass[key] ?? 0) + 1
    seen.set(r.id, (seen.get(r.id) ?? 0) + 1)
  }
  const duplicates = [...seen].filter(([, n]) => n > 1).map(([id]) => id)
  return { byGrade, byClass, duplicates }
}

/* ── 모드: --inspect ──────────────────────────────────────────────────── */

async function inspect(db, importIds) {
  const snap = await db.collection('students').get()
  log(`\n기존 students 문서: ${snap.size}건\n`)
  if (snap.empty) return

  log('  문서 ID           academicYear      grade      classNo    number     isActive        이름   임포트범위')
  log('  ' + '─'.repeat(104))

  let covered = 0
  const outside = []
  snap.docs
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach((d) => {
      const v = d.data()
      const inRange = importIds.has(d.id)
      if (inRange) covered += 1
      else outside.push(d.id)
      log(
        `  ${d.id.padEnd(17)} ${typed(v.academicYear).padEnd(17)} ${typed(v.grade).padEnd(10)} ` +
          `${typed(v.classNo).padEnd(10)} ${typed(v.number).padEnd(10)} ${typed(v.isActive).padEnd(15)} ` +
          `${maskName(v.name).padEnd(6)} ${inRange ? '✅ 덮어써짐' : '🔴 범위 밖'}`,
      )
    })

  log(`\n  덮어써질 것 ${covered}건 · 🔴 범위 밖으로 남을 것 ${outside.length}건`)
  if (outside.length > 0) {
    log(`  범위 밖 ID: ${outside.join(', ')}`)
    log('  🔴 이대로 임포트하면 문서 수가 1,033을 넘고 S5에 유령 학생이 남는다.')
  }

  /* `studentNo`가 문서 ID와 어긋나는지도 본다 — DR-01 파생이 깨진 문서를 찾는 유일한 방법이다. */
  const mismatched = snap.docs.filter((d) => {
    const v = d.data()
    if (typeof v.grade !== 'number' || typeof v.classNo !== 'number' || typeof v.number !== 'number') return true
    return d.id !== `${ACADEMIC_YEAR}_${toStudentNo({ grade: v.grade, classNo: v.classNo, number: v.number })}`
  })
  log(`  DR-01 파생과 문서 ID가 어긋나는 문서: ${mismatched.length}건` +
    (mismatched.length ? ` → ${mismatched.map((d) => d.id).join(', ')}` : ''))
}

/* ── 모드: --delete-ids ───────────────────────────────────────────────── */

async function deleteIds(db, ids) {
  log(`\n삭제 대상 ${ids.length}건: ${ids.join(', ')}`)
  if (!COMMIT) {
    log('🟡 dry-run — 삭제하지 않았다. 실행하려면 --commit 을 붙여라.')
    return
  }
  const batch = db.batch()
  ids.forEach((id) => batch.delete(db.collection('students').doc(id)))
  await batch.commit()
  log(`✅ ${ids.length}건 삭제 완료.`)
}

/* ── 모드: --prune ────────────────────────────────────────────────────── */

/**
 * 임포트 범위 **밖**에 남은 문서를 `isActive: false`로 내린다.
 *
 * 🔴 **건드리는 필드는 `isActive`·`updatedAt` 둘뿐이다.** `update()`를 쓰므로 이름·번호·학년은
 *    그대로 남는다. **삭제하지 않는다** — 삭제만이 유일하게 되돌릴 수 없는 조작이고,
 *    `isActive`를 `true`로 되돌리면 원상 복구가 끝난다. `records.studentDocId` 참조도 유지된다.
 *
 * 🔴 **`where('academicYear','==',2026)`로 거르지 않는다.** 그 등식은 `academicYear`가 문자열
 *    `"2026"`이거나 필드가 아예 없는 문서를 **조용히 놓친다**(W-11 §5-3이 경고하는 자리다).
 *    컬렉션 전체를 읽어 **문서 ID가 임포트 집합에 있느냐**만으로 가른다 — 타입에 의존하지 않는
 *    유일한 기준이다. 명부는 반 30개 × 최대 37명이라 전량 스캔이 싸다.
 *
 * 🔴 **일회용이 아니다.** 내년 학년 진급 때 `students`를 새 학년도 명부로 다시 임포트하면
 *    이전 학년도 문서 전량이 정확히 이 경로로 내려간다(`isActive:false` = 졸업·전출과 같은
 *    표현, PRD §9.3.4). 그때도 `--prune`을 쓰고, 지우지 마라 — 지난 학년도 기록의
 *    `studentDocId`가 그 문서들을 가리키고 있다.
 */
async function prune(db, importIds) {
  const snap = await db.collection('students').get()
  const residual = snap.docs.filter((d) => !importIds.has(d.id))

  log(`\n[prune] students 전량 ${snap.size}건 스캔 · 임포트 범위 밖 ${residual.length}건`)

  /* 사용자 지시 — `academicYear`가 number가 아닌 문서는 등식 prune이 놓쳤을 것들이다.
     ID 기준 스캔은 놓치지 않지만, **그런 문서가 있었다는 사실 자체가 발견**이므로 따로 센다. */
  const anomalous = snap.docs.filter((d) => typeof d.data().academicYear !== 'number')
  log(`[prune] academicYear가 number가 아닌 문서: ${anomalous.length}건` +
    (anomalous.length ? ` 🔴 → ${anomalous.map((d) => `${d.id}(${typed(d.data().academicYear)})`).join(', ')}` : ' ✅'))

  const targets = residual.filter((d) => d.data().isActive !== false)
  log(`[prune] 그중 이미 isActive:false 인 것 ${residual.length - targets.length}건 · 🔴 내릴 대상 ${targets.length}건`)

  if (targets.length === 0) {
    /* 🔴 대상이 0건이어도 경로가 돌았다는 것을 로그로 남긴다 — 「돌지 않았다」와 구별해야 한다. */
    log('[prune] ✅ 대상 0건 — 경로는 실행됐고 내릴 문서가 없었다. 잔존분 없음.')
    return { residualIds: [], pruned: 0 }
  }

  log(`[prune] 대상 ID: ${targets.map((d) => d.id).join(', ')}`)
  if (!COMMIT) {
    log('[prune] 🟡 dry-run — 내리지 않았다.')
    return { residualIds: targets.map((d) => d.id), pruned: 0 }
  }

  let pruned = 0
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const slice = targets.slice(i, i + BATCH_SIZE)
    const batch = db.batch()
    /* 🔴 `update` — 두 필드만 건드린다. `set`을 쓰면 나머지 필드가 날아간다. */
    slice.forEach((d) => batch.update(d.ref, { isActive: false, updatedAt: FieldValue.serverTimestamp() }))
    await batch.commit()
    pruned += slice.length
  }
  log(`[prune] ✅ ${pruned}건을 isActive:false 로 내렸다.`)
  return { residualIds: targets.map((d) => d.id), pruned }
}

/* ── 검증: §2.5 검증 1번 ──────────────────────────────────────────────── */

async function verify(db, expected) {
  const total = await db.collection('students').count().get()
  const active = await db.collection('students').where('isActive', '==', true).count().get()
  const totalN = total.data().count
  const activeN = active.data().count
  log(`\n[검증] 전체 문서 ${totalN}건 · isActive:true ${activeN}건 (기대 ${expected})`)
  log(`[검증] isActive:true == ${expected}  ${activeN === expected ? '✅' : '🔴 어긋난다'}`)
  log(`[검증] 잔존분(전체 − 활성) ${totalN - activeN}건`)
  return { totalN, activeN }
}

/* ── 모드: 임포트 ─────────────────────────────────────────────────────── */

async function seed(db, rows) {
  const started = Date.now()
  let ok = 0
  const failedBatches = []

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE)
    const batchIndex = Math.floor(i / BATCH_SIZE)
    const batch = db.batch()

    for (const r of slice) {
      /* 🔴 `merge: false` — 같은 문서 ID면 통째로 덮어쓴다. 재실행해도 중복이 생기지 않는다.
         PRD §9.3.4의 8필드를 정확히 쓴다. 앱이 읽지 않는 필드를 발명하지 않는다. */
      batch.set(db.collection('students').doc(r.id), {
        studentNo: r.studentNo,
        grade: r.grade,
        classNo: r.classNo,
        number: r.number,
        name: r.name,
        academicYear: ACADEMIC_YEAR,
        isActive: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    try {
      await batch.commit()
      ok += slice.length
      log(`  배치 ${batchIndex}: ${slice.length}건 ✅`)
    } catch (error) {
      failedBatches.push({ batchIndex, size: slice.length, message: error?.message ?? String(error) })
      log(`  배치 ${batchIndex}: ${slice.length}건 🔴 실패 — ${error?.message ?? error}`)
    }
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  log(`\n성공 ${ok}건 · 실패 ${rows.length - ok}건 · ${elapsed}초`)
  if (failedBatches.length > 0) {
    log(`🔴 실패한 배치 인덱스: ${failedBatches.map((f) => f.batchIndex).join(', ')}`)
    failedBatches.forEach((f) => log(`   [${f.batchIndex}] ${f.message}`))
    process.exitCode = 1
  }
}

/* ── main ─────────────────────────────────────────────────────────────── */

const { rows, problems } = readCsv(CSV_PATH)
const { byGrade, byClass, duplicates } = summarize(rows)

log(`\nCSV = ${CSV_PATH}`)
log(`총 ${rows.length}건 · 학년별 ${Object.keys(byGrade).sort().map((g) => `${g}학년 ${byGrade[g]}`).join(' · ')}`)
log(`반 ${Object.keys(byClass).length}개`)
log(
  '  ' +
    Object.keys(byClass)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((k) => `${k}:${byClass[k]}`)
      .join('  '),
)
log(`중복 문서 ID ${duplicates.length}건${duplicates.length ? ` → ${duplicates.join(', ')}` : ''}`)
log(`필드 누락·이상 ${problems.length}건${problems.length ? `\n  ${problems.slice(0, 20).join('\n  ')}` : ''}`)

if (duplicates.length > 0) fail('중복 문서 ID가 있다. 임포트하지 않는다.')
if (problems.length > 0) fail('필드 이상이 있다. 임포트하지 않는다.')

const db = connect()

const importIds = new Set(rows.map((r) => r.id))

if (MODE_INSPECT) {
  await inspect(db, importIds)
} else if (DELETE_IDS.length > 0) {
  await deleteIds(db, DELETE_IDS)
} else {
  if (COMMIT) {
    log(`\n임포트 시작 — ${rows.length}건 / 배치 ${Math.ceil(rows.length / BATCH_SIZE)}개`)
    await seed(db, rows)
  } else {
    log('\n🟡 dry-run (기본값) — Firestore에 한 바이트도 쓰지 않았다.')
    log(`   실행하려면: node scripts/seed-students.mjs${MODE_PRUNE ? ' --prune' : ''} --commit`)
    log(`   배치 ${Math.ceil(rows.length / BATCH_SIZE)}개로 나뉜다(배치당 최대 ${BATCH_SIZE}건).`)
  }

  /* 🔴 prune은 임포트 **뒤**에 돈다 — 최종 상태를 스캔해야 잔존분이 정확하다. */
  if (MODE_PRUNE) await prune(db, importIds)

  if (COMMIT) await verify(db, rows.length)
}

process.exit(process.exitCode ?? 0)
