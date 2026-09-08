import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base/base.entity';

/** Estado de un eslabón de la cadena de rotación de refresh tokens. */
export enum RefreshTokenStatus {
  /** Vigente: puede canjearse una única vez por un nuevo par de tokens. */
  ACTIVE = 'active',
  /** Ya canjeado: si se presenta de nuevo es señal de reutilización/robo. */
  ROTATED = 'rotated',
  /** Invalidado explícitamente (logout, logout-all, reutilización detectada, ...). */
  REVOKED = 'revoked',
}

/**
 * Eslabón de la cadena de rotación de refresh tokens de una `Session`
 * (Fase 2, paso 10). Solo se persiste `tokenHash`: el valor en claro lo
 * genera `TokenService` y se entrega una única vez al cliente.
 *
 * La rotación nunca reutiliza una fila: al canjear un token activo se
 * marca `status: rotated` y se inserta un nuevo `RefreshToken` enlazado
 * mediante `replacedByTokenId`, formando una cadena auditable. Si un
 * token con `status: rotated` se presenta de nuevo, toda la sesión se
 * revoca por posible robo.
 */
@Entity('refresh_tokens')
export class RefreshToken extends BaseEntity {
  /** Sesión a la que pertenece este eslabón de la cadena. */
  @Index()
  @Column({ type: 'uuid', name: 'session_id' })
  sessionId!: string;

  /** SHA-256 (hex) del token opaco en claro; nunca se persiste el valor en claro. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, name: 'token_hash', unique: true })
  tokenHash!: string;

  /** Momento de emisión de este eslabón. */
  @Column({ type: 'timestamptz', name: 'issued_at' })
  issuedAt!: Date;

  /** Momento de expiración del token. */
  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt!: Date;

  /** Momento en que este token fue canjeado por uno nuevo; null si nunca se rotó. */
  @Column({ type: 'timestamptz', name: 'rotated_at', nullable: true })
  rotatedAt!: Date | null;

  /** Id del `RefreshToken` que sustituyó a este al rotar; null si no se ha rotado. */
  @Column({ type: 'uuid', name: 'replaced_by_token_id', nullable: true })
  replacedByTokenId!: string | null;

  /** Estado actual del token dentro de la cadena de rotación. */
  @Column({
    type: 'enum',
    enum: RefreshTokenStatus,
    default: RefreshTokenStatus.ACTIVE,
  })
  status!: RefreshTokenStatus;

  /** Motivo de revocación cuando `status` es `revoked`. */
  @Column({
    type: 'varchar',
    length: 64,
    name: 'revoked_reason',
    nullable: true,
  })
  revokedReason!: string | null;
}
