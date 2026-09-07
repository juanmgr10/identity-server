import {
  createHash,
  createPrivateKey,
  createPublicKey,
  type KeyObject,
} from 'node:crypto';
import { readFileSync } from 'node:fs';

/** Par de claves RSA cargado + `kid` derivado (RFC 7638). */
export interface JwtKeyMaterial {
  privateKey: KeyObject;
  publicKey: KeyObject;
  kid: string;
}

/** Miembros de un JWK RSA necesarios para el thumbprint. */
export interface RsaJwk {
  kty: string;
  n: string;
  e: string;
}

/**
 * Thumbprint RFC 7638 de una clave pública RSA: SHA-256 sobre el JSON
 * canónico de {e, kty, n} (orden lexicográfico), codificado en base64url.
 * Se usa como `kid`, estable y único por clave.
 */
export function rsaJwkThumbprint(jwk: RsaJwk): string {
  const canonical = JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n });
  return createHash('sha256').update(canonical).digest('base64url');
}

/**
 * Carga el par de claves PEM desde disco y deriva el `kid`.
 * Lanza un error descriptivo si los archivos no existen o no son RSA válidos.
 */
export function loadJwtKeys(
  privateKeyPath: string,
  publicKeyPath: string,
): JwtKeyMaterial {
  const privateKey = createPrivateKey(readFileSync(privateKeyPath, 'utf8'));
  const publicKey = createPublicKey(readFileSync(publicKeyPath, 'utf8'));
  const jwk = publicKey.export({ format: 'jwk' }) as unknown as RsaJwk;
  return { privateKey, publicKey, kid: rsaJwkThumbprint(jwk) };
}
