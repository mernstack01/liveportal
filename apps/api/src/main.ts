import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { configureApp } from './app.setup.js';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  configureApp(app, config.get('WEB_ORIGIN', { infer: true }));
  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
