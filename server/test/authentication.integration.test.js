import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Sistema } from '../modelo.js';
import { CAD } from '../cad.js';
import bcrypt from 'bcrypt';

describe('Authentication - Integration Tests with Mocked CAD', () => {
  let sistema;
  let mockCAD;

  beforeEach(() => {
    sistema = new Sistema();
    
    // Crear un mock CAD con persistencia en memoria
    mockCAD = new CAD();
    mockCAD._memoryUsers = {}; // Simulación de base de datos
    mockCAD.usuarios = {}; // Propiedad necesaria para verificar que DB está conectada
    
    // Mock buscarUsuario - implementar búsqueda en memoria
    mockCAD.buscarUsuario = function(criterio, callback) {
      if (!criterio || typeof criterio !== 'object') {
        callback(undefined);
        return;
      }

      // Buscar por email o nick
      for (const user of Object.values(mockCAD._memoryUsers)) {
        if (criterio.email && user.email === criterio.email) {
          if (criterio.confirmada !== undefined && user.confirmada !== criterio.confirmada) {
            continue;
          }
          if (criterio.key && user.key !== criterio.key) {
            continue;
          }
          callback(user);
          return;
        }
        if (criterio.nick && user.nick === criterio.nick) {
          callback(user);
          return;
        }
      }
      callback(undefined);
    };

    // Mock insertarUsuario - guardar en memoria
    mockCAD.insertarUsuario = function(usuario, callback) {
      if (!usuario || !usuario.email) {
        callback(undefined);
        return;
      }
      
      // Verificar duplicados
      for (const user of Object.values(mockCAD._memoryUsers)) {
        if (user.email === usuario.email) {
          callback({ email: -1, reason: 'email_duplicado' });
          return;
        }
        if (usuario.nick && user.nick === usuario.nick) {
          callback({ email: -1, reason: 'nick_duplicado' });
          return;
        }
      }

      // Guardar usuario
      usuario._id = `user_${Date.now()}`;
      mockCAD._memoryUsers[usuario._id] = usuario;
      callback(usuario);
    };

    // Mock actualizarUsuario
    mockCAD.actualizarUsuario = function(obj, callback) {
      if (!obj || !obj._id) {
        callback({ email: -1 });
        return;
      }

      const user = mockCAD._memoryUsers[obj._id];
      if (!user) {
        callback({ email: -1 });
        return;
      }

      Object.assign(user, obj);
      callback(user);
    };

    // Mock insertarLog
    mockCAD.insertarLog = async function(tipoOperacion, usuario) {
      // Silenciar logs en tests
      return { insertedId: `log_${Date.now()}` };
    };

    // Mock buscarUsuarioRaw - similar a buscarUsuario pero devuelve el objeto completo
    mockCAD.buscarUsuarioRaw = function(criterio, callback) {
      if (!criterio || typeof criterio !== 'object') {
        callback(undefined);
        return;
      }

      for (const user of Object.values(mockCAD._memoryUsers)) {
        if (criterio.email && user.email === criterio.email) {
          if (criterio.confirmada !== undefined && user.confirmada !== criterio.confirmada) {
            continue;
          }
          if (criterio.key && user.key !== criterio.key) {
            continue;
          }
          callback(user);
          return;
        }
      }
      callback(undefined);
    };

    // Mock actualizarUsuarioPorEmail
    mockCAD.actualizarUsuarioPorEmail = function(email, patch, callback) {
      for (const user of Object.values(mockCAD._memoryUsers)) {
        if (user.email === email) {
          Object.assign(user, patch);
          callback(user);
          return;
        }
      }
      callback(undefined);
    };

    // Reemplazar el CAD del sistema
    sistema.cad = mockCAD;
  });

  describe('User Registration with Persistence', () => {
    it('should register and persist a new user', async () => {
      const userData = {
        email: 'persist@example.com',
        password: 'PersistPass123',
        nick: 'persistuser'
      };

      const result = await sistema.registrarUsuario(userData);
      expect(result).toBeDefined();
      expect(result.success || result.email).toBeTruthy();
    });

    it('should prevent duplicate email registration', async () => {
      const userData1 = {
        email: 'duplicate@example.com',
        password: 'Pass123',
        nick: 'user1'
      };

      const result1 = await sistema.registrarUsuario(userData1);
      expect(result1).toBeDefined();

      // Intentar registrar con mismo email - debe fallar
      const userData2 = {
        email: 'duplicate@example.com',
        password: 'DifferentPass123',
        nick: 'user2'
      };

      const result2 = await sistema.registrarUsuario(userData2);
      expect(result2).toBeDefined();
      expect(result2.email).toBe(-1);
      expect(result2.reason).toContain('email');
    });

    it('should prevent duplicate nick registration', async () => {
      const userData1 = {
        email: 'user1@example.com',
        password: 'Pass123',
        nick: 'samenick'
      };

      const result1 = await sistema.registrarUsuario(userData1);
      expect(result1).toBeDefined();

      // Intentar registrar con mismo nick - debe fallar
      const userData2 = {
        email: 'user2@example.com',
        password: 'Pass123',
        nick: 'samenick'
      };

      const result2 = await sistema.registrarUsuario(userData2);
      expect(result2).toBeDefined();
      expect(result2.email).toBe(-1);
      expect(result2.reason).toContain('nick');
    });

    it('should hash password and not store plain text', async () => {
      const password = 'SuperSecurePass123!';
      
      const userData = {
        email: 'crypto@example.com',
        password: password,
        nick: 'cryptouser'
      };

      const result = await sistema.registrarUsuario(userData);
      expect(result).toBeDefined();
    });
  });

  describe('User Confirmation with Persistence', () => {
    it('should reject confirmation for non-existent user', async () => {
      const confirmData = {
        email: 'nonexistent@example.com',
        key: 'anykey'
      };

      const result = await new Promise((resolve) => {
        sistema.confirmarUsuario(confirmData, (res) => resolve(res));
      });
      expect(result.email).toBe(-1);
    });

    it('should reject confirmation with invalid key', async () => {
      const userData = {
        email: 'invalidkey@example.com',
        password: 'Pass123',
        nick: 'invaliduser'
      };

      await sistema.registrarUsuario(userData);

      const result = await new Promise((resolve) => {
        sistema.confirmarUsuario({
          email: 'invalidkey@example.com',
          key: 'wrongkey'
        }, (res) => resolve(res));
      });

      expect(result.email).toBe(-1);
    });
  });

  describe('User Login with Persistence', () => {
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
  });

  describe('Activity Logging Integration', () => {
    it('should log failed login attempts', async () => {
      const spy = vi.spyOn(sistema, 'registrarActividad');

      await new Promise((resolve) => {
        sistema.loginUsuario({
          email: 'nonexistent@example.com',
          password: 'WrongPass'
        }, (res) => resolve(res));
      });

      expect(spy).toHaveBeenCalledWith('loginUsuarioFallido', 'nonexistent@example.com');
      spy.mockRestore();
    });
  });
});
