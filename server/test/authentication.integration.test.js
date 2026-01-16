import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Sistema } from '../modelo.js';
import { CAD } from '../cad.js';
import bcrypt from 'bcrypt';

// Helper para convertir callbacks a promises
const promisify = (fn) => {
  return (...args) => new Promise((resolve) => {
    fn(...args, (result) => resolve(result));
  });
};

describe('Authentication - Integration Tests with Mocked CAD', () => {
  let sistema;
  let mockCAD;

  beforeEach(() => {
    sistema = new Sistema();
    
    // Crear un mock CAD con persistencia en memoria
    mockCAD = new CAD();
    mockCAD._memoryUsers = {}; // Simulación de base de datos
    
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

    // Reemplazar el CAD del sistema
    sistema.cad = mockCAD;
  });

  describe('User Registration with Persistence', () => {
    it('should register and persist a new user', async () => {
      const registrarUsuario = promisify(sistema.registrarUsuario.bind(sistema));
      const userData = {
        email: 'persist@example.com',
        password: 'PersistPass123',
        nick: 'persistuser'
      };

      const result = await registrarUsuario(userData);
      expect(result.email).toBe('persist@example.com');

      // Verificar que se guardó en memoria
      expect(Object.values(mockCAD._memoryUsers).length).toBeGreaterThan(0);
      const savedUser = Object.values(mockCAD._memoryUsers).find(u => u.email === 'persist@example.com');
      expect(savedUser).toBeDefined();
      expect(savedUser.nick).toBe('persistuser');
    });

    it('should prevent duplicate email registration', async () => {
      const registrarUsuario = promisify(sistema.registrarUsuario.bind(sistema));

      const userData1 = {
        email: 'duplicate@example.com',
        password: 'Pass123',
        nick: 'user1'
      };

      const result1 = await registrarUsuario(userData1);
      expect(result1.email).toBe('duplicate@example.com');

      // Intentar registrar con mismo email
      const userData2 = {
        email: 'duplicate@example.com',
        password: 'DifferentPass123',
        nick: 'user2'
      };

      const result2 = await registrarUsuario(userData2);
      expect(result2.email).toBe(-1);
      expect(result2.reason).toBe('email_ya_registrado');
    });

    it('should prevent duplicate nick registration', async () => {
      const registrarUsuario = promisify(sistema.registrarUsuario.bind(sistema));

      const userData1 = {
        email: 'user1@example.com',
        password: 'Pass123',
        nick: 'samenick'
      };

      const result1 = await registrarUsuario(userData1);
      expect(result1.email).toBe('user1@example.com');

      // Intentar registrar con mismo nick
      const userData2 = {
        email: 'user2@example.com',
        password: 'Pass123',
        nick: 'samenick'
      };

      const result2 = await registrarUsuario(userData2);
      expect(result2.email).toBe(-1);
      expect(result2.reason).toBe('nick_ya_registrado');
    });

    it('should hash password and not store plain text', async () => {
      const registrarUsuario = promisify(sistema.registrarUsuario.bind(sistema));
      const password = 'SuperSecurePass123!';
      
      const userData = {
        email: 'crypto@example.com',
        password: password,
        nick: 'cryptouser'
      };

      const result = await registrarUsuario(userData);
      
      // Obtener usuario guardado
      const savedUser = Object.values(mockCAD._memoryUsers).find(u => u.email === 'crypto@example.com');
      expect(savedUser).toBeDefined();
      expect(savedUser.password).not.toBe(password);
      
      // Verificar que bcrypt puede validarlo
      const isValid = bcrypt.compareSync(password, savedUser.password);
      expect(isValid).toBe(true);
    });
  });

  describe('User Confirmation with Persistence', () => {
    it('should confirm user with valid key', async () => {
      const registrarUsuario = promisify(sistema.registrarUsuario.bind(sistema));
      const confirmarUsuario = promisify(sistema.confirmarUsuario.bind(sistema));

      const userData = {
        email: 'confirmtest@example.com',
        password: 'Pass123',
        nick: 'confirmuser'
      };

      const registered = await registrarUsuario(userData);
      const key = registered.key;

      // Usuario debe estar sin confirmar
      const savedUser = Object.values(mockCAD._memoryUsers).find(u => u.email === 'confirmtest@example.com');
      expect(savedUser.confirmada).toBe(false);

      // Confirmar con key válida
      const confirmed = await confirmarUsuario({
        email: 'confirmtest@example.com',
        key: key
      });

      expect(confirmed.email).toBe('confirmtest@example.com');
      
      // Verificar que está confirmado ahora
      const updatedUser = Object.values(mockCAD._memoryUsers).find(u => u.email === 'confirmtest@example.com');
      expect(updatedUser.confirmada).toBe(true);
    });

    it('should reject confirmation with invalid key', async () => {
      const registrarUsuario = promisify(sistema.registrarUsuario.bind(sistema));
      const confirmarUsuario = promisify(sistema.confirmarUsuario.bind(sistema));

      const userData = {
        email: 'invalidkey@example.com',
        password: 'Pass123',
        nick: 'invaliduser'
      };

      await registrarUsuario(userData);

      const result = await confirmarUsuario({
        email: 'invalidkey@example.com',
        key: 'wrongkey'
      });

      expect(result.email).toBe(-1);
    });
  });

  describe('User Login with Persistence', () => {
    let userEmail, userPassword, userNick;

    beforeEach(async () => {
      const registrarUsuario = promisify(sistema.registrarUsuario.bind(sistema));
      const confirmarUsuario = promisify(sistema.confirmarUsuario.bind(sistema));

      userEmail = 'logintest@example.com';
      userPassword = 'LoginPass123!';
      userNick = 'loginuser';

      const userData = {
        email: userEmail,
        password: userPassword,
        nick: userNick
      };

      const registered = await registrarUsuario(userData);
      
      // Confirmar usuario
      await confirmarUsuario({
        email: registered.email,
        key: registered.key
      });
    });

    it('should login with correct credentials', async () => {
      const loginUsuario = promisify(sistema.loginUsuario.bind(sistema));

      const result = await loginUsuario({
        email: userEmail,
        password: userPassword
      });

      expect(result.email).toBe(userEmail);
      expect(result.nick).toBe(userNick);
      expect(result.confirmada).toBe(true);
    });

    it('should reject login with wrong password', async () => {
      const loginUsuario = promisify(sistema.loginUsuario.bind(sistema));

      const result = await loginUsuario({
        email: userEmail,
        password: 'WrongPassword'
      });

      expect(result.email).toBe(-1);
    });

    it('should reject login for unconfirmed users', async () => {
      const registrarUsuario = promisify(sistema.registrarUsuario.bind(sistema));
      const loginUsuario = promisify(sistema.loginUsuario.bind(sistema));

      const userData = {
        email: 'unconfirmed@example.com',
        password: 'Pass123',
        nick: 'unconfirmeduser'
      };

      await registrarUsuario(userData);

      // Intentar login sin confirmar
      const result = await loginUsuario({
        email: 'unconfirmed@example.com',
        password: 'Pass123'
      });

      expect(result.email).toBe(-1);
    });
  });

  describe('Activity Logging Integration', () => {
    it('should log successful registration', async () => {
      const registrarUsuario = promisify(sistema.registrarUsuario.bind(sistema));
      const spy = vi.spyOn(sistema, 'registrarActividad');

      const userData = {
        email: 'logging@example.com',
        password: 'Pass123',
        nick: 'logginguser'
      };

      await registrarUsuario(userData);
      
      expect(spy).toHaveBeenCalledWith('registroUsuario', 'logging@example.com');
      spy.mockRestore();
    });

    it('should log failed registration attempts', async () => {
      const registrarUsuario = promisify(sistema.registrarUsuario.bind(sistema));
      const spy = vi.spyOn(sistema, 'registrarActividad');

      // Primer registro exitoso
      await registrarUsuario({
        email: 'first@example.com',
        password: 'Pass123',
        nick: 'firstuser'
      });

      // Segundo registro con mismo email (fallará)
      await registrarUsuario({
        email: 'first@example.com',
        password: 'Pass123',
        nick: 'seconduser'
      });

      // Verificar que registró el fallo
      expect(spy).toHaveBeenCalledWith('registrarUsuarioFallido', 'first@example.com');
      spy.mockRestore();
    });

    it('should log successful login', async () => {
      const registrarUsuario = promisify(sistema.registrarUsuario.bind(sistema));
      const confirmarUsuario = promisify(sistema.confirmarUsuario.bind(sistema));
      const loginUsuario = promisify(sistema.loginUsuario.bind(sistema));

      const userData = {
        email: 'loginsuccess@example.com',
        password: 'Pass123',
        nick: 'loginsuccessuser'
      };

      const registered = await registrarUsuario(userData);
      await confirmarUsuario({
        email: registered.email,
        key: registered.key
      });

      const spy = vi.spyOn(sistema, 'registrarActividad');

      await loginUsuario({
        email: userData.email,
        password: userData.password
      });

      expect(spy).toHaveBeenCalledWith('inicioLocal', userData.email);
      spy.mockRestore();
    });

    it('should log failed login attempts', async () => {
      const loginUsuario = promisify(sistema.loginUsuario.bind(sistema));
      const spy = vi.spyOn(sistema, 'registrarActividad');

      await loginUsuario({
        email: 'nonexistent@example.com',
        password: 'WrongPass'
      });

      expect(spy).toHaveBeenCalledWith('loginUsuarioFallido', 'nonexistent@example.com');
      spy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    it('should trim whitespace from password', async () => {
      const registrarUsuario = promisify(sistema.registrarUsuario.bind(sistema));

      const userData = {
        email: 'trim@example.com',
        password: '  Pass123  ',
        nick: 'trimuser'
      };

      const result = await registrarUsuario(userData);
      expect(result.email).toBe('trim@example.com');
    });
  });
});
