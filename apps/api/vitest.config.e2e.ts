import { defineConfig } from 'vitest/config';
import { testDatabaseUrl } from './test/test-db.js';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Alohida `<db>_test` bazasi: ishlab chiqishdagi ma'lumotlar (owner va boshqalar) tegilmaydi.
    globalSetup: ['./test/global-setup.ts'],
    // Lokal PostgreSQL bitta: fayllar ketma-ket ishlaydi.
    fileParallelism: false,
    // process.env .env faylidan ustun turadi.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl(),
      BOT_MODE: 'off',
      OUTBOX_POLL_MS: '0',
      DEV_LOGIN: 'false',
      TELEGRAM_BOT_TOKEN: '123456:E2E_TEST_TOKEN',
      TELEGRAM_BOT_USERNAME: 'liveportal_test_bot',
    },
  },
});
