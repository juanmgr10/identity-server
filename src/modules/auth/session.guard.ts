import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { JwtService } from '../../crypto/jwt/jwt.service';
import { Session } from '../../entities/session.entity';
import { User, UserStatus } from '../../entities/user.entity';
import { RevokedSessionCache } from './revoked-session-cache.service';
import type { AuthenticatedRequest } from './auth.types';

/** Lee el access token del header `Authorization: Bearer <token>`. */
function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) {
    return null;
  }
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }
  return token;
}

/**
 * Guard de autenticación mínimo para los endpoints de sesión del paso 12,
 * adelantado del `JwtAuthGuard` completo del paso 15 (Fase 3, con
 * decoradores de roles/permisos). Verifica el access token JWT y además:
 *
 * - Rechaza sesiones revocadas: primero contra la caché en memoria de
 *   `RevokedSessionCache` (rápido) y, si el sid no está ahí, cae a
 *   consultar `Session.revokedAt` en la base de datos (fuente de verdad,
 *   por ejemplo si la revocación ocurrió en otra instancia).
 * - Rechaza tokens firmados antes del último cambio de contraseña,
 *   comparando el claim `pwd_ver` con `User.passwordChangedAt` vigente.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly revokedSessionCache: RevokedSessionCache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(req);
    if (!token) {
      throw new UnauthorizedException('Falta el access token');
    }

    let claims;
    try {
      claims = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Access token inválido');
    }

    if (claims.token_type !== 'access') {
      throw new UnauthorizedException('Access token inválido');
    }
    const sessionId = claims.sid;
    if (!sessionId) {
      throw new UnauthorizedException('Access token inválido');
    }

    if (this.revokedSessionCache.isRevoked(sessionId)) {
      throw new UnauthorizedException('Sesión revocada');
    }

    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });
    if (!session || session.revokedAt) {
      if (session?.revokedAt) {
        this.revokedSessionCache.markRevoked(session.id, session.revokedAt);
      }
      throw new UnauthorizedException('Sesión revocada');
    }

    const user = await this.userRepository.findOne({
      where: { id: claims.sub },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Usuario no disponible');
    }
    if (user.passwordChangedAt.getTime() !== claims.pwd_ver) {
      throw new UnauthorizedException(
        'Access token invalidado por un cambio de contraseña',
      );
    }

    req.auth = {
      userId: user.id,
      orgId: typeof claims.org === 'string' ? claims.org : '',
      sessionId,
      roles: Array.isArray(claims.roles) ? (claims.roles as string[]) : [],
    };
    return true;
  }
}
