import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, refreshAccessToken, setAccessToken } from './api'

export interface Me {
  id: string
  name: string
  telegramUsername: string | null
  avatarUrl: string | null
  workspaces: { id: string; name: string; slug: string; role: string; permissions: string[] }[]
}

type AuthState = { status: 'loading' } | { status: 'anonymous'; error?: string } | { status: 'authenticated'; me: Me }

interface AuthContextValue {
  state: AuthState
  loginWith: (path: string, body: unknown) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  const loadMe = useCallback(async () => {
    const me = await api<Me>('/auth/me')
    setState({ status: 'authenticated', me })
  }, [])

  const loginWith = useCallback(
    async (path: string, body: unknown) => {
      try {
        const { accessToken } = await api<{ accessToken: string }>(path, { method: 'POST', body: JSON.stringify(body) })
        setAccessToken(accessToken)
        await loadMe()
      } catch (error) {
        setState({ status: 'anonymous', error: error instanceof Error ? error.message : 'Kirib bo‘lmadi' })
      }
    },
    [loadMe],
  )

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    setAccessToken(null)
    setState({ status: 'anonymous' })
  }, [])

  // Boshlanish: 1) refresh cookie, 2) Telegram Mini App initData, 3) login sahifasi.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (await refreshAccessToken()) {
        if (!cancelled) await loadMe().catch(() => setState({ status: 'anonymous' }))
        return
      }
      const webApp = window.Telegram?.WebApp
      if (webApp?.initData) {
        webApp.ready()
        webApp.expand()
        if (!cancelled) await loginWith('/auth/telegram/mini-app', { initData: webApp.initData })
        return
      }
      if (!cancelled) setState({ status: 'anonymous' })
    })()
    return () => {
      cancelled = true
    }
  }, [loadMe, loginWith])

  const value = useMemo(() => ({ state, loginWith, logout }), [state, loginWith, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth AuthProvider ichida ishlatiladi')
  return ctx
}
