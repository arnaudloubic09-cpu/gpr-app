import { randomBytes } from 'node:crypto';
import { CryptoService } from './crypto.service';

const make = (key = randomBytes(32).toString('base64')) =>
  new CryptoService({ get: () => key } as never);

describe('CryptoService (identifiants connecteurs chiffrés au repos)', () => {
  it('chiffre puis déchiffre à l’identique', () => {
    const svc = make();
    const creds = { apiKey: 'secret-123', clientId: 'abc' };
    const enc = svc.encryptJson(creds);
    expect(enc).not.toContain('secret-123');
    expect(svc.decryptJson(enc)).toEqual(creds);
  });

  it('utilise un IV aléatoire (deux chiffrements diffèrent)', () => {
    const svc = make();
    expect(svc.encrypt('x')).not.toEqual(svc.encrypt('x'));
  });

  it('détecte toute altération (GCM)', () => {
    const svc = make();
    const [v, iv, tag, data] = svc.encrypt('hello').split(':');
    const tampered = Buffer.from(data, 'base64');
    tampered[0] ^= 0xff;
    expect(() => svc.decrypt([v, iv, tag, tampered.toString('base64')].join(':'))).toThrow();
  });

  it('refuse le déchiffrement avec une autre clé', () => {
    const enc = make().encrypt('hello');
    expect(() => make().decrypt(enc)).toThrow();
  });
});
