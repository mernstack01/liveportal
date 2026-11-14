import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, Outlet, useParams } from 'react-router'
import { api, ApiError } from '../api'
import { Board } from '../board/Board'
import { MembersDialog } from '../components/MembersDialog'
import { Avatar, Badge, ErrorText, Spinner } from '../components/ui'
import { formatDay, PROJECT_STATUS_LABELS, PROJECT_STATUS_STYLES } from '../labels'
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

export function ProjectPage() {
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
          {(p.startDate || p.dueDate) && (
            <p className="text-xs text-slate-500">
              {p.startDate && `Boshlangan: ${formatDay(p.startDate)}`}
              {p.startDate && p.dueDate && ' · '}
              {p.dueDate && `Muddat: ${formatDay(p.dueDate)}`}
            </p>
          )}
        </div>
        <button
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

      <Board project={p} userId={me.id} />
      {membersOpen && <MembersDialog project={p} userId={me.id} onClose={() => setMembersOpen(false)} />}
      <Outlet />
    </main>
  )
}
