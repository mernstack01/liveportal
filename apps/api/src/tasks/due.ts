/**
 * Muddatlar kun aniqligida, UTC yarim tunda saqlanadi (`2026-11-15T00:00:00Z` = 15-noyabr).
 * "Bugun" esa workspace vaqt mintaqasida (MVP: Toshkent) hisoblanadi.
 */
export const DEFAULT_TIMEZONE = 'Asia/Tashkent';

/** `YYYY-MM-DD`: berilgan vaqt mintaqasidagi sana. */
export function localDay(now: Date, timeZone = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Mahalliy soat (0–23). */
export function localHour(now: Date, timeZone = DEFAULT_TIMEZONE): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(now));
}

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Sana → bazadagi muddat qiymati (UTC yarim tun). */
export function dayStart(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

export type DueBucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none';

export function dueBucket(dueDate: Date | null, today: string): DueBucket {
  if (!dueDate) return 'none';
  const day = dueDate.toISOString().slice(0, 10);
  if (day < today) return 'overdue';
  if (day === today) return 'today';
  if (day === addDays(today, 1)) return 'tomorrow';
  if (day <= addDays(today, 7)) return 'week';
  return 'later';
}

/** Toshkentda yozgi vaqt yo'q: doimiy UTC+5. Boshqa mintaqa kerak bo'lsa, shu yer umumlashtiriladi. */
const TASHKENT_OFFSET = '+05:00';

/** Mahalliy sana yarim tuni → aniq vaqt (masalan, "bu hafta" boshi). */
export function localMidnight(day: string): Date {
  return new Date(`${day}T00:00:00${TASHKENT_OFFSET}`);
}

/** Shu haftaning dushanbasi (mahalliy sana). */
export function weekStart(today: string): string {
  const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay(); // 0 = yakshanba
  return addDays(today, -((weekday + 6) % 7));
}
