import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { api } from '../api'
import { Attachments, PendingFiles } from '../components/attachments'
import { usePendingFiles } from '../components/pending-files'
import { Avatar, Button, ErrorText } from '../components/ui'
import { todayStr } from '../labels'
import { MentionText } from '../task/MentionText'
import type { ChatMessage, ChatPage, ProjectDetail } from '../types'

/** internal — "Jamoa" (faqat xodimlar), client — "Mijoz bilan". */
export type ChatKind = 'internal' | 'client'
const chatKey = (projectId: string, kind: ChatKind) => ['chat', projectId, kind] as const
const KIND = {
  internal: { path: 'chat', title: 'Jamoa chati', note: '🔒 Faqat xodimlar ko‘radi — mijoz ko‘rmaydi' },
  client: { path: 'client-chat', title: 'Mijoz bilan', note: '👥 Mijoz ham ko‘radi — ichki gaplarni “Jamoa” chatida yozing' },
} as const

function dayLabel(iso: string): string {
  const day = todayStr(new Date(iso))
  if (day === todayStr()) return 'Bugun'
  if (day === todayStr(new Date(Date.now() - 86_400_000))) return 'Kecha'
  const [y, m, d] = day.split('-')
  return `${d}.${m}.${y}`
}

const time = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Loyihaning ichki chati: faqat xodimlar (mehmon/mijoz ko'rmaydi). Har 4 soniyada yangilanadi.
 * O'zingizning xabarlaringiz — o'ngda, boshqalarniki — chapda. Fayl: 📎, Ctrl/⌘+V bilan rasm, yoki sudrab tashlash.
 */
export function ChatPanel({ project, userId, kind = 'internal' }: { project: ProjectDetail; userId: string; kind?: ChatKind }) {
  const queryClient = useQueryClient()
  const base = `/projects/${project.id}/${KIND[kind].path}`
  const key = chatKey(project.id, kind)
  const latest = useQuery({
    queryKey: key,
    queryFn: () => api<ChatPage>(base),
    refetchInterval: 4000,
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [older, setOlder] = useState<ChatMessage[]>([])
  const [olderHasMore, setOlderHasMore] = useState<boolean | null>(null)
  const [body, setBody] = useState('')
  const { pending, add: addFiles, remove: dropPending, notice, setNotice, onPaste } = usePendingFiles()
  const [dragging, setDragging] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const messages = useMemo(() => {
    const seen = new Set<string>()
    return [...older, ...(latest.data?.messages ?? [])].filter((m) => !seen.has(m.id) && seen.add(m.id))
  }, [older, latest.data])
  const hasMore = olderHasMore ?? latest.data?.hasMore ?? false
  const lastId = latest.data?.messages.at(-1)?.id

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [lastId])

  // Rasm keyinroq yuklanib balandlik oshadi: odam pastda tursa, oxirigacha tushamiz (yuqorida o'qiyotgan bo'lsa — tegmaymiz).
  const keepBottom = () => {
    const el = scroller.current
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 600) bottom.current?.scrollIntoView({ block: 'end' })
  }

  const loadOlder = useMutation({
    mutationFn: () => api<ChatPage>(`${base}?before=${messages[0]?.id ?? ''}`),
    onSuccess: (page) => {
      setOlder((o) => [...page.messages, ...o])
      setOlderHasMore(page.hasMore)
    },
  })

  const send = useMutation({
    mutationFn: () => {
      const form = new FormData()
      form.append('body', body)
      pending.forEach((p) => form.append('files', p.file, p.file.name))
      return api<ChatMessage>(base, { method: 'POST', body: form })
    },
    onSuccess: (message) => {
      setBody('')
      dropPending('all')
      setNotice(null)
      queryClient.setQueryData<ChatPage>(key, (page) => (page ? { ...page, messages: [...page.messages, message] } : page))
    },
  })

  const edit = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => api<ChatMessage>(`${base}/${id}`, { method: 'PATCH', body: JSON.stringify({ body: text }) }),
    onSuccess: (message) => {
      setEditingId(null)
      const swap = (list: ChatMessage[]) => list.map((m) => (m.id === message.id ? message : m))
      queryClient.setQueryData<ChatPage>(key, (page) => (page ? { ...page, messages: swap(page.messages) } : page))
      setOlder(swap)
    },
  })
  const startEdit = (m: ChatMessage) => {
    setEditingId(m.id)
    setEditText(m.body)
  }

  // Mijoz ichki chatni ko'rmaydi, shuning uchun u yerda uni belgilab bo'lmaydi.
  const mentionable = project.members.filter((m) => (kind === 'client' || !m.isClient) && m.telegramUsername && m.userId !== userId)
  const usernames = useMemo(
    () => new Set(project.members.flatMap((m) => (m.telegramUsername ? [m.telegramUsername.toLowerCase()] : []))),
    [project.members],
  )
  const partial = /(?:^|\s)@([A-Za-z0-9_]*)$/.exec(body)?.[1]
  const suggestions = partial === undefined ? [] : mentionable.filter((m) => m.telegramUsername!.toLowerCase().startsWith(partial.toLowerCase())).slice(0, 5)

  const canWrite = !!latest.data?.canWrite && project.status !== 'ARCHIVED'
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if ((body.trim() || pending.length > 0) && !send.isPending) send.mutate()
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (canWrite && e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files)
  }

  return (
    <section
      onDragOver={(e) => {
        if (!canWrite) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={onDrop}
      className={`relative mx-auto flex h-[calc(100vh-14rem)] min-h-[440px] max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ${dragging ? 'ring-2 ring-sky-500' : 'ring-slate-200'}`}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-sky-50/90 text-base font-medium text-sky-800">
          Fayllarni shu yerga tashlang
        </div>
      )}
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold">{KIND[kind].title}</h2>
        <span className="text-xs text-slate-500">
          {/* Mijozning o'ziga xodimlar uchun eslatma emas, oddiy izoh */}
          {kind === 'client' && !project.myPermissions.includes('message.internal.read') ? 'Loyiha jamoasi bilan yozishma' : KIND[kind].note}
        </span>
      </header>

      <div ref={scroller} className="flex-1 overflow-y-auto bg-slate-50/60 px-4 py-3">
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
                  <span className="rounded-full bg-white px-3 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200">{dayLabel(m.createdAt)}</span>
                </div>
              )}
              <div className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-0.5' : 'mt-3'}`}>
                {!mine && (grouped ? <span className="w-9 shrink-0" /> : m.author ? <Avatar person={m.author} /> : <span className="size-9 shrink-0" />)}
                <div className={`group flex max-w-[78%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  {!mine && !grouped && <p className="mb-0.5 px-1 text-xs font-semibold text-slate-700">{m.author?.name ?? 'O‘chirilgan foydalanuvchi'}</p>}
                  <div className="flex items-center gap-1">
                    {/* O'z xabarini tahrirlash: sichqoncha ustida yoki klaviatura fokusida ko'rinadi */}
                    {mine && canWrite && editingId !== m.id && (
                      <button
                        type="button"
                        onClick={() => startEdit(m)}
                        aria-label="Xabarni tahrirlash"
                        className="rounded px-1.5 py-1 text-xs text-slate-400 opacity-0 hover:bg-slate-200 hover:text-slate-700 focus:opacity-100 group-hover:opacity-100"
                      >
                        ✏️ Tahrirlash
                      </button>
                    )}
                    <div
                      className={`space-y-1.5 px-3 py-2 shadow-sm ${
                        mine ? 'rounded-2xl rounded-br-md bg-[#2a78d6] text-white' : 'rounded-2xl rounded-bl-md bg-white text-slate-900 ring-1 ring-slate-200'
                      }`}
                    >
                      {m.attachments.length > 0 && <Attachments items={m.attachments} mine={mine} onMediaLoad={keepBottom} />}
                      {editingId === m.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault()
                            edit.mutate({ id: m.id, text: editText })
                          }}
                          className="space-y-1.5"
                        >
                          <textarea
                            autoFocus
                            rows={Math.min(6, editText.split('\n').length + 1)}
                            maxLength={4000}
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                edit.mutate({ id: m.id, text: editText })
                              }
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                            className="w-72 max-w-full resize-y rounded-md bg-white/95 px-2 py-1.5 text-sm text-slate-900 outline-none"
                          />
                          <div className="flex justify-end gap-1.5 text-xs">
                            <button type="button" onClick={() => setEditingId(null)} className="rounded px-2 py-1 text-white/80 hover:bg-white/15">
                              Bekor (Esc)
                            </button>
                            <button disabled={edit.isPending} className="rounded bg-white px-2 py-1 font-medium text-[#2a78d6] disabled:opacity-60">
                              Saqlash
                            </button>
                          </div>
                          {edit.error && <p className="text-xs text-amber-100">{edit.error.message}</p>}
                        </form>
                      ) : (
                        m.body && <MentionText text={m.body} usernames={usernames} onDark={mine} />
                      )}
                      <p className={`text-right text-[11px] leading-none ${mine ? 'text-white/70' : 'text-slate-400'}`}>
                        {m.editedAt && 'tahrirlangan · '}
                        {time(m.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottom} />
      </div>

      {canWrite ? (
        <form onSubmit={submit} className="relative border-t border-slate-100 bg-white p-3">
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

          <PendingFiles items={pending} onRemove={(key) => dropPending(new Set([key]))} />

          <div className="flex items-end gap-2">
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              aria-label="Fayl biriktirish"
              title="Fayl biriktirish (yoki rasmni Ctrl/⌘+V bilan joylang)"
              onClick={() => fileInput.current?.click()}
              className="flex size-10 shrink-0 items-center justify-center rounded-md text-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              📎
            </button>
            <textarea
              ref={textarea}
              rows={1}
              maxLength={4000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onPaste={onPaste}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) submit(e)
              }}
              placeholder="Xabar yozing… (@ — belgilash, rasmni joylash — Ctrl/⌘+V)"
              className="max-h-40 min-h-10 flex-1 resize-y rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
            <Button disabled={send.isPending || (!body.trim() && pending.length === 0)}>{send.isPending ? 'Yuborilmoqda…' : 'Yuborish'}</Button>
          </div>
          {notice && <p className="mt-1 text-xs text-amber-700">{notice}</p>}
          <ErrorText error={send.error} />
        </form>
      ) : (
        <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-500">{project.status === 'ARCHIVED' ? 'Loyiha arxivda: yozib bo‘lmaydi.' : 'Sizda bu chatga yozish ruxsati yo‘q.'}</p>
      )}
    </section>
  )
}
