/** Datos del cliente HTTP relevantes para sesiones y auditoría (IP y User-Agent). */
export interface RequestContext {
  ip: string | undefined;
  userAgent: string | undefined;
}

/** Par de tokens devuelto por registro y login. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  /** Vida del access token en segundos (el refresh token vive mucho más, ver configuración `auth.refreshTokenTtlSeconds`). */
  expiresIn: number;
}
