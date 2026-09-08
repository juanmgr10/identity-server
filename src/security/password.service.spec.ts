import { PasswordService, ARGON2ID_PARAMS } from './password.service';

describe('PasswordService (Argon2id)', () => {
  let service: PasswordService;

  beforeEach(() => {
    service = new PasswordService();
  });

  describe('hash', () => {
    it('produce un hash con formato PHC de argon2id y los parámetros OWASP', async () => {
      const hash = await service.hash('correct horse battery staple 1!');

      expect(hash).toMatch(/^\$argon2id\$v=\d+\$m=\d+,[tp]=\d+,[tp]=\d+\$/);
      expect(hash).toContain(`m=${ARGON2ID_PARAMS.memoryCost}`);
      expect(hash).toContain(`t=${ARGON2ID_PARAMS.timeCost}`);
      expect(hash).toContain(`p=${ARGON2ID_PARAMS.parallelism}`);
    });

    it('nunca produce el mismo hash dos veces para la misma contraseña (sal aleatoria)', async () => {
      const password = 'correct horse battery staple 1!';
      const [first, second] = await Promise.all([
        service.hash(password),
        service.hash(password),
      ]);
      expect(first).not.toBe(second);
    });
  });

  describe('verify', () => {
    it('acepta la contraseña correcta', async () => {
      const hash = await service.hash('correct horse battery staple 1!');
      await expect(
        service.verify('correct horse battery staple 1!', hash),
      ).resolves.toBe(true);
    });

    it('rechaza una contraseña incorrecta', async () => {
      const hash = await service.hash('correct horse battery staple 1!');
      await expect(service.verify('wrong password', hash)).resolves.toBe(false);
    });

    it('rechaza sin lanzar excepción cuando el hash almacenado está corrupto', async () => {
      await expect(
        service.verify('cualquier password', 'no-es-un-hash-argon2'),
      ).resolves.toBe(false);
    });
  });

  describe('needsRehash', () => {
    it('devuelve false para un hash generado con los parámetros vigentes', async () => {
      const hash = await service.hash('correct horse battery staple 1!');
      expect(service.needsRehash(hash)).toBe(false);
    });

    it('devuelve true para un hash generado con parámetros de coste distintos', () => {
      const outdatedHash =
        '$argon2id$v=19$m=4096,t=3,p=1$c29tZXNhbHQ$aGFzaHZhbHVl';
      expect(service.needsRehash(outdatedHash)).toBe(true);
    });

    it('devuelve true para un hash con formato irreconocible', () => {
      expect(service.needsRehash('no-es-un-hash-argon2')).toBe(true);
    });
  });
});
