import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { Badge, Button, ErrorText, inputClass, Spinner } from '../components/ui'
import { useRoles } from '../queries'
import type { RoleInfo, RolesResponse } from '../types'
import { NotFoundPage } from './NotFoundPage'

type Permission = RolesResponse['permissions'][number]

/** Ruxsatlar guruh bo'yicha belgilash ro'yxati. Odamda yo'q ruxsat bloklangan (berib bo'lmaydi). */
function PermissionPicker({ permissions, value, onChange }: { permissions: Permission[]; value: Set<string>; onChange: (next: Set<string>) => void }) {
  const groups = [...new Set(permissions.map((p) => p.group))]
  const toggle = (key: string) => {
    const next = new Set(value)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onChange(next)
  }
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {groups.map((g) => (
        <fieldset key={g} className="space-y-2">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{g}</legend>
          {permissions
            .filter((p) => p.group === g)
            .map((p) => (
              <label key={p.key} className={`flex items-start gap-2 text-sm ${p.allowed ? 'text-slate-800' : 'text-slate-400'}`} title={p.allowed ? undefined : 'Sizda bu ruxsat yo‘q, shuning uchun bera olmaysiz'}>
                <input type="checkbox" className="mt-0.5 size-4 rounded border-slate-300" checked={value.has(p.key)} disabled={!p.allowed} onChange={() => toggle(p.key)} />
                {p.label}
              </label>
            ))}
        </fieldset>
      ))}
    </div>
  )
}

function RoleForm({ permissions, initial, onDone, onCancel }: { permissions: Permission[]; initial?: RoleInfo; onDone: () => void; onCancel?: () => void }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [selected, setSelected] = useState(new Set(initial?.permissions ?? ['task.create', 'task.update', 'task.comment']))
  const save = useMutation({
    mutationFn: () =>
      api(initial ? `/roles/${initial.id}` : '/roles', {
        method: initial ? 'PATCH' : 'POST',
        body: JSON.stringify({ title, permissions: [...selected] }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['roles'] })
      onDone()
    },
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate()
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block max-w-md space-y-1">
        <span className="text-sm font-medium">Rol nomi</span>
        <input required minLength={2} maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Masalan: QA muhandis, Dizayner" className={inputClass} />
      </label>
      <PermissionPicker permissions={permissions} value={selected} onChange={setSelected} />
      <ErrorText error={save.error} />
      <div className="flex gap-2">
        <Button disabled={save.isPending || selected.size === 0}>{initial ? 'Saqlash' : 'Rol yaratish'}</Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Bekor qilish
          </Button>
        )}
      </div>
    </form>
  )
}

function RoleCard({ role, permissions, canManage }: { role: RoleInfo; permissions: Permission[]; canManage: boolean }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const labels = new Map(permissions.map((p) => [p.key, p.label]))
  const remove = useMutation({
    mutationFn: () => api(`/roles/${role.id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['roles'] }),
  })

  return (
    <li className="space-y-3 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">{role.title}</h2>
        {role.isSystem ? <Badge className="bg-slate-100 text-slate-600">Tizim roli</Badge> : <Badge className="bg-sky-50 text-sky-700">Yaratilgan</Badge>}
        <span className="text-xs text-slate-500">{role.members} ta a’zo</span>
        {canManage && !role.isSystem && !editing && (
          <span className="ml-auto flex gap-1">
            <Button variant="ghost" className="px-2 py-1" onClick={() => setEditing(true)}>
              Tahrirlash
            </Button>
            <Button
              variant="danger"
              className="px-2 py-1"
              disabled={remove.isPending}
              onClick={() => window.confirm(`«${role.title}» roli o‘chirilsinmi?`) && remove.mutate()}
            >
              O‘chirish
            </Button>
          </span>
        )}
      </div>
      {editing ? (
        <RoleForm permissions={permissions} initial={role} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {role.permissions.map((p) => (
            <li key={p} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
              {labels.get(p) ?? p}
            </li>
          ))}
        </ul>
      )}
      <ErrorText error={remove.error} />
    </li>
  )
}

export function RolesPage() {
  const roles = useRoles()
  const [creating, setCreating] = useState(false)

  if (roles.isPending) return <Spinner />
  if (roles.error) return <ErrorText error={roles.error} />
  const { canManage, permissions } = roles.data
  if (!canManage) return <NotFoundPage message="Rollarni faqat teamlead, admin va rahbar boshqaradi" />
  const projectRoles = roles.data.roles.filter((r) => r.scope === 'PROJECT')

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Rollar</h1>
          <p className="text-sm text-slate-500">Loyihada kim nima qila olishini belgilaydi. O‘zingizda yo‘q ruxsatni yangi rolga bera olmaysiz.</p>
        </div>
        {!creating && <Button onClick={() => setCreating(true)}>+ Yangi rol</Button>}
      </div>

      {creating && (
        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 font-semibold">Yangi rol</h2>
          <RoleForm permissions={permissions} onDone={() => setCreating(false)} onCancel={() => setCreating(false)} />
        </section>
      )}

      <ul className="space-y-3">
        {projectRoles.map((r) => (
          <RoleCard key={r.id} role={r} permissions={permissions} canManage={canManage} />
        ))}
      </ul>
    </main>
  )
}
