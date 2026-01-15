import { io } from 'socket.io-client';

function resolveServerUrl() {
  const envUrl = String(import.meta.env.VITE_URL_SERVER || '').trim();
  if (envUrl) return envUrl;
  if (import.meta.env.PROD && typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:3000';
}

export function createConnect4Socket({
  codigo,
  email,
  onState,
  onError,
  onRematchReady,
} = {}) {
  const socket = io(resolveServerUrl(), {
    path: '/socket.io',
    withCredentials: true,
  });

  let hasReceivedState = false;
  const matchCode = String(codigo || '').trim();

  function requestState(onResult) {
    if (!matchCode) return;
    if (typeof onResult === 'function') {
      socket.emit('game:get_state', { matchCode, gameKey: '4raya', email }, onResult);
    } else {
      socket.emit('game:get_state', { matchCode, gameKey: '4raya', email });
    }
  }

  socket.on('connect', () => {
    socket.emit('4raya:suscribirse', { codigo, email });
    setTimeout(() => {
      if (!hasReceivedState) requestState();
    }, 1200);
  });

  socket.on('4raya:estado', (payload) => {
    hasReceivedState = true;
    if (typeof onState === 'function') onState(payload?.engine ?? null);
  });

  socket.on('game:state', (payload) => {
    const code = String(payload?.matchCode || payload?.codigo || '').trim();
    const key = String(payload?.gameKey || '').trim().toLowerCase();
    if (!code || code !== matchCode) return;
    if (key && key !== '4raya' && key !== 'connect4') return;
    hasReceivedState = true;
    if (typeof onState === 'function') onState(payload?.state ?? null);
  });

  socket.on('connect_error', (err) => {
    if (typeof onError === 'function') onError(err);
  });

  socket.on('4raya:rematch_ready', (payload) => {
    const newCodigo = payload?.newCodigo ?? null;
    const error = payload?.error ?? null;
    if (typeof onRematchReady === 'function') onRematchReady(newCodigo, error);
  });

  function sendAction(action) {
    socket.emit('4raya:accion', { codigo, email, action });
  }

  function requestRematch() {
    socket.emit('4raya:rematch_request', { codigo, email });
  }

  function disconnect() {
    socket.disconnect();
  }

  return { socket, sendAction, requestRematch, requestState, disconnect };
}
