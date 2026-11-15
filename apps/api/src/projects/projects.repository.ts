import { Injectable } from '@nestjs/common';
import { DEFAULT_WORKFLOW } from '@liveportal/shared';
import { PrismaService } from '../db/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

type Db = PrismaService | Prisma.TransactionClient;

const memberSelect = {
  userId: true,
  joinedAt: true,
  role: { select: { name: true, permissions: true } },
  user: { select: { name: true, telegramUsername: true, avatarUrl: true } },
} satisfies Prisma.ProjectMemberSelect;

export type MemberRow = Prisma.ProjectMemberGetPayload<{ select: typeof memberSelect }>;

/** Loyiha moduli jadvallariga (Project, ProjectMember, WorkflowStatus) murojaat faqat shu yerda. */
@Injectable()
export class ProjectsRepository {
  constructor(readonly prisma: PrismaService) {}

  list(args: { workspaceId: string; userId: string; onlyMine: boolean; includeArchived: boolean }) {
    return this.prisma.project.findMany({
      where: {
        workspaceId: args.workspaceId,
        ...(args.includeArchived ? {} : { status: { not: 'ARCHIVED' } }),
        ...(args.onlyMine ? { members: { some: { userId: args.userId } } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { members: true } },
        members: { where: { userId: args.userId }, select: { role: { select: { name: true } } } },
      },
    });
  }

  findDetail(projectId: string) {
    return this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: {
        statuses: { orderBy: { order: 'asc' }, select: { id: true, name: true, category: true, color: true, order: true } },
        members: { orderBy: { joinedAt: 'asc' }, select: memberSelect },
      },
    });
  }

  findById(db: Db, projectId: string) {
    return db.project.findUniqueOrThrow({ where: { id: projectId } });
  }

  /** Loyiha + standart statuslar + yaratuvchi a'zo sifatida. */
  async create(
    db: Db,
    args: { workspaceId: string; creatorId: string; creatorRoleId: string; data: Omit<Prisma.ProjectCreateManyInput, 'workspaceId'> },
  ) {
    return db.project.create({
      data: {
        ...args.data,
        workspaceId: args.workspaceId,
        statuses: { create: DEFAULT_WORKFLOW.map((s, order) => ({ ...s, order })) },
        members: { create: { userId: args.creatorId, roleId: args.creatorRoleId } },
      },
    });
  }

  update(db: Db, projectId: string, data: Prisma.ProjectUpdateInput) {
    return db.project.update({ where: { id: projectId }, data });
  }

  findRole(db: Db, workspaceId: string, name: string) {
    return db.role.findUnique({ where: { workspaceId_name: { workspaceId, name } } });
  }

  findMember(db: Db, projectId: string, userId: string) {
    return db.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, select: memberSelect });
  }

  isWorkspaceMember(db: Db, workspaceId: string, userId: string) {
    return db.workspaceMember
      .findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { userId: true } })
      .then(Boolean);
  }

  addMember(db: Db, projectId: string, userId: string, roleId: string) {
    return db.projectMember.create({ data: { projectId, userId, roleId }, select: memberSelect });
  }

  setMemberRole(db: Db, projectId: string, userId: string, roleId: string) {
    return db.projectMember.update({ where: { projectId_userId: { projectId, userId } }, data: { roleId }, select: memberSelect });
  }

  removeMember(db: Db, projectId: string, userId: string) {
    return db.projectMember.delete({ where: { projectId_userId: { projectId, userId } } });
  }
}
