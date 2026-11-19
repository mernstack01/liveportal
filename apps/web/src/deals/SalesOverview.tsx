import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '../api'
import { Avatar, ErrorText } from '../components/ui'
import { formatDateTime, formatDay } from '../labels'
import { compactMoney, formatMoney, formatStepTime, STAGE_INFO, type Currency, type DealStage } from './labels'

type Sums = Partial<Record<Currency, string>>

interface SalesSummary {
  money: {
    expected: Sums
    receivedThisMonth: Sums
    debt: Sums
    pendingCash: { id: string; amount: string; currency: Currency; paidAt: string; createdBy: string; deal: { number: number; title: string } }[]
  }
  pipeline: { stage: DealStage; count: number; sums: Sums }[]
  stale: { number: number; title: string; clientName: string; nextStep: string | null; nextStepAt: string | null; owner: { userId: string; name: string; avatarUrl: string | null } | null }[]
  lateSteps: number
  debtors: { number: number; title: string; clientName: string; currency: Currency; remaining: string; project: { id: string; key: string; name: string } | null }[]
  month: { created: number; won: number; lost: number; lostReasons: { reason: string; count: number }[] }
  owners: { userId: string; name: string; avatarUrl: string | null; active: number; sums: Sums }[]
  dueChanges: { kind: 'project' | 'deal'; ref: string; label: string; from: string | null; to: string | null; reason: string | null; author: string | null; at: string }[]
}

/** "150 mln so‘m · $8 000" yoki "—". */
function money(s: Sums) {
  const parts = (['UZS', 'USD'] as Currency[]).filter((c) => s[c]).map((c) => compactMoney(Number(s[c]), c))
  return parts.length > 0 ? parts.join(' · ') : '—'
}

function MoneyTile({ label, value, hint, tone = 'default' }: { label: string; value: string; hint?: string; tone?: 'default' | 'good' | 'warn' }) {
  const color = tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-800' : 'text-slate-900'
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

function Card({ title, count, tone, children }: { title: string; count?: number; tone?: 'alert'; children: React.ReactNode }) {
  return (
    <section className={`overflow-hidden rounded-xl bg-white shadow-sm ring-1 ${tone === 'alert' ? 'ring-red-200' : 'ring-slate-200'}`}>
      <h3 className={`border-b px-4 py-2.5 text-sm font-semibold ${tone === 'alert' ? 'border-red-100 bg-red-50 text-red-900' : 'border-slate-100 text-slate-900'}`}>
        {title} {count !== undefined && <span className="font-normal opacity-60">{count}</span>}
      </h3>
      {children}
    </section>
  )
}

/** Dashboard tepasida, faqat rahbarga (`deal.view_all`): pul va savdo bir qarashda. */
export function SalesOverview() {
  const summary = useQuery({ queryKey: ['deals-summary'], queryFn: () => api<SalesSummary>('/deals/summary'), refetchInterval: 60_000 })
  if (summary.isPending) return null
  if (summary.error) return <ErrorText error={summary.error} />
  const s = summary.data
  const maxCount = Math.max(1, ...s.pipeline.map((p) => p.count))

  return (
    <section aria-labelledby="sales-title" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="sales-title" className="text-base font-semibold">
          Pul va savdo
        </h2>
        <Link to="/deals" className="text-sm text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline">
          Savdo boardi →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MoneyTile label="Kutilayotgan" value={money(s.money.expected)} hint="faol kelishuvlar summasi" />
        <MoneyTile label="Shu oy tushdi" value={money(s.money.receivedThisMonth)} hint="tasdiqlangan to‘lovlar" tone="good" />
        <MoneyTile label="Qarzdorlik" value={money(s.money.debt)} hint="boshlangan loyihalar bo‘yicha qoldiq" tone={Object.keys(s.money.debt).length ? 'warn' : 'default'} />
        <MoneyTile
          label="Naqd — tasdiq kutmoqda"
          value={String(s.money.pendingCash.length)}
          hint={s.money.pendingCash.length ? 'pastdagi ro‘yxatdan tasdiqlang' : 'hammasi ko‘rib chiqilgan'}
          tone={s.money.pendingCash.length ? 'warn' : 'default'}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Savdo bosqichlari">
          <ul className="space-y-2 px-4 py-3">
            {s.pipeline.map((p) => (
              <li key={p.stage} className="grid grid-cols-[9rem_1fr_auto] items-center gap-3 text-sm">
                <span className="flex items-center gap-1.5 text-slate-700">
                  <span className="size-2 rounded-full" style={{ backgroundColor: STAGE_INFO[p.stage].dot }} />
                  {STAGE_INFO[p.stage].label}
                </span>
                <span className="h-2 rounded-full bg-slate-100">
                  <span className="block h-2 rounded-full bg-slate-700" style={{ width: `${(p.count / maxCount) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums text-slate-600">
                  {p.count} · {money(p.sums)}
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-600">
            Shu oy: {s.month.created} ta yangi so‘rov · <b className="text-emerald-700">{s.month.won} yutildi</b> · {s.month.lost} yo‘qotildi
            {s.month.lostReasons.length > 0 && <> · ko‘p sabab: {s.month.lostReasons.map((r) => `${r.reason} (${r.count})`).join(', ')}</>}
          </p>
        </Card>

        <Card title="⚠️ Unutilganlar — qotib qolgan kelishuvlar" count={s.stale.length} tone={s.stale.length ? 'alert' : undefined}>
          {s.stale.length === 0 ? (
            <p className="px-4 py-5 text-center text-sm text-slate-500">Hamma kelishuvda yangi qadam bor 👍{s.lateSteps ? ` (${s.lateSteps} tasining vaqti bugun o‘tdi)` : ''}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {s.stale.map((d) => (
                <li key={d.number}>
                  <Link to={`/deals/${d.number}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                    {d.owner && <Avatar person={d.owner} size="sm" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        K-{d.number} · {d.title}
                      </span>
                      <span className="block truncate text-xs text-red-700">
                        {d.nextStep ? `➡️ ${d.nextStep} · ${d.nextStepAt ? formatStepTime(d.nextStepAt) : ''}` : 'Keyingi qadam yo‘q'}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {s.money.pendingCash.length > 0 && (
          <Card title="💵 Naqd to‘lovlar — tasdiqlang" count={s.money.pendingCash.length} tone="alert">
            <ul className="divide-y divide-slate-100">
              {s.money.pendingCash.map((p) => (
                <li key={p.id}>
                  <Link to={`/deals/${p.deal.number}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        K-{p.deal.number} · {p.deal.title}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {formatDay(p.paidAt)} · kiritdi: {p.createdBy}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold">{formatMoney(p.amount, p.currency)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {s.debtors.length > 0 && (
          <Card title="Qarzdorlar (loyiha boshlangan, to‘lov qolgan)" count={s.debtors.length}>
            <ul className="divide-y divide-slate-100">
              {s.debtors.map((d) => (
                <li key={d.number}>
                  <Link to={`/deals/${d.number}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{d.project ? `${d.project.key} · ${d.project.name}` : d.title}</span>
                      <span className="block truncate text-xs text-slate-500">👤 {d.clientName}</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-amber-800">{formatMoney(d.remaining, d.currency)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {s.owners.length > 0 && (
          <Card title="Savdochilar">
            <ul className="divide-y divide-slate-100">
              {s.owners.map((o) => (
                <li key={o.userId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <Avatar person={o} size="sm" />
                  <span className="flex-1 truncate">{o.name}</span>
                  <span className="tabular-nums text-slate-600">
                    {o.active} ta · {money(o.sums)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title="📅 Muddat o‘zgarishlari (30 kun)" count={s.dueChanges.length}>
          {s.dueChanges.length === 0 ? (
            <p className="px-4 py-5 text-center text-sm text-slate-500">Muddatlar o‘zgarmagan</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {s.dueChanges.map((c, i) => (
                <li key={`${c.kind}-${c.ref}-${i}`}>
                  <Link to={c.kind === 'project' ? `/projects/${c.ref}` : `/deals/${c.ref}`} className="block px-4 py-2.5 hover:bg-slate-50">
                    <span className="block truncate text-sm font-medium">{c.label}</span>
                    <span className="block text-xs text-slate-600">
                      {formatDay(c.from)} → <b>{c.to ? formatDay(c.to) : 'muddatsiz'}</b>
                      {c.reason ? ` · ${c.reason}` : ''}
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      {c.author ?? ''} · {formatDateTime(c.at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </section>
  )
}
