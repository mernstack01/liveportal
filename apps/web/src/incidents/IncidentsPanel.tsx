import { useState } from 'react'
import { Link } from 'react-router'
import { Avatar, Button, ErrorText } from '../components/ui'
import { formatDateTime } from '../labels'
import { useIncidents } from '../queries'
import type { Incident, ProjectDetail } from '../types'
import { usePageTour } from '../onboarding/state'
import { incidentsTour, TOURS } from '../onboarding/tours'
import { CreateIncidentDialog } from './CreateIncidentDialog'
import { incidentDuration, SEVERITY_INFO, STATUS_INFO } from './labels'

type Filter = 'open' | 'resolved' | 'all'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'open', label: 'Hal qilinmagan' },
  { id: 'resolved', label: 'Hal qilingan' },
  { id: 'all', label: 'Hammasi' },
]

function IncidentRow({ projectId, incident }: { projectId: string; incident: Incident }) {
  const resolved = incident.status === 'RESOLVED'
  return (
    <li>
      <Link
        to={`/projects/${projectId}/incidents/${incident.number}`}
        className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-white px-4 py-3 shadow-sm ring-1 hover:ring-slate-400 ${resolved ? 'ring-slate-200' : incident.severity === 'SEV1' ? 'ring-red-300' : 'ring-slate-200'}`}
      >
        <span className={`rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${SEVERITY_INFO[incident.severity].badge}`}>{incident.severity}</span>
        <span className="font-mono text-xs text-slate-500">{incident.key}</span>
        <span className={`min-w-0 flex-1 basis-48 truncate text-sm font-medium ${resolved ? 'text-slate-500' : 'text-slate-900'}`}>{incident.title}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_INFO[incident.status].badge}`}>{STATUS_INFO[incident.status].label}</span>
        <span className="w-40 text-right text-xs text-slate-500" title={`Boshlangan: ${formatDateTime(incident.startedAt)}`}>
          {resolved ? `${incidentDuration(incident.startedAt, incident.resolvedAt)} davom etdi` : `${incidentDuration(incident.startedAt, null)} davom etmoqda`}
        </span>
        {incident.owner ? (
          <span title={`Mas’ul: ${incident.owner.name}`}>
            <Avatar person={incident.owner} size="sm" />
          </span>
        ) : (
          !resolved && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">mas’ulsiz</span>
        )}
      </Link>
    </li>
  )
}

/** Loyihaning "Insidentlar" bo'limi: ochiqlari tepada, eng og'ir daraja birinchi. */
export function IncidentsPanel({ project, userId }: { project: ProjectDetail; userId: string }) {
  const incidents = useIncidents(project.id)
  const [filter, setFilter] = useState<Filter>('open')
  const [creating, setCreating] = useState(false)
  const canManage = project.myPermissions.includes('incident.manage') && project.status !== 'ARCHIVED'
  usePageTour(TOURS.incidents, incidentsTour((p) => project.myPermissions.includes(p)), !incidents.isPending)

  const all = incidents.data ?? []
  const counts = { open: all.filter((i) => i.status !== 'RESOLVED').length, resolved: all.filter((i) => i.status === 'RESOLVED').length, all: all.length }
  const visible = all.filter((i) => filter === 'all' || (filter === 'open') === (i.status !== 'RESOLVED'))

  return (
    <section className="mx-auto max-w-7xl space-y-3 px-4">
      <div className="flex flex-wrap items-center gap-2">
        {canManage && (
          <Button data-tour="incident-new" onClick={() => setCreating(true)}>
            🚨 Insident ochish
          </Button>
        )}
        <div data-tour="incident-filters" className="flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Insidentlar filtri">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-md px-2.5 py-1 text-sm ${filter === f.id ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {f.label} <span className="text-xs text-slate-400">{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      <ErrorText error={incidents.error} />
      {incidents.isPending && <p className="text-sm text-slate-500">Yuklanmoqda…</p>}
      {incidents.data && visible.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <p className="text-2xl">{filter === 'resolved' ? '🗂' : '✅'}</p>
          <p className="mt-2 text-sm font-medium text-slate-700">{filter === 'resolved' ? 'Hal qilingan insident hali yo‘q' : 'Hozir ochiq insident yo‘q'}</p>
          <p className="mt-1 text-sm text-slate-500">Sayt yoki xizmat ishlamay qolsa, shu yerda insident oching: jamoaga darhol xabar boradi.</p>
        </div>
      )}
      <ul className="space-y-2">
        {visible.map((i) => (
          <IncidentRow key={i.id} projectId={project.id} incident={i} />
        ))}
      </ul>
      {creating && <CreateIncidentDialog project={project} userId={userId} onClose={() => setCreating(false)} />}
    </section>
  )
}
