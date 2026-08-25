import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { OverlayRootContext } from './AppShell'
import { BottomSheet } from './BottomSheet'
import { CenterNotice } from './CenterNotice'
import { Field, type FieldHandle } from './Field'
/* 🔴 검색 전용 빈 상태 아이콘을 새로 만들지 않았다. `RosterEmptyIcon`은 EM-01(명부가
   비었다)이 쓰는 것이고 「사람을 못 찾았다」는 같은 층의 사실이다 — design에 이 상태의
   시안이 없어(§20.7에 검색 화면이 없다) 기존 자산을 재사용했다(보고서 §9 ③). */
import { RosterEmptyIcon } from './icons'
import { RecordSheet } from './RecordSheet'
import {
  isStudentNoQuery,
  searchScope,
  searchStudents,
  type Student,
  type StudentHit,
} from '../lib/roster'
import { spawnSparkle } from '../lib/sparkle'

/* ── §8.10 · design `19d`·`19e` 방식(결정 3). ─────────────────────────── */
const TITLE = '학생 검색'
/**
 * 🔴 **셋 다 §8.10 사전에 없다.** design `19d`의 `이름 검색`을 학번까지 받는 자리에
 * 그대로 쓸 수 없어(거짓말이 된다) 문구를 정했다 — **전부 보고서 §9 ③에 올렸다.**
 * 어법은 사전을 따랐다: 라벨은 명사구, 안내는 `…해 주세요`, 빈 상태는 `…없습니다`.
 */
const LABEL_SEARCH = '학번 또는 이름'
const HINT = '학번 또는 이름을 입력하면 바로 기록을 작성할 수 있습니다'
const EMPTY = '검색 결과가 없습니다'
const EMPTY_HINT = '학번 5자리나 이름 일부를 입력해 보세요'
/** 일부 반을 못 읽었을 때. §8.10.3 ER-03의 파생이다. */
const PARTIAL = '일부 반의 명부를 불러오지 못했습니다'

/** 입력이 멈춘 뒤 검색을 시작하기까지. 규격에 없는 신규 값이다(보고서 §9 ③). */
const DEBOUNCE_MS = 220

interface StudentSearchSheetProps {
  open: boolean
  onClose: () => void
  academicYear: number
  classCountByGrade: Readonly<Record<string, number>>
}

/**
 * 홈 학생 검색 시트 — W-21C 기능 4 · design `19d`·`19e`의 **방식**을 가져온다.
 *
 * 🔴 **`RecordSheet`를 재사용한다 — 복제하지 않는다**(지시서 §3.2). `ClassStudents`가
 * 시트를 여는 방식(`key` 재마운트 + `onClosed`에서 빗장 해제)을 그대로 따른다.
 *
 * 🔴 **검색은 클라이언트 필터다** — 새 질의도 새 인덱스도 만들지 않는다. 근거는
 * `lib/roster.ts`의 기능 4 블록에 있다(§14.1 검토 포함).
 *
 * 🔴 **입력이 바뀌면 이전 검색을 취소한다.** 취소하지 않으면 「가」로 시작한 훑기가
 * 「가나」의 결과 위에 옛 결과를 덮어쓴다.
 */
export function StudentSearchSheet({
  open,
  onClose,
  academicYear,
  classCountByGrade,
}: StudentSearchSheetProps) {
  const overlayRoot = useContext(OverlayRootContext)
  const searchRef = useRef<FieldHandle>(null)

  const [q, setQ] = useState('')
  const [hits, setHits] = useState<readonly StudentHit[]>([])
  const [partial, setPartial] = useState(false)
  /**
   * 🔴 **훑기를 끝낸 검색어.** `searching` 불리언 대신 이것을 두는 이유 둘:
   * ① 「지금 검색 중인가」가 **렌더에서 파생**된다(`settledTerm !== term`) — 효과 안에서
   *    동기 setState를 하지 않아도 된다(oxlint `react(set-state-in-effect)`)
   * ② 🔴 **빈 상태가 깜빡이지 않는다.** 불리언이면 글자를 더 칠 때 옛 `settled`가 잠깐
   *    참으로 남아 「검색 결과가 없습니다」가 스쳐 지나간다 — 검색어까지 같아야 참이다
   */
  const [settledTerm, setSettledTerm] = useState('')

  /* S6 시트 — `ClassStudents`와 같은 형태다. */
  const [sheetStudent, setSheetStudent] = useState<StudentHit | null>(null)
  const [sheetKey, setSheetKey] = useState(0)
  const [sheetOpen, setSheetOpen] = useState(false)
  const tappingRef = useRef(false)

  const scope = useMemo(() => searchScope(classCountByGrade), [classCountByGrade])

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
  }, [open])

  const term = q.trim()

  useEffect(() => {
    /* 🔴 **효과 본문에서 setState를 하지 않는다.** 검색어가 비면 아무것도 하지 않고,
       화면은 `term`으로 **렌더에서** 결과를 가린다(아래 `visibleHits`). */
    if (term === '') return

    /* 🔴 취소 신호. `AbortController`를 쓰지 않는 이유 — 훑기가 네트워크가 아니라
       **캐시 우선 함수 호출의 연속**이라 중단 지점이 반 경계뿐이다. */
    const signal = { aborted: false }

    const timer = window.setTimeout(() => {
      void searchStudents(
        academicYear,
        scope,
        term,
        (partialHits) => {
          if (!signal.aborted) setHits(partialHits)
        },
        signal,
      ).then((result) => {
        if (signal.aborted) return
        setPartial(result.failed > 0)
        setSettledTerm(term)
      })
    }, DEBOUNCE_MS)

    return () => {
      signal.aborted = true
      window.clearTimeout(timer)
    }
  }, [term, academicYear, scope])

  const handleHit = (hit: StudentHit, event: React.MouseEvent<HTMLButtonElement>) => {
    if (tappingRef.current) return
    tappingRef.current = true
    /* T-02와 같은 트리거 — `ClassStudents`의 행 탭과 같은 모션이다. */
    spawnSparkle(overlayRoot, event.clientX, event.clientY)
    setSheetStudent(hit)
    setSheetKey((k) => k + 1)
    setSheetOpen(true)
  }

  const numeric = isStudentNoQuery(q)
  /**
   * 🔴 **렌더에서 파생한다.** 검색어가 바뀐 직후에는 `hits`가 아직 옛 검색어의 결과이므로
   * **그 자리에서 가린다** — 상태를 비우려고 효과를 돌리면 렌더가 한 번 더 돈다.
   */
  const visibleHits = term === '' ? [] : hits
  /** 🔴 훑기가 **그 검색어로** 끝났을 때만 빈 상태를 띄운다. 안 그러면 거짓말이 된다. */
  const showEmpty = term !== '' && settledTerm === term && hits.length === 0
  const showPartial = partial && settledTerm === term

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title={TITLE}>
        <div className="ss-field">
          <Field
            ref={searchRef}
            label={LABEL_SEARCH}
            placeholder="20303 또는 홍길동"
            value={q}
            onChange={setQ}
            /* 🔴 숫자만 입력 중이면 숫자 키패드를 띄운다. 이름으로 바뀌면 되돌린다. */
            inputMode={numeric ? 'numeric' : 'text'}
            leadingIcon={<SearchIcon />}
          />
        </div>

        <p className="ss-hint">{HINT}</p>

        {showPartial && (
          <p className="ss-partial" role="status">
            {PARTIAL}
          </p>
        )}

        {visibleHits.length > 0 ? (
          <ul className="ss-list">
            {visibleHits.map((hit) => (
              <li key={hit.id}>
                <button type="button" className="ss-row" onClick={(e) => handleHit(hit, e)}>
                  <span className="ss-avatar" aria-hidden="true">
                    <img src="/DSHSS.png" alt="" className="h-full w-full object-cover" />
                  </span>
                  <span className="ss-who">
                    <span className="ss-name">{hit.name}</span>
                    <span className="ss-meta">
                      {hit.grade}학년 {hit.classNo}반 · {hit.studentNo}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          /* 🔴 **훑기가 그 검색어로 끝난 뒤에만** 빈 상태를 띄운다. 진행 중에 띄우면
             「없다」가 거짓말이 된다 — S7의 `listReady`와 같은 규율이다(W-13). */
          showEmpty && <CenterNotice icon={<RosterEmptyIcon />} title={EMPTY} hint={EMPTY_HINT} />
        )}
      </BottomSheet>

      {/* 🔴 `ClassStudents`와 **같은 컴포넌트**다. S6를 복제하지 않았다. */}
      <RecordSheet
        key={sheetKey}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onClosed={() => {
          tappingRef.current = false
        }}
        student={sheetStudent as Student | null}
        grade={sheetStudent?.grade ?? 0}
        classNo={sheetStudent?.classNo ?? 0}
        academicYear={academicYear}
      />
    </>
  )
}

/** design `19d` 원문 — 16px 돋보기. */
function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.8" stroke="rgba(20,53,38,0.45)" strokeWidth="1.9" />
      <path
        d="M10.6 10.6l3 3"
        stroke="rgba(20,53,38,0.45)"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  )
}
