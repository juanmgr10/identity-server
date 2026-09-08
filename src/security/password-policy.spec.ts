import { validate } from 'class-validator';
import {
  isStrongPassword,
  IsStrongPassword,
  PASSWORD_MIN_LENGTH,
} from './password-policy';

class DummyDto {
  @IsStrongPassword()
  password!: string;
}

describe('password-policy', () => {
  describe('isStrongPassword', () => {
    it('acepta una contraseña que cumple longitud y complejidad', () => {
      expect(isStrongPassword('Correcto123!horse')).toBe(true);
    });

    it(`rechaza contraseñas de menos de ${PASSWORD_MIN_LENGTH} caracteres`, () => {
      expect(isStrongPassword('Abc123!a')).toBe(false);
    });

    it('rechaza contraseñas sin mayúsculas', () => {
      expect(isStrongPassword('correcto123!horse')).toBe(false);
    });

    it('rechaza contraseñas sin minúsculas', () => {
      expect(isStrongPassword('CORRECTO123!HORSE')).toBe(false);
    });

    it('rechaza contraseñas sin dígitos', () => {
      expect(isStrongPassword('Correcto!!!!horse')).toBe(false);
    });

    it('rechaza contraseñas sin símbolos', () => {
      expect(isStrongPassword('Correcto123horse')).toBe(false);
    });

    it('rechaza valores que no son string', () => {
      expect(isStrongPassword(12345678901234)).toBe(false);
      expect(isStrongPassword(undefined)).toBe(false);
    });
  });

  describe('IsStrongPassword (decorador class-validator)', () => {
    it('no produce errores de validación con una contraseña fuerte', async () => {
      const dto = new DummyDto();
      dto.password = 'Correcto123!horse';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('produce un error de validación con una contraseña débil', async () => {
      const dto = new DummyDto();
      dto.password = 'debil';

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints).toHaveProperty('isStrongPassword');
    });
  });
});
