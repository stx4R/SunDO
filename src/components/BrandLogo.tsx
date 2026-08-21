/**
 * 84px 브랜드 로고. **Splash(design `10a`)와 S1(design `12a`)이 같은 값을 그린다.**
 *
 * props가 없다. 크기·색 prop을 만들지 마라 — 사용처가 둘뿐이고 둘 다 같은 값이다.
 * 타이틀·부제는 포함하지 않는다. 두 화면은 스태거 지연과 부제 문구가 다르다
 * (Splash `0/.09/.18/.27/.36` + `대전대신고등학교`,
 *  S1 `.05/.13/.21/.29/.37` + `대전대신고등학교 · 부원 전용`).
 *
 * 등장 모션(`rise`)도 여기 두지 않는다 — Splash는 로고에 직접 걸고,
 * S1은 §8.1.4 T-01 순서상 같은 값이지만 화면마다 지연이 달라질 수 있다.
 * 호출부가 `className`으로 준다.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={className ? `brand-logo ${className}` : 'brand-logo'}>
      {/* 저장소에 로고 자산이 없다. §8.1.2 폴백 규격(`자` 이니셜 원형).
          Footer 폴백과 같은 색·굵기이고, 크기는 §7.2 스케일에서 84px 원에
          가장 가까운 `text-h1`(28px)이다 — PRD에 폴백 글자 크기 규격이 없다. */}
      <span className="text-h1 font-bold text-sundo-800" aria-hidden="true">
        자
      </span>
    </span>
  )
}
