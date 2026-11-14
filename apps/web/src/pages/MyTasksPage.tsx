import { useState } from 'react'
import { Link } from 'react-router'
import { Badge, ErrorText, Spinner } from '../components/ui'
import { DUE_GROUP_LABELS, dueGroup, formatDue, PRIORITY_LABELS, PRIORITY_STYLES, type DueGroup } from '../labels'
import { useMyTasks } from '../queries'
import type { Task } from '../types'

const ORDER: DueGroup[] = ['overdue', 'today', 'week', 'later', 'none']
const CLOSED = ['DONE', 'CANCELED']

function TaskRow({ task }: { task: Task }) {
  const closed = CLOSED.includes(task.status.category)
  const late = !closed && dueGroup(task.dueDate, undefined, task.dueTime) === 'overdue'
  return (
    <li>
      <Link
        to={`/projects/${task.project.id}/tasks/${task.number}`}
        className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-slate-50 sm:flex-nowrap"
      >
        <span className="w-20 shrink-0 font-mono text-xs text-slate-500">{task.key}</span>
        <span className={`min-w-0 flex-1 basis-full text-sm sm:basis-auto ${closed ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{task.title}</span>
        <span className="truncate text-xs text-slate-500 sm:w-36">{task.project.name}</span>
        <span className="flex items-center gap-1.5 sm:w-48 sm:justify-end">
          {task.priority !== 'MEDIUM' && <Badge className={PRIORITY_STYLES[task.priority]}>{PRIORITY_LABELS[task.priority]}</Badge>}
          <span className="rounded px-1.5 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: task.status.color ?? '#64748b' }}>
            {task.status.name}
          </span>
        </span>
        <span className={`w-28 text-right text-xs ${late ? 'font-medium text-red-600' : 'text-slate-500'}`}>{formatDue(task.dueDate, task.dueTime)}</span>
      </Link>
    </li>
  )
}

export function MyTasksPage() {
  const [all, setAll] = useState(false)
  const tasks = useMyTasks(all)
  const groups = ORDER.map((g) => ({ group: g, tasks: (tasks.data ?? []).filter((t) => dueGroup(t.dueDate, undefined, t.dueTime) === g) })).filter((g) => g.tasks.length > 0)

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Mening tasklarim</h1>
          <p className="text-sm text-slate-500">Barcha loyihalardan sizga berilgan tasklar, muddati yaqinlari tepada</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="size-4 rounded border-slate-300" />
          Yopilganlar bilan
        </label>
      </div>

      {tasks.isPending && <Spinner />}
      <ErrorText error={tasks.error} />
      {tasks.data?.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="font-medium">Ochiq task yo‘q</p>
          <p className="mt-1 text-sm text-slate-500">Sizga task berilganda shu yerda va Telegram’da ko‘rinadi.</p>
        </div>
      )}

      {groups.map(({ group, tasks: list }) => (
        <section key={group} className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <h2 className={`border-b border-slate-100 px-4 py-2 text-sm font-semibold ${group === 'overdue' ? 'text-red-700' : 'text-slate-700'}`}>
            {DUE_GROUP_LABELS[group]} <span className="font-normal text-slate-400">{list.length}</span>
          </h2>
          <ul className="divide-y divide-slate-100">
            {list.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}
