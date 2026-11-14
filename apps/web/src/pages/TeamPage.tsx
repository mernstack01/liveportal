import { Avatar, ErrorText, Spinner } from '../components/ui'
import { InviteForm } from '../components/InviteForm'
import { useRoleTitle } from '../roles'
import { useMe } from '../me'
import { useWorkspaceMembers } from '../queries'

export function TeamPage() {
  const { workspace, can } = useMe()
  const members = useWorkspaceMembers()
  const roleLabel = useRoleTitle()

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold">Jamoa</h1>
        <p className="text-sm text-slate-500">{workspace?.name} a’zolari</p>
      </div>

      {can('member.invite') && <InviteForm />}

      <section className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        {members.isPending && <Spinner />}
        <div className="p-4">
          <ErrorText error={members.error} />
        </div>
        <ul className="divide-y divide-slate-100">
          {members.data?.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 px-4 py-3">
              <Avatar person={m} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.name}</p>
                <p className="truncate text-xs text-slate-500">{m.telegramUsername ? `@${m.telegramUsername}` : 'Telegram username yo‘q'}</p>
              </div>
              <span className="text-xs text-slate-500">{roleLabel(m.role)}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
