import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base/base.entity';

/** Estado del ciclo de vida de una organización (tenant). */
export enum OrganizationStatus {
  /** Operativa con normalidad. */
  ACTIVE = 'active',
  /** Suspendida temporalmente (impago, revisión, ...); bloquea el acceso sin borrar datos. */
  SUSPENDED = 'suspended',
  /** Cancelada por el propietario; se conserva para auditoría/retención. */
  CANCELLED = 'cancelled',
}

/** Nivel de suscripción de la organización; determina límites y features habilitadas. */
export enum SubscriptionTier {
  FREE = 'free',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

/**
 * Organización: el tenant raíz del sistema multi-tenant. Toda entidad de
 * negocio (`Membership`, y en fases futuras los recursos protegidos por
 * RBAC/ABAC) cuelga de una `Organization` a través de `organizationId`.
 */
@Entity('organizations')
export class Organization extends BaseEntity {
  /** Nombre visible de la organización. */
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  /** Identificador corto y único usado en URLs y como referencia legible. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, unique: true })
  slug!: string;

  /** Estado del ciclo de vida de la organización. */
  @Column({
    type: 'enum',
    enum: OrganizationStatus,
    default: OrganizationStatus.ACTIVE,
  })
  status!: OrganizationStatus;

  /** Plan de suscripción contratado. */
  @Column({
    type: 'enum',
    enum: SubscriptionTier,
    name: 'subscription_tier',
    default: SubscriptionTier.FREE,
  })
  subscriptionTier!: SubscriptionTier;
}
