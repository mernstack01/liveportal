import type { IncidentSeverity, IncidentStatus } from '../types'

export const SEVERITIES: IncidentSeverity[] = ['SEV1', 'SEV2', 'SEV3', 'SEV4']
export const INCIDENT_STATUSES: IncidentStatus[] = ['OPEN', 'INVESTIGATING', 'MONITORING', 'RESOLVED']

export const SEVERITY_INFO: Record<IncidentSeverity, { label: string; hint: string; badge: string; dot: string }> = {
  SEV1: { label: 'Kritik', hint: 'Hamma narsa ishlamayapti, pul yo‘qotilyapti', badge: 'bg-red-600 text-white', dot: 'bg-red-600' },
  SEV2: { label: 'Jiddiy', hint: 'Asosiy funksiya buzilgan', badge: 'bg-orange-500 text-white', dot: 'bg-orange-500' },
  SEV3: { label: 'O‘rtacha', hint: 'Qisman, aylanib o‘tish yo‘li bor', badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-400' },
  SEV4: { label: 'Kichik', hint: 'Kosmetik yoki kam odamga ta’sir', badge: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
}

export const STATUS_INFO: Record<IncidentStatus, { label: string; badge: string }> = {
  OPEN: { label: 'Ochiq', badge: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
  INVESTIGATING: { label: 'Tekshirilmoqda', badge: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' },
  MONITORING: { label: 'Kuzatuvda', badge: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200' },
  RESOLVED: { label: 'Hal qilindi', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
}

/** "1 soat 20 daqiqa", "2 kun 3 soat". */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes < 1) return '1 daqiqadan kam'
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days > 0) return hours > 0 ? `${days} kun ${hours} soat` : `${days} kun`
  if (hours > 0) return mins > 0 ? `${hours} soat ${mins} daqiqa` : `${hours} soat`
  return `${mins} daqiqa`
}

/** Hal qilinmagan bo'lsa — hozirgacha, bo'lsa — qancha davom etgan. */
export function incidentDuration(startedAt: string, resolvedAt: string | null): string {
  return formatDuration((resolvedAt ? new Date(resolvedAt) : new Date()).getTime() - new Date(startedAt).getTime())
}

/** `<input type="datetime-local">` qiymati (mahalliy vaqt) ↔ ISO. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const fromLocalInput = (value: string) => new Date(value).toISOString()
