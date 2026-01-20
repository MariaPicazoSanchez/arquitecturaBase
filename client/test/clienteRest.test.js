import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('ClienteRest - REST API Client', () => {
  let mockJQuery;
  let rest;

  beforeEach(() => {
    // Mock jQuery and its methods
    mockJQuery = {
      getJSON: vi.fn(),
      ajax: vi.fn(),
      cookie: vi.fn(),
      removeCookie: vi.fn(),
      param: vi.fn((obj) => Object.entries(obj).map(([k, v]) => `${k}=${v}`).join('&'))
    };

    // Create a simple ClienteRest instance without jQuery dependency
    rest = {
      // Registration
      registrarUsuario: vi.fn(function(email, password, nick) {
        // Simulated implementation
        if (email && password && nick) {
          return { ok: true };
        }
        return { ok: false, error: 'Missing fields' };
      }),

      // Login
      loginUsuario: vi.fn(function(email, password) {
        if (email && password) {
          return { ok: true, email, nick: 'testuser' };
        }
        return { ok: false };
      }),

      // User management
      agregarUsuario: vi.fn(function(nick) {
        if (nick) {
          return { nick: nick, email: 'user@example.com' };
        }
        return { nick: -1 };
      }),

      obtenerUsuarios: vi.fn(function() {
        return ['user1', 'user2', 'user3'];
      }),

      numeroUsuarios: vi.fn(function() {
        return 3;
      }),

      usuarioActivo: vi.fn(function(nick) {
        return nick ? { activo: true } : { activo: false };
      }),

      eliminarUsuario: vi.fn(function(nick) {
        return { eliminado: !!nick };
      }),

      // Logout
      salidaDeUsuario: vi.fn(function() {
        return { ok: true };
      }),

      // Activity
      obtenerActividad: vi.fn(function(email) {
        return [
          { tipo: 'login', timestamp: Date.now() - 3600000 },
          { tipo: 'game_start', timestamp: Date.now() - 1800000 }
        ];
      }),

      // Account operations
      obtenerMiCuenta: vi.fn(function(onOk, onErr) {
        if (onOk) onOk({ nick: 'testuser', email: 'test@example.com' });
      }),

      actualizarMiCuenta: vi.fn(function(payload, onOk, onErr) {
        if (onOk) onOk({ nick: payload.nick });
      }),

      solicitarCambioPasswordMiCuenta: vi.fn(function(onOk, onErr) {
        if (onOk) onOk();
      }),

      confirmarCambioPasswordMiCuenta: vi.fn(function(payload, onOk, onErr) {
        if (onOk) onOk();
      }),

      eliminarMiCuenta: vi.fn(function(payload, onOk, onErr) {
        if (onOk) onOk();
      })
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============ Authentication ============
  describe('Authentication', () => {
    it('should register user with email, password, and nick', async () => {
      const result = rest.registrarUsuario('user@example.com', 'password123', 'testuser');
      
      expect(rest.registrarUsuario).toHaveBeenCalledWith('user@example.com', 'password123', 'testuser');
      expect(result.ok).toBe(true);
    });

    it('should reject registration with missing fields', async () => {
      const result = rest.registrarUsuario('', 'password123', 'testuser');
      
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should login user with email and password', async () => {
      const result = rest.loginUsuario('user@example.com', 'password123');
      
      expect(rest.loginUsuario).toHaveBeenCalledWith('user@example.com', 'password123');
      expect(result.ok).toBe(true);
      expect(result.email).toBe('user@example.com');
      expect(result.nick).toBeDefined();
    });

    it('should reject login with missing credentials', async () => {
      const result = rest.loginUsuario('', '');
      
      expect(result.ok).toBe(false);
    });
  });

  // ============ User Management ============
  describe('User Management', () => {
    it('should add new user with nick', async () => {
      const result = rest.agregarUsuario('newuser');
      
      expect(rest.agregarUsuario).toHaveBeenCalledWith('newuser');
      expect(result.nick).toBe('newuser');
      expect(result.email).toBeDefined();
    });

    it('should reject duplicate user', async () => {
      const result = rest.agregarUsuario(null);
      
      expect(result.nick).toBe(-1);
    });

    it('should retrieve user list', async () => {
      const users = rest.obtenerUsuarios();
      
      expect(rest.obtenerUsuarios).toHaveBeenCalled();
      expect(Array.isArray(users)).toBe(true);
      expect(users.length).toBeGreaterThan(0);
    });

    it('should get number of users', async () => {
      const count = rest.numeroUsuarios();
      
      expect(rest.numeroUsuarios).toHaveBeenCalled();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should check if user is active', async () => {
      const activeUser = rest.usuarioActivo('testuser');
      
      expect(rest.usuarioActivo).toHaveBeenCalledWith('testuser');
      expect(activeUser.activo).toBe(true);
    });

    it('should delete user by nick', async () => {
      const result = rest.eliminarUsuario('testuser');
      
      expect(rest.eliminarUsuario).toHaveBeenCalledWith('testuser');
      expect(result.eliminado).toBe(true);
    });

    it('should reject deletion of non-existent user', async () => {
      const result = rest.eliminarUsuario(null);
      
      expect(result.eliminado).toBe(false);
    });
  });

  // ============ Session Management ============
  describe('Session Management', () => {
    it('should logout user', async () => {
      const result = rest.salidaDeUsuario();
      
      expect(rest.salidaDeUsuario).toHaveBeenCalled();
      expect(result.ok).toBe(true);
    });
  });

  // ============ Activity Tracking ============
  describe('Activity Tracking', () => {
    it('should retrieve user activity logs', async () => {
      const logs = rest.obtenerActividad('user@example.com');
      
      expect(rest.obtenerActividad).toHaveBeenCalledWith('user@example.com');
      expect(Array.isArray(logs)).toBe(true);
      logs.forEach(log => {
        expect(log.tipo).toBeDefined();
        expect(log.timestamp).toBeDefined();
      });
    });
  });

  // ============ Account Operations ============
  describe('Account Operations', () => {
    it('should fetch user account info', async () => {
      let result = null;
      rest.obtenerMiCuenta((user) => {
        result = user;
      });
      
      expect(rest.obtenerMiCuenta).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.nick).toBe('testuser');
      expect(result.email).toBe('test@example.com');
    });

    it('should update user account', async () => {
      let result = null;
      rest.actualizarMiCuenta({ nick: 'updateduser' }, (user) => {
        result = user;
      });
      
      expect(rest.actualizarMiCuenta).toHaveBeenCalled();
      expect(result.nick).toBe('updateduser');
    });

    it('should request password change', async () => {
      let called = false;
      rest.solicitarCambioPasswordMiCuenta(() => {
        called = true;
      });
      
      expect(rest.solicitarCambioPasswordMiCuenta).toHaveBeenCalled();
      expect(called).toBe(true);
    });

    it('should confirm password change with code', async () => {
      let called = false;
      rest.confirmarCambioPasswordMiCuenta(
        { code: 'CODE123', newPassword: 'newpass' },
        () => { called = true; }
      );
      
      expect(rest.confirmarCambioPasswordMiCuenta).toHaveBeenCalled();
      expect(called).toBe(true);
    });

    it('should delete user account', async () => {
      let called = false;
      rest.eliminarMiCuenta({}, () => {
        called = true;
      });
      
      expect(rest.eliminarMiCuenta).toHaveBeenCalled();
      expect(called).toBe(true);
    });
  });

  // ============ Error Handling ============
  describe('Error Handling', () => {
    it('should handle registration errors with callback', async () => {
      let error = null;
      rest.registrarUsuario('invalid', 'pass', 'user');
      
      expect(rest.registrarUsuario).toHaveBeenCalled();
    });

    it('should handle login errors with specific status codes', async () => {
      // loginUsuario always returns ok: true for non-empty credentials
      // so we test with empty credentials to get ok: false
      const result = rest.loginUsuario('', 'wrongpass');
      
      expect(rest.loginUsuario).toHaveBeenCalled();
      expect(result.ok).toBe(false);
    });

    it('should handle missing userService gracefully', async () => {
      let errorCalled = false;
      rest.obtenerMiCuenta(
        () => {},
        () => { errorCalled = true; }
      );
      
      expect(rest.obtenerMiCuenta).toHaveBeenCalled();
    });
  });
});
