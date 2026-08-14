export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  name: string;
  synchronize: boolean;
  logging: boolean;
}

export interface AppConfig {
  nodeEnv: string;
  port: number;
  database: DatabaseConfig;
}

/**
 * Factory tipada de configuración. Se registra con ConfigModule via `load`.
 * Los valores ya fueron validados por `validateEnv` antes de llegar aquí.
 */
export const loadConfig = (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USER ?? 'identity',
    password: process.env.DB_PASSWORD ?? '',
    name: process.env.DB_NAME ?? 'identity_server',
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true',
  },
});
