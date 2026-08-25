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
      {/* 🔴 **W-21 P-6 — `자` 이니셜 폴백이 실물 로고로 바뀌었다.**
          §8.1.2의 폴백 규격은 「저장소에 로고 자산이 없다」는 전제 위에 있었고
          `public/DSHS.png`가 그 전제를 없앴다.
          ⚠ **Splash와 S1이 이 컴포넌트를 공유한다**(W-06 §4) — 두 화면이 함께 바뀐다.
          `alt=""`인 이유는 Footer와 같다: 바로 아래 `<h1 aria-label="자율생활부">`가
          같은 정보를 준다. 이름을 넣으면 두 번 읽힌다. */}
      <img src="/DSHS.png" alt="" className="h-full w-full object-cover" />
    </span>
  )
}
