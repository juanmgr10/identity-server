import { DataSourceOptions } from 'typeorm';
import type { DatabaseConfig } from '../config/configuration';

/**
 * Construye las opciones comunes de TypeORM, compartidas por:
 *  - el módulo de NestJS (TypeOrmModule.forRootAsync) y
 *  - el DataSource del CLI de migraciones (src/database/data-source.ts).
 *
 * `uuidExtension: 'pgcrypto'` hace que los ids uuid usen `gen_random_uuid()`
 * (función del núcleo de Postgres 13+), sin depender de la extensión uuid-ossp.
 */
export function buildDataSourceOptions(
  config: DatabaseConfig,
): DataSourceOptions {
  return {
    type: 'postgres',
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    database: config.name,
    synchronize: config.synchronize,
    logging: config.logging,
    uuidExtension: 'pgcrypto',
  };
}
