import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base/base.entity';

/**
 * Tipo de evento de seguridad registrado. Catálogo abierto (string, no
 * enum de base de datos) porque crece con cada fase: login/registro ahora,
 * reutilización de refresh token y cambios de RBAC más adelante.
 */
export enum SecurityEventType {
  REGISTER_SUCCEEDED = 'register_succeeded',
  LOGIN_SUCCEEDED = 'login_succeeded',
  LOGIN_FAILED = 'login_failed',
  ACCOUNT_LOCKED = 'account_locked',
}

/**
 * Evento de seguridad puntual (intentos de login, bloqueos de cuenta, ...).
 * Es deliberadamente ligero: solo lo necesario para la lógica de bloqueo
 * de cuentas y para diagnóstico. La auditoría formal, inmutable y con
 * cadena de hashes (`AuditLog`) llega en la Fase 4 y registrará estos
 * mismos hechos con garantías más fuertes; hasta entonces `SecurityEvent`
 * es la única traza.
 */
@Entity('security_events')
export class SecurityEvent extends BaseEntity {
  /** Organización relacionada, cuando se conoce (puede no haberla, p.ej. email inexistente). */
  @Index()
  @Column({ type: 'uuid', name: 'org_id', nullable: true })
  orgId!: string | null;

  /** Usuario relacionado, cuando se conoce. */
  @Index()
  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId!: string | null;

  /** Tipo de evento. */
  @Column({ type: 'varchar', length: 64 })
  type!: SecurityEventType;

  /** Dirección IP del cliente en claro (a diferencia de `Session.ipHash`: aquí sirve para investigar incidentes). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  ip!: string | null;

  /** User-Agent del cliente en claro. */
  @Column({ type: 'varchar', length: 512, name: 'user_agent', nullable: true })
  userAgent!: string | null;

  /** Contexto adicional (p.ej. el email intentado en un login fallido). */
  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;
}
