/**
 * Genera el par de claves RSA-2048 para firmar JWT (RS256).
 *
 * Uso: npm run keys:generate
 * Escribe en ./secrets/jwt-private.pem (0600) y ./secrets/jwt-public.pem.
 * La clave privada NO debe versionarse (./secrets/ está en .gitignore).
 *
 * El `kid` se imprime como referencia: la app lo deriva automáticamente
 * (RFC 7638) al cargar las claves, así que no hace falta configurarlo.
 */
import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
} from 'node:crypto';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const projectRoot = resolve(__dirname, '..');

const privateKeyPath = process.env.JWT_PRIVATE_KEY_PATH
  ? resolve(projectRoot, process.env.JWT_PRIVATE_KEY_PATH)
  : join(projectRoot, 'secrets', 'jwt-private.pem');
const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH
  ? resolve(projectRoot, process.env.JWT_PUBLIC_KEY_PATH)
  : join(projectRoot, 'secrets', 'jwt-public.pem');

mkdirSync(dirname(privateKeyPath), { recursive: true });

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
chmodSync(privateKeyPath, 0o600);
writeFileSync(publicKeyPath, publicKey);

// kid RFC 7638 (mismo algoritmo que src/crypto/jwt/keys.ts)
const jwk = createPublicKey(publicKey).export({ format: 'jwk' }) as {
  kty: string;
  n: string;
  e: string;
};
const kid = createHash('sha256')
  .update(JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n }))
  .digest('base64url');

console.log('Claves RSA-2048 generadas:');
console.log(`  privada : ${privateKeyPath}`);
console.log(`  pública : ${publicKeyPath}`);
console.log(`  kid     : ${kid}`);
console.log('\nIMPORTANTE: la clave privada no debe versionarse.');
