import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { api } from '../api'
import { formatDateTime, formatDay } from '../labels'
import { keys } from '../queries'
import type { ProjectDetail } from '../types'
import { Button, ErrorText, inputClass, Modal } from './ui'

/**
 * Loyiha sanalari: boshlanish, muddat (o'zgartirish — sabab bilan, rahbarga boradi) va muddat tarixi.
 * Rahbarga — kelishuv havolasi (pul shu yerda emas, kelishuvda).
 */
export function ProjectDueDate({ project }: { project: ProjectDetail }) {
  const queryClient = useQueryClient()
  const canEdit = project.myPermissions.includes('project.update') && project.status !== 'ARCHIVED'
  const [editing, setEditing] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [date, setDate] = useState(project.dueDate?.slice(0, 10) ?? '')
  const [reason, setReason] = useState('')
  const changes = (project.dueChanges ?? []).filter((c) => c.from)
  const needsReason = !!project.dueDate

  const save = useMutation({
    mutationFn: () =>
      api<ProjectDetail>(`/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify({ dueDate: date || null, dueReason: needsReason ? reason.trim() : undefined }) }),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.project(project.id), updated)
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      setEditing(false)
      setReason('')
    },
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!save.isPending && (!needsReason || reason.trim())) save.mutate()
  }

  if (!project.startDate && !project.dueDate && !canEdit && !project.deal) return null
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
      {project.startDate && <span>Boshlangan: {formatDay(project.startDate)}</span>}
      {project.startDate && (project.dueDate || canEdit) && <span aria-hidden>·</span>}
      {project.dueDate ? <span>Muddat: {formatDay(project.dueDate)}</span> : canEdit && <span>Muddat qo‘yilmagan</span>}
      {canEdit && (
        <button type="button" onClick={() => setEditing(true)} className="rounded px-1 text-slate-500 underline-offset-2 hover:bg-slate-100 hover:text-slate-900 hover:underline">
          {project.dueDate ? 'o‘zgartirish' : 'qo‘yish'}
        </button>
      )}
      {changes.length > 0 && (
        <button type="button" onClick={() => setHistoryOpen(true)} className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800 ring-1 ring-amber-200 hover:ring-amber-400">
          {changes.length} marta o‘zgargan
        </button>
      )}
      {project.deal && (
        <Link to={`/deals/${project.deal.number}`} className="rounded bg-violet-50 px-1.5 py-0.5 font-medium text-violet-700 ring-1 ring-violet-200 hover:ring-violet-400">
          💼 {project.deal.key}
        </Link>
      )}

      {editing && (
        <Modal open onClose={() => setEditing(false)} title="Loyiha muddati">
          <form onSubmit={submit} className="space-y-3">
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Yangi muddat</span>
              <input data-autofocus type="date" value={date} min={project.startDate?.slice(0, 10)} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </label>
            {needsReason && (
              <label className="block space-y-1 text-sm">
                <span className="font-medium">Nima uchun o‘zgaryapti?</span>
                <textarea required rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Masalan: mijoz yangi bo‘lim qo‘shdi" className={inputClass} />
                <span className="block text-xs text-slate-500">Sabab tarixda qoladi va rahbarga Telegram’da boradi.</span>
              </label>
            )}
            <ErrorText error={save.error} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Bekor qilish
              </Button>
              <Button disabled={save.isPending || (needsReason && !reason.trim()) || date === (project.dueDate?.slice(0, 10) ?? '')}>Saqlash</Button>
            </div>
          </form>
        </Modal>
      )}
      {historyOpen && (
        <Modal open onClose={() => setHistoryOpen(false)} title="Muddat tarixi">
          <ol className="space-y-3">
            {changes.map((c) => (
              <li key={c.id} className="text-sm">
                <p>
                  {formatDay(c.from)} → <b>{c.to ? formatDay(c.to) : 'muddatsiz'}</b>
                  <span className="ml-2 text-xs text-slate-400">
                    {c.author.name} · {formatDateTime(c.createdAt)}
                  </span>
                </p>
                <p className="mt-0.5 rounded-md bg-slate-50 px-2.5 py-1.5 text-slate-700">{c.reason}</p>
              </li>
            ))}
          </ol>
        </Modal>
      )}
    </p>
  )
}
