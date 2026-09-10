import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Cuerpo de POST /auth/refresh. `refreshToken` es opcional porque los
 * clientes web lo mandan vía la cookie httpOnly (ver `REFRESH_TOKEN_COOKIE_NAME`);
 * solo hace falta en el body para clientes API sin cookie jar.
 */
export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  refreshToken?: string;
}
