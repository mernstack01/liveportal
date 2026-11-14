import { describe, expect, it } from 'vitest';
import type { OpenTask } from '../tasks/open-tasks.js';
import { renderDigest, renderTaskList } from './task-list-message.js';

const today = '2026-11-15';
const task = (n: number, due: string | null, title = `Task ${n}`): OpenTask => ({
  key: `LP-${n}`,
  number: n,
  title,
  projectId: 'p1',
  projectName: 'LivePortal',
  dueDate: due ? new Date(`${due}T00:00:00.000Z`) : null,
});

describe('renderDigest', () => {
  it('muddati o‘tgan, bugun, ertaga bo‘limlari; qolganlari soni', () => {
    const msg = renderDigest(
      [task(1, '2026-11-13', '<Login>'), task(2, '2026-11-15'), task(3, '2026-11-16'), task(4, '2026-11-30'), task(5, null)],
      today,
      'https://portal.itlive.uz',
      true,
    )!;
    expect(msg.text).toBe(
      [
        '☀️ <b>Xayrli tong!</b> Bugun e’tibor kerak bo‘lgan tasklaringiz:',
        '',
        '🔴 Muddati o‘tgan (1)',
        '• <b>LP-1</b> &lt;Login&gt; — 13.11',
        '',
        '🟠 Bugun (1)',
        '• <b>LP-2</b> Task 2',
        '',
        '🟡 Ertaga (1)',
        '• <b>LP-3</b> Task 3',
        '',
        'Yana 2 ta ochiq task: /mytasks',
      ].join('\n'),
    );
    expect(msg.buttons).toEqual([[{ text: 'Mening tasklarim', webAppUrl: 'https://portal.itlive.uz/my' }]]);
  });

  it('shoshilinch task bo‘lmasa null (ertalab bo‘sh xabar yo‘q)', () => {
    expect(renderDigest([task(1, '2026-11-30')], today, 'http://localhost:5173', true)).toBeNull();
  });

  it('bo‘limda 10 tadan ortig‘i qisqartiriladi', () => {
    const many = Array.from({ length: 12 }, (_, i) => task(i + 1, '2026-11-15'));
    const msg = renderDigest(many, today, 'http://localhost:5173', false)!;
    expect(msg.text).toContain('🟠 Bugun (12)');
    expect(msg.text).toContain('… va yana 2 ta');
    expect(msg.buttons).toEqual([]);
  });
});

describe('renderTaskList', () => {
  it('barcha guruhlar va bo‘sh holat', () => {
    expect(renderTaskList([], today, 'http://localhost:5173').text).toBe('Sizda ochiq task yo‘q 🎉');
    const text = renderTaskList([task(1, '2026-11-20'), task(2, null)], today, 'http://localhost:5173').text;
    expect(text).toContain('📋 <b>Mening tasklarim</b> (2)');
    expect(text).toContain('🔵 Shu hafta (1)\n• <b>LP-1</b> Task 1 — 20.11');
    expect(text).toContain('⚪ Muddatsiz (1)\n• <b>LP-2</b> Task 2');
  });
});
