import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'

interface PublicConfig {
  botUsername: string | null
  devLogin: boolean
}

/** Telegram Login Widget. Bot domeni @BotFather → /setdomain da ko'rsatilgan bo'lishi kerak (localhost ishlamaydi). */
function TelegramLoginButton({ botUsername, onAuth }: { botUsername: string; onAuth: (user: Record<string, unknown>) => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.onTelegramAuth = onAuth
    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.async = true
    script.dataset.telegramLogin = botUsername
    script.dataset.size = 'large'
    script.dataset.radius = '8'
    script.dataset.requestAccess = 'write'
    script.dataset.onauth = 'onTelegramAuth(user)'
    const container = ref.current
    container?.appendChild(script)
    return () => {
      container?.replaceChildren()
      delete window.onTelegramAuth
    }
  }, [botUsername, onAuth])

  return <div ref={ref} className="min-h-10" />
}

function DevLoginForm({ onSubmit }: { onSubmit: (telegramId: number) => void }) {
  const [value, setValue] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const id = Number(value)
    if (Number.isSafeInteger(id) && id > 0) onSubmit(id)
  }
  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-dashed border-amber-400 bg-amber-50 p-4">
      <p className="text-sm font-medium text-amber-900">Lokal kirish (faqat development)</p>
      <p className="text-xs text-amber-800">Telegram ID raqamingiz. Avval bot orqali taklif havolasini ochgan bo‘lishingiz kerak.</p>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="numeric"
          placeholder="Masalan, 123456789"
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">Kirish</button>
      </div>
    </form>
  )
}

export function LoginPage({ error }: { error?: string }) {
  const { loginWith } = useAuth()
  const config = useQuery({ queryKey: ['auth-config'], queryFn: () => api<PublicConfig>('/auth/config') })

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">LivePortal</h1>
          <p className="text-sm text-slate-600">IT Live Academy loyihalari va tasklari. Telegram orqali kiring.</p>
        </div>

        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {config.data?.botUsername ? (
          <TelegramLoginButton
            botUsername={config.data.botUsername}
            onAuth={(user) => void loginWith('/auth/telegram/widget', user)}
          />
        ) : (
          config.isSuccess && <p className="text-sm text-slate-500">Telegram bot hali sozlanmagan (TELEGRAM_BOT_USERNAME).</p>
        )}

        {config.data?.devLogin && <DevLoginForm onSubmit={(telegramId) => void loginWith('/auth/dev-login', { telegramId })} />}

        <p className="text-xs text-slate-500">Tizimga faqat taklif havolasi orqali qo‘shilganlar kira oladi.</p>
      </div>
    </main>
  )
}
