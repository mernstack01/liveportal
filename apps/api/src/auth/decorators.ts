import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@liveportal/shared';
import type { AppRequest, AuthUser, WorkspaceContext } from './auth.types.js';

export const IS_PUBLIC = 'isPublic';
/** Endpoint JWT talab qilmaydi. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const REQUIRED_PERMISSION = 'requiredPermission';
/** Workspace darajasidagi ruxsatni talab qiladi (rol nomi emas, ruxsat tekshiriladi). */
export const RequirePermission = (permission: Permission) => SetMetadata(REQUIRED_PERMISSION, permission);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<AppRequest>().user;
  if (!user) throw new Error('CurrentUser faqat himoyalangan endpointda ishlatiladi');
  return user;
});

export const CurrentWorkspace = createParamDecorator((_: unknown, ctx: ExecutionContext): WorkspaceContext => {
  const workspace = ctx.switchToHttp().getRequest<AppRequest>().workspace;
  if (!workspace) throw new Error('CurrentWorkspace uchun @RequirePermission kerak');
  return workspace;
});
