import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
} from 'node:crypto';
import { CryptoModule } from '../crypto.module';
import { JWT_KEY_MATERIAL } from './jwt.constants';
import {
  JwtClaimsValidationError,
  JwtExpiredError,
  JwtInvalidSignatureError,
  JwtMalformedError,
  JwtUnknownKeyError,
} from './jwt.errors';
import { JwtService } from './jwt.service';
import { rsaJwkThumbprint, type JwtKeyMaterial } from './keys';

const BASE_CONFIG = {
  issuer: 'identity-server',
  audience: 'identity-server',
  accessTokenTtlSeconds: 900,
  privateKeyPath: '/unused',
  publicKeyPath: '/unused',
};

function makeKeyMaterial(): JwtKeyMaterial {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const publicKeyObject = createPublicKey(publicKey);
  const privateKeyObject = createPrivateKey(privateKey);
  const jwk = publicKeyObject.export({ format: 'jwk' }) as {
    kty: string;
    n: string;
    e: string;
  };
  return {
    publicKey: publicKeyObject,
    privateKey: privateKeyObject,
    kid: rsaJwkThumbprint(jwk),
  };
}

async function createService(
  config: Record<string, unknown> = BASE_CONFIG,
  material: JwtKeyMaterial = makeKeyMaterial(),
): Promise<JwtService> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => ({ jwt: config })],
      }),
      CryptoModule,
    ],
  })
    .overrideProvider(JWT_KEY_MATERIAL)
    .useValue(material)
    .compile();

  return moduleRef.get(JwtService);
}

describe('JwtService (RS256 implementado con node:crypto)', () => {
  let service: JwtService;
  let material: JwtKeyMaterial;

  beforeEach(async () => {
    material = makeKeyMaterial();
    service = await createService(BASE_CONFIG, material);
  });

  it('firma y verifica un token con sus claims', () => {
    const token = service.sign({
      subject: 'user-1',
      claims: { org: 'org-1' },
      ttlSeconds: 300,
    });
    const verified = service.verify(token);

    expect(verified.sub).toBe('user-1');
    expect(verified.iss).toBe('identity-server');
    expect(verified.aud).toBe('identity-server');
    expect(verified.org).toBe('org-1');
    expect(verified.exp - verified.iat).toBe(300);
    expect(verified.iat).toBeGreaterThan(0);
  });

  it('incluye kid y alg RS256 en el header', () => {
    const token = service.sign({ subject: 'u1' });
    const headerPart = token.split('.')[0]!;
    const header = JSON.parse(
      Buffer.from(headerPart, 'base64url').toString('utf8'),
    ) as { kid?: string; alg?: string };

    expect(header.kid).toBe(material.kid);
    expect(header.alg).toBe('RS256');
  });

  it('rechaza un payload manipulado (firma inválida)', () => {
    const token = service.sign({ subject: 'user-1' });
    const segments = token.split('.');
    const headerPart = segments[0]!;
    const signaturePart = segments[2]!;
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: 'attacker' }),
      'utf8',
    ).toString('base64url');

    expect(() =>
      service.verify(`${headerPart}.${tamperedPayload}.${signaturePart}`),
    ).toThrow(JwtInvalidSignatureError);
  });

  it('rechaza un token firmado con otra clave (kid distinto)', async () => {
    const otherService = await createService();
    const foreignToken = otherService.sign({ subject: 'user-1' });

    expect(() => service.verify(foreignToken)).toThrow(JwtUnknownKeyError);
  });

  it('rechaza un token expirado', () => {
    const token = service.sign({ subject: 'u1', ttlSeconds: -60 });
    expect(() => service.verify(token)).toThrow(JwtExpiredError);
  });

  it('rechaza un token con audiencia distinta a la esperada', () => {
    const token = service.sign({ subject: 'u1', audience: 'otra-app' });
    expect(() => service.verify(token)).toThrow(JwtClaimsValidationError);
  });

  it('rechaza tokens malformados', () => {
    expect(() => service.verify('solo-dos-segmentos')).toThrow(
      JwtMalformedError,
    );
    expect(() => service.verify('a.b.c.d')).toThrow(JwtMalformedError);
  });
});
