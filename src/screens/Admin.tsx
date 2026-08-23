import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router'
import { Chip } from '../components/Chip'
import { ConfirmModal } from '../components/ConfirmModal'
import { NeuButton } from '../components/NeuButton'
import { Pill } from '../components/Pill'
import { useToast } from '../components/Toast'
import { useAuth } from '../contexts/AuthProvider'
import {
  approveRequest,
  clearAdminCache,
  CODE_INELIGIBLE_TARGET,
  countRecentIssues,
  fetchActiveInviteCode,
  fetchMembers,
  isTransferTarget,
  reissueInviteCode,
  rejectRequest,
  REISSUE_LIMIT_PER_HOUR,
  subscribePendingRequests,
  transferHead,
  type Actor,
  type InviteCodeState,
  type Member,
  type MemberListState,
  type PendingRequest,
} from '../lib/admin'
import { useOnline } from '../lib/useOnline'
import { usePullToRefresh } from '../lib/usePullToRefresh'

/**
 * S8 관리 — `/admin` · PRD §8.8 · §9.3.3 · §9.3.7 · §9.3.8 · §11.2 OP-09·OP-10 ·
 * design `9a`(부장 채택본) · `9b`·`9c`·`9d`(역할 변형) · `6i`(EM-04) · `4a`·`4c`(모달).
 *
 * **여백을 만들지 마라.** `AppShell`이 `hasDock`으로 이미 소유한다.
 * **`<OfflineBanner />`도 그리지 마라** — 전역 1개다.
 *
 * 🔴 **① 부서 가입 코드 + ② 부원·권한 양도 + ③ 가입 승인 대기 셋이다**(§8.8.2 순서).
 * ④⑤⑥은 §17.1 MVP 제외다. **섹션을 비활성으로도 두지 마라 — 자리 자체가 없어야 한다.**
 *
 * 🔴 **양도는 이 앱에서 유일하게 되돌릴 수 없는 조작이다.** 빗장(`lockRef`) ·
 * 확인 모달(MD-02) · 대상 검증(`admin.ts`) 세 겹을 전부 지킨다.
 *
 * 🔴 **「읽기 전용」은 `disabled`가 아니라 버튼의 부재다**(§8.8.3 #10). 차장·교사는
 * 행만 보고 `승인`·`거절`이 렌더되지 않는다.
 */

/* §8.8 · §8.10 — 확정 문안이다. 새로 짓지 마라. */
const TITLE = '관리'
const SEC_CODE = '부서 가입 코드'
/** §8.8.2 ② — 🔴 교사는 양도할 수 없어 design `9c`가 라벨을 `부원 목록`으로 그린다. */
const SEC_MEMBERS = '부원 · 권한 양도'
const SEC_MEMBERS_RO = '부원 목록'
const SEC_PENDING = '가입 승인 대기'
/** §8.8.3 #3·#4 — PRD가 라벨을 고정한다. design `9a`의 `재발급`·`코드 복사`와 갈린다(보고서 §3). */
const BTN_REISSUE = '코드 재발급'
const BTN_COPY = '복사'
/** §8.8.3 #11·#12 · #7. */
const BTN_APPROVE = '승인'
const BTN_REJECT = '거절'
const BTN_TRANSFER = '양도'
/** §8.10.5 — 상시 안내 문구. */
const HINT_CODE = '재발급 시 이전 코드는 즉시 만료됩니다'
/**
 * §8.8.3 #8. ⚠ **Dev가 볼 때도 이 문구는 그대로다** — §8.10.5 확정 문안이라 바꾸지 않는다.
 * Dev가 양도해도 Dev 본인은 부원이 되지 않으므로 문장이 Dev에게는 참이 아니다.
 * 🔴 그렇다고 새 문구를 지어내지 않는다(§4-4). §7 신규 항목으로 올렸다.
 */
const HINT_TRANSFER = '부장 권한을 양도하면 내 계정은 일반 부원으로 전환됩니다'
const HINT_BOTTOM = '기록 수정·삭제는 부장·차장만 가능합니다'
/**
 * 🔴 결정 1(W-15B) — design `9b`·`9c`의 읽기 전용 안내 3종. **§8.10에 없던 문구이고
 * 사용자가 확정 문안으로 채택했다.** `열람 전용 계정입니다`는 S5(§8.5.2 #5)가 이미 쓴다.
 * §8.10.5 코드 부여는 PM 소유다 — 보고서 §7.
 */
const RO_VICE = '승인 처리는 부장만 할 수 있습니다'
const RO_PENDING = '대기 중'
const RO_TEACHER = '열람 전용 계정입니다'
/** §8.10.2 EM-04 · EM-05. */
const EM_04 = '대기 중인 신청이 없습니다'
const EM_05 = '양도할 수 있는 부원이 없습니다'
/** §8.10.3 ER-06 · §8.8.6 섹션 단위 에러. */
const ER_06 = '코드를 불러오지 못했습니다'
const SECTION_ERROR = '불러오지 못했습니다'
const RETRY = '다시 시도'
/** §8.10.1 TS-05 · TS-06 · TS-07 · TS-08. */
const TS_05 = '새 코드가 발급되었습니다'
const TS_06 = '코드가 복사되었습니다'
const TS_08 = '가입을 거절했습니다'
const TS_09 = '부장 권한을 양도했습니다'
/** §8.8.4 · OP-10 E-3002 · OP-11 E-3003. */
const E_3002 = '잠시 후 다시 시도해 주세요 (시간당 5회 제한)'
const E_3003 = '양도할 수 없는 계정입니다'
/** §8.10.4 MD-01 · MD-02 · MD-03. */
const MD_01 = { title: '코드 재발급', body: '이전 코드는 즉시 만료됩니다. 재발급할까요?', confirm: '재발급' }
const MD_02_TITLE = '부장 권한 양도'
const MD_02_CONFIRM = '양도'
/**
 * §8.10.4 MD-02 본문 `{이름}님에게 부장 권한을 넘깁니다. 내 계정은 부원으로 전환됩니다.`
 *
 * 🔴 **Dev 경로에서는 두 번째 문장을 그리지 않는다.** Dev가 실행하면 Dev 본인의 역할은
 * 바뀌지 않아 그 문장이 거짓이 된다. **새 문구를 만들지 않고 문장을 빼기만 한다**(§4-4).
 */
const MD_02_SELF = '내 계정은 부원으로 전환됩니다.'
function md02Body(name: string, demotesSelf: boolean): string {
  const first = `${name}님에게 부장 권한을 넘깁니다.`
  return demotesSelf ? `${first} ${MD_02_SELF}` : first
}
const MD_03_TITLE = '가입 거절'
const MD_03_CONFIRM = '거절'
/** §8.8.6 오프라인 행. */
const OFFLINE_NOTICE = '오프라인 상태에서는 관리 기능을 사용할 수 없습니다'
/** §8.8.6 로딩 — 코드 자리표시. */
const CODE_PLACEHOLDER = '----'

/** §8.8.3 #10 — 신청 행 로딩은 **2행**이고 #6 부원 행은 **3행**이다. */
const PENDING_SKELETON_ROWS = 2
const MEMBER_SKELETON_ROWS = 3

/**
 * §8.8.3 #1 역할 배지 + #6 부원 행의 역할 표시. 🔴 `Dev`는 §8.10.6 고정 영문이다 —
 * 번역·축약 금지. 배지 표면은 역할마다 다르다(design `9a`·`9b`·`9c`·`9d` 원문).
 */
const ROLE_LABEL: Readonly<Record<string, string>> = {
  head: '부장',
  vice: '차장',
  member: '부원',
  teacher: '교사',
  dev: 'Dev',
}

/**
 * §8.8.3 #6 아바타 — 🔴 **역할 첫 글자다. 이름 첫 글자가 아니다.**
 * ⚠ `head`(부장)와 `member`(부원)가 같은 글자로 겹치지만 역할은 바로 아래 줄에
 * 텍스트로도 있어 정보가 사라지지 않는다(아바타는 `aria-hidden`이다 — §3.9).
 * ⚠ §9.3.1 NG-13 각주는 「아바타는 `name`의 첫 글자」라 적어 §8.8.3 #6과 어긋난다 —
 * design `9a`·`9c`·`9d`가 전부 역할 글자라 §8.8.3을 따랐다. 보고서 §7.
 */
const ROLE_INITIAL: Readonly<Record<string, string>> = {
  head: '부',
  vice: '차',
  member: '부',
  teacher: '교',
  dev: 'D',
}

/** §8.8.2 — ①은 부장·Dev만, ②는 부장·Dev·교사(교사는 읽기), ③은 차장 이상 전원. */
const CAN_SEE_CODE = new Set(['head', 'dev'])
/** 🔴 **차장은 ② 섹션 자체가 없다**(§8.8.2 표 그대로). */
const CAN_SEE_MEMBERS = new Set(['head', 'dev', 'teacher'])
/** 결정 2 — 🔴 **Dev는 모든 권한을 소유한다. 양도도 할 수 있다**(§4.1). */
const CAN_TRANSFER = new Set(['head', 'dev'])
const CAN_DECIDE = new Set(['head', 'dev'])

/**
 * 🔴 보정 ③(결정 3) — 「n번째 카드 = `0.05 × n`초 지연」.
 * design `9a`의 `.05/.1/.15/.2s`는 **섹션 4개 기준**이고 S8은 역할·회차에 따라
 * 섹션 수가 2~6개로 변한다. 상수를 박지 않고 인덱스에서 계산한다.
 *
 * 🔴 **커스텀 속성으로 넘긴다.** `animation-delay`를 인라인 `style`로 직접 주면
 * reduce 미디어 쿼리가 이길 수 없다(W-03B §4-3). `.rise` 규칙이 reduce에서
 * duration 0.01s + delay 0s로 덮으며 **최종 상태는 같다**.
 */
function riseStyle(n: number): CSSProperties {
  return { '--rise-delay': `${(0.05 * n).toFixed(2)}s` } as CSSProperties
}

export default function Admin() {
  const { profile, refresh } = useAuth()
  const online = useOnline()
  const toast = useToast()

  const role = profile?.role ?? 'member'
  const canSeeCode = CAN_SEE_CODE.has(role)
  const canSeeMembers = CAN_SEE_MEMBERS.has(role)
  const canDecide = CAN_DECIDE.has(role)

  /* 보정 ③ — 실제로 렌더되는 섹션만 세어 `0.05 × n`을 준다. 숨은 섹션이 번호를
     차지하면 첫 카드가 0.1s 뒤에 나타난다. */
  const order = useMemo(() => {
    const keys: string[] = []
    if (canSeeCode) keys.push('code')
    if (canSeeMembers) keys.push('members')
    keys.push('pending')
    return (key: string) => riseStyle(keys.indexOf(key) + 1)
  }, [canSeeCode, canSeeMembers])

  const titleRef = useRef<HTMLHeadingElement>(null)

  /* §15.3 — 화면 전환 시 제목으로 포커스를 옮긴다. */
  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  return (
    <main data-screen="S8" aria-labelledby="scr-s8" className="adm-main flex min-h-full flex-col">
      <div className="adm-head">
        <h1 ref={titleRef} id="scr-s8" tabIndex={-1} className="adm-title">
          {TITLE}
        </h1>
        <span className={`adm-badge adm-badge-${role}`}>{ROLE_LABEL[role] ?? role}</span>
      </div>

      {/* §8.8.6 오프라인 행. 🔴 전역 `.ofb`(AppShell 소유)와 **다른 요소**다 —
          전역 배너는 「오프라인이다」를, 이 줄은 「관리 기능이 잠겼다」를 말한다.
          위험색 인라인 배너 3벌(`.s1-banner`·`.s2-banner`·`.rs-banner`)과도 표면이 다르다. */}
      {!online && (
        <p className="adm-off" role="status">
          {OFFLINE_NOTICE}
        </p>
      )}

      <div className="adm-sections">
        {/* 🔴 DOM 순서는 §8.8.2 그대로 ① → ② → ③다. 역할에 따라 빠질 뿐 순서는 고정이다. */}
        {canSeeCode && (
          <CodeSection online={online} profile={profile} toast={toast} style={order('code')} />
        )}
        {canSeeMembers && (
          <MemberSection
            canTransfer={CAN_TRANSFER.has(role)}
            isHead={role === 'head'}
            online={online}
            profile={profile}
            refresh={refresh}
            toast={toast}
            style={order('members')}
          />
        )}
        <PendingSection
          canDecide={canDecide}
          role={role}
          online={online}
          profile={profile}
          toast={toast}
          error={SECTION_ERROR}
          style={order('pending')}
        />
      </div>

      <p className="adm-hint">{HINT_BOTTOM}</p>
    </main>
  )
}

type Profile = ReturnType<typeof useAuth>['profile']
type ToastFn = ReturnType<typeof useToast>

function toActor(profile: Profile): Actor {
  return { uid: profile?.uid ?? '', name: profile?.name ?? '', role: profile?.role ?? '' }
}

/* --- ① 부서 가입 코드 --------------------------------------------------- */

function CodeSection({
  online,
  profile,
  toast,
  style,
}: {
  online: boolean
  profile: Profile
  toast: ToastFn
  style: CSSProperties
}) {
  const [state, setState] = useState<InviteCodeState | null>(null)
  const [recent, setRecent] = useState<number | null>(null)
  const [modal, setModal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  /** 새 코드가 들어오면 `blurIn`을 다시 돌리기 위한 열쇠(T-02). */
  const [codeKey, setCodeKey] = useState(0)

  /* §3.3 — 연속 탭 차단은 상태가 아니라 ref다(W-06 §5-4 · 프로젝트 전역 규칙).
     `disabled`와 `busy`는 같은 태스크 안의 5연타를 못 막는다. */
  const lockRef = useRef(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      const [code, count] = await Promise.all([
        fetchActiveInviteCode(),
        countRecentIssues(new Date()),
      ])
      if (!alive) return
      setState(code)
      setRecent(count)
    })()
    return () => {
      alive = false
    }
  }, [reloadKey])

  const refresh = useCallback(() => {
    clearAdminCache()
    setState(null)
    setReloadKey((n) => n + 1)
  }, [])

  /* BR-16 — 세지 못했으면(`null`) 막지 않는다. 조회 실패를 「한도 초과」로 읽으면
     정상 부장이 코드를 만들지 못한다. */
  const rateLimited = recent !== null && recent >= REISSUE_LIMIT_PER_HOUR
  const canCopy = typeof navigator !== 'undefined' && !!navigator.clipboard
  const codeId = state?.kind === 'ok' ? state.codeId : null

  const doReissue = async () => {
    if (lockRef.current) return
    /* 🔴 강제 탭(비활성 우회)에서도 여기서 선다. E-3002는 규격 문구다. */
    if (rateLimited) {
      toast(E_3002)
      return
    }
    if (!online) return
    lockRef.current = true
    setBusy(true)
    const result = await reissueInviteCode(toActor(profile), codeId)
    lockRef.current = false
    setBusy(false)
    setModal(false)
    if (!result.ok) {
      toast(SECTION_ERROR)
      return
    }
    setCodeKey((n) => n + 1)
    setRecent((n) => (n === null ? n : n + 1))
    setReloadKey((n) => n + 1)
    toast(TS_05)
  }

  const doCopy = async () => {
    if (!codeId || !online || !canCopy || lockRef.current) return
    try {
      await navigator.clipboard.writeText(codeId)
      toast(TS_06)
    } catch {
      /* §8.8.3 #4 — 실패 시 토스트. 문구 사전에 실패 코드가 없어 섹션 문구를 재사용한다. */
      toast(SECTION_ERROR)
    }
  }

  return (
    <section className="glass rounded-20 adm-card rise" style={style} aria-labelledby="adm-code-h">
      <h2 id="adm-code-h" className="adm-label">
        {SEC_CODE}
      </h2>

      {state?.kind === 'failed' ? (
        <>
          {/* §8.10.3 ER-06. 🔴 「코드 없음」과 다른 사실이다. */}
          <p className="adm-err" role="alert">
            {ER_06}
          </p>
          <NeuButton radius={15} className="adm-retry" onClick={refresh}>
            {RETRY}
          </NeuButton>
        </>
      ) : (
        <>
          {/* §8.8.6 로딩은 `----` 자리표시다. 🔴 `none`은 로딩도 에러도 아니다(§2.3-B) —
              표시할 코드가 없으므로 같은 자리표시를 쓰고 `재발급`이 첫 코드를 만든다. */}
          <p key={codeKey} className={state === null ? 'adm-code adm-code-dim' : 'adm-code'}>
            {state?.kind === 'ok' ? state.codeId : CODE_PLACEHOLDER}
          </p>
          <div className="adm-btnrow">
            <NeuButton
              radius={15}
              className="adm-btn"
              disabled={!online || !canCopy || !codeId}
              onClick={() => void doCopy()}
            >
              {BTN_COPY}
            </NeuButton>
            <NeuButton
              radius={15}
              className="adm-btn"
              disabled={!online || busy || rateLimited}
              onClick={() => setModal(true)}
            >
              {BTN_REISSUE}
            </NeuButton>
          </div>
        </>
      )}

      <p className="adm-note">{HINT_CODE}</p>

      {/* §8.10.4 MD-01. 좌 버튼은 항상 `취소`이고 `ConfirmModal`이 소유한다. */}
      <ConfirmModal
        open={modal}
        title={MD_01.title}
        body={MD_01.body}
        confirmLabel={MD_01.confirm}
        loading={busy}
        onConfirm={() => void doReissue()}
        onCancel={() => setModal(false)}
      />
    </section>
  )
}

/* --- ② 부원 · 권한 양도 ------------------------------------------------- */

/**
 * §8.8.3 #6·#7·#8 — design `9a` 두 번째 카드 · `9c`(교사 읽기) · `9d`(Dev).
 *
 * 🔴 **`양도` pill이 렌더되는 조건 = 실행자 조건 ∧ 대상 조건이다.**
 * 실행자는 `head`·`dev`(결정 2), 대상은 `active` 且 `role ∈ {member, vice}`(BR-20) 且 본인 아님(BR-21).
 * 탈퇴(R-08·BR-59)와 승인 대기(US-H-03 AC-4)는 `status == 'active'` 질의에 이미 걸러진다.
 * 🔴 **`disabled`가 아니라 부재다**(W-15A §4-4).
 */
function MemberSection({
  canTransfer,
  isHead,
  online,
  profile,
  refresh,
  toast,
  style,
}: {
  canTransfer: boolean
  isHead: boolean
  online: boolean
  profile: Profile
  refresh: () => Promise<void>
  toast: ToastFn
  style: CSSProperties
}) {
  const [state, setState] = useState<MemberListState | null>(null)
  const [target, setTarget] = useState<Member | null>(null)
  const [busy, setBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const navigate = useNavigate()

  /* 🔴 연속 탭 차단은 상태가 아니라 ref다. **양도는 되돌릴 수 없어 더 중요하다** —
     `disabled`와 `busy`는 같은 태스크 안의 5연타를 못 막는다(W-06 §5-4). */
  const lockRef = useRef(false)

  /* 🔴 head 경로의 `refresh()`는 **이 화면이 사라진 뒤에** 돈다. 이유는 `doTransfer` 주석. */
  const refreshOnUnmountRef = useRef(false)
  useEffect(
    () => () => {
      /* ⚠ 실패해도 `status`·`profile`을 흔들지 않는다(PROGRESS 확정) — 다음 진입에서
         반영된다. **재시도 루프를 만들지 마라.** */
      if (refreshOnUnmountRef.current) void refresh()
    },
    [refresh],
  )

  useEffect(() => {
    let alive = true
    void (async () => {
      const result = await fetchMembers()
      if (!alive) return
      setState(result)
    })()
    return () => {
      alive = false
    }
  }, [reloadKey])

  const meUid = profile?.uid ?? ''
  const members = state?.kind === 'ok' ? state.members : []

  /* §2.3-C — EM-05의 조건은 「부원 1명」이 아니라 **BR-20 통과 대상 0명**이다.
     부원이 여럿이어도 전부 `teacher`·`dev`이거나 본인뿐이면 넘길 곳이 없다. */
  const eligible = useMemo(
    () =>
      (state?.kind === 'ok' ? state.members : []).filter(
        (m) => m.uid !== meUid && isTransferTarget(m),
      ),
    [state, meUid],
  )

  const doTransfer = async () => {
    const member = target
    if (!member || lockRef.current || !online || !canTransfer) return
    lockRef.current = true
    setBusy(true)
    const result = await transferHead(toActor(profile), member)
    lockRef.current = false
    setBusy(false)
    setTarget(null)

    if (!result.ok) {
      /* OP-11 E-3003과 통신 실패는 사용자가 할 수 있는 일이 다르다. */
      toast(result.code === CODE_INELIGIBLE_TARGET ? E_3003 : SECTION_ERROR)
      return
    }

    /* 🔴 **순서가 중요하다**(§3.6). 토스트 → 이동 → 갱신.
       `refresh()`를 먼저 부르면 `profile.role`이 `member`가 되는 순간 아직 `/admin`이라
       `RequireRole`이 `/` + TS-12 `접근 권한이 없습니다`로 밀어낸다. 토스트는 큐가 없어
       (W-03C §4-10) TS-09가 TS-12로 즉시 교체되고, 사용자는 성공했는데 실패 문구를 본다. */
    toast(TS_09)
    if (isHead) {
      /* 🔴 **순서만으로는 막지 못한다 — 갱신을 「이동 뒤」가 아니라 「언마운트 뒤」로 묶는다.**

         실측한 실패: `navigate`의 상태 갱신은 `startTransition`이라 커밋이 미뤄지고,
         그 사이 `refresh()`가 `profile.role`을 `member`로 바꾸면 그 **동기 갱신이 전환을
         앞질러** 아직 커밋돼 있는 `/admin` 트리를 다시 그린다. 그때 `RequireRole`이
         `/` + TS-12로 밀어내고, 토스트는 큐가 없어(W-03C §4-10) TS-09가 즉시 교체된다 —
         사용자는 성공했는데 「접근 권한이 없습니다」를 본다.
         `RequireRole render denied=true role=member path=/`를 그대로 찍어 확인했다.

         ⚠ **세 가지가 전부 실패했다** — ① `navigate` 뒤에 `refresh()`(§3.6의 순서) ·
         ② 바깥을 `ReactDOM.flushSync`로 감싸기 · ③ `await navigate(…, { flushSync: true })`.
         전환의 커밋 시점을 호출부가 관측할 수 없기 때문이다.

         → **화면이 실제로 사라진 시점**(언마운트 정리 함수)에 갱신한다. 그 시점에는
         `RequireRole`도 함께 사라진 뒤라 TS-12가 뜰 창 자체가 없다. */
      refreshOnUnmountRef.current = true
      navigate('/', { replace: true })
      return
    }
    /* Dev 경로 — 🔴 본인 role이 바뀌지 않는다. 화면 이동도 `refresh()`도 없다.
       ⚠ `clearHomeCache()`를 부르지 마라 — `stats.ts`의 `deptCache`는 `headUid`를
       담지도 않고 S3가 그 필드를 쓰지도 않는다. */
    clearAdminCache()
    setReloadKey((n) => n + 1)
  }

  return (
    <section className="glass rounded-20 adm-card rise" style={style} aria-labelledby="adm-mem-h">
      <h2 id="adm-mem-h" className="adm-label">
        {canTransfer ? SEC_MEMBERS : SEC_MEMBERS_RO}
      </h2>

      {/* 결정 1 — 교사에게 붙는다. 🔴 부장·Dev에는 부재다. */}
      {!canTransfer && <p className="adm-ro">{RO_TEACHER}</p>}

      {state?.kind === 'failed' ? (
        /* 🔴 **실패 ≠ 없음.** 조회 실패는 EM-05가 아니다. 섹션 독립이라 ①·③을 막지 않는다. */
        <>
          <p className="adm-err" role="alert">
            {SECTION_ERROR}
          </p>
          <NeuButton
            radius={15}
            className="adm-retry"
            onClick={() => {
              setState(null)
              setReloadKey((n) => n + 1)
            }}
          >
            {RETRY}
          </NeuButton>
        </>
      ) : state === null ? (
        <ul aria-hidden="true">
          {Array.from({ length: MEMBER_SKELETON_ROWS }, (_, i) => (
            <li key={i} className="mrow mrow-mem">
              <span className="skel h-8 w-8 flex-none rounded-11" />
              <span className="min-w-0 flex-1">
                <span className="skel block h-[14px] w-[64px]" />
                <span className="skel mt-1.5 block h-[11px] w-[40px]" />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <ul>
            {members.map((member) => (
              <li key={member.uid} className="mrow mrow-mem">
                {/* 🔴 **역할 첫 글자**다(§8.8.3 #6). 역할은 아래 줄에 텍스트로도 있어
                    아바타는 장식이다 — `aria-hidden`(§3.9). */}
                <span className="mrow-av" aria-hidden="true">
                  {ROLE_INITIAL[member.role] ?? '·'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="mrow-name">{member.name}</span>
                  {/* 🔴 이메일을 그리지 않는다(§8.8.3 #6 · §4.2 단서 1). */}
                  <span className="mrow-sub">{ROLE_LABEL[member.role] ?? member.role}</span>
                </span>
                {canTransfer && member.uid !== meUid && isTransferTarget(member) && (
                  <Pill
                    variant="soft"
                    disabled={!online || busy}
                    ariaLabel={`${member.name}에게 부장 권한 양도`}
                    onClick={() => setTarget(member)}
                  >
                    {BTN_TRANSFER}
                  </Pill>
                )}
              </li>
            ))}
          </ul>

          {/* EM-05 — 🔴 **목록 자체는 그대로 그린다**(본인 행은 남는다). 양도할 수 있는
              역할에게만 뜻이 있는 문구라 교사에게는 붙이지 않는다. */}
          {canTransfer && eligible.length === 0 && <p className="adm-empty">{EM_05}</p>}
        </>
      )}

      {/* §8.8.3 #8. 🔴 Dev가 볼 때도 그대로다 — §8.10.5 확정 문안이다. */}
      {canTransfer && <p className="adm-note">{HINT_TRANSFER}</p>}

      {/* §8.10.4 MD-02. 🔴 `destructive`를 켜지 않는다 — §8.10.4가 위험색을 MD-07에만 준다. */}
      <ConfirmModal
        open={target !== null}
        title={MD_02_TITLE}
        body={md02Body(target?.name ?? '', isHead)}
        confirmLabel={MD_02_CONFIRM}
        loading={busy}
        onConfirm={() => void doTransfer()}
        onCancel={() => setTarget(null)}
      />
    </section>
  )
}

/* --- ③ 가입 승인 대기 --------------------------------------------------- */

function PendingSection({
  canDecide,
  role,
  online,
  profile,
  toast,
  error,
  style,
}: {
  canDecide: boolean
  role: string
  online: boolean
  profile: Profile
  toast: ToastFn
  error: string
  style: CSSProperties
}) {
  /* 🔴 결정 1 — 읽기 전용 역할에게 **왜 버튼이 없는지**를 말한다.
     차장·교사에게 서로 다른 문구가 붙고 부장·Dev에는 붙지 않는다. */
  const readOnlyNote = role === 'vice' ? RO_VICE : role === 'teacher' ? RO_TEACHER : null
  const [requests, setRequests] = useState<readonly PendingRequest[]>([])
  const [failed, setFailed] = useState(false)
  const [serverSynced, setServerSynced] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  /** T-05·T-06 — 처리된 행을 0.2s 동안 페이드아웃시킨 뒤 구독이 실제로 지운다. */
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set())
  const [rising, setRising] = useState<ReadonlySet<string>>(() => new Set())
  const [rejectTarget, setRejectTarget] = useState<PendingRequest | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const lockRef = useRef(false)
  const seenRef = useRef<Set<string>>(new Set())
  const syncedRef = useRef(false)

  /* 🔴 구독 1개. cleanup의 해제가 없으면 독을 오갈 때마다 쌓인다(W-13 §4-1). */
  useEffect(() => {
    /* 🔴 구독을 다시 걸 때 **ref 두 개를 함께** 되돌린다. `seenRef`만 비우고
       `syncedRef`를 두면 새 구독의 첫(캐시) 스냅샷이 통째로 「신규 수신」으로 보인다 —
       StrictMode 이중 마운트와 T-07 새로고침에서 실제로 그렇게 찍혔다. */
    seenRef.current = new Set()
    syncedRef.current = false
    return subscribePendingRequests(
      (snapshot) => {
        setFailed(false)

        /* T-07 — 서버가 확인한 목록을 받은 **뒤에** 들어온 행만 신규 수신분이다.
           `live`를 먼저 읽고 나서 ref를 올린다(첫 서버 스냅샷은 신규가 아니다). */
        const live = syncedRef.current
        if (!snapshot.fromCache) {
          syncedRef.current = true
          setServerSynced(true)
        }
        const fresh = snapshot.requests.filter((r) => !seenRef.current.has(r.id))
        for (const r of snapshot.requests) seenRef.current.add(r.id)
        if (live && fresh.length > 0) setRising(new Set(fresh.map((r) => r.id)))

        setRequests(snapshot.requests)
      },
      () => setFailed(true),
    )
  }, [reloadKey])

  usePullToRefresh(
    useCallback(() => {
      setFailed(false)
      setServerSynced(false)
      setRequests([])
      setReloadKey((n) => n + 1)
    }, []),
  )

  /**
   * 🔴 **EM-04는 서버가 확인한 빈 목록일 때만이다**(W-13 §4-5와 같은 규칙).
   * 오프라인·빈 캐시에서 `onSnapshot`이 13ms 만에 빈 스냅샷을 쏘는 것을 W-13이 실측했다 —
   * 그것을 「대기 중인 신청이 없습니다」로 읽으면 사실과 어긋난다.
   */
  const ready = serverSynced || requests.length > 0

  /* 🔴 행을 **지우는 것은 구독**이 한다(처리되면 `pending`에서 빠진다). 화면은 그 사이
     0.2s 페이드아웃만 담당한다(T-05·T-06). 타이머로 지우면 구독과 두 주체가 같은 행을
     다투게 되고, 커밋이 실패했을 때 행이 사라진 채로 남는다. */
  const count = useMemo(
    () => requests.filter((r) => !leaving.has(r.id)).length,
    [requests, leaving],
  )

  const settle = (id: string) => {
    setLeaving((prev) => new Set(prev).add(id))
  }

  const doApprove = async (request: PendingRequest) => {
    if (lockRef.current || !online || !canDecide) return
    lockRef.current = true
    setBusyId(request.id)
    const result = await approveRequest(toActor(profile), request)
    lockRef.current = false
    setBusyId(null)
    if (!result.ok) {
      toast(error)
      return
    }
    settle(request.id)
    /* §8.10.1 TS-07 — `{이름}님의 가입을 승인했습니다`. */
    toast(`${request.name}님의 가입을 승인했습니다`)
  }

  const doReject = async () => {
    const request = rejectTarget
    if (!request || lockRef.current || !online || !canDecide) return
    lockRef.current = true
    setBusyId(request.id)
    const result = await rejectRequest(toActor(profile), request)
    lockRef.current = false
    setBusyId(null)
    setRejectTarget(null)
    if (!result.ok) {
      toast(error)
      return
    }
    settle(request.id)
    toast(TS_08)
  }

  return (
    <section className="glass rounded-20 adm-card rise" style={style} aria-labelledby="adm-pend-h">
      <div className="adm-labelrow">
        <h2 id="adm-pend-h" className="adm-label">
          {SEC_PENDING}
        </h2>
        {/* §8.8.3 #9 — 🔴 0건이면 배지를 숨긴다. 색만으로 전달하지 않도록 `aria-label`을 준다. */}
        {count > 0 && (
          <span className="adm-count" aria-label={`${SEC_PENDING} ${count}건`}>
            {count}
          </span>
        )}
      </div>

      {/* design `9b`·`9c` 원문 — **라벨 바로 아래**다(지시서 §3.7의 「섹션 하단」과 갈린다. 보고서 §3). */}
      {readOnlyNote && <p className="adm-ro">{readOnlyNote}</p>}

      {failed ? (
        <>
          <p className="adm-err" role="alert">
            {error}
          </p>
          <NeuButton
            radius={15}
            className="adm-retry"
            onClick={() => {
              setFailed(false)
              setServerSynced(false)
              setReloadKey((n) => n + 1)
            }}
          >
            {RETRY}
          </NeuButton>
        </>
      ) : !ready ? (
        <ul aria-hidden="true">
          {Array.from({ length: PENDING_SKELETON_ROWS }, (_, i) => (
            <li key={i} className="mrow">
              <span className="min-w-0 flex-1">
                <span className="skel block h-[14px] w-[76px]" />
                <span className="skel mt-1.5 block h-[11px] w-[132px]" />
              </span>
            </li>
          ))}
        </ul>
      ) : requests.length === 0 ? (
        /* EM-04 — design `6i`. 섹션 안의 한 줄이라 `CenterNotice`(부모 flex 컬럼 전제)를 쓰지 않는다. */
        <p className="adm-empty">{EM_04}</p>
      ) : (
        <ul>
          {requests.map((request) => (
            <li
              key={request.id}
              className={`mrow${rising.has(request.id) ? ' mrow-new' : ''}${
                leaving.has(request.id) ? ' mrow-leave' : ''
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="mrow-name">{request.name}</span>
                <span className="mrow-sub">{request.email}</span>
              </span>
              {/* 🔴 차장·교사는 버튼이 **렌더되지 않는다**. `disabled`가 아니다(§8.8.3 #10).
                  그 자리에 결정 1의 `대기 중` 상태 표시가 들어간다 — design `9b`(차장)와
                  `9c`(교사) **둘 다** 갖고 있다. 🔴 상호작용 요소가 아니라 `Chip`이다(§3.9).
                  design 원문 `padding:5px 11px`은 §7.3 `chip`의 `6px 12px`와 1px 다르지만
                  공유 표면을 한 화면 때문에 바꾸지 않는다(W-13 §3 · W-14 칸 5와 같은 판단). */}
              {canDecide ? (
                <>
                  <Pill
                    variant="fill"
                    disabled={!online || busyId !== null}
                    ariaLabel={`${request.name} 가입 승인`}
                    onClick={() => void doApprove(request)}
                  >
                    {BTN_APPROVE}
                  </Pill>
                  <Pill
                    variant="line"
                    disabled={!online || busyId !== null}
                    ariaLabel={`${request.name} 가입 거절`}
                    onClick={() => setRejectTarget(request)}
                  >
                    {BTN_REJECT}
                  </Pill>
                </>
              ) : (
                <Chip className="flex-none">{RO_PENDING}</Chip>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* §8.10.4 MD-03. 🔴 거절 사유 입력란은 없다(§2.3-A) — 확인만이다. */}
      <ConfirmModal
        open={rejectTarget !== null}
        title={MD_03_TITLE}
        body={`${rejectTarget?.name ?? ''}님의 가입을 거절할까요?`}
        confirmLabel={MD_03_CONFIRM}
        destructive
        loading={busyId !== null}
        onConfirm={() => void doReject()}
        onCancel={() => setRejectTarget(null)}
      />
    </section>
  )
}
