import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import type { AuthTokens, RequestContext } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

/** Extrae IP y User-Agent del request, usados para hashear la sesión y para la auditoría de seguridad. */
function requestContext(req: Request): RequestContext {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Crea la organización, el usuario owner, la primera sesión y el primer par de tokens. */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto, @Req() req: Request): Promise<AuthTokens> {
    return this.authService.register(dto, requestContext(req));
  }

  /** Verifica credenciales y abre una nueva sesión con su propio par de tokens. */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthTokens> {
    return this.authService.login(dto, requestContext(req));
  }
}
