/**
 * S7 기록 조회 — `/records`
 *
 * **자리표시자다.** 내용물은 이후 작업가 만든다(지시서 §11).
 * 파일 1개 + `default export` 구조는 W-16이 `lazy()`를 얹을 때를 위한 것이다(§0.2).
 */
export default function Records() {
  return (
    <main data-screen="S7" aria-labelledby="scr-s7">
      <h1 id="scr-s7" className="text-h2 font-bold tracking-[-0.01em] text-sundo-900">
        기록 조회
      </h1>
      <p className="mt-2 text-body font-medium text-sundo-ink-70">S7 · 이후 작업</p>
    </main>
  )
}
