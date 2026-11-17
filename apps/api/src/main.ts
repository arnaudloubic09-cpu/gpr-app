import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
  Logger.log(`API GPR démarrée sur http://localhost:${port}`, 'Bootstrap');
}
void bootstrap();
