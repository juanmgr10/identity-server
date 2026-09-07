/**
 * Jerarquía de errores de JWT. Permite a los guards/controladores distinguir
 * la causa exacta y responder 401 (o 403) con precisión, sin filtrar detalles.
 */
export class JwtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Token con formato inválido o segmentos ilegibles. */
export class JwtMalformedError extends JwtError {}

/** El header declara un algoritmo distinto de RS256. */
export class JwtAlgorithmMismatchError extends JwtError {}

/** El `kid` del token no corresponde a ninguna clave conocida. */
export class JwtUnknownKeyError extends JwtError {}

/** La firma no es válida con la clave pública (token alterado o ajeno). */
export class JwtInvalidSignatureError extends JwtError {}

/** El token ha expirado (exp <= ahora). */
export class JwtExpiredError extends JwtError {}

/** El token aún no es válido (nbf > ahora). */
export class JwtNotYetValidError extends JwtError {}

/** Claims obligatorios ausentes o fuera de lo esperado (iss/aud/sub/iat). */
export class JwtClaimsValidationError extends JwtError {}
