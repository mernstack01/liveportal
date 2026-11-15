import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { api } from '../api'
import { Avatar } from '../components/ui'
import { humanError } from '../labels'
import { keys } from '../queries'
import type { ProjectDetail, StatusCategory, Task, TaskDetail } from '../types'

const CLOSED: StatusCategory[] = ['DONE', 'CANCELED']

/**
 * Kichik vazifalar (Jira'dagi sub-task): katta ishni bo'laklarga bo'lish.
 * Belgilash — "Done" ustuniga o'tkazadi; buni mas'ul o'zi qila oladi (ota task esa teamlead nazoratida).
 */
export function Subtasks({ task, project, queryRef, canCreate, canUpdate }: { task: TaskDetail; project: ProjectDetail; queryRef: string; canCreate: boolean; canUpdate: boolean }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const doneStatus = project.statuses.find((s) => s.category === 'DONE')
  const openStatus = project.statuses.find((s) => s.category === 'TODO') ?? project.statuses[0]

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: keys.task(project.id, queryRef) })
    void queryClient.invalidateQueries({ queryKey: keys.tasks(project.id) })
    void queryClient.invalidateQueries({ queryKey: ['my-tasks'] })
  }
  const add = useMutation({
    mutationFn: () => api<Task>(`/projects/${project.id}/tasks`, { method: 'POST', body: JSON.stringify({ title, parentId: task.id }) }),
    onMutate: () => setError(null),
    onSuccess: () => {
      setTitle('')
      refresh()
    },
    onError: (e) => setError(humanError(e)),
  })
  const toggle = useMutation({
    mutationFn: ({ sub, done }: { sub: Task; done: boolean }) =>
      api<Task>(`/projects/${project.id}/tasks/${sub.id}`, { method: 'PATCH', body: JSON.stringify({ statusId: (done ? doneStatus : openStatus)?.id }) }),
    // Belgi darhol o'zgaradi; server rad etsa, refresh() haqiqiy holatni qaytaradi.
    onMutate: ({ sub, done }) => {
      setError(null)
      const status = done ? doneStatus : openStatus
      if (!status) return
      queryClient.setQueryData<TaskDetail>(keys.task(project.id, queryRef), (old) => {
        if (!old) return old
        const subtasks = old.subtasks.map((s) => (s.id === sub.id ? { ...s, status: { id: status.id, name: status.name, category: status.category, color: status.color } } : s))
        return { ...old, subtasks, subtaskCount: { total: subtasks.length, done: subtasks.filter((s) => CLOSED.includes(s.status.category)).length } }
      })
    },
    onSettled: refresh,
    onError: (e) => setError(humanError(e)),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (title.trim()) add.mutate()
  }
  const { total, done } = task.subtaskCount
  if (total === 0 && !canCreate) return null

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold text-slate-900">Kichik vazifalar</h3>
        {total > 0 && (
          <>
            <span className="text-xs text-slate-500">
              {done}/{total}
            </span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden>
              <span className="block h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.round((done / total) * 100)}%` }} />
            </span>
          </>
        )}
      </div>
      {task.subtasks.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
          {task.subtasks.map((sub) => {
            const closed = CLOSED.includes(sub.status.category)
            return (
              <li key={sub.id} className="flex items-center gap-2.5 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label={`${sub.key} bajarildi`}
                  checked={closed}
                  disabled={!canUpdate || toggle.isPending || !doneStatus}
                  onChange={(e) => toggle.mutate({ sub, done: e.target.checked })}
                  className="size-4 shrink-0 rounded border-slate-300 accent-emerald-600"
                />
                <Link to={`/projects/${project.id}/tasks/${sub.number}`} className="flex min-w-0 flex-1 items-center gap-2 hover:underline">
                  <span className="shrink-0 font-mono text-xs text-slate-500">{sub.key}</span>
                  <span className={`truncate text-sm ${closed ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{sub.title}</span>
                </Link>
                {!closed && sub.status.category !== 'TODO' && (
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-white" style={{ backgroundColor: sub.status.color ?? '#64748b' }}>
                    {sub.status.name}
                  </span>
                )}
                <span className="flex shrink-0 -space-x-1.5">
                  {sub.assignees.slice(0, 2).map((a) => (
                    <span key={a.userId} className="rounded-full ring-2 ring-white">
                      <Avatar person={a} size="sm" />
                    </span>
                  ))}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {canCreate && (
        <form onSubmit={submit} className="flex gap-2">
          <input
            aria-label="Yangi kichik vazifa"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="+ Kichik vazifa qo‘shish (Enter)"
            className="w-full rounded-md border border-dashed border-slate-300 px-2.5 py-1.5 text-sm outline-none hover:border-slate-400 focus:border-solid focus:border-slate-500"
          />
        </form>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  )
}
