/**
 * Id reservado para el rol "owner" hasta que exista el catálogo real de
 * roles (`Role`, Fase 3, paso 14). Se fija de antemano (en vez de generar
 * un uuid al vuelo) para que la migración de seed de la Fase 3 pueda crear
 * la fila `Role` con este mismo id y los `Membership.roleId` ya emitidos
 * sigan apuntando a la fila correcta sin necesidad de reescribirlos.
 */
export const OWNER_ROLE_ID = '00000000-0000-0000-0000-000000000001';

/** Nombres de rol conocidos hasta que exista el catálogo de la Fase 3; solo se usan para el claim `roles` del JWT. */
export const KNOWN_ROLE_NAMES: Record<string, string> = {
  [OWNER_ROLE_ID]: 'owner',
};

/** Intentos de login fallidos consecutivos permitidos antes de bloquear la cuenta. */
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;

/** Duración del bloqueo de cuenta tras superar `MAX_FAILED_LOGIN_ATTEMPTS`, en minutos. */
export const ACCOUNT_LOCKOUT_MINUTES = 15;

/** Nombre de la cookie httpOnly que transporta el refresh token para clientes web. */
export const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';

/**
 * `Path` de la cookie del refresh token: se restringe a la única ruta que
 * lo necesita para que el navegador no lo adjunte a ninguna otra petición.
 */
export const REFRESH_TOKEN_COOKIE_PATH = '/auth/refresh';

/**
 * Header con el que un cliente API (sin cookie jar) pide recibir el
 * refresh token también en el JSON de respuesta, en vez de depender solo
 * de la cookie httpOnly pensada para aplicaciones web.
 */
export const API_CLIENT_TYPE_HEADER = 'x-client-type';
