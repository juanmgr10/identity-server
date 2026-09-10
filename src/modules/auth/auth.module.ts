import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Membership } from '../../entities/membership.entity';
import { Organization } from '../../entities/organization.entity';
import { RefreshToken } from '../../entities/refresh-token.entity';
import { SecurityEvent } from '../../entities/security-event.entity';
import { Session } from '../../entities/session.entity';
import { User } from '../../entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshTokenService } from './refresh-token.service';
import { RevokedSessionCache } from './revoked-session-cache.service';
import { SessionGuard } from './session.guard';
import { SessionService } from './session.service';

/**
 * Registro, login, rotación de refresh tokens y gestión de sesiones (Fase
 * 1, pasos 7-8; Fase 2, pasos 10-12). `TokenService`, `PasswordService` y
 * `JwtService` llegan vía los módulos globales `SecurityModule` y
 * `CryptoModule`; aquí solo se registran las entidades propias del flujo.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Organization,
      User,
      Membership,
      Session,
      RefreshToken,
      SecurityEvent,
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RefreshTokenService,
    SessionService,
    SessionGuard,
    RevokedSessionCache,
  ],
})
export class AuthModule {}
