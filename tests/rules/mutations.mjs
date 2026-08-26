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
       마음대로 고칠 수 있어 `selfWithdraw`의 부장 차단(BR-56)까지 우회된다.
       🔴 **W-24 — 선언에 `B-15`가 빠져 있었다.** SEC-9a의 배치판(부장의 탈퇴 배치)이고
       같은 이유로 함께 빨개진다. 실측으로 채웠다(W-21C가 B-15를 더하면서 갱신하지 않았다). */
    breaks: ['T-7', 'T-7c', 'SEC-9a', 'B-9', 'B-15'],
  },
  {
    name: 'demote-any-role',
    why: '자기 강등의 목적지 제한(`member`)을 뺀다 — 아무 역할로나 자기 강등',
    from: "&& request.resource.data.role == 'member'\n        && request.resource.data.diff(resource.data).affectedKeys()\n             .hasOnly(['role', 'updatedAt']);",
    to: "&& request.resource.data.diff(resource.data).affectedKeys()\n             .hasOnly(['role', 'updatedAt']);",
    /* 🔴 **W-24 — 선언에 `B-9`가 빠져 있었다.** T-7의 배치판이고 같은 조건에서 함께 빨개진다. */
    breaks: ['T-7', 'B-9'],
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
    /* 🔴 **W-24 — 선언이 낡아 있었다.** `L-2` 하나만 적혀 있었지만 실제로는 **6건**이 빨개진다.
       W-21B가 `B-24`를, W-21C가 `B-34`를, W-15A가 `B-19`를 더하면서 이 목록을 갱신하지 않았다.
       🔬 이번 회차가 `B-42`·`B-43`을 더하면서 전량을 다시 재어 채웠다.
       ⚠ `B-43`은 **통과기대인데 빨개진다** — 그것이 이 변형의 가장 좋은 증거다.
       감사 로그 관문이 사라지면 배치가 통째로 성공해 **대상의 `role`이 실제로 바뀐다.** */
    breaks: ['L-2', 'B-19', 'B-24', 'B-34', 'B-42', 'B-43'],
  },
  {
    /* 🔴 **W-24 §B 신설.** 이번 회차는 규칙을 한 줄도 고치지 않았다 — BR-24가 정한 실행자
       (`head`·`dev`)가 이미 `isHead()`로 열려 있었기 때문이다. 그렇다면 **「차장을 막고 있는
       것이 정말 그 `isHead()`인가」**를 재야 한다. 그것이 이 변형이다.
       🔴 `isVice()`는 `['vice','head','dev']`라 이 변형은 **차장에게 남의 `role` 변경을 연다** —
       BR-24를 정면으로 위반하는 형태이고, 그때 무엇이 빨개지는지가 조건이 일한다는 증거다. */
    name: 'users-update-vice',
    why: '🔴 W-24 — `users` update의 `isHead()`를 `isVice()`로 넓힌다 (BR-24 위반 — 차장이 남의 역할을 바꾼다)',
    from: 'allow update: if (request.auth.uid != uid && isHead())',
    to: 'allow update: if (request.auth.uid != uid && isVice())',
    /* 🔬 **선언을 한 번 틀렸고 실측이 고쳤다.** 처음에는 `T-4`·`T-11`·`B-40`(= `role` 관련)만
       적었는데 `U-2`(차장이 남의 `status`를 바꾼다)와 `B-30`(차장이 남의 `recordCount`를 −1)도
       함께 빨개졌다. 🔴 **이 절은 `role`만이 아니라 그 문서의 「모든 필드」를 가른다** —
       `users` update의 `isHead()` 분기에는 필드 제한이 **없기 때문**이다(§1-9 실측).
       ⚠ `B-7`(차장의 양도 4연산)은 **빨개지지 않는다** — `departments` update가 따로
       `isHead()`를 요구해 그쪽에서 여전히 걸린다. 관문이 둘이라는 증거다. */
    breaks: ['U-2', 'T-4', 'T-11', 'B-30', 'B-40'],
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
    /* W-17 — S10이 첫 소비자가 되면서 배치 케이스 B-15가 같은 조건에 걸린다.
       조건 하나에 개별 연산과 배치가 **둘 다** 매달려 있어야 그 조건이 일한다. */
    breaks: ['SEC-9a', 'B-15'],
  },
  {
    /* 🔴 W-17 — `selfWithdraw()`의 허용 키 3개가 이 회차에 **처음으로 소비된다**
       (`src/lib/account.ts`). 조건만 있고 변형이 없으면 그것이 일하는지 아무도 모른다
       (`reports/W-16.md` §8-5). SEC-9c는 `role`을, B-16은 `recordCount`를 얹는다 —
       후자가 C7(「탈퇴해도 기록은 보존된다」)의 급소다. */
    name: 'selfwithdraw-keys-open',
    why: '🔴 탈퇴 허용 키 3개 제한을 뺀다 — 탈퇴하면서 아무 필드나 함께 쓴다 (§9.6 필수 조건 7)',
    from:
      "&& request.resource.data.diff(resource.data).affectedKeys()\n" +
      "             .hasOnly(['status', 'withdrawnAt', 'updatedAt']);",
    to: ';',
    breaks: ['SEC-9c', 'B-16'],
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
    from: 'allow list: if isVice() || isTeacher()\n        || (isSignedIn() && resource.data.uid == request.auth.uid);',
    to: 'allow list: if isActive();',
    breaks: ['A-2', 'A-10', 'A-13', 'A-14'],
  },
  {
    name: 'approvals-list-no-self',
    why: '🔴 W-22B가 더한 「본인」 절을 뺀다 — BR-30 카운터가 죽는지 본다',
    from: 'allow list: if isVice() || isTeacher()\n        || (isSignedIn() && resource.data.uid == request.auth.uid);',
    to: 'allow list: if isVice() || isTeacher();',
    breaks: ['A-10', 'A-13', 'A-14'],
  },
  {
    name: 'approvals-list-self-no-uid-check',
    why: '🔴 「본인」 절에서 uid 대조를 뺀다 — 남의 신청을 세는 경로가 열리는지 본다',
    from: 'allow list: if isVice() || isTeacher()\n        || (isSignedIn() && resource.data.uid == request.auth.uid);',
    to: 'allow list: if isVice() || isTeacher() || isSignedIn();',
    breaks: ['A-2', 'A-11', 'A-12'],
  },
  {
    name: 'reapply-no-agreement-keys',
    why: '🔴 W-19가 넓힌 동의 2키를 되돌린다 — 재신청 배치가 통째로 죽는지 본다',
    from: "                       'name', 'nameSource', 'displayNameRaw', 'updatedAt',\n                       'agreedAt', 'agreedPolicyVersion']);",
    to: "                       'name', 'nameSource', 'displayNameRaw', 'updatedAt']);",
    breaks: ['RE-0', 'RE-0b', 'RE-7'],
  },
  {
    name: 'reapply-anonymized-ok',
    why: '익명화 계정의 재활성 차단을 뺀다 (BR-63)',
    from: "&& request.resource.data.get('anonymizedAt', null) == null",
    to: '&& true',
    breaks: ['RE-5'],
  },

  /* ==========================================================================
     🔴 W-21B 신규 조건 역검증 — 기능 9(기록 수정·삭제) · 기능 12(코드 발급 권한)

     이 회차가 규칙에 더한 **모든 조건**에 변형이 하나씩 있다(§4-3).
     조건만 늘고 변형이 없으면 그 조건이 일하는지 아무도 모른다.
     ========================================================================*/

  /* --- 기능 9 · 권한 판정(`canEditRecord`) ------------------------------ */
  {
    name: 'record-owner-closed',
    why: '🔴 결정 4가 연 **작성자 본인** 절을 되돌린다 — PRD BR-05 원문 상태로 좁힌다',
    from: '        && (resource.data.createdBy == request.auth.uid || isVice());',
    to: '        && isVice();',
    breaks: ['RU-2', 'RX-1', 'B-21', 'B-26'],
  },
  {
    name: 'record-edit-any-active',
    why: '🔴 권한 판정을 `isActive()`로 넓힌다 — 남의 기록을 아무나 고치고 지운다',
    from: '        && (resource.data.createdBy == request.auth.uid || isVice());',
    to: '        && true;',
    breaks: ['RU-5', 'RU-6', 'RX-5', 'RX-6', 'B-23', 'B-28', 'B-29'],
  },

  /* --- 기능 9 · 사유 변경(`editsReasonOnly`) ---------------------------- */
  {
    name: 'reason-keys-open',
    why: '🔴 BR-07의 허용 키를 넓힌다 — 학생·일시·작성자·상태가 함께 바뀐다',
    from: "               .hasOnly(['reasonCode', 'reasonText', 'updatedBy', 'updatedAt'])",
    to: "               .hasOnly(['reasonCode', 'reasonText', 'updatedBy', 'updatedAt',\n                         'createdBy', 'occurredAt', 'studentDocId', 'studentName', 'status'])",
    breaks: ['RU-8', 'RU-9', 'RU-10', 'RU-11'],
  },
  {
    name: 'reason-updatedby-free',
    why: '정정한 사람(`updatedBy`)이 본인이어야 한다는 조건을 뺀다',
    from: '        && request.resource.data.updatedBy == request.auth.uid;',
    to: '        && true;',
    breaks: ['RU-12'],
  },
  {
    name: 'reason-on-deleted',
    why: '🔴 「지금 active인가」를 뺀다 — 이미 삭제된 기록의 사유가 고쳐진다',
    from: "        && validReason(request.resource.data)\n        // 🔴 이미 삭제된 기록의 사유는 고칠 수 없다(RU-19). `status`가 허용 키에 없으므로\n        //    이 조건은 「지금 active인가」만 본다 — 전이를 여는 것이 아니다.\n        && resource.data.status == 'active'",
    to: '        && validReason(request.resource.data)',
    breaks: ['RU-19'],
  },
  {
    name: 'reason-validation-off',
    why: '🔴 사유 변경에서 `validReason()`을 뺀다 — create와 update의 문장이 갈린다(BR-07a)',
    from: "        && validReason(request.resource.data)\n        // 🔴 이미 삭제된 기록의 사유는 고칠 수 없다(RU-19).",
    to: "        && true\n        // 🔴 이미 삭제된 기록의 사유는 고칠 수 없다(RU-19).",
    breaks: ['RU-15', 'RU-16', 'RU-17', 'RU-18', 'B-25'],
  },

  /* --- 기능 9 · 소프트 삭제(`softDeletesRecord`) ------------------------ */
  {
    name: 'delete-keys-open',
    why: '🔴 삭제 허용 키에 사유를 더한다 — 지우면서 사유를 몰래 바꾼다',
    from: "               .hasOnly(['status', 'deletedBy', 'deletedAt'])",
    to: "               .hasOnly(['status', 'deletedBy', 'deletedAt', 'reasonCode', 'reasonText'])",
    breaks: ['RX-8'],
  },
  {
    /**
     * 🔬 **실측이 예상을 뒤집었다.** 처음에 이 변형의 기대를 `RX-10`(되돌리기)으로 적었는데
     * **아무것도 빨개지지 않았다.** RX-10을 막고 있는 것은 출발지 조건이 아니라
     * **목적지 조건**(`request.resource.data.status == 'deleted'`)이었다 — `status: 'active'`로
     * 쓰는 요청은 그쪽에서 먼저 걸린다.
     *
     * 🔴 그래서 이 조건이 **실제로** 막는 것을 다시 찾아 RX-11로 잠갔다:
     *    **이미 삭제된 기록의 `deletedBy`를 다른 사람 것으로 덮어쓰는** 경로다.
     *    `status`가 안 바뀌면 `affectedKeys()`에 들어가지 않아(B-20의 성질) 나머지 조건이
     *    전부 통과하는데, 출발지 조건만이 그것을 세운다.
     * ⇒ 「무엇을 막는 조건인가」를 변형이 고쳐 준 사례다(W-16 Q-5와 같은 종류).
     */
    name: 'delete-source-active-off',
    why: '🔴 출발지 조건(`resource.data.status == active`)을 뺀다 — 삭제자 기록이 덮어써진다',
    from: "               .hasOnly(['status', 'deletedBy', 'deletedAt'])\n        && resource.data.status == 'active'",
    to: "               .hasOnly(['status', 'deletedBy', 'deletedAt'])",
    breaks: ['RX-11'],
  },
  {
    /**
     * 🔬 **여기서도 실측이 예상을 고쳤다.** 「두 status 조건을 함께 빼면 되돌리기(RX-10)가
     * 열린다」로 적었는데 **RX-10은 그대로 초록이었다.**
     *
     * 🔴 **되돌리기를 막는 것은 세 조건의 합이고, 세 번째가 `deletedBy == auth.uid`다.**
     *    되돌리는 요청은 `deletedBy`를 `null`로 비우는데(그것이 되돌리기의 정의다)
     *    `null == request.auth.uid`가 거짓이라 거기서 선다.
     * ⇒ **어느 하나만 벗겨도 RX-10은 열리지 않는다.** 세 조건이 각자 다른 것을 막고
     *   (RX-9 · RX-11 · RX-7), 되돌리기는 그 셋이 겹치는 자리에서 막힌다.
     */
    name: 'delete-status-guards-off',
    why: '🔴 출발지·목적지 조건을 **둘 다** 뺀다 — 🔬 그래도 되돌리기(RX-10)는 안 열린다',
    from: "        && resource.data.status == 'active'\n        && request.resource.data.status == 'deleted'\n        && request.resource.data.deletedBy == request.auth.uid;",
    to: '        && request.resource.data.deletedBy == request.auth.uid;',
    breaks: ['RX-9', 'RX-11'],
  },
  {
    name: 'delete-any-status',
    why: "목적지가 `deleted`여야 한다는 조건을 뺀다 — `status`에 임의 값이 들어간다",
    from: "        && request.resource.data.status == 'deleted'\n        && request.resource.data.deletedBy == request.auth.uid;",
    to: '        && request.resource.data.deletedBy == request.auth.uid;',
    breaks: ['RX-9'],
  },
  {
    name: 'delete-deletedby-free',
    why: '지운 사람(`deletedBy`)이 본인이어야 한다는 조건을 뺀다',
    from: "        && request.resource.data.status == 'deleted'\n        && request.resource.data.deletedBy == request.auth.uid;",
    to: "        && request.resource.data.status == 'deleted';",
    breaks: ['RX-7'],
  },

  /* --- 기능 12 · 코드 발급 권한 ----------------------------------------- */
  {
    name: 'invitecodes-head-issue',
    why: '🔴 결정 5를 되돌린다 — 부장이 다시 코드를 **발급**한다',
    from: 'allow create: if isDev() && request.resource.data.code == codeId;',
    to: 'allow create: if isHead() && request.resource.data.code == codeId;',
    breaks: ['C-1'],
  },
  {
    name: 'invitecodes-head-update-wide',
    why: "🔴 `useCount`만 열어 둔 부장 절에서 `hasOnly`를 뺀다 — 승인 문으로 **만료 처리**가 들어온다",
    from: "              || (isHead()\n                  && request.resource.data.diff(resource.data).affectedKeys()\n                       .hasOnly(['useCount'])));",
    to: '              || isHead());',
    breaks: ['C-3', 'C-10', 'B-3'],
  },

  /* --- 기능 12 · `departments` 필드 분리 -------------------------------- */
  {
    /* 🔴 **역할 절만** 넓힌다 — 키 목록은 그대로다. 그래서 P-6·P-7(두 필드 동시)은
       여전히 막히고 **P-5 하나만** 빨개진다. 「무엇이 무엇을 막고 있나」가 여기서 갈린다. */
    name: 'departments-issue-to-head',
    why: '🔴 재발급 필드(`activeInviteCodeId`)의 역할을 `isDev()` → `isHead()`로 되돌린다',
    from: "           (isDev()\n            && request.resource.data.diff(resource.data).affectedKeys()\n                 .hasOnly(['activeInviteCodeId', 'updatedAt']))",
    to: "           (isHead()\n            && request.resource.data.diff(resource.data).affectedKeys()\n                 .hasOnly(['activeInviteCodeId', 'updatedAt']))",
    breaks: ['P-5'],
  },
  {
    /* 🔴 W-16D 이전 상태로 통째로 되돌린다 — 필드 분리가 **전부** 사라진다. */
    name: 'departments-field-split-off',
    why: '🔴 필드 분리를 되돌려 `isHead()` 하나로 뭉친다 — 결정 5의 통제가 통째로 사라진다',
    from: "      allow update: if\n           (isDev()\n            && request.resource.data.diff(resource.data).affectedKeys()\n                 .hasOnly(['activeInviteCodeId', 'updatedAt']))\n        || (isHead()\n            && request.resource.data.diff(resource.data).affectedKeys()\n                 .hasOnly(['headUid', 'updatedAt']));",
    to: '      allow update: if isHead();',
    breaks: ['P-5', 'P-6', 'P-7', 'P-8'],
  },

  /* ==========================================================================
     🔴 W-21C 신규 조건 역검증 — 기능 3(순찰 일정 편성)

     🔴 **`breaks`를 먼저 적고 실측으로 고쳤다**(규약 4-3). 아래 주석의 🔬 표시가
        예측이 빗나가 고친 자리다.
     ========================================================================*/
  {
    name: 'duty-edit-vice',
    why: '🔴 결정 2를 되돌린다 — 차장이 다시 순찰 일정을 편성한다',
    from: 'allow update: if isHead() && editsDutyOnly();',
    to: 'allow update: if isVice() && editsDutyOnly();',
    breaks: ['D-3', 'B-33'],
  },
  {
    name: 'duty-create-vice',
    why: '🔴 새 주차 생성을 차장에게 연다 (§8.9.5 EM-06 경로)',
    from: '      allow create: if isHead()\n        && request.resource.data.weekId == weekId',
    to: '      allow create: if isVice()\n        && request.resource.data.weekId == weekId',
    breaks: ['D-12'],
  },
  {
    name: 'duty-keys-open',
    why: '🔴 편성 허용 키를 넓힌다 — 주차 키·기간·최초 편성자·**옛 필드**가 함께 바뀐다',
    from: "               .hasOnly(['assignmentsByMeal', 'assigneeNamesByMeal',\n                         'patrolTimeByMeal', 'patrolPlaceByMeal',\n                         'updatedBy', 'updatedAt'])",
    to: "               .hasOnly(['assignmentsByMeal', 'assigneeNamesByMeal',\n                         'patrolTimeByMeal', 'patrolPlaceByMeal',\n                         'updatedBy', 'updatedAt',\n                         'weekId', 'startDate', 'endDate', 'createdBy', 'patrolTime'])",
    breaks: ['D-6', 'D-7', 'D-8', 'D-10', 'B-35'],
  },
  {
    name: 'duty-updatedby-free',
    why: '편성자(`updatedBy`)가 본인이어야 한다는 조건을 뺀다',
    from: '        && request.resource.data.updatedBy == request.auth.uid;\n    }\n\n    // ========================================================================\n    //  users',
    to: '        && true;\n    }\n\n    // ========================================================================\n    //  users',
    breaks: ['D-9'],
  },
  {
    name: 'duty-create-weekid-free',
    why: '🔴 `weekId`가 문서 ID와 같아야 한다는 강제를 뺀다 — 화면이 주차를 잘못 읽는다',
    from: '        && request.resource.data.weekId == weekId\n        && request.resource.data.createdBy == request.auth.uid',
    to: '        && request.resource.data.createdBy == request.auth.uid',
    breaks: ['D-13'],
  },
  {
    name: 'duty-create-createdby-free',
    why: '🔴 `createdBy` 위조 방어를 뺀다',
    from: '        && request.resource.data.createdBy == request.auth.uid\n        && request.resource.data.updatedBy == request.auth.uid;',
    to: '        && request.resource.data.updatedBy == request.auth.uid;',
    breaks: ['D-14'],
  },
]
