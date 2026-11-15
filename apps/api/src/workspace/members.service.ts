import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { WorkspaceContext } from '../auth/auth.types.js';
import { PrismaService } from '../db/prisma.service.js';
import { recordEvent } from '../events/outbox.js';

/**
 * Workspace xodimlarini boshqarish: ro'yxat, rolni o'zgartirish, chiqarish.
 * Qoida (taklifdagidek): odam faqat o'zida bor ruxsatlar to'plamidan oshmaydigan rol bilan ishlaydi —
 * admin rahbarni o'zgartira ham, chiqara ham olmaydi. O'zini o'zgartirib yoki chiqarib bo'lmaydi.
 */
@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  /** `canManage` — shu odamni joriy foydalanuvchi o'zgartira/chiqara oladimi (tugmalar uchun). */
  async list(workspace: WorkspaceContext, actorId: string) {
    const rows = await this.prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { joinedAt: 'asc' },
      select: {
        userId: true,
        joinedAt: true,
        role: { select: { name: true, permissions: true } },
        user: { select: { name: true, telegramUsername: true, avatarUrl: true } },
      },
    });
    const managing = workspace.permissions.includes('member.role.assign') || workspace.permissions.includes('member.remove');
    return rows.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      telegramUsername: m.user.telegramUsername,
      avatarUrl: m.user.avatarUrl,
      role: m.role.name,
      joinedAt: m.joinedAt,
      canManage: managing && m.userId !== actorId && this.covers(workspace, m.role.permissions),
    }));
  }

  async changeRole(workspace: WorkspaceContext, actorId: string, userId: string, roleName: string) {
    const member = await this.manageable(workspace, actorId, userId);
    const role = await this.prisma.role.findUnique({ where: { workspaceId_name: { workspaceId: workspace.id, name: roleName } } });
    if (!role || role.scope !== 'WORKSPACE') throw new BadRequestException(`«${roleName}» degan workspace roli yo‘q`);
    if (!this.covers(workspace, role.permissions)) throw new ForbiddenException('O‘zingizdan yuqori rol bera olmaysiz');
    if (role.id === member.roleId) return { userId, role: role.name };
    await this.assertOwnerRemains(workspace, member.role.name, role.name);

    await this.prisma.$transaction(async (tx) => {
      await tx.workspaceMember.update({ where: { workspaceId_userId: { workspaceId: workspace.id, userId } }, data: { roleId: role.id } });
      await recordEvent(tx, {
        workspaceId: workspace.id,
        type: 'member.role_changed',
        actorId,
        entityType: 'user',
        entityId: userId,
        payload: { from: member.role.name, to: role.name },
      });
    });
    return { userId, role: role.name };
  }

  /**
   * Chiqarish (ishdan ketgan xodim): bitta tranzaksiyada —
   * workspace a'zoligi, barcha loyihalardagi a'zoligi, tasklardagi mas'ulligi, insidentlardagi mas'ulligi olinadi,
   * hamma sessiyalari yopiladi va navbatdagi Telegram xabarlari bekor qilinadi.
   * Odam o'zi yozgan tasklar, izohlar va xabarlar tarix uchun qoladi.
   */
  async remove(workspace: WorkspaceContext, actorId: string, userId: string) {
    const member = await this.manageable(workspace, actorId, userId);
    await this.assertOwnerRemains(workspace, member.role.name, null);
    const inWorkspace = { project: { workspaceId: workspace.id } };

    return this.prisma.$transaction(async (tx) => {
      const tasks = await tx.taskAssignee.deleteMany({ where: { userId, task: inWorkspace } });
      const projects = await tx.projectMember.deleteMany({ where: { userId, ...inWorkspace } });
      const incidents = await tx.incident.updateMany({ where: { ownerId: userId, ...inWorkspace }, data: { ownerId: null } });
      await tx.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId: workspace.id, userId } } });
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.notification.updateMany({ where: { userId, status: 'pending' }, data: { status: 'failed', lastError: 'Workspace’dan chiqarilgan' } });
      const summary = { tasks: tasks.count, projects: projects.count, incidents: incidents.count };
      await recordEvent(tx, {
        workspaceId: workspace.id,
        type: 'member.removed',
        actorId,
        entityType: 'user',
        entityId: userId,
        payload: { role: member.role.name, name: member.user.name, ...summary },
      });
      return { userId, ...summary };
    });
  }

  /** Ruxsat to'plami joriy foydalanuvchinikidan oshmaydimi. */
  private covers(workspace: WorkspaceContext, permissions: string[]) {
    return permissions.every((p) => workspace.permissions.includes(p));
  }

  private async manageable(workspace: WorkspaceContext, actorId: string, userId: string) {
    if (userId === actorId) throw new ForbiddenException('O‘zingizni o‘zgartira yoki chiqara olmaysiz');
    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
      include: { role: true, user: { select: { name: true } } },
    });
    if (!member) throw new NotFoundException('Bu odam workspace’da yo‘q');
    if (!this.covers(workspace, member.role.permissions)) throw new ForbiddenException('O‘zingizdan yuqori roldagi odamni o‘zgartira olmaysiz');
    return member;
  }

  /** Workspace rahbarsiz qolmasin. */
  private async assertOwnerRemains(workspace: WorkspaceContext, fromRole: string, toRole: string | null) {
    if (fromRole !== 'owner' || toRole === 'owner') return;
    const owners = await this.prisma.workspaceMember.count({ where: { workspaceId: workspace.id, role: { name: 'owner' } } });
    if (owners <= 1) throw new BadRequestException('Oxirgi rahbarni o‘zgartirib yoki chiqarib bo‘lmaydi');
  }
}
