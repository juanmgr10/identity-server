import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Not, Repository } from 'typeorm';
import {
  RefreshToken,
  RefreshTokenStatus,
} from '../../entities/refresh-token.entity';
import {
  SecurityEvent,
  SecurityEventType,
} from '../../entities/security-event.entity';
import { Session } from '../../entities/session.entity';
import { recordSecurityEvent } from './auth.util';
import { RevokedSessionCache } from './revoked-session-cache.service';
import type { RequestContext, SessionSummary } from './auth.types';

/**
 * Gestión de sesiones (paso 12): listar, revocar una concreta, logout y
 * logout-all. `revokeSessionRows` es el primitivo transaccional compartido
 * también con `RefreshTokenService`, que lo usa al detectar reutilización
 * de un refresh token (paso 10) para revocar la sesión completa.
 */
@Injectable()
export class SessionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(SecurityEvent)
    private readonly securityEventRepository: Repository<SecurityEvent>,
    private readonly revokedSessionCache: RevokedSessionCache,
  ) {}

  /** Sesiones activas (no revocadas) del usuario, en todas sus organizaciones, más recientes primero. */
  async listActiveSessions(userId: string): Promise<SessionSummary[]> {
    const sessions = await this.sessionRepository.find({
      where: { userId, revokedAt: IsNull() },
      order: { lastSeenAt: 'DESC' },
    });
    return sessions.map((session) => ({
      id: session.id,
      orgId: session.orgId,
      ip: session.ip,
      userAgent: session.userAgent,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      current: false, // el controller lo corrige comparando con la sesión del token actual
    }));
  }

  /** Revoca una sesión propia por id (`POST /auth/sessions`). Idempotente si ya estaba revocada. */
  async revokeSession(
    userId: string,
    sessionId: string,
    context: RequestContext,
  ): Promise<void> {
    const didRevoke = await this.dataSource.transaction(async (manager) => {
      const session = await manager.findOne(Session, {
        where: { id: sessionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session || session.userId !== userId) {
        throw new NotFoundException('Sesión no encontrada');
      }
      if (session.revokedAt) {
        return false;
      }
      await this.revokeSessionRows(manager, session, 'revoked_by_user');
      return true;
    });

    if (didRevoke) {
      await recordSecurityEvent(this.securityEventRepository, {
        type: SecurityEventType.SESSION_REVOKED,
        userId,
        context,
        metadata: { sessionId },
      });
    }
  }

  /** Cierra la sesión del propio access token usado (`POST /auth/logout`). */
  async logout(
    userId: string,
    sessionId: string,
    context: RequestContext,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const session = await manager.findOne(Session, {
        where: { id: sessionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (session && session.userId === userId && !session.revokedAt) {
        await this.revokeSessionRows(manager, session, 'logout');
      }
    });

    await recordSecurityEvent(this.securityEventRepository, {
      type: SecurityEventType.LOGOUT,
      userId,
      context,
    });
  }

  /** Cierra todas las sesiones activas del usuario (`POST /auth/logout-all`). */
  async logoutAll(userId: string, context: RequestContext): Promise<number> {
    const sessionsRevoked = await this.revokeAllSessions(userId, 'logout_all');

    await recordSecurityEvent(this.securityEventRepository, {
      type: SecurityEventType.LOGOUT_ALL,
      userId,
      context,
      metadata: { sessionsRevoked },
    });
    return sessionsRevoked;
  }

  /**
   * Revoca todas las sesiones activas del usuario con el motivo dado, sin
   * registrar ningún `SecurityEvent` propio: lo usa `logoutAll` (que sí
   * registra el suyo) y `AuthService.changePassword` (que registra
   * `password_changed` en su lugar).
   */
  async revokeAllSessions(userId: string, reason: string): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      // `find` (a diferencia de `findOne`) no soporta `lock` en TypeORM; cada
      // fila igual se serializa al escribirla en `revokeSessionRows` más
      // abajo, y revocar una fila ya revocada es una operación idempotente.
      const sessions = await manager.find(Session, {
        where: { userId, revokedAt: IsNull() },
      });
      for (const session of sessions) {
        await this.revokeSessionRows(manager, session, reason);
      }
      return sessions.length;
    });
  }

  /**
   * Revoca una `Session` ya cargada y todos sus refresh tokens no
   * revocados dentro de una transacción ya abierta, y marca el sid en la
   * caché en memoria para que `SessionGuard` rechace de inmediato
   * cualquier access token de esa sesión. Método público porque
   * `RefreshTokenService.handleReuse` (paso 10) también lo usa.
   */
  async revokeSessionRows(
    manager: EntityManager,
    session: Session,
    reason: string,
  ): Promise<void> {
    session.revokedAt = new Date();
    session.revokedReason = reason;
    await manager.save(session);

    await manager.update(
      RefreshToken,
      { sessionId: session.id, status: Not(RefreshTokenStatus.REVOKED) },
      { status: RefreshTokenStatus.REVOKED, revokedReason: reason },
    );

    this.revokedSessionCache.markRevoked(session.id, session.revokedAt);
  }
}
