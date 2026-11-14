import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { useAuth, type Me } from '../auth'

interface CreatedInvite {
  role: string
  link: string | null
  token: string
  expiresAt: string
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Rahbar',
  admin: 'Admin',
  member: 'A’zo',
}

function InviteForm() {
  const [role, setRole] = useState('member')
  const [note, setNote] = useState('')
  const [copied, setCopied] = useState(false)
  const create = useMutation({
    mutationFn: () =>
      api<CreatedInvite>('/invites', { method: 'POST', body: JSON.stringify({ role, note: note || undefined }) }),
    onSuccess: () => setCopied(false),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    create.mutate()
  }
  const link = create.data && (create.data.link ?? `/start inv_${create.data.token}`)

  return (
    <section className="space-y-3 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="font-medium text-slate-900">Odam taklif qilish</h2>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="member">A’zo (mentor, teamlead)</option>
          <option value="admin">Admin</option>
        </select>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Kim uchun? (ixtiyoriy)"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button disabled={create.isPending} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          Havola yaratish
        </button>
      </form>
      {create.isError && <p className="text-sm text-red-600">{create.error.message}</p>}
      {link && (
        <div className="space-y-2 rounded-md bg-slate-50 p-3">
          <p className="break-all font-mono text-xs text-slate-800">{link}</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium"
            >
              {copied ? 'Nusxalandi' : 'Nusxalash'}
            </button>
            <span className="text-xs text-slate-500">Bir martalik, {new Date(create.data.expiresAt).toLocaleDateString('uz-UZ')} gacha. Faqat o‘sha odamga yuboring.</span>
          </div>
        </div>
      )}
    </section>
  )
}

export function HomePage({ me }: { me: Me }) {
  const { logout } = useAuth()
  const workspace = me.workspaces[0]
  const canInvite = workspace?.permissions.includes('member.invite')

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {me.avatarUrl ? (
              <img src={me.avatarUrl} alt="" className="size-10 rounded-full" />
            ) : (
              <div className="flex size-10 items-center justify-center rounded-full bg-slate-200 font-medium">{me.name.slice(0, 1)}</div>
            )}
            <div>
              <p className="font-medium">{me.name}</p>
              <p className="text-sm text-slate-500">
                {workspace?.name} · {ROLE_LABELS[workspace?.role ?? ''] ?? workspace?.role}
              </p>
            </div>
          </div>
          <button onClick={() => void logout()} className="text-sm text-slate-600 underline-offset-4 hover:underline">
            Chiqish
          </button>
        </header>

        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="font-medium">Loyihalar</h2>
          <p className="mt-1 text-sm text-slate-500">Loyihalar va tasklar 3–6-kunlarda qo‘shiladi (docs/09-fast-track.md).</p>
        </section>

        {canInvite && <InviteForm />}
      </div>
    </main>
  )
}
