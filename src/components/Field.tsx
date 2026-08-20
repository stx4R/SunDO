import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
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
  id?: string
  ref?: Ref<FieldHandle>
}

export interface FieldHandle {
  /** 제출 시 폼이 호출한다. */
  validate: () => boolean
  focus: () => void
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
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect
        x="2.9"
        y="6.1"
        width="8.2"
        height="5.6"
        rx="1.6"
        stroke="rgba(20,53,38,0.45)"
        strokeWidth="1.9"
      />
      <path
        d="M4.8 6.1V4.6a2.2 2.2 0 014.4 0v1.5"
        stroke="rgba(20,53,38,0.45)"
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
  validate,
  checking = false,
  readOnly = false,
  submitting = false,
  maxLength,
  inputMode,
  placeholder,
  leadingIcon,
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

  /* allowSuccess는 blur·제출처럼 "검증을 마친" 시점에만 켠다. 값이 바뀔 때마다 도는
     재검사에서 켜면 타이핑 도중 성공 체크가 떠서 §5.5(blur 후 통과 시 표시)를 어긴다. */
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
      setOk(allowSuccess)
      return true
    },
    [validate],
  )

  useImperativeHandle(
    ref,
    () => ({
      validate: () => runValidate(value, true),
      focus: () => inputRef.current?.focus(),
    }),
    [runValidate, value],
  )

  /* CSS 애니메이션 재시작. className은 React가 관리하지 않는 전용 래퍼에 붙인다. */
  useEffect(() => {
    if (errorSeq === 0) return
    const el = shakeRef.current
    if (!el) return
    el.classList.remove('ff-shake')
    void el.offsetWidth
    el.classList.add('ff-shake')
  }, [errorSeq])

  const handleChange = (v: string) => {
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
            onChange={(e) => handleChange(e.target.value)}
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
