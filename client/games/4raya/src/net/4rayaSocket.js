import { io } from "socket.io-client";

function resolveServerUrl() {
  const envUrl = String(import.meta.env.VITE_URL_SERVER || "").trim();
  if (envUrl) return envUrl;
  if (import.meta.env.PROD && typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:3000";
}

export function create4RayaSocket({ codigo, email, handlers = {} } = {}) {
  const matchCode = String(codigo || "").trim();
  const socket = io(resolveServerUrl(), {
    path: "/socket.io",
    withCredentials: true,
  });

  const listeners = [];
  let stateRetryTimer = null;
  let fallbackTimer = null;
  let hasReceivedState = false;

  const track = (event, fn) => {
    socket.on(event, fn);
    listeners.push({ event, fn });
  };

  const clearListeners = () => {
    for (const entry of listeners) {
      socket.off(entry.event, entry.fn);
    }
    listeners.length = 0;
  };

  const clearTimers = () => {
    if (stateRetryTimer) {
      clearTimeout(stateRetryTimer);
      stateRetryTimer = null;
    }
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  };

  const requestState = (onResult) => {
    if (!matchCode) return;
    socket.emit("game:get_state", { matchCode, gameKey: "4raya", email }, onResult);
  };

  const handleConnect = () => {
    handlers.onConnect?.();
    const join = () => {
      socket.emit("4raya:suscribirse", { codigo, email });
    };

    let settled = false;
    clearTimers();
    fallbackTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      join();
    }, 1200);

    socket.emit(
      "game:resume",
      { gameType: "4raya", gameId: codigo, email },
      (res) => {
        if (settled) return;
        settled = true;
        clearTimers();
        if (res && res.ok) return;
        join();
      }
    );

    stateRetryTimer = setTimeout(() => {
      if (hasReceivedState) return;
      requestState();
    }, 1200);
  };

  track("connect", () => {
    handleConnect();
  });

  track("4raya:estado", (payload) => {
    hasReceivedState = true;
    const next = payload?.engine ?? null;
    if (!next) return;
    handlers.onState?.(next);
  });

  track("game:state", (payload) => {
    const code = String(payload?.matchCode || payload?.codigo || "").trim();
    const key = String(payload?.gameKey || "").trim().toLowerCase();
    if (!code || code !== matchCode) return;
    if (key && key !== "4raya" && key !== "connect4") return;
    hasReceivedState = true;
    const next = payload?.state ?? null;
    if (!next) return;
    handlers.onState?.(next);
  });

  track("connect_error", (err) => {
    handlers.onError?.(err);
  });

  track("4raya:rematch_ready", (payload) => {
    const newCodigo = payload?.newCodigo ?? null;
    const error = payload?.error ?? null;
    handlers.onRematchReady?.(newCodigo, error);
  });

  function sendAction(action) {
    socket.emit("4raya:accion", { codigo, email, action });
  }

  function requestRematch() {
    socket.emit("4raya:rematch_request", { codigo, email });
  }

  function dispose() {
    clearListeners();
    clearTimers();
    socket.disconnect();
  }

  return {
    socket,
    sendAction,
    requestRematch,
    requestState,
    dispose,
  };
}
