import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { api, ApiError } from '../api'
import { Attachments, PendingFiles } from '../components/attachments'
import { usePendingFiles } from '../components/pending-files'
import { Avatar, Button, ErrorText, inputClass, Modal } from '../components/ui'
import { fromLocalInput } from '../incidents/labels'
import { formatDateTime, formatDay, humanError } from '../labels'
import { useMe } from '../me'
import { keys, useDeal, useDealOwners } from '../queries'
import { LostDialog } from './LostDialog'
import { Payments } from './Payments'
import { StartProjectBanner } from './StartProject'
import {
  ACTIVE_STAGES,
  ACTIVITY_KINDS,
  defaultStepInput,
  formatMoney,
  formatStepTime,
  groupDigits,
  SOURCE_LABELS,
  STAGE_INFO,
  stepState,
  type Currency,
  type Deal,
  type DealActivity,
  type DealDetail,
  type DealSource,
  type DealStage,
} from './labels'

const fieldClass =
  'w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none hover:border-slate-300 focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500'

type Patch = Partial<{
  title: string
  clientName: string
  clientContact: string | null
  source: DealSource
  description: string | null
  amount: string | null
  currency: Currency
  stage: DealStage
  ownerId: string
  nextStep: string
  nextStepAt: string
  stepResult: string
  dueDate: string | null
  dueReason: string
  lostReason: string
  advancePercent: number
}>

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] items-center gap-3">
      <span className="text-sm text-slate-500">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Bir qatorli matn: fokus yo'qolganda (yoki Enter) saqlanadi. */
function InlineText({ value, label, required, onSave, className = fieldClass }: { value: string; label: string; required?: boolean; onSave: (v: string) => void; className?: string }) {
  const [text, setText] = useState(value)
  const commit = () => {
    const v = text.trim()
    if (v === value || (required && !v)) return setText(value)
    onSave(v)
  }
  return (
    <input
      aria-label={label}
      value={text}
      maxLength={200}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className={className}
    />
  )
}

/** "150000000 UZS" → "150 000 000 so‘m". */
const moneyText = (value: string | null) => {
  if (!value) return '—'
  const [amount, currency] = value.split(' ')
  return formatMoney(amount, currency as Currency)
}

function describe(a: DealActivity, nameOf: (id: string | null) => string): ReactNode {
  switch (a.kind) {
    case 'created':
      return 'kelishuvni yaratdi'
    case 'stage':
      return (
        <>
          bosqichni <b>{STAGE_INFO[a.to as DealStage]?.label ?? a.to}</b> ga o‘tkazdi
        </>
      )
    case 'owner':
      return (
        <>
          mas’ulni <b>{nameOf(a.to)}</b> ga almashtirdi
        </>
      )
    case 'step':
      return (
        <>
          qadamni bajardi: <span className="text-slate-500 line-through">{a.from}</span> → keyingisi: <b>{a.to}</b>
        </>
      )
    case 'due':
      return a.from ? (
        <>
          topshirish muddatini o‘zgartirdi: {formatDay(a.from)} → <b>{formatDay(a.to)}</b>
        </>
      ) : (
        <>
          topshirish muddatini qo‘ydi: <b>{formatDay(a.to)}</b>
        </>
      )
    case 'amount':
      return (
        <>
          summani o‘zgartirdi: {moneyText(a.from)} → <b>{moneyText(a.to)}</b>
        </>
      )
    case 'advance':
      return (
        <>
          avans foizini o‘zgartirdi: {a.from}% → <b>{a.to}%</b>
        </>
      )
    case 'payment':
      return (
        <>
          to‘lov kiritdi: <b>{moneyText(a.to)}</b> ({a.from === 'CASH' ? 'naqd — tasdiq kutadi' : 'plastik'})
        </>
      )
    case 'payment_confirmed':
      return (
        <>
          naqd to‘lovni tasdiqladi: <b>{moneyText(a.to)}</b>
        </>
      )
    case 'payment_rejected':
      return (
        <>
          to‘lovni rad etdi: <b>{moneyText(a.to)}</b>
        </>
      )
    case 'won':
      return (
        <>
          loyihani boshladi: <b>{a.to}</b> 🚀
        </>
      )
    default:
      return null
  }
}
const KIND_ICON: Record<string, string> = {
  created: '✨',
  stage: '📈',
  owner: '👤',
  step: '✅',
  due: '📅',
  amount: '💰',
  advance: '％',
  payment: '💳',
  payment_confirmed: '✅',
  payment_rejected: '❌',
  won: '🚀',
  note: '📝',
  call: '📞',
  meeting: '🤝',
  contract: '📄',
}
const MANUAL = new Set(['note', 'call', 'meeting', 'contract'])

/** Keyingi qadam: hozirgisi va "Bajarildi → keyingisi" formasi (natija tarixga yoziladi). */
function NextStep({ deal, saving, onSave }: { deal: Deal; saving: boolean; onSave: (p: Patch) => void }) {
  const [editing, setEditing] = useState(false)
  const [result, setResult] = useState('')
  const [step, setStep] = useState('')
  const [at, setAt] = useState(defaultStepInput)
  const state = stepState(deal)
  if (!ACTIVE_STAGES.includes(deal.stage)) return null
  const tone = state === 'stale' || state === 'late' ? 'bg-red-50 ring-red-200' : state === 'today' ? 'bg-amber-50 ring-amber-200' : 'bg-sky-50/60 ring-sky-200'

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!step.trim()) return
    onSave({ stepResult: result.trim() || undefined, nextStep: step.trim(), nextStepAt: fromLocalInput(at) })
    setEditing(false)
    setResult('')
    setStep('')
  }

  return (
    <section data-tour="deal-step" className={`space-y-2 rounded-lg p-3 ring-1 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Keyingi qadam</p>
          <p className="text-sm font-medium text-slate-900">{deal.nextStep}</p>
          {deal.nextStepAt && (
            <p className={`text-xs ${state === 'stale' || state === 'late' ? 'font-medium text-red-700' : 'text-slate-600'}`}>
              {formatStepTime(deal.nextStepAt)}
              {state === 'stale' && ' · 24 soatdan beri bajarilmagan — rahbar ko‘ryapti'}
              {state === 'late' && ' · vaqti o‘tdi'}
            </p>
          )}
        </div>
        {!editing && (
          <Button type="button" variant="secondary" className="shrink-0 py-1 text-xs" onClick={() => setEditing(true)}>
            ✓ Bajarildi / o‘zgartirish
          </Button>
        )}
      </div>
      {editing && (
        <form onSubmit={submit} className="space-y-2">
          <textarea
            data-autofocus
            aria-label="Natija"
            rows={2}
            maxLength={2000}
            value={result}
            onChange={(e) => setResult(e.target.value)}
            placeholder="Natija: nima bo‘ldi? (masalan: gaplashdik, KP so‘radi)"
            className={inputClass}
          />
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input required aria-label="Yangi qadam" maxLength={500} value={step} onChange={(e) => setStep(e.target.value)} placeholder="Keyingi qadam" className={inputClass} />
            <input required type="datetime-local" aria-label="Yangi qadam vaqti" value={at} onChange={(e) => setAt(e.target.value)} className={inputClass} />
          </div>
          <div className="flex gap-2">
            <Button disabled={saving || !step.trim()}>Saqlash</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Bekor qilish
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}

/** Topshirish muddati: birinchi marta — darhol, o'zgartirish — sabab bilan (rahbar ko'radi). */
function DueDate({ deal, onSave }: { deal: Deal; onSave: (p: Patch) => void }) {
  const [pending, setPending] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  return (
    <>
      <input
        type="date"
        aria-label="Topshirish muddati"
        value={deal.dueDate ?? ''}
        onChange={(e) => {
          const value = e.target.value || null
          if (!deal.dueDate) onSave({ dueDate: value })
          else setPending(value ?? '')
        }}
        className={fieldClass}
      />
      {pending !== null && (
        <Modal open onClose={() => setPending(null)} title="Muddat nima uchun o‘zgaryapti?">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              onSave({ dueDate: pending || null, dueReason: reason.trim() })
              setPending(null)
              setReason('')
            }}
            className="space-y-3"
          >
            <p className="text-sm text-slate-600">
              {formatDay(deal.dueDate)} → <b>{pending ? formatDay(pending) : 'muddatsiz'}</b>. Sabab tarixda qoladi va rahbarga boradi.
            </p>
            <textarea data-autofocus required rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Masalan: mijoz dizaynni kech berdi" className={inputClass} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setPending(null)}>
                Bekor qilish
              </Button>
              <Button disabled={!reason.trim()}>O‘zgartirish</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

function Amount({ deal, onSave }: { deal: Deal; onSave: (p: Patch) => void }) {
  const initial = deal.amount ? groupDigits(String(Number(deal.amount))) : ''
  const [text, setText] = useState(initial)
  const commit = () => {
    const raw = text.replace(/\s/g, '')
    if (text === initial) return
    onSave({ amount: raw || null })
  }
  return (
    <div className="flex gap-2">
      <input
        aria-label="Summa"
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(groupDigits(e.target.value))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        placeholder="—"
        className={fieldClass}
      />
      <select aria-label="Valyuta" value={deal.currency} onChange={(e) => onSave({ currency: e.target.value as Currency })} className={`${fieldClass} w-20`}>
        <option value="UZS">so‘m</option>
        <option value="USD">$</option>
      </select>
    </div>
  )
}

function Timeline({ deal, queryRef, nameOf }: { deal: DealDetail; queryRef: string; nameOf: (id: string | null) => string }) {
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<(typeof ACTIVITY_KINDS)[number]['kind']>('note')
  const [body, setBody] = useState('')
  const files = usePendingFiles()
  const fileInput = useRef<HTMLInputElement>(null)
  const add = useMutation({
    mutationFn: () => {
      const form = new FormData()
      form.append('kind', kind)
      form.append('body', body)
      files.pending.forEach((p) => form.append('files', p.file, p.file.name))
      return api<DealActivity>(`/deals/${deal.number}/activities`, { method: 'POST', body: form })
    },
    onSuccess: (activity) => {
      setBody('')
      files.remove('all')
      queryClient.setQueryData<DealDetail>(keys.deal(queryRef), (old) => (old ? { ...old, activities: [...old.activities, activity] } : old))
    },
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if ((body.trim() || files.pending.length > 0) && !add.isPending) add.mutate()
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">Tarix</h3>
      <ol className="space-y-3 border-l border-slate-200 pl-4">
        {deal.activities.map((a) => (
          <li key={a.id} className="relative">
            <span className="absolute -left-[1.6rem] top-0 flex size-5 items-center justify-center rounded-full bg-white text-xs ring-1 ring-slate-200">{KIND_ICON[a.kind] ?? '•'}</span>
            <p className="text-sm text-slate-700">
              <span className="font-medium text-slate-900">{a.author?.name ?? 'Kimdir'}</span>{' '}
              {MANUAL.has(a.kind) ? <span className="text-slate-500">{ACTIVITY_KINDS.find((k) => k.kind === a.kind)?.label.toLowerCase()}</span> : describe(a, nameOf)}
              <span className="ml-2 text-xs text-slate-400">{formatDateTime(a.createdAt)}</span>
            </p>
            {a.body && <p className="mt-1 whitespace-pre-wrap rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-800">{a.body}</p>}
            {a.attachments.length > 0 && (
              <div className="mt-1.5">
                <Attachments items={a.attachments} />
              </div>
            )}
          </li>
        ))}
      </ol>
      <form onSubmit={submit} className="space-y-2">
        <div className="flex gap-1" role="radiogroup" aria-label="Yozuv turi">
          {ACTIVITY_KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              role="radio"
              aria-checked={kind === k.kind}
              onClick={() => setKind(k.kind)}
              className={`rounded-full px-2.5 py-1 text-xs ring-1 ${kind === k.kind ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-400'}`}
            >
              {k.icon} {k.label}
            </button>
          ))}
        </div>
        <PendingFiles items={files.pending} onRemove={(key) => files.remove(new Set([key]))} />
        <textarea
          aria-label="Yozuv"
          rows={2}
          maxLength={4000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && submit(e)}
          onPaste={files.onPaste}
          placeholder="Nima gaplashildi? TZ, KP yoki shartnomani 📎 bilan biriktiring"
          className="w-full resize-y rounded-md border border-slate-200 p-2.5 text-sm outline-none hover:border-slate-300 focus:border-slate-500"
        />
        <ErrorText error={add.error} />
        {files.notice && <p className="text-xs text-amber-700">{files.notice}</p>}
        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) files.add(e.target.files)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            aria-label="Fayl biriktirish"
            title="TZ, KP, shartnoma (10 tagacha, har biri 20 MB gacha)"
            onClick={() => fileInput.current?.click()}
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            📎
          </button>
          <span className="flex-1" />
          <Button disabled={add.isPending || (!body.trim() && files.pending.length === 0)}>{add.isPending ? 'Yozilmoqda…' : 'Yozish'}</Button>
        </div>
      </form>
    </section>
  )
}

function DealBody({ deal, queryRef }: { deal: DealDetail; queryRef: string }) {
  const queryClient = useQueryClient()
  const { can } = useMe()
  const supervisor = can('deal.view_all')
  const owners = useDealOwners()
  const [losing, setLosing] = useState(false)
  const nameOf = (id: string | null) => owners.data?.find((o) => o.userId === id)?.name ?? (deal.owner?.userId === id ? deal.owner.name : 'kimdir')

  const save = useMutation({
    mutationFn: (patch: Patch) => api<Deal>(`/deals/${deal.number}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.deal(queryRef) })
      void queryClient.invalidateQueries({ queryKey: keys.deals })
    },
  })
  const patch = (p: Patch) => save.mutate(p)
  const closed = !ACTIVE_STAGES.includes(deal.stage)

  return (
    <div className="space-y-5">
      <InlineText key={`t${deal.title}`} label="Nomi" value={deal.title} required onSave={(title) => patch({ title })} className="w-full rounded-md px-1 py-0.5 text-lg font-semibold text-slate-900 outline-none hover:bg-slate-50 focus:bg-white focus:ring-2 focus:ring-slate-300" />
      {save.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{humanError(save.error)}</p>}

      <StartProjectBanner deal={deal} queryRef={queryRef} />
      <NextStep deal={deal} saving={save.isPending} onSave={patch} />
      {deal.stage === 'LOST' && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
          Yo‘qotildi{deal.closedAt ? ` (${formatDay(deal.closedAt)})` : ''}: {deal.lostReason}
        </p>
      )}

      <div className="space-y-2.5">
        <Row label="Bosqich">
          <select
            aria-label="Bosqich"
            value={deal.stage}
            disabled={deal.stage === 'WON'}
            onChange={(e) => {
              const stage = e.target.value as DealStage
              if (stage === 'LOST') setLosing(true)
              else patch({ stage })
            }}
            className={fieldClass}
          >
            {[...ACTIVE_STAGES, 'LOST' as const].map((s) => (
              <option key={s} value={s}>
                {STAGE_INFO[s].label}
              </option>
            ))}
            {deal.stage === 'WON' && <option value="WON">{STAGE_INFO.WON.label}</option>}
          </select>
        </Row>
        <Row label="Mijoz">
          <InlineText key={`c${deal.clientName}`} label="Mijoz" value={deal.clientName} required onSave={(clientName) => patch({ clientName })} />
        </Row>
        <Row label="Bog‘lanish">
          <InlineText key={`k${deal.clientContact}`} label="Bog‘lanish" value={deal.clientContact ?? ''} onSave={(v) => patch({ clientContact: v || null })} />
        </Row>
        <Row label="Qayerdan">
          <select aria-label="Qayerdan" value={deal.source} onChange={(e) => patch({ source: e.target.value as DealSource })} className={fieldClass}>
            {(Object.keys(SOURCE_LABELS) as DealSource[]).map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Summa">
          <Amount key={`${deal.amount}${deal.currency}`} deal={deal} onSave={patch} />
        </Row>
        <Row label="Topshirish">
          <DueDate deal={deal} onSave={patch} />
        </Row>
        <Row label="Mas’ul">
          {supervisor ? (
            <select aria-label="Mas’ul" value={deal.owner?.userId ?? ''} onChange={(e) => patch({ ownerId: e.target.value })} className={fieldClass}>
              {!deal.owner && <option value="">—</option>}
              {(owners.data ?? []).map((o) => (
                <option key={o.userId} value={o.userId}>
                  {o.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="flex items-center gap-2 text-sm">
              {deal.owner && <Avatar person={deal.owner} size="sm" />} {deal.owner?.name ?? '—'}
            </span>
          )}
        </Row>
      </div>

      <Payments deal={deal} queryRef={queryRef} activities={deal.activities} onPatch={patch} />

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Tafsilot</h3>
        <Description key={deal.description ?? ''} value={deal.description ?? ''} saving={save.isPending} onSave={(v) => patch({ description: v.trim() || null })} />
      </section>

      <Timeline deal={deal} queryRef={queryRef} nameOf={nameOf} />
      <p className="text-xs text-slate-400">
        Yaratildi: {formatDateTime(deal.createdAt)}
        {deal.createdBy ? ` · ${deal.createdBy.name}` : ''}
        {closed ? '' : ` · bosqichda ${formatDay(deal.stageChangedAt)} dan`}
      </p>

      {losing && (
        <LostDialog
          deal={deal}
          onClose={() => setLosing(false)}
          onConfirm={(lostReason) => {
            patch({ stage: 'LOST', lostReason })
            setLosing(false)
          }}
        />
      )}
    </div>
  )
}

function Description({ value, saving, onSave }: { value: string; saving: boolean; onSave: (v: string) => void }) {
  const [text, setText] = useState(value)
  return (
    <>
      <textarea
        aria-label="Tafsilot"
        rows={3}
        maxLength={10_000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Nima so‘rayapti, talablar, kelishilgan ish hajmi"
        className="w-full resize-y rounded-md border border-slate-200 p-2.5 text-sm outline-none hover:border-slate-300 focus:border-slate-500"
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
    </>
  )
}

/** `/deals/:dealRef` — board ustida o'ng panel (telefonda to'liq ekran). Telegram'dagi "Ochish" shu yerga. */
export function DealDrawer() {
  const { dealRef = '' } = useParams()
  const navigate = useNavigate()
  const deal = useDeal(dealRef)
  const close = () => void navigate('/deals')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('dialog[open]') && void navigate('/deals')
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  const notFound = deal.error instanceof ApiError && deal.error.status === 404
  const data = deal.data

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <button aria-label="Yopish" onClick={close} className="absolute inset-0 bg-slate-900/30" />
      <aside role="dialog" aria-modal="true" aria-label={data?.key ?? 'Kelishuv'} className="relative flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-xl">
        <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-3">
          <span className="font-mono text-sm font-medium text-slate-500">{data?.key ?? '…'}</span>
          {data && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_INFO[data.stage].badge}`}>{STAGE_INFO[data.stage].label}</span>}
          {data?.amount && <span className="text-sm font-semibold text-slate-800">{formatMoney(data.amount, data.currency)}</span>}
          <button onClick={close} aria-label="Yopish" className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {deal.isPending && <p className="text-sm text-slate-500">Yuklanmoqda…</p>}
          {notFound && <p className="text-sm text-slate-600">Kelishuv topilmadi yoki u sizga biriktirilmagan.</p>}
          {!notFound && <ErrorText error={deal.error} />}
          {data && <DealBody key={data.id} deal={data} queryRef={dealRef} />}
        </div>
      </aside>
    </div>
  )
}
