const { once } = require('node:events');
const logger = require('../logger');
const { createExpressApp, createHttpServer, attachSocket } = require('./app');

async function startServer(port = 3000, options = {}) {
  const parsedPort = Number.parseInt(port, 10) || 3000;
  const app = createExpressApp(options);
  const httpServer = createHttpServer(app);
  const { io, sistema } = attachSocket(httpServer, options);

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(parsedPort, () => resolve());
  });

  const addr = httpServer.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : parsedPort;
  logger.info(`[startServer] Listening on port ${actualPort}`);

  return { app, httpServer, io, sistema };
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  startServer(port).catch((err) => {
    logger.error('[startServer] fallo arrancando:', err && err.stack ? err.stack : err);
    process.exit(1);
  });
}

module.exports = { startServer };
