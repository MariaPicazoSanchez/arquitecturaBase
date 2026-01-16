import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import http from 'http';
import express from 'express';

describe('REST API Endpoints', () => {
  let app;
  let mockSistema;
  let server;

  beforeEach(() => {
    // Create minimal express app with mocked Sistema
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Mock Sistema object with all required methods
    mockSistema = {
      registrarUsuario: vi.fn(),
      confirmarUsuario: vi.fn(),
      loginUsuario: vi.fn(),
      obtenerUsuarios: vi.fn(() => ({})),
      numeroUsuarios: vi.fn(() => 0),
      usuarioActivo: vi.fn(() => false),
      eliminarUsuario: vi.fn(),
      agregarUsuario: vi.fn(),
      registrarActividad: vi.fn()
    };

    // Setup minimal authentication middleware
    app.use((req, res, next) => {
      req.session = { user: null };
      req.user = null;
      next();
    });

    // Setup test auth headers
    app.use((req, res, next) => {
      const userId = req.headers['x-test-user-id'];
      const nick = req.headers['x-test-nick'];
      const email = req.headers['x-test-email'];
      if (userId || nick || email) {
        req.testAuth = { userId, nick, email };
      }
      next();
    });

    // Setup health checks
    app.get('/__test/ready', (_req, res) => res.json({ ok: true }));
    app.get('/__test/spec', (_req, res) => res.json({ ready: true }));

    // ============ Registration Endpoint ============
    app.post('/registrarUsuario', (req, res) => {
      const { email, password, nick } = req.body;
      
      // Input validation
      if (!email || !password || !nick) {
        return res.status(400).json({ 
          nick: -1, 
          reason: 'missing_fields',
          error: 'Email, password, and nick are required' 
        });
      }

      let responded = false;
      const send = (status, payload) => {
        if (responded) return;
        responded = true;
        return res.status(status).json(payload);
      };

      mockSistema.registrarUsuario({ email, password, nick }, (out) => {
        if (out && out.email && out.email !== -1) {
          return send(201, { nick: out.email });
        }
        const reason = (out && out.reason) || 'unknown';
        const errorMsg = reason === 'email_ya_registrado' ? 'Email already registered' :
                        reason === 'nick_ya_registrado' ? 'Nick already in use' :
                        'User registration failed';
        return send(409, { nick: -1, reason, error: errorMsg });
      });

      // Timeout protection
      setTimeout(() => {
        send(504, { nick: -1, reason: 'timeout', error: 'Response timeout' });
      }, 5000);
    });

    // ============ Login Endpoint ============
    app.post('/loginUsuario', (req, res) => {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ 
          nick: -1, 
          error: 'Email and password are required' 
        });
      }

      mockSistema.loginUsuario({ email, password }, (out) => {
        if (out && out.email && out.email !== -1) {
          req.session.user = { email: out.email };
          return res.status(200).json({ nick: out.email });
        }
        return res.status(401).json({ nick: -1, error: 'Invalid credentials' });
      });
    });

    // ============ Confirmation Endpoint ============
    app.get('/confirmarUsuario/:email/:key', (req, res) => {
      const { email, key } = req.params;

      if (!email || !key) {
        return res.status(400).json({ email: -1, error: 'Email and key are required' });
      }

      mockSistema.confirmarUsuario({ email, key }, (out) => {
        if (out && out.email && out.email !== -1) {
          return res.status(200).json({ email: out.email, confirmed: true });
        }
        return res.status(404).json({ email: -1, error: 'Confirmation failed' });
      });
    });

    // ============ Logout Endpoint ============
    app.get('/salir', (req, res) => {
      if (req.session) {
        try {
          req.session.destroy((err) => {
            res.clearCookie('nick');
            if (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1) {
              return res.json({ ok: true });
            }
            return res.redirect('/');
          });
        } catch (e) {
          res.clearCookie('nick');
          if (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1) {
            return res.json({ ok: true });
          }
          return res.redirect('/');
        }
      } else {
        res.clearCookie('nick');
        if (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1) {
          return res.json({ ok: true });
        }
        return res.redirect('/');
      }
    });

    // ============ User Management Endpoints ============
    app.get('/obtenerUsuarios', (req, res) => {
      const usuarios = mockSistema.obtenerUsuarios();
      res.json(usuarios);
    });

    app.get('/numeroUsuarios', (req, res) => {
      const num = mockSistema.numeroUsuarios();
      res.json({ num });
    });

    app.get('/usuarioActivo/:nick', (req, res) => {
      const { nick } = req.params;
      const activo = mockSistema.usuarioActivo(nick);
      res.json({ activo });
    });

    app.get('/agregarUsuario/:nick', (req, res) => {
      const { nick } = req.params;
      const result = mockSistema.agregarUsuario(nick);
      res.json(result);
    });

    app.get('/eliminarUsuario/:nick', (req, res) => {
      const { nick } = req.params;
      mockSistema.eliminarUsuario(nick);
      res.json({ eliminado: nick });
    });

    server = http.createServer(app);
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (server) {
      server.close();
    }
  });

  // ============ Health Check Tests ============
  describe('Health Checks', () => {
    it('should respond to ready check', () => {
      return request(app)
        .get('/__test/ready')
        .expect(200)
        .expect({ ok: true });
    });

    it('should respond to spec check', () => {
      return request(app)
        .get('/__test/spec')
        .expect(200)
        .expect({ ready: true });
    });
  });

  // ============ Registration Tests ============
  describe('POST /registrarUsuario - User Registration', () => {
    it('should register a new user successfully', () => {
      mockSistema.registrarUsuario.mockImplementation((data, callback) => {
        callback({ email: data.email, nick: data.nick });
      });

      return request(app)
        .post('/registrarUsuario')
        .send({
          email: 'newuser@example.com',
          password: 'Password123!',
          nick: 'newuser'
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.nick).toBe('newuser@example.com');
        });
    });

    it('should reject registration with missing email', () => {
      return request(app)
        .post('/registrarUsuario')
        .send({
          password: 'Password123!',
          nick: 'testuser'
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.nick).toBe(-1);
          expect(res.body.reason).toBe('missing_fields');
        });
    });

    it('should reject registration with missing password', () => {
      return request(app)
        .post('/registrarUsuario')
        .send({
          email: 'test@example.com',
          nick: 'testuser'
        })
        .expect(400);
    });

    it('should reject registration with missing nick', () => {
      return request(app)
        .post('/registrarUsuario')
        .send({
          email: 'test@example.com',
          password: 'Password123!'
        })
        .expect(400);
    });

    it('should handle duplicate email registration', () => {
      mockSistema.registrarUsuario.mockImplementation((data, callback) => {
        callback({ email: -1, reason: 'email_ya_registrado' });
      });

      return request(app)
        .post('/registrarUsuario')
        .send({
          email: 'existing@example.com',
          password: 'Password123!',
          nick: 'newuser'
        })
        .expect(409)
        .expect((res) => {
          expect(res.body.nick).toBe(-1);
          expect(res.body.reason).toBe('email_ya_registrado');
        });
    });

    it('should handle duplicate nick registration', () => {
      mockSistema.registrarUsuario.mockImplementation((data, callback) => {
        callback({ email: -1, reason: 'nick_ya_registrado' });
      });

      return request(app)
        .post('/registrarUsuario')
        .send({
          email: 'new@example.com',
          password: 'Password123!',
          nick: 'existingnick'
        })
        .expect(409)
        .expect((res) => {
          expect(res.body.reason).toBe('nick_ya_registrado');
        });
    });
  });

  // ============ Login Tests ============
  describe('POST /loginUsuario - User Login', () => {
    it('should login user with correct credentials', () => {
      mockSistema.loginUsuario.mockImplementation((data, callback) => {
        callback({ email: data.email });
      });

      return request(app)
        .post('/loginUsuario')
        .send({
          email: 'user@example.com',
          password: 'CorrectPassword123!'
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.nick).toBe('user@example.com');
        });
    });

    it('should reject login with missing email', () => {
      return request(app)
        .post('/loginUsuario')
        .send({
          password: 'Password123!'
        })
        .expect(400);
    });

    it('should reject login with missing password', () => {
      return request(app)
        .post('/loginUsuario')
        .send({
          email: 'user@example.com'
        })
        .expect(400);
    });

    it('should reject login with wrong credentials', () => {
      mockSistema.loginUsuario.mockImplementation((data, callback) => {
        callback({ email: -1 });
      });

      return request(app)
        .post('/loginUsuario')
        .send({
          email: 'user@example.com',
          password: 'WrongPassword'
        })
        .expect(401)
        .expect((res) => {
          expect(res.body.nick).toBe(-1);
        });
    });

    it('should reject login for non-existent user', () => {
      mockSistema.loginUsuario.mockImplementation((data, callback) => {
        callback({ email: -1 });
      });

      return request(app)
        .post('/loginUsuario')
        .send({
          email: 'nonexistent@example.com',
          password: 'Password123!'
        })
        .expect(401);
    });
  });

  // ============ Confirmation Tests ============
  describe('GET /confirmarUsuario/:email/:key - User Confirmation', () => {
    it('should confirm user with valid email and key', () => {
      mockSistema.confirmarUsuario.mockImplementation((data, callback) => {
        callback({ email: data.email });
      });

      return request(app)
        .get('/confirmarUsuario/user@example.com/validkey123')
        .expect(200)
        .expect((res) => {
          expect(res.body.email).toBe('user@example.com');
          expect(res.body.confirmed).toBe(true);
        });
    });

    it('should reject confirmation with invalid key', () => {
      mockSistema.confirmarUsuario.mockImplementation((data, callback) => {
        callback({ email: -1 });
      });

      return request(app)
        .get('/confirmarUsuario/user@example.com/invalidkey')
        .expect(404)
        .expect((res) => {
          expect(res.body.email).toBe(-1);
        });
    });

    it('should reject confirmation with non-existent user', () => {
      mockSistema.confirmarUsuario.mockImplementation((data, callback) => {
        callback({ email: -1 });
      });

      return request(app)
        .get('/confirmarUsuario/nonexistent@example.com/key123')
        .expect(404);
    });
  });

  // ============ Logout Tests ============
  describe('GET /salir - User Logout', () => {
    it('should logout user and return JSON', () => {
      return request(app)
        .get('/salir')
        .set('Accept', 'application/json')
        .expect(200)
        .expect({ ok: true });
    });
  });

  // ============ User Management Tests ============
  describe('User Management Endpoints', () => {
    it('should get number of users', () => {
      mockSistema.numeroUsuarios.mockReturnValue(5);

      return request(app)
        .get('/numeroUsuarios')
        .expect(200)
        .expect((res) => {
          expect(res.body.num).toBe(5);
        });
    });

    it('should check if user is active', () => {
      mockSistema.usuarioActivo.mockReturnValue(true);

      return request(app)
        .get('/usuarioActivo/activeuser')
        .expect(200)
        .expect((res) => {
          expect(res.body.activo).toBe(true);
        });
    });

    it('should return false for inactive user', () => {
      mockSistema.usuarioActivo.mockReturnValue(false);

      return request(app)
        .get('/usuarioActivo/inactiveuser')
        .expect(200)
        .expect((res) => {
          expect(res.body.activo).toBe(false);
        });
    });

    it('should add a new user', () => {
      mockSistema.agregarUsuario.mockReturnValue({ nick: 'newuser' });

      return request(app)
        .get('/agregarUsuario/newuser')
        .expect(200)
        .expect((res) => {
          expect(res.body.nick).toBe('newuser');
        });
    });

    it('should delete a user', () => {
      return request(app)
        .get('/eliminarUsuario/usertoremove')
        .expect(200)
        .expect((res) => {
          expect(res.body.eliminado).toBe('usertoremove');
        });
    });

    it('should return empty object when no users exist', () => {
      mockSistema.obtenerUsuarios.mockReturnValue({});

      return request(app)
        .get('/obtenerUsuarios')
        .expect(200)
        .expect({});
    });

    it('should return users list when users exist', () => {
      mockSistema.obtenerUsuarios.mockReturnValue({
        'user1': { email: 'user1@example.com' },
        'user2': { email: 'user2@example.com' }
      });

      return request(app)
        .get('/obtenerUsuarios')
        .expect(200)
        .expect((res) => {
          expect(res.body.user1).toBeDefined();
          expect(res.body.user2).toBeDefined();
        });
    });
  });

  // ============ Error Handling Tests ============
  describe('Error Handling', () => {
    it('should handle registration timeout', (done) => {
      mockSistema.registrarUsuario.mockImplementation((data, callback) => {
        // Don't call callback to simulate timeout
      });

      request(app)
        .post('/registrarUsuario')
        .send({
          email: 'timeout@example.com',
          password: 'Password123!',
          nick: 'timeoutuser'
        })
        .end((err, res) => {
          expect(res.status).toBe(504);
          expect(res.body.reason).toBe('timeout');
          done();
        });
    }, 6000); // Increase timeout to 6 seconds for this test

    it('should handle JSON parsing errors', () => {
      return request(app)
        .post('/registrarUsuario')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);
    });
  });

  // ============ HTTP Method Tests ============
  describe('HTTP Methods', () => {
    it('should reject GET requests to POST endpoints', () => {
      return request(app)
        .get('/registrarUsuario')
        .expect(404);
    });

    it('should reject POST requests to GET endpoints', () => {
      return request(app)
        .post('/numeroUsuarios')
        .expect(404);
    });
  });

  // ============ Content Type Tests ============
  describe('Content-Type Handling', () => {
    it('should accept application/json content type', () => {
      mockSistema.registrarUsuario.mockImplementation((data, callback) => {
        callback({ email: data.email });
      });

      return request(app)
        .post('/registrarUsuario')
        .set('Content-Type', 'application/json')
        .send({
          email: 'jsontest@example.com',
          password: 'Password123!',
          nick: 'jsontest'
        })
        .expect(201);
    });
  });
});
