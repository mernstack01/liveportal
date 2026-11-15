import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { Avatar, Button, ErrorText, inputClass, Modal } from '../components/ui'
import { PRIORITY_LABELS, PRIORITY_STYLES, todayStr } from '../labels'
import { keys } from '../queries'
import { useRoleTitle } from '../roles'
import type { Priority, ProjectDetail, StatusCategory, Task } from '../types'

const PRIORITIES = Object.keys(PRIORITY_LABELS) as Priority[]
const CLOSED: StatusCategory[] = ['DONE', 'CANCELED']

/**
 * Bitrix24 uslubidagi task yaratish: nom, tavsif, mas'ul (jamoadan bitta odam), muddat (sana + ixtiyoriy soat),
 * prioritet va ustun. Mas'ul tanlash faqat task.assign ruxsati bo'lsa ko'rinadi.
 */
/** Insidentdan task: oyna oldindan to'ldiriladi va task insidentga bog'lanadi. */
export interface TaskFromIncident {
  id: string
  key: string
  title: string
  priority: Priority
}

export function CreateTaskDialog({
  project,
  statusId,
  incident,
  onClose,
  onCreated,
}: {
  project: ProjectDetail
  statusId?: string
  incident?: TaskFromIncident
  onClose: () => void
  onCreated?: (task: Task) => void
}) {
  const queryClient = useQueryClient()
  const roleTitle = useRoleTitle()
  const can = (p: string) => project.myPermissions.includes(p)
  const openStatuses = project.statuses.filter((s) => !CLOSED.includes(s.category) || can('task.close'))

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const toggle = (id: string) => setAssigneeIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [priority, setPriority] = useState<Priority>(incident?.priority ?? 'MEDIUM')
  const [status, setStatus] = useState(statusId ?? openStatuses[0]?.id ?? '')

  const create = useMutation({
    mutationFn: () =>
      api<Task>(`/projects/${project.id}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          description: description.trim() || undefined,
          assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
          dueDate: dueDate || undefined,
          dueTime: dueDate && dueTime ? dueTime : undefined,
          priority,
          statusId: status || undefined,
          incidentId: incident?.id,
        }),
      }),
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: keys.tasks(project.id) })
      void queryClient.invalidateQueries({ queryKey: ['my-tasks'] })
      onCreated?.(task)
      onClose()
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (title.trim()) create.mutate()
  }

  return (
    <Modal open onClose={onClose} title={`Yangi task · ${project.key}`}>
      <form onSubmit={submit} className="space-y-4">
        {incident && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            🚨 <b>{incident.key}</b> insidentidan: {incident.title}
          </p>
        )}
        <input
          data-autofocus
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nima qilish kerak?"
          className={`${inputClass} text-base font-medium`}
        />
        <textarea
          rows={3}
          maxLength={10_000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tavsif: natija qanday bo‘lishi kerak, havolalar…"
          className={inputClass}
        />

        {can('task.assign') && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Mas’ullar <span className="font-normal text-slate-500">— bir nechtasini tanlash mumkin; hech kim bo‘lmasa, dasturchilar o‘zlari oladi</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAssigneeIds([])}
                className={`rounded-full px-3 py-1.5 text-sm ring-1 ${assigneeIds.length === 0 ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-300 hover:ring-slate-500'}`}
              >
                Hech kim (o‘zlari oladi)
              </button>
              {project.members.filter((m) => !m.isClient).map((m) => (
                <button
                  key={m.userId}
                  type="button"
                  aria-pressed={assigneeIds.includes(m.userId)}
                  onClick={() => toggle(m.userId)}
                  className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm ring-1 ${assigneeIds.includes(m.userId) ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-800 ring-slate-300 hover:ring-slate-500'}`}
                >
                  <Avatar person={m} size="sm" />
                  {m.name}
                  <span className={assigneeIds.includes(m.userId) ? 'text-xs text-slate-300' : 'text-xs text-slate-400'}>{roleTitle(m.role)}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Muddat</span>
            <input type="date" min={todayStr()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Soat</span>
            <input type="time" value={dueTime} disabled={!dueDate} onChange={(e) => setDueTime(e.target.value)} className={inputClass} />
          </label>
        </div>
        {dueDate && dueTime && <p className="-mt-2 text-xs text-slate-500">Soat o‘tishi bilan mas’ullar, muallif va teamlead’ga Telegram’da xabar boradi.</p>}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Prioritet</legend>
          <div className="flex flex-wrap gap-2">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={priority === p}
                onClick={() => setPriority(p)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ring-1 ${priority === p ? `${PRIORITY_STYLES[p]} ring-slate-500` : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-400'}`}
              >
                {PRIORITY_LABELS[p]}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Ustun</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            {openStatuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <ErrorText error={create.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button disabled={create.isPending || !title.trim()}>{create.isPending ? 'Yaratilmoqda…' : 'Task yaratish'}</Button>
        </div>
      </form>
    </Modal>
  )
}
