const { once } = require('node:events');
const { createExpressApp, createHttpServer, attachSocket, createSistema } = require('../../src/app');

const DEFAULT_HOST = '127.0.0.1';

async function listenOnRandomPort(server) {
  return new Promise((resolve, reject) => {
    server.once('listening', () => resolve(server.address()));
    server.once('error', reject);
    server.listen(0);
  });
}

function restoreEnv(snapshot) {
  if (!snapshot) return;
  Object.keys(snapshot).forEach((key) => {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
}

async function startTestServer(options = {}) {
  const enableTestAuth = options.enableTestAuth ?? true;
  const envSnapshot = {
    NODE_ENV: process.env.NODE_ENV,
    TEST_AUTH: process.env.TEST_AUTH,
  };
  process.env.NODE_ENV = 'test';
  process.env.TEST_AUTH = '1';

  try {
    const app = createExpressApp({ enableTestAuth });
    const httpServer = createHttpServer(app);
    const sistema = createSistema();
    const { io } = attachSocket(httpServer, { sistema, enableTestAuth });

    const address = await listenOnRandomPort(httpServer);
    const port = typeof address === 'object' && address ? address.port : 0;
    const baseUrl = `http://${DEFAULT_HOST}:${port}`;

    let stopped = false;
    const stop = async () => {
      if (stopped) return;
      stopped = true;
      await new Promise((resolve) => httpServer.close(() => resolve()));
      await io.close();
      restoreEnv(envSnapshot);
    };

    return { baseUrl, httpServer, io, sistema, stop, port };
  } catch (error) {
    restoreEnv(envSnapshot);
    throw error;
  }
}

module.exports = { startTestServer };
