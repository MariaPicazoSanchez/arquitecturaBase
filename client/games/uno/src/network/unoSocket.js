import { io } from "socket.io-client";

export function createUnoSocket({
  codigo,
  email,
  onState,
  onError,
  onUnoRequired,
  onUnoCleared,
  onUnoCalled,
  onPlayerLost,
  onGameOver,
  onActionEffect,
  onRematchStatus,
  onRematchStart,
} = {}) {
  const socket = io("/", { withCredentials: true });

  socket.on("connect", () => {
    console.log("[UNO] conectado al WS", socket.id);
    socket.emit("uno:suscribirse", { codigo, email });
  });

  socket.on("uno:estado", (estado) => {
    console.log("[UNO] estado recibido:", estado);
    onState?.(estado);
  });

  socket.on("uno:uno_required", (payload) => onUnoRequired?.(payload));
  socket.on("uno:uno_cleared", (payload) => onUnoCleared?.(payload));
  socket.on("uno:uno_called", (payload) => onUnoCalled?.(payload));
  socket.on("uno:player_lost", (payload) => onPlayerLost?.(payload));
  socket.on("uno:game_over", (payload) => onGameOver?.(payload));
  socket.on("uno:action_effect", (payload) => onActionEffect?.(payload));
  socket.on("uno:rematch_status", (payload) => onRematchStatus?.(payload));
  socket.on("uno:rematch_start", (payload) => onRematchStart?.(payload));

  socket.on("connect_error", (err) => {
    console.error("[UNO] error de conexión:", err);
    onError?.(err);
  });

  function sendAction(action) {
    socket.emit("uno:accion", { codigo, email, action });
  }

  function callUno() {
    socket.emit("uno:uno_call", { codigo, email });
  }

  function rematchReady() {
    socket.emit("uno:rematch_ready", { codigo, email });
  }

  function disconnect() {
    socket.disconnect();
  }

  return { socket, sendAction, callUno, rematchReady, disconnect };
}
