import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Cuerpo de POST /auth/login. */
export class LoginDto {
  @IsEmail()
  email!: string;

  /** No se valida la política de complejidad aquí: una contraseña antigua podría no cumplirla. */
  @IsString()
  @IsNotEmpty()
  password!: string;

  /**
   * Slug de la organización en la que iniciar sesión. Obligatorio solo si
   * el usuario tiene membresía en más de una organización; con una sola
   * membresía se resuelve automáticamente.
   */
  @IsString()
  @IsOptional()
  organizationSlug?: string;
}
