import type { ChatAttachment, Person } from '../types'

export type DealStage = 'NEW' | 'DISCUSSION' | 'PROPOSAL' | 'CONTRACT' | 'ADVANCE' | 'WON' | 'LOST'
export type DealSource = 'TELEGRAM' | 'INSTAGRAM' | 'REFERRAL' | 'WEBSITE' | 'CALL' | 'OTHER'
export type Currency = 'UZS' | 'USD'

export interface Deal {
  id: string
  number: number
  key: string
  title: string
  clientName: string
  clientContact: string | null
  source: DealSource
  description: string | null
  /** Aniq qiymat satrda ("150000000.00"). */
  amount: string | null
  currency: Currency
  stage: DealStage
  owner: Person | null
  createdBy: Person | null
  nextStep: string | null
  nextStepAt: string | null
  dueDate: string | null
  lostReason: string | null
  stageChangedAt: string
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface DealActivity {
  id: string
  /** created | note | call | meeting | stage | owner | step | due | amount */
  kind: string
  body: string | null
  from: string | null
  to: string | null
  author: Person | null
  attachments: ChatAttachment[]
  createdAt: string
}

export interface DealDetail extends Deal {
  activities: DealActivity[]
}

export const ACTIVE_STAGES: DealStage[] = ['NEW', 'DISCUSSION', 'PROPOSAL', 'CONTRACT', 'ADVANCE']

export const STAGE_INFO: Record<DealStage, { label: string; dot: string; badge: string }> = {
  NEW: { label: 'Yangi so‘rov', dot: '#94a3b8', badge: 'bg-slate-100 text-slate-700' },
  DISCUSSION: { label: 'Muhokama', dot: '#38bdf8', badge: 'bg-sky-50 text-sky-700' },
  PROPOSAL: { label: 'Taklif yuborildi', dot: '#818cf8', badge: 'bg-indigo-50 text-indigo-700' },
  CONTRACT: { label: 'Shartnoma', dot: '#a78bfa', badge: 'bg-violet-50 text-violet-700' },
  ADVANCE: { label: 'Avans kutilmoqda', dot: '#f59e0b', badge: 'bg-amber-50 text-amber-800' },
  WON: { label: 'Yutildi', dot: '#10b981', badge: 'bg-emerald-50 text-emerald-700' },
  LOST: { label: 'Yo‘qotildi', dot: '#f87171', badge: 'bg-red-50 text-red-700' },
}

export const SOURCE_LABELS: Record<DealSource, string> = {
  TELEGRAM: 'Telegram',
  INSTAGRAM: 'Instagram',
  REFERRAL: 'Tanish orqali',
  WEBSITE: 'Sayt',
  CALL: 'Qo‘ng‘iroq',
  OTHER: 'Boshqa',
}

export const ACTIVITY_KINDS = [
  { kind: 'note', label: 'Izoh', icon: '📝' },
  { kind: 'call', label: 'Qo‘ng‘iroq', icon: '📞' },
  { kind: 'meeting', label: 'Uchrashuv', icon: '🤝' },
] as const

/** 150000000 → "150 000 000 so‘m"; USD → "$2 500". */
export function formatMoney(amount: string | number | null, currency: Currency): string {
  if (amount === null || amount === '') return ''
  const n = Number(amount)
  const text = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n).replace(/ /g, ' ')
  return currency === 'USD' ? `$${text}` : `${text} so‘m`
}

/** Bosqich ustunidagi jami: valyutalar alohida ("150 mln so‘m · $2 500"). */
export function sumByCurrency(deals: Deal[]): string {
  const totals = new Map<Currency, number>()
  for (const d of deals) if (d.amount) totals.set(d.currency, (totals.get(d.currency) ?? 0) + Number(d.amount))
  return (['UZS', 'USD'] as Currency[])
    .filter((c) => totals.has(c))
    .map((c) => compactMoney(totals.get(c)!, c))
    .join(' · ')
}

/** Qisqa ko'rinish: 150 000 000 → "150 mln so‘m", 1 200 000 000 → "1,2 mlrd so‘m". */
export function compactMoney(n: number, currency: Currency): string {
  if (currency === 'USD') return `$${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n).replace(/ /g, ' ')}`
  const fmt = (v: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(v)
  if (n >= 1e9) return `${fmt(n / 1e9)} mlrd so‘m`
  if (n >= 1e6) return `${fmt(n / 1e6)} mln so‘m`
  return formatMoney(n, currency)
}

/** Keyingi qadam holati: o'tib ketgan, bugun, 24 soatdan beri bajarilmagan ("qotib qolgan"). */
export function stepState(deal: Pick<Deal, 'stage' | 'nextStepAt'>, now = new Date()): 'none' | 'stale' | 'late' | 'today' | 'later' {
  if (!ACTIVE_STAGES.includes(deal.stage) || !deal.nextStepAt) return 'none'
  const at = new Date(deal.nextStepAt)
  if (at.getTime() < now.getTime() - 24 * 3_600_000) return 'stale'
  if (at <= now) return 'late'
  if (at.toDateString() === now.toDateString()) return 'today'
  return 'later'
}

/** "Bugun 15:00", "Ertaga 10:30", "25.11 09:00". */
export function formatStepTime(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (d.toDateString() === now.toDateString()) return `Bugun ${time}`
  if (d.toDateString() === tomorrow.toDateString()) return `Ertaga ${time}`
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}${d.getFullYear() !== now.getFullYear() ? `.${d.getFullYear()}` : ''} ${time}`
}

/** Raqam kiritishda bo'shliqlar bilan ko'rsatish: "150000000" → "150 000 000". */
export function groupDigits(value: string): string {
  const [int, frac] = value.replace(/[^\d.,]/g, '').replace(',', '.').split('.')
  const grouped = (int ?? '').replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return frac !== undefined ? `${grouped}.${frac.slice(0, 2)}` : grouped
}

/** `<input type="datetime-local">` qiymati: ertaga 10:00 (yangi qadam uchun standart). */
export function defaultStepInput(now = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`
}
