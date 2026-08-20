import { RouterProvider } from 'react-router'
import { router } from './router'

/**
 * W-03A~W-04의 스토리 페이지는 여기서 사라졌다. 이 파일은 이제 라우터 루트다.
 *
 * `AuthProvider`·`ToastProvider`·`AppShell`은 전부 `router.tsx`의 `RootLayout`이
 * 소유한다 — `RootLayout`이 `다시 시도`로 `AuthProvider`를 다시 마운트해야 해서
 * 상태가 라우트 루트에 있어야 하기 때문이다(`router.tsx` 주석 참조).
 *
 * 지난 스토리 페이지가 필요하면 `git show 1e06962:src/App.tsx`로 꺼낸다.
 */
export default function App() {
  return <RouterProvider router={router} />
}
