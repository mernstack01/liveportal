import type { PrismaService } from '../db/prisma.service.js';

export interface OpenTask {
  key: string;
  number: number;
  title: string;
  projectId: string;
  projectName: string;
  dueDate: Date | null;
}

/** Odamga berilgan ochiq tasklar (arxivlanmagan loyihalarda). Bot va ertalabki xulosa uchun. */
export async function openTasksFor(prisma: PrismaService, userId: string): Promise<OpenTask[]> {
  const rows = await prisma.task.findMany({
    where: {
      assigneeId: userId,
      status: { category: { notIn: ['DONE', 'CANCELED'] } },
      project: { status: { not: 'ARCHIVED' } },
    },
    orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    take: 200,
    select: { number: true, title: true, dueDate: true, projectId: true, project: { select: { key: true, name: true } } },
  });
  return rows.map((t) => ({
    key: `${t.project.key}-${t.number}`,
    number: t.number,
    title: t.title,
    projectId: t.projectId,
    projectName: t.project.name,
    dueDate: t.dueDate,
  }));
}
