import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { AuthConfig, JwtConfig } from '../../config/configuration';
import { JwtService } from '../../crypto/jwt/jwt.service';
import { Membership } from '../../entities/membership.entity';
import {
  RefreshToken,
  RefreshTokenStatus,
} from '../../entities/refresh-token.entity';
import {
  SecurityEvent,
  SecurityEventType,
} from '../../entities/security-event.entity';
import { Session } from '../../entities/session.entity';
import { User, UserStatus } from '../../entities/user.entity';
import { TokenService } from '../../security/token.service';
import { KNOWN_ROLE_NAMES } from './auth.constants';
import { hashClientInfo } from './auth.util';
import { SessionService } from './session.service';
import type { AuthTokens, RequestContext } from './auth.types';

/** Datos mínimos de sesión/rol necesarios para emitir un par de tokens. */
export interface IssueTokensInput {
  user: User;
  orgId: string;
  roleId: string;
  session: Session;
}

/** Par de tokens emitido junto con la fila `RefreshToken` recién creada. */
interface IssuedTokens {
  authTokens: AuthTokens;
  refreshToken: RefreshToken;
}

/** Resultado interno de la transacción de `rotate`: éxito o motivo de rechazo. */
type RotateResult =
  { rejected: null; authTokens: AuthTokens } | { rejected: string };

/**
 * Emisión y rotación de refresh tokens (Fase 2, paso 10).
 *
 * `issueTokens` firma el access token JWT y persiste el primer eslabón de
 * la cadena de refresh tokens de una sesión; lo usan tanto `AuthService`
 * (registro/login) como `rotate` (al canjear un token vigente por el
 * siguiente eslabón).
 *
 * `rotate` implementa la rotación con detección de reutilización:
 * - `active`: se canjea. La fila actual pasa a `rotated` y se crea el
 *   siguiente eslabón enlazado por `replacedByTokenId`.
 * - `rotated`: el token ya se canjeó antes. Presentarlo de nuevo es la
 *   señal clásica de robo (un atacante y el usuario legítimo compitiendo
 *   por el mismo refresh token), así que se revoca toda la sesión y su
 *   cadena completa de tokens — salvo que cumpla la ventana de gracia
 *   (mismo IP, dentro de `refreshReuseGraceSeconds` desde la rotación),
 *   pensada para absorber un reintento de red del propio cliente que no
 *   llegó a ver la respuesta con el nuevo par de tokens.
 * - `revoked`: se rechaza sin más.
 */
@Injectable()
export class RefreshTokenService {
  private readonly jwtConfig: JwtConfig;
  private readonly authConfig: AuthConfig;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(SecurityEvent)
    private readonly securityEventRepository: Repository<SecurityEvent>,
    private readonly tokenService: TokenService,
    private readonly jwtService: JwtService,
    private readonly sessionService: SessionService,
    configService: ConfigService,
  ) {
    this.jwtConfig = configService.get<JwtConfig>('jwt')!;
    this.authConfig = configService.get<AuthConfig>('auth')!;
  }

  /** Firma el access token JWT y emite/persiste el refresh token opaco de una sesión. */
  async issueTokens(
    manager: EntityManager,
    input: IssueTokensInput,
  ): Promise<IssuedTokens> {
    const { user, orgId, roleId, session } = input;
    const roleName = KNOWN_ROLE_NAMES[roleId] ?? roleId;

    const accessToken = this.jwtService.sign({
      subject: user.id,
      jti: randomUUID(),
      claims: {
        org: orgId,
        sid: session.id,
        // Catálogo de permisos real llega en la Fase 3 (RBAC); hasta
        // entonces el claim va vacío y no se aplica autorización fina.
        roles: [roleName],
        permissions: [],
        pwd_ver: user.passwordChangedAt.getTime(),
        token_type: 'access',
      },
    });

    const { token: refreshTokenPlain, tokenHash } =
      this.tokenService.generate();
    const issuedAt = new Date();
    const expiresAt = new Date(
      issuedAt.getTime() + this.authConfig.refreshTokenTtlSeconds * 1000,
    );

    const refreshToken = await manager.save(
      manager.create(RefreshToken, {
        sessionId: session.id,
        tokenHash,
        issuedAt,
        expiresAt,
        status: RefreshTokenStatus.ACTIVE,
      }),
    );

    return {
      authTokens: {
        accessToken,
        refreshToken: refreshTokenPlain,
        tokenType: 'Bearer',
        expiresIn: this.jwtConfig.accessTokenTtlSeconds,
        refreshExpiresIn: this.authConfig.refreshTokenTtlSeconds,
      },
      refreshToken,
    };
  }

  /**
   * Canjea un refresh token vigente por un nuevo par de tokens, o detecta
   * su reutilización y revoca la sesión completa. Siempre corre dentro de
   * una transacción con `SELECT ... FOR UPDATE` sobre la fila del token
   * para serializar canjes concurrentes del mismo eslabón.
   *
   * La transacción siempre se resuelve con un resultado (nunca lanza desde
   * dentro): si lanzáramos una excepción tras escribir la revocación de la
   * sesión reutilizada, TypeORM haría ROLLBACK de esa misma escritura junto
   * con todo lo demás. El 401 correspondiente se lanza ya fuera, una vez
   * confirmados los cambios.
   */
  async rotate(
    refreshTokenPlain: string,
    context: RequestContext,
  ): Promise<AuthTokens> {
    const tokenHash = this.tokenService.hash(refreshTokenPlain);

    const result = await this.dataSource.transaction(
      async (manager): Promise<RotateResult> => {
        const current = await manager.findOne(RefreshToken, {
          where: { tokenHash },
          lock: { mode: 'pessimistic_write' },
        });

        if (!current) {
          return { rejected: 'Refresh token inválido' };
        }

        if (current.status === RefreshTokenStatus.REVOKED) {
          return { rejected: 'Refresh token revocado' };
        }

        if (current.status === RefreshTokenStatus.ROTATED) {
          await this.handleReuse(manager, current, context);
          return { rejected: 'Refresh token inválido' };
        }

        if (current.expiresAt <= new Date()) {
          return { rejected: 'Refresh token expirado' };
        }

        const session = await manager.findOne(Session, {
          where: { id: current.sessionId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!session || session.revokedAt) {
          return { rejected: 'Sesión revocada' };
        }

        const user = await manager.findOne(User, {
          where: { id: session.userId },
        });
        if (!user || user.status !== UserStatus.ACTIVE) {
          return { rejected: 'Usuario no disponible' };
        }

        const membership = await manager.findOne(Membership, {
          where: { organizationId: session.orgId, userId: session.userId },
        });
        if (!membership) {
          return {
            rejected: 'El usuario ya no pertenece a la organización',
          };
        }

        const now = new Date();
        const { authTokens, refreshToken: newRow } = await this.issueTokens(
          manager,
          { user, orgId: session.orgId, roleId: membership.roleId, session },
        );

        current.status = RefreshTokenStatus.ROTATED;
        current.rotatedAt = now;
        current.replacedByTokenId = newRow.id;
        await manager.save(current);

        session.lastSeenAt = now;
        await manager.save(session);

        return { rejected: null, authTokens };
      },
    );

    if (result.rejected !== null) {
      throw new UnauthorizedException(result.rejected);
    }
    return result.authTokens;
  }

  /**
   * Un token con `status: rotated` se presentó de nuevo. Dentro de la
   * ventana de gracia y desde el mismo IP se asume un reintento de red
   * inofensivo y no se revoca nada; en cualquier otro caso se trata como
   * robo y se revoca toda la sesión junto con su cadena de tokens.
   */
  private async handleReuse(
    manager: EntityManager,
    current: RefreshToken,
    context: RequestContext,
  ): Promise<void> {
    const session = await manager.findOne(Session, {
      where: { id: current.sessionId },
      lock: { mode: 'pessimistic_write' },
    });

    const rotatedRecently =
      current.rotatedAt !== null &&
      Date.now() - current.rotatedAt.getTime() <=
        this.authConfig.refreshReuseGraceSeconds * 1000;
    const sameOrigin =
      session !== null && session.ipHash === hashClientInfo(context.ip);
    const withinGraceWindow = rotatedRecently && sameOrigin;

    if (!withinGraceWindow && session && !session.revokedAt) {
      await this.sessionService.revokeSessionRows(
        manager,
        session,
        'refresh_reuse',
      );
    }

    await this.securityEventRepository.save(
      this.securityEventRepository.create({
        type: SecurityEventType.REFRESH_REUSE_DETECTED,
        orgId: session?.orgId ?? null,
        userId: session?.userId ?? null,
        ip: context.ip ?? null,
        userAgent: context.userAgent ?? null,
        metadata: { withinGraceWindow, sessionRevoked: !withinGraceWindow },
      }),
    );
  }
}
