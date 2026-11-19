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
} from '@dnd-kit/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Outlet, useNavigate, useSearchParams } from 'react-router'
import { api } from '../api'
import { Avatar, Button, ErrorText } from '../components/ui'
import { humanError } from '../labels'
import { useMe } from '../me'
import { NotFoundPage } from '../pages/NotFoundPage'
import { usePageTour } from '../onboarding/state'
import { dealsTour, TOURS } from '../onboarding/tours'
import { keys, useDealOwners, useDeals } from '../queries'
import { CreateDealDialog } from './CreateDealDialog'
import { LostDialog } from './LostDialog'
import { ACTIVE_STAGES, formatMoney, paidPercent, formatStepTime, STAGE_INFO, stepState, sumByCurrency, type Deal, type DealStage } from './labels'

const STAGES: DealStage[] = [...ACTIVE_STAGES, 'WON', 'LOST']
const STEP_STYLE = { stale: 'text-red-700 font-medium', late: 'text-red-600 font-medium', today: 'text-amber-700 font-medium', later: 'text-slate-500', none: 'text-slate-400' }

function DealCard({ deal, overlay = false }: { deal: Deal; overlay?: boolean }) {
  const state = stepState(deal)
  const closed = !ACTIVE_STAGES.includes(deal.stage)
  return (
    <div className={`space-y-1.5 rounded-lg bg-white p-3 text-left shadow-sm ring-1 ${state === 'stale' ? 'ring-red-300' : 'ring-slate-200'} ${overlay ? 'rotate-1 shadow-lg' : ''} ${closed ? 'opacity-75' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-medium text-slate-500">{deal.key}</span>
        {state === 'stale' && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700">qotib qoldi</span>}
      </div>
      <p className="text-sm font-medium leading-snug text-slate-900">{deal.title}</p>
      <p className="truncate text-xs text-slate-500">👤 {deal.clientName}</p>
      {deal.amount && (
        <p className="flex items-baseline justify-between gap-2 text-sm font-semibold text-slate-800">
          {formatMoney(deal.amount, deal.currency)}
          {Number(deal.paid) > 0 && <span className="text-[11px] font-medium text-emerald-700">to‘landi {paidPercent(deal)}%</span>}
        </p>
      )}
      {Number(deal.pendingPayments) > 0 && <p className="text-[11px] font-medium text-amber-700">💵 naqd tasdiq kutmoqda</p>}
      {deal.advanceReached && !closed && <p className="text-[11px] font-medium text-emerald-700">🚀 avans tushdi — loyihani boshlash mumkin</p>}
      {!closed && deal.nextStep && deal.nextStepAt && (
        <p className={`text-xs ${STEP_STYLE[state]}`} title="Keyingi qadam">
          ➡️ {deal.nextStep} · {formatStepTime(deal.nextStepAt)}
        </p>
      )}
      {deal.stage === 'LOST' && deal.lostReason && <p className="text-xs text-red-700">Sabab: {deal.lostReason}</p>}
      {deal.owner && (
        <div className="flex justify-end">
          <Avatar person={deal.owner} size="sm" />
        </div>
      )}
    </div>
  )
}

function DraggableDeal({ deal, tour }: { deal: Deal; tour: boolean }) {
  const navigate = useNavigate()
  const disabled = deal.stage === 'WON'
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id, disabled })
  const open = () => void navigate(`/deals/${deal.number}`)
  return (
    <li
      data-tour={tour ? 'deal-card' : undefined}
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter') open()
        else listeners?.onKeyDown?.(e)
      }}
      aria-label={`${deal.key}: ${deal.title}`}
      aria-roledescription="sudraladigan kelishuv"
      className={`touch-manipulation rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-slate-500 ${disabled ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'} ${isDragging ? 'opacity-30' : ''}`}
    >
      <DealCard deal={deal} />
    </li>
  )
}

function StageColumn({ stage, deals, tour }: { stage: DealStage; deals: Deal[]; tour: { column: boolean; cardId: string | null } }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const info = STAGE_INFO[stage]
  const total = sumByCurrency(deals)
  return (
    <section
      data-tour={tour.column ? 'deal-column' : undefined}
      ref={setNodeRef}
      aria-label={info.label}
      className={`flex w-64 shrink-0 snap-start flex-col rounded-xl bg-slate-100 p-2 transition-colors ${isOver ? 'bg-slate-200 ring-2 ring-slate-400' : ''}`}
    >
      <header className="px-1.5 pb-2 pt-1">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: info.dot }} />
          <h3 className="text-sm font-semibold text-slate-800">{info.label}</h3>
          <span className="text-xs text-slate-500">{deals.length}</span>
        </div>
        {total && <p className="mt-0.5 pl-4.5 text-xs text-slate-500">{total}</p>}
      </header>
      <ul className="flex min-h-16 flex-1 flex-col gap-2">
        {deals.map((d) => (
          <DraggableDeal key={d.id} deal={d} tour={tour.cardId === d.id} />
        ))}
      </ul>
    </section>
  )
}

/** `/deals` — savdo boardi: so'rovdan avansgacha. Faqat "Savdo" roli va rahbar. */
export function DealsPage() {
  const { can, me } = useMe()
  const allowed = can('deal.manage') || can('deal.view_all')
  if (!allowed) return <NotFoundPage />
  return <DealsBoard userId={me.id} supervisor={can('deal.view_all')} />
}

function DealsBoard({ userId, supervisor }: { userId: string; supervisor: boolean }) {
  const queryClient = useQueryClient()
  const deals = useDeals()
  const owners = useDealOwners()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const owner = params.get('owner') ?? ''
  const staleOnly = params.get('stale') === '1'
  const setParam = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  const [creating, setCreating] = useState(false)
  const [losing, setLosing] = useState<Deal | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 7000)
    return () => clearTimeout(t)
  }, [notice])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }),
  )

  const all = useMemo(() => deals.data ?? [], [deals.data])
  const visible = useMemo(() => {
    const text = q.trim().toLowerCase()
    return all.filter((d) => {
      if (owner && d.owner?.userId !== (owner === 'me' ? userId : owner)) return false
      if (staleOnly && stepState(d) !== 'stale') return false
      return !text || [d.title, d.clientName, d.clientContact ?? '', d.key].some((s) => s.toLowerCase().includes(text))
    })
  }, [all, q, owner, staleOnly, userId])
  const columns = STAGES.map((stage) => ({ stage, deals: visible.filter((d) => d.stage === stage) }))
  const active = all.filter((d) => ACTIVE_STAGES.includes(d.stage))
  const stale = active.filter((d) => stepState(d) === 'stale').length
  const late = active.filter((d) => stepState(d) === 'late').length
  const pipeline = sumByCurrency(active)
  const tourCardId = columns.find((c) => c.deals.length > 0)?.deals[0]?.id ?? null
  usePageTour(TOURS.deals, dealsTour(supervisor), !deals.isPending)

  const move = useMutation({
    mutationFn: ({ deal, stage, lostReason }: { deal: Deal; stage: DealStage; lostReason?: string }) =>
      api<Deal>(`/deals/${deal.number}`, { method: 'PATCH', body: JSON.stringify({ stage, lostReason }) }),
    onMutate: async ({ deal, stage }) => {
      await queryClient.cancelQueries({ queryKey: keys.deals })
      const previous = queryClient.getQueryData<Deal[]>(keys.deals)
      queryClient.setQueryData<Deal[]>(keys.deals, (old) => old?.map((d) => (d.id === deal.id ? { ...d, stage } : d)))
      return { previous }
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(keys.deals, context.previous)
      setNotice(humanError(error))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.deals }),
  })

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const deal = all.find((d) => d.id === e.active.id)
    const stage = e.over?.id as DealStage | undefined
    if (!deal || !stage || stage === deal.stage) return
    if (stage === 'WON') {
      setNotice('“Yutildi” — avans tushib, rahbar loyihani boshlashga “ha” deganda o‘zi qo‘yiladi.')
      return
    }
    if (stage === 'LOST') {
      setLosing(deal)
      return
    }
    move.mutate({ deal, stage })
  }

  const selectClass = 'rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none hover:border-slate-300 focus:border-slate-500'
  const activeDeal = activeId ? all.find((d) => d.id === activeId) : undefined

  return (
    <main className="mx-auto max-w-[96rem] space-y-3 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3 px-4">
        <div>
          <h1 className="text-xl font-semibold">Savdo</h1>
          <p className="text-sm text-slate-500">{supervisor ? 'Barcha kelishuvlar: so‘rovdan avansgacha' : 'Siz mas’ul bo‘lgan kelishuvlar'}</p>
        </div>
        <dl data-tour="deal-summary" className="flex flex-wrap gap-2 text-sm">
          <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
            <dt className="text-xs text-slate-500">Faol kelishuvlar</dt>
            <dd className="font-semibold">{active.length}</dd>
          </div>
          <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
            <dt className="text-xs text-slate-500">Kutilayotgan summa</dt>
            <dd className="font-semibold">{pipeline || '—'}</dd>
          </div>
          <button
            type="button"
            onClick={() => setParam('stale', staleOnly ? '' : '1')}
            aria-pressed={staleOnly}
            className={`rounded-lg px-3 py-2 text-left ring-1 ${stale > 0 ? 'bg-red-50 ring-red-200' : 'bg-white ring-slate-200'} ${staleOnly ? 'ring-2 ring-red-400' : ''}`}
          >
            <span className="block text-xs text-slate-500">Qotib qolgan</span>
            <span className={`block font-semibold ${stale > 0 ? 'text-red-700' : ''}`}>
              {stale}
              {late > 0 && <span className="ml-1 text-xs font-normal text-red-600">+{late} vaqti o‘tgan</span>}
            </span>
          </button>
        </dl>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-4">
        <Button data-tour="deal-new" onClick={() => setCreating(true)} className="py-1.5">
          + Yangi kelishuv
        </Button>
        <input type="search" aria-label="Qidirish" value={q} onChange={(e) => setParam('q', e.target.value)} placeholder="Qidirish: mijoz, nom yoki K-12" className={`${selectClass} w-full sm:w-64`} />
        {supervisor && (
          <select aria-label="Mas’ul" value={owner} onChange={(e) => setParam('owner', e.target.value)} className={selectClass}>
            <option value="">Hamma savdochilar</option>
            <option value="me">Meniki</option>
            {(owners.data ?? [])
              .filter((o) => o.userId !== userId)
              .map((o) => (
                <option key={o.userId} value={o.userId}>
                  {o.name}
                </option>
              ))}
          </select>
        )}
        {(q || owner || staleOnly) && (
          <button onClick={() => setParams({}, { replace: true })} className="text-sm text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline">
            Tozalash · {visible.length} ta
          </button>
        )}
        {deals.isFetching && !deals.isPending && <span className="text-xs text-slate-400">yangilanmoqda…</span>}
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
        <ErrorText error={deals.error} />
      </div>

      <DndContext sensors={sensors} onDragStart={(e) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="flex snap-x gap-3 overflow-x-auto px-4 pb-6">
          {columns.map((c) => (
            <StageColumn key={c.stage} stage={c.stage} deals={c.deals} tour={{ column: c.stage === 'NEW', cardId: tourCardId }} />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>{activeDeal ? <DealCard deal={activeDeal} overlay /> : null}</DragOverlay>
      </DndContext>
      {deals.isPending && <p className="px-4 text-sm text-slate-500">Kelishuvlar yuklanmoqda…</p>}
      {!deals.isPending && all.length === 0 && (
        <p className="px-4 text-sm text-slate-500">Hozircha kelishuv yo‘q. Mijoz murojaat qilsa — “+ Yangi kelishuv”.</p>
      )}

      {creating && <CreateDealDialog onClose={() => setCreating(false)} />}
      {losing && (
        <LostDialog
          deal={losing}
          onClose={() => setLosing(null)}
          onConfirm={(reason) => {
            move.mutate({ deal: losing, stage: 'LOST', lostReason: reason })
            setLosing(null)
          }}
        />
      )}
      <Outlet />
    </main>
  )
}
