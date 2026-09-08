import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { base64UrlEncode } from '../crypto/base64url';

/** Longitud en bytes del token opaco antes de codificar (256 bits de entropía). */
const TOKEN_BYTE_LENGTH = 32;

/** Un token opaco recién generado junto con el hash listo para persistir. */
export interface OpaqueToken {
  /** Valor en claro: se entrega una única vez al cliente y nunca se persiste. */
  token: string;
  /** SHA-256 del token en hexadecimal: lo único que se guarda en la base de datos. */
  tokenHash: string;
}

/**
 * Generación y verificación de tokens opacos (usados como refresh token).
 *
 * A diferencia del JWT (autocontenido y verificable con la clave pública),
 * un token opaco no lleva información: es un valor aleatorio sin significado
 * que solo el servidor puede resolver, consultando su hash en la base de
 * datos. Esto permite revocarlo de inmediato (a diferencia de un JWT, que
 * vive hasta su expiración) sin más lista de revocación que la propia fila.
 *
 * Reglas de seguridad:
 * - El valor en claro se genera con `randomBytes` (CSPRNG) y solo existe en
 *   memoria el tiempo necesario para devolverlo al cliente.
 * - En la base de datos se guarda únicamente `SHA-256(token)`: si la base de
 *   datos se filtra, los tokens no pueden reconstruirse ni reutilizarse.
 * - Toda comparación usa `timingSafeEqual` para que el tiempo de respuesta no
 *   filtre por canal lateral cuánto coincide un intento con el hash real.
 */
@Injectable()
export class TokenService {
  /** Genera un token opaco de 32 bytes (256 bits) codificado en base64url. */
  generate(): OpaqueToken {
    const token = base64UrlEncode(randomBytes(TOKEN_BYTE_LENGTH));
    return { token, tokenHash: this.hash(token) };
  }

  /** SHA-256 del token, en hexadecimal, listo para persistir/indexar. */
  hash(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  /**
   * Compara un token presentado contra su hash almacenado, en tiempo
   * constante respecto al contenido. Nunca compara el token en claro
   * directamente: siempre lo rehashea y compara los digests resultantes.
   */
  verify(token: string, tokenHash: string): boolean {
    const candidateHash = Buffer.from(this.hash(token), 'hex');
    const storedHash = Buffer.from(tokenHash, 'hex');

    // Un SHA-256 en hex mide siempre 32 bytes; si la longitud no coincide el
    // hash almacenado es inválido y no puede compararse con timingSafeEqual
    // (exige buffers del mismo tamaño). El trabajo ya hecho (dos hashes de
    // igual coste) domina frente a esta rama, por lo que no se filtra nada
    // útil por canal lateral al descartar aquí.
    if (candidateHash.length !== storedHash.length) {
      return false;
    }

    return timingSafeEqual(candidateHash, storedHash);
  }
}
