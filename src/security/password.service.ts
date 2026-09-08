import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Parámetros de Argon2id recomendados por OWASP (Password Storage Cheat
 * Sheet) para el perfil de "primera opción" cuando hay memoria disponible:
 * 19 MiB de coste de memoria, 2 iteraciones y 1 hilo de paralelismo.
 *
 * Se exportan porque `needsRehash` los necesita para comparar contra los
 * parámetros embebidos en un hash ya almacenado.
 */
export const ARGON2ID_PARAMS = {
  type: argon2.argon2id,
  memoryCost: 19456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const;

/** Extrae `m`, `t` y `p` de la cabecera de un hash con codificación PHC (`$argon2id$v=19$m=...,t=...,p=...$...`, en cualquier orden). */
function parseEncodedParams(
  encodedHash: string,
): { memoryCost: number; timeCost: number; parallelism: number } | null {
  const header = /\$argon2id\$v=\d+\$([^$]+)\$/.exec(encodedHash)?.[1];
  if (!header) {
    return null;
  }

  const params = new Map(
    header.split(',').map((pair) => {
      const [key, value] = pair.split('=');
      return [key, Number(value)];
    }),
  );

  const memoryCost = params.get('m');
  const timeCost = params.get('t');
  const parallelism = params.get('p');
  if (
    memoryCost === undefined ||
    timeCost === undefined ||
    parallelism === undefined
  ) {
    return null;
  }

  return { memoryCost, timeCost, parallelism };
}

/**
 * Hashing y verificación de contraseñas con Argon2id.
 *
 * Reglas de seguridad:
 * - El hash resultante (formato PHC) lleva embebidos el algoritmo, la
 *   versión, los parámetros de coste y la sal: es autocontenido y no hace
 *   falta guardar nada más junto a él.
 * - `verify` delega en `argon2.verify`, que compara en tiempo constante
 *   respecto al contenido (no hay atajo de comparación byte a byte propio
 *   que pueda filtrar por canal lateral).
 * - `needsRehash` permite migrar hashes antiguos de forma transparente: si
 *   los parámetros de coste vigentes (`ARGON2ID_PARAMS`) cambian con el
 *   tiempo (hardware más rápido, nueva recomendación OWASP), el llamador
 *   compara tras un login exitoso y re-hashea con los parámetros nuevos.
 */
@Injectable()
export class PasswordService {
  /** Genera el hash Argon2id (formato PHC) de una contraseña en claro. */
  async hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2ID_PARAMS);
  }

  /**
   * Verifica una contraseña en claro contra un hash almacenado. Nunca
   * lanza por credenciales inválidas: una contraseña incorrecta o un hash
   * corrupto/con otro algoritmo resuelven en `false`.
   */
  async verify(password: string, storedHash: string): Promise<boolean> {
    try {
      return await argon2.verify(storedHash, password);
    } catch {
      return false;
    }
  }

  /**
   * Indica si un hash ya almacenado se generó con parámetros de coste
   * distintos a los vigentes (`ARGON2ID_PARAMS`), y por tanto conviene
   * re-hashear la contraseña en el próximo login exitoso.
   */
  needsRehash(storedHash: string): boolean {
    const current = parseEncodedParams(storedHash);
    if (!current) {
      // Hash con formato irreconocible (algoritmo distinto, versión previa
      // a Argon2, ...): se trata como desactualizado para forzar el rehash.
      return true;
    }
    return (
      current.memoryCost !== ARGON2ID_PARAMS.memoryCost ||
      current.timeCost !== ARGON2ID_PARAMS.timeCost ||
      current.parallelism !== ARGON2ID_PARAMS.parallelism
    );
  }
}
