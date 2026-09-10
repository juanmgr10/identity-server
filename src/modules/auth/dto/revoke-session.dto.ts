import { IsUUID } from 'class-validator';

/** Cuerpo de POST /auth/sessions: revoca una sesión propia por id. */
export class RevokeSessionDto {
  @IsUUID()
  sessionId!: string;
}
