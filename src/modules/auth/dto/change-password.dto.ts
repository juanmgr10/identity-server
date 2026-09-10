import { IsNotEmpty, IsString } from 'class-validator';
import { IsStrongPassword } from '../../../security/password-policy';

/** Cuerpo de POST /auth/change-password. */
export class ChangePasswordDto {
  /** No se valida la política de complejidad aquí: es la contraseña vigente, no la nueva. */
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  /** Ver política en `IsStrongPassword` (mínimo 12 caracteres + complejidad). */
  @IsStrongPassword()
  newPassword!: string;
}
