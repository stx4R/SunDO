import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollRootContext } from '../components/AppShell'
import { CenterNotice } from '../components/CenterNotice'
import { FilterEmptyIcon, LoadErrorIcon, RecordsEmptyIcon } from '../components/icons'
import { NeuButton } from '../components/NeuButton'
import { formatDateKeyLabel, formatTimeKst, toDateKey, toMonthKey, toWeekKey } from '../lib/dateKeys'
import {
  clearRecordsCache,
  fetchRecordCounts,
  fetchRecordPage,
  fetchWithdrawnAuthors,
  retryPendingWrites,
  subscribeRecords,
  watchPendingCount,
  type RecordCountsResult,
  type RecordCursor,
  type RecordFilter,
  type RecordRow,
} from '../lib/records'
import { fetchDepartment } from '../lib/stats'
import { useCountUp } from '../lib/useCountUp'
import { useOnline } from '../lib/useOnline'
import { usePullToRefresh } from '../lib/usePullToRefresh'

/**
 * S7 기록 조회 — `/records` · PRD §8.7 · §12.1~12.3 · design `20f`(채택본) ·
 * `18e`(EM-03) · `6b`(스켈레톤) · `6f`(EM-02) · `6j`(ER-02).
 *
 * **여백을 만들지 마라.** 상단 `safe-area + 34px`·하단 120px은 `AppShell`이
 * `hasDock`으로 이미 소유한다. **`<OfflineBanner />`도 그리지 마라** — 전역 1개다.
 * 화면 전환 `blurIn`은 `ScreenTransition`이 이미 감싼다.
 *
 * 🔴 **목록에 `overflow-y`를 붙이지 마라.** 스크롤 소유자는 `AppShell` 하나다.
 * 무한 스크롤의 `IntersectionObserver` `root`는 `ScrollRootContext`가 주는 그 노드다.
 *
 * 🔴 **이 화면은 v1.1의 수정·삭제를 만들지 않는다.** 롱프레스는 **전 역할에서
 * 아무 동작도 하지 않는다** — 차장 이상 분기를 미리 심지 마라(지시서 §0.4).
 */

/* §8.7.2 · §8.10 — 확정 문안이다. 새로 짓지 마라. */
const TITLE = '최근 기록'
const SYNC_LOADING = '불러오는 중'
const SYNC_LIVE = '실시간 동기화 중'
const SYNC_OFFLINE = '오프라인'
const SYNC_STALE = '동기화 지연'
const LABEL_TODAY = '오늘'
const LABEL_WEEK = '이번 주'
const LABEL_MONTH = '이번 달'
const TODAY_PREFIX = '오늘 · '
const YESTERDAY_PREFIX = '어제 · '
const WITHDRAWN_SUFFIX = ' (탈퇴한 부원)'
/** §8.10.2 EM-02 · EM-03. */
const EM_02 = '아직 기록이 없습니다'
const EM_02_HINT = '홈에서 학년을 선택해 기록을 남겨 보세요'
const EM_03 = '해당 사유의 기록이 없습니다'
const EM_03_ACTION = '전체 보기'
/** §8.10.3 ER-02 · §8.7.2 #9 더 보기 실패. */
const ER_02 = '기록을 불러오지 못했습니다'
const RETRY = '다시 시도'
const MORE_FAILED = '더 불러오지 못했습니다'
/** BR-41 · §8.7.3 #4 — design `6l`의 `전송 대기 2건`이 이 형식이다. */
const PENDING_BADGE = (n: number) => `전송 대기 ${n}건`
/** §8.10에 이 버튼의 접근성 이름이 없다. W-06의 칩 X와 같은 판단으로 동작을 담는다. */
const PENDING_LABEL = '전송 대기 중인 기록을 지금 다시 보냅니다'

/** §8.7.2 #5 · §8.7.3 — 4개 고정, 단일 선택. `기타`가 C5 파생 변경분이다. */
const FILTERS: readonly { value: RecordFilter; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'DRESS', label: '복장 불량' },
  { value: 'SLIPPER', label: '실내화 미착용' },
  { value: 'ETC', label: '기타' },
]

/** §8.7.2 #8 — 태그 3종. AC-03·AC-13: 색만으로 구분하지 않고 라벨을 항상 함께 쓴다. */
const TAG: Readonly<Record<RecordRow['reasonCode'], { cls: string; label: string }>> = {
  DRESS: { cls: 'tagf', label: '복장 불량' },
  SLIPPER: { cls: 'tagl', label: '실내화 미착용' },
  /* 🔴 `기타` 태그 라벨은 **`기타` 한 단어**다. 기입 내용을 태그에 넣지 않는다. */
  ETC: { cls: 'tage', label: '기타' },
}

/** §8.7.5 로딩 — 목록 5행 스켈레톤(design `6b`). */
const SKELETON_ROWS = 5

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * §3.2 「온라인인데 `fromCache === true`가 계속됨」의 임계 시간.
 *
 * **규격에도 design에도 없는 신규 값이다**(보고서 §7에 올렸다). 판단 근거:
 * 서버 왕복이 이 시간을 넘기면 사용자가 「지금 보는 값이 최신인가」를 의심하기
 * 시작하고, 더 짧게 잡으면 정상적인 첫 동기화에서도 경고가 깜빡인다.
 */
const STALE_SYNC_MS = 3000

interface DateGroup {
  dateKey: string
  label: string
  rows: RecordRow[]
}

/**
 * §3.5 — 🔴 **오늘·어제 판정은 `dateKey` 문자열 비교다.** `Date` 산술로 다시
 * 계산하면 KST 경계가 어긋난다. 어제 키도 `toDateKey`로 만들어 **문자열끼리**
 * 비교한다(`checkDuplicate`가 이미 쓰는 방식이다).
 */
function groupByDate(rows: readonly RecordRow[], now: Date): DateGroup[] {
  const todayKey = toDateKey(now)
  const yesterdayKey = toDateKey(new Date(now.getTime() - DAY_MS))

  const groups: DateGroup[] = []
  let current: DateGroup | null = null
  for (const row of rows) {
    if (!current || current.dateKey !== row.dateKey) {
      const prefix =
        row.dateKey === todayKey
          ? TODAY_PREFIX
          : row.dateKey === yesterdayKey
            ? YESTERDAY_PREFIX
            : ''
      current = { dateKey: row.dateKey, label: prefix + formatDateKeyLabel(row.dateKey), rows: [] }
      groups.push(current)
    }
    current.rows.push(row)
  }
  return groups
}

/** §12.2 — 999 이하 그대로, 1,000 이상 천 단위 콤마. **S7은 단위 없이 숫자만이다.** */
function formatCount(n: number): string {
  return n.toLocaleString('ko-KR')
}

export default function Records() {
  const online = useOnline()
  /* 🔴 무한 스크롤의 `root`. `AppShell`이 노드만 노출한다(W-10 §5-1) — 화면이
     DOM을 거슬러 올라가 `overflow-y` 조상을 찾을 필요가 없다(보고서 §4-2). */
  const scrollRoot = useContext(ScrollRootContext)

  const [filter, setFilter] = useState<RecordFilter>('ALL')
  const [academicYear, setAcademicYear] = useState<number | null>(null)
  const [counts, setCounts] = useState<RecordCountsResult | null>(null)
  /** T-07이 값을 바꾸지 않고도 CountUp을 다시 돌리게 하는 열쇠다. */
  const [runKey, setRunKey] = useState(0)
  /** 재조회·재구독을 강제하는 열쇠. T-07이 올린다. */
  const [reloadKey, setReloadKey] = useState(0)
  /* 「오늘·어제」와 카운터 키의 기준 시각. T-07에서만 갈린다.
     🔴 ref가 아니라 **상태**다 — 렌더 중에 `ref.current`를 읽으면 버려지는 렌더가
     ref를 오염시키고(동시 렌더링), 그룹 헤더가 갱신되지 않는다. */
  const [now, setNow] = useState(() => new Date())

  /* 🔴 §3.7-3 병합은 **문서 ID 기준 Map**이다. 구독 결과와 정적 페이지가 겹쳐도
     중복 행이 생기지 않고, 새 기록에 밀려 첫 페이지 창 밖으로 나간 문서도 남는다 —
     그래서 고정 커서(§3.7-4)와 함께 구멍이 0이다. */
  const [rows, setRows] = useState<ReadonlyMap<string, RecordRow>>(() => new Map())
  /**
   * BR-41 — 🔴 **근거가 둘이다**(`lib/records.ts`의 표 참조).
   * `sessionPending`은 필터와 무관하지만 앱을 껐다 켜면 0이고,
   * `snapshotPending`은 재실행 뒤에도 남지만 현재 필터 안에서만 보인다.
   * 어느 하나도 단독으로는 규격을 못 채워 **최댓값**을 쓴다.
   */
  const [sessionPending, setSessionPending] = useState(0)
  const [snapshotPending, setSnapshotPending] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const [risingIds, setRisingIds] = useState<ReadonlySet<string>>(() => new Set())
  const [withdrawn, setWithdrawn] = useState<ReadonlySet<string>>(() => new Set())

  const [listFailed, setListFailed] = useState(false)
  const [fromCache, setFromCache] = useState(true)
  const [gotSnapshot, setGotSnapshot] = useState(false)
  /** 서버가 확인해 준 스냅샷을 한 번이라도 받았는가. EM-02와 ST-04의 전제다. */
  const [serverSynced, setServerSynced] = useState(false)
  const [stale, setStale] = useState(false)

  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  const [pagesLoaded, setPagesLoaded] = useState(0)
  /** ST-04 — 실시간 수신분. 서버 값(CountUp의 target)을 흔들지 않고 위에 더한다. */
  const [delta, setDelta] = useState({ today: 0, week: 0, month: 0 })

  const titleRef = useRef<HTMLHeadingElement>(null)
  /* 🔴 §3.7-4 — 첫 페이지의 마지막 문서에 **고정**한다. 새 기록이 밀고 들어와도
     움직이지 않는다. 움직이면 밀려난 구간이 어느 페이지에도 들어가지 않는다. */
  const cursorRef = useRef<RecordCursor | null>(null)
  const seenRef = useRef<Set<string>>(new Set())
  const sentinelRef = useRef<HTMLDivElement>(null)
  /* 구독 콜백이 최신 값을 봐야 하는데 의존성에 넣으면 구독이 다시 걸린다. */
  const serverSyncedRef = useRef(false)
  /* §3.3 연속 발동 차단은 상태가 아니라 ref다(W-06 §5-4 — 프로젝트 전역 규칙). */
  const loadingMoreRef = useRef(false)

  /* §15.3 — 화면 전환 시 제목으로 포커스를 옮긴다. */
  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  useEffect(() => {
    serverSyncedRef.current = serverSynced
  }, [serverSynced])

  /* 학년도. 목록 질의(OP-05)가 `academicYear` 등식을 요구한다. 부서 조회 실패는
     질의를 만들 수 없다는 뜻이므로 **ER-02**다(빈 목록이 아니다). */
  useEffect(() => {
    let alive = true
    void fetchDepartment().then((dept) => {
      if (!alive) return
      if (dept.kind === 'ok') setAcademicYear(dept.academicYear)
      else setListFailed(true)
    })
    return () => {
      alive = false
    }
  }, [reloadKey])

  /* BR-41 — 전송 대기 건수. 🔴 **플러시 토스트(NT-07)는 구독하지 않는다** —
     그것은 `DockLayout`이 전역으로 소유한다. 여기서 함께 받으면 S7이 부모보다
     **먼저** 마운트되어(React는 자식 effect를 먼저 돌린다) 토스트를 가로챈다. */
  useEffect(() => watchPendingCount(setSessionPending), [])

  /* §12.1 카운터 3종. 🔴 ST-03 — `filter`가 의존성에 **없다.** */
  useEffect(() => {
    let alive = true
    void fetchRecordCounts(now).then((next) => {
      if (alive) setCounts(next)
    })
    return () => {
      alive = false
    }
  }, [now])

  /**
   * 🔴 §3.7 — **구독 1개.** 필터가 바뀌면 이전 구독을 해제하고 새로 건다(§3.7-5).
   * cleanup의 `unsubscribe()`가 §3.7-6이다. 독 이동은 `replace`라 화면이
   * 언마운트되므로, 해제하지 않으면 탭을 오갈 때마다 구독이 쌓인다 —
   * 같은 질의에 건 구독 2개가 **둘 다** 콜백을 받는 것을 실측했다(보고서 §1-3 P2).
   */
  useEffect(() => {
    if (academicYear === null) return

    /* §3.7-5 — 정적 페이지를 버리고 커서를 초기화한다. */
    cursorRef.current = null
    seenRef.current = new Set()

    return subscribeRecords(
      academicYear,
      filter,
      (snapshot) => {
        setListFailed(false)
        setGotSnapshot(true)
        setFromCache(snapshot.fromCache)
        setSnapshotPending(snapshot.pendingWrites)
        if (!snapshot.fromCache) setServerSynced(true)

        /* 🔴 커서는 **한 번만** 잡는다. 이후 스냅샷이 밀려도 갱신하지 않는다. */
        if (cursorRef.current === null && snapshot.cursor) {
          cursorRef.current = snapshot.cursor
          setHasMore(snapshot.hasMore)
        }

        /* ST-04 — 서버가 확인한 목록을 받은 **뒤에** 들어온 문서만 실시간 수신분이다.
           첫 로드(캐시 → 서버)에서 늘어나는 행까지 +1로 세면 카운터가 두 배가 된다. */
        const live = serverSyncedRef.current
        const fresh = snapshot.rows.filter((row) => !seenRef.current.has(row.id))
        for (const row of snapshot.rows) seenRef.current.add(row.id)

        setRows((prev) => {
          const next = new Map(prev)
          for (const row of snapshot.rows) next.set(row.id, row)
          return next
        })

        if (live && fresh.length > 0) {
          /* T-03 — 최상단 삽입 + `rise` 0.3s. 정렬이 내림차순이라 삽입 위치는
             occurredAt이 정한다(수동으로 앞에 끼우지 않는다). */
          setRisingIds(new Set(fresh.map((row) => row.id)))
          const todayKey = toDateKey(now)
          const weekKey = toWeekKey(now)
          const monthKey = toMonthKey(now)
          setDelta((prev) => {
            let { today, week, month } = prev
            for (const row of fresh) {
              /* 🔴 증가 대상은 **키가 일치하는 카운터뿐이다.** */
              if (row.dateKey === todayKey) today += 1
              if (row.weekKey === weekKey) week += 1
              if (row.monthKey === monthKey) month += 1
            }
            return { today, week, month }
          })
        }
      },
      () => {
        /* 🔴 `failed-precondition`(인덱스 없음)·`permission-denied`·`unavailable`이
           전부 여기로 온다. 빈 배열로 흘리면 EM-02가 떠서 「인덱스를 안 만든 것」과
           「기록이 없는 것」이 구분되지 않는다(DoD 17). */
        setListFailed(true)
      },
    )
    /* `now`는 T-07에서만 바뀌고 그때 `reloadKey`도 함께 오른다 —
       추가 재구독이 생기지 않는다. */
  }, [academicYear, filter, reloadKey, now])

  /* §3.2 「계속됨」 판정. 온라인 · 스냅샷은 받았는데 여전히 캐시일 때만 센다. */
  useEffect(() => {
    if (!online || !gotSnapshot || !fromCache) return
    const timer = setTimeout(() => setStale(true), STALE_SYNC_MS)
    /* 해제는 **cleanup**이 한다. 효과 본문에서 `setStale(false)`를 부르면
       조건이 false인 매 렌더마다 불필요한 렌더가 한 번씩 더 돈다. */
    return () => {
      clearTimeout(timer)
      setStale(false)
    }
  }, [online, gotSnapshot, fromCache])

  /* §3.8 — 작성자 uid를 **중복 제거해 묶음으로** 읽는다. 30건에 질의 30회를 내지 않는다.
     모듈 캐시가 이미 아는 uid는 질의 0회로 끝난다. */
  useEffect(() => {
    const uids = [...new Set([...rows.values()].map((row) => row.createdBy))].filter(Boolean)
    if (uids.length === 0) return
    let alive = true
    void fetchWithdrawnAuthors(uids).then((next) => {
      if (alive) setWithdrawn(next)
    })
    return () => {
      alive = false
    }
  }, [rows])

  const merged = useMemo(
    () => [...rows.values()].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()),
    [rows],
  )
  const groups = useMemo(() => groupByDate(merged, now), [merged, now])

  /* §3.9 — 30건 단위 추가 로드. 구독하지 않는 **정적** 페이지다. */
  const loadMore = useCallback(async () => {
    if (academicYear === null || loadingMoreRef.current || !cursorRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    setMoreFailed(false)
    const page = await fetchRecordPage(academicYear, filter, cursorRef.current)
    loadingMoreRef.current = false
    setLoadingMore(false)
    if (page.kind === 'failed') {
      /* 기존 목록은 그대로 둔다. 실패한 것은 **추가 로드**이지 목록이 아니다. */
      setMoreFailed(true)
      return
    }
    for (const row of page.rows) seenRef.current.add(row.id)
    setRows((prev) => {
      const next = new Map(prev)
      for (const row of page.rows) next.set(row.id, row)
      return next
    })
    if (page.cursor) cursorRef.current = page.cursor
    setHasMore(page.hasMore)
    setPagesLoaded((n) => n + 1)
  }, [academicYear, filter])

  const loadMoreRef = useRef(loadMore)
  useEffect(() => {
    loadMoreRef.current = loadMore
  })

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !scrollRoot || !hasMore || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMoreRef.current()
      },
      /* 🔴 `root`는 뷰포트가 아니라 **`AppShell`의 스크롤 영역**이다. */
      { root: scrollRoot, rootMargin: '120px' },
    )
    io.observe(node)
    return () => io.disconnect()
    /* `pagesLoaded`가 의존성에 있는 이유: 관찰자를 다시 만들어야 센티널이 아직
       화면 안에 있을 때 다음 페이지가 이어진다. 🔴 `moreFailed`는 **넣지 않는다** —
       넣으면 실패 직후 관찰자가 다시 생겨 같은 질의를 무한히 재시도한다. */
  }, [scrollRoot, hasMore, pagesLoaded])

  /* T-07 — 카운터·목록·작성자 상태 캐시를 재조회한다. 임계값 70px은 훅이 소유한다. */
  const refresh = useCallback(() => {
    clearRecordsCache()
    setNow(new Date())
    cursorRef.current = null
    seenRef.current = new Set()
    setRows(new Map())
    setRisingIds(new Set())
    setWithdrawn(new Set())
    setCounts(null)
    setDelta({ today: 0, week: 0, month: 0 })
    setListFailed(false)
    setGotSnapshot(false)
    setServerSynced(false)
    setHasMore(false)
    setMoreFailed(false)
    setRunKey((n) => n + 1)
    setReloadKey((n) => n + 1)
  }, [])

  usePullToRefresh(refresh)

  /**
   * BR-41 — 두 근거의 **최댓값**. 합이 아니다: 같은 쓰기를 둘 다 보는 것이 정상이라
   * 더하면 두 배로 센다.
   */
  const pending = Math.max(sessionPending, snapshotPending)

  /**
   * §8.7.3 #4 「탭 시 즉시 재전송 시도」.
   *
   * ⚠ **SDK에 「지금 보내라」 API가 없다**(`lib/records.ts` 주석). 연결을 껐다 켜서
   * 재연결을 강제하는 것이 전부다 — 오프라인이면 아무 일도 일어나지 않는 것이 정상이다.
   * 🔴 실패해도 화면을 바꾸지 않는다. 큐는 그대로 남아 있고 SDK가 계속 시도한다.
   */
  const handleRetryPending = () => {
    if (retrying) return
    setRetrying(true)
    void retryPendingWrites().finally(() => setRetrying(false))
  }

  const countsOk = counts?.kind === 'ok' && !listFailed ? counts : null
  /* §8.7.5 에러 행 — 목록이 실패하면 카운터도 `-`다. 🔴 `0`으로 그리지 마라. */
  const countsFailed = counts?.kind === 'failed' || listFailed
  const today = useCountUp(countsOk ? countsOk.today : null, runKey)
  const week = useCountUp(countsOk ? countsOk.week : null, runKey)
  const month = useCountUp(countsOk ? countsOk.month : null, runKey)

  /**
   * 🔴 **캐시만으로 비어 있는 목록에 EM-02를 띄우지 않는다.**
   * 오프라인·빈 캐시에서 `onSnapshot`이 13ms 만에 `size: 0` · `fromCache: true`를
   * 쏘는 것을 실측했다(보고서 §1-3 P2). 그것을 「기록이 없다」로 읽으면
   * W-10 §5-3이 막으려던 **「오늘 0건」이라는 거짓말**과 같은 종류가 된다.
   * 서버가 확인했거나 캐시에 행이 있을 때만 목록을 확정한다.
   */
  const listReady = serverSynced || merged.length > 0

  const syncState = !online
    ? 'offline'
    : stale
      ? 'stale'
      : gotSnapshot && !fromCache
        ? 'live'
        : 'loading'
  const syncLabel = {
    offline: SYNC_OFFLINE,
    stale: SYNC_STALE,
    live: SYNC_LIVE,
    loading: SYNC_LOADING,
  }[syncState]
  /* §3.2 — 오프라인·지연은 점이 **정지**한다(design `6l`의 회색 점). */
  const dotStill = syncState === 'offline' || syncState === 'stale'

  return (
    <main data-screen="S7" aria-labelledby="scr-s7" className="flex min-h-full flex-col">
      <div className="flex items-center justify-between gap-3">
        <h1
          ref={titleRef}
          id="scr-s7"
          tabIndex={-1}
          className="text-h1 font-bold text-sundo-900 outline-none"
        >
          {TITLE}
        </h1>
        <div className="sync" role="status">
          <span className={dotStill ? 'sync-dot sync-dot-still' : 'sync-dot'} aria-hidden="true" />
          {syncLabel}
        </div>
      </div>

      {/* §8.7.2 #3 — 통계 카드 **3장**. 🔴 ST-03: 필터는 이 값을 바꾸지 않는다. */}
      <div className="s7-stats">
        <StatCard
          label={LABEL_TODAY}
          failed={countsFailed}
          value={today.value}
          final={countsOk ? countsOk.today : null}
          valueRef={today.ref}
          delta={delta.today}
        />
        <StatCard
          label={LABEL_WEEK}
          failed={countsFailed}
          value={week.value}
          final={countsOk ? countsOk.week : null}
          valueRef={week.ref}
          delta={delta.week}
        />
        <StatCard
          label={LABEL_MONTH}
          failed={countsFailed}
          value={month.value}
          final={countsOk ? countsOk.month : null}
          valueRef={month.ref}
          delta={delta.month}
        />
      </div>

      {/* §8.7.3 — 4개가 `gap 6`으로 한 줄. 가로 스크롤을 만들지 않는다. */}
      <div className="fchips">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            /* §3.12 — `role="radiogroup"` 대신 `aria-pressed`를 쓴다. radiogroup은
               로빙 tabindex와 화살표 이동을 함께 갖춰야 규격에 맞는데, 그러면 칩 4개가
               Tab 정지점 1개가 되어 AC-09(모든 인터랙티브 요소 Tab 접근)와 어긋난다.
               §15.3에 필터 칩 항목이 없어 사유 세그먼트 규칙을 끌어오지 않았다. */
            aria-pressed={filter === item.value}
            className={filter === item.value ? 'fchip fchip-on' : 'fchip'}
            onClick={() => {
              if (filter === item.value) return
              /* 목록만 갈아 끼운다. 카운터와 `delta`는 건드리지 않는다(ST-03). */
              setFilter(item.value)
              setRows(new Map())
              setRisingIds(new Set())
              setHasMore(false)
              setMoreFailed(false)
              setGotSnapshot(false)
              setServerSynced(false)
              setListFailed(false)
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* BR-41 · design `6l` — 🔴 **1건 이상일 때만** 그린다. 0건에 자리를 잡지 않는다. */}
      {pending > 0 && (
        <button
          type="button"
          className="rpend"
          onClick={handleRetryPending}
          disabled={retrying}
          aria-label={PENDING_LABEL}
        >
          {/* design `6l` 원문 — 위로 향하는 화살표. */}
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M8 13.2V3.4M4.2 7.2L8 3.2l3.8 4"
              stroke="#fff"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{PENDING_BADGE(pending)}</span>
        </button>
      )}

      {listFailed ? (
        /* §8.7.5 에러 — ER-02 + `다시 시도`(design `6j`). */
        <CenterNotice
          tone="danger"
          icon={<LoadErrorIcon />}
          title={ER_02}
          action={
            <NeuButton radius={15} className="cnote-retry" onClick={refresh}>
              {RETRY}
            </NeuButton>
          }
        />
      ) : !listReady ? (
        /* §8.7.5 로딩 — 5행 스켈레톤(design `6b`). */
        <div className="glass rounded-20 rgroup mt-[18px]" aria-hidden="true">
          {Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <div key={i} className="rrow">
              <div className="min-w-0 flex-1">
                <span className="skel h-[15px] w-[90px]" />
                <span className="skel mt-1.5 block h-[11px] w-[60px]" />
              </div>
              <span className="skel h-[22px] w-[56px] rounded-pill" />
            </div>
          ))}
        </div>
      ) : merged.length === 0 ? (
        filter === 'ALL' ? (
          /* EM-02 — 2줄(design `6f`). */
          <CenterNotice icon={<RecordsEmptyIcon />} title={EM_02} hint={EM_02_HINT} />
        ) : (
          /* EM-03 — `전체 보기` 버튼(design `18e`). */
          <CenterNotice
            icon={<FilterEmptyIcon />}
            title={EM_03}
            action={
              <button type="button" className="s7-allbtn" onClick={() => setFilter('ALL')}>
                {EM_03_ACTION}
              </button>
            }
          />
        )
      ) : (
        /* T-02 — 필터를 바꾸면 목록만 0.2s 크로스페이드로 갈린다. */
        <div key={filter} className="s7-list">
          {groups.map((group) => (
            <section key={group.dateKey}>
              <h2 id={`gh-${group.dateKey}`} className="gh">
                {group.label}
              </h2>
              <ul className="glass rounded-20 rgroup" aria-labelledby={`gh-${group.dateKey}`}>
                {group.rows.map((row) => (
                  <Row
                    key={row.id}
                    row={row}
                    withdrawn={withdrawn.has(row.createdBy)}
                    rising={risingIds.has(row.id)}
                  />
                ))}
              </ul>
            </section>
          ))}

          {/* §8.7.2 #9 — 하단 스피너 / 실패 문구. 관찰 대상이 이 노드다. */}
          <div ref={sentinelRef} className="s7-more">
            {moreFailed ? (
              <p className="s7-more-failed" role="status">
                {MORE_FAILED}
              </p>
            ) : loadingMore ? (
              <span className="s7-spinner" aria-hidden="true" />
            ) : null}
          </div>
        </div>
      )}
    </main>
  )
}

/**
 * §8.7.2 #3 — `glass stat` 3장. design `20f` 원문 `radius 16` · `padding 12px 14px`.
 *
 * 3상태를 그린다. 로딩 = 40px 스켈레톤 · 조회 실패 = `-` · 정상 = **숫자만**
 * (§12.2 — ` 건`은 S3 전용이다). 🔴 실패를 `0`으로 그리지 마라.
 *
 * `delta`는 ST-04의 실시간 증가분이다. CountUp의 **target을 흔들지 않고** 위에 더한다 —
 * target을 바꾸면 애니메이션이 0부터 다시 돌아 §12.2의 「진입당 1회」가 깨진다.
 * `aria-label`은 애니메이션 중간값이 아니라 **최종값**으로 만든다(§15.3).
 */
function StatCard({
  label,
  failed,
  value,
  final,
  valueRef,
  delta,
}: {
  label: string
  failed: boolean
  value: number | null
  final: number | null
  valueRef: (node: HTMLElement | null) => void
  delta: number
}) {
  const shown = value === null ? null : value + delta
  const settled = failed || final === null ? null : final + delta
  return (
    <div
      className="glass rounded-16 s7-stat"
      role="group"
      aria-label={settled === null ? undefined : `${label} ${formatCount(settled)}건`}
      /* CountUp이 도는 동안 중간값을 읽지 않는다. 최종값은 라벨이 갖는다. */
      aria-live="off"
    >
      <div className="s7-stat-label" aria-hidden={settled !== null}>
        {label}
      </div>
      <div className="s7-stat-value" ref={valueRef} aria-hidden={settled !== null}>
        {failed ? '-' : shown === null ? <span className="skel" /> : formatCount(shown)}
      </div>
    </div>
  )
}

/**
 * §8.7.2 #7 — 기록 행. design `20f` 원문.
 *
 * 🔴 **롱프레스 핸들러가 없다.** v1.1의 액션 시트가 붙을 자리이지만 지금은
 * 전 역할에서 아무 동작도 하지 않는다(지시서 §0.4). 역할 분기를 미리 심지 마라.
 */
function Row({ row, withdrawn, rising }: { row: RecordRow; withdrawn: boolean; rising: boolean }) {
  const tag = TAG[row.reasonCode]
  const author = `작성 ${row.createdByName}`
  /* AC-14 · §15.3 — 취소선만으로 구분하지 않는다. */
  const authorLabel = withdrawn ? author + WITHDRAWN_SUFFIX : undefined
  const authorClass = withdrawn ? 'rby rby-out' : 'rby'
  return (
    <li className={rising ? 'rrow rrow-new' : 'rrow'}>
      <div className="min-w-0 flex-1">
        <p className="rname">
          {row.studentName} <span className="rid">{row.studentNo}</span>
        </p>
        {row.reasonText === null ? (
          /* 🔴 `reasonText`가 `null`인 행에는 구분선도 기입 문구도 **없다**. */
          <p className={authorClass} aria-label={authorLabel}>
            {author}
          </p>
        ) : (
          <p className="rbyline">
            <span className={authorClass} aria-label={authorLabel}>
              {author}
            </span>
            <span className="rsep" aria-hidden="true" />
            <span className="rtext">{row.reasonText}</span>
          </p>
        )}
      </div>
      {/* AC-03·AC-13 — 색만으로 구분하지 않는다. 라벨 텍스트가 항상 함께 있다. */}
      <span className={`${tag.cls} flex-none`}>{tag.label}</span>
      <span className="rt">{formatTimeKst(row.occurredAt)}</span>
    </li>
  )
}
