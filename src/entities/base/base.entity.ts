import {
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Columnas comunes de toda entidad persistida.
 * - `id`: uuid generado en la BD (gen_random_uuid(), núcleo de Postgres 13+).
 * - `createdAt`/`updatedAt`: marcas de tiempo en timestamptz.
 *
 * Clase abstracta: no genera tabla por sí misma, solo se hereda.
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
