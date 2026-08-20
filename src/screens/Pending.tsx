/**
 * S2-1 승인 대기 — `/pending`
 *
 * **자리표시자다.** 내용물은 W-06가 만든다(지시서 §11).
 * 파일 1개 + `default export` 구조는 W-16이 `lazy()`를 얹을 때를 위한 것이다(§0.2).
 */
export default function Pending() {
  return (
    <main data-screen="S2-1" aria-labelledby="scr-s2-1">
      <h1 id="scr-s2-1" className="text-h2 font-bold tracking-[-0.01em] text-sundo-900">
        승인 대기
      </h1>
      <p className="mt-2 text-body font-medium text-sundo-ink-70">S2-1 · W-06</p>
    </main>
  )
}
