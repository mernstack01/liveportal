import type { Priority, ProjectStatus } from './types'

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Rahbar',
  admin: 'Admin',
  member: 'A’zo',
  teamlead: 'Teamlead',
  mentor: 'Mentor',
  guest: 'Mehmon',
}
export const roleLabel = (role: string | null | undefined) => (role ? (ROLE_LABELS[role] ?? role) : '—')

/** Loyihada beriladigan rollar (yuqoridan pastga). */
export const PROJECT_ROLES = ['teamlead', 'mentor', 'guest'] as const

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

export function isOverdue(iso: string | null): boolean {
  if (!iso) return false
  return iso.slice(0, 10) < new Date().toISOString().slice(0, 10)
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
