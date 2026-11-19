import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api'
import { Button, ErrorText, inputClass, Modal } from '../components/ui'
import { fromLocalInput } from '../incidents/labels'
import { useMe } from '../me'
import { keys, useDealOwners } from '../queries'
import { defaultStepInput, groupDigits, SOURCE_LABELS, type Currency, type Deal, type DealSource } from './labels'

/**
 * Yangi so'rov: kim, nima kerak, qancha va — eng muhimi — keyingi qadam (majburiy).
 * Rahbar boshqa savdochiga biriktira oladi; savdochi o'ziga.
 */
export function CreateDealDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { me, can } = useMe()
  const supervisor = can('deal.view_all')
  const owners = useDealOwners()

  const [title, setTitle] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientContact, setClientContact] = useState('')
  const [source, setSource] = useState<DealSource>('TELEGRAM')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>('UZS')
  const [ownerId, setOwnerId] = useState(me.id)
  const [nextStep, setNextStep] = useState('')
  const [nextStepAt, setNextStepAt] = useState(defaultStepInput)

  const create = useMutation({
    mutationFn: () =>
      api<Deal>('/deals', {
        method: 'POST',
        body: JSON.stringify({
          title,
          clientName,
          clientContact: clientContact.trim() || undefined,
          source,
          description: description.trim() || undefined,
          amount: amount.replace(/\s/g, '') || undefined,
          currency,
          ownerId: supervisor ? ownerId : undefined,
          nextStep,
          nextStepAt: fromLocalInput(nextStepAt),
        }),
      }),
    onSuccess: (deal) => {
      void queryClient.invalidateQueries({ queryKey: keys.deals })
      onClose()
      void navigate(`/deals/${deal.number}`)
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!create.isPending) create.mutate()
  }
  const label = 'block space-y-1 text-sm'

  return (
    <Modal open onClose={onClose} title="Yangi kelishuv">
      <form onSubmit={submit} className="space-y-3">
        <label className={label}>
          <span className="font-medium">Nima kerak</span>
          <input data-autofocus required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Masalan: USTA — onlayn do‘kon" className={inputClass} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            <span className="font-medium">Mijoz</span>
            <input required maxLength={200} value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Ism yoki kompaniya" className={inputClass} />
          </label>
          <label className={label}>
            <span className="font-medium">Bog‘lanish</span>
            <input maxLength={200} value={clientContact} onChange={(e) => setClientContact(e.target.value)} placeholder="+998 90 … yoki @username" className={inputClass} />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <label className={label}>
            <span className="font-medium">Taxminiy summa</span>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(groupDigits(e.target.value))} placeholder="Bilmasangiz — bo‘sh qoldiring" className={inputClass} />
          </label>
          <label className={label}>
            <span className="font-medium">Valyuta</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className={inputClass}>
              <option value="UZS">so‘m</option>
              <option value="USD">$</option>
            </select>
          </label>
          <label className={label}>
            <span className="font-medium">Qayerdan</span>
            <select value={source} onChange={(e) => setSource(e.target.value as DealSource)} className={inputClass}>
              {(Object.keys(SOURCE_LABELS) as DealSource[]).map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={label}>
          <span className="font-medium">Tafsilot</span>
          <textarea rows={2} maxLength={10_000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Nima so‘rayapti, qanday talablar" className={inputClass} />
        </label>

        <fieldset className="space-y-2 rounded-lg bg-amber-50/60 p-3 ring-1 ring-amber-200">
          <legend className="sr-only">Keyingi qadam</legend>
          <p className="text-sm font-medium text-amber-900">Keyingi qadam (majburiy)</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input required maxLength={500} aria-label="Keyingi qadam" value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="Masalan: qo‘ng‘iroq qilib, talablarni aniqlash" className={inputClass} />
            <input required type="datetime-local" aria-label="Qachon" value={nextStepAt} onChange={(e) => setNextStepAt(e.target.value)} className={inputClass} />
          </div>
          <p className="text-xs text-amber-800">Vaqti kelganda mas’ulga Telegram’da eslatma boradi; 24 soatda bajarilmasa — rahbarga.</p>
        </fieldset>

        {supervisor && (
          <label className={label}>
            <span className="font-medium">Mas’ul</span>
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={inputClass}>
              {(owners.data ?? []).map((o) => (
                <option key={o.userId} value={o.userId}>
                  {o.name}
                  {o.userId === me.id ? ' (men)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        <ErrorText error={create.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button disabled={create.isPending || !title.trim() || !clientName.trim() || !nextStep.trim()}>{create.isPending ? 'Saqlanmoqda…' : 'Yaratish'}</Button>
        </div>
      </form>
    </Modal>
  )
}
