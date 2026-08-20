/**
 * S5 학생 목록 — `/grade/:grade/class/:classNo`
 *
 * **자리표시자다.** 내용물은 W-08가 만든다(지시서 §11).
 * 파일 1개 + `default export` 구조는 W-16이 `lazy()`를 얹을 때를 위한 것이다(§0.2).
 */
export default function ClassStudents() {
  return (
    <main data-screen="S5" aria-labelledby="scr-s5">
      <h1 id="scr-s5" className="text-h2 font-bold tracking-[-0.01em] text-sundo-900">
        학생 목록
      </h1>
      <p className="mt-2 text-body font-medium text-sundo-ink-70">S5 · W-08</p>
    </main>
  )
}
