import { Column, Entity, Index } from 'typeorm';
import { TenantEntity } from './base/tenant.entity';

/**
 * Vínculo entre un `User` y una `Organization`, con el rol que ese usuario
 * tiene dentro de ese tenant concreto (`roleId`; el catálogo de roles y
 * permisos llega en la Fase 3). Un usuario tiene como máximo una
 * membresía por organización: `(organizationId, userId)` es único.
 *
 * Hereda `organizationId` de `TenantEntity`, la misma base que usará el
 * resto de entidades propietarias de una organización.
 */
@Entity('memberships')
@Index(['organizationId', 'userId'], { unique: true })
export class Membership extends TenantEntity {
  /** Usuario miembro de la organización. */
  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  /** Rol del usuario dentro de esta organización. FK al catálogo de roles (Fase 3). */
  @Column({ type: 'uuid', name: 'role_id' })
  roleId!: string;
}
