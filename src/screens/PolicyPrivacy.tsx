/**
 * S-privacy 개인정보 처리방침 — `/policy/privacy`
 *
 * **자리표시자다.** 내용물은 W-14가 만든다(지시서 §11).
 * 파일 1개 + `default export` 구조는 W-16이 `lazy()`를 얹을 때를 위한 것이다(§0.2).
 */
export default function PolicyPrivacy() {
  return (
    <main data-screen="S-privacy" aria-labelledby="scr-s-privacy">
      <h1 id="scr-s-privacy" className="text-h2 font-bold tracking-[-0.01em] text-sundo-900">
        개인정보 처리방침
      </h1>
      <p className="mt-2 text-body font-medium text-sundo-ink-70">S-privacy · W-14</p>
    </main>
  )
}
