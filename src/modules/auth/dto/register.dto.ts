import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsStrongPassword } from '../../../security/password-policy';

/** Cuerpo de POST /auth/register: crea la organización, el usuario owner y la primera sesión. */
export class RegisterDto {
  /** Nombre visible de la organización a crear. El slug se deriva automáticamente. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  organizationName!: string;

  /** Email del usuario, usado como identificador de login. Se normaliza a minúsculas. */
  @IsEmail()
  @MaxLength(255)
  email!: string;

  /** Contraseña en claro; ver política en `IsStrongPassword` (mínimo 12 caracteres + complejidad). */
  @IsStrongPassword()
  password!: string;
}
