import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { ProjectContext, WorkspaceContext } from '../auth/auth.types.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { recordEvent } from '../events/outbox.js';
import type { Project } from '../generated/prisma/client.js';
import type { AddMemberDto, CreateProjectDto, UpdateProjectDto } from './dto/project.dto.js';
import { type MemberRow, ProjectsRepository } from './projects.repository.js';

/** Loyihani yaratgan odam shu rolni oladi (docs/02: loyiha rahbari). */
const CREATOR_ROLE = 'teamlead';

function summary(p: Project) {
  return {
    id: p.id,
    key: p.key,
    name: p.name,
    description: p.description,
    status: p.status,
    startDate: p.startDate,
    dueDate: p.dueDate,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function toMember(m: MemberRow) {
  return {
    userId: m.userId,
    name: m.user.name,
    telegramUsername: m.user.telegramUsername,
    avatarUrl: m.user.avatarUrl,
    role: m.role.name,
    /** Xodim (task oladi, ichki chatni ko'radi) yoki mijoz. */
    isClient: !m.role.permissions.includes('task.view'),
    joinedAt: m.joinedAt,
  };
}

@Injectable()
export class ProjectsService {
  constructor(private readonly repo: ProjectsRepository) {}

  /** `dashboard.view_all` bo'lsa hamma loyihalar, bo'lmasa faqat a'zo bo'lganlari. */
  async list(workspace: WorkspaceContext, userId: string, includeArchived: boolean) {
    const rows = await this.repo.list({
      workspaceId: workspace.id,
      userId,
      onlyMine: !workspace.permissions.includes('dashboard.view_all'),
      includeArchived,
    });
    return rows.map((p) => ({ ...summary(p), myRole: p.members[0]?.role.name ?? null, memberCount: p._count.members }));
  }

  async get(project: ProjectContext) {
    const p = await this.repo.findDetail(project.id);
    // Hal qilinmagan insidentlar soni (bo'lim yonidagi belgi uchun); ko'ra olmaydiganga — null.
    const openIncidents = project.permissions.includes('incident.view')
      ? await this.repo.prisma.incident.count({ where: { projectId: project.id, status: { not: 'RESOLVED' } } })
      : null;
    // Muddat tarixi — xodimlarga (mijozga emas); kelishuv havolasi — faqat pulni ko'radigan rahbarga.
    const staff = project.permissions.includes('task.view');
    const [dueChanges, deal] = await Promise.all([
      staff
        ? this.repo.prisma.projectDueChange.findMany({
            where: { projectId: project.id },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: { id: true, from: true, to: true, reason: true, createdAt: true, author: { select: { id: true, name: true } } },
          })
        : [],
      project.permissions.includes('deal.view_all') ? this.repo.prisma.deal.findUnique({ where: { projectId: project.id }, select: { number: true } }) : null,
    ]);
    const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
    return {
      ...summary(p),
      openIncidents,
      dueChanges: dueChanges.map((c) => ({ id: c.id, from: day(c.from), to: day(c.to), reason: c.reason, createdAt: c.createdAt, author: { userId: c.author.id, name: c.author.name } })),
      deal: deal ? { number: deal.number, key: `K-${deal.number}` } : null,
      statuses: p.statuses,
      members: p.members.map(toMember),
      myRole: project.role,
      myPermissions: project.permissions,
    };
  }

  async create(workspace: WorkspaceContext, userId: string, dto: CreateProjectDto) {
    const creatorRole = await this.repo.findRole(this.repo.prisma, workspace.id, CREATOR_ROLE);
    if (creatorRole?.scope !== 'PROJECT') throw new Error(`«${CREATOR_ROLE}» loyiha roli seed qilinmagan`);

    let project: Project;
    try {
      project = await this.repo.prisma.$transaction(async (tx) => {
        const created = await this.repo.create(tx, {
          workspaceId: workspace.id,
          creatorId: userId,
          creatorRoleId: creatorRole.id,
          data: dto,
        });
        await recordEvent(tx, {
          workspaceId: workspace.id,
          type: 'project.created',
          actorId: userId,
          entityType: 'project',
          entityId: created.id,
          payload: { key: created.key, name: created.name },
        });
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(`«${dto.key}» kaliti band, boshqasini tanlang`);
      throw error;
    }

    return this.get({
      id: project.id,
      workspaceId: workspace.id,
      role: creatorRole.name,
      permissions: [...new Set([...workspace.permissions, ...creatorRole.permissions])],
    });
  }

  async update(project: ProjectContext, userId: string, dto: UpdateProjectDto) {
    const current = await this.repo.findById(this.repo.prisma, project.id);
    const statusChanged = dto.status !== undefined && dto.status !== current.status;
    const archiving = statusChanged && (dto.status === 'ARCHIVED' || current.status === 'ARCHIVED');
    if (archiving && !project.permissions.includes('project.archive')) {
      throw new ForbiddenException('Loyihani arxivlash yoki arxivdan chiqarish uchun ruxsat yo‘q');
    }

    const startDate = dto.startDate !== undefined ? dto.startDate : current.startDate;
    const dueDate = dto.dueDate !== undefined ? dto.dueDate : current.dueDate;
    if (startDate && dueDate && dueDate < startDate) {
      throw new BadRequestException('Muddat boshlanish sanasidan oldin bo‘lishi mumkin emas');
    }

    const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
    const dueChanged = dto.dueDate !== undefined && day(dto.dueDate) !== day(current.dueDate);
    // Birinchi marta qo'yilsa — sababsiz; mavjud muddat o'zgarsa — sabab majburiy (rahbar ko'radi).
    if (dueChanged && current.dueDate && !dto.dueReason) throw new BadRequestException('Muddat nima uchun o‘zgarayotganini yozing');
    const { dueReason, ...fields } = dto;

    await this.repo.prisma.$transaction(async (tx) => {
      await this.repo.update(tx, project.id, fields);
      const base = { workspaceId: project.workspaceId, actorId: userId, entityType: 'project', entityId: project.id } as const;
      await recordEvent(tx, { ...base, type: 'project.updated', payload: { fields: Object.keys(fields) } });
      if (dueChanged) {
        await tx.projectDueChange.create({ data: { projectId: project.id, authorId: userId, from: current.dueDate, to: dto.dueDate ?? null, reason: dueReason ?? 'Birinchi marta qo‘yildi' } });
        if (current.dueDate) {
          await recordEvent(tx, { ...base, type: 'project.due_changed', payload: { due: { from: day(current.dueDate), to: day(dto.dueDate ?? null), reason: dueReason ?? null } } });
        }
      }
      if (statusChanged) {
        await recordEvent(tx, { ...base, type: 'project.status_changed', payload: { from: current.status, to: dto.status } });
      }
    });
    return this.get(project);
  }

  async addMember(project: ProjectContext, actorId: string, dto: AddMemberDto) {
    const role = await this.assignableRole(project, dto.role);
    if (!(await this.repo.isWorkspaceMember(this.repo.prisma, project.workspaceId, dto.userId))) {
      throw new NotFoundException('Bu odam workspace’da yo‘q. Avval uni taklif qiling');
    }
    if (await this.repo.findMember(this.repo.prisma, project.id, dto.userId)) {
      throw new ConflictException('Bu odam loyihada allaqachon bor');
    }

    const member = await this.repo.prisma.$transaction(async (tx) => {
      const added = await this.repo.addMember(tx, project.id, dto.userId, role.id);
      await recordEvent(tx, {
        workspaceId: project.workspaceId,
        type: 'project.member_added',
        actorId,
        entityType: 'project',
        entityId: project.id,
        payload: { userId: dto.userId, role: role.name },
      });
      return added;
    });
    return toMember(member);
  }

  async changeMemberRole(project: ProjectContext, actorId: string, userId: string, roleName: string) {
    if (actorId === userId) throw new ForbiddenException('O‘z rolingizni o‘zgartira olmaysiz');
    const current = await this.requireMember(project, userId);
    const role = await this.assignableRole(project, roleName);
    if (current.role.name === role.name) return toMember(current);

    const member = await this.repo.prisma.$transaction(async (tx) => {
      const updated = await this.repo.setMemberRole(tx, project.id, userId, role.id);
      await recordEvent(tx, {
        workspaceId: project.workspaceId,
        type: 'project.member_role_changed',
        actorId,
        entityType: 'project',
        entityId: project.id,
        payload: { userId, from: current.role.name, to: role.name },
      });
      return updated;
    });
    return toMember(member);
  }

  async removeMember(project: ProjectContext, actorId: string, userId: string): Promise<void> {
    if (actorId === userId) throw new ForbiddenException('O‘zingizni loyihadan chiqara olmaysiz');
    const current = await this.requireMember(project, userId);

    await this.repo.prisma.$transaction(async (tx) => {
      await this.repo.removeMember(tx, project.id, userId);
      // Loyihani endi ko'rmaydi: shu loyihadagi tasklar va insidentlarda mas'ul bo'lib qolmasin.
      const tasks = await tx.taskAssignee.deleteMany({ where: { userId, task: { projectId: project.id } } });
      const incidents = await tx.incident.updateMany({ where: { ownerId: userId, projectId: project.id }, data: { ownerId: null } });
      await recordEvent(tx, {
        workspaceId: project.workspaceId,
        type: 'project.member_removed',
        actorId,
        entityType: 'project',
        entityId: project.id,
        payload: { userId, role: current.role.name, tasks: tasks.count, incidents: incidents.count },
      });
    });
  }

  private async requireMember(project: ProjectContext, userId: string) {
    const member = await this.repo.findMember(this.repo.prisma, project.id, userId);
    if (!member) throw new NotFoundException('Bu odam loyihada yo‘q');
    return member;
  }

  /** Loyiha roli bo'lishi va bergan odamning ruxsatlaridan oshmasligi kerak (rol oshirishdan himoya). */
  private async assignableRole(project: ProjectContext, name: string) {
    const role = await this.repo.findRole(this.repo.prisma, project.workspaceId, name);
    if (role?.scope !== 'PROJECT') throw new BadRequestException(`«${name}» degan loyiha roli yo‘q`);
    if (role.permissions.some((p) => !project.permissions.includes(p))) {
      throw new ForbiddenException('O‘zingizdan yuqori rol bera olmaysiz');
    }
    return role;
  }
}
