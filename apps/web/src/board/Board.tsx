import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../api'
import { Avatar, Badge, ErrorText } from '../components/ui'
import { formatDay, humanError, isOverdue, PRIORITY_LABELS, PRIORITY_STYLES } from '../labels'
import { keys, useTasks } from '../queries'
import type { Priority, ProjectDetail, StatusCategory, Task, WorkflowStatus } from '../types'

const CLOSED: StatusCategory[] = ['DONE', 'CANCELED']
const PRIORITY_RANK: Record<Priority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

function byPriority(a: Task, b: Task) {
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.number - b.number
}

function TaskCard({ task, overlay = false }: { task: Task; overlay?: boolean }) {
  const closed = CLOSED.includes(task.status.category)
  const late = !closed && isOverdue(task.dueDate)
  return (
    <div
      className={`space-y-2 rounded-lg bg-white p-3 text-left shadow-sm ring-1 ring-slate-200 ${overlay ? 'rotate-1 shadow-lg ring-slate-400' : ''} ${closed ? 'opacity-70' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-medium text-slate-500">{task.key}</span>
        {task.priority !== 'MEDIUM' && <Badge className={PRIORITY_STYLES[task.priority]}>{PRIORITY_LABELS[task.priority]}</Badge>}
      </div>
      <p className={`text-sm leading-snug text-slate-900 ${closed ? 'line-through decoration-slate-400' : ''}`}>{task.title}</p>
      {(task.dueDate || task.assignee) && (
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs ${late ? 'font-medium text-red-600' : 'text-slate-500'}`}>{task.dueDate ? formatDay(task.dueDate) : ''}</span>
          {task.assignee && <Avatar person={task.assignee} size="sm" />}
        </div>
      )}
    </div>
  )
}

function DraggableCard({ task, disabled }: { task: Task; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled })
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      aria-roledescription="sudraladigan task"
      className={`touch-manipulation rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-slate-500 ${disabled ? '' : 'cursor-grab active:cursor-grabbing'} ${isDragging ? 'opacity-30' : ''}`}
    >
      <TaskCard task={task} />
    </li>
  )
}

function QuickAdd({ projectId, status }: { projectId: string; status: WorkflowStatus }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const create = useMutation({
    mutationFn: () => api<Task>(`/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify({ title, statusId: status.id }) }),
    onSuccess: () => {
      setTitle('')
      void queryClient.invalidateQueries({ queryKey: keys.tasks(projectId) })
    },
  })

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full rounded-md px-2 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-200/60 hover:text-slate-800">
        + Task qo‘shish
      </button>
    )
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (title.trim()) create.mutate()
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      <textarea
        autoFocus
        rows={2}
        maxLength={200}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) submit(e)
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder="Nima qilish kerak?"
        className="w-full resize-none rounded-md border border-slate-300 bg-white p-2 text-sm outline-none focus:border-slate-500"
      />
      <ErrorText error={create.error} />
      <div className="flex gap-2">
        <button disabled={create.isPending || !title.trim()} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          Qo‘shish
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200/60">
          Bekor
        </button>
      </div>
    </form>
  )
}

function Column({
  status,
  tasks,
  projectId,
  canAdd,
  canDrag,
}: {
  status: WorkflowStatus
  tasks: Task[]
  projectId: string
  canAdd: boolean
  canDrag: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id })
  return (
    <section
      ref={setNodeRef}
      className={`flex w-72 shrink-0 snap-start flex-col rounded-xl bg-slate-100 p-2 transition-colors ${isOver ? 'bg-slate-200 ring-2 ring-slate-400' : ''}`}
    >
      <header className="flex items-center gap-2 px-1.5 pb-2 pt-1">
        <span className="size-2.5 rounded-full" style={{ backgroundColor: status.color ?? '#94a3b8' }} />
        <h3 className="text-sm font-semibold text-slate-800">{status.name}</h3>
        <span className="text-xs text-slate-500">{tasks.length}</span>
      </header>
      <ul className="flex min-h-16 flex-1 flex-col gap-2">
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} disabled={!canDrag} />
        ))}
      </ul>
      {canAdd && (
        <div className="pt-2">
          <QuickAdd projectId={projectId} status={status} />
        </div>
      )}
    </section>
  )
}

export function Board({ project, userId }: { project: ProjectDetail; userId: string }) {
  const queryClient = useQueryClient()
  const tasks = useTasks(project.id)
  const [onlyMine, setOnlyMine] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const can = (p: string) => project.myPermissions.includes(p)
  const archived = project.status === 'ARCHIVED'

  // Sichqoncha: 5px siljigandan keyin sudrash (bosish ishlayveradi). Telefon: 250ms bosib turish (scroll buzilmaydi).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  )

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(t)
  }, [notice])

  const columns = useMemo(() => {
    const visible = (tasks.data ?? []).filter((t) => !onlyMine || t.assignee?.userId === userId)
    return project.statuses.map((s) => ({ status: s, tasks: visible.filter((t) => t.status.id === s.id).sort(byPriority) }))
  }, [tasks.data, project.statuses, onlyMine, userId])

  const move = useMutation({
    mutationFn: ({ task, to }: { task: Task; to: WorkflowStatus }) =>
      api<Task>(`/projects/${project.id}/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ statusId: to.id }) }),
    onMutate: async ({ task, to }) => {
      await queryClient.cancelQueries({ queryKey: keys.tasks(project.id) })
      const previous = queryClient.getQueryData<Task[]>(keys.tasks(project.id))
      const status = { id: to.id, name: to.name, category: to.category, color: to.color }
      queryClient.setQueryData<Task[]>(keys.tasks(project.id), (old) => old?.map((t) => (t.id === task.id ? { ...t, status } : t)))
      return { previous }
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(keys.tasks(project.id), context.previous)
      setNotice(humanError(error))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.tasks(project.id) }),
  })

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const task = tasks.data?.find((t) => t.id === e.active.id)
    const to = project.statuses.find((s) => s.id === e.over?.id)
    if (!task || !to || to.id === task.status.id) return
    const closing = CLOSED.includes(to.category) || CLOSED.includes(task.status.category)
    if (closing && !can('task.close')) {
      setNotice(humanError(new Error('task.close')))
      return
    }
    move.mutate({ task, to })
  }

  const activeTask = activeId ? tasks.data?.find((t) => t.id === activeId) : undefined
  const canDrag = !archived && can('task.update')

  return (
    <div className="mx-auto max-w-7xl space-y-3">
      <div className="flex flex-wrap items-center gap-3 px-4">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="size-4 rounded border-slate-300" />
          Faqat menga berilganlar
        </label>
        {tasks.isFetching && !tasks.isPending && <span className="text-xs text-slate-400">yangilanmoqda…</span>}
        {archived && <span className="text-sm text-amber-700">Loyiha arxivda: o‘zgartirib bo‘lmaydi.</span>}
      </div>

      {notice && (
        <div role="alert" className="mx-4 flex items-start justify-between gap-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Yopish" className="text-amber-700">
            ✕
          </button>
        </div>
      )}
      <div className="px-4">
        <ErrorText error={tasks.error} />
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="flex snap-x gap-3 overflow-x-auto px-4 pb-6">
          {columns.map(({ status, tasks: list }) => (
            <Column
              key={status.id}
              status={status}
              tasks={list}
              projectId={project.id}
              canDrag={canDrag}
              canAdd={!archived && can('task.create') && (!CLOSED.includes(status.category) || can('task.close'))}
            />
          ))}
        </div>
        {/* Karta optimistik tarzda yangi ustunga o'tadi: eski joyiga qaytish animatsiyasi chalg'itadi. */}
        <DragOverlay dropAnimation={null}>{activeTask ? <TaskCard task={activeTask} overlay /> : null}</DragOverlay>
      </DndContext>
      {tasks.isPending && <p className="px-4 text-sm text-slate-500">Tasklar yuklanmoqda…</p>}
    </div>
  )
}
