import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { api, ApiError } from '../api'
import { Avatar, Button, ErrorText } from '../components/ui'
import { formatDateTime, humanError } from '../labels'
import { useMe } from '../me'
import { keys, useIncident, useProject } from '../queries'
import type { Incident, IncidentDetail, IncidentSeverity, IncidentStatus, IncidentUpdate, ProjectDetail } from '../types'
import { fromLocalInput, incidentDuration, INCIDENT_STATUSES, SEVERITIES, SEVERITY_INFO, STATUS_INFO, toLocalInput } from './labels'

const fieldClass =
  'w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none hover:border-slate-300 focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500'

type Patch = Partial<{
  title: string
  description: string | null
  severity: IncidentSeverity
  status: IncidentStatus
  ownerId: string | null
  resolution: string | null
  startedAt: string
}>

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-center gap-3">
      <span className="text-sm text-slate-500">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Matnli maydon: o'zgarsa "Saqlash" chiqadi. */
function TextBlock({
  label,
  value,
  placeholder,
  disabled,
  saving,
  onSave,
}: {
  label: string
  value: string
  placeholder: string
  disabled: boolean
  saving: boolean
  onSave: (text: string) => void
}) {
  // Saqlangan qiymat o'zgarsa, ota komponent `key` orqali qayta yaratadi.
  const [text, setText] = useState(value)
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{label}</h3>
      <textarea
        aria-label={label}
        rows={3}
        maxLength={10_000}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="w-full resize-y rounded-md border border-slate-200 p-2.5 text-sm outline-none hover:border-slate-300 focus:border-slate-500 disabled:bg-slate-50"
      />
      {text !== value && (
        <div className="flex gap-2">
          <Button onClick={() => onSave(text)} disabled={saving}>
            Saqlash
          </Button>
          <Button variant="ghost" onClick={() => setText(value)}>
            Bekor qilish
          </Button>
        </div>
      )}
    </section>
  )
}

/** Xronologiya yozuvi odam tilida. */
function describe(u: IncidentUpdate, nameOf: (userId: string | null) => string): ReactNode {
  switch (u.kind) {
    case 'created':
      return <>insident ochdi{u.to ? ` (${u.to})` : ''}</>
    case 'status':
      return (
        <>
          holatni <b>{STATUS_INFO[u.to as IncidentStatus]?.label ?? u.to}</b> ga o‘zgartirdi
        </>
      )
    case 'severity':
      return (
        <>
          darajani {u.from} → <b>{u.to}</b> qildi
        </>
      )
    case 'owner':
      return u.to ? (
        <>
          mas’ulni <b>{nameOf(u.to)}</b> qildi
        </>
      ) : (
        <>mas’ulni olib tashladi</>
      )
    default:
      return null
  }
}

const KIND_ICON: Record<string, string> = { created: '🚨', status: '🔄', severity: '⚠️', owner: '🧯', note: '📝' }

function Timeline({ incident, project, canWrite, queryRef }: { incident: IncidentDetail; project: ProjectDetail; canWrite: boolean; queryRef: string }) {
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')
  const nameOf = (userId: string | null) => project.members.find((m) => m.userId === userId)?.name ?? 'kimdir'
  const note = useMutation({
    mutationFn: () => api<IncidentUpdate>(`/projects/${project.id}/incidents/${incident.number}/updates`, { method: 'POST', body: JSON.stringify({ body }) }),
    onSuccess: (update) => {
      setBody('')
      queryClient.setQueryData<IncidentDetail>(keys.incident(project.id, queryRef), (old) => (old ? { ...old, updates: [...old.updates, update] } : old))
      void queryClient.invalidateQueries({ queryKey: keys.incidents(project.id) })
    },
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (body.trim()) note.mutate()
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">Xronologiya</h3>
      <ol className="space-y-3 border-l border-slate-200 pl-4">
        {incident.updates.map((u) => (
          <li key={u.id} className="relative">
            <span className="absolute -left-[1.6rem] top-0 flex size-5 items-center justify-center rounded-full bg-white text-xs ring-1 ring-slate-200">{KIND_ICON[u.kind] ?? '•'}</span>
            <p className="text-sm text-slate-700">
              <span className="font-medium text-slate-900">{u.author?.name ?? 'Kimdir'}</span> {u.kind !== 'note' && describe(u, nameOf)}
              <span className="ml-2 text-xs text-slate-400">{formatDateTime(u.createdAt)}</span>
            </p>
            {u.kind === 'note' && <p className="mt-1 whitespace-pre-wrap rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-800">{u.body}</p>}
          </li>
        ))}
      </ol>
      {canWrite && (
        <form onSubmit={submit} className="space-y-2">
          <textarea
            aria-label="Yangilanish"
            rows={2}
            maxLength={4000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && submit(e)}
            placeholder="Nima qilindi, nima topildi? Masalan: serverni qayta ishga tushirdik, kuzatyapmiz"
            className="w-full resize-y rounded-md border border-slate-200 p-2.5 text-sm outline-none hover:border-slate-300 focus:border-slate-500"
          />
          <ErrorText error={note.error} />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Mas’ul va xabar berganga Telegram’da boradi</span>
            <Button disabled={note.isPending || !body.trim()}>Yozish</Button>
          </div>
        </form>
      )}
    </section>
  )
}

function IncidentBody({ incident, project, queryRef }: { incident: IncidentDetail; project: ProjectDetail; queryRef: string }) {
  const queryClient = useQueryClient()
  const { me } = useMe()
  const [error, setError] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [resolution, setResolution] = useState(incident.resolution ?? '')
  const canWrite = project.myPermissions.includes('incident.manage') && project.status !== 'ARCHIVED'
  const staff = project.members.filter((m) => !m.isClient)
  const resolved = incident.status === 'RESOLVED'

  const update = useMutation({
    mutationFn: (patch: Patch) => api<Incident>(`/projects/${project.id}/incidents/${incident.number}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onMutate: () => setError(null),
    onSuccess: () => {
      setResolving(false)
      // Xronologiya ham o'zgaradi, shuning uchun to'liq qayta yuklanadi.
      void queryClient.invalidateQueries({ queryKey: keys.incident(project.id, queryRef) })
      void queryClient.invalidateQueries({ queryKey: keys.incidents(project.id) })
      void queryClient.invalidateQueries({ queryKey: keys.project(project.id) })
    },
    onError: (e) => setError(humanError(e)),
  })
  const save = (patch: Patch) => update.mutate(patch)

  const pickStatus = (status: IncidentStatus) => {
    if (status === incident.status) return
    if (status === 'RESOLVED') setResolving(true)
    else save({ status })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${SEVERITY_INFO[incident.severity].badge}`}>
            {incident.severity} · {SEVERITY_INFO[incident.severity].label}
          </span>
          <span className="text-xs text-slate-500">
            {resolved ? `${incidentDuration(incident.startedAt, incident.resolvedAt)} davom etdi` : `${incidentDuration(incident.startedAt, null)} davom etmoqda`}
          </span>
        </div>
        <h2 className="text-lg font-semibold text-slate-900">{incident.title}</h2>
      </div>

      {/* Holat bosqichlari: Ochiq → Tekshirilmoqda → Kuzatuvda → Hal qilindi */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="group" aria-label="Holat">
        {INCIDENT_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={incident.status === s}
            disabled={!canWrite || update.isPending}
            onClick={() => pickStatus(s)}
            className={`rounded-md px-2 py-1.5 text-xs font-medium ${incident.status === s ? STATUS_INFO[s].badge : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:text-slate-900 hover:ring-slate-400 disabled:hover:text-slate-500 disabled:hover:ring-slate-200'}`}
          >
            {STATUS_INFO[s].label}
          </button>
        ))}
      </div>

      {resolving && (
        <form
          className="space-y-2 rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-200"
          onSubmit={(e) => {
            e.preventDefault()
            save({ status: 'RESOLVED', resolution: resolution.trim() || null })
          }}
        >
          <label className="block space-y-1">
            <span className="text-sm font-medium text-emerald-900">Sabab va yechim</span>
            <textarea
              data-autofocus
              rows={3}
              maxLength={10_000}
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder="Nima sabab bo‘ldi va qanday tuzatildi? Keyingi safar oldini olish uchun nima qilamiz?"
              className="w-full rounded-md border border-emerald-200 bg-white p-2.5 text-sm outline-none focus:border-emerald-500"
            />
          </label>
          <div className="flex gap-2">
            <Button disabled={update.isPending}>✅ Hal qilindi</Button>
            <Button type="button" variant="ghost" onClick={() => setResolving(false)}>
              Bekor qilish
            </Button>
          </div>
        </form>
      )}

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="space-y-3">
        <Row label="Daraja">
          <select
            aria-label="Daraja"
            value={incident.severity}
            disabled={!canWrite}
            onChange={(e) => save({ severity: e.target.value as IncidentSeverity })}
            className={fieldClass}
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s} · {SEVERITY_INFO[s].label}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Mas’ul">
          <div className="flex items-center gap-2">
            <select aria-label="Mas’ul" value={incident.owner?.userId ?? ''} disabled={!canWrite} onChange={(e) => save({ ownerId: e.target.value || null })} className={fieldClass}>
              <option value="">— Hali yo‘q</option>
              {staff.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
            {canWrite && incident.owner?.userId !== me.id && staff.some((m) => m.userId === me.id) && !resolved && (
              <Button type="button" variant="secondary" className="shrink-0 px-2.5 py-1.5 text-xs" disabled={update.isPending} onClick={() => save({ ownerId: me.id })}>
                🙋 Men olaman
              </Button>
            )}
          </div>
        </Row>
        <Row label="Boshlangan">
          <input
            type="datetime-local"
            aria-label="Boshlangan vaqt"
            key={incident.startedAt}
            defaultValue={toLocalInput(incident.startedAt)}
            disabled={!canWrite}
            // Har bir raqam terilganda emas, maydondan chiqqanda saqlanadi.
            onBlur={(e) => e.target.value && e.target.value !== toLocalInput(incident.startedAt) && save({ startedAt: fromLocalInput(e.target.value) })}
            className={fieldClass}
          />
        </Row>
        {incident.resolvedAt && <Row label="Hal qilingan">{<span className="text-sm text-slate-700">{formatDateTime(incident.resolvedAt)}</span>}</Row>}
        <Row label="Xabar berdi">
          {incident.reporter && (
            <span className="flex items-center gap-2 text-sm">
              <Avatar person={incident.reporter} size="sm" />
              {incident.reporter.name}
              <span className="text-xs text-slate-400">· {formatDateTime(incident.createdAt)}</span>
            </span>
          )}
        </Row>
      </div>

      <TextBlock
        key={`d:${incident.description ?? ''}`}
        label="Tavsif"
        value={incident.description ?? ''}
        placeholder="Belgilari, kimlarga ta’sir qilyapti, havolalar…"
        disabled={!canWrite}
        saving={update.isPending}
        onSave={(text) => save({ description: text.trim() || null })}
      />
      {resolved && (
        <TextBlock
          key={`r:${incident.resolution ?? ''}`}
          label="Sabab va yechim"
          value={incident.resolution ?? ''}
          placeholder="Nima sabab bo‘ldi va qanday tuzatildi?"
          disabled={!canWrite}
          saving={update.isPending}
          onSave={(text) => save({ resolution: text.trim() || null })}
        />
      )}
      <Timeline incident={incident} project={project} canWrite={canWrite} queryRef={queryRef} />
    </div>
  )
}

/** `/projects/:projectId/incidents/:incidentRef` — ro'yxat ustida o'ng panel (telefonda to'liq ekran). */
export function IncidentDrawer() {
  const { projectId = '', incidentRef = '' } = useParams()
  const navigate = useNavigate()
  const project = useProject(projectId)
  const incident = useIncident(projectId, incidentRef)
  const close = () => void navigate(`/projects/${projectId}/incidents`)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && void navigate(`/projects/${projectId}/incidents`)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, projectId])

  const notFound = incident.error instanceof ApiError && incident.error.status === 404
  const data = incident.data

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <button aria-label="Yopish" onClick={close} className="absolute inset-0 bg-slate-900/30" />
      <aside role="dialog" aria-modal="true" aria-label={data?.key ?? 'Insident'} className="relative flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-xl">
        <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-3">
          <span className="font-mono text-sm font-medium text-slate-500">{data ? `${project.data?.key ?? ''} · ${data.key}` : '…'}</span>
          {data && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_INFO[data.status].badge}`}>{STATUS_INFO[data.status].label}</span>}
          <button onClick={close} aria-label="Yopish" className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {(incident.isPending || project.isPending) && <p className="text-sm text-slate-500">Yuklanmoqda…</p>}
          {notFound && <p className="text-sm text-slate-600">Insident topilmadi. Havola noto‘g‘ri bo‘lishi mumkin.</p>}
          {!notFound && <ErrorText error={incident.error ?? project.error} />}
          {data && project.data && <IncidentBody key={data.id} incident={data} project={project.data} queryRef={incidentRef} />}
        </div>
      </aside>
    </div>
  )
}
