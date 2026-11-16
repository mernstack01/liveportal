import { useState } from 'react'
import { Link } from 'react-router'
import { CreateProjectDialog } from '../components/CreateProjectDialog'
import { Badge, Button, ErrorText, Spinner } from '../components/ui'
import { formatDay, isOverdue, PROJECT_STATUS_LABELS, PROJECT_STATUS_STYLES } from '../labels'
import { useRoleTitle } from '../roles'
import { useMe } from '../me'
import { useProjects, useRoles } from '../queries'
import { usePageTour } from '../onboarding/state'
import { clientWelcomeTour, TOURS, welcomeTour } from '../onboarding/tours'
import type { ProjectSummary } from '../types'

function ProjectCard({ project, tour }: { project: ProjectSummary; tour?: boolean }) {
  const roleLabel = useRoleTitle()
  const late = project.status !== 'COMPLETED' && project.status !== 'ARCHIVED' && isOverdue(project.dueDate)
  return (
    <Link
      data-tour={tour ? 'project-card' : undefined}
      to={`/projects/${project.id}`}
      className="group flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:ring-slate-400"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-xs font-semibold text-white">{project.key}</span>
        <Badge className={PROJECT_STATUS_STYLES[project.status]}>{PROJECT_STATUS_LABELS[project.status]}</Badge>
      </div>
      <div className="min-w-0">
        <h2 className="truncate font-medium group-hover:underline">{project.name}</h2>
        {project.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{project.description}</p>}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>{project.memberCount} a’zo</span>
        <span>Siz: {project.myRole ? roleLabel(project.myRole) : 'kuzatuvchi'}</span>
        {project.dueDate && <span className={late ? 'font-medium text-red-600' : ''}>Muddat: {formatDay(project.dueDate)}</span>}
      </div>
    </Link>
  )
}

export function ProjectsPage() {
  const { me, can } = useMe()
  const canManageRoles = useRoles().data?.canManage ?? false
  const [archived, setArchived] = useState(false)
  const [creating, setCreating] = useState(false)
  const projects = useProjects(archived)
  const canCreate = can('project.create')
  // Birinchi kirish yo'riqnomasi: mijozga — o'zining qisqa varianti.
  const isClient = !can('team.view')
  usePageTour(
    isClient ? TOURS.clientWelcome : TOURS.welcome,
    isClient ? clientWelcomeTour(me.name) : welcomeTour(me.name, can, canManageRoles),
    !!projects.data,
  )

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Loyihalar</h1>
          <p className="text-sm text-slate-500">{can('dashboard.view_all') ? 'Workspace’dagi barcha loyihalar' : 'Siz a’zo bo‘lgan loyihalar'}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="size-4 rounded border-slate-300" />
            Arxiv bilan
          </label>
          {canCreate && (
            <Button data-tour="new-project" onClick={() => setCreating(true)}>
              + Yangi loyiha
            </Button>
          )}
        </div>
      </div>

      {projects.isPending && <Spinner />}
      <ErrorText error={projects.error} />
      {projects.data?.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="font-medium">Hali loyiha yo‘q</p>
          <p className="mt-1 text-sm text-slate-500">
            {canCreate ? 'Birinchi loyihani yarating: tasklar va jamoa shu yerda bo‘ladi.' : 'Sizni loyihaga qo‘shishganda shu yerda ko‘rinadi.'}
          </p>
          {canCreate && (
            <Button className="mt-4" onClick={() => setCreating(true)}>
              + Yangi loyiha
            </Button>
          )}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.data?.map((p, i) => (
          <ProjectCard key={p.id} project={p} tour={i === 0} />
        ))}
      </div>

      {/* Har ochilganda yangi forma */}
      {creating && <CreateProjectDialog open onClose={() => setCreating(false)} />}
    </main>
  )
}
