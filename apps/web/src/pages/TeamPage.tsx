import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api'
import { InviteForm } from '../components/InviteForm'
import { Avatar, Button, ErrorText, Modal, Spinner } from '../components/ui'
import { formatDateTime, formatDay, humanError } from '../labels'
import { useMe } from '../me'
import { keys, useRoles, useWorkspaceMembers } from '../queries'
import { PRIMARY_ROLES, useRoleTitle } from '../roles'
import type { Member } from '../types'

interface PendingInvite {
  id: string
  role: string
  note: string | null
  createdBy: string | null
  createdAt: string
  expiresAt: string
}

interface RemoveResult {
  tasks: number
  projects: number
  incidents: number
}

/** Chiqarishdan oldin nima bo'lishini aniq aytadi: qaytarib bo'lmaydigan amal. */
function RemoveDialog({ member, onClose, onDone }: { member: Member; onClose: () => void; onDone: (result: RemoveResult) => void }) {
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () => api<RemoveResult>(`/workspace/members/${member.userId}`, { method: 'DELETE' }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: keys.workspaceMembers })
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      void queryClient.invalidateQueries({ queryKey: ['project'] })
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      onDone(result)
      onClose()
    },
  })
  return (
    <Modal open onClose={onClose} title={`${member.name}ni chiqarish`}>
      <div className="space-y-4 text-sm text-slate-700">
        <p>Ishdan ketgan yoki endi kerak bo‘lmagan odam uchun. Chiqarilganda darhol:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>portalga kira olmaydi, hamma qurilmalardagi sessiyalari yopiladi;</li>
          <li>barcha loyihalardan chiqariladi;</li>
          <li>tasklardagi va insidentlardagi mas’ulligi olinadi (ular egasiz bo‘lib qoladi, qayta taqsimlang);</li>
          <li>Telegram xabarlari to‘xtaydi.</li>
        </ul>
        <p className="text-slate-500">U yozgan tasklar, izohlar va xabarlar tarix uchun qoladi. Qaytarish uchun — qaytadan taklif qilasiz.</p>
        <ErrorText error={remove.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="button" className="bg-red-600 hover:bg-red-700" disabled={remove.isPending} onClick={() => remove.mutate()}>
            {remove.isPending ? 'Chiqarilmoqda…' : 'Ha, chiqarish'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function PendingInvites() {
  const queryClient = useQueryClient()
  const roleLabel = useRoleTitle()
  const invites = useQuery({ queryKey: ['invites'], queryFn: () => api<PendingInvite[]>('/invites') })
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/invites/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['invites'] }),
  })
  if (!invites.data?.length) return null
  return (
    <section className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">
        Faol takliflar <span className="font-normal text-slate-400">{invites.data.length}</span>
      </h2>
      <ul className="divide-y divide-slate-100">
        {invites.data.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-medium">{i.note || 'Izohsiz'}</span>
              <span className="text-slate-500"> · {roleLabel(i.role)}</span>
            </span>
            <span className="text-xs text-slate-500">
              {i.createdBy ?? '—'}, {formatDateTime(i.createdAt)} · {formatDay(i.expiresAt)} gacha
            </span>
            <Button type="button" variant="danger" className="px-2 py-1 text-xs" disabled={revoke.isPending} onClick={() => revoke.mutate(i.id)}>
              Bekor qilish
            </Button>
          </li>
        ))}
      </ul>
      <div className="px-4 pb-3">
        <ErrorText error={revoke.error} />
      </div>
    </section>
  )
}

/**
 * Qo'shimcha rollar (masalan "Savdo"): boshqara oladigan odamga — bosib yoqiladigan/o'chiriladigan belgilar,
 * qolganlarga — faqat berilganlari.
 */
function ExtraRoles({
  member,
  options,
  title,
  busy,
  onChange,
}: {
  member: Member
  options: { name: string; title: string }[]
  title: (name: string) => string
  busy: boolean
  onChange: (roles: string[]) => void
}) {
  const current = member.extraRoles ?? []
  if (options.length === 0) {
    if (current.length === 0) return null
    return (
      <p className="mt-1 flex flex-wrap gap-1">
        {current.map((r) => (
          <span key={r} className="rounded bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-200">
            {title(r)}
          </span>
        ))}
      </p>
    )
  }
  return (
    <p className="mt-1 flex flex-wrap items-center gap-1" aria-label={`${member.name} qo‘shimcha rollari`}>
      {options.map((r) => {
        const on = current.includes(r.name)
        return (
          <button
            key={r.name}
            type="button"
            aria-pressed={on}
            disabled={busy}
            aria-label={`${member.name}: «${r.title}» rolini ${on ? 'olib qo‘yish' : 'berish'}`}
            onClick={() => onChange(on ? current.filter((x) => x !== r.name) : [...current, r.name])}
            className={`rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 transition ${
              on ? 'bg-violet-600 text-white ring-violet-600 hover:bg-violet-700' : 'bg-white text-slate-500 ring-slate-200 hover:text-slate-800 hover:ring-slate-300'
            }`}
          >
            {on ? '✓ ' : '+ '}
            {r.title}
          </button>
        )
      })}
    </p>
  )
}

export function TeamPage() {
  const queryClient = useQueryClient()
  const { me, workspace, can } = useMe()
  const members = useWorkspaceMembers()
  const roleLabel = useRoleTitle()
  const [removing, setRemoving] = useState<Member | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Faqat o'zimdan oshmaydigan workspace rollari (server ham shuni tekshiradi).
  const myPermissions = workspace?.permissions ?? []
  const assignable = (useRoles().data?.roles ?? []).filter((r) => r.scope === 'WORKSPACE' && r.permissions.every((p) => myPermissions.includes(p)))
  const workspaceRoles = assignable.filter((r) => PRIMARY_ROLES.includes(r.name))
  const extraOptions = assignable.filter((r) => !PRIMARY_ROLES.includes(r.name))

  const setExtraRoles = useMutation({
    mutationFn: ({ userId, roles }: { userId: string; roles: string[] }) =>
      api(`/workspace/members/${userId}/extra-roles`, { method: 'PUT', body: JSON.stringify({ roles }) }),
    onMutate: () => setError(null),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.workspaceMembers }),
    onError: (e) => setError(humanError(e)),
  })

  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) => api(`/workspace/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
    onMutate: () => setError(null),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.workspaceMembers }),
    onError: (e) => setError(humanError(e)),
  })

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold">Jamoa</h1>
        <p className="text-sm text-slate-500">{workspace?.name} a’zolari</p>
      </div>

      {can('member.invite') && <InviteForm />}
      {can('member.invite') && <PendingInvites />}

      {notice && (
        <p role="status" className="flex items-start justify-between gap-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Yopish">
            ✕
          </button>
        </p>
      )}
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      <section className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        {members.isPending && <Spinner />}
        <div className="px-4 pt-3">
          <ErrorText error={members.error} />
        </div>
        <ul className="divide-y divide-slate-100">
          {members.data?.map((m) => {
            const canRole = can('member.role.assign') && m.canManage
            const canRemove = can('member.remove') && m.canManage
            return (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar person={m} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.name} {m.userId === me.id && <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-normal text-slate-500">siz</span>}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {m.telegramUsername ? `@${m.telegramUsername}` : 'Telegram username yo‘q'} · {formatDay(m.joinedAt)} dan
                  </p>
                  <ExtraRoles
                    member={m}
                    options={canRole && m.role !== 'client' ? extraOptions : []}
                    title={roleLabel}
                    busy={setExtraRoles.isPending}
                    onChange={(roles) => setExtraRoles.mutate({ userId: m.userId, roles })}
                  />
                </div>
                {canRole ? (
                  <select
                    aria-label={`${m.name} roli`}
                    value={m.role}
                    disabled={changeRole.isPending}
                    onChange={(e) => changeRole.mutate({ userId: m.userId, role: e.target.value })}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none hover:border-slate-300 focus:border-slate-500"
                  >
                    {workspaceRoles.map((r) => (
                      <option key={r.name} value={r.name}>
                        {r.title}
                      </option>
                    ))}
                    {!workspaceRoles.some((r) => r.name === m.role) && <option value={m.role}>{roleLabel(m.role)}</option>}
                  </select>
                ) : (
                  <span className="text-xs text-slate-500">{roleLabel(m.role)}</span>
                )}
                {canRemove && (
                  <Button type="button" variant="danger" className="px-2 py-1 text-xs" onClick={() => setRemoving(m)}>
                    Chiqarish
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {removing && (
        <RemoveDialog
          member={removing}
          onClose={() => setRemoving(null)}
          onDone={(r) =>
            setNotice(`${removing.name} chiqarildi: ${r.projects} ta loyihadan, ${r.tasks} ta taskdan${r.incidents ? `, ${r.incidents} ta insidentdan` : ''} olindi. Egasiz qolgan tasklarni qayta taqsimlang.`)
          }
        />
      )}
    </main>
  )
}
