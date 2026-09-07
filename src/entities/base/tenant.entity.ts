import { Column, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

/**
 * Base para toda entidad multi-tenant: añade la organización propietaria.
 * El aislamiento se fuerza en la capa de datos (toda consulta filtra por
 * organizationId); la relación/FK con Organization se define en fase 1.
 */
export abstract class TenantEntity extends BaseEntity {
  /** Organización (tenant) propietaria de la fila. */
  @Index()
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;
}
