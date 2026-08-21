import { useEffect, useState } from 'react'

/**
 * 온·오프라인 감지. `navigator.onLine` 초깃값 + `online`/`offline` 이벤트.
 *
 * **폴링·핑·재시도를 넣지 마라.** `navigator.onLine`은 "링크가 살아 있다"만 알려 주고
 * 실제 도달 가능성은 보장하지 않는다. 그 간극은 요청이 실패할 때 각 화면이
 * 에러 코드로 다루는 것이지 여기서 추측할 일이 아니다.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)

    /* 구독 사이에 상태가 바뀌었을 수 있다. 한 번 맞춰 두고 시작한다. */
    setOnline(navigator.onLine)

    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  return online
}
