import { useQuery } from '@tanstack/react-query'
import { api } from './api'

interface Readiness {
  status: 'ok'
  checks: { database: 'up' }
}

export default function App() {
  const ready = useQuery({ queryKey: ['health'], queryFn: () => api<Readiness>('/health/ready') })

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-2xl font-semibold">LivePortal</h1>
        <p className="text-slate-600">IT Live Academy loyihalari, tasklari va bildirishnomalari bitta joyda.</p>
        <p className="text-sm">
          API holati:{' '}
          {ready.isPending ? (
            <span className="text-slate-500">tekshirilmoqda…</span>
          ) : ready.isError ? (
            <span className="font-medium text-red-600">ulanmadi</span>
          ) : (
            <span className="font-medium text-green-600">ishlayapti (baza: {ready.data.checks.database})</span>
          )}
        </p>
      </div>
    </main>
  )
}
