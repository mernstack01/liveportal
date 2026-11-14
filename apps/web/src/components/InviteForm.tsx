import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { Button, ErrorText, inputClass } from './ui'

interface CreatedInvite {
  role: string
  link: string | null
  token: string
  expiresAt: string
}

export function InviteForm() {
  const [role, setRole] = useState('member')
  const [note, setNote] = useState('')
  const [copied, setCopied] = useState(false)
  const create = useMutation({
    mutationFn: () => api<CreatedInvite>('/invites', { method: 'POST', body: JSON.stringify({ role, note: note || undefined }) }),
    onSuccess: () => setCopied(false),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    create.mutate()
  }
  const link = create.data && (create.data.link ?? `/start inv_${create.data.token}`)

  return (
    <section className="space-y-3 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div>
        <h2 className="font-medium text-slate-900">Odam taklif qilish</h2>
        <p className="mt-1 text-sm text-slate-500">Havola bir martalik va 7 kun amal qiladi. Bot tanimasa, odam havolani bot chatiga xabar qilib yuboradi.</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <select value={role} onChange={(e) => setRole(e.target.value)} className={`${inputClass} sm:w-56`}>
          <option value="member">A’zo (dasturchi, teamlead)</option>
          <option value="admin">Admin</option>
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Kim uchun? (ixtiyoriy)" className={inputClass} />
        <Button disabled={create.isPending} className="shrink-0">
          Havola yaratish
        </Button>
      </form>
      <ErrorText error={create.error} />
      {link && (
        <div className="space-y-2 rounded-md bg-slate-50 p-3">
          <p className="break-all font-mono text-xs text-slate-800">{link}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))}>
              {copied ? 'Nusxalandi' : 'Nusxalash'}
            </Button>
            <span className="text-xs text-slate-500">
              {new Date(create.data.expiresAt).toLocaleDateString('uz-UZ')} gacha. Faqat o‘sha odamga yuboring.
            </span>
          </div>
        </div>
      )}
    </section>
  )
}
