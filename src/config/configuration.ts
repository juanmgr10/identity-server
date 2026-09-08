export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  name: string;
  synchronize: boolean;
  logging: boolean;
}

export interface JwtConfig {
  issuer: string;
  audience: string;
  accessTokenTtlSeconds: number;
  privateKeyPath: string;
  publicKeyPath: string;
}

export interface AuthConfig {
  /** Vida del refresh token opaco, en segundos (por defecto 30 días). */
  refreshTokenTtlSeconds: number;
}

export interface AppConfig {
  nodeEnv: string;
  port: number;
  database: DatabaseConfig;
  jwt: JwtConfig;
  auth: AuthConfig;
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
  jwt: {
    issuer: process.env.JWT_ISSUER ?? 'identity-server',
    audience: process.env.JWT_AUDIENCE ?? 'identity-server',
    accessTokenTtlSeconds: Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900),
    privateKeyPath:
      process.env.JWT_PRIVATE_KEY_PATH ?? './secrets/jwt-private.pem',
    publicKeyPath:
      process.env.JWT_PUBLIC_KEY_PATH ?? './secrets/jwt-public.pem',
  },
  auth: {
    refreshTokenTtlSeconds: Number(
      process.env.REFRESH_TOKEN_TTL_SECONDS ?? 2592000,
    ),
  },
});
