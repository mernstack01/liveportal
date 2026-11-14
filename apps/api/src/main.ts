import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

export const API_PREFIX = 'api/v1';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix(API_PREFIX);
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' });
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 4100);
}
await bootstrap();
