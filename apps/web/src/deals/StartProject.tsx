import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { api } from '../api'
import { Button, ErrorText, inputClass, Modal } from '../components/ui'
import { suggestKey } from '../labels'
import { useMe } from '../me'
import { keys, useWorkspaceMembers } from '../queries'
import { ACTIVE_STAGES, formatMoney, type Deal } from './labels'

/** "USTA — onlayn do‘kon" → "USTA": birinchi so'z (2–6 belgi), bo'lmasa — bosh harflar. */
function projectKey(title: string): string {
  const first =
    title
      .normalize('NFD')
      .replace(/[^A-Za-z0-9\s]/g, '')
      .trim()
      .split(/\s+/)[0]
      ?.toUpperCase()
      .replace(/^[0-9]+/, '') ?? ''
  return first.length >= 2 ? first.slice(0, 6) : suggestKey(title) || 'PRJ'
}

export interface StartResult {
  project: { id: string; key: string; name: string }
  clientInviteLink: string | null
}

/** Natija (mijoz havolasi) bir marta ko'rsatiladi: u ota komponentda saqlanadi, oyna qayta chizilsa ham yo'qolmaydi. */
function StartDialog({
  deal,
  queryRef,
  result,
  onStarted,
  onClose,
}: {
  deal: Deal
  queryRef: string
  result: StartResult | null
  onStarted: (r: StartResult) => void
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const members = useWorkspaceMembers()
  const [name, setName] = useState(deal.title.slice(0, 120))
  const [key, setKey] = useState(() => projectKey(deal.title))
  const [teamleadId, setTeamleadId] = useState(deal.owner?.userId ?? '')
  const [inviteClient, setInviteClient] = useState(true)
  const [copied, setCopied] = useState(false)

  const start = useMutation({
    mutationFn: () => api<StartResult>(`/deals/${deal.number}/start`, { method: 'POST', body: JSON.stringify({ key, name, teamleadId: teamleadId || undefined, inviteClient }) }),
    onSuccess: (r) => {
      onStarted(r)
      void queryClient.invalidateQueries({ queryKey: keys.deal(queryRef) })
      void queryClient.invalidateQueries({ queryKey: keys.deals })
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!start.isPending) start.mutate()
  }

  return (
    <Modal open onClose={onClose} title={result ? 'Loyiha ochildi 🚀' : 'Loyihani boshlash'}>
      {result ? (
        <div className="space-y-3">
          <p className="text-sm">
            <b>{result.project.key}</b> · {result.project.name} — teamlead’ga Telegram’da xabar bordi. Kelishuv “Yutildi” bo‘ldi.
          </p>
          {result.clientInviteLink && (
            <div className="space-y-1.5 rounded-lg bg-slate-50 p-3">
              <p className="text-sm font-medium">Mijoz uchun havola</p>
              <p className="text-xs text-slate-500">{deal.clientName}ga yuboring: ochsa, “Mijoz bilan” chatiga qo‘shiladi. Bir martalik, 7 kun amal qiladi.</p>
              <code className="block break-all rounded bg-white px-2 py-1.5 text-xs ring-1 ring-slate-200">{result.clientInviteLink}</code>
              <Button type="button" variant="secondary" className="py-1 text-xs" onClick={() => void navigator.clipboard.writeText(result.clientInviteLink!).then(() => setCopied(true))}>
                {copied ? '✓ Nusxalandi' : 'Nusxalash'}
              </Button>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Yopish
            </Button>
            <Link to={`/projects/${result.project.id}`} className="inline-flex items-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
              Loyihaga o‘tish →
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-slate-600">
            Avans tushgan: {formatMoney(deal.paid, deal.currency)} ({deal.advancePercent}% kerak edi). Loyiha ochiladi, narx unga ko‘chmaydi — dasturchilar ko‘rmaydi.
          </p>
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Loyiha nomi</span>
              <input data-autofocus required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Kalit</span>
              <input required maxLength={10} value={key} onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} className={`${inputClass} font-mono`} />
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Teamlead (PM)</span>
            <select value={teamleadId} onChange={(e) => setTeamleadId(e.target.value)} className={inputClass}>
              {(members.data ?? [])
                .filter((m) => m.role !== 'client')
                .map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                    {m.userId === deal.owner?.userId ? ' (kelishuv mas’uli)' : ''}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={inviteClient} onChange={(e) => setInviteClient(e.target.checked)} className="mt-0.5" />
            <span>Mijozga portal havolasini tayyorlash ({deal.clientName} — “Mijoz bilan” chat)</span>
          </label>
          <ErrorText error={start.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Bekor qilish
            </Button>
            <Button disabled={start.isPending || !key || !name.trim()}>{start.isPending ? 'Ochilmoqda…' : 'Ha, boshlaymiz'}</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

/** Kelishuv kartasining tepasida: avans yetgach — rahbarga "Loyihani boshlash", savdochiga — "rahbar kutilmoqda"; yutilgach — loyiha havolasi. */
export function StartProjectBanner({ deal, queryRef }: { deal: Deal; queryRef: string }) {
  const { can } = useMe()
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<StartResult | null>(null)
  const ready = ACTIVE_STAGES.includes(deal.stage) && deal.advanceReached

  return (
    <>
      {deal.project ? (
        <p className="flex items-center justify-between gap-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
          <span>✅ Yutildi — loyiha ochilgan</span>
          <Link to={`/projects/${deal.project.id}`} className="font-medium underline-offset-2 hover:underline">
            {deal.project.key} · {deal.project.name} →
          </Link>
        </p>
      ) : (
        ready && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-emerald-50 px-3 py-2.5 ring-1 ring-emerald-200">
            <span className="text-sm text-emerald-900">🚀 Avans tushdi{can('deal.approve') ? '. Loyihani boshlaymizmi?' : ' — rahbar loyihani boshlashi kutilmoqda'}</span>
            {can('deal.approve') && (
              <Button type="button" className="py-1.5" onClick={() => setOpen(true)}>
                Loyihani boshlash
              </Button>
            )}
          </div>
        )
      )}
      {open && <StartDialog deal={deal} queryRef={queryRef} result={result} onStarted={setResult} onClose={() => setOpen(false)} />}
    </>
  )
}
