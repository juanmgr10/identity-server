import 'reflect-metadata';
import 'dotenv/config';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { entities } from './entities';
import { buildDataSourceOptions } from './typeorm.options';

/**
 * DataSource del CLI de migraciones (no se usa en runtime).
 * Carga `.env` vía dotenv y NUNCA usa `synchronize` (solo migraciones).
 */
const config = {
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5433),
  username: process.env.DB_USER ?? 'identity',
  password: process.env.DB_PASSWORD ?? '',
  name: process.env.DB_NAME ?? 'identity_server',
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
};

export const AppDataSource = new DataSource({
  ...buildDataSourceOptions(config),
  entities,
  migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
});
