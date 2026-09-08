import { createHash } from 'node:crypto';
import { TokenService } from './token.service';

describe('TokenService (tokens opacos de refresh)', () => {
  let service: TokenService;

  beforeEach(() => {
    service = new TokenService();
  });

  describe('generate', () => {
    it('produce un token en base64url y su hash SHA-256 en hexadecimal', () => {
      const { token, tokenHash } = service.generate();

      expect(token).toMatch(/^[A-Za-z0-9_-]+$/); // sin '+', '/' ni '='
      expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(tokenHash).toBe(
        createHash('sha256').update(token, 'utf8').digest('hex'),
      );
    });

    it('genera 32 bytes de entropía (256 bits) antes de codificar', () => {
      const { token } = service.generate();
      expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    });

    it('nunca produce dos tokens iguales (unicidad)', () => {
      const total = 1000;
      const tokens = new Set(
        Array.from({ length: total }, () => service.generate().token),
      );
      expect(tokens.size).toBe(total);
    });

    it('nunca produce dos hashes iguales para tokens distintos', () => {
      const total = 1000;
      const hashes = new Set(
        Array.from({ length: total }, () => service.generate().tokenHash),
      );
      expect(hashes.size).toBe(total);
    });
  });

  describe('hash', () => {
    it('es estable: el mismo token siempre produce el mismo hash', () => {
      const { token } = service.generate();
      const first = service.hash(token);
      const second = service.hash(token);

      expect(first).toBe(second);
      expect(first).toBe(
        createHash('sha256').update(token, 'utf8').digest('hex'),
      );
    });

    it('nunca guarda ni expone el token en claro dentro del hash', () => {
      const { token, tokenHash } = service.generate();
      expect(tokenHash).not.toContain(token);
    });
  });

  describe('verify', () => {
    it('acepta el token correcto contra su propio hash', () => {
      const { token, tokenHash } = service.generate();
      expect(service.verify(token, tokenHash)).toBe(true);
    });

    it('rechaza un token que no corresponde al hash almacenado', () => {
      const { tokenHash } = service.generate();
      const { token: otherToken } = service.generate();
      expect(service.verify(otherToken, tokenHash)).toBe(false);
    });

    it('rechaza un token levemente alterado (un solo carácter distinto)', () => {
      const { token, tokenHash } = service.generate();
      const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
      expect(service.verify(tampered, tokenHash)).toBe(false);
    });

    it('no lanza excepción si el hash almacenado tiene longitud distinta', () => {
      const { token } = service.generate();
      expect(service.verify(token, 'no-es-un-hash-valido')).toBe(false);
      expect(service.verify(token, '')).toBe(false);
    });

    it('compara en tiempo constante usando timingSafeEqual (sin comparar el texto plano)', () => {
      const cryptoModule =
        jest.requireActual<typeof import('node:crypto')>('node:crypto');
      const spy = jest.spyOn(cryptoModule, 'timingSafeEqual');

      const { token, tokenHash } = service.generate();
      service.verify(token, tokenHash);

      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });
});
