/**
 * W-16 규칙 테스트 하네스 — `@firebase/rules-unit-testing` + Firestore 에뮬레이터.
 *
 * 🔴 **실 Firestore에 한 바이트도 보내지 않는다.** `projectId`는 더미(`demo-` 접두사)이고
 * 접속 대상은 `FIRESTORE_EMULATOR_HOST`(로컬)다. `sundo-dev-8ef38`을 쓰지 마라.
 *
 * 🔴 **픽스처는 `withSecurityRulesDisabled`로 심는다.** 규칙을 통과시켜 심으면
 * 테스트가 검증 대상에 의존하게 되고, 규칙이 넓어졌을 때 픽스처가 함께 통과해
 * 결함을 가린다.
 */
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'

/** 🔴 `demo-` 접두사는 에뮬레이터가 「실 프로젝트가 아니다」로 인식하는 관례다. */
export const PROJECT_ID = 'demo-sundo-rules'
export const DEPT = 'dshs-jayul'
export const YEAR = 2026

let env = null

export async function startEnv() {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'
  const [h, p] = host.split(':')
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: h, port: Number(p) },
  })
  return env
}
export function testEnv() {
  return env
}
export async function stopEnv() {
  if (env) await env.cleanup()
  env = null
}

/* --- 역할 픽스처 -------------------------------------------------------- */

/** §9.3.1 최소 필드. 규칙이 보는 것은 `status`·`role`·`departmentId`뿐이다. */
function user(uid, role, status, extra = {}) {
  return {
    uid,
    email: `${uid}@dshs.kr`,
    name: uid,
    nameSource: 'parsed',
    displayNameRaw: `26_20101${uid}`,
    role,
    status,
    departmentId: DEPT,
    notificationPrefs: { duty: true, approval: true },
    recordCount: 0,
    ...extra,
  }
}

export const UIDS = {
  member: 'uid-member',
  vice: 'uid-vice',
  head: 'uid-head',
  teacher: 'uid-teacher',
  dev: 'uid-dev',
  pending: 'uid-pending',
  withdrawn: 'uid-withdrawn',
  noprofile: 'uid-noprofile',
}

/** 🔴 매 테스트 전에 부른다. 규칙을 끄고 심어야 테스트가 규칙에 의존하지 않는다. */
export async function seed(overrides = {}) {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    const put = (path, data) => setDoc(doc(db, path), data)
    await Promise.all([
      put(`users/${UIDS.member}`, user(UIDS.member, 'member', 'active')),
      put(`users/${UIDS.vice}`, user(UIDS.vice, 'vice', 'active')),
      put(`users/${UIDS.head}`, user(UIDS.head, 'head', 'active')),
      put(`users/${UIDS.teacher}`, user(UIDS.teacher, 'teacher', 'active')),
      put(`users/${UIDS.dev}`, user(UIDS.dev, 'dev', 'active')),
      put(`users/${UIDS.pending}`, user(UIDS.pending, 'member', 'pending', { inviteCodeId: 'DJSN-2691' })),
      put(`users/${UIDS.withdrawn}`, user(UIDS.withdrawn, 'member', 'withdrawn')),
      put(`departments/${DEPT}`, {
        headUid: UIDS.head,
        activeInviteCodeId: 'DJSN-2691',
        academicYear: YEAR,
        classCountByGrade: { 1: 8, 2: 8, 3: 8 },
        maxNumberPerClass: 30,
      }),
      put(`departments/${DEPT}/inviteCodes/DJSN-2691`, {
        code: 'DJSN-2691',
        issuedBy: UIDS.head,
        isActive: true,
        revokedAt: null,
        useCount: 3,
        maxUses: 30,
      }),
      put('approvalRequests/req-1', {
        uid: UIDS.pending,
        email: `${UIDS.pending}@dshs.kr`,
        name: '신청자1',
        inviteCodeId: 'DJSN-2691',
        status: 'pending',
      }),
      put('students/2026_20303', {
        academicYear: YEAR,
        grade: 2,
        classNo: 3,
        number: 3,
        name: '학생3',
        studentNo: '20303',
        isActive: true,
      }),
      /* 🔴 **W-21C — 실 문서와 같은 형태로 맞췄다.** 옛 픽스처(`{mon:{},…}`)는 §9.3.6
         어느 쪽과도 맞지 않았고, **픽스처가 스키마보다 좁으면 결함이 코드로 오해된다**
         (W-15B §6 ④). 🔬 실 Firestore 실측값(`2026-W35`)을 그대로 옮기고
         마이그레이션 산출물 4필드를 더했다. */
      put('dutySchedules/2026-W35', {
        weekId: '2026-W35',
        startDate: '2026-08-24',
        endDate: '2026-08-28',
        assignments: { mon: [UIDS.head], tue: [UIDS.head], wed: [UIDS.head], thu: [UIDS.head], fri: [UIDS.head] },
        assigneeNames: { mon: ['유이준'], tue: ['유이준'], wed: ['유이준'], thu: ['유이준'], fri: ['유이준'] },
        patrolTime: '07:50',
        patrolPlace: '중앙 현관',
        assignmentsByMeal: { mon: { lunch: [UIDS.head], dinner: [] } },
        assigneeNamesByMeal: { mon: { lunch: ['유이준'], dinner: [] } },
        patrolTimeByMeal: { lunch: '07:50', dinner: null },
        patrolPlaceByMeal: { lunch: '중앙 현관', dinner: null },
        createdBy: UIDS.head,
        updatedBy: UIDS.head,
        updatedAt: new Date(),
      }),
      put('records/rec-seed', recordPayload({ createdBy: UIDS.member })),
      put('auditLogs/log-seed', {
        actorUid: UIDS.head,
        actorName: '부장1',
        actorRole: 'head',
        action: 'USER_APPROVE',
        targetType: 'users',
        targetId: UIDS.pending,
        before: null,
        after: null,
      }),
      put('meta/appConfig', { minVersion: '1.0.0' }),
      ...Object.entries(overrides).map(([path, data]) => put(path, data)),
    ])
  })
}

/** 규칙을 끈 채로 문서를 하나 덮어쓴다(케이스별 사전 조건용). */
export async function put(path, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data)
  })
}
/** 규칙을 끈 채로 읽는다(쓰기 결과 확인용). */
export async function raw(path) {
  let out = null
  await env.withSecurityRulesDisabled(async (ctx) => {
    const s = await getDoc(doc(ctx.firestore(), path))
    out = s.exists() ? s.data() : null
  })
  return out
}

/* --- 컨텍스트 ----------------------------------------------------------- */

/** `@dshs.kr` 학교 계정. 🔴 `email_verified`를 넣지 않는다 — 규칙이 보지 않는다. */
export function as(uid) {
  return env.authenticatedContext(uid, { email: `${uid}@dshs.kr` }).firestore()
}
/** 임의 이메일로 인증된 컨텍스트(도메인 방어 테스트용). */
export function asEmail(uid, email) {
  return env.authenticatedContext(uid, { email }).firestore()
}
export function anon() {
  return env.unauthenticatedContext().firestore()
}

/* --- `records` 페이로드 — 🔴 `buildRecordPayload`(src/lib/records.ts)와 같은 필드 집합 --- */

export function recordPayload(over = {}) {
  return {
    studentDocId: '2026_20303',
    studentNo: '20303',
    studentName: '학생3',
    grade: 2,
    classNo: 3,
    reasonCode: 'DRESS',
    reasonText: null,
    occurredAt: new Date(),
    dateKey: '2026-08-23',
    weekKey: '2026-W34',
    monthKey: '2026-08',
    academicYear: YEAR,
    createdBy: UIDS.member,
    createdByName: 'uid-member',
    createdAt: new Date(),
    status: 'active',
    source: 'app',
    ...over,
  }
}

/* --- 초소형 러너 -------------------------------------------------------- */

const results = []
let group = '(ungrouped)'

export function describe(name) {
  group = name
}

/**
 * `id`는 재검증 목록의 식별자(`R-1`·`T-2`…)다. `expect`는 `'pass'` 또는 `'deny'`.
 * 🔴 **기대를 문자열로 받는 이유** — 「통과만 확인하면 조건을 안 쓴 규칙도 통과한다」를
 * 막으려면 거부 기대가 목록에 명시적으로 남아야 한다(§6 함정 1 · DoD 10).
 */
export async function check(id, expect, title, fn) {
  const promise = fn()
  try {
    if (expect === 'pass') await assertSucceeds(promise)
    else await assertFails(promise)
    results.push({ id, expect, title, group, ok: true })
  } catch (e) {
    results.push({ id, expect, title, group, ok: false, err: String(e).slice(0, 200) })
  }
}

export function report() {
  const fail = results.filter((r) => !r.ok)
  const pad = (s, n) => String(s).padEnd(n)
  let cur = null
  for (const r of results) {
    if (r.group !== cur) {
      cur = r.group
      console.log(`\n── ${cur}`)
    }
    console.log(
      `${r.ok ? ' OK ' : 'FAIL'}  ${pad(r.id, 8)} ${pad(r.expect === 'pass' ? '통과기대' : '거부기대', 10)} ${r.title}` +
        (r.ok ? '' : `\n        ${r.err}`),
    )
  }
  const passCases = results.filter((r) => r.expect === 'pass').length
  console.log(
    `\n총 ${results.length}건 — 성공 ${results.length - fail.length} / 실패 ${fail.length}` +
      `  (통과기대 ${passCases} · 거부기대 ${results.length - passCases})`,
  )
  return fail.length
}

export { assertFails, assertSucceeds }
