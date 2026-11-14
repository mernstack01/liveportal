import 'dotenv/config';

/**
 * E2e testlar ishlab chiqish bazasiga tegmaydi: `.env` dagi DATABASE_URL'dan `<db>_test` bazasi olinadi.
 * Boshqa manzil kerak bo'lsa, DATABASE_URL_TEST beriladi.
 */
export function testDatabaseUrl(): string {
  if (process.env.DATABASE_URL_TEST) return process.env.DATABASE_URL_TEST;
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL topilmadi (.env)');
  const url = new URL(base);
  const name = url.pathname.replace(/^\//, '');
  if (!name) throw new Error('DATABASE_URL da baza nomi yo‘q');
  url.pathname = `/${name.endsWith('_test') ? name : `${name}_test`}`;
  return url.toString();
}
