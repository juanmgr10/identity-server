import { Global, Module } from '@nestjs/common';
import { TokenService } from './token.service';
import { PasswordService } from './password.service';

/**
 * Módulo global de utilidades de seguridad no ligadas a JWT: tokens opacos
 * de refresh (`TokenService`) y hashing de contraseñas (`PasswordService`).
 * Quedan inyectables en toda la app sin necesidad de importar este módulo
 * en cada feature module.
 */
@Global()
@Module({
  providers: [TokenService, PasswordService],
  exports: [TokenService, PasswordService],
})
export class SecurityModule {}
