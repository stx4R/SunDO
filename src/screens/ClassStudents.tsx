import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { OverlayRootContext } from '../components/AppShell'
import { CenterNotice } from '../components/CenterNotice'
import { Chip } from '../components/Chip'
import { LoadErrorIcon, RosterEmptyIcon } from '../components/icons'
import { NeuButton } from '../components/NeuButton'
import { RecordSheet } from '../components/RecordSheet'
import { useToast } from '../components/Toast'
import { useAuth } from '../contexts/AuthProvider'
import { fetchStudents, type Student, type StudentsResult } from '../lib/roster'
import { spawnSparkle } from '../lib/sparkle'
import { fetchDepartment, type DeptResult } from '../lib/stats'

/**
 * S5 학생 목록 — `/grade/:grade/class/:classNo` · PRD §8.5 ·
 * design `1f`(舊 version) + `6a`(스켈레톤) · `6e`(빈 상태) · `6k`(에러).
 *
 * **여백·배너·오라·스크롤 요소를 만들지 마라.** 전부 `AppShell` 소유다(W-09 §5 · W-10 §5-1).
 *
 * 🔴 **행 탭은 `sparkle` 다음 줄에서 S6 기록 작성 시트를 연다**(W-12 §3.6).
 * §8.5.4 T-02가 `sparkle` → 딤 0.3s + 시트 0.38s를 **같은 트리거**로 규정한다.
 * 교사 계정은 행이 `<button>`이 아니라 `<div>`라 T-04(교사 행 탭 = 무동작)가 자동으로 지켜진다.
 */

/* §8.5.2 · §8.10 — 확정 문안이다. 새로 짓지 마라. */
const TITLE = '학생 목록'
const BACK_LABEL = '이전 화면으로'
const HINT = '학생을 탭하면 바로 기록을 작성합니다'
/** §8.5.2 #5 — 교사 계정 대체 문구. */
const HINT_TEACHER = '열람 전용 계정입니다'
/** §8.10.2 EM-01. */
const EM_01 = '이 반에 등록된 학생이 없습니다'
const EM_01_HINT = '부장에게 명부 등록을 요청해 주세요'
/** §8.10.3 ER-03. */
const ER_03 = '학생 명부를 불러오지 못했습니다'
/** §8.10.1 TS-13 — `router.tsx`의 가드와 **같은 문구·같은 이동 방식**을 쓴다. */
const TS_13 = '잘못된 접근입니다'
/** §8.4.5 · §8.5.5가 요구하는 복구 버튼. §8.10 사전에 코드가 없다(보고서 §5). */
const RETRY = '다시 시도'

/** §8.5.5 로딩 — 8행. */
const SKELETON_ROWS = 8

export default function ClassStudents() {
  const { grade: gradeParam, classNo: classNoParam } = useParams()
  /* `GradeGuard`·`ClassGuard`를 통과했으므로 정수다(하한만 검증됐다 — 상한은 아래). */
  const grade = Number(gradeParam)
  const classNo = Number(classNoParam)

  const { profile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const overlayRoot = useContext(OverlayRootContext)

  const [dept, setDept] = useState<DeptResult | null>(null)
  const [roster, setRoster] = useState<StudentsResult | null>(null)

  /* S6 시트. `open`과 내용물을 따로 든다(W-12 §3.5). */
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetStudent, setSheetStudent] = useState<Student | null>(null)
  const [sheetKey, setSheetKey] = useState(0)

  const titleRef = useRef<HTMLHeadingElement>(null)
  /* §3.5 — 연속 탭 차단. 행 탭이 아직 아무 것도 열지 않아도 `sparkle` 5연발을 막는다. */
  const tappingRef = useRef(false)
  /* §3.4 리다이렉트를 1회로 묶는 동기 빗장. */
  const redirectingRef = useRef(false)

  /* §15.3 — 화면 전환 시 제목으로 포커스를 옮긴다. */
  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const load = useCallback(
    async (force: boolean) => {
      if (force) setRoster(null)
      const nextDept = await fetchDepartment(force)
      setDept(nextDept)
      if (nextDept.kind !== 'ok') {
        /* 학년도를 모르면 명부 질의를 만들 수 없다. **빈 목록이 아니라 실패**다 —
           뭉개면 「이 반에 학생이 없습니다」라는 거짓말이 뜬다(§0.5 예외 1). */
        setRoster({ kind: 'failed', code: nextDept.code })
        return
      }
      setRoster(await fetchStudents(nextDept.academicYear, grade, classNo, force))
    },
    [grade, classNo],
  )

  useEffect(() => {
    void load(false)
  }, [load])

  /**
   * §8.5.3 `classNo` **상한** 검증 — `ClassGuard`가 하지 못하는 절반이다.
   * 부서 문서를 읽어야 해서 라우터에 둘 수 없다(`router.tsx:117` 주석).
   * `ClassGuard`의 하한 처리와 같은 문구·같은 이동 방식(`replace`)을 쓴다.
   */
  useEffect(() => {
    if (dept?.kind !== 'ok') return
    /* 🔴 맵 키는 문자열이다. */
    const classCount = dept.classCountByGrade[String(grade)]
    if (classCount === undefined || classNo <= classCount) return
    if (redirectingRef.current) return
    redirectingRef.current = true
    toast(TS_13)
    navigate(`/grade/${grade}`, { replace: true })
  }, [dept, grade, classNo, navigate, toast])

  const isTeacher = profile?.role === 'teacher'
  const students: readonly Student[] = roster?.kind === 'ok' ? roster.students : []
  /* §8.5.2 #4 — 로딩·에러는 `-명`이다. `0명`으로 뭉개지 마라. */
  const countLabel = roster?.kind === 'ok' ? `${students.length}명` : '-명'

  const handleStudent = (student: Student, event: React.MouseEvent<HTMLButtonElement>) => {
    if (tappingRef.current) return
    tappingRef.current = true
    /* T-02 — `sparkle`(녹색)과 시트 오픈이 **같은 트리거**다. */
    spawnSparkle(overlayRoot, event.clientX, event.clientY)
    /* 🔴 `key`를 올려 `RecordSheet`를 새로 마운트한다. `occurredAt`·`clientRecordId`·
       사유·기타 입력값 초기화가 전부 마운트 한 곳에서 일어난다(W-12 §3.5). */
    setSheetStudent(student)
    setSheetKey((k) => k + 1)
    setSheetOpen(true)
    /* 🔴 빗장은 여기서 풀지 않는다. 열린 시트 뒤의 다른 행이 눌리면 안 되므로
       **시트가 완전히 닫힐 때**(`onClosed`) 푼다 — W-11 §4-7의 재정의다. */
  }

  /* 닫기 **요청**. 실제 닫힘·히스토리 되감기는 `BottomSheet`가 소유한다(N-02). */
  const handleSheetClose = () => setSheetOpen(false)

  /* 닫힘 모션 0.38s까지 끝난 뒤. `student`는 그때까지 비우지 않는다 —
     비우면 닫히는 동안 시트 내용이 사라진다(W-12 §3.5). */
  const handleSheetClosed = () => {
    tappingRef.current = false
  }

  return (
    <main data-screen="S5" aria-labelledby="scr-s5" className="flex min-h-full flex-col">
      {/* 🔴 §8.5.4 T-03 — `sticky` 헤더. 리스트에 자체 `overflow`를 걸지 않는다. */}
      <div className="s5-head">
        <div className="s5-headrow">
          <button
            type="button"
            className="back"
            aria-label={BACK_LABEL}
            /* T-05 — N-01「한 단계 상위」. 직접 URL 진입에도 S4로 간다. */
            onClick={() => navigate(`/grade/${grade}`)}
          >
            {/* design 1f 원문 — 왼쪽 화살표 13px. */}
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

          <div className="min-w-0 flex-1">
            <p className="crumb">
              {grade}학년 · {classNo}반
            </p>
            <h1
              ref={titleRef}
              id="scr-s5"
              tabIndex={-1}
              className="text-h2 font-bold text-sundo-900 outline-none"
            >
              {TITLE}
            </h1>
          </div>

          <Chip className="flex-none">{countLabel}</Chip>
        </div>

        <p className="s5-hint">{isTeacher ? HINT_TEACHER : HINT}</p>
      </div>

      {roster?.kind === 'failed' ? (
        /* §8.5.5 에러 — ER-03 + `다시 시도`. 🔴 `failed-precondition`·`permission-denied`·
           `unavailable`이 **전부 여기로** 온다. 빈 목록으로 떨어뜨리지 마라. */
        <CenterNotice
          tone="danger"
          icon={<LoadErrorIcon />}
          title={ER_03}
          action={
            <NeuButton radius={15} className="cnote-retry" onClick={() => void load(true)}>
              {RETRY}
            </NeuButton>
          }
        />
      ) : roster?.kind === 'ok' && students.length === 0 ? (
        /* §8.5.5 빈 상태 — EM-01 2줄(design `6e`). */
        <CenterNotice icon={<RosterEmptyIcon />} title={EM_01} hint={EM_01_HINT} />
      ) : (
        <div className="glass list flex-1">
          {roster === null
            ? /* §8.5.5 로딩 — 8행 스켈레톤. 폭은 §8.5.5가 준 학번 52 · 이름 80이다
                 (design `6a`는 학번 44지만 PRD가 순서 1이다 — 보고서 §3-2). */
              Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <div key={i} className="srow" aria-hidden="true">
                  <span className="skel h-[13px] w-[52px]" />
                  <span className="skel h-[15px] w-20" />
                </div>
              ))
            : students.map((student) =>
                isTeacher ? (
                  /* §8.5.2 #6 — 교사는 **탭 불가 + 화살표 숨김**. 버튼으로 만들지 않는다. */
                  <div key={student.id} className="srow">
                    <span className="srow-no">{student.studentNo}</span>
                    <span className="srow-name">{student.name}</span>
                  </div>
                ) : (
                  <button
                    key={student.id}
                    type="button"
                    className="srow"
                    onClick={(event) => handleStudent(student, event)}
                  >
                    <span className="srow-no">{student.studentNo}</span>
                    <span className="srow-name">{student.name}</span>
                    {/* design 1f 원문 — 오른쪽 꺾쇠 12px, opacity 0.35. */}
                    <svg
                      className="srow-chev"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M9 5l7 7-7 7"
                        stroke="#14352A"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                ),
              )}
        </div>
      )}

      {/* S6 — 오버레이라 레이아웃에 관여하지 않는다. `AppShell`은 손대지 않는다. */}
      <RecordSheet
        key={sheetKey}
        open={sheetOpen}
        onClose={handleSheetClose}
        onClosed={handleSheetClosed}
        student={sheetStudent}
        grade={grade}
        classNo={classNo}
        /* 명부가 그려진 시점에는 부서 조회가 이미 성공해 있다(`load()` 참조). */
        academicYear={dept?.kind === 'ok' ? dept.academicYear : 0}
      />
    </main>
  )
}
