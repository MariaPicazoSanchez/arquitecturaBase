const http = require('node:http');
const express = require('express');
const { Server } = require('socket.io');
const path = require('node:path');
const logger = require('../logger');
const modelo = require('../modelo');
const { ServidorWS } = require('../servidorWS');

require('dotenv').config();

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_SOCKET_OPTIONS = {
  path: '/socket.io',
  cors: { origin: true, methods: ['GET', 'POST'], credentials: true },
};

const extractTestAuthFromHandshake = (socket) => {
  const auth = socket?.handshake?.auth || {};
  const query = socket?.handshake?.query || {};
  const headers = socket?.handshake?.headers || {};
  const normalizedHeader = (name) => headers[name.toLowerCase()] || headers[name];
  const values = {
    email: auth.email || query.email || normalizedHeader('x-test-email'),
    nick: auth.nick || query.nick || normalizedHeader('x-test-nick'),
    userId: auth.userId || query.userId || normalizedHeader('x-test-user-id') || normalizedHeader('x-test-userid'),
  };
  return values;
};

const applyTestAuthToSocket = (io, enabled) => {
  if (!enabled) return;
  io.use((socket, next) => {
    const testValues = extractTestAuthFromHandshake(socket);
    if (testValues.userId || testValues.nick || testValues.email) {
      socket.data = socket.data || {};
      if (testValues.userId) socket.data.userId = testValues.userId;
      if (testValues.nick) socket.data.nick = testValues.nick;
      if (testValues.email) socket.data.email = testValues.email;
    }
    next();
  });
};

const createExpressApp = (options = {}) => {
  const enableTestAuth = options.enableTestAuth ?? process.env.TEST_AUTH === '1';
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  if (enableTestAuth) {
    app.use((req, res, next) => {
      const header = (name) => req.headers && req.headers[name];
      const userId = header('x-test-user-id') || header('x-test-userid');
      const nick = header('x-test-nick');
      const email = header('x-test-email');
      if (userId || nick || email) {
        req.testAuth = { userId, nick, email };
      }
      next();
    });
  }

  app.get('/__test/ready', (_req, res) => res.json({ ok: true }));
  app.get('/__test/spec', (_req, res) => res.json({ ready: true }));
  return app;
};

const createHttpServer = (app) => http.createServer(app);

const createSistema = (options = {}) => {
  if (options.sistema) return options.sistema;
  try {
    return new modelo.Sistema();
  } catch (error) {
    logger.error('[app] crear Sistema falló:', error && error.stack ? error.stack : error);
    throw error;
  }
};

const attachSocket = (httpServer, options = {}) => {
  const socketOptions = { ...DEFAULT_SOCKET_OPTIONS, ...(options.socketOptions || {}) };
  const io = new Server(httpServer, socketOptions);
  const enableTestAuth = options.enableTestAuth ?? process.env.TEST_AUTH === '1';
  applyTestAuthToSocket(io, enableTestAuth);
  const sistema = options.sistema || createSistema(options);
  const ws = new ServidorWS();
  ws.lanzarServidor(io, sistema);
  return { io, sistema, ws };
};

module.exports = {
  createExpressApp,
  createHttpServer,
  attachSocket,
  createSistema,
  ROOT_DIR,
};
