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

  socket.on('connect', () => {
    socket.emit('4raya:suscribirse', { codigo, email });
  });

  socket.on('4raya:estado', (payload) => {
    if (typeof onState === 'function') onState(payload?.engine ?? null);
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

  return { socket, sendAction, requestRematch, disconnect };
}
