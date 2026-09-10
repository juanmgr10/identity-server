import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthContext, AuthenticatedRequest } from './auth.types';

/**
 * Extrae el `AuthContext` que `SessionGuard` adjunta al request. Solo
 * lanza si la ruta olvidó `@UseGuards(SessionGuard)`: es un fallo de
 * programación, no algo que pueda provocar un cliente.
 */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.auth) {
      throw new UnauthorizedException('No autenticado');
    }
    return req.auth;
  },
);
