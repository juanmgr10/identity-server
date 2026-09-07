/** Claims registrados del estándar JWT (RFC 7519) que gestiona este emisor. */
export interface JwtClaims {
  /** Emisor. */
  iss?: string;
  /** Sujeto (id de usuario). */
  sub?: string;
  /** Audiencia (string o lista). */
  aud?: string | string[];
  /** Emitido en (epoch, segundos). */
  iat?: number;
  /** No válido antes de (epoch, segundos). */
  nbf?: number;
  /** Expira en (epoch, segundos). */
  exp?: number;
  /** Id único del token. */
  jti?: string;
  /** Id de sesión (se usa en la fase 2). */
  sid?: string;
}

/** Payload = claims registrados + claims personalizados. */
export type JwtPayload = JwtClaims & Record<string, unknown>;

/** Claims ya verificados (los obligatorios se validaron como presentes). */
export interface VerifiedJwt {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nbf?: number;
  jti?: string;
  sid?: string;
  [claim: string]: unknown;
}
