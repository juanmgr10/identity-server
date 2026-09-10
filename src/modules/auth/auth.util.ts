import { createHash } from 'node:crypto';
import type { Repository } from 'typeorm';
import type {
  SecurityEvent,
  SecurityEventType,
} from '../../entities/security-event.entity';
import type { RequestContext } from './auth.types';

/** Normaliza un email a minúsculas y sin espacios sobrantes, consistente con el índice único de `User`. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** SHA-256 en hexadecimal; usado para `Session.ipHash`/`userAgentHash` (nunca se persiste el valor en claro ahí). */
export function hashClientInfo(value: string | undefined): string {
  return createHash('sha256')
    .update(value ?? '', 'utf8')
    .digest('hex');
}

/** Convierte un nombre libre en un slug de URL: minúsculas, ascii, separado por guiones. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos (marcas diacriticas combinantes tras NFKD)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}

/**
 * Registra un `SecurityEvent` (log ligero de eventos de seguridad; ver el
 * doc de la entidad). Compartido por `AuthService` y `SessionService` para
 * no duplicar esta escritura en cada flujo (registro, login, sesiones,
 * cambio de contrase\u00f1a, ...).
 */
export async function recordSecurityEvent(
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
