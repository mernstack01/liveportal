import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api'
import { Avatar, Button, ErrorText, inputClass, Modal } from '../components/ui'
import { keys } from '../queries'
import type { Incident, IncidentSeverity, ProjectDetail } from '../types'
import { fromLocalInput, SEVERITIES, SEVERITY_INFO } from './labels'

/** Insident ochish: nima bo'ldi, qanchalik og'ir, kim shug'ullanadi, qachon boshlangan. */
export function CreateIncidentDialog({ project, userId, onClose }: { project: ProjectDetail; userId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const staff = project.members.filter((m) => !m.isClient)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<IncidentSeverity>('SEV2')
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState('')

  const create = useMutation({
    mutationFn: () =>
      api<Incident>(`/projects/${project.id}/incidents`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          description: description.trim() || undefined,
          severity,
          ownerId: ownerId ?? undefined,
          startedAt: startedAt ? fromLocalInput(startedAt) : undefined,
        }),
      }),
    onSuccess: (incident) => {
      void queryClient.invalidateQueries({ queryKey: keys.incidents(project.id) })
      void queryClient.invalidateQueries({ queryKey: keys.project(project.id) })
      onClose()
      void navigate(`/projects/${project.id}/incidents/${incident.number}`)
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (title.trim()) create.mutate()
  }

  return (
    <Modal open onClose={onClose} title={`Yangi insident · ${project.key}`}>
      <form onSubmit={submit} className="space-y-4">
        <input
          data-autofocus
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nima ishlamayapti? Masalan: to‘lov o‘tmayapti"
          className={`${inputClass} text-base font-medium`}
        />
        <textarea
          rows={3}
          maxLength={10_000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Belgilari: xato matni, kimlarga ta’sir qilyapti, qayerda ko‘rindi…"
          className={inputClass}
        />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Daraja</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {SEVERITIES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={severity === s}
                onClick={() => setSeverity(s)}
                className={`flex items-start gap-2 rounded-lg p-2.5 text-left ring-1 ${severity === s ? 'bg-slate-50 ring-2 ring-slate-900' : 'bg-white ring-slate-200 hover:ring-slate-400'}`}
              >
                <span className={`mt-1 size-2.5 shrink-0 rounded-full ${SEVERITY_INFO[s].dot}`} />
                <span>
                  <span className="block text-sm font-medium">
                    {s} · {SEVERITY_INFO[s].label}
                  </span>
                  <span className="block text-xs text-slate-500">{SEVERITY_INFO[s].hint}</span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            Mas’ul <span className="font-normal text-slate-500">— bo‘lmasa, jamoa xabarni olib, kimdir o‘zi oladi</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setOwnerId(null)}
              className={`rounded-full px-3 py-1.5 text-sm ring-1 ${ownerId === null ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-300 hover:ring-slate-500'}`}
            >
              Hali yo‘q
            </button>
            {staff.map((m) => (
              <button
                key={m.userId}
                type="button"
                aria-pressed={ownerId === m.userId}
                onClick={() => setOwnerId(m.userId)}
                className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm ring-1 ${ownerId === m.userId ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-800 ring-slate-300 hover:ring-slate-500'}`}
              >
                <Avatar person={m} size="sm" />
                {m.userId === userId ? `${m.name} (men)` : m.name}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block space-y-1">
          <span className="text-sm font-medium">
            Qachon boshlangan <span className="font-normal text-slate-500">— bo‘sh qolsa, hozir</span>
          </span>
          <input type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} className={`${inputClass} sm:w-60`} />
        </label>

        <p className="text-xs text-slate-500">Ochilishi bilan loyiha jamoasiga Telegram’da xabar boradi (mijozga emas).</p>
        <ErrorText error={create.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button disabled={create.isPending || !title.trim()}>{create.isPending ? 'Ochilmoqda…' : '🚨 Insident ochish'}</Button>
        </div>
      </form>
    </Modal>
  )
}
