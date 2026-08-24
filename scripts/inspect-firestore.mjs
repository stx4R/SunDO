/**
 * W-16D — 배포 전 실 Firestore 상태 점검 (🔴 **읽기 전용**)
 *
 * 지시서 W-16D §1 인벤토리의 콘솔 확인을 코드로 대체·보강한다.
 * `seed-students.mjs`가 `students`를 맡고, 이 스크립트는 나머지 셋을 본다.
 *
 * 🔴 **이 파일에는 쓰기 코드가 한 줄도 없다.** `set`·`update`·`delete`·`batch` 어느 것도
 *    import하지 않는다. 되돌리기 비싼 조작이 셋 있는 회차에서 진단 도구가 쓰기를 할 수
 *    있으면 사고의 표면적이 그만큼 넓어진다. 수정은 콘솔에서 사람이 한다.
 *
 * 보는 것 넷
 *   1. `departments/dshs-jayul`            — `headUid`·`activeInviteCodeId`·`memberCount`
 *   2. `departments/…/inviteCodes`         — 🔴 부서가 가리키지 않는 **고아 활성 코드**를 찾는다
 *   3. `dutySchedules`                     — 필드 집합이 `database_ToDo/W-14.md` §1과 맞는지
 *   4. `auditLogs`                         — 위 상태가 어떻게 생겼는지 추정할 근거
 *
 * 자격 증명은 `seed-students.mjs`와 같다(`GOOGLE_APPLICATION_CREDENTIALS`).
 *
 * 사용법: node scripts/inspect-firestore.mjs
 */

import fs from 'node:fs'
import process from 'node:process'
import { cert, initializeApp } from 'firebase-admin/app'
import { Firestore } from 'firebase-admin/firestore'

const EXPECTED_PROJECT_ID = 'sundo-dev-8ef38'
const DEPARTMENT_ID = 'dshs-jayul'

/** `src/lib/dateKeys.ts`의 `DAY_KEYS` 앞 5개. W-14 §1.3이 요구하는 맵 키다. */
const DUTY_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri']

/** PRD §9.3.6. */
const DUTY_FIELDS = [
  'weekId', 'startDate', 'endDate', 'assignments', 'assigneeNames',
  'patrolTime', 'patrolPlace', 'createdBy', 'updatedBy', 'updatedAt',
]

/** PRD §9.3.3. */
const CODE_FIELDS = ['code', 'issuedBy', 'issuedAt', 'expiresAt', 'isActive', 'revokedAt', 'useCount', 'maxUses']

const log = (...a) => console.log(...a)
const rule = (t) => log(`\n${'━'.repeat(78)}\n${t}\n${'━'.repeat(78)}`)

const ts = (v) => {
  if (v === undefined) return '(필드없음)'
  if (v === null) return 'null'
  if (typeof v?.toDate === 'function') return v.toDate().toISOString()
  return `${JSON.stringify(v)}:${typeof v}`
}
const typed = (v) => (v === undefined ? '(필드없음)' : v === null ? 'null' : `${JSON.stringify(v)}:${typeof v}`)

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
log(`project = ${key.project_id}`)

/* ── 1. departments ───────────────────────────────────────────────────── */

rule('1. departments/' + DEPARTMENT_ID)
const deptSnap = await db.collection('departments').doc(DEPARTMENT_ID).get()
if (!deptSnap.exists) {
  log('🔴 부서 문서가 없다.')
  process.exit(1)
}
const dept = deptSnap.data()
const activeCodeId = dept.activeInviteCodeId ?? null
for (const k of ['academicYear', 'headUid', 'activeInviteCodeId', 'memberCount', 'classCountByGrade', 'maxNumberPerClass']) {
  log(`  ${k.padEnd(20)} ${typed(dept[k])}`)
}

/* 🔴 `classCountByGrade`의 키는 **문자열**이어야 한다(W-09 §7-3 · W-12 §6). */
const ccg = dept.classCountByGrade ?? {}
const badKeys = Object.keys(ccg).filter((k) => typeof k !== 'string' || !/^[1-3]$/.test(k))
log(`  classCountByGrade 키: ${Object.keys(ccg).join(', ') || '(없음)'} ${badKeys.length ? `🔴 이상 ${badKeys.join(',')}` : '✅'}`)

/* ── 2. inviteCodes ───────────────────────────────────────────────────── */

rule('2. departments/' + DEPARTMENT_ID + '/inviteCodes')
const codesSnap = await db.collection('departments').doc(DEPARTMENT_ID).collection('inviteCodes').get()
log(`  문서 ${codesSnap.size}건 · departments.activeInviteCodeId = ${activeCodeId}\n`)

const activeCodes = []
codesSnap.docs
  .slice()
  .sort((a, b) => {
    const at = a.data().issuedAt?.toMillis?.() ?? 0
    const bt = b.data().issuedAt?.toMillis?.() ?? 0
    return at - bt
  })
  .forEach((d) => {
    const v = d.data()
    const isActive = v.isActive === true
    if (isActive) activeCodes.push(d.id)
    const pointed = d.id === activeCodeId
    log(`  ┌ ${d.id}   ${isActive ? 'isActive:true' : 'isActive:false'}  ${pointed ? '← activeInviteCodeId' : ''}`)
    CODE_FIELDS.forEach((f) => log(`  │   ${f.padEnd(12)} ${ts(v[f])}`))
    const missing = CODE_FIELDS.filter((f) => f !== 'revokedAt' && v[f] === undefined)
    log(`  └   누락 필드: ${missing.length ? '🔴 ' + missing.join(', ') : '없음 ✅'}`)
    if (isActive && !pointed) {
      log(`      🔴 **고아 활성 코드** — 부서 문서가 가리키지 않는데 살아 있다.`)
      log(`         lookupInviteCode(src/lib/signup.ts)는 isActive·expiresAt·useCount만 본다 —`)
      log(`         activeInviteCodeId를 대조하지 않으므로 이 코드로도 가입 신청이 통과한다.`)
    }
  })

log(`\n  isActive:true 총 ${activeCodes.length}건 → ${activeCodes.join(', ')}`)
if (activeCodes.length > 1) log('  🔴 BR-17이 상정하는 상태가 아니다(활성 코드는 1건이어야 한다).')

/* ── 3. dutySchedules ─────────────────────────────────────────────────── */

rule('3. dutySchedules — 필드 집합이 database_ToDo/W-14.md §1 · PRD §9.3.6과 맞는가')
const dutySnap = await db.collection('dutySchedules').get()
log(`  문서 ${dutySnap.size}건\n`)

dutySnap.docs
  .slice()
  .sort((a, b) => a.id.localeCompare(b.id))
  .forEach((d) => {
    const v = d.data()
    log(`  ┌ ${d.id}`)
    DUTY_FIELDS.forEach((f) => {
      if (f === 'assignments' || f === 'assigneeNames') return
      log(`  │   ${f.padEnd(13)} ${ts(v[f])}`)
    })

    for (const mapField of ['assignments', 'assigneeNames']) {
      const m = v[mapField]
      if (m === undefined) { log(`  │   ${mapField.padEnd(13)} 🔴 필드없음`); continue }
      if (typeof m !== 'object' || Array.isArray(m)) { log(`  │   ${mapField.padEnd(13)} 🔴 map이 아니다`); continue }
      const keys = Object.keys(m)
      const missingDays = DUTY_DAY_KEYS.filter((k) => !(k in m))
      const extraDays = keys.filter((k) => !DUTY_DAY_KEYS.includes(k))
      const notArray = keys.filter((k) => !Array.isArray(m[k]))
      log(
        `  │   ${mapField.padEnd(13)} 키 ${keys.length}개 [${keys.join(',')}]` +
          `${missingDays.length ? ` 🔴 누락 ${missingDays.join(',')}` : ''}` +
          `${extraDays.length ? ` 🔴 여분 ${extraDays.join(',')}` : ''}` +
          `${notArray.length ? ` 🔴 array 아님 ${notArray.join(',')}` : ''}` +
          `${!missingDays.length && !extraDays.length && !notArray.length ? ' ✅' : ''}`,
      )
      /* 값은 uid·이름이라 개수만 낸다(§14.1 PR-02). */
      log(`  │     각 요일 원소 수: ${DUTY_DAY_KEYS.map((k) => `${k}:${Array.isArray(m[k]) ? m[k].length : '-'}`).join(' ')}`)
    }

    const missing = DUTY_FIELDS.filter((f) => v[f] === undefined)
    const extra = Object.keys(v).filter((f) => !DUTY_FIELDS.includes(f))
    log(`  └   누락 ${missing.length ? '🔴 ' + missing.join(', ') : '없음 ✅'} · 여분 ${extra.length ? '⚠ ' + extra.join(', ') : '없음 ✅'}`)
  })

/* ── 4. auditLogs ─────────────────────────────────────────────────────── */

rule('4. auditLogs — 위 상태가 어떻게 생겼는지의 근거')
const logsSnap = await db.collection('auditLogs').get()
log(`  문서 ${logsSnap.size}건\n`)
logsSnap.docs
  .slice()
  .sort((a, b) => (a.data().createdAt?.toMillis?.() ?? 0) - (b.data().createdAt?.toMillis?.() ?? 0))
  .forEach((d) => {
    const v = d.data()
    log(
      `  ${ts(v.createdAt).padEnd(26)} ${String(v.action ?? '?').padEnd(15)} ` +
        `${String(v.targetType ?? '?')}/${String(v.targetId ?? '?')}  by ${String(v.actorRole ?? '?')}`,
    )
  })

/* ── 5. users / students / records 건수 ───────────────────────────────── */

rule('5. 건수')
for (const name of ['users', 'students', 'records', 'approvalRequests']) {
  const c = await db.collection(name).count().get()
  log(`  ${name.padEnd(18)} ${c.data().count}건`)
}

/* 🔴 records가 참조하는 studentDocId — 학생 문서를 지워도 되는지의 판단 근거다. */
const recSnap = await db.collection('records').get()
if (!recSnap.empty) {
  const refs = [...new Set(recSnap.docs.map((d) => d.data().studentDocId).filter(Boolean))]
  log(`\n  records가 참조하는 studentDocId ${refs.length}종: ${refs.join(', ')}`)
}

log('\n읽기 전용 — 쓰기 0건.\n')
process.exit(0)
