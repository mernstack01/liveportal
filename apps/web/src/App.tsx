import { createBrowserRouter, RouterProvider } from 'react-router'
import { useAuth } from './auth'
import { AppLayout } from './components/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { MyTasksPage } from './pages/MyTasksPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProjectPage } from './pages/ProjectPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { TeamPage } from './pages/TeamPage'
import { TaskDrawer } from './task/TaskDrawer'

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <ProjectsPage /> },
      {
        path: '/projects/:projectId',
        element: <ProjectPage />,
        // Telegram'dagi "Ochish" tugmasi shu manzilga olib keladi (7-kun).
        children: [{ path: 'tasks/:taskRef', element: <TaskDrawer /> }],
      },
      { path: '/my', element: <MyTasksPage /> },
      { path: '/team', element: <TeamPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export default function App() {
  const { state } = useAuth()

  if (state.status === 'loading') {
    return <main className="flex min-h-screen items-center justify-center text-sm text-slate-500">Yuklanmoqda…</main>
  }
  // Login'dan keyin ham manzil saqlanadi: Telegram'dan kelgan /projects/... havolasi to'g'ri ochiladi.
  if (state.status === 'anonymous') return <LoginPage error={state.error} />
  return <RouterProvider router={router} />
}
