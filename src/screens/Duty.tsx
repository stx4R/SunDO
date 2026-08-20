/**
 * S9 선도 일정 — `/duty`
 *
 * **자리표시자다.** 내용물은 이후 작업가 만든다(지시서 §11).
 * 파일 1개 + `default export` 구조는 W-16이 `lazy()`를 얹을 때를 위한 것이다(§0.2).
 */
export default function Duty() {
  return (
    <main data-screen="S9" aria-labelledby="scr-s9">
      <h1 id="scr-s9" className="text-h2 font-bold tracking-[-0.01em] text-sundo-900">
        선도 일정
      </h1>
      <p className="mt-2 text-body font-medium text-sundo-ink-70">S9 · 이후 작업</p>
    </main>
  )
}
