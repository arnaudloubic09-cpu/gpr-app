import { z } from 'zod';

/** Validation stricte des variables d'environnement au démarrage. */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().url(),
  CORS_ORIGINS: z.string().default(''),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET doit faire au moins 32 caractères'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  OTP_PEPPER: z.string().min(32, 'OTP_PEPPER doit faire au moins 32 caractères'),
  OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_MAX_REQUESTS_PER_WINDOW: z.coerce.number().int().positive().default(3),
  OTP_REQUEST_WINDOW_MINUTES: z.coerce.number().int().positive().default(10),
  CONNECTOR_ENCRYPTION_KEY: z
    .string()
    .refine(
      (v) => Buffer.from(v, 'base64').length === 32,
      'Clé AES-256 attendue : 32 octets en base64',
    ),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  /** Active la planification (synchro périodique, expiration). Désactivé dans les tests. */
  JOBS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** Fenêtre de relecture à chaque synchro, pour capter les annulations / absences tardives. */
  SYNC_LOOKBACK_DAYS: z.coerce.number().int().positive().default(7),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_FROM: z.string().default('GPR <no-reply@gpr.local>'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuration invalide :\n${details}`);
  }
  return parsed.data;
}
