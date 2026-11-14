import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { api } from '../api'
import { Avatar, Button, ErrorText } from '../components/ui'
import { todayStr } from '../labels'
import { MentionText } from '../task/MentionText'
import type { ChatMessage, ChatPage, ProjectDetail } from '../types'

const chatKey = (projectId: string) => ['chat', projectId] as const

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const day = todayStr(d)
  const today = todayStr()
  const yesterday = todayStr(new Date(Date.now() - 86_400_000))
  if (day === today) return 'Bugun'
  if (day === yesterday) return 'Kecha'
  const [y, m, dd] = day.split('-')
  return `${dd}.${m}.${y}`
}

const time = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Loyihaning ichki chati: faqat xodimlar (mehmon/mijoz ko'rmaydi). Har 4 soniyada yangilanadi. */
export function ChatPanel({ project, userId }: { project: ProjectDetail; userId: string }) {
  const queryClient = useQueryClient()
  const latest = useQuery({
    queryKey: chatKey(project.id),
    queryFn: () => api<ChatPage>(`/projects/${project.id}/chat`),
    refetchInterval: 4000,
  })
  const [older, setOlder] = useState<ChatMessage[]>([])
  const [olderHasMore, setOlderHasMore] = useState<boolean | null>(null)
  const [body, setBody] = useState('')
  const bottom = useRef<HTMLDivElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)

  const messages = useMemo(() => {
    const seen = new Set<string>()
    return [...older, ...(latest.data?.messages ?? [])].filter((m) => !seen.has(m.id) && seen.add(m.id))
  }, [older, latest.data])
  const hasMore = olderHasMore ?? latest.data?.hasMore ?? false
  const lastId = latest.data?.messages.at(-1)?.id

  // Yangi xabar kelganda pastga
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [lastId])

  const loadOlder = useMutation({
    mutationFn: () => api<ChatPage>(`/projects/${project.id}/chat?before=${messages[0]?.id ?? ''}`),
    onSuccess: (page) => {
      setOlder((o) => [...page.messages, ...o])
      setOlderHasMore(page.hasMore)
    },
  })

  const send = useMutation({
    mutationFn: () => api<ChatMessage>(`/projects/${project.id}/chat`, { method: 'POST', body: JSON.stringify({ body }) }),
    onSuccess: (message) => {
      setBody('')
      queryClient.setQueryData<ChatPage>(chatKey(project.id), (page) => (page ? { ...page, messages: [...page.messages, message] } : page))
    },
  })

  // Mehmonlar ichki chatni ko'rmaydi, shuning uchun ularni belgilab bo'lmaydi.
  const mentionable = project.members.filter((m) => m.role !== 'guest' && m.telegramUsername && m.userId !== userId)
  const usernames = useMemo(
    () => new Set(project.members.flatMap((m) => (m.telegramUsername ? [m.telegramUsername.toLowerCase()] : []))),
    [project.members],
  )
  const partial = /(?:^|\s)@([A-Za-z0-9_]*)$/.exec(body)?.[1]
  const suggestions = partial === undefined ? [] : mentionable.filter((m) => m.telegramUsername!.toLowerCase().startsWith(partial.toLowerCase())).slice(0, 5)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (body.trim() && !send.isPending) send.mutate()
  }

  return (
    <section className="mx-auto flex h-[calc(100vh-14rem)] min-h-[420px] max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold">Jamoa chati</h2>
        <span className="text-xs text-slate-500">🔒 Faqat xodimlar ko‘radi — mehmon va mijozlar ko‘rmaydi</span>
      </header>

      <div className="flex-1 space-y-1 overflow-y-auto px-4 py-3">
        {latest.isPending && <p className="py-8 text-center text-sm text-slate-500">Yuklanmoqda…</p>}
        <ErrorText error={latest.error} />
        {hasMore && (
          <div className="pb-2 text-center">
            <Button variant="ghost" className="text-xs" disabled={loadOlder.isPending} onClick={() => loadOlder.mutate()}>
              Avvalgi xabarlar
            </Button>
          </div>
        )}
        {latest.data && messages.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-500">Hali xabar yo‘q. Birinchi bo‘lib yozing — @ bilan hamkasbni belgilasangiz, unga Telegram’da xabar boradi.</p>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt)
          const grouped = !newDay && prev?.author?.userId === m.author?.userId && Date.parse(m.createdAt) - Date.parse(prev.createdAt) < 5 * 60_000
          const mine = m.author?.userId === userId
          return (
            <div key={m.id}>
              {newDay && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-full bg-slate-100 px-3 py-0.5 text-xs text-slate-500">{dayLabel(m.createdAt)}</span>
                </div>
              )}
              <div className={`flex gap-3 ${grouped ? 'pl-12' : 'pt-2'}`}>
                {!grouped && (m.author ? <Avatar person={m.author} /> : <span className="size-9" />)}
                <div className="min-w-0 flex-1">
                  {!grouped && (
                    <p className="text-xs text-slate-500">
                      <span className={`font-semibold ${mine ? 'text-sky-700' : 'text-slate-800'}`}>{m.author?.name ?? 'O‘chirilgan foydalanuvchi'}</span> · {time(m.createdAt)}
                    </p>
                  )}
                  <MentionText text={m.body} usernames={usernames} />
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottom} />
      </div>

      {latest.data?.canWrite && project.status !== 'ARCHIVED' ? (
        <form onSubmit={submit} className="relative border-t border-slate-100 p-3">
          {suggestions.length > 0 && (
            <ul role="listbox" aria-label="Kimni belgilash" className="absolute bottom-full left-3 z-10 mb-1 w-64 overflow-hidden rounded-md bg-white shadow-lg ring-1 ring-slate-200">
              {suggestions.map((m) => (
                <li key={m.userId}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      setBody(body.replace(/@([A-Za-z0-9_]*)$/, `@${m.telegramUsername} `))
                      textarea.current?.focus()
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <Avatar person={m} size="sm" />
                    <span className="truncate">{m.name}</span>
                    <span className="ml-auto text-xs text-slate-500">@{m.telegramUsername}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={textarea}
              rows={1}
              maxLength={4000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) submit(e)
              }}
              placeholder="Xabar yozing… (@ — belgilash, Shift+Enter — yangi qator)"
              className="max-h-40 min-h-10 flex-1 resize-y rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
            <Button disabled={send.isPending || !body.trim()}>Yuborish</Button>
          </div>
          <ErrorText error={send.error} />
        </form>
      ) : (
        <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-500">{project.status === 'ARCHIVED' ? 'Loyiha arxivda: yozib bo‘lmaydi.' : 'Sizda bu chatga yozish ruxsati yo‘q.'}</p>
      )}
    </section>
  )
}
