import { validateEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(40),
  OTP_PEPPER: 'y'.repeat(40),
  CONNECTOR_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
};

describe('validateEnv', () => {
  it('accepte une configuration valide et applique les valeurs par défaut', () => {
    const env = validateEnv(base);
    expect(env.OTP_TTL_MINUTES).toBe(10);
    expect(env.OTP_MAX_ATTEMPTS).toBe(5);
  });

  it('refuse une clé de chiffrement de mauvaise taille', () => {
    expect(() => validateEnv({ ...base, CONNECTOR_ENCRYPTION_KEY: 'trop-courte' })).toThrow(
      /CONNECTOR_ENCRYPTION_KEY/,
    );
  });

  it('refuse un secret JWT trop court', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'court' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('refuse une configuration de production incomplète', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(
      /CORS_ORIGINS[\s\S]*SMTP_HOST/,
    );
  });

  it('accepte une configuration de production complète', () => {
    const env = validateEnv({
      ...base,
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://admin.gpr.example',
      SMTP_HOST: 'smtp-relay.example.com',
      SMTP_USER: 'u',
      SMTP_PASS: 'p',
    });
    expect(env.NODE_ENV).toBe('production');
  });
});
