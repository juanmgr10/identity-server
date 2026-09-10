import { Injectable } from '@nestjs/common';

/**
 * Caché en memoria de sesiones revocadas (paso 12). Un access token JWT es
 * válido por firma hasta que expira; sin este mecanismo, revocar una
 * sesión (logout, logout-all, cambio de contraseña, reutilización de
 * refresh token detectada en el paso 10) no tendría ningún efecto sobre
 * los access tokens ya emitidos hasta que expiraran solos.
 *
 * `SessionGuard` la consulta primero (rápido, sin ir a la base de datos) y
 * cae a consultar `Session.revokedAt` cuando el sid todavía no está en
 * caché — por ejemplo, por un revocado desde otra instancia del proceso,
 * o tras un reinicio. Solo se cachean sesiones revocadas: una vez
 * revocada, una sesión nunca vuelve a activarse, así que no hace falta
 * invalidar ni expirar entradas.
 */
@Injectable()
export class RevokedSessionCache {
  private readonly revokedSince = new Map<string, Date>();

  markRevoked(sessionId: string, revokedAt: Date = new Date()): void {
    this.revokedSince.set(sessionId, revokedAt);
  }

  isRevoked(sessionId: string): boolean {
    return this.revokedSince.has(sessionId);
  }
}
