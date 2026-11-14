import { describe, expect, it } from 'vitest';
import { addDays, deadlineAt, dueBucket, isPastDue, localDay, localHour, localMidnight, weekStart } from './due.js';

describe('due', () => {
  it('Toshkent sanasi UTC’dan 5 soat oldin almashadi', () => {
    // 14-noyabr 19:30 UTC = 15-noyabr 00:30 Toshkent
    const now = new Date('2026-11-14T19:30:00Z');
    expect(localDay(now)).toBe('2026-11-15');
    expect(localHour(now)).toBe(0);
    expect(localHour(new Date('2026-11-15T04:00:00Z'))).toBe(9);
  });

  it('oy va yil chegarasida kun qo‘shadi', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('muddat guruhlari', () => {
    const today = '2026-11-15';
    const d = (day: string) => new Date(`${day}T00:00:00.000Z`);
    expect(dueBucket(d('2026-11-14'), today)).toBe('overdue');
    expect(dueBucket(d('2026-11-15'), today)).toBe('today');
    expect(dueBucket(d('2026-11-16'), today)).toBe('tomorrow');
    expect(dueBucket(d('2026-11-22'), today)).toBe('week');
    expect(dueBucket(d('2026-11-23'), today)).toBe('later');
    expect(dueBucket(null, today)).toBe('none');
  });

  it('hafta boshi dushanba; Toshkent yarim tuni UTC 19:00', () => {
    expect(weekStart('2026-11-15')).toBe('2026-11-09'); // yakshanba → dushanba
    expect(weekStart('2026-11-16')).toBe('2026-11-16'); // dushanba
    expect(weekStart('2026-11-18')).toBe('2026-11-16');
    expect(localMidnight('2026-11-16').toISOString()).toBe('2026-11-15T19:00:00.000Z');
  });

  it('soatli muddat: Toshkent vaqtida aynan shu daqiqa', () => {
    const due = new Date('2026-11-15T00:00:00.000Z');
    expect(deadlineAt(due, '18:00').toISOString()).toBe('2026-11-15T13:00:00.000Z');
    expect(isPastDue(due, '18:00', '2026-11-15', new Date('2026-11-15T12:59:00Z'))).toBe(false);
    expect(isPastDue(due, '18:00', '2026-11-15', new Date('2026-11-15T13:00:00Z'))).toBe(true);
    // soatsiz: kun tugagach
    expect(isPastDue(due, null, '2026-11-15', new Date('2026-11-15T18:00:00Z'))).toBe(false);
    expect(isPastDue(due, null, '2026-11-16', new Date('2026-11-15T19:30:00Z'))).toBe(true);
  });
});
