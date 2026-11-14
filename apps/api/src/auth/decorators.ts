import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@liveportal/shared';
import type { AppRequest, AuthUser, ProjectContext, WorkspaceContext } from './auth.types.js';

export const IS_PUBLIC = 'isPublic';
/** Endpoint JWT talab qilmaydi. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const REQUIRED_PERMISSION = 'requiredPermission';
/** Workspace darajasidagi ruxsatni talab qiladi (rol nomi emas, ruxsat tekshiriladi). */
export const RequirePermission = (permission: Permission) => SetMetadata(REQUIRED_PERMISSION, permission);

export const REQUIRE_MEMBERSHIP = 'requireMembership';
/** Faqat workspace a'zoligi kerak, alohida ruxsat shart emas (masalan, hamkasblar ro'yxati). */
export const RequireMembership = () => SetMetadata(REQUIRE_MEMBERSHIP, true);

export const PROJECT_ACCESS = 'projectAccess';
/**
 * `:projectId` dagi loyihaga kirish. Ruxsat berilsa, u workspace yoki loyiha rolida bo'lishi kerak.
 * Ruxsatsiz chaqirilsa, loyihani ko'ra olish yetarli (a'zo yoki `dashboard.view_all`).
 */
export const RequireProjectAccess = (permission?: Permission) =>
  SetMetadata(PROJECT_ACCESS, { permission: permission ?? null });

export interface ProjectAccessMeta {
  permission: Permission | null;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<AppRequest>().user;
  if (!user) throw new Error('CurrentUser faqat himoyalangan endpointda ishlatiladi');
  return user;
});

export const CurrentWorkspace = createParamDecorator((_: unknown, ctx: ExecutionContext): WorkspaceContext => {
  const workspace = ctx.switchToHttp().getRequest<AppRequest>().workspace;
  if (!workspace) throw new Error('CurrentWorkspace uchun @RequirePermission, @RequireMembership yoki @RequireProjectAccess kerak');
  return workspace;
});

export const CurrentProject = createParamDecorator((_: unknown, ctx: ExecutionContext): ProjectContext => {
  const project = ctx.switchToHttp().getRequest<AppRequest>().project;
  if (!project) throw new Error('CurrentProject uchun @RequireProjectAccess kerak');
  return project;
});
