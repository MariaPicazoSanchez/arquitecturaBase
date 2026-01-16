export function createDamasSocket(socket, { codigo, email, handlers = {} } = {}) {
  if (!socket) throw new Error("Socket instance is required.");

  const matchCode = String(codigo || "").trim();
  const tracked = [];
  let subscribed = false;
  let resumeTimer = null;

  const track = (event, fn) => {
    socket.on(event, fn);
    tracked.push({ event, fn });
  };

  const clearTracked = () => {
    for (const item of tracked) {
      socket.off(item.event, item.fn);
    }
    tracked.length = 0;
  };

  const clearResumeTimer = () => {
    if (resumeTimer) {
      clearTimeout(resumeTimer);
      resumeTimer = null;
    }
  };

  const shouldHandlePayload = (payload) => {
    if (!payload) return false;
    const payloadCode = String(payload?.matchCode || payload?.codigo || "").trim();
    return !payloadCode || payloadCode === matchCode;
  };

  const joinRoom = () => {
    socket.emit("damas_join", { codigo, email });
  };

  const handleConnect = () => {
    if (!subscribed) return;
    handlers.onConnect?.();
    if (!matchCode) return;
    let settled = false;
    clearResumeTimer();
    resumeTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      joinRoom();
    }, 1200);

    socket.emit(
      "game:resume",
      { gameType: "damas", gameId: codigo, email },
      (res) => {
        if (settled) return;
        settled = true;
        clearResumeTimer();
        if (res && res.ok) return;
        joinRoom();
      }
    );
  };

  track("connect", () => {
    handleConnect();
  });

  track("damas_state", (payload) => {
    if (!shouldHandlePayload(payload)) return;
    const st = payload.statePublic || payload.state || null;
    if (!st) return;
    handlers.onState?.(payload);
  });

  track("game:state", (payload) => {
    if (!shouldHandlePayload(payload)) return;
    const key = String(payload?.gameKey || "").trim().toLowerCase();
    if (key && key !== "damas" && key !== "checkers") return;
    if (!payload?.state) return;
    handlers.onGameState?.(payload);
  });

  const onRematchState = (payload) => {
    if (!shouldHandlePayload(payload)) return;
    handlers.onRematchState?.(payload);
  };
  track("checkers:rematch_state", onRematchState);
  track("damas:rematch_state", onRematchState);

  const onRematchCancelled = (payload) => {
    if (!shouldHandlePayload(payload)) return;
    handlers.onRematchCancelled?.(payload);
  };
  track("checkers:rematch_cancelled", onRematchCancelled);
  track("damas:rematch_cancelled", onRematchCancelled);

  const onRematchStart = (payload) => {
    if (!shouldHandlePayload(payload)) return;
    handlers.onRematchStart?.(payload);
  };
  track("checkers:rematch_start", onRematchStart);
  track("damas:rematch_start", onRematchStart);

  track("damas_restart", (payload) => {
    if (!shouldHandlePayload(payload)) return;
    handlers.onRestart?.(payload);
  });

  track("damas_error", (payload) => {
    if (!shouldHandlePayload(payload)) return;
    handlers.onError?.(payload);
  });

  track("connect_error", (err) => {
    handlers.onConnectError?.(err);
  });

  function subscribe() {
    if (subscribed) return;
    subscribed = true;
    if (socket.connected) {
      handleConnect();
    }
  }

  function requestState(onResult) {
    if (!matchCode) return;
    socket.emit("game:get_state", { matchCode: matchCode, gameKey: "damas", email }, onResult);
  }

  function sendAction(action = {}) {
    socket.emit("damas_move", {
      codigo,
      email,
      from: action.from,
      to: action.to,
    });
  }

  function requestRematch() {
    socket.emit("checkers:rematch_request", {
      matchCode: codigo,
      codigo,
      email,
    });
  }

  function voteRematch(vote) {
    socket.emit("checkers:rematch_vote", {
      matchCode: codigo,
      codigo,
      email,
      vote,
    });
  }

  function requestRestart() {
    socket.emit("damas_restart", { codigo, email });
  }

  function dispose() {
    subscribed = false;
    clearTracked();
    clearResumeTimer();
  }

  return {
    socket,
    subscribe,
    requestState,
    sendAction,
    requestRematch,
    voteRematch,
    requestRestart,
    dispose,
  };
}
