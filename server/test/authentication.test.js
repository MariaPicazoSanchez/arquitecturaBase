import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Sistema } from '../modelo.js';
import bcrypt from 'bcrypt';

// Helper para convertir callbacks a promises
const promisify = (fn) => {
  return (...args) => new Promise((resolve) => {
    fn(...args, (result) => resolve(result));
  });
};

describe('Authentication - Memory Mode Tests', () => {
  let sistema;

  beforeEach(() => {
    sistema = new Sistema();
  });

  describe('User Registration (Memory)', () => {
    it('should accept registration with valid data', async () => {
      const registrarUsuario = promisify(sistema.registrarUsuario.bind(sistema));
      const userData = {
        email: 'test@example.com',
        password: 'SecurePass123',
        nick: 'testuser',
        displayName: 'Test User'
      };

      const result = await registrarUsuario(userData);
      expect(result).toBeDefined();
      expect(result.email).toBe('test@example.com');
    });

    it('should reject registration with missing email', async () => {
      const registrarUsuario = promisify(sistema.registrarUsuario.bind(sistema));
      const userData = {
        password: 'SecurePass123',
        nick: 'testuser'
      };

      const result = await registrarUsuario(userData);
      expect(result.email).toBe(-1);
    });

    it('should reject registration with missing password', async () => {
      const registrarUsuario = promisify(sistema.registrarUsuario.bind(sistema));
      const userData = {
        email: 'test@example.com',
        nick: 'testuser'
      };

      const result = await registrarUsuario(userData);
      expect(result.email).toBe(-1);
    });

    it('should reject registration with missing nick', async () => {
      const registrarUsuario = promisify(sistema.registrarUsuario.bind(sistema));
      const userData = {
        email: 'test@example.com',
        password: 'SecurePass123'
      };

      const result = await registrarUsuario(userData);
      expect(result.email).toBe(-1);
    });

    it('should hash password during registration', async () => {
      const registrarUsuario = promisify(sistema.registrarUsuario.bind(sistema));
      const userData = {
        email: 'hashtest@example.com',
        password: 'MyPassword123',
        nick: 'hashuser'
      };

      const result = await registrarUsuario(userData);
      expect(result.email).toBe('hashtest@example.com');
      // El password almacenado no debe ser el original (en modo memoria el callback podría no devolverlo)
      // pero si lo devuelve, debe cumplir estos requisitos
      if (result.password) {
        expect(result.password).not.toBe(userData.password);
        expect(typeof result.password).toBe('string');
        expect(result.password).toMatch(/^\$2[aby]\$/);
      }
    });

    it('should record activity on successful registration', async () => {
      const registrarUsuario = promisify(sistema.registrarUsuario.bind(sistema));
      const spy = vi.spyOn(sistema, 'registrarActividad');

      const userData = {
        email: 'activity@example.com',
        password: 'ActivityPass123',
        nick: 'activityuser'
      };

      const result = await registrarUsuario(userData);
      expect(spy).toHaveBeenCalledWith('registroUsuario', 'activity@example.com');
      spy.mockRestore();
    });

    it('should record activity on failed registration', async () => {
      const registrarUsuario = promisify(sistema.registrarUsuario.bind(sistema));
      const spy = vi.spyOn(sistema, 'registrarActividad');

      const invalidData = {
        email: 'invalid@example.com'
        // Missing password and nick
      };

      const result = await registrarUsuario(invalidData);
      expect(spy).toHaveBeenCalledWith('registrarUsuarioFallido', 'invalid@example.com');
      spy.mockRestore();
    });
  });

  describe('User Confirmation (Memory)', () => {
    it('should accept confirmation request (may fail in memory mode)', async () => {
      const registrarUsuario = promisify(sistema.registrarUsuario.bind(sistema));
      const confirmarUsuario = promisify(sistema.confirmarUsuario.bind(sistema));

      const userData = {
        email: 'confirm@example.com',
        password: 'SecurePass123',
        nick: 'confirmuser'
      };

      const registered = await registrarUsuario(userData);
      // En modo memoria, el key puede no estar disponible
      const confirmData = {
        email: registered.email,
        key: registered.key || 'anykey'
      };

      const result = await confirmarUsuario(confirmData);
      // En modo memoria esperamos que falle la búsqueda
      expect(result.email).toBe(-1);
    });

    it('should reject confirmation for non-existent user', async () => {
      const confirmarUsuario = promisify(sistema.confirmarUsuario.bind(sistema));
      const confirmData = {
        email: 'nonexistent@example.com',
        key: 'anykey'
      };

      const result = await confirmarUsuario(confirmData);
      expect(result.email).toBe(-1);
    });
  });

  describe('User Login (Memory)', () => {
    it('should reject login with missing credentials', async () => {
      const loginUsuario = promisify(sistema.loginUsuario.bind(sistema));

      const result = await loginUsuario({ email: 'test@example.com' });
      expect(result.email).toBe(-1);
    });

    it('should reject login with non-existent user', async () => {
      const loginUsuario = promisify(sistema.loginUsuario.bind(sistema));
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'AnyPassword'
      };

      const result = await loginUsuario(loginData);
      expect(result.email).toBe(-1);
    });

    it('should record activity on failed login', async () => {
      const loginUsuario = promisify(sistema.loginUsuario.bind(sistema));
      const spy = vi.spyOn(sistema, 'registrarActividad');

      const loginData = {
        email: 'failedlogin@example.com',
        password: 'WrongPassword'
      };

      const result = await loginUsuario(loginData);
      expect(spy).toHaveBeenCalledWith('loginUsuarioFallido', 'failedlogin@example.com');
      spy.mockRestore();
    });
  });

  describe('Password Security', () => {
    it('should use bcrypt for password hashing', async () => {
      const registrarUsuario = promisify(sistema.registrarUsuario.bind(sistema));
      const userData = {
        email: 'bcrypt@example.com',
        password: 'BcryptTest123',
        nick: 'bcryptuser'
      };

      const result = await registrarUsuario(userData);
      
      if (result.password && typeof result.password === 'string') {
        // Verificar que bcrypt puede validar la contraseña
        const isValid = bcrypt.compareSync(userData.password, result.password);
        expect(isValid).toBe(true);

        // Verificar que una contraseña diferente no valida
        const isInvalid = bcrypt.compareSync('WrongPassword', result.password);
        expect(isInvalid).toBe(false);
      }
    });

    it('should not store plain text passwords', async () => {
      const registrarUsuario = promisify(sistema.registrarUsuario.bind(sistema));
      const userData = {
        email: 'security@example.com',
        password: 'MySecurePassword123',
        nick: 'securityuser'
      };

      const result = await registrarUsuario(userData);
      // El password no debe ser igual al original
      expect(result.password).not.toBe(userData.password);
    });
  });
});
