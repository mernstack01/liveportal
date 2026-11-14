import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { PROJECT_ROLES, roleLabel } from '../labels'
import { keys, useWorkspaceMembers } from '../queries'
import type { ProjectDetail } from '../types'
import { Avatar, Button, ErrorText, inputClass, Modal } from './ui'

export function MembersDialog({ project, userId, onClose }: { project: ProjectDetail; userId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const canManage = project.myPermissions.includes('project.member.manage') && project.status !== 'ARCHIVED'
  const workspaceMembers = useWorkspaceMembers()
  const [newUserId, setNewUserId] = useState('')
  const [newRole, setNewRole] = useState('mentor')

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: keys.project(project.id) })
    void queryClient.invalidateQueries({ queryKey: ['projects'] })
  }
  const base = `/projects/${project.id}/members`
  const add = useMutation({
    mutationFn: () => api(base, { method: 'POST', body: JSON.stringify({ userId: newUserId, role: newRole }) }),
    onSuccess: () => {
      setNewUserId('')
      refresh()
    },
  })
  const changeRole = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: string }) =>
      api(`${base}/${memberId}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (memberId: string) => api(`${base}/${memberId}`, { method: 'DELETE' }),
    onSuccess: refresh,
  })

  const inProject = new Set(project.members.map((m) => m.userId))
  const candidates = workspaceMembers.data?.filter((m) => !inProject.has(m.userId)) ?? []
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (newUserId) add.mutate()
  }

  return (
    <Modal open onClose={onClose} title={`${project.name} a’zolari`}>
      <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
        {project.members.map((m) => {
          const self = m.userId === userId
          return (
            <li key={m.userId} className="flex items-center gap-3 py-2.5">
              <Avatar person={m} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.name} {self && <span className="font-normal text-slate-500">(siz)</span>}
                </p>
                {m.telegramUsername && <p className="truncate text-xs text-slate-500">@{m.telegramUsername}</p>}
              </div>
              {canManage && !self ? (
                <>
                  <select
                    aria-label={`${m.name} roli`}
                    value={m.role}
                    disabled={changeRole.isPending}
                    onChange={(e) => changeRole.mutate({ memberId: m.userId, role: e.target.value })}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
                  >
                    {PROJECT_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r)}
                      </option>
                    ))}
                    {!PROJECT_ROLES.includes(m.role as (typeof PROJECT_ROLES)[number]) && <option value={m.role}>{roleLabel(m.role)}</option>}
                  </select>
                  <Button
                    variant="danger"
                    className="px-2 py-1"
                    disabled={remove.isPending}
                    onClick={() => window.confirm(`${m.name} loyihadan chiqarilsinmi?`) && remove.mutate(m.userId)}
                  >
                    Chiqarish
                  </Button>
                </>
              ) : (
                <span className="text-sm text-slate-500">{roleLabel(m.role)}</span>
              )}
            </li>
          )
        })}
      </ul>
      <ErrorText error={changeRole.error ?? remove.error} />

      {canManage && (
        <form onSubmit={submit} className="space-y-2 border-t border-slate-100 pt-4">
          <p className="text-sm font-medium">Odam qo‘shish</p>
          {candidates.length === 0 && !workspaceMembers.isPending ? (
            <p className="text-sm text-slate-500">Workspace’dagi hamma loyihada bor. Yangi odamni "Jamoa" sahifasidan taklif qiling.</p>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <select value={newUserId} onChange={(e) => setNewUserId(e.target.value)} className={inputClass} required>
                <option value="">Kimni?</option>
                {candidates.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                    {m.telegramUsername ? ` (@${m.telegramUsername})` : ''}
                  </option>
                ))}
              </select>
              <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className={`${inputClass} sm:w-36`}>
                {PROJECT_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
              <Button disabled={add.isPending || !newUserId} className="shrink-0">
                Qo‘shish
              </Button>
            </div>
          )}
          <ErrorText error={add.error ?? workspaceMembers.error} />
        </form>
      )}
    </Modal>
  )
}
