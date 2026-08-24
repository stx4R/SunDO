import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { BottomSheet } from '../components/BottomSheet'
import { Chip } from '../components/Chip'
import { ConfirmModal } from '../components/ConfirmModal'
import { Footer } from '../components/Footer'
import { GlassCard } from '../components/GlassCard'
import { ChevronRightIcon, LockIcon } from '../components/icons'
import { Switch } from '../components/Switch'
import { useToast } from '../components/Toast'
import { useAuth } from '../contexts/AuthProvider'
import { refreshSessionCaches, saveNotificationPrefs, withdrawAccount } from '../lib/account'
import { isStandalone } from '../lib/pwa'
import { fetchDepartment } from '../lib/stats'
import { useOnline } from '../lib/useOnline'

/**
 * S10 설정 — `/settings` · PRD §8.11 · §9.3.1 · §10.10 BR-56·BR-57 · §11.2 ·
 * design `20a`(부원) · `20b`(부장 탈퇴 차단) · `20c`(MD-07) · `14a`(Footer 전체형).
 *
 * **여백을 만들지 마라.** `AppShell`이 `hasDock`으로 이미 소유한다.
 * **`<OfflineBanner />`도 그리지 마라** — 전역 1개다.
 *
 * 🔴 **실규칙 위에서 만들어지는 첫 화면이다.** 쓰기 계약은 `lib/account.ts`가 소유한다.
 *
 * 🔴 **부장 차단은 「버튼 부재」가 아니라 「탭 → 문구 펼침」이다**(§8.11.4 T-06).
 * design `20b`의 `계정 탈퇴`는 `cursor:pointer` + 눌림 `opacity:0.6`으로 **눌린다.**
 * 눌리되 **MD-07이 열리지 않고** 안내가 펼쳐진다. 두 경로를 `handleWithdrawTap`에서 가른다.
 * ⚠ W-17 지시서의 결정 3(비활성 버튼 + 신규 문구)은 이 시안·§8.11.4 T-06·§10.10 R-07·
 * BR-56과 대조해 **철회됐다**(보고서 §4). 신규 문구는 0건이다.
 */

/* §8.11 · §8.10 — 확정 문안이다. 새로 짓지 마라. */
const TITLE = '설정'
const SEC_ACCOUNT = '내 계정'
const SEC_NOTIFY = '알림'
const SEC_APP = '앱'
const SEC_POLICY = '약관·정책'

const ROW_ROLE = '역할'
const ROW_DEPT = '소속'
/** §8.11.1 설계 원칙 · design `20a` 원문. */
const NOTE_READONLY = '이름과 학교 이메일은 Google 계정 정보이며 앱에서 변경할 수 없습니다'

const NOTIFY_DUTY = '순찰 당번 알림'
const NOTIFY_DUTY_SUB = '내가 당번인 날 아침에 알립니다'
const NOTIFY_APPROVAL = '가입 승인 알림'
const NOTIFY_APPROVAL_SUB = '새 가입 신청이 오면 알립니다'
/** §8.11.5 Push 미지원 안내(§8.11.3 #5 정보 박스). */
const NOTIFY_LOCKED = '홈 화면에 추가하면 알림을 받을 수 있습니다'

const ROW_VERSION = '버전'
const ROW_A2HS = '홈 화면에 추가'
const CHIP_A2HS = '설치 안내'
/** §8.11.3 #6 — standalone이면 값이 바뀌고 비활성이다. */
const CHIP_A2HS_DONE = '설치됨'
const ROW_REFRESH = '데이터 새로고침'

const BTN_LOGOUT = '로그아웃'
const BTN_WITHDRAW = '계정 탈퇴'
/** §8.10.5 — S10 탈퇴 아래 상시 힌트. */
const HINT_WITHDRAW = '탈퇴해도 내가 작성한 기록은 삭제되지 않습니다'
/**
 * 🔴 §8.11.4 T-06 · §10.10 R-07 · BR-56이 **같은 문자열**을 규정한다. design `20b`도 같다.
 * 세 곳이 일치하므로 신규 문구가 아니고 §8.10 코드 부여도 필요 없다.
 */
const WITHDRAW_BLOCKED = '부장 권한을 먼저 양도해 주세요'

/* §8.10.4 모달 — MD-06 · MD-07 원문. design `20c`. */
const MD06_TITLE = BTN_LOGOUT
const MD06_BODY = '로그아웃할까요?'
const MD06_CONFIRM = BTN_LOGOUT
const MD07_TITLE = BTN_WITHDRAW
const MD07_BODY =
  '자율생활부 앱 이용이 종료됩니다. 내가 작성한 기록은 삭제되지 않고 그대로 남습니다.'
const MD07_CONFIRM = '탈퇴'

/* §8.10.1 토스트. */
const TS_19 = '최신 정보로 새로고침했습니다'
const TS_20 = '탈퇴가 완료되었습니다'
const TS_PREFS = '알림 설정을 저장했습니다'

/** §18.3 「설치 안내(부원 배포용 문구)」 3단계 원문. **문장을 고치지 마라.** */
const A2HS_TITLE = CHIP_A2HS
const A2HS_STEPS: readonly string[] = [
  'Safari로 앱 주소에 접속합니다.',
  '하단 공유 버튼 → `홈 화면에 추가`를 누릅니다.',
  '홈 화면의 `자율생활부` 아이콘으로 실행합니다.',
]

/**
 * §8.8.3 #1과 같은 표. 🔴 `Dev`는 §8.10.6 고정 영문이다.
 * ⚠ `Admin.tsx`가 같은 표를 갖는다 — 그 파일은 이번 회차 불가침(diff 0줄)이라
 * 공유 모듈로 올리지 못했다. 승격은 보고서 §7 항목이다.
 */
const ROLE_LABEL: Readonly<Record<string, string>> = {
  head: '부장',
  vice: '차장',
  member: '부원',
  teacher: '교사',
  dev: 'Dev',
}

/** §8.11.2 ② 2행 — **차장 이상만**. design `20a`(부원)는 1행, `20b`(부장)는 2행이다. */
const APPROVAL_ROLES = new Set(['vice', 'head', 'dev'])

const POLICY_ROWS: readonly { path: string; label: string }[] = [
  { path: '/policy/privacy', label: '개인정보 처리방침' },
  { path: '/policy/terms', label: '서비스 이용약관' },
  { path: '/policy/oss', label: '오픈소스 라이선스' },
]

/**
 * §8.11.5 「Push 미지원(iOS 미설치)」.
 *
 * 🔴 `isStandalone()`은 W-19에서 `lib/pwa.ts`로 옮겼다. 소비자가 둘이 됐기 때문이다 —
 * 이 화면의 `설치됨` 표시와 설치 안내 배너(design `10d`)의 노출 조건.
 * 두 벌이면 한쪽만 고쳐졌을 때 「설치됐다면서 설치하라고 하는」 상태가 조용히 생긴다.
 *
 * ⚠ **MVP에서는 대부분의 사용자가 잠금 상태를 본다**(§8.11.5 말미). Web Push 발송은
 * v1.1이고(§13.1 · D-12) 실제 구독도 W-19(PWA)가 소유한다. 여기서는 **토글을 잠글지**만
 * 판정한다 — 권한 요청을 띄우지 않는다.
 */
function pushSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'Notification' in window && 'serviceWorker' in navigator && isStandalone()
}

export default function Settings() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const online = useOnline()

  const titleRef = useRef<HTMLHeadingElement>(null)
  /* §3.5 — 되돌릴 수 없는 조작의 동기 빗장. 양도(S8)와 같은 급이다. */
  const withdrawingRef = useRef(false)

  const [academicYear, setAcademicYear] = useState<number | null>(null)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  /** T-06 — 부장이 탭했을 때만 펼친다. 처음부터 떠 있지 않다. */
  const [blockedShown, setBlockedShown] = useState(false)
  const [a2hsOpen, setA2hsOpen] = useState(false)
  const [shakeLock, setShakeLock] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  /**
   * T-03 낙관적 UI. 🔴 **`profile`을 `useEffect`로 state에 복사하지 않는다** —
   * 그 형태는 렌더를 한 번 더 돌리고 린트 기준선(18)을 깨뜨린다. 서버값을 정본으로
   * 두고 **덮어쓴 값만** 들고 있다가, 저장에 실패하면 이전 덮개로 되돌린다.
   */
  const [prefsOverride, setPrefsOverride] = useState<{ duty: boolean; approval: boolean } | null>(
    null,
  )
  const [prefsSaving, setPrefsSaving] = useState(false)

  /* §15.3 — 화면 전환 시 제목으로 포커스를 옮긴다. */
  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  /* `소속` 값의 학년도. 실패해도 카드를 죽이지 않는다(§8.11.5 「한 카드 실패가
     다른 카드를 막지 않는다」) — 학년도만 빠지고 나머지는 그대로 그린다. */
  useEffect(() => {
    let alive = true
    void fetchDepartment().then((result) => {
      if (alive && result.kind === 'ok') setAcademicYear(result.academicYear)
    })
    return () => {
      alive = false
    }
  }, [])

  if (!profile) return null

  const prefs = prefsOverride ?? profile.notificationPrefs
  const role = profile.role
  const isHead = role === 'head'
  const pushOn = pushSupported()
  const standalone = isStandalone()
  const showApproval = APPROVAL_ROLES.has(role)

  /* T-02 — 아무 동작도 하지 않고 자물쇠만 0.2s 1회 흔든다. */
  const handleLockTap = () => {
    if (shakeLock) return
    setShakeLock(true)
    window.setTimeout(() => setShakeLock(false), 200)
  }

  /* T-03 — 낙관적 반영 → 저장 → 실패 시 원복. */
  const handlePref = (key: 'duty' | 'approval', next: boolean) => {
    if (prefsSaving || !online || !pushOn) return
    const before = prefsOverride
    const after = { ...prefs, [key]: next }
    setPrefsOverride(after)
    setPrefsSaving(true)
    void saveNotificationPrefs(profile.uid, after).then((result) => {
      setPrefsSaving(false)
      if (result.ok) toast(TS_PREFS)
      /* 실패 — 낙관적 반영을 되돌린다(T-03). 이전 덮개가 없으면 서버값으로 돌아간다. */
      else setPrefsOverride(before)
    })
  }

  /* T-05 — 캐시 무효화 + 재조회. `refresh()`는 부르지 않는다(§3.2와 같은 이유는
     아니지만, 여기서 역할 판정을 다시 돌릴 이유가 없다). */
  const handleRefresh = () => {
    if (refreshing || !online) return
    setRefreshing(true)
    refreshSessionCaches()
    void fetchDepartment(true).then((result) => {
      if (result.kind === 'ok') setAcademicYear(result.academicYear)
      setRefreshing(false)
      toast(TS_19)
    })
  }

  /**
   * 🔴 **두 경로가 여기서 갈린다**(§8.11.4 T-06 · T-07).
   * 부장이면 모달을 **열지 않고** 안내만 펼친다. 규칙(`selfWithdraw`)도 같은 판정을
   * 하지만(BR-56 · `SEC-9a`), 규칙만 믿으면 사용자는 「눌렀는데 아무 일도 없다」를 본다.
   */
  const handleWithdrawTap = () => {
    if (!online || withdrawing) return
    if (isHead) {
      setBlockedShown(true)
      return
    }
    setWithdrawOpen(true)
  }

  /**
   * T-07 — 확인 후. 🔴 **순서가 계약이다**: `withdrawAccount` → 토스트 → `signOut` → S1.
   *
   * 🔴 **`refresh()`를 부르지 않는다.** 프로필이 사라진 상태에서 역할 판정이 도는 순간
   * TS-12 `접근 권한이 없습니다`가 뜬다 — W-15B가 세 번 실패한 끝에 잡은 자리다
   * (`reports/W-15B.md` §4-2).
   *
   * 🔴 **`withdrawAccount`를 `await`하지 않는다**(`lib/account.ts` 주석 참조).
   */
  const handleWithdraw = () => {
    if (withdrawingRef.current) return
    withdrawingRef.current = true
    setWithdrawing(true)
    withdrawAccount({ uid: profile.uid, name: profile.name, role: profile.role })
    setWithdrawOpen(false)
    toast(TS_20)
    void signOut().then(() => navigate('/', { replace: true }))
  }

  const handleLogout = () => {
    setLogoutOpen(false)
    void signOut().then(() => navigate('/', { replace: true }))
  }

  const badgeClass = role === 'member' ? 'adm-badge set-badge-member' : `adm-badge adm-badge-${role}`

  return (
    <main data-screen="S10" aria-labelledby="scr-s10" className="set-main flex min-h-full flex-col">
      <div className="set-head">
        <h1 ref={titleRef} id="scr-s10" tabIndex={-1} className="adm-title">
          {TITLE}
        </h1>
        <span className={badgeClass}>{ROLE_LABEL[role] ?? role}</span>
      </div>

      <div className="adm-sections">
        {/* ① 내 계정 — T-01 스태거 0.06s(§8.11.4). */}
        <GlassCard radius={20} riseDelay={0} className="adm-card">
          <p className="adm-label">{SEC_ACCOUNT}</p>
          {/* 🔴 §8.11.3 #3 — 탭해도 편집 상태로 전환되지 않는다. `button`이지만
              역할은 「읽기 전용임을 알리는 것」뿐이라 이름에 그 사실을 담는다. */}
          <button
            type="button"
            className="set-acct"
            onClick={handleLockTap}
            aria-label={`${profile.name} · ${profile.email} · 변경할 수 없습니다`}
          >
            <span className="set-avatar" aria-hidden="true">
              {profile.name.slice(0, 1)}
            </span>
            <span className="set-acct-txt">
              <span className="set-acct-namerow">
                <span className="set-acct-name">{profile.name}</span>
                <LockIcon className={`set-lock${shakeLock ? ' set-lock-shake' : ''}`} />
              </span>
              <span className="set-acct-mail">{profile.email}</span>
            </span>
          </button>
          <div className="set-inforows">
            <div className="set-inforow">
              <span className="set-rowlabel">{ROW_ROLE}</span>
              <span className="set-rowval">{ROLE_LABEL[role] ?? role}</span>
            </div>
            <div className="set-inforow">
              <span className="set-rowlabel">{ROW_DEPT}</span>
              {/* 학년도 조회 전에는 부서 이름만 그린다 — `-`를 그리면 값이 있는 것처럼 보인다. */}
              <span className="set-rowval">
                자율생활부{academicYear !== null ? ` · ${academicYear}학년도` : ''}
              </span>
            </div>
          </div>
          <p className="set-note">{NOTE_READONLY}</p>
        </GlassCard>

        {/* ② 알림 */}
        <GlassCard radius={20} riseDelay={60} className="adm-card">
          <p className="adm-label">{SEC_NOTIFY}</p>
          <div className={`set-toggles${pushOn ? '' : ' set-toggles-locked'}`}>
            <div className="set-toggle">
              <span className="set-toggle-txt">
                <span className="set-toggle-title" id="set-nd">
                  {NOTIFY_DUTY}
                </span>
                <span className="set-toggle-sub">{NOTIFY_DUTY_SUB}</span>
              </span>
              <Switch
                id="set-sw-duty"
                checked={prefs.duty}
                onChange={(v) => handlePref('duty', v)}
                locked={!pushOn || !online || prefsSaving}
                describedById={pushOn ? 'set-nd' : 'set-notify-lock'}
              />
            </div>
            {showApproval && (
              <div className="set-toggle">
                <span className="set-toggle-txt">
                  <span className="set-toggle-title" id="set-na">
                    {NOTIFY_APPROVAL}
                  </span>
                  <span className="set-toggle-sub">{NOTIFY_APPROVAL_SUB}</span>
                </span>
                <Switch
                  id="set-sw-approval"
                  checked={prefs.approval}
                  onChange={(v) => handlePref('approval', v)}
                  locked={!pushOn || !online || prefsSaving}
                  describedById={pushOn ? 'set-na' : 'set-notify-lock'}
                />
              </div>
            )}
          </div>
          {/* §8.11.3 #5 정보 박스 — §8.11.5 Push 미지원 상태에서만. */}
          {!pushOn && (
            <p className="set-notify-lock" id="set-notify-lock">
              {NOTIFY_LOCKED}
            </p>
          )}
        </GlassCard>

        {/* ③ 앱 */}
        <GlassCard radius={20} riseDelay={120} className="adm-card">
          <p className="adm-label">{SEC_APP}</p>
          <div className="set-rows">
            <div className="set-row">
              <span className="set-rowname">{ROW_VERSION}</span>
              {/* GT-07 — `package.json`에서 빌드 시각에 주입된다(`vite.config.ts`). */}
              <span className="set-rowver">{__APP_VERSION__}</span>
            </div>
            <button
              type="button"
              className="set-row set-row-tap"
              onClick={() => !standalone && setA2hsOpen(true)}
              disabled={standalone}
            >
              <span className="set-rowname">{ROW_A2HS}</span>
              <Chip>{standalone ? CHIP_A2HS_DONE : CHIP_A2HS}</Chip>
            </button>
            <button
              type="button"
              className="set-row set-row-tap"
              onClick={handleRefresh}
              disabled={!online || refreshing}
            >
              <span className="set-rowname">{ROW_REFRESH}</span>
              {refreshing ? (
                <span className="set-spin" aria-hidden="true" />
              ) : (
                <ChevronRightIcon className="set-chev" />
              )}
            </button>
          </div>
        </GlassCard>

        {/* ④ 약관·정책 */}
        <GlassCard radius={20} riseDelay={180} className="adm-card">
          <p className="adm-label">{SEC_POLICY}</p>
          <div className="set-rows">
            {POLICY_ROWS.map((row) => (
              <button
                key={row.path}
                type="button"
                className="set-row set-row-tap"
                onClick={() => navigate(row.path)}
              >
                <span className="set-rowname">{row.label}</span>
                <ChevronRightIcon className="set-chev" />
              </button>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* 하단 — §8.11.2 「로그아웃 → 12px → 계정 탈퇴 → 6px → 힌트」. design `20a`·`20b`. */}
      <button type="button" className="set-logout" onClick={() => setLogoutOpen(true)}>
        {BTN_LOGOUT}
      </button>

      {/* 🔴 `disabled`가 아니다 — design `20b`가 눌리는 버튼으로 그린다(T-06).
          오프라인에서만 잠근다(§8.11.5). */}
      <button
        type="button"
        className="set-withdraw"
        onClick={handleWithdrawTap}
        disabled={!online || withdrawing}
        aria-expanded={isHead ? blockedShown : undefined}
        aria-controls={isHead ? 'set-withdraw-blocked' : undefined}
        aria-describedby={isHead && blockedShown ? 'set-withdraw-blocked' : undefined}
      >
        {BTN_WITHDRAW}
      </button>

      {/* T-06 문구 펼침 0.2s. 🔴 reduce에서 지속시간만 줄이고 **최종 상태는 같다**. */}
      {isHead && (
        <div className={`set-blockedwrap${blockedShown ? ' set-blockedwrap-open' : ''}`}>
          <p className="set-blocked" id="set-withdraw-blocked" role="status">
            {WITHDRAW_BLOCKED}
          </p>
        </div>
      )}

      <p className="set-hint">{HINT_WITHDRAW}</p>

      <div className="set-footer">
        <Footer variant="full" onNavigate={(path) => navigate(path)} />
      </div>

      <ConfirmModal
        open={logoutOpen}
        title={MD06_TITLE}
        body={MD06_BODY}
        confirmLabel={MD06_CONFIRM}
        onConfirm={handleLogout}
        onCancel={() => setLogoutOpen(false)}
      />

      {/* 🔴 MD-07만 위험색이다(§8.10.4). design `20c`. */}
      <ConfirmModal
        open={withdrawOpen}
        title={MD07_TITLE}
        body={MD07_BODY}
        confirmLabel={MD07_CONFIRM}
        destructive
        loading={withdrawing}
        onConfirm={handleWithdraw}
        onCancel={() => setWithdrawOpen(false)}
      />

      {/* T-04 — §18.3 설치 안내 3단계. */}
      <BottomSheet open={a2hsOpen} onClose={() => setA2hsOpen(false)} title={A2HS_TITLE}>
        <ol className="set-a2hs">
          {A2HS_STEPS.map((step, i) => (
            <li key={step} className="set-a2hs-step">
              <span className="set-a2hs-no" aria-hidden="true">
                {i + 1}
              </span>
              <span className="set-a2hs-txt">{step}</span>
            </li>
          ))}
        </ol>
      </BottomSheet>
    </main>
  )
}
