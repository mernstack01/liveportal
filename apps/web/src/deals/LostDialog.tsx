import { useState, type FormEvent } from 'react'
import { Button, inputClass, Modal } from '../components/ui'
import type { Deal } from './labels'

const REASONS = ['Qimmat dedi', 'Javob bermay qo‘ydi', 'Boshqa jamoani tanladi', 'Loyiha bekor bo‘ldi', 'Biz rad etdik']

/** "Yo'qotildi": sabab majburiy — oyning oxirida rahbar qaysi sabab ko'pligini ko'radi. */
export function LostDialog({ deal, onClose, onConfirm }: { deal: Pick<Deal, 'key' | 'title'>; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (reason.trim()) onConfirm(reason.trim())
  }
  return (
    <Modal open onClose={onClose} title={`${deal.key} yo‘qotildimi?`}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-600">{deal.title}</p>
        <div className="flex flex-wrap gap-1.5">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={`rounded-full px-2.5 py-1 text-xs ring-1 ${reason === r ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-400'}`}
            >
              {r}
            </button>
          ))}
        </div>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Sabab</span>
          <textarea data-autofocus required rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button variant="primary" disabled={!reason.trim()}>
            Yo‘qotildi deb belgilash
          </Button>
        </div>
      </form>
    </Modal>
  )
}
