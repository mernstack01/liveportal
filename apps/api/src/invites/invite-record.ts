import { newToken, sha256 } from '../common/crypto.js';
import type { PrismaClient } from '../generated/prisma/client.js';

export const INVITE_PREFIX = 'inv_';
export const DEFAULT_INVITE_TTL_DAYS = 7;

export interface CreatedInvite {
  id: string;
  token: string;
  role: string;
  expiresAt: Date;
}

/** Nest'dan tashqarida ham ishlaydi (CLI skript birinchi owner uchun). */
export async function createInviteRecord(
  prisma: Pick<PrismaClient, 'role' | 'invite'>,
  args: { workspaceId: string; roleName: string; note?: string; createdById?: string; ttlDays?: number },
): Promise<CreatedInvite> {
  const role = await prisma.role.findUnique({
    where: { workspaceId_name: { workspaceId: args.workspaceId, name: args.roleName } },
  });
  if (!role || role.scope !== 'WORKSPACE') {
    throw new Error(`Workspace roli topilmadi: ${args.roleName}`);
  }
  const token = newToken();
  const expiresAt = new Date(Date.now() + (args.ttlDays ?? DEFAULT_INVITE_TTL_DAYS) * 86_400_000);
  const invite = await prisma.invite.create({
    data: {
      workspaceId: args.workspaceId,
      roleId: role.id,
      tokenHash: sha256(token),
      note: args.note,
      createdById: args.createdById,
      expiresAt,
    },
  });
  return { id: invite.id, token, role: role.name, expiresAt };
}

export function inviteLink(botUsername: string | undefined, token: string): string | null {
  return botUsername ? `https://t.me/${botUsername}?start=${INVITE_PREFIX}${token}` : null;
}
