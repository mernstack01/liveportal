/**
 * Rahbar dashboardi (docs/07, 7-savol): qaysi loyiha kechikyapti, kim band, bu hafta nima yopildi.
 * Sof funksiya: kirish — bazadan olingan qatorlar, chiqish — API javobi.
 */
export type Category = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'CANCELED';
const OPEN: Category[] = ['TODO', 'IN_PROGRESS', 'REVIEW'];

export interface DashProject {
  id: string;
  key: string;
  name: string;
  status: string;
  dueDate: Date | null;
}

export interface DashTask {
  id: string;
  number: number;
  title: string;
  projectId: string;
  category: Category;
  dueDate: Date | null;
  completedAt: Date | null;
  assigneeId: string | null;
}

export interface DashMember {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: string;
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export function aggregateDashboard(input: {
  projects: DashProject[];
  tasks: DashTask[];
  members: DashMember[];
  today: string;
  /** Haftaning birinchi kuni (mahalliy sana) va uning aniq boshlanish vaqti. */
  weekStartDay: string;
  weekStart: Date;
}) {
  const { projects, tasks, members, today, weekStartDay, weekStart } = input;
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const memberById = new Map(members.map((m) => [m.userId, m]));
  const isOpen = (t: DashTask) => OPEN.includes(t.category);
  const isLate = (t: DashTask) => isOpen(t) && t.dueDate !== null && day(t.dueDate) < today;
  const doneThisWeek = (t: DashTask) => t.category === 'DONE' && t.completedAt !== null && t.completedAt >= weekStart;
  const taskKey = (t: DashTask) => `${projectById.get(t.projectId)?.key ?? '?'}-${t.number}`;
  const person = (id: string | null) => {
    const m = id ? memberById.get(id) : undefined;
    return m ? { userId: m.userId, name: m.name, avatarUrl: m.avatarUrl } : null;
  };

  const projectRows = projects.map((p) => {
    const own = tasks.filter((t) => t.projectId === p.id);
    const counts = { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0, CANCELED: 0 } as Record<Category, number>;
    for (const t of own) counts[t.category] += 1;
    const relevant = own.length - counts.CANCELED;
    const finished = p.status === 'COMPLETED';
    return {
      id: p.id,
      key: p.key,
      name: p.name,
      status: p.status,
      dueDate: p.dueDate,
      total: own.length,
      counts,
      /** Bekor qilinganlar hisobga olinmaydi. Task bo'lmasa 0. */
      progress: relevant > 0 ? Math.round((counts.DONE / relevant) * 100) : 0,
      overdue: own.filter(isLate).length,
      late: !finished && p.dueDate !== null && day(p.dueDate) < today,
    };
  });
  // Eng xavotirlilari tepada: kechikkan loyiha, keyin kechikkan tasklar soni, keyin muddat.
  projectRows.sort(
    (a, b) =>
      Number(b.late) - Number(a.late) ||
      b.overdue - a.overdue ||
      (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity) ||
      a.name.localeCompare(b.name),
  );

  const overdue = tasks
    .filter(isLate)
    .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())
    .slice(0, 50)
    .map((t) => ({
      id: t.id,
      key: taskKey(t),
      number: t.number,
      title: t.title,
      project: { id: t.projectId, name: projectById.get(t.projectId)?.name ?? '' },
      assignee: person(t.assigneeId),
      dueDate: t.dueDate,
      daysLate: daysBetween(day(t.dueDate!), today),
    }));

  const people = members
    .map((m) => {
      const mine = tasks.filter((t) => t.assigneeId === m.userId);
      return {
        userId: m.userId,
        name: m.name,
        avatarUrl: m.avatarUrl,
        role: m.role,
        open: mine.filter(isOpen).length,
        inProgress: mine.filter((t) => t.category === 'IN_PROGRESS').length,
        review: mine.filter((t) => t.category === 'REVIEW').length,
        overdue: mine.filter(isLate).length,
        doneThisWeek: mine.filter(doneThisWeek).length,
      };
    })
    .sort((a, b) => b.open - a.open || b.overdue - a.overdue || a.name.localeCompare(b.name));

  const done = tasks
    .filter(doneThisWeek)
    .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime());

  return {
    today,
    weekStart: weekStartDay,
    summary: {
      activeProjects: projects.filter((p) => p.status === 'ACTIVE' || p.status === 'PLANNING').length,
      openTasks: tasks.filter(isOpen).length,
      inReview: tasks.filter((t) => t.category === 'REVIEW').length,
      overdue: tasks.filter(isLate).length,
      doneThisWeek: done.length,
      /** Hech kimga berilmagan ochiq tasklar. */
      unassigned: tasks.filter((t) => isOpen(t) && !t.assigneeId).length,
    },
    projects: projectRows,
    overdue,
    people,
    doneThisWeek: done.slice(0, 20).map((t) => ({
      id: t.id,
      key: taskKey(t),
      number: t.number,
      title: t.title,
      project: { id: t.projectId, name: projectById.get(t.projectId)?.name ?? '' },
      assignee: person(t.assigneeId),
      completedAt: t.completedAt,
    })),
  };
}

export type Dashboard = ReturnType<typeof aggregateDashboard>;
