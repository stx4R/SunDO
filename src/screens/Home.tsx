import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { OverlayRootContext } from '../components/AppShell'
import { GlassCard } from '../components/GlassCard'
import { NeuButton } from '../components/NeuButton'
import { StudentSearchSheet } from '../components/StudentSearchSheet'
import { useToast } from '../components/Toast'
import { useAuth } from '../contexts/AuthProvider'
import { spawnSparkle } from '../lib/sparkle'
import {
  fetchDepartment,
  fetchGradeRosterCounts,
  fetchHomeStats,
  GRADES,
  type DeptResult,
  type RosterResult,
  type StatsResult,
} from '../lib/stats'
import { useCountUp } from '../lib/useCountUp'
import { useOnline } from '../lib/useOnline'
import { usePullToRefresh } from '../lib/usePullToRefresh'

/**
 * S3 홈 · 학년 선택 — `/` · PRD §8.3 · design `1d`(舊 version, 색·간격만).
 *
 * **`15e`를 근거로 쓰지 않는다**(§20.7 — 독 데모 전용). `오늘 지도`·`이번 달`·
 * `기록 시작`·`최근 기록`은 이 화면의 요소가 아니다. 요소는 §8.3.2의 **6개뿐**이고
 * 그중 배경 오라는 `AppShell`이 그린다.
 *
 * **여백을 만들지 마라.** 상단 `safe-area + 34px`(배너가 있으면 `+56`)과 하단 120px은
 * `AppShell`이 `hasDock`으로 이미 소유한다(W-09 §5).
 * **`<OfflineBanner />`도 그리지 마라.** 전역 1개다.
 *
 * 화면 전환 `blurIn`은 `ScreenTransition`이 이미 감싼다. 여기서 다시 걸지 마라.
 */

/* §8.3.2 · §8.10 — 확정 문안이다. 새로 짓지 마라. */
const TITLE = '학년 선택'
const HELLO = '안녕하세요'
const LABEL_TODAY = '오늘 기록'
const LABEL_WEEK = '이번 주'
const UNIT = ' 건'
const OFFLINE_SUFFIX = ' (오프라인)'
/** §8.10.3 ER-08. §8.3.5 에러 행의 확정 문안이다. */
const ER_08 = '현황을 불러오지 못했습니다. 당겨서 새로고침'
/** §8.10.1 TS-14. */
const TS_14 = '해당 학년 명부가 아직 등록되지 않았습니다'
/**
 * 🔴 **§8.10에 없다.** 돋보기 버튼은 아이콘뿐이라 접근 가능한 이름이 필요하다(AC-09).
 * W-06의 칩 X와 같은 판단으로 **동작**을 담았다 — 보고서 §9 ③.
 */
const SEARCH_LABEL = '학번 또는 이름으로 학생을 찾습니다'

/** §12.3 「앱 30분 이상 백그라운드 후 복귀」 → N-06이 T-05와 같은 경로를 탄다. */
const STALE_MS = 30 * 60 * 1000

/**
 * 「이 학년은 명부가 비어 있다」를 **아는** 경우에만 `true`.
 *
 * 조회 전(`null`)이나 조회 실패는 `false`다 — 모르는 것과 없는 것을 뭉개면
 * 로딩 중에 TS-14가 떠서 UI가 사실과 어긋난다(§0.4 예외 1).
 */
function isEmptyGrade(roster: RosterResult | null, grade: number): boolean {
  return roster?.kind === 'ok' && (roster.byGrade[grade] ?? 0) === 0
}

/** §12.2 — 999 이하 그대로, 1,000 이상 천 단위 콤마. */
function formatCount(n: number): string {
  return n.toLocaleString('ko-KR')
}

export default function Home() {
  const { profile } = useAuth()
  const online = useOnline()
  const toast = useToast()
  const navigate = useNavigate()
  const overlayRoot = useContext(OverlayRootContext)

  const [stats, setStats] = useState<StatsResult | null>(null)
  const [dept, setDept] = useState<DeptResult | null>(null)
  const [roster, setRoster] = useState<RosterResult | null>(null)
  /* T-05·N-06이 값을 바꾸지 않고도 CountUp을 다시 돌리게 하는 열쇠다.
     T-02(탭 재진입)는 화면이 통째로 다시 마운트되므로 이것이 필요 없다. */
  const [runKey, setRunKey] = useState(0)

  /* W-21C 기능 4 — 학생 검색 시트. 🔴 `key`로 재마운트해 검색어·결과를 초기화한다. */
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchKey, setSearchKey] = useState(0)

  const titleRef = useRef<HTMLHeadingElement>(null)
  /* N-06 판정용. 마지막으로 **서버에서** 받아 온 시각이다. */
  const lastFetchedRef = useRef(0)
  /* §3.3 — 연속 탭 차단. `disabled`·상태로는 같은 태스크 안의 5연타를 못 막는다
     (W-06 §5-4 — 프로젝트 전역 규칙). 동기적으로 즉시 서는 빗장이어야 한다. */
  const navigatingRef = useRef(false)

  /* §15.3 — 화면 전환 시 제목으로 포커스를 옮긴다. */
  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  /**
   * `force=false`면 §12.3의 세션 캐시를 그대로 쓴다(T-01·T-02).
   * `force=true`는 T-05와 N-06만 쓴다 — 그때만 네트워크까지 간다.
   */
  const load = useCallback(async (force: boolean) => {
    if (force) {
      setStats(null)
      setRoster(null)
    }
    const now = new Date()
    const [nextStats, nextDept] = await Promise.all([
      fetchHomeStats(now, force),
      fetchDepartment(force),
    ])
    setStats(nextStats)
    setDept(nextDept)

    /* 학년도를 모르면 명부 카운트 질의를 만들 수 없다. 부서 조회 실패는
       통계 실패와 별개로 전파한다 — 통계는 살아 있을 수 있다. */
    if (nextDept.kind === 'ok') {
      setRoster(await fetchGradeRosterCounts(nextDept.academicYear, force))
    } else {
      setRoster({ kind: 'failed', code: nextDept.code })
    }

    if (force) setRunKey((n) => n + 1)
    lastFetchedRef.current = Date.now()
  }, [])

  /* T-01 — 진입 1회. 캐시가 있으면 네트워크로 가지 않는다(T-02). */
  useEffect(() => {
    void load(false)
  }, [load])

  const refresh = useCallback(() => {
    void load(true)
  }, [load])

  /* T-05 — 아래로 당기기. 임계값·핸들러는 화면이 준다(정책은 화면 소유). */
  usePullToRefresh(refresh)

  /* N-06 — 30분 이상 백그라운드 후 복귀는 **T-05와 같은 경로**다(§8.3.4 · §12.3). */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastFetchedRef.current < STALE_MS) return
      refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  const statsOk = stats?.kind === 'ok' ? stats : null
  const statsFailed = stats?.kind === 'failed'

  const today = useCountUp(statsOk ? statsOk.today : null, runKey)
  const week = useCountUp(statsOk ? statsOk.week : null, runKey)

  const classCountByGrade = dept?.kind === 'ok' ? dept.classCountByGrade : null

  const handleGrade = (grade: number, event: React.MouseEvent<HTMLButtonElement>) => {
    /* T-04 — 명부가 **없다는 것을 아는** 학년만 막는다.
       조회가 아직 안 끝났거나 실패한 상태에서 TS-14를 띄우면 «명부가 없다»는
       **사실과 어긋난 말**이 된다(§0.4 예외 1). 모를 때는 §8.3.5의
       「학년 버튼은 즉시 활성」을 따라 그대로 이동시킨다. */
    if (isEmptyGrade(roster, grade)) {
      toast(TS_14)
      return
    }
    /* §3.3 — "탭 불가"는 시각 처리가 아니라 호출 차단이다. */
    if (navigatingRef.current) return
    navigatingRef.current = true

    /* T-03 — sparkle(녹색)과 라우팅을 **같은 프레임**에 건다.
       §7.4가 sparkle을 0.5s로 두는데 전환은 0.35s다. 규격이 이미 겹침을 전제한다 —
       순차로 재생해야 했다면 T-03이 0.85s였을 것이다. */
    spawnSparkle(overlayRoot, event.clientX, event.clientY)
    navigate(`/grade/${grade}`)
  }

  return (
    <main data-screen="S3" aria-labelledby="scr-s3">
      {/* §8.3.2 #1 — 이름 미확보 시 `안녕하세요` 단독. 로딩 중에는 이름 자리 스켈레톤. */}
      <p className="s3-hello">
        {profile ? (
          profile.name ? (
            `${HELLO}, ${profile.name}님`
          ) : (
            HELLO
          )
        ) : (
          <>
            {HELLO}, <span className="skel" aria-hidden="true" />님
          </>
        )}
      </p>

      {/* 🔴 **W-21C 기능 4 — 진입점은 제목 줄의 돋보기다.**
          `AppShell`·`Dock`을 **열지 않았다**(지시서 §3.2). 독은 §6.2가 5탭으로 고정하고
          있어 여섯 번째 자리가 없고, 검색은 화면이지 탭이 아니다 — S3 안에서 뜨는 시트다. */}
      <div className="s3-titlerow">
        <h1
          ref={titleRef}
          id="scr-s3"
          tabIndex={-1}
          className="text-h1 font-bold text-sundo-900 outline-none"
        >
          {TITLE}
        </h1>
        <button
          type="button"
          className="s3-search"
          aria-label={SEARCH_LABEL}
          /* 🔴 부서 조회가 끝나기 전에는 훑을 반 목록을 모른다. 열어도 빈 검색이 된다. */
          disabled={dept?.kind !== 'ok'}
          onClick={() => {
            setSearchKey((k) => k + 1)
            setSearchOpen(true)
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="8.8" cy="8.8" r="6" stroke="#1F5138" strokeWidth="2.1" />
            <path d="M13.3 13.3l3.7 3.7" stroke="#1F5138" strokeWidth="2.1" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* §8.3.2 #3·#4 — 통계 카드 **2장**. `이번 달`은 S7이다(§12.1). */}
      <div className="mb-[22px] flex gap-2.5">
        <StatCard
          label={LABEL_TODAY}
          offline={!online}
          failed={statsFailed}
          value={today.value}
          valueRef={today.ref}
        />
        <StatCard
          label={LABEL_WEEK}
          offline={!online}
          failed={statsFailed}
          value={week.value}
          valueRef={week.ref}
        />
      </div>

      {/* §8.3.5 에러 행 — 수치 `-` + 하단 힌트. 당김 제스처가 실제로 있으므로
          이 문구가 사실과 어긋나지 않는다(`usePullToRefresh`). */}
      {statsFailed && (
        <p className="mb-[22px] -mt-[14px] text-caption font-medium text-sundo-ink-70" role="status">
          {ER_08}
        </p>
      )}

      {/* §8.3.2 #5 — 학년 버튼 3개. 로딩 중에도 **즉시 활성**이다(§8.3.5). */}
      <div className="flex flex-col gap-[14px]">
        {GRADES.map((grade) => {
          const empty = isEmptyGrade(roster, grade)
          const lastClass = classCountByGrade
            ? /* 🔴 Firestore 맵의 키는 **문자열**이다. 숫자 키로 읽지 마라. */
              classCountByGrade[String(grade)]
            : undefined
          return (
            <NeuButton
              key={grade}
              radius={22}
              className={`s3-grade${empty ? ' opacity-50' : ''}`}
              onClick={(event) => handleGrade(grade, event)}
            >
              <span>
                <span className="s3-grade-title block">{grade}학년</span>
                <span className="s3-grade-sub block">
                  {lastClass === undefined ? (
                    <span className="skel" aria-hidden="true" />
                  ) : (
                    `1반 ~ ${lastClass}반`
                  )}
                </span>
              </span>
              <span className="s3-chev" aria-hidden="true">
                {/* design 1d 원문 — 오른쪽 꺾쇠 14px. */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M9 5l7 7-7 7"
                    stroke="#1F5138"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </NeuButton>
          )
        })}
      </div>

      {/* 기능 4 — 오버레이라 레이아웃에 관여하지 않는다. `AppShell`은 손대지 않았다. */}
      {dept?.kind === 'ok' && (
        <StudentSearchSheet
          key={searchKey}
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          academicYear={dept.academicYear}
          classCountByGrade={dept.classCountByGrade}
        />
      )}
    </main>
  )
}

/**
 * §8.3.2 #3·#4 — `glass stat`. 반경은 §7.3 스케일의 stat = **18**이다.
 *
 * 3상태를 그린다. 로딩 = 40px 스켈레톤 · 조회 실패 = `-` · 정상 = 수치 + ` 건`.
 * 🔴 **실패를 `0 건`으로 그리지 마라.** 0은 「기록이 없다」이고 `-`는 「모른다」다.
 */
function StatCard({
  label,
  offline,
  failed,
  value,
  valueRef,
}: {
  label: string
  offline: boolean
  failed: boolean
  value: number | null
  valueRef: (node: HTMLElement | null) => void
}) {
  return (
    <GlassCard radius={18} className="flex-1 p-[14px_16px]">
      {/* §8.3.5 오프라인 행 — 라벨 뒤에 `(오프라인)`. 수치는 마지막 캐시값이 그대로 있다. */}
      <div className="s3-stat-label">
        {label}
        {offline && OFFLINE_SUFFIX}
      </div>
      <div className="s3-stat-value" ref={valueRef}>
        {failed ? (
          '-'
        ) : value === null ? (
          <span className="skel" aria-hidden="true" />
        ) : (
          <>
            {formatCount(value)}
            <span className="s3-stat-unit">{UNIT}</span>
          </>
        )}
      </div>
    </GlassCard>
  )
}
