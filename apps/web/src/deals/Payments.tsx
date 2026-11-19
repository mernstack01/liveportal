import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { api } from '../api'
import { Attachments, PendingFiles } from '../components/attachments'
import { usePendingFiles } from '../components/pending-files'
import { Button, ErrorText, inputClass, Modal } from '../components/ui'
import { formatDay, humanError, todayStr } from '../labels'
import { useMe } from '../me'
import { keys, useDealPayments } from '../queries'
import {
  formatMoney,
  groupDigits,
  paidPercent,
  PAYMENT_KINDS,
  PAYMENT_METHODS,
  PAYMENT_STATUS,
  type Deal,
  type DealActivity,
  type Payment,
  type PaymentKind,
  type PaymentMethod,
} from './labels'

/** To'lov kiritish: plastik — chek majburiy, naqd — rahbar tasdig'iga boradi. */
function AddPaymentDialog({ deal, onClose, onSaved }: { deal: Deal; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('CARD')
  const [kind, setKind] = useState<PaymentKind>(Number(deal.paid) > 0 ? 'INTERIM' : 'ADVANCE')
  const [paidAt, setPaidAt] = useState(todayStr)
  const [note, setNote] = useState('')
  const files = usePendingFiles()
  const fileInput = useRef<HTMLInputElement>(null)

  const save = useMutation({
    mutationFn: () => {
      const form = new FormData()
      form.append('amount', amount.replace(/\s/g, ''))
      form.append('method', method)
      form.append('kind', kind)
      form.append('paidAt', paidAt)
      if (note.trim()) form.append('note', note.trim())
      files.pending.forEach((p) => form.append('files', p.file, p.file.name))
      return api<Payment>(`/deals/${deal.number}/payments`, { method: 'POST', body: form })
    },
    onSuccess: () => {
      files.remove('all')
      onSaved()
      onClose()
    },
  })
  const needsReceipt = method === 'CARD' && files.pending.length === 0
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!save.isPending && amount && !needsReceipt) save.mutate()
  }

  return (
    <Modal open onClose={onClose} title="To‘lov qo‘shish">
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="To‘lov usuli">
          {(Object.keys(PAYMENT_METHODS) as PaymentMethod[]).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={method === m}
              aria-label={`${PAYMENT_METHODS[m].label}: ${PAYMENT_METHODS[m].hint}`}
              onClick={() => setMethod(m)}
              className={`rounded-lg p-3 text-left ring-1 ${method === m ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-700 ring-slate-200 hover:ring-slate-400'}`}
            >
              <span className="block text-sm font-medium">
                {PAYMENT_METHODS[m].icon} {PAYMENT_METHODS[m].label}
              </span>
              <span className={`block text-xs ${method === m ? 'text-slate-300' : 'text-slate-500'}`}>{PAYMENT_METHODS[m].hint}</span>
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Summa ({deal.currency === 'USD' ? '$' : 'so‘m'})</span>
            <input data-autofocus required inputMode="decimal" value={amount} onChange={(e) => setAmount(groupDigits(e.target.value))} className={inputClass} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Turi</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as PaymentKind)} className={inputClass}>
              {(Object.keys(PAYMENT_KINDS) as PaymentKind[]).map((k) => (
                <option key={k} value={k}>
                  {PAYMENT_KINDS[k]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Qachon to‘langan</span>
          <input type="date" required max={todayStr()} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={inputClass} />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Izoh</span>
          <input maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Masalan: Akmal aka ofisda berdi" className={inputClass} />
        </label>
        <div className="space-y-2">
          <PendingFiles items={files.pending} onRemove={(key) => files.remove(new Set([key]))} />
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            accept="image/*,application/pdf"
            onChange={(e) => {
              if (e.target.files) files.add(e.target.files)
              e.target.value = ''
            }}
          />
          <Button type="button" variant="secondary" onClick={() => fileInput.current?.click()}>
            📎 Chek biriktirish{method === 'CARD' ? ' (majburiy)' : ''}
          </Button>
          {files.notice && <p className="text-xs text-amber-700">{files.notice}</p>}
        </div>
        {method === 'CASH' && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">Naqd to‘lov rahbarga Telegram’da boradi va u tasdiqlagandan keyin “to‘langan”ga qo‘shiladi.</p>}
        <ErrorText error={save.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button disabled={save.isPending || !amount || needsReceipt} title={needsReceipt ? 'Plastik to‘lov uchun chek kerak' : undefined}>
            {save.isPending ? 'Saqlanmoqda…' : 'Qo‘shish'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function RejectDialog({ payment, onClose, onDone }: { payment: Payment; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const reject = useMutation({
    mutationFn: () => api(`/deals/payments/${payment.id}/reject`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) }),
    onSuccess: () => {
      onDone()
      onClose()
    },
  })
  return (
    <Modal open onClose={onClose} title="To‘lovni rad etish">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (reason.trim()) reject.mutate()
        }}
        className="space-y-3"
      >
        <p className="text-sm text-slate-600">
          {formatMoney(payment.amount, payment.currency)} · {formatDay(payment.paidAt)} · kiritdi: {payment.createdBy?.name}
        </p>
        <textarea data-autofocus required rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Sabab: masalan, pul kassaga tushmagan" className={inputClass} />
        <ErrorText error={reject.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button variant="primary" disabled={!reason.trim() || reject.isPending}>
            Rad etish
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/**
 * Shartnoma va to'lovlar: kelishilgan summa, to'langan/qolgan, avans foizi, to'lovlar ro'yxati (cheklar bilan).
 * Rahbar naqd to'lovni shu yerda (yoki Telegram'da) tasdiqlaydi.
 */
export function Payments({ deal, queryRef, activities, onPatch }: { deal: Deal; queryRef: string; activities: DealActivity[]; onPatch: (p: { advancePercent: number }) => void }) {
  const queryClient = useQueryClient()
  const { can } = useMe()
  const payments = useDealPayments(String(deal.number))
  const [adding, setAdding] = useState(false)
  const [rejecting, setRejecting] = useState<Payment | null>(null)
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: keys.dealPayments(String(deal.number)) })
    void queryClient.invalidateQueries({ queryKey: keys.deal(queryRef) })
    void queryClient.invalidateQueries({ queryKey: keys.deals })
  }
  const confirm = useMutation({ mutationFn: (id: string) => api(`/deals/payments/${id}/confirm`, { method: 'POST' }), onSuccess: refresh })
  const percent = paidPercent(deal)
  const advanceMark = deal.amount ? deal.advancePercent : null
  const contracts = activities.filter((a) => a.kind === 'contract').flatMap((a) => a.attachments)
  const [advanceText, setAdvanceText] = useState(String(deal.advancePercent))

  return (
    <section data-tour="deal-payments" className="space-y-3 rounded-lg p-3 ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Shartnoma va to‘lovlar</h3>
        {deal.stage !== 'LOST' && (
          <Button type="button" variant="secondary" className="py-1 text-xs" onClick={() => setAdding(true)}>
            + To‘lov
          </Button>
        )}
      </div>

      {deal.amount ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
            <span>
              To‘langan: <b className="text-emerald-700">{formatMoney(deal.paid, deal.currency)}</b> / {formatMoney(deal.amount, deal.currency)}
            </span>
            {deal.remaining !== null && Number(deal.remaining) > 0 && <span className="text-slate-500">Qoldi: {formatMoney(deal.remaining, deal.currency)}</span>}
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="To‘langan ulushi" aria-valuenow={percent ?? 0} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${percent ?? 0}%` }} />
            {advanceMark !== null && <div className="absolute inset-y-0 w-0.5 bg-slate-700" style={{ left: `${advanceMark}%` }} title={`Avans: ${advanceMark}%`} />}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <label className="flex items-center gap-1">
              Loyiha uchun avans:
              <input
                aria-label="Avans foizi"
                inputMode="numeric"
                value={advanceText}
                disabled={deal.stage === 'WON'}
                onChange={(e) => setAdvanceText(e.target.value.replace(/\D/g, '').slice(0, 3))}
                onBlur={() => {
                  const n = Math.min(100, Number(advanceText || 0))
                  setAdvanceText(String(n))
                  if (n !== deal.advancePercent) onPatch({ advancePercent: n })
                }}
                className="w-12 rounded border border-slate-200 px-1 py-0.5 text-right"
              />
              %
            </label>
            {deal.advanceDue && <span>= {formatMoney(deal.advanceDue, deal.currency)}</span>}
            {deal.advanceReached ? <span className="font-medium text-emerald-700">✓ avans yetarli</span> : null}
            {Number(deal.pendingPayments) > 0 && <span className="font-medium text-amber-700">+ {formatMoney(deal.pendingPayments, deal.currency)} tasdiq kutmoqda</span>}
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Avval kelishilgan summani yozing (yuqorida “Summa”).</p>
      )}

      <div className="text-sm">
        <span className="text-slate-500">Shartnoma: </span>
        {contracts.length > 0 ? <Attachments items={contracts} /> : <span className="text-slate-400">hali biriktirilmagan — tarixda “📄 Shartnoma” bilan yuklang</span>}
      </div>

      <ErrorText error={payments.error ?? confirm.error} />
      {(payments.data ?? []).length > 0 && (
        <ul className="divide-y divide-slate-100">
          {payments.data!.map((p) => (
            <li key={p.id} className="space-y-1 py-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{formatMoney(p.amount, p.currency)}</span>
                <span className="text-slate-500">
                  {PAYMENT_METHODS[p.method].icon} {PAYMENT_METHODS[p.method].label} · {PAYMENT_KINDS[p.kind]} · {formatDay(p.paidAt)}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${PAYMENT_STATUS[p.status].badge}`}>{PAYMENT_STATUS[p.status].label}</span>
              </div>
              <p className="text-xs text-slate-500">
                Kiritdi: {p.createdBy?.name ?? '—'}
                {p.status !== 'PENDING' && p.method === 'CASH' && p.confirmedBy ? ` · ${p.status === 'CONFIRMED' ? 'tasdiqladi' : 'rad etdi'}: ${p.confirmedBy.name}` : ''}
                {p.note ? ` · ${p.note}` : ''}
              </p>
              {p.rejectReason && <p className="text-xs text-red-700">Sabab: {p.rejectReason}</p>}
              {p.receipts.length > 0 && <Attachments items={p.receipts} />}
              {p.status === 'PENDING' && can('payment.confirm') && (
                <div className="flex gap-2 pt-1">
                  <Button type="button" className="py-1 text-xs" disabled={confirm.isPending} onClick={() => confirm.mutate(p.id)}>
                    ✅ Tasdiqlash
                  </Button>
                  <Button type="button" variant="danger" className="py-1 text-xs" onClick={() => setRejecting(p)}>
                    Rad etish
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {confirm.error && <p className="text-xs text-red-700">{humanError(confirm.error)}</p>}

      {adding && <AddPaymentDialog deal={deal} onClose={() => setAdding(false)} onSaved={refresh} />}
      {rejecting && <RejectDialog payment={rejecting} onClose={() => setRejecting(null)} onDone={refresh} />}
    </section>
  )
}
