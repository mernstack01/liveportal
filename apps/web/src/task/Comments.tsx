import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { api } from '../api'
import { Avatar, Button, ErrorText } from '../components/ui'
import { formatDateTime } from '../labels'
import { keys } from '../queries'
import type { Member, TaskDetail } from '../types'
import { MentionText } from './MentionText'

export function Comments({
  task,
  members,
  queryRef,
  canComment,
}: {
  task: TaskDetail
  members: Member[]
  queryRef: string
  canComment: boolean
}) {
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')
  const textarea = useRef<HTMLTextAreaElement>(null)
  const usernames = useMemo(
    () => new Set(members.flatMap((m) => (m.telegramUsername ? [m.telegramUsername.toLowerCase()] : []))),
    [members],
  )

  const send = useMutation({
    mutationFn: () => api(`/projects/${task.project.id}/tasks/${task.id}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
    onSuccess: () => {
      setBody('')
      void queryClient.invalidateQueries({ queryKey: keys.task(task.project.id, queryRef) })
    },
  })

  // Oxirgi so'z `@...` bo'lsa, loyiha a'zolaridan taklif.
  const partial = /(?:^|\s)@([A-Za-z0-9_]*)$/.exec(body)?.[1]
  const suggestions =
    partial === undefined
      ? []
      : members
          .filter((m) => m.telegramUsername?.toLowerCase().startsWith(partial.toLowerCase()))
          .slice(0, 5)
  const insert = (username: string) => {
    setBody(body.replace(/@([A-Za-z0-9_]*)$/, `@${username} `))
    textarea.current?.focus()
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (body.trim()) send.mutate()
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">Izohlar {task.comments.length > 0 && <span className="font-normal text-slate-500">{task.comments.length}</span>}</h3>
      {task.comments.length === 0 && <p className="text-sm text-slate-500">Hali izoh yo‘q.</p>}
      <ul className="space-y-3">
        {task.comments.map((c) => (
          <li key={c.id} className="flex gap-3">
            {c.author && <Avatar person={c.author} size="sm" />}
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-xs text-slate-500">
                <span className="font-medium text-slate-800">{c.author?.name ?? 'O‘chirilgan foydalanuvchi'}</span> · {formatDateTime(c.createdAt)}
              </p>
              <MentionText text={c.body} usernames={usernames} />
            </div>
          </li>
        ))}
      </ul>

      {canComment && (
        <form onSubmit={submit} className="relative space-y-2">
          <textarea
            ref={textarea}
            rows={3}
            maxLength={5000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e)
            }}
            placeholder="Izoh yozing. @ bilan hamkasbni belgilang, unga Telegram’da xabar boradi."
            className="w-full resize-y rounded-md border border-slate-300 p-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
          {suggestions.length > 0 && (
            <ul role="listbox" aria-label="Kimni belgilash" className="absolute bottom-full left-0 z-10 mb-1 w-64 overflow-hidden rounded-md bg-white shadow-lg ring-1 ring-slate-200">
              {suggestions.map((m) => (
                <li key={m.userId}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => insert(m.telegramUsername!)}
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
          <ErrorText error={send.error} />
          <div className="flex items-center justify-end gap-2 sm:justify-between">
            <span className="hidden text-xs text-slate-400 sm:inline">⌘/Ctrl + Enter — yuborish</span>
            <Button disabled={send.isPending || !body.trim()}>{send.isPending ? 'Yuborilmoqda…' : 'Yuborish'}</Button>
          </div>
        </form>
      )}
    </section>
  )
}
