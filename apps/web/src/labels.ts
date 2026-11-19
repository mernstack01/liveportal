import type { Priority, ProjectStatus, TaskType } from './types'

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Rahbar',
  admin: 'Admin',
  member: 'A’zo',
  teamlead: 'Teamlead',
  developer: 'Dasturchi',
  guest: 'Mijoz',
  client: 'Mijoz',
  sales: 'Savdo',
}
export const roleLabel = (role: string | null | undefined) => (role ? (ROLE_LABELS[role] ?? role) : '—')


export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: 'Rejada',
  ACTIVE: 'Faol',
  ON_HOLD: 'To‘xtatilgan',
  COMPLETED: 'Tugagan',
  ARCHIVED: 'Arxivda',
}

export const PROJECT_STATUS_STYLES: Record<ProjectStatus, string> = {
  PLANNING: 'bg-slate-100 text-slate-700',
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  ON_HOLD: 'bg-amber-50 text-amber-700',
  COMPLETED: 'bg-sky-50 text-sky-700',
  ARCHIVED: 'bg-slate-100 text-slate-500',
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: 'Past',
  MEDIUM: 'O‘rta',
  HIGH: 'Yuqori',
  URGENT: 'Shoshilinch',
}

/** Jira'dagidek task turlari. */
export const TASK_TYPES: Record<TaskType, { label: string; icon: string; style: string }> = {
  TASK: { label: 'Task', icon: '✔', style: 'bg-sky-100 text-sky-700' },
  BUG: { label: 'Xato', icon: '🐞', style: 'bg-red-100 text-red-700' },
  FEATURE: { label: 'Yangi funksiya', icon: '★', style: 'bg-emerald-100 text-emerald-700' },
}

export const PRIORITY_STYLES: Record<Priority, string> = {
  LOW: 'bg-slate-100 text-slate-600',
  MEDIUM: 'bg-sky-50 text-sky-700',
  HIGH: 'bg-orange-50 text-orange-700',
  URGENT: 'bg-red-50 text-red-700',
}

/** API sanalari UTC yarim tun: mahalliy vaqtga o'tkazmasdan kun sifatida ko'rsatiladi. */
export function formatDay(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

/** Bugungi sana `YYYY-MM-DD` ko'rinishida, foydalanuvchining mahalliy vaqti bo'yicha (Toshkent). */
export function todayStr(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00`)
  d.setDate(d.getDate() + days)
  return todayStr(d)
}

/** Soatli muddatning aniq vaqti (Toshkent, UTC+5). */
function deadline(iso: string, time: string): Date {
  return new Date(`${iso.slice(0, 10)}T${time}:00+05:00`)
}

/** Soat bo'lsa — aynan shu daqiqadan keyin; bo'lmasa — kun tugagach. */
export function isOverdue(iso: string | null, time?: string | null): boolean {
  if (!iso) return false
  if (time) return deadline(iso, time) <= new Date()
  return iso.slice(0, 10) < todayStr()
}

/** "15.11.2026 18:00" yoki "15.11.2026". */
export function formatDue(iso: string | null, time?: string | null): string {
  if (!iso) return ''
  return time ? `${formatDay(iso)} ${time}` : formatDay(iso)
}

export type DueGroup = 'overdue' | 'today' | 'week' | 'later' | 'none'
export const DUE_GROUP_LABELS: Record<DueGroup, string> = {
  overdue: 'Muddati o‘tgan',
  today: 'Bugun',
  week: 'Yaqin 7 kun',
  later: 'Keyinroq',
  none: 'Muddatsiz',
}

export function dueGroup(iso: string | null, today = todayStr(), time?: string | null): DueGroup {
  if (!iso) return 'none'
  const day = iso.slice(0, 10)
  if (day < today) return 'overdue'
  if (time && isOverdue(iso, time)) return 'overdue'
  if (day === today) return 'today'
  if (day <= addDays(today, 7)) return 'week'
  return 'later'
}

/** `14.11.2026 18:05` — brauzer locale'iga bog'liq bo'lmagan format. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** API xabarini odam tiliga o'giradi (ruxsat nomlari o'rniga tushuntirish). */
export function humanError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Xatolik yuz berdi'
  if (message.includes('task.close')) return 'Taskni Done’ga o‘tkazish yoki qayta ochish faqat teamlead’ga ruxsat etilgan.'
  if (message.includes('task.assign')) return 'Task berish uchun ruxsatingiz yo‘q.'
  if (message.includes('task.update')) return 'Taskni o‘zgartirish uchun ruxsatingiz yo‘q.'
  return message
}

/** "IT Live portal" → "ILP". Foydalanuvchi o'zgartirsa, avtomatik taklif to'xtaydi. */
export function suggestKey(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/[^A-Za-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
  const initials = words.map((w) => w[0]).join('')
  const key = (initials.length >= 2 ? initials : (words[0] ?? '').slice(0, 3)).toUpperCase().replace(/^[0-9]+/, '')
  return key.slice(0, 6)
}
