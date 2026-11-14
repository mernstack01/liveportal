/**
 * Birinchi owner (yoki istalgan workspace roli) uchun taklif havolasi.
 *   pnpm --filter @liveportal/api invite:create owner "Davlatbek"
 * Havola bir martalik, 7 kun amal qiladi. Uni faqat o'sha odamga yuboring.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { envFields } from '../src/config/env.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { createInviteRecord, inviteLink } from '../src/invites/invite-record.js';

const [roleName = 'owner', note] = process.argv.slice(2);
// API bilan bir xil qoidalar: masalan, username boshidagi `@` olib tashlanadi.
const env = envFields.pick({ DATABASE_URL: true, TELEGRAM_BOT_USERNAME: true }).parse(process.env);

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
try {
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { slug: 'itlive' } });
  const invite = await createInviteRecord(prisma, { workspaceId: workspace.id, roleName, note });
  const link = inviteLink(env.TELEGRAM_BOT_USERNAME, invite.token);
  console.log(`Rol: ${invite.role}, amal qiladi: ${invite.expiresAt.toISOString()}`);
  console.log(link ?? `TELEGRAM_BOT_USERNAME yo'q. Botga yuboring: /start inv_${invite.token}`);
} finally {
  await prisma.$disconnect();
}
