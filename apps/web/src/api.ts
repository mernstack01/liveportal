export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Access token faqat xotirada; refresh token httpOnly cookie'da (JS ko'rmaydi). */
let accessToken: string | null = null
let refreshing: Promise<string | null> | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

async function raw(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      // Fayl yuborishda (FormData) brauzer chegarali multipart sarlavhani o'zi qo'yadi.
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  })
}

async function toError(res: Response): Promise<ApiError> {
  let message = res.statusText
  try {
    const body = (await res.json()) as { message?: unknown }
    if (typeof body.message === 'string') message = body.message
  } catch {
    // tana JSON emas
  }
  return new ApiError(res.status, message)
}

/** Refresh cookie orqali yangi access token. Bir vaqtda faqat bitta so'rov. */
export function refreshAccessToken(): Promise<string | null> {
  refreshing ??= raw('/auth/refresh', { method: 'POST' })
    .then(async (res) => {
      const token = res.ok ? ((await res.json()) as { accessToken: string }).accessToken : null
      setAccessToken(token)
      return token
    })
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

/** Barcha so'rovlar shu yerdan o'tadi. 401 bo'lsa bir marta refresh qilib qayta urinadi. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res = await raw(path, init)
  if (res.status === 401 && accessToken && !path.startsWith('/auth/')) {
    if (await refreshAccessToken()) res = await raw(path, init)
  }
  if (!res.ok) throw await toError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
