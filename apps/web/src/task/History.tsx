import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { api } from '../api'
import { ErrorText } from '../components/ui'
import { formatDateTime, formatDay, PRIORITY_LABELS, TASK_TYPES } from '../labels'
import type { Priority, TaskHistoryEntry, TaskType } from '../types'

const FIELD_LABELS: Record<string, string> = {
  title: 'nomini',
  description: 'tavsifini',
  priority: 'prioritetni',
  type: 'turini',
  dueDate: 'muddatni',
  dueTime: 'muddat soatini',
}

/** Qiymatni odam tilida: prioritet va tur o'zbekcha, sana dd.mm.yyyy. */
function value(field: string, v: string | null | undefined): string {
  if (v == null || v === '') return '—'
  if (field === 'priority') return PRIORITY_LABELS[v as Priority] ?? v
  if (field === 'type') return TASK_TYPES[v as TaskType]?.label ?? v
  if (field === 'dueDate') return formatDay(v)
  return v
}

function describe(e: TaskHistoryEntry): ReactNode {
  switch (e.kind) {
    case 'created':
      return <>taskni yaratdi{e.status ? ` (${e.status})` : ''}</>
    case 'subtask':
      return (
        <>
          kichik vazifa qo‘shdi: <b>{e.key}</b> · {e.title}
        </>
      )
    case 'status':
      return (
        <>
          holatni o‘zgartirdi: {e.from} → <b>{e.to}</b>
        </>
      )
    case 'assignees':
      if (e.claimed) return <>taskni o‘ziga oldi</>
      if (e.left) return <>taskdan chiqdi</>
      return (
        <>
          {e.added.length > 0 && (
            <>
              mas’ul qo‘shdi: <b>{e.added.join(', ')}</b>
            </>
          )}
          {e.added.length > 0 && e.removed.length > 0 && '; '}
          {e.removed.length > 0 && (
            <>
              olib tashladi: <b>{e.removed.join(', ')}</b>
            </>
          )}
        </>
      )
    case 'fields':
      return (
        <>
          {e.changes.map((c, i) => (
            <span key={c.field}>
              {i > 0 && '; '}
              {FIELD_LABELS[c.field] ?? c.field} o‘zgartirdi
              {c.field !== 'description' && c.field !== 'title' && 'to' in c && (
                <>
                  : {value(c.field, c.from)} → <b>{value(c.field, c.to)}</b>
                </>
              )}
            </span>
          ))}
        </>
      )
    case 'comment':
      return <>izoh yozdi</>
    case 'overdue':
      return <>muddati o‘tdi</>
  }
}

/** Jira'dagi "History": kim, qachon, nimani o'zgartirdi. Eng yangisi tepada. */
export function History({ projectId, taskId }: { projectId: string; taskId: string }) {
  const history = useQuery({
    queryKey: ['task-history', projectId, taskId],
    queryFn: () => api<TaskHistoryEntry[]>(`/projects/${projectId}/tasks/${taskId}/history`),
  })
  if (history.isPending) return <p className="text-sm text-slate-500">Yuklanmoqda…</p>
  if (history.error) return <ErrorText error={history.error} />
  return (
    <ol className="space-y-2.5">
      {[...history.data].reverse().map((e) => (
        <li key={e.id} className="text-sm text-slate-700">
          <span className="font-medium text-slate-900">{e.actor?.name ?? (e.kind === 'overdue' ? '⏰' : 'Tizim')}</span> {describe(e)}
          <span className="ml-2 whitespace-nowrap text-xs text-slate-400">{formatDateTime(e.at)}</span>
        </li>
      ))}
    </ol>
  )
}
