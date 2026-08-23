import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConfirmModal } from '../components/ConfirmModal'
import { NeuButton } from '../components/NeuButton'
import { Pill } from '../components/Pill'
import { useToast } from '../components/Toast'
import { useAuth } from '../contexts/AuthProvider'
import {
  approveRequest,
  clearAdminCache,
  countRecentIssues,
  fetchActiveInviteCode,
  reissueInviteCode,
  rejectRequest,
  REISSUE_LIMIT_PER_HOUR,
  subscribePendingRequests,
  type Actor,
  type InviteCodeState,
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
 * 🔴 **이번 회차는 ① 부서 가입 코드 + ③ 가입 승인 대기 둘뿐이다.**
 * ② 부원·권한 양도는 W-15B이고 ④⑤⑥은 §17.1 MVP 제외다.
 * **섹션을 비활성으로도 두지 마라 — 자리 자체가 없어야 한다.**
 *
 * 🔴 **「읽기 전용」은 `disabled`가 아니라 버튼의 부재다**(§8.8.3 #10). 차장·교사는
 * 행만 보고 `승인`·`거절`이 렌더되지 않는다.
 */

/* §8.8 · §8.10 — 확정 문안이다. 새로 짓지 마라. */
const TITLE = '관리'
const SEC_CODE = '부서 가입 코드'
const SEC_PENDING = '가입 승인 대기'
/** §8.8.3 #3·#4 — PRD가 라벨을 고정한다. design `9a`의 `재발급`·`코드 복사`와 갈린다(보고서 §3). */
const BTN_REISSUE = '코드 재발급'
const BTN_COPY = '복사'
/** §8.8.3 #11·#12. */
const BTN_APPROVE = '승인'
const BTN_REJECT = '거절'
/** §8.10.5 — 상시 안내 문구. */
const HINT_CODE = '재발급 시 이전 코드는 즉시 만료됩니다'
const HINT_BOTTOM = '기록 수정·삭제는 부장·차장만 가능합니다'
/** §8.10.2 EM-04. */
const EM_04 = '대기 중인 신청이 없습니다'
/** §8.10.3 ER-06 · §8.8.6 섹션 단위 에러. */
const ER_06 = '코드를 불러오지 못했습니다'
const SECTION_ERROR = '불러오지 못했습니다'
const RETRY = '다시 시도'
/** §8.10.1 TS-05 · TS-06 · TS-07 · TS-08. */
const TS_05 = '새 코드가 발급되었습니다'
const TS_06 = '코드가 복사되었습니다'
const TS_08 = '가입을 거절했습니다'
/** §8.8.4 · OP-10 E-3002. */
const E_3002 = '잠시 후 다시 시도해 주세요 (시간당 5회 제한)'
/** §8.10.4 MD-01 · MD-03. */
const MD_01 = { title: '코드 재발급', body: '이전 코드는 즉시 만료됩니다. 재발급할까요?', confirm: '재발급' }
const MD_03_TITLE = '가입 거절'
const MD_03_CONFIRM = '거절'
/** §8.8.6 오프라인 행. */
const OFFLINE_NOTICE = '오프라인 상태에서는 관리 기능을 사용할 수 없습니다'
/** §8.8.6 로딩 — 코드 자리표시. */
const CODE_PLACEHOLDER = '----'

/** §8.8.3 #10 — 신청 행 로딩은 **2행**이다. */
const PENDING_SKELETON_ROWS = 2

/**
 * §8.8.3 #1 역할 배지. 🔴 `Dev`는 §8.10.6 고정 영문이다 — 번역·축약 금지.
 * 배지 표면은 역할마다 다르다(design `9a`·`9b`·`9c`·`9d` 원문).
 */
const ROLE_LABEL: Readonly<Record<string, string>> = {
  head: '부장',
  vice: '차장',
  teacher: '교사',
  dev: 'Dev',
}

/** §8.8.2 — ①은 부장·Dev만, ③은 차장 이상 전원(단 처리는 부장·Dev만). */
const CAN_SEE_CODE = new Set(['head', 'dev'])
const CAN_DECIDE = new Set(['head', 'dev'])

export default function Admin() {
  const { profile } = useAuth()
  const online = useOnline()
  const toast = useToast()

  const role = profile?.role ?? 'member'
  const canSeeCode = CAN_SEE_CODE.has(role)
  const canDecide = CAN_DECIDE.has(role)

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
        {/* 🔴 ② 부원·권한 양도 자리다. **빈 div도 만들지 않는다**(W-15B). */}
        {canSeeCode && <CodeSection online={online} profile={profile} toast={toast} />}
        <PendingSection
          canDecide={canDecide}
          online={online}
          profile={profile}
          toast={toast}
          error={SECTION_ERROR}
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
}: {
  online: boolean
  profile: Profile
  toast: ToastFn
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
    <section className="glass rounded-20 adm-card" aria-labelledby="adm-code-h">
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

/* --- ③ 가입 승인 대기 --------------------------------------------------- */

function PendingSection({
  canDecide,
  online,
  profile,
  toast,
  error,
}: {
  canDecide: boolean
  online: boolean
  profile: Profile
  toast: ToastFn
  error: string
}) {
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
    <section className="glass rounded-20 adm-card" aria-labelledby="adm-pend-h">
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
              {/* 🔴 차장·교사는 버튼이 **렌더되지 않는다**. `disabled`가 아니다(§8.8.3 #10). */}
              {canDecide && (
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
