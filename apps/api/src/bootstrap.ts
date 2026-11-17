import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';

/** Configuration HTTP commune à main.ts et aux tests d'intégration. */
export function configureApp(app: INestApplication): void {
  app.use(helmet());
  const origins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });
  app.enableShutdownHooks();
}
