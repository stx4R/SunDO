import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Field, type FieldHandle } from '../components/Field'
import { GlassCard } from '../components/GlassCard'
import { PrimaryButton } from '../components/PrimaryButton'
import { useAuth } from '../contexts/AuthProvider'
import { auth } from '../lib/firebase'
import { cn } from '../lib/cn'
import { formatInviteCode, INVITE_CODE_LENGTH, isInviteCodeComplete } from '../lib/inviteCode'
import { splitSentences } from '../lib/sentences'
import {
  countRecentSignupAttempts,
  isSignupBlocked,
  lookupInviteCode,
  newRequestId,
  submitSignup,
} from '../lib/signup'
import { useOnline } from '../lib/useOnline'

/**
 * S2 가입 신청 — `/signup` · design `13a`~`13e`(R-02 적용본) · `20d`·`20e` · PRD §8.2.
 *
 * **이 화면은 이동시키지 않는다.** 신청이 접수되면 `status`가 `pending`이 되고
 * `RequireAuth`가 `/pending`으로 옮긴다(T-05). `navigate()`를 쓰지 마라 —
 * 뒤로 버튼·계정 전환도 `signOut()`이지 이동이 아니다(T-07·T-08 · BR-30b).
 *
 * 화면 전환 `blurIn`은 `ScreenTransition`이 이미 감싸고 있다. 여기서 다시 걸지 마라.
 * Firestore 호출은 전부 `src/lib/signup.ts`에 있다. 여기서 직접 부르지 마라.
 *
 * 진입 상태는 3가지다 — `noProfile`(신규) · `withdrawn`(재가입) · `rejected`(재신청).
 * 세 상태가 같은 코드 경로를 타고, 갈리는 것은 **배너 유무**와 **쓰기 연산**뿐이다.
 */

/* §8.2.3 · §8.10.3 확정 문안. 한 글자도 바꾸지 마라. */
const CODE_REQUIRED = '가입 코드를 입력해 주세요'
/**
 * 🔴 **E-1009(신설 · W-22B 결정 3) — BR-30 · §11.5.**
 * E-3002(`잠시 후 다시 시도해 주세요 (시간당 5회 제한)`)의 형태를 본떠 **한도를 문구에 드러낸다.**
 * 🔴 **남은 시간을 표시하지 않는다** — §11.4에 그 형태의 문구가 하나도 없다.
 */
const E_1009 = '가입 신청은 24시간에 3회까지 가능합니다'
const CODE_FORMAT = '코드 형식이 올바르지 않습니다 (예: DJSN-2691)'
const E_1001 = '존재하지 않는 코드입니다'
const E_1002 = '만료된 코드입니다. 부장에게 새 코드를 요청해 주세요'
const NAME_REQUIRED = '이름을 입력해 주세요'
const NAME_LENGTH = '이름은 2자 이상 10자 이하로 입력해 주세요'
const NAME_CHARSET = '이름에는 한글 또는 영문만 사용할 수 있습니다'
const ER_14 = 'Google 계정 이름을 확인할 수 없습니다. 이름을 직접 입력해 주세요'
const ER_01 = '네트워크에 연결할 수 없습니다'
const T_06 = '가입 신청에 실패했습니다. 잠시 후 다시 시도해 주세요'
const EC_39 = '이전에 탈퇴한 계정입니다. 다시 신청하면 승인 후 이용할 수 있습니다'

const TITLE = '가입 신청'
const SUBTITLE = '자율생활부 코드가 있어야 신청할 수 있습니다'
const CHIP = '학교 계정 확인됨'
const IDENTITY_NOTE = '이름과 학교 이메일은 Google 계정 정보이며 변경할 수 없습니다'
const NAME_UNKNOWN = '이름 확인 필요'
const NAME_LABEL = '이름'
const CODE_LABEL = '가입 코드'
const CODE_PLACEHOLDER = 'DJSN-2691'
const CODE_HINT = '부장에게 받은 8자리 코드를 입력해 주세요'
/* §8.2.5 오프라인 행. design에는 없는 상태다(보고서 §5). */
const OFFLINE_HINT = '오프라인 상태에서는 가입할 수 없습니다'
const SUBMIT = '가입 신청'
const SWITCH_ACCOUNT = '다른 계정으로 로그인'
const PRIVACY_NOTE = '가입 시 이름과 학교 이메일이 자율생활부 운영에 사용됩니다'
const BACK_LABEL = '이전 화면으로'

/* 🔴 **W-18 신규 — §8.10 사전에 없는 문구다.** 약관 동의 시점이 규격 어디에도 없다는
   것을 확인하고(S1·S2 코드 0줄 · PRD §8.2 조항 없음) 사용자 결정으로 신설했다.
   W-18 지시서 §0.5·§3.6이 「만들지 마라」로 적은 범위라 보고서 §4에 이탈로 남긴다.
   경로 2개는 `Footer.tsx`·`Settings.tsx`가 이미 쓰는 3경로 중 둘이다. */
const AGREE_PRIVACY = '개인정보 처리방침'
const AGREE_TERMS = '서비스 이용약관'
const AGREE_JOIN = '과 '
const AGREE_TAIL = '에 동의합니다'
const AGREE_PATH_PRIVACY = '/policy/privacy'
const AGREE_PATH_TERMS = '/policy/terms'
/**
 * 🔴 **W-21 P-11 ② — §8.10 사전에 없는 신규 문구다.** 사용자가 제시한 문안 그대로 쓴다.
 * 코드 부여(`ER-xx`)는 st4R로 올렸다(보고서 §6 ④).
 * 🔴 **사용자 원문은 `정책을 전부 읽고 체크박스를 클릭해주세요.`였다.** 사전의 인라인 에러는
 * 전부 **마침표 없이** 끝나고 **`해 주세요`로 띄어 쓰므로**(`가입 코드를 입력해 주세요` ·
 * `이름을 직접 입력해 주세요` · `부장에게 문의해 주세요`), 같은 자리에 뜨는 문구끼리
 * 결이 갈리지 않도록 **사용자 확인을 받아** 두 곳을 맞췄다(W-21 §9 확인 2).
 * 임의 수정이 아니다 — 물어보고 고친 것이다.
 */
const AGREE_REQUIRED = '정책을 전부 읽고 체크박스를 클릭해 주세요'

/* 정책 화면으로 이동하면 이 화면이 언마운트돼 입력값이 사라진다. **그 한 번의 왕복만**
   건너게 하는 임시 보관이고 읽는 즉시 지운다 — 새로고침 복원 기능이 아니다.
   `sessionStorage`는 Safari 개인정보 보호 모드 등에서 접근 자체가 throw하므로
   `useLastActiveAt`(EC-23 계열)과 같은 방식으로 조용히 포기한다. */
const DRAFT_KEY = 'sundo.signupDraft'

interface Draft {
  code: string
  name: string
  agreed: boolean
}

function takeDraft(): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY)
    window.sessionStorage.removeItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}

function stashDraft(draft: Draft): void {
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    /* 보관에 실패해도 이동은 막지 않는다. 돌아와서 다시 입력하면 된다. */
  }
}

/** §8.2.3 — 한글·영문·공백만, 트림 후 2~10자. */
const NAME_CHARS = /^[가-힣a-zA-Z\s]+$/
const NAME_MIN = 2
const NAME_MAX = 10

export default function Signup() {
  const { status, profile, parsed, refresh, signOut } = useAuth()
  const online = useOnline()
  const navigate = useNavigate()

  /* 🔴 초기값을 함수로 준다. 정책 화면을 다녀온 직후 한 번만 값이 들어오고,
     그 뒤에는 `sessionStorage`가 이미 비어 있어 `null`이다. */
  const [draft] = useState(takeDraft)
  const [code, setCode] = useState(() => draft?.code ?? '')
  const [name, setName] = useState(() => draft?.name ?? '')
  /* W-18 신규 — 동의 확인.
     🔴 **W-19에서 Firestore에 남기기 시작했다**(결정 3). `lib/signup.ts`의 `agreement()`가
     `agreedAt`·`agreedPolicyVersion`을 배치에 넣는다.

     🔴 **W-21 P-11 ② — `disabled`에서 `agreed`를 뺐다.** W-18의 경고(「빼는 순간 동의 없이
     동의 기록이 남는다」)는 여전히 유효하므로, 그 자리를 **`handleSubmit`의 첫 줄 가드**가
     대신 받는다. 버튼이 활성이어야 탭을 받아 안내를 띄울 수 있고(사용자 요구),
     쓰기 경로는 가드가 잠근다. **가드를 지우면 W-18의 경고가 그대로 실현된다.** */
  const [agreed, setAgreed] = useState(() => draft?.agreed ?? false)
  /* 미동의로 제출을 시도했는가. 체크하는 순간 사라진다. */
  const [agreeError, setAgreeError] = useState(false)
  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  /* 🔴 **BR-30(§11.5) — 계정당 24시간 3회.** `unknown`은 여기 들어오지 않는다:
     `isSignupBlocked`가 「셀 수 없었다」를 **통과**로 떨어뜨린다(§3.5). */
  const [rateLimited, setRateLimited] = useState(false)

  const titleRef = useRef<HTMLHeadingElement>(null)
  const codeRef = useRef<FieldHandle>(null)
  const nameRef = useRef<FieldHandle>(null)

  /* 서버 판정을 `Field`의 `validate`로 흘려 보내는 통로. 값이 바뀌면 즉시 무효다. */
  const serverErrorRef = useRef<string | null>(null)
  /* 조회를 통과한 값. 같은 값으로 blur가 반복될 때 서버를 다시 부르지 않는다. */
  const verifiedRef = useRef<string | null>(null)
  /* 늦게 끝난 조회가 새 값의 판정을 덮지 않게 한다. */
  const lookupSeq = useRef(0)
  /* §11.1 멱등성 — 제출 1회에 1개. **재시도에도 그대로 재사용한다.** */
  const requestIdRef = useRef<string | null>(null)

  /* W-06 §5-4 확정 규칙 — 부수효과 버튼은 상태·DOM `disabled`만으로 연속 탭을
     막지 못한다. 같은 태스크 안의 5회 탭은 전부 리렌더 전의 옛 값을 본다. */
  const submitLatch = useRef(false)
  const signOutLatch = useRef(false)
  /* 🔴 **진입 카운트를 uid당 1회로 못 박는다.** React StrictMode는 개발에서 이펙트를
     두 번 실행하고, 그대로 두면 질의가 2회로 보여 §3.4의 「진입 1회」를 못 잰다. */
  const countedUidRef = useRef<string | null>(null)

  /* §15.3 — 진입 시 제목에 포커스. */
  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const authUser = auth.currentUser
  const uid = profile?.uid ?? authUser?.uid ?? ''
  const email = profile?.email ?? authUser?.email ?? ''
  const displayNameRaw = authUser?.displayName ?? profile?.displayNameRaw ?? ''
  const parsedName = parsed?.ok ? parsed.name : null

  /* 이미 확정된 이름이 있으면 그것이 정본이다(재가입·재신청).
     §8.2.3 — 파싱 실패로 확정된 이름은 **본인이 바꿀 수 없다.** 부장·Dev만 수정한다.
     그래서 이름 입력은 확정된 이름이 아예 없을 때만 연다(DR-11 · DR-13). */
  const storedName = profile?.name ?? null
  const needsName = !parsedName && !storedName
  const resolvedName = storedName ?? parsedName ?? name.trim()

  /* 재가입 배너는 `withdrawn`에만 있다. `rejected`에는 §8.2.5에 행이 없어
     문구를 새로 만들지 않았다(보고서 §5). */
  const withdrawn = status === 'withdrawn'
  const reactivate = status === 'withdrawn' || status === 'rejected'

  /**
   * 🔴 **§3.4 — 세는 시점 ① 진입 시 1회.**
   * 진입 시만 세면 화면을 열어 둔 채 3회를 채울 수 있고, 제출 직전만 세면
   * **다 입력한 뒤에야 막혀** §8.2의 동선이 깨진다. 그래서 둘 다 센다.
   *
   * 🔴 **오프라인에서는 세지 않는다.** S2는 이미 오프라인 제출을 막고 있고(W-08 §5-7),
   * 캐시만 보고 「3회 미만」이라고 답하면 그 값이 거짓일 수 있다. **새 분기를 만들지 않았다.**
   */
  useEffect(() => {
    if (!uid || !online) return
    if (countedUidRef.current === uid) return
    countedUidRef.current = uid
    let alive = true
    void (async () => {
      const attempts = await countRecentSignupAttempts(uid)
      if (alive) setRateLimited(isSignupBlocked(attempts))
    })()
    return () => {
      alive = false
    }
  }, [uid, online])

  const codeFilled = code.length === INVITE_CODE_LENGTH
  /**
   * 🔴 **W-21 P-11 ② — `agreed`가 여기서 빠졌다.**
   * 오프라인·코드 미입력은 **그대로 비활성**이다 — 두 경로에는 각각의 안내가 이미 있다
   * (오프라인은 `OFFLINE_HINT` 줄, 코드는 `Field`의 인라인 에러).
   * 미동의만 「활성 + 탭하면 안내」로 바뀐다. 동의 없는 제출은 `handleSubmit`이 잠근다.
   */
  /* 🔴 **BR-30은 「비활성」이다. 부재가 아니다.**
     W-15A §4-4의 「읽기 전용 = 버튼 부재」와 **반대**인 이유 — 거기는 **권한이 없어
     영원히 못 하는 것**이고 여기는 **지금만 못 하는 것**이다. 문구가 그 이유를 말한다. */
  const disabled = !codeFilled || !online || rateLimited

  const validateCode = (v: string): string | null => {
    if (!v) return CODE_REQUIRED
    if (!isInviteCodeComplete(v)) return CODE_FORMAT
    /* 서버 판정(E-1001·E-1002)은 조회가 끝난 뒤 이 통로로 들어온다. */
    return serverErrorRef.current
  }

  const validateName = (v: string): string | null => {
    const trimmed = v.trim()
    if (!trimmed) return NAME_REQUIRED
    if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) return NAME_LENGTH
    if (!NAME_CHARS.test(trimmed)) return NAME_CHARSET
    return null
  }

  const handleCodeChange = (v: string) => {
    setCode(v)
    /* 값이 바뀌면 이전 서버 판정은 전부 무효다. `Field`가 이 직후 재검사를
       돌리므로(에러 상태일 때) **여기서 동기적으로 비워야** 옛 문구가 다시 뜨지 않는다. */
    serverErrorRef.current = null
    verifiedRef.current = null
    lookupSeq.current += 1
    if (checking) setChecking(false)
  }

  /** 조회는 blur와 제출 두 곳에서만 돈다. 입력 중에는 하지 않는다(§5.2). */
  const runLookup = async (value: string) => {
    const seq = ++lookupSeq.current
    setChecking(true)
    const result = await lookupInviteCode(value)
    if (seq !== lookupSeq.current) return
    setChecking(false)

    if (result.kind === 'ok') {
      verifiedRef.current = value
      return
    }
    if (result.kind === 'failed') {
      /* 🔴 조회 실패는 "없는 코드"가 아니다. 인라인 에러가 아니라 상단 배너로 보내고
         코드 필드는 **검증 이전 상태**로 되돌린다 — 정상 코드를 가진 사용자에게
         존재하지 않는다고 말하면 안 된다. */
      setBanner(ER_01)
      codeRef.current?.reset()
      return
    }
    serverErrorRef.current = result.kind === 'missing' ? E_1001 : E_1002
    codeRef.current?.validate()
  }

  /* T-03 — `Field`에는 `onBlur` prop이 없다. React의 `onBlur`는 `focusout`이라
     래퍼로 위임된다. 필드가 1개뿐이라 대상이 갈릴 여지도 없다. */
  const handleCodeBlur = () => {
    if (submitting) return
    if (!isInviteCodeComplete(code)) return
    if (verifiedRef.current === code || serverErrorRef.current) return
    void runLookup(code)
  }

  /* T-07 · T-08 — 둘 다 `signOut()`이다. `navigate()`·`history.back()`을 쓰지 마라.
     빗장을 공유한다: 로그아웃이 이미 시작됐으면 다른 경로도 다시 부를 이유가 없다. */
  const handleSignOut = () => {
    if (signOutLatch.current) return
    signOutLatch.current = true
    void signOut()
  }

  /* 동의 줄의 두 링크. 화면을 떠나기 전에 입력값을 담아 두고, 돌아오면
     `takeDraft()`가 한 번만 꺼내 되돌린다. `navigate`이지 `signOut`이 아니다 —
     정책 3종은 가드 바깥이라(EC-44) 인증 상태를 잃지 않고 다녀올 수 있다. */
  const openPolicy = (path: string) => {
    if (submitting) return
    stashDraft({ code, name, agreed })
    void navigate(path)
  }

  const handleSubmit = () => {
    if (submitLatch.current || submitting) return
    if (disabled || !uid) return
    /* 🔴 **W-21 P-11 ② — 동의 없는 제출을 막는 유일한 빗장이다.**
       `disabled`에서 `agreed`가 빠졌으므로(위 주석) 쓰기 경로의 잠금이 여기로 내려왔다.
       **`submitLatch`보다 먼저 선다** — 빗장을 걸고 돌아가면 다음 탭이 통째로 죽는다. */
    if (!agreed) {
      setAgreeError(true)
      return
    }
    submitLatch.current = true
    setSubmitting(true)
    setBanner(null)
    void (async () => {
      try {
        /* 형식·이름은 서버를 부르기 전에 끝낸다. 통과하지 못하면 조회도 하지 않는다. */
        if (!codeRef.current?.validate()) return
        if (needsName && !nameRef.current?.validate()) return

        /* 🔴 **§3.4 — 세는 시점 ② 제출 직전 1회.**
           화면을 열어 둔 채 다른 탭에서 3회를 채웠을 수 있다. 진입 시의 값을 믿지 않는다.
           🔴 **셀 수 없으면(`unknown`) 막지 않는다** — `isSignupBlocked`가 그 계약이다. */
        if (isSignupBlocked(await countRecentSignupAttempts(uid))) {
          setRateLimited(true)
          return
        }

        /* ① EC-07 — 입력 도중 만료될 수 있다. **캐시된 결과를 믿지 않는다.** */
        const lookup = await lookupInviteCode(code)
        if (lookup.kind === 'failed') {
          setBanner(ER_01)
          codeRef.current?.reset()
          return
        }
        if (lookup.kind !== 'ok') {
          serverErrorRef.current = lookup.kind === 'missing' ? E_1001 : E_1002
          verifiedRef.current = null
          codeRef.current?.validate()
          return
        }
        verifiedRef.current = code

        /* ② OP-01 배치 2건. 재시도해도 `approvalRequests` 문서 ID는 그대로다. */
        if (!requestIdRef.current) requestIdRef.current = newRequestId(uid)
        const result = await submitSignup({
          uid,
          email,
          name: resolvedName,
          nameSource: needsName ? 'manual' : (profile?.nameSource ?? 'parsed'),
          displayNameRaw,
          parsed,
          codeId: code,
          requestId: requestIdRef.current,
          reactivate,
        })
        if (!result.ok) {
          setBanner(T_06)
          return
        }

        /* ③ 판정만 갱신한다. 화면 이동은 라우터의 일이다(T-05). */
        await refresh()
      } finally {
        submitLatch.current = false
        setSubmitting(false)
      }
    })()
  }

  return (
    <main data-screen="S2" aria-labelledby="scr-s2" className="flex min-h-full flex-col">
      <div className={cn('flex items-center', submitting && 'opacity-60')}>
        <button type="button" className="back" aria-label={BACK_LABEL} onClick={handleSignOut}>
          {/* design 13a 원문 — 왼쪽 화살표 13px. */}
          <span>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <path
                d="M8.4 2.4L3.7 6.5L8.4 10.6"
                stroke="#1F5138"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>

        <div className="ml-3">
          <h1
            ref={titleRef}
            id="scr-s2"
            tabIndex={-1}
            className="text-h2 font-bold text-sundo-900 outline-none"
          >
            {TITLE}
          </h1>
          <p className="mt-1 text-micro font-medium text-sundo-ink-70">{SUBTITLE}</p>
        </div>
      </div>

      {/* EC-39 — 신원 카드 **위**다(§8.2.5). `rejected`에는 배너가 없다. */}
      {withdrawn && (
        <div className="s2-rejoin mt-6" role="alert" aria-live="assertive">
          <InfoIcon />
          {/* 🔴 W-21 P-8 ② — 안내 박스도 마침표 기준으로 나눈다. 지시서가 든 예가 이 문구다. */}
          <span className="text-label font-medium leading-[1.45] text-sundo-800">
            {splitSentences(EC_39).map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </span>
        </div>
      )}

      <GlassCard
        radius={20}
        riseDelay={0}
        className={cn(
          'p-[16px_18px]',
          withdrawn ? 'mt-3' : 'mt-6',
          submitting && 'pointer-events-none opacity-60',
        )}
      >
        <div className="flex items-start gap-3">
          {/* NG-13 — Google 프로필 사진을 쓰지 않는다. 그 조항은 그대로다.
              🔴 **W-21 P-7(결정 4)** — 이름 첫 글자 대신 **앱이 번들에 넣어 배포하는 정적 이미지**를
              쓴다. 사용자에게서 사진을 받지 않으므로 §14.1 「프로필 사진을 수집하지 않습니다」와
              어긋나지 않는다(보고서 §3 P-7의 처리방침 대조). */}
          <span className="s2-avatar" aria-hidden="true">
            <img src="/DSHS.png" alt="" className="h-full w-full object-cover" />
          </span>

          <div className="min-w-0 flex-1 pt-[3px]">
            {needsName ? (
              <div className="text-subtitle font-medium text-sundo-ink-45">{NAME_UNKNOWN}</div>
            ) : (
              <div className="text-button font-bold text-sundo-900">{resolvedName}</div>
            )}
            <div className="mt-0.5 truncate text-label font-medium text-sundo-ink-70">{email}</div>
          </div>

          {/* 터치 대상이 아니다. 텍스트로 읽히게 둔다. */}
          <span className="s2-chip">
            <CheckIcon />
            <span className="text-micro font-bold text-sundo-800">{CHIP}</span>
          </span>
        </div>

        <div className="mt-[14px] h-px bg-sundo-divider" />
        <p className="mt-2.5 text-micro font-medium text-sundo-ink-70">{IDENTITY_NOTE}</p>
      </GlassCard>

      {/* EC-32 · DR-11 — design `20d`. 안내와 입력 모두 **신원 카드 아래**이고
          입력 카드 바깥이다(§8.2.3 원문 "신원 카드 아래에 이름 입력 필드 1개"). */}
      {needsName && (
        <>
          <div className={cn('s2-note mt-2.5', submitting && 'opacity-60')} role="alert">
            <AlertIcon />
            <span className="text-caption font-medium leading-[1.45] text-sundo-danger">
              {ER_14}
            </span>
          </div>
          <div className={cn('mt-2.5', submitting && 'pointer-events-none opacity-60')}>
            <Field
              ref={nameRef}
              label={NAME_LABEL}
              value={name}
              onChange={setName}
              validate={validateName}
              maxLength={NAME_MAX}
            />
          </div>
        </>
      )}

      <GlassCard
        radius={24}
        riseDelay={80}
        className={cn(
          'mt-[14px] p-[22px_20px]',
          submitting && 's2-busy pointer-events-none opacity-60',
        )}
      >
        {/* T-06 제출 실패 · ER-01 조회 실패. 입력 카드 내부 상단이다(§4). */}
        {banner && (
          <div className="s2-banner mb-[14px]" role="alert" aria-live="assertive">
            <AlertIcon />
            <span className="text-label font-bold text-sundo-danger">{banner}</span>
          </div>
        )}

        <div className="s2-code" onBlur={handleCodeBlur}>
          <Field
            ref={codeRef}
            label={CODE_LABEL}
            value={code}
            onChange={handleCodeChange}
            transform={formatInviteCode}
            validate={validateCode}
            checking={checking}
            placeholder={CODE_PLACEHOLDER}
          />
        </div>

        <p className="mt-1.5 text-micro font-medium text-sundo-ink-70">
          {online ? CODE_HINT : OFFLINE_HINT}
        </p>

        {/* 🔴 W-18 신규 — 약관·처리방침 동의 확인.
            네이티브 `input[type=checkbox]`를 쓰지 않는다(DS-06). `Switch`가
            `role="switch"`로 만들어진 것과 같은 형태로 `role="checkbox"`를 쓴다.
            라벨 안에 링크가 있어 라벨 자체를 버튼에 넣을 수 없으므로
            `aria-labelledby`로 이름을 잇는다 — 낭독 결과는 한 문장 그대로다. */}
        <div className="s2-agree">
          <button
            type="button"
            role="checkbox"
            aria-checked={agreed}
            aria-labelledby="s2-agree-label"
            /* 체크하는 순간 안내가 사라진다 — 해소된 에러를 남겨 두지 않는다. */
            onClick={() =>
              setAgreed((v) => {
                if (!v) setAgreeError(false)
                return !v
              })
            }
            className="s2-cb"
          >
            <span className={cn('s2-cb-box', agreed && 's2-cb-on')}>
              {agreed && <CheckIcon />}
            </span>
          </button>

          <p id="s2-agree-label" className="s2-agree-txt">
            <button type="button" className="s2-agree-a" onClick={() => openPolicy(AGREE_PATH_PRIVACY)}>
              {AGREE_PRIVACY}
            </button>
            {AGREE_JOIN}
            <button type="button" className="s2-agree-a" onClick={() => openPolicy(AGREE_PATH_TERMS)}>
              {AGREE_TERMS}
            </button>
            {AGREE_TAIL}
          </p>
        </div>

        {/* 🔴 W-21 P-11 ② — 「가입 코드 에러와 같은 형태」가 요구다(사용자).
            `Field`가 쓰는 `.ff-msgwrap`/`.ff-msg`를 그대로 재사용한다 — 새 표면을 만들지 않는다.
            라이브 영역이 문구보다 먼저 존재해야 낭독되므로 노드는 **항상 마운트**한다
            (`Field`와 같은 규율). 0fr→1fr 그리드라 닫힌 상태의 높이는 0이다. */}
        <div role="alert" className={cn('ff-msgwrap', agreeError && 'ff-msgwrap-open')}>
          <span className="ff-msg">{agreeError ? AGREE_REQUIRED : ''}</span>
        </div>

        {/* 🔴 **E-1009 인라인**(BR-30 · §11.5). 동의 안내와 **같은 표면**을 쓴다 —
            `Field`의 `.ff-msgwrap`/`.ff-msg`이고 새 표면을 만들지 않았다.
            라이브 영역은 문구보다 먼저 존재해야 낭독되므로 노드는 **항상 마운트**한다.
            🔴 **남은 시간을 계산해 보여 주지 않는다**(결정 3). */}
        <div role="alert" className={cn('ff-msgwrap', rateLimited && 'ff-msgwrap-open')}>
          <span className="ff-msg">{rateLimited ? E_1009 : ''}</span>
        </div>

        <PrimaryButton
          label={SUBMIT}
          onClick={handleSubmit}
          loading={submitting}
          disabled={disabled}
          className="mt-3"
        />
      </GlassCard>

      <button
        type="button"
        onClick={handleSignOut}
        className={cn(
          'mt-4 flex min-h-[44px] items-center justify-center',
          submitting && 'pointer-events-none opacity-60',
        )}
      >
        <span className="text-subtitle font-bold text-sundo-700">{SWITCH_ACCOUNT}</span>
      </button>

      <p className="mt-2 text-center text-micro font-medium text-sundo-ink-70">{PRIVACY_NOTE}</p>
    </main>
  )
}

/** design 13a 원문 — 신원 칩의 체크 11px. */
function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2.4 6.3l2.3 2.3 4.9-5"
        stroke="#1F5138"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** design 20e 원문 — 재가입 배너의 안내 아이콘 14px. */
function InfoIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className="mt-[0.5px] flex-none"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="5.6" stroke="#1F5138" strokeWidth="1.9" />
      <path d="M7 6.3v3.4" stroke="#1F5138" strokeWidth="1.9" strokeLinecap="round" />
      <circle cx="7" cy="4.4" r="0.95" fill="#1F5138" />
    </svg>
  )
}

/** design 20d 원문 — ER-14·배너의 경고 아이콘 13px. */
function AlertIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 14 14"
      fill="none"
      className="mt-[1.5px] flex-none"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="5.6" stroke="#C0392B" strokeWidth="1.9" />
      <path d="M7 6.3v3.4" stroke="#C0392B" strokeWidth="1.9" strokeLinecap="round" />
      <circle cx="7" cy="4.4" r="0.95" fill="#C0392B" />
    </svg>
  )
}
