const { io } = require('socket.io-client');

const DEFAULT_TIMEOUT = 2000;

const connectClient = (baseUrl, player, options = {}) =>
  new Promise((resolve, reject) => {
    const socket = io(baseUrl, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnectionAttempts: 0,
      auth: {
        userId: player.userId,
        nick: player.nick,
        email: player.email,
      },
      ...options,
    });

    const cleanup = () => {
      socket.off('connect', connectHandler);
      socket.off('connect_error', errorHandler);
    };

    const connectHandler = () => {
      cleanup();
      resolve(socket);
    };

    const errorHandler = (err) => {
      cleanup();
      socket.close();
      reject(err);
    };

    socket.once('connect', connectHandler);
    socket.once('connect_error', errorHandler);
  });

const waitForEvent = (socket, event, timeout = DEFAULT_TIMEOUT) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeout);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const emitWithAck = (socket, event, payload, timeout = DEFAULT_TIMEOUT) =>
  new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve(undefined);
    }, timeout);
    socket.emit(event, payload, (response) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(response);
    });
  });

const safeDisconnect = (socket) => {
  if (!socket) return;
  try {
    socket.disconnect();
  } catch (error) {
    // ignore
  }
};

module.exports = {
  connectClient,
  waitForEvent,
  emitWithAck,
  safeDisconnect,
};
