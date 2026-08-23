/**
 * 🔴 **거부 케이스 역검증용 규칙 변형** (DoD 10 · §6 함정 1).
 *
 * 「통과」만 확인하면 **조건을 아예 쓰지 않은 규칙도 통과한다.** 그래서 조건을 하나씩
 * 일부러 열고 돌려, 그 조건을 지키던 테스트가 실제로 빨개지는지 본다.
 * 빨개지지 않으면 그 조건은 아무 일도 하고 있지 않다는 뜻이다.
 *
 * 사용: `npm run rules:mutate -- <name>` (또는 `RULES_MUTATE=<name> node tests/rules/run.mjs`)
 * 실행 후 규칙 파일은 **자동으로 원복**된다.
 */
export const MUTATIONS = [
  {
    /* 🔴 **이 변형만 「아무것도 빨개지지 않는 것」이 정답이다** — W-16 Q-5 실측.
       Rules의 `matches()`는 문자열 **전체 일치**라 `$`를 빼도
       `attacker@dshs.kr.evil.com`은 그대로 거부된다. `$`를 「이것이 막고 있다」로
       읽으면 틀린다. 실제로 뚫리는 형태는 바로 아래 `domain-suffix-open`이다.
       🔴 `breaks`가 비어 있으면 러너는 **전량 통과**를 기대한다(run.mjs). */
    name: 'no-dollar-anchor',
    why: '도메인 정규식 끝의 `$`를 뺀다 — 🔬 실측상 **아무것도 깨지지 않는다**',
    from: "matches('.*@dshs[.]kr$')",
    to: "matches('.*@dshs[.]kr')",
    breaks: [],
  },
  {
    /* 🔴 도메인 방어의 급소는 `$`의 유무가 아니라 **뒤에 무엇이 붙는가**다. */
    name: 'domain-suffix-open',
    why: '🔴 정규식 끝에 `.*`를 붙인다 — `attacker@dshs.kr.evil.com`이 통과한다 (§14.5 4-3)',
    from: "matches('.*@dshs[.]kr$')",
    to: "matches('.*@dshs[.]kr.*')",
    breaks: ['SEC-4a'],
  },
  {
    name: 'self-role-free',
    why: 'BR-21의 `request.auth.uid != uid`를 뺀다 — 부장이 자기 역할을 마음대로 바꾼다',
    from: 'allow update: if (request.auth.uid != uid && isHead())',
    to: 'allow update: if (isHead())',
    /* 🔬 SEC-9a가 함께 빨개진다 — `isHead()`를 본인에게도 열면 부장이 자기 문서를
       마음대로 고칠 수 있어 `selfWithdraw`의 부장 차단(BR-56)까지 우회된다. */
    breaks: ['T-7', 'T-7c', 'SEC-9a', 'B-9'],
  },
  {
    name: 'demote-any-role',
    why: '자기 강등의 목적지 제한(`member`)을 뺀다 — 아무 역할로나 자기 강등',
    from: "&& request.resource.data.role == 'member'\n        && request.resource.data.diff(resource.data).affectedKeys()\n             .hasOnly(['role', 'updatedAt']);",
    to: "&& request.resource.data.diff(resource.data).affectedKeys()\n             .hasOnly(['role', 'updatedAt']);",
    breaks: ['T-7'],
  },
  {
    name: 'invitecodes-read-merged',
    why: '🔴 `get`/`list`를 `allow read`로 뭉친다 — 유효 코드 전체가 유출된다 (W-08 §2-1)',
    from: 'allow get: if isSignedIn();\n\n        // BR-16 발급 이력 조회(레이트 리밋)가 쓰는 유일한 목록 질의다.\n        allow list: if isHead();',
    to: 'allow read: if isSignedIn();',
    breaks: ['C-4b', 'C-4c', 'C-4d'],
  },
  {
    name: 'invitecodes-code-free',
    why: '`data.code == codeId` 강제를 뺀다 (W-08 §2-1)',
    from: 'allow create: if isHead() && request.resource.data.code == codeId;',
    to: 'allow create: if isHead();',
    breaks: ['C-2'],
  },
  {
    name: 'records-createdby-free',
    why: '`createdBy == auth.uid`를 뺀다 (§9.6 필수 조건 4 · §14.5 5번)',
    from: '&& request.resource.data.createdBy == request.auth.uid\n        && request.resource.data.status == \'active\'',
    to: "&& request.resource.data.status == 'active'",
    breaks: ['R-2', 'R-15'],
  },
  {
    name: 'records-reason-free',
    why: '`validReason()`을 뺀다 (§9.6 필수 조건 5 · §14.5 7·8번)',
    from: '&& validReason(request.resource.data);',
    to: '&& true;',
    breaks: ['R-5', 'R-6', 'R-7', 'R-8', 'R-9', 'B-13'],
  },
  {
    name: 'records-time-free',
    why: '`occurredAt <= request.time + 5분`을 뺀다 (BR-39)',
    from: "&& request.resource.data.occurredAt <= request.time + duration.value(5, 'm')",
    to: '&& true',
    breaks: ['R-4'],
  },
  {
    name: 'auditlogs-mutable',
    why: '🔴 감사 로그 수정·삭제 금지를 연다 (§14.5 3번)',
    from: 'allow update: if false;\n      allow delete: if false;\n    }\n\n    // ========================================================================\n    //  meta',
    to: 'allow update: if isHead();\n      allow delete: if isHead();\n    }\n\n    // ========================================================================\n    //  meta',
    breaks: ['L-3a', 'L-3b', 'L-3c'],
  },
  {
    name: 'auditlogs-actor-free',
    why: '`actorUid == auth.uid`를 뺀다 (§9.6 필수 조건 6)',
    from: 'allow create: if isSignedIn() && request.resource.data.actorUid == request.auth.uid;',
    to: 'allow create: if isSignedIn();',
    breaks: ['L-2'],
  },
  {
    name: 'users-list-open',
    why: '`users` list를 인증만으로 연다 — `pending`·탈퇴 계정이 부서 명단을 읽는다',
    from: 'allow list: if isActive();\n\n      allow create: if isSignedIn()',
    to: 'allow list: if isSignedIn();\n\n      allow create: if isSignedIn()',
    breaks: ['M-2', 'M-4'],
  },
  {
    name: 'users-create-role-free',
    why: '가입 시 `role == member` 강제를 뺀다 — 스스로 부장이 될 수 있다',
    from: "&& request.resource.data.role == 'member'\n        && request.resource.data.status == 'pending'",
    to: "&& request.resource.data.status == 'pending'",
    breaks: ['UC-2'],
  },
  {
    name: 'selfwithdraw-head-allowed',
    why: '🔴 부장 탈퇴 차단을 뺀다 (BR-56 · R-07 · §14.5 9번)',
    from: "&& resource.data.role != 'head'",
    to: '&& true',
    breaks: ['SEC-9a'],
  },
  {
    name: 'recordcount-plus-any',
    why: '`recordCount`의 「+1만」 조건을 뺀다 (결정 R-a)',
    from: "&& (!request.resource.data.diff(resource.data).affectedKeys().hasAny(['recordCount'])\n            || request.resource.data.recordCount == resource.data.recordCount + 1);",
    to: ';',
    breaks: ['RC-2', 'RC-3', 'RC-6', 'B-12'],
  },
  {
    name: 'students-write-merged',
    why: '🔴 부록 B처럼 `allow write`로 뭉친다 — 명부 **삭제**가 열린다',
    from: 'allow create: if isHead();\n      allow update: if isHead();\n      allow delete: if false;\n    }\n\n    // ========================================================================\n    //  dutySchedules',
    to: 'allow write: if isHead();\n    }\n\n    // ========================================================================\n    //  dutySchedules',
    breaks: ['ST-4'],
  },
  {
    name: 'approvals-list-open',
    why: '`approvalRequests` list를 active 전원에게 연다 (A-2)',
    from: 'allow list: if isVice() || isTeacher();',
    to: 'allow list: if isActive();',
    breaks: ['A-2'],
  },
  {
    name: 'reapply-anonymized-ok',
    why: '익명화 계정의 재활성 차단을 뺀다 (BR-63)',
    from: "&& request.resource.data.get('anonymizedAt', null) == null",
    to: '&& true',
    breaks: ['RE-5'],
  },
]
