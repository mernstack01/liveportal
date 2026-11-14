import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';

export const API_PREFIX = 'api/v1';

/** main.ts va e2e testlar uchun umumiy sozlama. */
export function configureApp(app: INestApplication, webOrigin: string): void {
  app.setGlobalPrefix(API_PREFIX);
  app.use(cookieParser());
  app.enableCors({ origin: webOrigin, credentials: true });
  app.enableShutdownHooks();
}
