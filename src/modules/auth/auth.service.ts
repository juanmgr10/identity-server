import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Membership } from '../../entities/membership.entity';
import { Organization } from '../../entities/organization.entity';
import {
  SecurityEvent,
  SecurityEventType,
} from '../../entities/security-event.entity';
import { Session } from '../../entities/session.entity';
import { User, UserStatus } from '../../entities/user.entity';
import { PasswordService } from '../../security/password.service';
import {
  ACCOUNT_LOCKOUT_MINUTES,
  MAX_FAILED_LOGIN_ATTEMPTS,
  OWNER_ROLE_ID,
} from './auth.constants';
import {
  hashClientInfo,
  normalizeEmail,
  recordSecurityEvent,
  slugify,
} from './auth.util';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { RefreshTokenService } from './refresh-token.service';
import { SessionService } from './session.service';
import type { AuthContext, AuthTokens, RequestContext } from './auth.types';

/**
 * Registro, login y emisión inicial de tokens (Fase 1, pasos 7-8).
 *
 * `register` ejecuta todo en una única transacción: organización, usuario,
 * membresía "owner", sesión y el primer par de tokens se crean juntos o no
 * se crea nada. `login` verifica credenciales, aplica el bloqueo por
 * intentos fallidos y, si son correctas, emite un nuevo par de tokens para
 * una nueva sesión. La emisión del par de tokens en sí (firma del access
 * token y persistencia del refresh token) vive en `RefreshTokenService`,
 * que también es dueño de la rotación (Fase 2, paso 10).
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Membership)
    private readonly membershipRepository: Repository<Membership>,
    @InjectRepository(SecurityEvent)
    private readonly securityEventRepository: Repository<SecurityEvent>,
    private readonly passwordService: PasswordService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly sessionService: SessionService,
  ) {}

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
            ip: context.ip ?? null,
            userAgent: context.userAgent ?? null,
            ipHash: hashClientInfo(context.ip),
            userAgentHash: hashClientInfo(context.userAgent),
            lastSeenAt: now,
          }),
        );

        const { authTokens } = await this.refreshTokenService.issueTokens(
          manager,
          { user, orgId: organization.id, roleId: OWNER_ROLE_ID, session },
        );

        return { organization, user, tokens: authTokens };
      },
    );

    await recordSecurityEvent(this.securityEventRepository, {
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
      await recordSecurityEvent(this.securityEventRepository, {
        type: SecurityEventType.LOGIN_FAILED,
        context,
        metadata: { email },
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }

    await this.unlockIfLockoutExpired(user);

    if (user.status === UserStatus.LOCKED) {
      await recordSecurityEvent(this.securityEventRepository, {
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
      await recordSecurityEvent(this.securityEventRepository, {
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
          ip: context.ip ?? null,
          userAgent: context.userAgent ?? null,
          ipHash: hashClientInfo(context.ip),
          userAgentHash: hashClientInfo(context.userAgent),
          lastSeenAt: now,
        }),
      );

      const { authTokens } = await this.refreshTokenService.issueTokens(
        manager,
        {
          user,
          orgId: membership.organizationId,
          roleId: membership.roleId,
          session,
        },
      );
      return authTokens;
    });

    await recordSecurityEvent(this.securityEventRepository, {
      type: SecurityEventType.LOGIN_SUCCEEDED,
      orgId: membership.organizationId,
      userId: user.id,
      context,
    });

    return tokens;
  }

  /**
   * Cambia la contraseña del usuario autenticado (paso 12). Revoca todas
   * sus sesiones: el bump de `passwordChangedAt` invalida de inmediato,
   * vía el claim `pwd_ver`, cualquier access token emitido antes del
   * cambio (lo comprueba `SessionGuard`), y la revocación de sesiones
   * invalida sus refresh tokens.
   */
  async changePassword(
    auth: AuthContext,
    dto: ChangePasswordDto,
    context: RequestContext,
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: auth.userId },
    });
    if (!user) {
      throw new UnauthorizedException('Usuario no disponible');
    }

    const currentPasswordValid = await this.passwordService.verify(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!currentPasswordValid) {
      throw new UnauthorizedException('Contraseña actual incorrecta');
    }

    user.passwordHash = await this.passwordService.hash(dto.newPassword);
    user.passwordChangedAt = new Date();
    await this.userRepository.save(user);

    await this.sessionService.revokeAllSessions(
      auth.userId,
      'password_changed',
    );

    await recordSecurityEvent(this.securityEventRepository, {
      type: SecurityEventType.PASSWORD_CHANGED,
      orgId: auth.orgId,
      userId: auth.userId,
      context,
    });
  }

  // ── Internos ────────────────────────────────────────────────────────────

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

    await recordSecurityEvent(this.securityEventRepository, {
      type: SecurityEventType.LOGIN_FAILED,
      userId: user.id,
      context,
    });
    if (locked) {
      await recordSecurityEvent(this.securityEventRepository, {
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
}
