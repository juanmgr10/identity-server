import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base/base.entity';

/** Estado de la cuenta de un usuario, independiente de sus membresías. */
export enum UserStatus {
  /** Puede autenticarse con normalidad. */
  ACTIVE = 'active',
  /** Bloqueada temporalmente tras superar el límite de intentos fallidos (ver `lockedUntil`). */
  LOCKED = 'locked',
  /** Deshabilitada por un administrador; no puede autenticarse hasta reactivarse. */
  DISABLED = 'disabled',
}

/**
 * Usuario del sistema. No pertenece directamente a una organización: la
 * relación (y el rol dentro de cada tenant) la da `Membership`, lo que
 * permite que un mismo usuario participe en varias organizaciones.
 */
@Entity('users')
export class User extends BaseEntity {
  /** Email, usado como identificador de login. Se normaliza a minúsculas antes de persistir. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  /** Hash Argon2id de la contraseña (`PasswordService`, paso 6). Nunca se guarda en claro. */
  @Column({ type: 'varchar', length: 255, name: 'password_hash' })
  passwordHash!: string;

  /** Estado actual de la cuenta. */
  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status!: UserStatus;

  /** Intentos de login fallidos consecutivos; se resetea a 0 al autenticar con éxito. */
  @Column({ type: 'int', name: 'failed_login_attempts', default: 0 })
  failedLoginAttempts!: number;

  /** Momento hasta el que la cuenta queda bloqueada por intentos fallidos; null si no está bloqueada. */
  @Column({ type: 'timestamptz', name: 'locked_until', nullable: true })
  lockedUntil!: Date | null;

  /**
   * Momento del último cambio de contraseña. Respalda el claim `pwd_ver`
   * del access token (paso 8): si la contraseña cambió después de emitirse
   * un token, este deja de considerarse válido aunque no haya expirado.
   */
  @Column({ type: 'timestamptz', name: 'password_changed_at' })
  passwordChangedAt!: Date;
}
