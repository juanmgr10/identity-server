import type { Request } from 'express';

/** Datos del cliente HTTP relevantes para sesiones y auditoría (IP y User-Agent). */
export interface RequestContext {
  ip: string | undefined;
  userAgent: string | undefined;
}

/** Par de tokens devuelto por registro, login y rotación. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  /** Vida del access token en segundos. */
  expiresIn: number;
  /** Vida del refresh token en segundos (usada para el `Max-Age` de su cookie). */
  refreshExpiresIn: number;
}

/**
 * Cuerpo JSON de respuesta de `AuthController`: igual que `AuthTokens` pero
 * sin `refreshToken`, que por defecto solo viaja en la cookie httpOnly
 * (paso 11). Se reincorpora únicamente para clientes API que lo piden
 * explícitamente con el header `API_CLIENT_TYPE_HEADER`.
 */
export type AuthResponseBody = Omit<AuthTokens, 'refreshToken'> &
  Partial<Pick<AuthTokens, 'refreshToken'>>;

/**
 * Identidad resuelta por `SessionGuard` (paso 12, adelantado del guard
 * completo del paso 15) a partir de un access token válido y su sesión
 * vigente. La adjunta a `Request.auth`; los controllers la leen con el
 * decorador `@CurrentAuth()`.
 */
export interface AuthContext {
  userId: string;
  orgId: string;
  sessionId: string;
  roles: string[];
}

/** `Request` de Express ya autenticado por `SessionGuard`. */
export interface AuthenticatedRequest extends Request {
  auth: AuthContext;
}

/** Resumen de una sesión activa devuelto por `GET /auth/sessions`. */
export interface SessionSummary {
  id: string;
  orgId: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  /** true si es la sesión del propio access token usado para la petición. */
  current: boolean;
}
