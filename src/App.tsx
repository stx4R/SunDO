function App() {
  return (
    // 4. PRD §7.1 배경 그라디언트
    <div className="min-h-screen bg-[linear-gradient(180deg,#F7FBF8_0%,#EAF3ED_100%)]">
      {/* 1. Tailwind 기본 유틸리티: flex / padding / rounded */}
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="flex flex-col gap-2 rounded-2xl bg-white p-8 shadow-sm">
          {/* 2. @theme 커스텀 색 토큰 + 3. Spoqa Han Sans Neo */}
          <p className="font-sundo text-2xl font-bold text-sundo-primary">
            스캐폴딩 확인
          </p>
          <p className="font-sundo text-sm text-sundo-ink">
            대전대신고등학교 자율생활부
          </p>
        </div>
      </div>
    </div>
  )
}

export default App
