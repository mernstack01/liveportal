import { useAuth } from './auth'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'

export default function App() {
  const { state } = useAuth()

  if (state.status === 'loading') {
    return <main className="flex min-h-screen items-center justify-center text-sm text-slate-500">Yuklanmoqda…</main>
  }
  if (state.status === 'anonymous') return <LoginPage error={state.error} />
  return <HomePage me={state.me} />
}
