/**
 * Birinchi owner (yoki istalgan workspace roli) uchun taklif havolasi.
 *   pnpm --filter @liveportal/api invite:create owner "Davlatbek"
 * Havola bir martalik, 7 kun amal qiladi. Uni faqat o'sha odamga yuboring.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { createInviteRecord, inviteLink } from '../src/invites/invite-record.js';

const [roleName = 'owner', note] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL topilmadi');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
try {
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { slug: 'itlive' } });
  const invite = await createInviteRecord(prisma, { workspaceId: workspace.id, roleName, note });
  const link = inviteLink(process.env.TELEGRAM_BOT_USERNAME, invite.token);
  console.log(`Rol: ${invite.role}, amal qiladi: ${invite.expiresAt.toISOString()}`);
  console.log(link ?? `TELEGRAM_BOT_USERNAME yo'q. Botga yuboring: /start inv_${invite.token}`);
} finally {
  await prisma.$disconnect();
}
