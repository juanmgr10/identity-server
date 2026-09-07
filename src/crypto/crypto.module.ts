import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { JwtConfig } from '../config/configuration';
import { JwksController } from './jwt/jwks.controller';
import { JWT_KEY_MATERIAL } from './jwt/jwt.constants';
import { JwtService } from './jwt/jwt.service';
import { loadJwtKeys, type JwtKeyMaterial } from './jwt/keys';

/**
 * Módulo global de criptografía JWT.
 * Carga el par de claves RS256 desde disco (configurado en .env) y lo expone
 * vía el token JWT_KEY_MATERIAL. JwtService queda inyectable en toda la app.
 */
@Global()
@Module({
  controllers: [JwksController],
  providers: [
    {
      provide: JWT_KEY_MATERIAL,
      useFactory: (configService: ConfigService): JwtKeyMaterial => {
        const jwt = configService.get<JwtConfig>('jwt');
        if (!jwt) {
          throw new Error('Configuración JWT ausente (bloque "jwt")');
        }
        try {
          return loadJwtKeys(jwt.privateKeyPath, jwt.publicKeyPath);
        } catch (error) {
          throw new Error(
            `No se pudieron cargar las claves JWT (${jwt.privateKeyPath}, ` +
              `${jwt.publicKeyPath}). Ejecuta antes: npm run keys:generate. ` +
              `Detalle: ${(error as Error).message}`,
          );
        }
      },
      inject: [ConfigService],
    },
    JwtService,
  ],
  exports: [JwtService, JWT_KEY_MATERIAL],
})
export class CryptoModule {}
