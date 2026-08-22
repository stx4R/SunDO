import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react'
import { cn } from '../lib/cn'

export interface FieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  /**
   * 입력 중 값을 **변형**한다(대문자화·구분자 자동 삽입 등). 순수 함수를 넘겨라.
   *
   * 제어 컴포넌트에서 값을 바꿔 다시 내려보내면 브라우저가 캐럿을 문자열 끝으로
   * 민다 — 중간을 고치던 사용자는 커서가 튀는 것을 본다. 그래서 변형 결과와 함께
   * **새 캐럿 위치**를 돌려받아 `Field`가 직접 복원한다(§7.3 · W-08 §2.2).
   * 값 변형이 필요한 입력은 앞으로도 나오므로(S6 기타 사유 · S9 검색) 화면마다
   * `input` 요소를 따로 만지지 않도록 여기서 한 번에 처리한다.
   */
  transform?: (raw: string, caret: number) => { value: string; caret: number }
  /** null = 통과, string = 에러 문구. 주지 않으면 성공 상태가 없다. */
  validate?: (v: string) => string | null
  /** 서버 확인 중 → 상태 6 */
  checking?: boolean
  /** → 상태 7 */
  readOnly?: boolean
  /** 전체 투명도 0.6 */
  submitting?: boolean
  maxLength?: number
  inputMode?: 'text' | 'numeric' | 'tel'
  /** 포커스 중에만 노출된다. */
  placeholder?: string
  /** 있으면 좌측 기준선 44px */
  leadingIcon?: ReactNode
  /**
   * 우측 안쪽 슬롯(`.ff-end`)에서 상태 아이콘 **앞**에 놓이는 부가 표시.
   * S6 기타 사유의 글자 수 카운터가 첫 사용처다(design `17c`·`17d` — 카운터와
   * 아이콘이 같은 `right:16px` 묶음 안에서 `gap:8px`로 나란히 선다).
   *
   * **문구·색·`aria-live`는 호출부가 소유한다.** 임계값(18자)이 필드 규격이 아니라
   * 화면 규격이라서다(§8.6.2 #7 · §15.3). `Field`에는 새 로직이 들어가지 않는다.
   */
  counter?: ReactNode
  id?: string
  ref?: Ref<FieldHandle>
}

export interface FieldHandle {
  /** 제출 시 폼이 호출한다. */
  validate: () => boolean
  focus: () => void
  /**
   * 성공·실패 표시를 지우고 **검증 이전 상태**로 되돌린다. 값은 건드리지 않는다.
   *
   * 서버 조회가 **실패**했을 때 쓴다 — 통과도 실패도 아닌 "판정 없음"을 표시할
   * 방법이 필요하다. 조회 실패를 실패 판정으로 그리면 정상 값에 에러가 붙고,
   * 그대로 두면 blur가 켜 둔 성공 체크가 거짓말이 된다(W-08 §3.1).
   */
  reset: () => void
}

/* design/index.html 원문 SVG. 전부 장식이므로 aria-hidden이다(§15.3). */
function CheckIcon() {
  return (
    <svg className="ff-check" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="var(--color-sundo-700)" />
      <path
        d="M5.8 10.2l2.7 2.7 5.4-5.4"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="var(--color-sundo-danger)" />
      <path d="M10 5.6v5.2" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <circle cx="10" cy="14.1" r="1.1" fill="#fff" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg className="ff-lock" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect
        x="2.9"
        y="6.1"
        width="8.2"
        height="5.6"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.9"
      />
      <path
        d="M4.8 6.1V4.6a2.2 2.2 0 014.4 0v1.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * PRD §7.3 「입력 필드 v2」. 전 화면의 텍스트 입력은 예외 없이 이 컴포넌트만 쓴다.
 * 검증 타이밍(blur 1차 · 에러 후 즉시 재검사 · 제출 시 ref)을 컴포넌트가 소유한다.
 */
export function Field({
  label,
  value,
  onChange,
  transform,
  validate,
  checking = false,
  readOnly = false,
  submitting = false,
  maxLength,
  inputMode,
  placeholder,
  leadingIcon,
  counter,
  id,
  ref,
}: FieldProps) {
  const autoId = useId()
  const inputId = id ?? `ff-${autoId}`
  const msgId = `${inputId}-msg`
  const roId = `${inputId}-ro`

  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  /* shake는 에러당 1회만 재생한다. 같은 에러가 다시 확정되면 올리지 않는다. */
  const [errorSeq, setErrorSeq] = useState(0)

  const errorRef = useRef<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const shakeRef = useRef<HTMLDivElement>(null)
  /* 변형이 돌아간 입력에서만 채워진다. 복원 후 즉시 비운다. */
  const caretRef = useRef<number | null>(null)

  /* allowSuccess는 blur에서만 켠다. 값이 바뀔 때마다 도는 재검사에서 켜면 타이핑 도중
     성공 체크가 떠서 §5.5(blur 후 통과 시 표시)를 어긴다.
     ref.validate()(제출)도 켜지 않는다 — 제출 시점의 주인공은 통과가 아니라 에러다
     (W-03B 지시서 §1). 이미 켜져 있던 성공은 유지된다. */
  const runValidate = useCallback(
    (v: string, allowSuccess = false): boolean => {
      if (!validate) return true
      const msg = validate(v)
      if (msg) {
        if (errorRef.current !== msg) setErrorSeq((s) => s + 1)
        errorRef.current = msg
        setError(msg)
        setOk(false)
        return false
      }
      errorRef.current = null
      setError(null)
      /* 켜기만 한다. blur로 이미 성공한 필드를 ref.validate()가 끄면 안 된다.
         해제는 값이 바뀔 때 handleChange가 담당한다. */
      setOk((prev) => prev || allowSuccess)
      return true
    },
    [validate],
  )

  useImperativeHandle(
    ref,
    () => ({
      validate: () => runValidate(value),
      focus: () => inputRef.current?.focus(),
      reset: () => {
        errorRef.current = null
        setError(null)
        setOk(false)
      },
    }),
    [runValidate, value],
  )

  /* 캐럿 복원. 그리기 전에 끝나야 커서가 한 프레임 튀지 않으므로 layout 효과다.
     의존성 배열이 없는 것이 의도다 — 변형 결과가 직전 값과 같으면 React가
     리렌더를 건너뛸 수 있고, 그때는 아래 `el.value` 되돌리기가 유일한 복구 경로다. */
  useLayoutEffect(() => {
    const caret = caretRef.current
    if (caret === null) return
    caretRef.current = null
    const el = inputRef.current
    if (!el) return
    /* 버려진 입력(9자 초과 등)은 상태가 그대로라 DOM에만 원문이 남는다. */
    if (el.value !== value) el.value = value
    el.setSelectionRange(caret, caret)
  })

  /* CSS 애니메이션 재시작. className은 React가 관리하지 않는 전용 래퍼에 붙인다. */
  useEffect(() => {
    if (errorSeq === 0) return
    const el = shakeRef.current
    if (!el) return
    el.classList.remove('ff-shake')
    void el.offsetWidth
    el.classList.add('ff-shake')
  }, [errorSeq])

  const handleChange = (raw: string, caret: number) => {
    let v = raw
    if (transform) {
      const next = transform(raw, caret)
      v = next.value
      caretRef.current = next.caret
    }
    onChange(v)
    /* 성공은 "blur 후 통과" 상태다. 값이 바뀌면 해제하고 다음 blur에서 다시 판단한다. */
    if (ok) setOk(false)
    /* 한 번 에러가 뜬 필드는 값이 바뀔 때마다 즉시 재검사한다(§7.3 검증 시점). */
    if (errorRef.current !== null) runValidate(v)
  }

  const describedBy =
    [error ? msgId : null, readOnly ? roId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn(submitting && 'ff-sub')}>
      <div ref={shakeRef}>
        <div
          className={cn(
            'ff',
            leadingIcon && 'ff-ic',
            (inputMode === 'numeric' || inputMode === 'tel') && 'ff-num',
            readOnly && 'ff-ro',
            !readOnly && error && 'ff-err',
            !readOnly && !error && ok && 'ff-ok',
          )}
        >
          <input
            ref={inputRef}
            id={inputId}
            value={value}
            onChange={(e) => handleChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onBlur={() => runValidate(value, true)}
            /* 라벨 부상을 CSS만으로 처리하려면 placeholder가 항상 비어 있지 않아야 한다. */
            placeholder={placeholder ?? ' '}
            readOnly={readOnly}
            aria-readonly={readOnly || undefined}
            aria-invalid={!readOnly && error ? true : undefined}
            aria-describedby={describedBy}
            maxLength={maxLength}
            inputMode={inputMode}
          />
          <label htmlFor={inputId}>{label}</label>

          {leadingIcon && (
            <span className="ff-lead" aria-hidden="true">
              {leadingIcon}
            </span>
          )}

          <span className="ff-end">
            {counter}
            {readOnly ? (
              <LockIcon />
            ) : checking ? (
              <span className="ff-spin" aria-hidden="true" />
            ) : error ? (
              <AlertIcon />
            ) : ok ? (
              <CheckIcon />
            ) : null}
          </span>
        </div>
      </div>

      {/* 라이브 영역이 문구보다 먼저 존재해야 낭독된다. 노드는 항상 마운트한다. */}
      <div
        id={msgId}
        role="alert"
        className={cn('ff-msgwrap', !readOnly && error && 'ff-msgwrap-open')}
      >
        <span className="ff-msg">{!readOnly && error ? error : ''}</span>
      </div>

      {readOnly && (
        <span id={roId} className="sr-only">
          읽기 전용 필드입니다. 값을 수정할 수 없습니다
        </span>
      )}
    </div>
  )
}
