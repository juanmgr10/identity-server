import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  API_CLIENT_TYPE_HEADER,
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_PATH,
} from './auth.constants';
import { AuthService } from './auth.service';
import type {
  AuthContext,
  AuthResponseBody,
  AuthTokens,
  RequestContext,
  SessionSummary,
} from './auth.types';
import { CurrentAuth } from './current-auth.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { RevokeSessionDto } from './dto/revoke-session.dto';
import { RefreshTokenService } from './refresh-token.service';
import { SessionGuard } from './session.guard';
import { SessionService } from './session.service';

/** Extrae IP y User-Agent del request, usados para hashear la sesión y para la auditoría de seguridad. */
function requestContext(req: Request): RequestContext {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

/** Un cliente API pide explícitamente el refresh token en el JSON en vez de depender solo de la cookie. */
function isApiClient(req: Request): boolean {
  const header = req.headers[API_CLIENT_TYPE_HEADER];
  const value = Array.isArray(header) ? header[0] : header;
  return value?.toLowerCase() === 'api';
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly sessionService: SessionService,
  ) {}

  /** Crea la organización, el usuario owner, la primera sesión y el primer par de tokens. */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseBody> {
    const tokens = await this.authService.register(dto, requestContext(req));
    return this.respondWithTokens(tokens, req, res);
  }

  /** Verifica credenciales y abre una nueva sesión con su propio par de tokens. */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseBody> {
    const tokens = await this.authService.login(dto, requestContext(req));
    return this.respondWithTokens(tokens, req, res);
  }

  /**
   * Canjea el refresh token vigente por un nuevo par (paso 10). Lo toma de
   * la cookie httpOnly (aplicaciones web) o, en su defecto, del body
   * (clientes API sin cookie jar).
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseBody> {
    const cookies = req.cookies as Record<string, string> | undefined;
    const presentedToken =
      dto.refreshToken ?? cookies?.[REFRESH_TOKEN_COOKIE_NAME];
    if (!presentedToken) {
      throw new UnauthorizedException('Falta el refresh token');
    }

    const tokens = await this.refreshTokenService.rotate(
      presentedToken,
      requestContext(req),
    );
    return this.respondWithTokens(tokens, req, res);
  }

  /** Sesiones activas del usuario autenticado, en todas sus organizaciones. */
  @Get('sessions')
  @UseGuards(SessionGuard)
  async listSessions(
    @CurrentAuth() auth: AuthContext,
  ): Promise<SessionSummary[]> {
    const sessions = await this.sessionService.listActiveSessions(auth.userId);
    return sessions.map((session) => ({
      ...session,
      current: session.id === auth.sessionId,
    }));
  }

  /** Revoca una sesión propia por id. */
  @Post('sessions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  async revokeSession(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: RevokeSessionDto,
    @Req() req: Request,
  ): Promise<{ revoked: true }> {
    await this.sessionService.revokeSession(
      auth.userId,
      dto.sessionId,
      requestContext(req),
    );
    return { revoked: true };
  }

  /** Cierra la sesión del propio access token usado en la petición. */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ loggedOut: true }> {
    await this.sessionService.logout(
      auth.userId,
      auth.sessionId,
      requestContext(req),
    );
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
      path: REFRESH_TOKEN_COOKIE_PATH,
    });
    return { loggedOut: true };
  }

  /** Cierra todas las sesiones activas del usuario, en todas sus organizaciones. */
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  async logoutAll(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ loggedOut: true; sessionsRevoked: number }> {
    const sessionsRevoked = await this.sessionService.logoutAll(
      auth.userId,
      requestContext(req),
    );
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
      path: REFRESH_TOKEN_COOKIE_PATH,
    });
    return { loggedOut: true, sessionsRevoked };
  }

  /** Cambia la contraseña y revoca todas las sesiones (incluida la actual). */
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  async changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ passwordChanged: true }> {
    await this.authService.changePassword(auth, dto, requestContext(req));
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
      path: REFRESH_TOKEN_COOKIE_PATH,
    });
    return { passwordChanged: true };
  }

  /**
   * Adjunta el refresh token como cookie httpOnly, Secure y SameSite=Strict
   * (Path restringido a /auth/refresh) y arma el JSON de respuesta. El
   * refresh token solo se repite en el JSON si el cliente se identifica
   * como API con `API_CLIENT_TYPE_HEADER`; los clientes web dependen solo
   * de la cookie.
   */
  private respondWithTokens(
    tokens: AuthTokens,
    req: Request,
    res: Response,
  ): AuthResponseBody {
    res.cookie(REFRESH_TOKEN_COOKIE_NAME, tokens.refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: REFRESH_TOKEN_COOKIE_PATH,
      maxAge: tokens.refreshExpiresIn * 1000,
    });

    if (isApiClient(req)) {
      return tokens;
    }
    return {
      accessToken: tokens.accessToken,
      tokenType: tokens.tokenType,
      expiresIn: tokens.expiresIn,
      refreshExpiresIn: tokens.refreshExpiresIn,
    };
  }
}
