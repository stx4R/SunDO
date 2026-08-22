import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { OverlayRootContext } from '../components/AppShell'
import { CenterNotice } from '../components/CenterNotice'
import { LoadErrorIcon } from '../components/icons'
import { NeuButton } from '../components/NeuButton'
import { useToast } from '../components/Toast'
import { fetchClassCounts, type ClassCountsResult } from '../lib/roster'
import { spawnSparkle } from '../lib/sparkle'
import { fetchDepartment, type DeptResult } from '../lib/stats'

/**
 * S4 반 선택 — `/grade/:grade` · PRD §8.4 · design `1e`(舊 version) + `6c`(스켈레톤).
 *
 * **여백을 만들지 마라.** 상단 `safe-area + 26px`(배너가 있으면 `+56`)과 좌우 22px은
 * `AppShell`이 소유한다(W-09 §5). **`<OfflineBanner />`도 그리지 마라** — 전역 1개다.
 * 화면 전환 `blurIn`은 `ScreenTransition`이 이미 감싼다.
 *
 * `grade`의 1~3 검증은 `router.tsx`의 `GradeGuard`가 이미 끝냈다(N-04). 다시 하지 마라.
 */

/* §8.4.2 · §8.10 — 확정 문안이다. 새로 짓지 마라. */
const TITLE = '반 선택'
const BACK_LABEL = '이전 화면으로'
const UNIT = '반'
/** §8.10.1 TS-15. */
const TS_15 = '해당 반 명부가 비어 있습니다'
/** §8.10.2 EM-07. */
const EM_07 = '등록된 반 정보가 없습니다'
const EM_07_HINT = '부장에게 문의해 주세요'
/** §8.10.3 ER-04. */
const ER_04 = '반 목록을 불러오지 못했습니다'
/** §8.4.5 · §8.5.5가 요구하는 복구 버튼. §8.10 사전에 코드가 없다(보고서 §5). */
const RETRY = '다시 시도'

/** §8.4.5 — 반 수를 아직 모르는 시점이라 10칸 고정이다. */
const SKELETON_COUNT = 10

/**
 * 「이 반은 명부가 비어 있다」를 **아는** 경우에만 `true`.
 *
 * 조회 전(`null`)이나 조회 실패는 `false`다 — 모르는 것과 없는 것을 뭉개면
 * 로딩 중에 TS-15가 떠서 UI가 사실과 어긋난다(S3의 `isEmptyGrade`와 같은 규칙).
 */
function isEmptyClass(counts: ClassCountsResult | null, classNo: number): boolean {
  return counts?.kind === 'ok' && (counts.byClass[classNo] ?? 0) === 0
}

export default function GradeClasses() {
  const { grade: gradeParam } = useParams()
  /* `GradeGuard`를 통과했으므로 1~3 정수다. */
  const grade = Number(gradeParam)

  const toast = useToast()
  const navigate = useNavigate()
  const overlayRoot = useContext(OverlayRootContext)

  const [dept, setDept] = useState<DeptResult | null>(null)
  const [counts, setCounts] = useState<ClassCountsResult | null>(null)

  const titleRef = useRef<HTMLHeadingElement>(null)
  /* §3.5 — 연속 탭 차단. `disabled`·상태로는 같은 태스크 안의 5연타를 못 막는다
     (W-06 §5-4 — 프로젝트 전역 규칙). 동기적으로 즉시 서는 빗장이어야 한다. */
  const navigatingRef = useRef(false)

  /* §15.3 — 화면 전환 시 제목으로 포커스를 옮긴다. */
  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  /**
   * `fetchDepartment()`는 모듈 캐시를 갖는다 — S3가 이미 읽었으면 네트워크로 가지
   * 않는다(W-10 §8-1). `/grade/2`를 URL로 직접 열면 캐시가 없어 실제 조회가 돈다.
   */
  const load = useCallback(
    async (force: boolean) => {
      if (force) {
        setDept(null)
        setCounts(null)
      }
      const nextDept = await fetchDepartment(force)
      setDept(nextDept)
      if (nextDept.kind !== 'ok') {
        /* 반 목록 자체를 모른다 → ER-04. 카운트는 시도할 근거가 없다. */
        setCounts(null)
        return
      }
      /* 🔴 Firestore 맵의 키는 **문자열**이다. 숫자 키로 읽지 마라(W-09 §7-3). */
      const classCount = nextDept.classCountByGrade[String(grade)]
      if (!classCount) {
        /* EM-07. 반이 0개면 카운트 질의를 쏠 대상도 없다. */
        setCounts({ kind: 'ok', byClass: {} })
        return
      }
      setCounts(await fetchClassCounts(nextDept.academicYear, grade, classCount, force))
    },
    [grade],
  )

  useEffect(() => {
    void load(false)
  }, [load])

  const classCount =
    dept?.kind === 'ok' ? (dept.classCountByGrade[String(grade)] ?? 0) : 0

  const handleClass = (classNo: number, event: React.MouseEvent<HTMLButtonElement>) => {
    /* T-04 — 명부가 **없다는 것을 아는** 반만 막는다. 조회 전·실패 상태에서 TS-15를
       띄우면 «명부가 비어 있다»는 사실과 어긋난 말이 된다(§0.5 예외 1). */
    if (isEmptyClass(counts, classNo)) {
      toast(TS_15)
      return
    }
    if (navigatingRef.current) return
    navigatingRef.current = true

    /* T-02 — sparkle과 라우팅을 **같은 프레임**에 건다(W-10 §4-3과 같은 근거). */
    spawnSparkle(overlayRoot, event.clientX, event.clientY)
    navigate(`/grade/${grade}/class/${classNo}`)
  }

  return (
    <main data-screen="S4" aria-labelledby="scr-s4" className="flex min-h-full flex-col">
      <div className="s4-head">
        <button
          type="button"
          className="back"
          aria-label={BACK_LABEL}
          /* T-03 — N-01「뒤로가기는 항상 한 단계 상위」. `navigate(-1)`을 쓰지 않는다:
             `/grade/2`로 직접 진입하면 되돌아갈 항목이 없다. */
          onClick={() => navigate('/')}
        >
          {/* design 1e 원문 — 왼쪽 화살표 13px. */}
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

        <div>
          <p className="crumb">{grade}학년</p>
          <h1
            ref={titleRef}
            id="scr-s4"
            tabIndex={-1}
            className="text-h2 font-bold text-sundo-900 outline-none"
          >
            {TITLE}
          </h1>
        </div>
      </div>

      {dept?.kind === 'failed' ? (
        /* §8.4.5 에러 — ER-04 + `다시 시도`. */
        <CenterNotice
          tone="danger"
          icon={<LoadErrorIcon />}
          title={ER_04}
          action={
            <NeuButton radius={15} className="cnote-retry" onClick={() => void load(true)}>
              {RETRY}
            </NeuButton>
          }
        />
      ) : dept?.kind === 'ok' && classCount === 0 ? (
        /* §8.4.5 빈 상태 — EM-07. 시안이 없어 아이콘 없이 문구만 그린다(§4-3). */
        <CenterNotice title={EM_07} hint={EM_07_HINT} />
      ) : (
        /* design `1e` 원문 `grid-template-columns:1fr 1fr;gap:12px`. */
        <div className="grid grid-cols-2 gap-3">
          {dept === null
            ? /* §8.4.5 로딩 — 뉴모피즘 스켈레톤 10칸(design `6c`). */
              Array.from({ length: SKELETON_COUNT }, (_, i) => (
                <div key={i} className="neu rounded-20 cbtn" aria-hidden="true">
                  {/* design `6c` 원문 `width:34px;height:24px`. */}
                  <span className="skel h-6 w-[34px]" />
                </div>
              ))
            : Array.from({ length: classCount }, (_, i) => i + 1).map((classNo) => {
                const empty = isEmptyClass(counts, classNo)
                return (
                  <NeuButton
                    key={classNo}
                    radius={20}
                    className={`cbtn${empty ? ' opacity-50' : ''}`}
                    onClick={(event) => handleClass(classNo, event)}
                  >
                    <span className="cbtn-no">
                      {classNo}
                      <span className="cbtn-unit">{UNIT}</span>
                    </span>
                  </NeuButton>
                )
              })}
        </div>
      )}
    </main>
  )
}
