import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { testDatabaseUrl } from './test-db.js';

/** Test bazasi yo'q bo'lsa yaratiladi, keyin migration va seed qo'llanadi (ikkalasi ham idempotent). */
export default async function setup(): Promise<void> {
  const url = new URL(testDatabaseUrl());
  const dbName = url.pathname.slice(1);
  if (!/^[A-Za-z0-9_]+$/.test(dbName)) throw new Error(`Test bazasi nomi noto‘g‘ri: ${dbName}`);

  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const exists = await client.query('select 1 from pg_database where datname = $1', [dbName]);
    if (exists.rowCount === 0) await client.query(`create database "${dbName}"`);
  } finally {
    await client.end();
  }

  const env = { ...process.env, DATABASE_URL: url.toString() };
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { env, stdio: 'pipe' });
  execFileSync('pnpm', ['exec', 'tsx', 'prisma/seed.ts'], { env, stdio: 'pipe' });
}
