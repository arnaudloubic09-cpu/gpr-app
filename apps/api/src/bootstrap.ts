import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';

/** Configuration HTTP commune à main.ts et aux tests d'intégration. */
export function configureApp(app: INestApplication): void {
  // Derrière un reverse proxy (Caddy, load balancer) : vraie adresse IP du client.
  const trustProxy = Number(process.env.TRUST_PROXY ?? 0);
  if (trustProxy > 0)
    (app.getHttpAdapter().getInstance() as { set: (k: string, v: number) => void }).set(
      'trust proxy',
      trustProxy,
    );
  app.use(helmet());
  const origins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });
  app.enableShutdownHooks();
}
