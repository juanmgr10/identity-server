import { Controller, Get, Inject } from '@nestjs/common';
import { JWT_KEY_MATERIAL } from './jwt.constants';
import type { JwtKeyMaterial } from './keys';

/** JWK público tal como se expone en /.well-known/jwks.json */
export interface JwkDto {
  kty: string;
  use: 'sig';
  alg: 'RS256';
  kid: string;
  n: string;
  e: string;
}

export interface JwksResponse {
  keys: JwkDto[];
}

/**
 * Punto de descubrimiento de claves públicas (JWKS).
 * Otros servicios lo usan para verificar los access tokens firmados aquí
 * con RS256, sin compartir nunca la clave privada.
 */
@Controller('.well-known')
export class JwksController {
  constructor(
    @Inject(JWT_KEY_MATERIAL) private readonly keys: JwtKeyMaterial,
  ) {}

  @Get('jwks.json')
  getJwks(): JwksResponse {
    const jwk = this.keys.publicKey.export({ format: 'jwk' });
    return {
      keys: [
        {
          kty: jwk.kty ?? 'RSA',
          use: 'sig',
          alg: 'RS256',
          kid: this.keys.kid,
          n: jwk.n ?? '',
          e: jwk.e ?? '',
        },
      ],
    };
  }
}
