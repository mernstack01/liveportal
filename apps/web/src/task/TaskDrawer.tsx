import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { api, ApiError } from '../api'
import { Avatar, Button, ErrorText } from '../components/ui'
import { formatDateTime, humanError, isOverdue, PRIORITY_LABELS } from '../labels'
import { useMe } from '../me'
import { keys, useProject, useTask } from '../queries'
import type { Priority, ProjectDetail, StatusCategory, TaskDetail } from '../types'
import { Comments } from './Comments'

const CLOSED: StatusCategory[] = ['DONE', 'CANCELED']
const PRIORITIES = Object.keys(PRIORITY_LABELS) as Priority[]
const fieldClass =
  'w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none hover:border-slate-300 focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500'

type Patch = Partial<{
  title: string
  description: string | null
  priority: Priority
  dueDate: string | null
  dueTime: string | null
  assigneeIds: string[]
  statusId: string
}>

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-center gap-3">
      <span className="text-sm text-slate-500">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function TitleField({ value, disabled, onSave }: { value: string; disabled: boolean; onSave: (title: string) => void }) {
  const [title, setTitle] = useState(value)
  const commit = () => {
    const next = title.trim()
    if (!next) setTitle(value)
    else if (next !== value) onSave(next)
  }
  return (
    <input
      aria-label="Task nomi"
      value={title}
      disabled={disabled}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      maxLength={200}
      className="-mx-2 w-[calc(100%+1rem)] rounded-md border border-transparent px-2 py-1 text-lg font-semibold text-slate-900 outline-none hover:border-slate-200 focus:border-slate-400 disabled:bg-transparent"
    />
  )
}

function DescriptionField({ value, saving, onSave }: { value: string; saving: boolean; onSave: (description: string) => void }) {
  const [description, setDescription] = useState(value)
  return (
    <>
      <textarea
        aria-label="Tavsif"
        rows={5}
        maxLength={10_000}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Nima qilish kerak, qanday tekshiriladi, havolalar…"
        className="w-full resize-y rounded-md border border-slate-200 p-2.5 text-sm outline-none hover:border-slate-300 focus:border-slate-500"
      />
      {description !== value && (
        <div className="flex gap-2">
          <Button onClick={() => onSave(description)} disabled={saving}>
            Saqlash
          </Button>
          <Button variant="ghost" onClick={() => setDescription(value)}>
            Bekor qilish
          </Button>
        </div>
      )}
    </>
  )
}

function TaskBody({ task, project, queryRef }: { task: TaskDetail; project: ProjectDetail; queryRef: string }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const archived = project.status === 'ARCHIVED'
  const can = (p: string) => !archived && project.myPermissions.includes(p)
  const isClosed = CLOSED.includes(task.status.category)
  const { me } = useMe()
  const assigneeIds = task.assignees.map((a) => a.userId)
  const iAmAssignee = assigneeIds.includes(me.id)
  const isMember = project.members.some((m) => m.userId === me.id)

  const update = useMutation({
    mutationFn: (patch: Patch) =>
      api<TaskDetail>(`/projects/${project.id}/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onMutate: () => setError(null),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.task(project.id, queryRef), updated)
      void queryClient.invalidateQueries({ queryKey: keys.tasks(project.id) })
      void queryClient.invalidateQueries({ queryKey: ['my-tasks'] })
    },
    onError: (e) => setError(humanError(e)),
  })
  const save = (patch: Patch) => update.mutate(patch)

  /** "Men olaman" / "Taskdan chiqish" — o'zini mas'ullarga qo'shish (task.update yetarli). */
  const claim = useMutation({
    mutationFn: (join: boolean) => api<TaskDetail>(`/projects/${project.id}/tasks/${task.id}/claim`, { method: join ? 'POST' : 'DELETE' }),
    onMutate: () => setError(null),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.task(project.id, queryRef), updated)
      void queryClient.invalidateQueries({ queryKey: keys.tasks(project.id) })
      void queryClient.invalidateQueries({ queryKey: ['my-tasks'] })
    },
    onError: (e) => setError(humanError(e)),
  })

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        {/* key: boshqa odam o'zgartirsa (15 soniyalik yangilanish), maydon server qiymatidan qayta boshlanadi */}
        <TitleField key={task.title} value={task.title} disabled={!can('task.update')} onSave={(title) => save({ title })} />
        {update.isPending && <p className="text-xs text-slate-400">Saqlanmoqda…</p>}
        {error && (
          <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
            {error}
          </p>
        )}
      </div>

      <div className="space-y-2.5">
        <Row label="Holat">
          <select
            aria-label="Holat"
            value={task.status.id}
            disabled={!can('task.update') || (isClosed && !can('task.close'))}
            onChange={(e) => save({ statusId: e.target.value })}
            className={fieldClass}
          >
            {project.statuses.map((s) => (
              <option key={s.id} value={s.id} disabled={CLOSED.includes(s.category) && !can('task.close')}>
                {s.name}
                {CLOSED.includes(s.category) && !can('task.close') ? ' (teamlead)' : ''}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Mas’ullar">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {can('task.assign')
                ? // Tayinlash huquqi bor odam: bosib qo'shadi yoki olib tashlaydi (bir nechta odam).
                  project.members.map((m) => {
                    const on = assigneeIds.includes(m.userId)
                    return (
                      <button
                        key={m.userId}
                        type="button"
                        aria-pressed={on}
                        onClick={() => save({ assigneeIds: on ? assigneeIds.filter((id) => id !== m.userId) : [...assigneeIds, m.userId] })}
                        className={`flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-xs ring-1 ${on ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-400'}`}
                      >
                        <Avatar person={m} size="sm" />
                        {m.name}
                      </button>
                    )
                  })
                : task.assignees.map((a) => (
                    <span key={a.userId} className="flex items-center gap-1.5 rounded-full bg-slate-100 py-0.5 pl-0.5 pr-2.5 text-xs text-slate-700">
                      <Avatar person={a} size="sm" />
                      {a.name}
                    </span>
                  ))}
              {!can('task.assign') && task.assignees.length === 0 && <span className="text-sm text-amber-700">Hali hech kim olmagan</span>}
            </div>
            {/* Dasturchi o'zi oladi: egasiz taskni yoki boshqalarga qo'shilib */}
            {can('task.update') && isMember && (
              <div className="flex gap-2">
                {iAmAssignee ? (
                  <Button type="button" variant="ghost" className="px-2 py-1 text-xs" disabled={claim.isPending} onClick={() => claim.mutate(false)}>
                    Taskdan chiqish
                  </Button>
                ) : (
                  <Button type="button" variant="secondary" className="px-2.5 py-1 text-xs" disabled={claim.isPending} onClick={() => claim.mutate(true)}>
                    🙋 {task.assignees.length === 0 ? 'Men olaman' : 'Men ham qo‘shilaman'}
                  </Button>
                )}
              </div>
            )}
          </div>
        </Row>
        <Row label="Prioritet">
          <select aria-label="Prioritet" value={task.priority} disabled={!can('task.update')} onChange={(e) => save({ priority: e.target.value as Priority })} className={fieldClass}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Muddat">
          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label="Muddat"
              value={task.dueDate?.slice(0, 10) ?? ''}
              disabled={!can('task.update')}
              onChange={(e) => save({ dueDate: e.target.value || null })}
              className={`${fieldClass} min-w-0 flex-1 ${!isClosed && isOverdue(task.dueDate, task.dueTime) ? 'border-red-300 text-red-700' : ''}`}
            />
            {/* Soat ixtiyoriy: bo'lsa, shu daqiqa o'tishi bilan Telegram'ga "muddati o'tdi" boradi */}
            <input
              type="time"
              aria-label="Muddat soati"
              value={task.dueTime ?? ''}
              disabled={!can('task.update') || !task.dueDate}
              onChange={(e) => save({ dueTime: e.target.value || null })}
              className={`${fieldClass} w-28! shrink-0 ${!isClosed && isOverdue(task.dueDate, task.dueTime) ? 'border-red-300 text-red-700' : ''}`}
            />
            {!isClosed && isOverdue(task.dueDate, task.dueTime) && <span className="shrink-0 text-xs font-medium text-red-600">kechikdi</span>}
          </div>
        </Row>
        <Row label="Muallif">
          <span className="flex items-center gap-2 text-sm">
            {task.reporter && <Avatar person={task.reporter} size="sm" />}
            {task.reporter?.name ?? '—'}
            <span className="text-xs text-slate-400">· {formatDateTime(task.createdAt)}</span>
          </span>
        </Row>
        {task.completedAt && (
          <Row label="Yopilgan">
            <span className="text-sm">{formatDateTime(task.completedAt)}</span>
          </Row>
        )}
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">Tavsif</h3>
        {can('task.update') ? (
          <DescriptionField
            key={task.description ?? ''}
            value={task.description ?? ''}
            saving={update.isPending}
            onSave={(description) => save({ description: description.trim() || null })}
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm text-slate-700">{task.description || <span className="text-slate-400">Tavsif yo‘q.</span>}</p>
        )}
      </section>

      <Comments task={task} members={project.members} queryRef={queryRef} canComment={can('task.comment')} />
    </div>
  )
}

/** `/projects/:projectId/tasks/:taskRef` — board ustida o'ng panel (telefonda to'liq ekran). */
export function TaskDrawer() {
  const { projectId = '', taskRef = '' } = useParams()
  const navigate = useNavigate()
  const project = useProject(projectId)
  const task = useTask(projectId, taskRef)
  const close = () => void navigate(`/projects/${projectId}`)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && void navigate(`/projects/${projectId}`)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, projectId])

  const notFound = task.error instanceof ApiError && task.error.status === 404

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <button aria-label="Yopish" onClick={close} className="absolute inset-0 bg-slate-900/30" />
      <aside role="dialog" aria-modal="true" aria-label={task.data?.key ?? 'Task'} className="relative flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-xl">
        <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-3">
          <span className="font-mono text-sm font-medium text-slate-500">{task.data?.key ?? '…'}</span>
          {task.data && (
            <span className="rounded px-1.5 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: task.data.status.color ?? '#64748b' }}>
              {task.data.status.name}
            </span>
          )}
          <button onClick={close} aria-label="Yopish" className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {(task.isPending || project.isPending) && <p className="text-sm text-slate-500">Yuklanmoqda…</p>}
          {notFound && <p className="text-sm text-slate-600">Task topilmadi. U o‘chirilgan yoki havola noto‘g‘ri.</p>}
          {!notFound && <ErrorText error={task.error ?? project.error} />}
          {task.data && project.data && <TaskBody task={task.data} project={project.data} queryRef={taskRef} />}
        </div>
      </aside>
    </div>
  )
}
