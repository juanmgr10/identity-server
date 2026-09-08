import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base/base.entity';

/**
 * Sesión de un usuario autenticado, dueña de la cadena de refresh tokens
 * rotativos (ver `RefreshToken`). Revocar la sesión revoca de raíz todos
 * sus refresh tokens, y su `revokedAt` es lo que consulta el guard de
 * access tokens para invalidar JWT emitidos antes de expirar (Fase 2,
 * pasos 10-12).
 *
 * `ipHash` y `userAgentHash` guardan un hash y nunca el valor en claro:
 * bastan para detectar cambios de dispositivo/red sin persistir datos
 * identificables del cliente.
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
