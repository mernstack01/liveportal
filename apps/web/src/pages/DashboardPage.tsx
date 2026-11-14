import { Link } from 'react-router'
import { Avatar, ErrorText, Spinner } from '../components/ui'
import { formatDateTime, formatDay, PROJECT_STATUS_LABELS } from '../labels'
import { useMe } from '../me'
import { useDashboard } from '../queries'
import type { Dashboard, StatusCategory } from '../types'
import { NotFoundPage } from './NotFoundPage'

/**
 * Bosqichlar tartibli (To do → Done), shuning uchun bitta ko'k tusning och→to'q pog'onalari:
 * to'qroq = oldinroq. validate_palette.js --ordinal --surface #ffffff: hamma tekshiruv o'tdi.
 */
const STAGES: { category: Exclude<StatusCategory, 'CANCELED'>; label: string; color: string }[] = [
  { category: 'TODO', label: 'Boshlanmagan', color: '#86b6ef' },
  { category: 'IN_PROGRESS', label: 'Jarayonda', color: '#3987e5' },
  { category: 'REVIEW', label: 'Review', color: '#1c5cab' },
  { category: 'DONE', label: 'Done', color: '#0d366b' },
]
/** Holat rangi (critical): faqat ⚠ belgisi va yozuv bilan birga, hech qachon yolg'iz rang. */
const CRITICAL = '#d03b3b'

function Late({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-800">
      <span aria-hidden style={{ color: CRITICAL }}>
        ⚠
      </span>
      {children}
    </span>
  )
}

function Tile({ label, value, hint, alert = false }: { label: string; value: number; hint?: string; alert?: boolean }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="flex items-center gap-1 text-sm text-slate-500">
        {alert && value > 0 && (
          <span aria-hidden style={{ color: CRITICAL }}>
            ⚠
          </span>
        )}
        {label}
      </p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

function Legend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Bosqichlar">
      {STAGES.map((s) => (
        <li key={s.category} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  )
}

/** Bosqichlar bo'yicha bo'lingan chiziq: segmentlar orasida 2px bo'shliq, hover'da izoh. */
function StageBar({ counts }: { counts: Dashboard['projects'][number]['counts'] }) {
  const total = STAGES.reduce((sum, s) => sum + counts[s.category], 0)
  if (total === 0) return <div className="h-2.5 rounded bg-slate-100" aria-label="Task yo‘q" />
  return (
    <div className="flex h-2.5 gap-[2px]" role="img" aria-label={STAGES.map((s) => `${s.label}: ${counts[s.category]}`).join(', ')}>
      {STAGES.filter((s) => counts[s.category] > 0).map((s) => (
        <div
          key={s.category}
          className="group relative first:rounded-l last:rounded-r"
          style={{ flexGrow: counts[s.category], backgroundColor: s.color }}
        >
          <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white shadow group-hover:block">
            {s.label}: {counts[s.category]} ta
          </span>
        </div>
      ))}
    </div>
  )
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
        {title} {count !== undefined && <span className="font-normal text-slate-400">{count}</span>}
      </h2>
      {children}
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-6 text-center text-sm text-slate-500">{text}</p>
}

export function DashboardPage() {
  const { can } = useMe()
  const allowed = can('dashboard.view_all')
  const dashboard = useDashboard()

  if (!allowed) return <NotFoundPage message="Dashboard faqat rahbar va adminlar uchun" />
  if (dashboard.isPending) return <Spinner />
  if (dashboard.error) {
    return (
      <main className="px-4 py-6">
        <ErrorText error={dashboard.error} />
      </main>
    )
  }
  const d = dashboard.data
  const maxOpen = Math.max(1, ...d.people.map((p) => p.open))

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-slate-500">
          Bugun {formatDay(d.today)} · hafta {formatDay(d.weekStart)} dan · har daqiqada yangilanadi
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Faol loyihalar" value={d.summary.activeProjects} />
        <Tile label="Ochiq tasklar" value={d.summary.openTasks} />
        <Tile label="Review kutmoqda" value={d.summary.inReview} hint="teamlead tekshirishi kerak" />
        <Tile label="Muddati o‘tgan" value={d.summary.overdue} alert />
        <Tile label="Bu hafta yopildi" value={d.summary.doneThisWeek} />
        <Tile label="Egasiz tasklar" value={d.summary.unassigned} hint="hech kimga berilmagan" />
      </div>

      <Section title="Loyihalar" count={d.projects.length}>
        {d.projects.length === 0 ? (
          <Empty text="Faol loyiha yo‘q." />
        ) : (
          <>
            <div className="border-b border-slate-100 px-4 py-2.5">
              <Legend />
            </div>
            <ul className="divide-y divide-slate-100">
              {d.projects.map((p) => (
                <li key={p.id}>
                  <Link to={`/projects/${p.id}`} className="grid gap-x-4 gap-y-2 px-4 py-3 hover:bg-slate-50 md:grid-cols-[minmax(0,16rem)_1fr_auto]">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2">
                        <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white">{p.key}</span>
                        <span className="truncate text-sm font-medium">{p.name}</span>
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {PROJECT_STATUS_LABELS[p.status]}
                        {p.dueDate && ` · muddat ${formatDay(p.dueDate)}`}
                      </p>
                    </div>
                    <div className="flex flex-col justify-center gap-1.5">
                      <StageBar counts={p.counts} />
                      <p className="text-xs tabular-nums text-slate-500">
                        {STAGES.map((s) => `${s.label} ${p.counts[s.category]}`).join(' · ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 md:flex-col md:items-end md:justify-center md:gap-1">
                      <span className="text-lg font-semibold tabular-nums text-slate-900">{p.progress}%</span>
                      {p.late && <Late>loyiha muddati o‘tgan</Late>}
                      {p.overdue > 0 && <Late>{p.overdue} ta task kechikkan</Late>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Muddati o‘tgan tasklar" count={d.overdue.length}>
          {d.overdue.length === 0 ? (
            <Empty text="Kechikkan task yo‘q." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {d.overdue.map((t) => (
                <li key={t.id}>
                  <Link to={`/projects/${t.project.id}/tasks/${t.number}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                    <span className="w-16 shrink-0">
                      <Late>{t.daysLate > 0 ? `${t.daysLate} kun` : 'bugun'}</Late>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        <span className="font-mono text-xs text-slate-500">{t.key}</span> {t.title}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {t.project.name} · muddat {formatDay(t.dueDate)}{t.dueTime ? ` ${t.dueTime}` : ''}
                      </span>
                    </span>
                    {t.assignee ? <Avatar person={t.assignee} size="sm" /> : <span className="text-xs text-slate-400">egasiz</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Kim band, kim bo‘sh" count={d.people.length}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="px-4 py-2 font-medium">Odam</th>
                  <th className="px-2 py-2 text-right font-medium">Ochiq</th>
                  <th className="px-2 py-2 text-right font-medium">Jarayonda</th>
                  <th className="px-2 py-2 text-right font-medium">Review</th>
                  <th className="px-2 py-2 text-right font-medium">Kechikkan</th>
                  <th className="whitespace-nowrap px-4 py-2 text-right font-medium">Bu hafta yopdi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {d.people.map((p) => (
                  <tr key={p.userId}>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar person={p} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate">{p.name}</p>
                          {/* Yuklama: eng band odamga nisbatan */}
                          <div className="mt-1 h-1.5 w-24 rounded-full bg-slate-100">
                            <div className="h-1.5 rounded-full" style={{ width: `${(p.open / maxOpen) * 100}%`, backgroundColor: '#3987e5' }} />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right font-medium tabular-nums">{p.open}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-600">{p.inProgress}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-600">{p.review}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{p.overdue > 0 ? <Late>{p.overdue}</Late> : <span className="text-slate-400">0</span>}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600">{p.doneThisWeek}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      <Section title="Bu hafta yopilganlar" count={d.summary.doneThisWeek}>
        {d.doneThisWeek.length === 0 ? (
          <Empty text="Bu hafta hali hech narsa yopilmagan." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {d.doneThisWeek.map((t) => (
              <li key={t.id}>
                <Link to={`/projects/${t.project.id}/tasks/${t.number}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-mono text-xs text-slate-500">{t.key}</span> {t.title}
                    <span className="text-slate-400"> · {t.project.name}</span>
                  </span>
                  <span className="hidden text-xs text-slate-500 sm:inline">{formatDateTime(t.completedAt)}</span>
                  {t.assignee && <Avatar person={t.assignee} size="sm" />}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  )
}
