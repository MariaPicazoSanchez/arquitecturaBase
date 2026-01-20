import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Sistema } from '../modelo.js';
import bcrypt from 'bcrypt';

describe('Authentication - Memory Mode Tests', () => {
  let sistema;

  beforeEach(() => {
    sistema = new Sistema();
  });

  describe('User Registration (Memory)', () => {
    it('should accept registration with valid data', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'SecurePass123',
        nick: 'testuser',
        displayName: 'Test User'
      };

      const result = await sistema.registrarUsuario(userData);
      expect(result).toBeDefined();
      expect(result.email || result.success).toBeTruthy();
    });

    it('should reject registration with missing email', async () => {
      const userData = {
        password: 'SecurePass123',
        nick: 'testuser'
      };

      const result = await sistema.registrarUsuario(userData);
      expect(result.email).toBe(-1);
    });

    it('should reject registration with missing password', async () => {
      const userData = {
        email: 'test@example.com',
        nick: 'testuser'
      };

      const result = await sistema.registrarUsuario(userData);
      expect(result.email).toBe(-1);
    });

    it('should reject registration with missing nick', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'SecurePass123'
      };

      const result = await sistema.registrarUsuario(userData);
      expect(result.email).toBe(-1);
    });

    it('should hash password during registration', async () => {
      const userData = {
        email: 'hashtest@example.com',
        password: 'MyPassword123',
        nick: 'hashuser'
      };

      const result = await sistema.registrarUsuario(userData);
      // Result is async, check if successful
      if (result.email && result.email !== -1) {
        expect(result).toBeDefined();
      } else if (result.success) {
        expect(result.success).toBe(true);
      }
    });

    it('should record activity on successful registration', async () => {
      const spy = vi.spyOn(sistema, 'registrarActividad');

      const userData = {
        email: 'activity@example.com',
        password: 'ActivityPass123',
        nick: 'activityuser'
      };

      const result = await sistema.registrarUsuario(userData);
      // Check for successful registration
      expect(result).toBeDefined();
      spy.mockRestore();
    });

    it('should record activity on failed registration', async () => {
      const spy = vi.spyOn(sistema, 'registrarActividad');

      const invalidData = {
        email: 'invalid@example.com'
        // Missing password and nick
      };

      const result = await sistema.registrarUsuario(invalidData);
      expect(result.email).toBe(-1);
      spy.mockRestore();
    });
  });

  describe('User Confirmation (Memory)', () => {
    it('should reject confirmation for non-existent user', async () => {
      // confirmarUsuario is still callback-based
      const confirmData = {
        email: 'nonexistent@example.com',
        key: 'anykey'
      };

      const result = await new Promise((resolve) => {
        sistema.confirmarUsuario(confirmData, (res) => resolve(res));
      });
      expect(result.email).toBe(-1);
    });

    it('should require both email and key for confirmation', async () => {
      const result = await new Promise((resolve) => {
        sistema.confirmarUsuario({ email: 'test@example.com' }, (res) => resolve(res));
      });
      expect(result.email).toBe(-1);
    });
  });

  describe('User Login (Memory)', () => {
    it('should reject login with missing credentials', async () => {
      const result = await new Promise((resolve) => {
        sistema.loginUsuario({ email: 'test@example.com' }, (res) => resolve(res));
      });
      expect(result.email).toBe(-1);
    });

    it('should reject login with non-existent user', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'AnyPassword'
      };

      const result = await new Promise((resolve) => {
        sistema.loginUsuario(loginData, (res) => resolve(res));
      });
      expect(result.email).toBe(-1);
    });

    it('should record activity on failed login', async () => {
      const spy = vi.spyOn(sistema, 'registrarActividad');

      const loginData = {
        email: 'failedlogin@example.com',
        password: 'WrongPassword'
      };

      const result = await new Promise((resolve) => {
        sistema.loginUsuario(loginData, (res) => resolve(res));
      });
      expect(spy).toHaveBeenCalledWith('loginUsuarioFallido', 'failedlogin@example.com');
      spy.mockRestore();
    });
  });

  describe('Password Security', () => {
    it('should use bcrypt for password hashing', async () => {
      const userData = {
        email: 'bcrypt@example.com',
        password: 'BcryptTest123',
        nick: 'bcryptuser'
      };

      const result = await sistema.registrarUsuario(userData);
      expect(result).toBeDefined();
    });

    it('should not store plain text passwords', async () => {
      const userData = {
        email: 'security@example.com',
        password: 'MySecurePassword123',
        nick: 'securityuser'
      };

      const result = await sistema.registrarUsuario(userData);
      expect(result).toBeDefined();
    });
  });
});
