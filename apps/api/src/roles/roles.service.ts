import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PROJECT_PERMISSIONS } from '@liveportal/shared';
import { PrismaService } from '../db/prisma.service.js';
import type { WorkspaceContext } from '../auth/auth.types.js';
import { RESERVED_ROLE_NAMES, roleSlug } from './role-slug.js';

const ASSIGNABLE = new Set<string>(PROJECT_PERMISSIONS.map((p) => p.key));

export interface RoleInput {
  title: string;
  permissions: string[];
}

/**
 * Loyiha rollarini boshqarish. Kim: `role.manage` ruxsati workspace rolida (rahbar, admin)
 * yoki biror loyihadagi rolida (teamlead) bo'lgan odam. Rol oshirishdan himoya: odam faqat
 * o'zida bor ruxsatlarni (workspace + barcha loyiha rollari) yangi rolga bera oladi.
 */
@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Odamning barcha ruxsatlari va rollarni boshqara oladimi. */
  async abilities(workspace: WorkspaceContext, userId: string) {
    const projectRoles = await this.prisma.projectMember.findMany({
      where: { userId, project: { workspaceId: workspace.id } },
      select: { role: { select: { permissions: true } } },
    });
    const held = new Set([...workspace.permissions, ...projectRoles.flatMap((m) => m.role.permissions)]);
    return { held, canManage: held.has('role.manage') };
  }

  async list(workspace: WorkspaceContext, userId: string) {
    const { held, canManage } = await this.abilities(workspace, userId);
    const roles = await this.prisma.role.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ isSystem: 'desc' }, { scope: 'asc' }, { title: 'asc' }],
      include: { _count: { select: { projectMembers: true, workspaceMembers: true } } },
    });
    return {
      canManage,
      permissions: PROJECT_PERMISSIONS.map((p) => ({ ...p, allowed: held.has(p.key) })),
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        title: r.title ?? r.name,
        scope: r.scope,
        permissions: r.permissions,
        isSystem: r.isSystem,
        members: r._count.projectMembers + r._count.workspaceMembers,
      })),
    };
  }

  async create(workspace: WorkspaceContext, userId: string, input: RoleInput) {
    const permissions = await this.checkPermissions(workspace, userId, input.permissions);
    const base = roleSlug(input.title);
    let name = RESERVED_ROLE_NAMES.has(base) ? `${base}_2` : base;
    for (let i = 2; await this.prisma.role.findUnique({ where: { workspaceId_name: { workspaceId: workspace.id, name } } }); i++) {
      name = `${base}_${i}`;
    }
    const role = await this.prisma.role.create({
      data: { workspaceId: workspace.id, name, title: input.title, scope: 'PROJECT', permissions, isSystem: false },
    });
    return { id: role.id, name: role.name, title: role.title, scope: role.scope, permissions: role.permissions, isSystem: false, members: 0 };
  }

  async update(workspace: WorkspaceContext, userId: string, roleId: string, input: Partial<RoleInput>) {
    const role = await this.editable(workspace, roleId);
    const permissions = input.permissions ? await this.checkPermissions(workspace, userId, input.permissions) : undefined;
    if (!permissions) await this.requireManager(workspace, userId);
    const saved = await this.prisma.role.update({ where: { id: role.id }, data: { title: input.title, permissions } });
    return { id: saved.id, name: saved.name, title: saved.title, scope: saved.scope, permissions: saved.permissions, isSystem: false };
  }

  async remove(workspace: WorkspaceContext, userId: string, roleId: string): Promise<void> {
    await this.requireManager(workspace, userId);
    const role = await this.editable(workspace, roleId);
    const used = await this.prisma.projectMember.count({ where: { roleId: role.id } });
    if (used > 0) throw new ConflictException(`Bu rol ${used} ta a’zoda ishlatilmoqda. Avval ularning rolini o‘zgartiring`);
    await this.prisma.role.delete({ where: { id: role.id } });
  }

  private async requireManager(workspace: WorkspaceContext, userId: string) {
    const { held, canManage } = await this.abilities(workspace, userId);
    if (!canManage) throw new ForbiddenException('Rol yaratish faqat teamlead, admin va rahbarga ruxsat etilgan');
    return held;
  }

  private async checkPermissions(workspace: WorkspaceContext, userId: string, requested: string[]) {
    const held = await this.requireManager(workspace, userId);
    const permissions = [...new Set(requested)];
    if (permissions.length === 0) throw new BadRequestException('Kamida bitta ruxsat tanlang');
    const unknown = permissions.filter((p) => !ASSIGNABLE.has(p));
    if (unknown.length > 0) throw new BadRequestException(`Loyiha roliga berib bo‘lmaydigan ruxsat: ${unknown.join(', ')}`);
    const escalating = permissions.filter((p) => !held.has(p));
    if (escalating.length > 0) throw new ForbiddenException(`O‘zingizda yo‘q ruxsatni bera olmaysiz: ${escalating.join(', ')}`);
    return permissions;
  }

  private async editable(workspace: WorkspaceContext, roleId: string) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, workspaceId: workspace.id } });
    if (!role) throw new NotFoundException('Rol topilmadi');
    if (role.isSystem) throw new ForbiddenException('Tizim rollarini o‘zgartirib bo‘lmaydi');
    return role;
  }
}
