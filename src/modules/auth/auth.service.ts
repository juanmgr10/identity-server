import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { AuthConfig, JwtConfig } from '../../config/configuration';
import { JwtService } from '../../crypto/jwt/jwt.service';
import { Membership } from '../../entities/membership.entity';
import { Organization } from '../../entities/organization.entity';
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
import { PasswordService } from '../../security/password.service';
import { TokenService } from '../../security/token.service';
import {
  ACCOUNT_LOCKOUT_MINUTES,
  KNOWN_ROLE_NAMES,
  MAX_FAILED_LOGIN_ATTEMPTS,
  OWNER_ROLE_ID,
} from './auth.constants';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import type { AuthTokens, RequestContext } from './auth.types';

/** Datos mínimos de sesión/rol necesarios para emitir un par de tokens. */
interface IssueTokensInput {
  user: User;
  orgId: string;
  roleId: string;
  session: Session;
}

/**
 * Registro, login y emisión inicial de tokens (Fase 1, pasos 7-8).
 *
 * `register` ejecuta todo en una única transacción: organización, usuario,
 * membresía "owner", sesión y el primer par de tokens se crean juntos o no
 * se crea nada. `login` verifica credenciales, aplica el bloqueo por
 * intentos fallidos y, si son correctas, emite un nuevo par de tokens para
 * una nueva sesión.
 */
@Injectable()
export class AuthService {
  private readonly jwtConfig: JwtConfig;
  private readonly authConfig: AuthConfig;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Membership)
    private readonly membershipRepository: Repository<Membership>,
    @InjectRepository(SecurityEvent)
    private readonly securityEventRepository: Repository<SecurityEvent>,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.jwtConfig = configService.get<JwtConfig>('jwt')!;
    this.authConfig = configService.get<AuthConfig>('auth')!;
  }

  async register(
    dto: RegisterDto,
    context: RequestContext,
  ): Promise<AuthTokens> {
    const email = normalizeEmail(dto.email);

    const existing = await this.userRepository.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('El email ya está registrado');
    }

    const passwordHash = await this.passwordService.hash(dto.password);
    const slug = await this.generateUniqueSlug(dto.organizationName);
    const now = new Date();

    const { organization, user, tokens } = await this.dataSource.transaction(
      async (manager) => {
        const organization = await manager.save(
          manager.create(Organization, { name: dto.organizationName, slug }),
        );

        const user = await manager.save(
          manager.create(User, {
            email,
            passwordHash,
            passwordChangedAt: now,
          }),
        );

        await manager.save(
          manager.create(Membership, {
            organizationId: organization.id,
            userId: user.id,
            roleId: OWNER_ROLE_ID,
          }),
        );

        const session = await manager.save(
          manager.create(Session, {
            userId: user.id,
            orgId: organization.id,
            ipHash: hashClientInfo(context.ip),
            userAgentHash: hashClientInfo(context.userAgent),
            lastSeenAt: now,
          }),
        );

        const tokens = await this.issueTokens(manager, {
          user,
          orgId: organization.id,
          roleId: OWNER_ROLE_ID,
          session,
        });

        return { organization, user, tokens };
      },
    );

    await this.recordSecurityEvent(this.securityEventRepository, {
      type: SecurityEventType.REGISTER_SUCCEEDED,
      orgId: organization.id,
      userId: user.id,
      context,
    });

    return tokens;
  }

  async login(dto: LoginDto, context: RequestContext): Promise<AuthTokens> {
    const email = normalizeEmail(dto.email);
    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      await this.recordSecurityEvent(this.securityEventRepository, {
        type: SecurityEventType.LOGIN_FAILED,
        context,
        metadata: { email },
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }

    await this.unlockIfLockoutExpired(user);

    if (user.status === UserStatus.LOCKED) {
      await this.recordSecurityEvent(this.securityEventRepository, {
        type: SecurityEventType.LOGIN_FAILED,
        userId: user.id,
        context,
        metadata: { reason: 'account_locked' },
      });
      throw new UnauthorizedException(
        'Cuenta bloqueada temporalmente por demasiados intentos fallidos',
      );
    }
    if (user.status === UserStatus.DISABLED) {
      await this.recordSecurityEvent(this.securityEventRepository, {
        type: SecurityEventType.LOGIN_FAILED,
        userId: user.id,
        context,
        metadata: { reason: 'account_disabled' },
      });
      throw new UnauthorizedException('Cuenta deshabilitada');
    }

    const passwordValid = await this.passwordService.verify(
      dto.password,
      user.passwordHash,
    );
    if (!passwordValid) {
      await this.registerFailedAttempt(user, context);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const membership = await this.resolveMembership(
      user.id,
      dto.organizationSlug,
    );

    if (this.passwordService.needsRehash(user.passwordHash)) {
      user.passwordHash = await this.passwordService.hash(dto.password);
    }
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await this.userRepository.save(user);

    const now = new Date();
    const tokens = await this.dataSource.transaction(async (manager) => {
      const session = await manager.save(
        manager.create(Session, {
          userId: user.id,
          orgId: membership.organizationId,
          ipHash: hashClientInfo(context.ip),
          userAgentHash: hashClientInfo(context.userAgent),
          lastSeenAt: now,
        }),
      );

      return this.issueTokens(manager, {
        user,
        orgId: membership.organizationId,
        roleId: membership.roleId,
        session,
      });
    });

    await this.recordSecurityEvent(this.securityEventRepository, {
      type: SecurityEventType.LOGIN_SUCCEEDED,
      orgId: membership.organizationId,
      userId: user.id,
      context,
    });

    return tokens;
  }

  // ── Internos ────────────────────────────────────────────────────────────

  /** Firma el access token JWT y emite/persiste el refresh token opaco de una nueva sesión. */
  private async issueTokens(
    manager: EntityManager,
    input: IssueTokensInput,
  ): Promise<AuthTokens> {
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

    const { token: refreshToken, tokenHash } = this.tokenService.generate();
    const issuedAt = new Date();
    const expiresAt = new Date(
      issuedAt.getTime() + this.authConfig.refreshTokenTtlSeconds * 1000,
    );

    await manager.save(
      manager.create(RefreshToken, {
        sessionId: session.id,
        tokenHash,
        issuedAt,
        expiresAt,
        status: RefreshTokenStatus.ACTIVE,
      }),
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.jwtConfig.accessTokenTtlSeconds,
    };
  }

  /** Si la cuenta está bloqueada pero la ventana de bloqueo ya pasó, la reactiva. */
  private async unlockIfLockoutExpired(user: User): Promise<void> {
    if (user.status !== UserStatus.LOCKED) {
      return;
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return;
    }
    user.status = UserStatus.ACTIVE;
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await this.userRepository.save(user);
  }

  /** Cuenta un intento fallido y bloquea la cuenta al llegar a `MAX_FAILED_LOGIN_ATTEMPTS`. */
  private async registerFailedAttempt(
    user: User,
    context: RequestContext,
  ): Promise<void> {
    user.failedLoginAttempts += 1;

    let locked = false;
    if (user.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      user.status = UserStatus.LOCKED;
      user.lockedUntil = new Date(
        Date.now() + ACCOUNT_LOCKOUT_MINUTES * 60_000,
      );
      locked = true;
    }
    await this.userRepository.save(user);

    await this.recordSecurityEvent(this.securityEventRepository, {
      type: SecurityEventType.LOGIN_FAILED,
      userId: user.id,
      context,
    });
    if (locked) {
      await this.recordSecurityEvent(this.securityEventRepository, {
        type: SecurityEventType.ACCOUNT_LOCKED,
        userId: user.id,
        context,
      });
    }
  }

  /**
   * Resuelve en qué organización inicia sesión el usuario. Con una única
   * membresía se usa esa; con varias hace falta `organizationSlug`.
   */
  private async resolveMembership(
    userId: string,
    organizationSlug: string | undefined,
  ): Promise<Membership> {
    const memberships = await this.membershipRepository.find({
      where: { userId },
    });

    if (memberships.length === 0) {
      throw new UnauthorizedException(
        'El usuario no pertenece a ninguna organización',
      );
    }

    if (organizationSlug === undefined) {
      if (memberships.length === 1) {
        return memberships[0]!;
      }
      throw new BadRequestException(
        'El usuario pertenece a varias organizaciones: especifica organizationSlug',
      );
    }

    const organization = await this.dataSource
      .getRepository(Organization)
      .findOne({ where: { slug: organizationSlug } });
    const membership = organization
      ? memberships.find((m) => m.organizationId === organization.id)
      : undefined;
    if (!membership) {
      throw new UnauthorizedException(
        'El usuario no pertenece a esa organización',
      );
    }
    return membership;
  }

  /** Genera un slug único y legible a partir del nombre de la organización. */
  private async generateUniqueSlug(name: string): Promise<string> {
    const base = slugify(name) || 'org';
    const organizations = this.dataSource.getRepository(Organization);

    let candidate = base;
    let suffix = 0;
    // Colisiones son improbables pero posibles con nombres repetidos; se
    // resuelven añadiendo un sufijo numérico incremental.
    while (await organizations.findOne({ where: { slug: candidate } })) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    return candidate;
  }

  private async recordSecurityEvent(
    repository: Repository<SecurityEvent>,
    event: {
      type: SecurityEventType;
      orgId?: string;
      userId?: string;
      context: RequestContext;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    await repository.save(
      repository.create({
        type: event.type,
        orgId: event.orgId ?? null,
        userId: event.userId ?? null,
        ip: event.context.ip ?? null,
        userAgent: event.context.userAgent ?? null,
        metadata: event.metadata ?? null,
      }),
    );
  }
}

/** Normaliza un email a minúsculas y sin espacios sobrantes, consistente con el índice único de `User`. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** SHA-256 en hexadecimal; usado para `Session.ipHash`/`userAgentHash` (nunca se persiste el valor en claro ahí). */
function hashClientInfo(value: string | undefined): string {
  return createHash('sha256')
    .update(value ?? '', 'utf8')
    .digest('hex');
}

/** Convierte un nombre libre en un slug de URL: minúsculas, ascii, separado por guiones. */
function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos (marcas diacriticas combinantes tras NFKD)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}
