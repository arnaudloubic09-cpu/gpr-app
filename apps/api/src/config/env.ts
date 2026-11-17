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
  /** Notifications push : « log » (simulé, par défaut) ou « expo » (production). */
  PUSH_PROVIDER: z.enum(['log', 'expo']).default('log'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_FROM: z.string().default('GPR <no-reply@gpr.local>'),
  /** Fournisseur d'emails en production (ex. Brevo) : authentification et TLS. */
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Nombre de proxys de confiance devant l'API (reverse proxy / load balancer) : vraie IP pour la limitation de débit. */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
});

export type Env = z.infer<typeof envSchema>;

/** En production, certaines valeurs de développement sont interdites. */
const productionSchema = envSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;
  const fail = (path: string, message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  if (!env.CORS_ORIGINS.trim())
    fail('CORS_ORIGINS', 'obligatoire en production (adresse du back-office)');
  if (env.SMTP_HOST === 'localhost')
    fail('SMTP_HOST', 'un vrai fournisseur d’emails est requis en production');
  if (!env.SMTP_USER || !env.SMTP_PASS) fail('SMTP_USER', 'identifiants SMTP requis en production');
  if (/change-me/i.test(env.JWT_ACCESS_SECRET + env.OTP_PEPPER))
    fail('JWT_ACCESS_SECRET', 'secret par défaut interdit');
});

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = productionSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuration invalide :\n${details}`);
  }
  return parsed.data;
}
