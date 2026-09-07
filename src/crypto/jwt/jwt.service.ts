import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sign, verify } from 'node:crypto';
import type { JwtConfig } from '../../config/configuration';
import {
  base64UrlDecode,
  base64UrlDecodeJson,
  base64UrlEncode,
  base64UrlEncodeJson,
} from '../base64url';
import {
  JwtAlgorithmMismatchError,
  JwtClaimsValidationError,
  JwtExpiredError,
  JwtInvalidSignatureError,
  JwtMalformedError,
  JwtNotYetValidError,
  JwtUnknownKeyError,
} from './jwt.errors';
import { JWT_KEY_MATERIAL } from './jwt.constants';
import type { JwtKeyMaterial } from './keys';
import type { JwtPayload, VerifiedJwt } from './jwt.types';

/** Header JWS que siempre emite este servicio (RS256 + kid). */
interface JwtHeader {
  alg: 'RS256';
  typ: 'JWT';
  kid: string;
}

/** Header tal como llega en un token a verificar (campos opcionales). */
interface ParsedHeader {
  alg?: string;
  typ?: string;
  kid?: string;
}

export interface SignOptions {
  /** Sujeto del token (id de usuario). Obligatorio. */
  subject: string;
  /** Vida útil en segundos (por defecto: JWT_ACCESS_TTL_SECONDS). */
  ttlSeconds?: number;
  issuer?: string;
  audience?: string;
  /** Id único del token. */
  jti?: string;
  /** Claims personalizados (p.ej. roles, permissions, org). */
  claims?: Record<string, unknown>;
}

export interface VerifyOptions {
  issuer?: string;
  audience?: string;
}

/**
 * Firma y verificación de JWT **RS256 implementado desde cero** sobre
 * `node:crypto` (sin @nestjs/jwt ni jsonwebtoken).
 *
 * - Firma: RSA-SHA256 (RSASSA-PKCS1-v1_5) con la clave privada.
 * - Verificación: RSA-SHA256 con la clave pública + validación completa de
 *   claims (alg, kid, exp, nbf, iss, aud, sub, iat) y de la firma.
 */
@Injectable()
export class JwtService {
  private readonly jwtConfig: JwtConfig;

  constructor(
    configService: ConfigService,
    @Inject(JWT_KEY_MATERIAL) private readonly keys: JwtKeyMaterial,
  ) {
    this.jwtConfig = configService.get<JwtConfig>('jwt')!;
  }

  /** Firma un JWT compacto: header.payload.firma (todo base64url). */
  sign(options: SignOptions): string {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const ttlSeconds =
      options.ttlSeconds ?? this.jwtConfig.accessTokenTtlSeconds;

    const claims: JwtPayload = {
      ...options.claims,
      iss: options.issuer ?? this.jwtConfig.issuer,
      aud: options.audience ?? this.jwtConfig.audience,
      sub: options.subject,
      iat: nowInSeconds,
      exp: nowInSeconds + ttlSeconds,
    };
    if (options.jti !== undefined) {
      claims.jti = options.jti;
    }

    const header: JwtHeader = { alg: 'RS256', typ: 'JWT', kid: this.keys.kid };
    const encodedHeader = base64UrlEncodeJson(header);
    const encodedPayload = base64UrlEncodeJson(claims);
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const signature = sign(
      'RSA-SHA256',
      Buffer.from(signingInput, 'utf8'),
      this.keys.privateKey,
    );

    return `${signingInput}.${base64UrlEncode(signature)}`;
  }

  /**
   * Verifica un JWT de forma íntegra:
   * 1. Formato (3 segmentos base64url) y JSON legible.
   * 2. Algoritmo RS256 y `kid` conocido.
   * 3. Firma criptográfica con la clave pública.
   * 4. Claims temporales (exp, nbf) y de identidad (iss, aud, sub, iat).
   * Devuelve los claims tipados como `VerifiedJwt` o lanza un `JwtError`.
   */
  verify(token: string, options?: VerifyOptions): VerifiedJwt {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new JwtMalformedError(
        'JWT malformado: se esperaban 3 segmentos (header.payload.firma)',
      );
    }
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    if (
      encodedHeader === undefined ||
      encodedPayload === undefined ||
      encodedSignature === undefined
    ) {
      throw new JwtMalformedError('JWT malformado: segmentos incompletos');
    }

    const header = this.parseSegment<ParsedHeader>(encodedHeader, 'header');
    const payload = this.parseSegment<JwtPayload>(encodedPayload, 'payload');

    if (header.alg !== 'RS256') {
      throw new JwtAlgorithmMismatchError(
        `Algoritmo no permitido: ${header.alg ?? '(ausente)'}`,
      );
    }
    if (header.kid !== undefined && header.kid !== this.keys.kid) {
      throw new JwtUnknownKeyError('kid desconocido: no se reconoce la clave');
    }

    const isValidSignature = this.verifySignature(
      encodedHeader,
      encodedPayload,
      encodedSignature,
    );
    if (!isValidSignature) {
      throw new JwtInvalidSignatureError(
        'Firma inválida para la clave pública',
      );
    }

    return this.validateClaims(payload, options);
  }

  /** Expone el `kid` actual (útil para diagnósticos). */
  get currentKid(): string {
    return this.keys.kid;
  }

  // ── Internos ────────────────────────────────────────────────────────────────

  private parseSegment<T>(segment: string, name: string): T {
    try {
      return base64UrlDecodeJson(segment) as T;
    } catch {
      throw new JwtMalformedError(`JWT malformado: ${name} no es JSON válido`);
    }
  }

  private verifySignature(
    encodedHeader: string,
    encodedPayload: string,
    encodedSignature: string,
  ): boolean {
    try {
      const signingInput = Buffer.from(
        `${encodedHeader}.${encodedPayload}`,
        'utf8',
      );
      const signature = base64UrlDecode(encodedSignature);
      return verify('RSA-SHA256', signingInput, this.keys.publicKey, signature);
    } catch {
      return false;
    }
  }

  private validateClaims(
    payload: JwtPayload,
    options?: VerifyOptions,
  ): VerifiedJwt {
    const nowInSeconds = Math.floor(Date.now() / 1000);

    if (typeof payload.exp !== 'number') {
      throw new JwtClaimsValidationError('Claim exp ausente o no numérico');
    }
    if (payload.exp <= nowInSeconds) {
      throw new JwtExpiredError('Token expirado');
    }
    if (payload.nbf !== undefined && payload.nbf > nowInSeconds) {
      throw new JwtNotYetValidError('Token aún no es válido (nbf)');
    }

    const expectedIssuer = options?.issuer ?? this.jwtConfig.issuer;
    if (payload.iss !== expectedIssuer) {
      throw new JwtClaimsValidationError(
        `Emisor inesperado: ${payload.iss ?? '(ausente)'}`,
      );
    }

    const expectedAudience = options?.audience ?? this.jwtConfig.audience;
    const audienceMatches = Array.isArray(payload.aud)
      ? payload.aud.includes(expectedAudience)
      : payload.aud === expectedAudience;
    if (!audienceMatches) {
      throw new JwtClaimsValidationError('Audiencia no esperada');
    }

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new JwtClaimsValidationError('Claim sub ausente o vacío');
    }
    if (typeof payload.iat !== 'number') {
      throw new JwtClaimsValidationError('Claim iat ausente o no numérico');
    }

    return payload as VerifiedJwt;
  }
}
