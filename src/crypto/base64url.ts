/**
 * Codificación base64url (RFC 4648 §5) sin padding, usada por JWT/JWS.
 * `Buffer` de Node ya soporta los alfabetos base64url de forma nativa.
 */
export function base64UrlEncode(data: Buffer | string): string {
  return Buffer.from(data).toString('base64url');
}

export function base64UrlDecode(data: string): Buffer {
  return Buffer.from(data, 'base64url');
}

export function base64UrlEncodeJson(value: unknown): string {
  return base64UrlEncode(JSON.stringify(value));
}

export function base64UrlDecodeJson(data: string): unknown {
  return JSON.parse(base64UrlDecode(data).toString('utf8')) as unknown;
}
