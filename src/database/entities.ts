/**
 * Registro único de ENTIDADES CONCRETAS para el DataSource de migraciones (CLI).
 *
 * Las entidades base (abstractas) de `src/entities/base` NO se listan aquí:
 * no tienen `@Entity`, solo se heredan.
 *
 * En la app NestJS las entidades se cargan por módulo vía
 * `TypeOrmModule.forFeature([...])` + `autoLoadEntities` (ver app.module.ts).
 *
 * A medida que se creen entidades en fases siguientes, añadirlas aquí:
 *   export const entities: EntityClass[] = [Organization, User, Membership];
 */

/** Clase de entidad registrable en TypeORM (construible sin argumentos). */
export type EntityClass = new (...args: never[]) => object;

export const entities: EntityClass[] = [];
