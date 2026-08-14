import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/**
 * Esquema de variables de entorno obligatorias/opcionales.
 * Se valida en el arranque con class-validator; si algo falta o es inválido,
 * la aplicación falla al iniciar en lugar de correr con configuración rota.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  DB_HOST!: string;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  DB_PORT: number = 5432;

  @IsString()
  @IsNotEmpty()
  DB_USER!: string;

  @IsString()
  @IsNotEmpty()
  DB_PASSWORD!: string;

  @IsString()
  @IsNotEmpty()
  DB_NAME!: string;

  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  @IsOptional()
  DB_SYNCHRONIZE: boolean = false;

  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  @IsOptional()
  DB_LOGGING: boolean = false;
}

/**
 * Función `validate` usada por ConfigModule.forRoot. Lanza una excepción
 * descriptiva listando todas las variables inválidas al arrancar.
 */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const validatedConfig = plainToInstance(EnvironmentVariables, config);

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
    whitelist: true,
    forbidNonWhitelisted: false,
  });

  if (errors.length > 0) {
    const details = errors
      .map(
        (error) =>
          `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
      )
      .join('; ');
    throw new Error(`Configuración de entorno inválida: ${details}`);
  }

  return validatedConfig as unknown as Record<string, unknown>;
}
