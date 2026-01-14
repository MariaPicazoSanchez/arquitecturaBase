import { io } from "socket.io-client";

function resolveServerUrl() {
  const envUrl = String(import.meta.env.VITE_URL_SERVER || "").trim();
  if (envUrl) return envUrl;
  if (import.meta.env.PROD && typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:3000";
}

export function createUnoSocket({
  codigo,
  email,
  onState,
  onLog,
  onError,
  onUnoRequired,
  onUnoCleared,
  onUnoCalled,
  onPlayerLost,
  onGameOver,
  onActionEffect,
  onDeckReshuffle,
  onDeckReloaded,
  onUnoError,
  onRematchStatus,
  onRematchStart,
  onReactionReceive,
} = {}) {
  const socket = io(resolveServerUrl(), {
    path: "/socket.io",
    withCredentials: true,
  });

  socket.on("connect", () => {
    console.log("[UNO] conectado al WS", socket.id);
    const subscribe = () => {
      socket.emit("uno:suscribirse", { codigo, email });
      socket.emit("uno_get_state", { codigo, email });
    };

    let settled = false;
    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      subscribe();
    }, 1200);

    socket.emit("game:resume", { gameType: "uno", gameId: codigo, email }, (res) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      if (res && res.ok) return;
      subscribe();
    });
  });

  socket.on("uno_state", (estado) => {
    console.log("[UNO] estado recibido:", estado);
    if (typeof onState === "function") onState(estado);
  });

  socket.on("uno_log", (payload) => {
    if (typeof onLog === "function") onLog(payload);
  });

  socket.on("uno:uno_required", (payload) => {
    if (typeof onUnoRequired === "function") onUnoRequired(payload);
  });
  socket.on("uno:uno_cleared", (payload) => {
    if (typeof onUnoCleared === "function") onUnoCleared(payload);
  });
  socket.on("uno:uno_called", (payload) => {
    if (typeof onUnoCalled === "function") onUnoCalled(payload);
  });
  socket.on("uno:player_lost", (payload) => {
    if (typeof onPlayerLost === "function") onPlayerLost(payload);
  });
  socket.on("uno:game_over", (payload) => {
    if (typeof onGameOver === "function") onGameOver(payload);
  });
  socket.on("uno:action_effect", (payload) => {
    if (typeof onActionEffect === "function") onActionEffect(payload);
  });
  socket.on("uno_deck_reshuffle", (payload) => {
    if (typeof onDeckReshuffle === "function") onDeckReshuffle(payload);
  });
  socket.on("uno_deck_reloaded", (payload) => {
    if (typeof onDeckReloaded === "function") onDeckReloaded(payload);
  });
  socket.on("uno_error", (payload) => {
    if (typeof onUnoError === "function") onUnoError(payload);
  });
  socket.on("uno:rematch_status", (payload) => {
    if (typeof onRematchStatus === "function") onRematchStatus(payload);
  });
  socket.on("uno:rematch_start", (payload) => {
    if (typeof onRematchStart === "function") onRematchStart(payload);
  });

  socket.on("reaction:receive", (payload) => {
    if (typeof onReactionReceive === "function") onReactionReceive(payload);
  });

  socket.on("connect_error", (err) => {
    console.error("[UNO] error de conexión:", err);
    if (typeof onError === "function") onError(err);
  });

  function sendAction(action) {
    socket.emit("uno:accion", { codigo, email, action });
  }

  function reloadDeck() {
    socket.emit("uno_reload_deck", { codigo, codigoPartida: codigo, email });
  }

  function callUno() {
    socket.emit("uno:uno_call", { codigo, email });
  }

  function getLog() {
    socket.emit("uno_get_log", { codigo, codigoPartida: codigo, email });
  }

  function rematchReady() {
    socket.emit("uno:rematch_ready", { codigo, email });
  }

  function sendReaction({ gameId, toPlayerId, icon } = {}) {
    const resolvedGameId = String(gameId || codigo || "").trim();
    return new Promise((resolve) => {
      socket.emit("reaction:send", { gameId: resolvedGameId, toPlayerId, icon }, (ack) => {
        resolve(ack);
      });
    });
  }

  function disconnect() {
    socket.disconnect();
  }

  return { socket, sendAction, reloadDeck, callUno, getLog, rematchReady, sendReaction, disconnect };
}
