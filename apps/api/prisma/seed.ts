/**
 * Boshlang'ich ma'lumotlar: IT Live workspace va tizim rollari.
 * Qayta ishga tushirish xavfsiz (upsert). Rollar ruxsatlari har safar
 * `@liveportal/shared` dagi SYSTEM_ROLES bilan sinxronlanadi.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { SYSTEM_ROLES } from '@liveportal/shared';
import { PrismaClient } from '../src/generated/prisma/client.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL topilmadi');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const workspace = await prisma.workspace.upsert({
    where: { slug: 'itlive' },
    update: {},
    create: { name: 'IT Live Academy', slug: 'itlive' },
  });

  for (const role of SYSTEM_ROLES) {
    await prisma.role.upsert({
      where: { workspaceId_name: { workspaceId: workspace.id, name: role.name } },
      update: { title: role.title, scope: role.scope, permissions: [...role.permissions], isSystem: true },
      create: {
        workspaceId: workspace.id,
        name: role.name,
        title: role.title,
        scope: role.scope,
        permissions: [...role.permissions],
        isSystem: true,
      },
    });
  }

  console.log(`Seed tayyor: workspace "${workspace.name}", ${SYSTEM_ROLES.length} ta rol`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
