import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base/base.entity';

/**
 * Sesión de un usuario autenticado, dueña de la cadena de refresh tokens
 * rotativos (ver `RefreshToken`). Revocar la sesión revoca de raíz todos
 * sus refresh tokens, y su `revokedAt` es lo que consulta el guard de
 * access tokens para invalidar JWT emitidos antes de expirar (Fase 2,
 * pasos 10-12).
 *
 * `ipHash` y `userAgentHash` siguen guardando solo el hash (se usan para la
 * detección de reutilización del paso 10). `ip` y `userAgent` (paso 12)
 * guardan el valor en claro únicamente para que el usuario pueda reconocer
 * sus propias sesiones activas en `GET /auth/sessions` (igual que ya hace
 * `SecurityEvent` con sus propios campos `ip`/`userAgent`).
 */
@Entity('sessions')
export class Session extends BaseEntity {
  /** Usuario dueño de la sesión. FK a `User` se añadirá junto a la entidad en Fase 1. */
  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  /** Organización (tenant) en la que se abrió la sesión. FK a `Organization` en Fase 1. */
  @Index()
  @Column({ type: 'uuid', name: 'org_id' })
  orgId!: string;

  /** Hash del identificador de red del cliente en el momento de crear la sesión. */
  @Column({ type: 'varchar', length: 64, name: 'ip_hash' })
  ipHash!: string;

  /** Hash del User-Agent del cliente en el momento de crear la sesión. */
  @Column({ type: 'varchar', length: 64, name: 'user_agent_hash' })
  userAgentHash!: string;

  /** IP en claro del cliente al crear la sesión (solo para mostrarla al usuario; ver doc de la clase). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  ip!: string | null;

  /** User-Agent en claro del cliente al crear la sesión (solo para mostrarlo al usuario; ver doc de la clase). */
  @Column({ type: 'varchar', length: 512, name: 'user_agent', nullable: true })
  userAgent!: string | null;

  /** Última vez que la sesión se usó para emitir o rotar un token. */
  @Column({ type: 'timestamptz', name: 'last_seen_at' })
  lastSeenAt!: Date;

  /** Momento de revocación; null mientras la sesión sigue activa. */
  @Column({ type: 'timestamptz', name: 'revoked_at', nullable: true })
  revokedAt!: Date | null;

  /** Motivo de la revocación (logout, logout-all, reutilización detectada, cambio de contraseña, ...). */
  @Column({
    type: 'varchar',
    length: 64,
    name: 'revoked_reason',
    nullable: true,
  })
  revokedReason!: string | null;
}
