import { registerDecorator, ValidationOptions } from 'class-validator';

/** Longitud mínima exigida a toda contraseña nueva. */
export const PASSWORD_MIN_LENGTH = 12;

/**
 * Política de complejidad: al menos una minúscula, una mayúscula, un
 * dígito y un símbolo, además de la longitud mínima. Se aplica en los DTOs
 * de registro y cambio de contraseña (fases 1 y 2); `PasswordService` no
 * la impone porque también hashea contraseñas ya existentes al verificar.
 */
const HAS_LOWERCASE = /[a-z]/;
const HAS_UPPERCASE = /[A-Z]/;
const HAS_DIGIT = /\d/;
const HAS_SYMBOL = /[^A-Za-z0-9]/;

/** Mensaje de error cuando una contraseña no cumple la política. */
export const PASSWORD_POLICY_MESSAGE = `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres e incluir mayúsculas, minúsculas, números y símbolos.`;

/** Comprueba si una contraseña cumple la política de complejidad, sin depender de class-validator. */
export function isStrongPassword(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= PASSWORD_MIN_LENGTH &&
    HAS_LOWERCASE.test(value) &&
    HAS_UPPERCASE.test(value) &&
    HAS_DIGIT.test(value) &&
    HAS_SYMBOL.test(value)
  );
}

/**
 * Decorador de propiedad para DTOs (`class-validator`) que exige la
 * política de contraseñas: mínimo 12 caracteres, con mayúscula, minúscula,
 * dígito y símbolo.
 *
 * Uso: `@IsStrongPassword() password!: string;` en el DTO de registro o
 * de cambio de contraseña.
 */
export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName,
      options: {
        message: PASSWORD_POLICY_MESSAGE,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          return isStrongPassword(value);
        },
      },
    });
  };
}
