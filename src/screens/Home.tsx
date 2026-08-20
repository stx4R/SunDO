/**
 * S3 홈 · 학년 선택 — `/`
 *
 * **자리표시자다.** 내용물은 W-07가 만든다(지시서 §11).
 * 파일 1개 + `default export` 구조는 W-16이 `lazy()`를 얹을 때를 위한 것이다(§0.2).
 */
export default function Home() {
  return (
    <main data-screen="S3" aria-labelledby="scr-s3">
      <h1 id="scr-s3" className="text-h2 font-bold tracking-[-0.01em] text-sundo-900">
        홈 · 학년 선택
      </h1>
      <p className="mt-2 text-body font-medium text-sundo-ink-70">S3 · W-07</p>
    </main>
  )
}
