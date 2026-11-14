import { describe, expect, it } from 'vitest';
import { aggregateDashboard, type Category, type DashTask } from './dashboard.aggregate.js';

const d = (day: string) => new Date(`${day}T00:00:00.000Z`);
let n = 0;
const task = (projectId: string, category: Category, extra: Partial<DashTask> = {}): DashTask => ({
  id: `t${++n}`,
  number: n,
  title: `Task ${n}`,
  projectId,
  category,
  dueDate: null,
  dueTime: null,
  completedAt: null,
  assigneeId: null,
  ...extra,
});

describe('aggregateDashboard', () => {
  const today = '2026-11-18';
  const weekStart = new Date('2026-11-15T19:00:00.000Z'); // dushanba 00:00 Toshkent
  const projects = [
    { id: 'a', key: 'A', name: 'Alfa', status: 'ACTIVE', dueDate: d('2026-12-31') },
    { id: 'b', key: 'B', name: 'Beta', status: 'ACTIVE', dueDate: d('2026-11-10') },
    { id: 'c', key: 'C', name: 'Gamma', status: 'COMPLETED', dueDate: d('2026-11-01') },
  ];
  const members = [
    { userId: 'ali', name: 'Ali', avatarUrl: null, role: 'member' },
    { userId: 'vali', name: 'Vali', avatarUrl: null, role: 'member' },
  ];
  const tasks = [
    task('a', 'DONE', { assigneeId: 'ali', completedAt: new Date('2026-11-17T10:00:00Z') }),
    task('a', 'DONE', { assigneeId: 'ali', completedAt: new Date('2026-11-14T10:00:00Z') }), // o'tgan hafta
    task('a', 'IN_PROGRESS', { assigneeId: 'ali', dueDate: d('2026-11-17') }), // kechikkan
    task('a', 'REVIEW', { assigneeId: 'vali' }),
    task('a', 'CANCELED'),
    task('b', 'TODO', { dueDate: d('2026-11-01') }), // kechikkan, egasiz
    task('b', 'DONE', { dueDate: d('2026-11-01'), completedAt: new Date('2026-11-02T10:00:00Z') }), // yopilgan: kechikkan emas
  ];
  const r = aggregateDashboard({ projects, tasks, members, today, weekStartDay: '2026-11-16', weekStart, now: new Date('2026-11-18T10:00:00Z') });

  it('umumiy raqamlar', () => {
    expect(r.weekStart).toBe('2026-11-16');
    expect(r.summary).toEqual({ activeProjects: 2, openTasks: 3, inReview: 1, overdue: 2, doneThisWeek: 1, unassigned: 1 });
  });

  it('loyiha progressi bekor qilinganlarsiz; kechikkan loyiha tepada', () => {
    expect(r.projects.map((p) => p.key)).toEqual(['B', 'A', 'C']);
    const alfa = r.projects.find((p) => p.key === 'A')!;
    expect(alfa).toMatchObject({ total: 5, progress: 50, overdue: 1, late: false });
    expect(alfa.counts).toEqual({ TODO: 0, IN_PROGRESS: 1, REVIEW: 1, DONE: 2, CANCELED: 1 });
    expect(r.projects.find((p) => p.key === 'B')).toMatchObject({ late: true, progress: 50 });
    expect(r.projects.find((p) => p.key === 'C')).toMatchObject({ late: false, progress: 0, total: 0 });
  });

  it('kechikkan tasklar: eng eskisi oldin, necha kun', () => {
    expect(r.overdue.map((t) => [t.key, t.daysLate])).toEqual([
      ['B-6', 17],
      ['A-3', 1],
    ]);
    expect(r.overdue[1].assignee).toEqual({ userId: 'ali', name: 'Ali', avatarUrl: null });
  });

  it('odamlar yuklamasi va bu hafta yopilganlar', () => {
    expect(r.people).toEqual([
      expect.objectContaining({ userId: 'ali', open: 1, inProgress: 1, review: 0, overdue: 1, doneThisWeek: 1 }),
      expect.objectContaining({ userId: 'vali', open: 1, inProgress: 0, review: 1, overdue: 0, doneThisWeek: 0 }),
    ]);
    expect(r.doneThisWeek.map((t) => t.key)).toEqual(['A-1']);
  });

  it('soatli muddat: bugungi task soat o‘tishi bilan kechikkan hisoblanadi', () => {
    const timed = [task('a', 'IN_PROGRESS', { dueDate: d('2026-11-18'), dueTime: '14:00', assigneeId: 'ali' })];
    const before = aggregateDashboard({ projects, tasks: timed, members, today, weekStartDay: '2026-11-16', weekStart, now: new Date('2026-11-18T08:59:00Z') });
    const after = aggregateDashboard({ projects, tasks: timed, members, today, weekStartDay: '2026-11-16', weekStart, now: new Date('2026-11-18T09:00:00Z') });
    expect(before.summary.overdue).toBe(0);
    expect(after.summary.overdue).toBe(1);
    expect(after.overdue[0]).toMatchObject({ daysLate: 0, dueTime: '14:00' });
  });
});
