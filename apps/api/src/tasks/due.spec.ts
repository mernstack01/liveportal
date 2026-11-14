import { describe, expect, it } from 'vitest';
import { addDays, dueBucket, localDay, localHour } from './due.js';

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
});
