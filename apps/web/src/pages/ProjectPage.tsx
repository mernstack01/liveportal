import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useParams } from 'react-router'
import { api, ApiError } from '../api'
import { Board } from '../board/Board'
import { ChatPanel } from '../chat/ChatPanel'
import { IncidentsPanel } from '../incidents/IncidentsPanel'
import { usePageTour } from '../onboarding/state'
import { clientProjectTour, TOURS } from '../onboarding/tours'
import { MembersDialog } from '../components/MembersDialog'
import { ProjectDueDate } from '../components/ProjectDueDate'
import { Avatar, Badge, ErrorText, Spinner } from '../components/ui'
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_STYLES } from '../labels'
import { useMe } from '../me'
import { keys, useProject } from '../queries'
import type { ProjectDetail, ProjectStatus } from '../types'
import { NotFoundPage } from './NotFoundPage'

const STATUSES = Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]

function StatusControl({ project }: { project: ProjectDetail }) {
  const queryClient = useQueryClient()
  const can = (p: string) => project.myPermissions.includes(p)
  const update = useMutation({
    mutationFn: (status: ProjectStatus) =>
      api<ProjectDetail>(`/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.project(project.id), updated)
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  if (!can('project.update')) {
    return <Badge className={PROJECT_STATUS_STYLES[project.status]}>{PROJECT_STATUS_LABELS[project.status]}</Badge>
  }
  // Arxivlash va arxivdan chiqarish alohida ruxsat (project.archive).
  const locked = project.status === 'ARCHIVED' && !can('project.archive')
  return (
    <span className="inline-flex items-center gap-2">
      <select
        aria-label="Loyiha holati"
        value={project.status}
        disabled={update.isPending || locked}
        onChange={(e) => update.mutate(e.target.value as ProjectStatus)}
        className={`rounded-md border-0 py-1 pl-2 pr-7 text-xs font-medium ring-1 ring-slate-200 ${PROJECT_STATUS_STYLES[project.status]}`}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s} disabled={s === 'ARCHIVED' && !can('project.archive')}>
            {PROJECT_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <ErrorText error={update.error} />
    </span>
  )
}

type ProjectTab = 'board' | 'incidents' | 'chat' | 'client'

/** Mijoz loyihani birinchi ochganda: chatga qanday yozishni ko'rsatadi. */
function ClientProjectTour() {
  usePageTour(TOURS.clientProject, clientProjectTour(), true)
  return null
}

export function ProjectPage({ tab = 'board' }: { tab?: ProjectTab }) {
  const { projectId = '' } = useParams()
  const { me } = useMe()
  const project = useProject(projectId)
  const [membersOpen, setMembersOpen] = useState(false)

  if (project.isPending) return <Spinner />
  if (project.error instanceof ApiError && project.error.status === 404) return <NotFoundPage message="Loyiha topilmadi" />
  if (project.error) {
    return (
      <main className="px-4 py-6">
        <ErrorText error={project.error} />
      </main>
    )
  }

  const p = project.data
  const can = (perm: string) => p.myPermissions.includes(perm)
  // Bo'limlar ruxsatga qarab: mijoz faqat "Mijoz bilan" chatni ko'radi.
  const tabs = [
    { id: 'board' as const, to: `/projects/${p.id}`, label: 'Board', allowed: can('task.view') },
    { id: 'incidents' as const, to: `/projects/${p.id}/incidents`, label: 'Insidentlar', allowed: can('incident.view'), badge: p.openIncidents ?? 0 },
    { id: 'chat' as const, to: `/projects/${p.id}/chat`, label: 'Jamoa chati', allowed: can('message.internal.read') },
    { id: 'client' as const, to: `/projects/${p.id}/client-chat`, label: 'Mijoz bilan', allowed: can('message.external.read') },
  ].filter((t) => t.allowed)
  if (!tabs.some((t) => t.id === tab)) {
    return tabs.length > 0 ? <Navigate to={tabs[0].to} replace /> : <NotFoundPage message="Bu loyihada sizga ochiq bo‘lim yo‘q" />
  }
  return (
    <main className="space-y-4 py-5">
      <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-4 px-4">
        <div className="min-w-0 space-y-1">
          <Link to="/" className="text-xs text-slate-500 hover:text-slate-800">
            ← Loyihalar
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-xs font-semibold text-white">{p.key}</span>
            <h1 className="truncate text-xl font-semibold">{p.name}</h1>
            <StatusControl project={p} />
          </div>
          {p.description && <p className="max-w-3xl text-sm text-slate-600">{p.description}</p>}
          <ProjectDueDate key={`${p.id}:${p.dueDate ?? ''}`} project={p} />
        </div>
        <button
          data-tour="project-members"
          onClick={() => setMembersOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-slate-200 hover:ring-slate-400"
        >
          <span className="flex -space-x-2">
            {p.members.slice(0, 5).map((m) => (
              <span key={m.userId} className="rounded-full ring-2 ring-white">
                <Avatar person={m} size="sm" />
              </span>
            ))}
          </span>
          <span className="font-medium">{p.members.length} a’zo</span>
        </button>
      </div>

      {tabs.length > 1 && (
        <nav data-tour="project-tabs" className="mx-auto flex max-w-7xl gap-1 px-4" aria-label="Loyiha bo‘limlari">
          {tabs.map((t) => (
            <NavLink
              key={t.id}
              to={t.to}
              end
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${t.id === tab ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-900'}`}
            >
              {t.label}
              {'badge' in t && (t.badge ?? 0) > 0 && (
                <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white" aria-label={`${t.badge} ta hal qilinmagan`}>
                  {t.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      )}
      {tab === 'board' ? (
        <Board project={p} userId={me.id} />
      ) : tab === 'incidents' ? (
        <IncidentsPanel project={p} userId={me.id} />
      ) : (
        <div className="px-4">
          <ChatPanel key={tab} project={p} userId={me.id} kind={tab === 'client' ? 'client' : 'internal'} />
          {tab === 'client' && !can('message.internal.read') && <ClientProjectTour />}
        </div>
      )}
      {membersOpen && <MembersDialog project={p} userId={me.id} onClose={() => setMembersOpen(false)} />}
      <Outlet />
    </main>
  )
}
