const {
  createInitialState,
  applyAction,
  ACTION_TYPES,
  COLORS,
  getPlayableCards,
  getNextPlayerIndex,
  refillDeckFromDiscard,
} = require("./game/unoEngineMultiplayer");

const {
  createInitialState: createConnect4InitialState,
  applyAction: applyConnect4Action,
  ACTION_TYPES: CONNECT4_ACTION_TYPES,
} = require("./game/connect4EngineMultiplayer");

const {
  createInitialState: createCheckersInitialState,
  getLegalMoves: getCheckersLegalMoves,
  applyMove: applyCheckersMove,
  CheckersError,
} = require("./game/checkersEngine");

const { getBestMove: getBestConnect4Move } = require("./game/connect4_bot");
const { getBestMove: getBestCheckersMove } = require("./game/checkers_bot");
const logger = require("./logger");

const UNO_CALL_WINDOW_MS = (() => {
  const parsed = Number.parseInt(process.env.UNO_CALL_WINDOW_MS, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
})();

const BOT_THINK_MS = (() => {
  const parsed = Number.parseInt(process.env.BOT_THINK_MS, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 900;
})();

const BOT_TURN_BUDGET_MS = (() => {
  const parsed = Number.parseInt(process.env.BOT_TURN_BUDGET_MS, 10);
  return Number.isFinite(parsed) && parsed >= 50 ? parsed : 220;
})();

const BOT_TURN_DELAY_MIN_MS = (() => {
  const parsed = Number.parseInt(process.env.BOT_TURN_DELAY_MIN_MS, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 250;
})();

const BOT_TURN_DELAY_MAX_MS = (() => {
  const parsed = Number.parseInt(process.env.BOT_TURN_DELAY_MAX_MS, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 500;
})();

// Public-facing name sanitizer: never leak emails in UI payloads.
const looksLikeEmail = (value) => {
  const t = String(value || "").trim();
  return !!t && t.includes("@");
};

const safePublicName = (value, fallback) => {
  const t = String(value || "").trim();
  if (!t || looksLikeEmail(t)) return String(fallback || "Jugador");
  return t;
};

// Public stable userId (for lobby/UI): deterministic, NOT email, NOT socket.id.
const publicUserIdFromEmail = (email) => {
  const e = (email || "").toString().trim().toLowerCase();
  if (!e) return "";
  // djb2 (fast, deterministic). Not shown in UI; only used for identity comparisons.
  let hash = 5381;
  for (let i = 0; i < e.length; i += 1) {
    hash = ((hash << 5) + hash + e.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
};

// Public list payload: strip emails + keep only safe fields (used by lobby UI).
const sanitizeListaPartidasPublic = (lista) => {
  if (!Array.isArray(lista)) return [];
  return lista.map((p) => {
    const jugadoresCount = Array.isArray(p?.jugadores)
      ? p.jugadores.length
      : Number.isFinite(Number(p?.jugadores))
        ? Number(p.jugadores)
        : Number.isFinite(Number(p?.playersCount))
          ? Number(p.playersCount)
          : 0;
    const maxPlayersRaw = p?.maxPlayers ?? p?.maxJug ?? 2;
    const maxPlayers = Number.isFinite(Number(maxPlayersRaw)) ? Number(maxPlayersRaw) : 2;

    const ownerCandidate =
      p?.propietario ||
      (Array.isArray(p?.jugadores) && p.jugadores[0] ? p.jugadores[0].nick : "") ||
      "";

    const jugadoresArr = Array.isArray(p?.jugadores) ? p.jugadores : [];
    const hostUserId = publicUserIdFromEmail(
      p?.propietarioEmail || (jugadoresArr[0] && jugadoresArr[0].email) || ""
    );

    const players = jugadoresArr
      .map((j) => {
        const isBot = !!(j && (j.isBot || String(j.email || "").toLowerCase() === "bot@local"));
        return {
          userId: isBot ? "BOT" : publicUserIdFromEmail(j && j.email),
          displayName: safePublicName(j && (j.nick || j.displayName), isBot ? "Bot" : "Jugador"),
          isBot,
        };
      })
      .filter((pl) => !!pl.userId);

    const normalizedJuego = String(p?.juego ?? "uno").trim().toLowerCase();

    const started =
      String(p?.status || "").toUpperCase() === "STARTED" ||
      (p?.estado && p.estado !== "pendiente");

    const matchStatus =
      normalizedJuego === "4raya" || normalizedJuego === "damas" || normalizedJuego === "checkers"
        ? (started ? "IN_PROGRESS" : jugadoresCount >= maxPlayers ? "WAITING_START" : "WAITING")
        : null;

    return {
      codigo: p?.codigo,
      juego: p?.juego ?? "uno",
      status: p?.status ?? "OPEN",
      matchStatus,
      started,
      jugadores: jugadoresCount,
      numJugadores: jugadoresCount,
      maxPlayers,
      maxJug: maxPlayers,
      vsBot: !!p?.vsBot,
      mode: p?.mode ?? (p?.vsBot ? "PVBOT" : "PVP"),
      hostUserId,
      players,
      propietario: safePublicName(ownerCandidate, "Anfitrión"),
    };
  });
};

function ServidorWS() {
  let srv = this;
  let sistemaRef = null;
  const estadosUNO = {};
  const createUnoState = () => ({
    engine: null,
    humanIds: [],
    humanNames: [],
    socketToPlayerId: {},
    playerIdToSocketId: {},
  });
  const ensureUnoState = (codigo) => {
    if (!codigo) return null;
    let estado = estadosUNO[codigo];
    if (!estado) {
      estado = createUnoState();
      estadosUNO[codigo] = estado;
    } else {
      estado.socketToPlayerId ||= {};
      estado.playerIdToSocketId ||= {};
      estado.humanIds ||= [];
      estado.humanNames ||= [];
    }
    return estado;
  };
  const estados4raya = {};
  const estadosCheckers = {};
  const checkersRematchByCodigo = {};
  const CHECKERS_REMATCH_TIMEOUT_MS = 30000;
  const rematchVotes4raya = {};
  const socketTo4RayaPlayerId = {};
  const socketTo4RayaCodigo = {};
  const socketToCheckersPlayerId = {};
  const socketToCheckersCodigo = {};
  const botRunningByCodigo = {};
  const roomEmptyTimers = {};
  const ROOM_EMPTY_GRACE_MS = (() => {
    const parsed = Number.parseInt(process.env.ROOM_EMPTY_GRACE_MS, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 60000;
  })();
  const MATCH_PLAYER_GRACE_MS = (() => {
    const parsed = Number.parseInt(process.env.MATCH_PLAYER_GRACE_MS, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 90000;
  })();
  const matchPresenceByCodigo = new Map(); // codigo -> Map(playerId -> Set(socketId))
  const matchDisconnectTimers = new Map(); // `${codigo}::${playerId}` -> timeout
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const thinkMs = () => BOT_THINK_MS + Math.floor(Math.random() * 300);
  const botTurnDelayMs = () => {
    const min = Math.max(0, BOT_TURN_DELAY_MIN_MS);
    const max = Math.max(min, BOT_TURN_DELAY_MAX_MS);
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  const normalizePlayerId = (value) =>
    (value || "").toString().trim().toLowerCase();

  const getCheckersMatchPlayerUids = (partida) => {
    if (!partida) return [];
    const jugadores = Array.isArray(partida.jugadores) ? partida.jugadores : [];
    return jugadores
      .filter((j) => !!j && !j?.isBot)
      .map((j) => publicUserIdFromEmail(j?.email))
      .filter((id) => !!id);
  };

  const ensureCheckersRematchRecord = (codigo, partida) => {
    if (!codigo || !partida) return null;
    let rematch = checkersRematchByCodigo[codigo];
    if (!rematch) {
      rematch = {
        active: false,
        started: false,
        votes: new Set(),
        createdAt: null,
        timeout: null,
      };
      checkersRematchByCodigo[codigo] = rematch;
    }
    partida.rematch = rematch;
    return rematch;
  };

  const serializeCheckersRematch = (codigo, partida) => {
    const room = String(codigo || "").trim();
    const rematch = partida?.rematch;
    const voters = rematch?.votes ? Array.from(rematch.votes) : [];
    const requiredUids = getCheckersMatchPlayerUids(partida);
    const pending = requiredUids.filter((uid) => !voters.includes(uid));
    return {
      matchCode: room,
      codigo: room,
      active: !!rematch?.active,
      started: !!rematch?.started,
      createdAt: rematch?.createdAt || null,
      votesCount: voters.length,
      voters,
      required: requiredUids.length,
      pending,
    };
  };

  const emitCheckersRematchState = (io, codigo, partida, { socket = null } = {}) => {
    const payload = serializeCheckersRematch(codigo, partida);
    const target = socket ? socket : io.to(codigo);
    try {
      target.emit("checkers:rematch_state", payload);
      target.emit("damas:rematch_state", payload);
    } catch (e) {}
  };

  const ALLOWED_REACTION_EMOJIS = new Set([
    "\u{1F44D}", // 👍
    "\u{1F44E}", // 👎
    "\u{1F44F}", // 👏
    "\u{1F602}", // 😂
    "\u{1F62D}", // 😭
    "\u{1F62E}", // 😮
    "\u{1F624}", // 😤
    "\u{1F60E}", // 😎
    "\u{1F64F}", // 🙏
    "\u{1F91D}", // 🤝
    "\u{2764}\u{FE0F}", // ❤️
    "\u{1F480}", // 💀
    "\u{1F9E0}", // 🧠
    "\u{1F972}", // 🥲
  ]);

  /* const ALLOWED_REACTION_ICONS = new Set([
    "👍",
    "👎",
    "👏",
    "😂",
    "😭",
    "😮",
    "😤",
    "😎",
    "🙏",
    "🤝",
    "❤️",
    "💀",
    "🧠",
    "🥲",
  ]); */

  const pickDisplayName = (partida, playerId, fallback) => {
    if (!partida || !Array.isArray(partida.jugadores)) return safePublicName(fallback, "Jugador");
    const found = partida.jugadores.find(
      (j) => normalizePlayerId(j.email) === playerId
    );
    const nick = (found && typeof found.nick === "string" ? found.nick.trim() : "") || "";
    if (!nick) return safePublicName(fallback, "Jugador");
    return safePublicName(nick, fallback);
  };

  const emitMatchPlayerLeft = (io, { matchCode, gameKey, playerNick }, { excludeSocket = null } = {}) => {
    const codigo = String(matchCode || "").trim();
    if (!codigo) return;
    const payload = {
      matchCode: codigo,
      gameKey: String(gameKey || "").trim().toLowerCase() || null,
      playerNick: safePublicName(playerNick, "Jugador"),
      ts: Date.now(),
    };
    try {
      if (excludeSocket && typeof excludeSocket.to === "function") {
        excludeSocket.to(codigo).emit("match:player_left", payload);
      } else {
        io.to(codigo).emit("match:player_left", payload);
      }
    } catch (e) {
      // best-effort
    }
    // Also emit globally so the system UI can react even if it isn't joined to the room.
    try {
      io.emit("match:player_left", payload);
    } catch (e) {}

    // If Damas was waiting for a rematch confirmation, cancel it.
    try {
      const k = String(payload.gameKey || "").trim().toLowerCase();
      if (k === "damas" || k === "checkers") cancelCheckersRematch(io, codigo, "player_left");
    } catch (e) {}
  };

  const arraysEqual = (a, b) =>
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((v, i) => v === b[i]);

  const getRoomSize = (io, room) => {
    try {
      const set = io?.sockets?.adapter?.rooms?.get(room);
      return set && typeof set.size === "number" ? set.size : 0;
    } catch (e) {
      return 0;
    }
  };

  const isRoomEmpty = (io, codigo) => getRoomSize(io, codigo) === 0;

  const cancelRoomEmptyTimer = (codigo) => {
    const t = roomEmptyTimers[codigo];
    if (t) {
      clearTimeout(t);
      delete roomEmptyTimers[codigo];
    }
  };

  const isBotMatch = (partida) => {
    if (!partida) return false;
    if (partida.vsBot) return true;
    if (String(partida.mode || "").toUpperCase() === "PVBOT") return true;
    const jugadores = Array.isArray(partida.jugadores) ? partida.jugadores : [];
    return jugadores.some((j) => {
      const id = normalizePlayerId(j?.email);
      return id === "bot" || id.startsWith("bot@") || j?.isBot === true;
    });
  };

  const getMatchMaxPlayers = (partida) => {
    const raw = partida?.maxPlayers ?? partida?.maxJug ?? 2;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
  };

  const getMatchPlayersLen = (partida) =>
    Array.isArray(partida?.jugadores) ? partida.jugadores.length : 0;

  const getDerivedMatchStatus = (partida) => {
    if (!partida) return "WAITING";
    const started =
      String(partida?.status || "").toUpperCase() === "STARTED" ||
      (partida?.estado && partida.estado !== "pendiente");
    if (started) return "IN_PROGRESS";

    const gameKey = String(partida?.juego || "").trim().toLowerCase();
    if (gameKey !== "4raya" && gameKey !== "damas" && gameKey !== "checkers") return "WAITING";

    const maxPlayers = getMatchMaxPlayers(partida);
    const playersLen = getMatchPlayersLen(partida);
    if (playersLen >= maxPlayers) return "WAITING_START";
    return "WAITING";
  };

  const emitMatchUpdate = (io, codigo, partida) => {
    const room = String(codigo || "").trim();
    if (!room || !partida) return;
    const gameKey = String(partida.juego || "").trim().toLowerCase() || null;
    const playersLen = getMatchPlayersLen(partida);
    const maxPlayers = getMatchMaxPlayers(partida);
    const matchStatus = getDerivedMatchStatus(partida);
    try {
      io.to(room).emit("match:update", {
        matchCode: room,
        gameKey,
        status: matchStatus,
        playersCount: playersLen,
        maxPlayers,
        creatorNick: safePublicName(partida.propietario, "Anfitri▋"),
        ts: Date.now(),
      });
    } catch (e) {}
  };

  const emitMatchPlayerDisconnected = (io, { matchCode, gameKey, playerNick }) => {
    const codigo = String(matchCode || "").trim();
    if (!codigo) return;
    const payload = {
      matchCode: codigo,
      gameKey: String(gameKey || "").trim().toLowerCase() || null,
      playerNick: safePublicName(playerNick, "Jugador"),
      ts: Date.now(),
    };
    try {
      io.to(codigo).emit("match:player_disconnected", payload);
    } catch (e) {
      // best-effort
    }
    // Also emit globally so the system UI can react even if it isn't joined to the room.
    try {
      io.emit("match:player_disconnected", payload);
    } catch (e) {}

    // If Damas was waiting for a rematch confirmation, cancel it.
    try {
      const k = String(payload.gameKey || "").trim().toLowerCase();
      if (k === "damas" || k === "checkers") cancelCheckersRematch(io, codigo, "player_disconnected");
    } catch (e) {}
  };

  const getConnectedCount = (codigo) => {
    const room = String(codigo || "").trim();
    if (!room) return 0;
    const byPlayer = matchPresenceByCodigo.get(room);
    if (!byPlayer) return 0;
    let n = 0;
    for (const set of byPlayer.values()) {
      if (set && typeof set.size === "number") n += set.size > 0 ? 1 : 0;
    }
    return n;
  };

  const emitMatchEnded = (io, { matchCode, gameKey, reason = "ENDED" }) => {
    const codigo = String(matchCode || "").trim();
    if (!codigo) return;
    const payload = {
      matchCode: codigo,
      gameKey: String(gameKey || "").trim().toLowerCase() || null,
      reason: String(reason || "ENDED"),
      ts: Date.now(),
    };
    try { io.to(codigo).emit("match:ended", payload); } catch (e) {}
    try { io.emit("match:ended", payload); } catch (e) {}
  };

  const cancelCheckersRematch = (io, codigo, reason = "CANCELLED") => {
    const room = String(codigo || "").trim();
    if (!room) return;
    const partida = sistema?.partidas?.[room] || null;
    const rematch = ensureCheckersRematchRecord(room, partida);
    if (!rematch) return;
    try {
      if (rematch.timeout) clearTimeout(rematch.timeout);
    } catch (e) {}
    rematch.timeout = null;
    rematch.active = false;
    rematch.started = false;
    rematch.votes = new Set();
    rematch.createdAt = null;
    if (partida) partida.rematch = rematch;
    try {
      const payload = {
        ...serializeCheckersRematch(room, partida),
        reason: String(reason || "CANCELLED"),
      };
      io.to(room).emit("checkers:rematch_cancelled", payload);
      io.to(room).emit("damas:rematch_cancelled", payload);
    } catch (e) {}
  };

  const destroyMatch = (io, sistema, codigo, { reason = "EMPTY" } = {}) => {
    const room = String(codigo || "").trim();
    if (!room) return false;
    const partida = sistema?.partidas?.[room] || null;
    const gameKey = partida?.juego || null;
    if (!partida) return false;

    try {
      delete sistema.partidas[room];
    } catch (e) {}
    try {
      cleanupCodigoState(io, room);
    } catch (e) {}
    try {
      cancelRoomEmptyTimer(room);
    } catch (e) {}

    emitMatchEnded(io, { matchCode: room, gameKey, reason });

    if (String(gameKey || "").trim().toLowerCase() === "damas" || String(gameKey || "").trim().toLowerCase() === "checkers") {
      cancelCheckersRematch(io, room, "match_ended");
    }

    // Refresh lobby list (best-effort).
    try {
      const lista = sistema.obtenerPartidasDisponibles(gameKey);
      srv.enviarGlobal(io, "listaPartidas", sanitizeListaPartidasPublic(lista));
    } catch (e) {}
    return true;
  };

  const shouldDestroyImmediatelyWhenEmpty = (partida) => {
    const gameKey = String(partida?.juego || "").trim().toLowerCase();
    return gameKey === "4raya" || gameKey === "damas" || gameKey === "checkers";
  };

  const presenceKey = (codigo, playerId) => `${String(codigo || "").trim()}::${String(playerId || "").trim()}`;

  const cancelDisconnectTimer = (codigo, playerId) => {
    const key = presenceKey(codigo, playerId);
    const t = matchDisconnectTimers.get(key);
    if (t) {
      clearTimeout(t);
      matchDisconnectTimers.delete(key);
    }
  };

  const trackMatchPresence = (codigo, email, socket) => {
    const room = String(codigo || "").trim();
    const playerId = normalizePlayerId(email);
    if (!room || !playerId || !socket) return;

    let byPlayer = matchPresenceByCodigo.get(room);
    if (!byPlayer) {
      byPlayer = new Map();
      matchPresenceByCodigo.set(room, byPlayer);
    }

    let sockets = byPlayer.get(playerId);
    if (!sockets) {
      sockets = new Set();
      byPlayer.set(playerId, sockets);
    }
    sockets.add(socket.id);

    try {
      if (!socket.data) socket.data = {};
      if (!socket.data.matchPresenceKeys) socket.data.matchPresenceKeys = new Set();
      socket.data.matchPresenceKeys.add(presenceKey(room, playerId));
      socket.data.email = normalizePlayerId(email);
    } catch (e) {}

    cancelDisconnectTimer(room, playerId);
  };

  const untrackSocketFromMatchPresence = (codigo, email, socket) => {
    const room = String(codigo || "").trim();
    const playerId = normalizePlayerId(email);
    if (!room || !playerId || !socket) return;

    const byPlayer = matchPresenceByCodigo.get(room);
    const sockets = byPlayer ? byPlayer.get(playerId) : null;
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        byPlayer.delete(playerId);
        if (byPlayer.size === 0) matchPresenceByCodigo.delete(room);
      }
    }

    cancelDisconnectTimer(room, playerId);
    try {
      socket.data?.matchPresenceKeys?.delete?.(presenceKey(room, playerId));
    } catch (e) {}
  };

  const scheduleRemovePlayerIfStillDisconnected = (io, sistema, codigo, playerId) => {
    const room = String(codigo || "").trim();
    const pid = String(playerId || "").trim().toLowerCase();
    if (!room || !pid) return;

    const key = presenceKey(room, pid);
    if (matchDisconnectTimers.has(key)) return;

    const partidaNow = sistema.partidas?.[room] || null;
    if (!partidaNow || isBotMatch(partidaNow)) return;

    // If nobody is connected anymore, end the match immediately (platform UX requirement).
    if (getConnectedCount(room) <= 0 && shouldDestroyImmediatelyWhenEmpty(partidaNow)) {
      destroyMatch(io, sistema, room, { reason: "EMPTY" });
      return;
    }

    emitMatchPlayerDisconnected(io, {
      matchCode: room,
      gameKey: partidaNow.juego,
      playerNick: pickDisplayName(partidaNow, pid, "Jugador"),
    });

    const t = setTimeout(() => {
      matchDisconnectTimers.delete(key);

      const partida = sistema.partidas?.[room] || null;
      if (!partida || isBotMatch(partida)) return;

      const stillConnected =
        matchPresenceByCodigo.get(room)?.get(pid)?.size > 0;
      if (stillConnected) return;

      const jugador = Array.isArray(partida.jugadores)
        ? partida.jugadores.find((j) => normalizePlayerId(j?.email) === pid)
        : null;
      if (!jugador || !jugador.email) return;

      const playerNick = pickDisplayName(partida, pid, "Jugador");
      const gameKey = partida.juego || null;

      try {
        if (typeof sistema.removerJugadorPorDesconexion === "function") {
          sistema.removerJugadorPorDesconexion(jugador.email, room);
        } else {
          sistema.eliminarPartida(jugador.email, room);
        }
      } catch (e) {}

      emitMatchPlayerLeft(io, { matchCode: room, gameKey, playerNick });

      // If the match became empty (no connected players), destroy it.
      try {
        const partidaAfter = sistema.partidas?.[room] || null;
        if (!partidaAfter) {
          destroyMatch(io, sistema, room, { reason: "EMPTY" });
          return;
        }
        if (getConnectedCount(room) <= 0 && shouldDestroyImmediatelyWhenEmpty(partidaAfter)) {
          destroyMatch(io, sistema, room, { reason: "EMPTY" });
          return;
        }
      } catch (e) {}

      try {
        if (!sistema.partidas?.[room]) {
          cleanupCodigoState(io, room);
        }
      } catch (e) {}

      // Refresh lobby list (best-effort).
      try {
        const lista = sistema.obtenerPartidasDisponibles(gameKey);
        srv.enviarGlobal(io, "listaPartidas", sanitizeListaPartidasPublic(lista));
      } catch (e) {}
    }, MATCH_PLAYER_GRACE_MS);

    matchDisconnectTimers.set(key, t);
  };

  const handleSocketDisconnectPresence = (io, sistema, socket) => {
    const keys = socket?.data?.matchPresenceKeys;
    if (!keys || typeof keys.forEach !== "function") return;

    const keysArr = Array.from(keys);
    for (const key of keysArr) {
      const parts = String(key || "").split("::");
      if (parts.length < 2) continue;
      const room = String(parts[0] || "").trim();
      const pid = String(parts.slice(1).join("::") || "").trim().toLowerCase();
      if (!room || !pid) continue;

      const byPlayer = matchPresenceByCodigo.get(room);
      const sockets = byPlayer ? byPlayer.get(pid) : null;
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          byPlayer.delete(pid);
          if (byPlayer.size === 0) matchPresenceByCodigo.delete(room);

          const partidaNow = sistema.partidas?.[room] || null;
          if (partidaNow && shouldDestroyImmediatelyWhenEmpty(partidaNow) && getConnectedCount(room) <= 0) {
            destroyMatch(io, sistema, room, { reason: "EMPTY" });
            continue;
          }

          scheduleRemovePlayerIfStillDisconnected(io, sistema, room, pid);
        }
      }
    }
  };

  const cleanupCodigoState = (io, codigo) => {
    if (codigo && estadosUNO[codigo]) {
      try {
        clearAllUnoDeadlines(io, codigo, estadosUNO[codigo]);
      } catch (e) {}
      delete estadosUNO[codigo];
    }
    if (codigo && estados4raya[codigo]) {
      delete estados4raya[codigo];
    }
    if (codigo && rematchVotes4raya[codigo]) {
      delete rematchVotes4raya[codigo];
    }
    if (codigo && estadosCheckers[codigo]) {
      delete estadosCheckers[codigo];
    }
    if (codigo && botRunningByCodigo[codigo]) {
      delete botRunningByCodigo[codigo];
    }
  };

  const scheduleDeleteIfStillEmpty = (io, sistema, codigo) => {
    if (!codigo) return;
    if (roomEmptyTimers[codigo]) return;
    const partida = sistema?.partidas?.[codigo];
    if (!partida) return;

    roomEmptyTimers[codigo] = setTimeout(() => {
      try {
        delete roomEmptyTimers[codigo];
        if (!isRoomEmpty(io, codigo)) return;

        const partidaNow = sistema?.partidas?.[codigo];
        if (!partidaNow) return;

        logger.debug("[RESUME] deleting empty match after grace", {
          codigo,
          juego: partidaNow.juego,
          graceMs: ROOM_EMPTY_GRACE_MS,
        });

        delete sistema.partidas[codigo];
        cleanupCodigoState(io, codigo);

        const lista = sistema.obtenerPartidasDisponibles(partidaNow.juego);
        srv.enviarGlobal(io, "listaPartidas", sanitizeListaPartidasPublic(lista));
      } catch (e) {
        logger.warn("[RESUME] error deleting empty match:", e?.message || e);
      }
    }, ROOM_EMPTY_GRACE_MS);
  };

  const chooseBotColor = (engine, botIndex = 1) => {
    const hand = engine?.players?.[botIndex]?.hand || [];
    const counts = { red: 0, green: 0, blue: 0, yellow: 0 };
    for (const card of hand) {
      if (COLORS.includes(card.color)) counts[card.color]++;
    }
    let bestColor = "red";
    let bestCount = -1;
    for (const color of COLORS) {
      if (counts[color] > bestCount) {
        bestCount = counts[color];
        bestColor = color;
      }
    }
    return bestColor;
  };

  const BOT_WILD_VALUES = new Set(['wild', '+4', 'swap', 'discard_all', 'skip_all']);

  const getBotIndexes = (engine, datosUNO) => {
    if (!engine || !engine.hasBot) return [];
    const n = Array.isArray(engine.players) ? engine.players.length : 0;
    if (n === 0) return [];

    const numHuman =
      Number.isFinite(engine.numHumanPlayers) && engine.numHumanPlayers > 0
        ? engine.numHumanPlayers
        : Array.isArray(datosUNO?.humanIds) && datosUNO.humanIds.length > 0
          ? datosUNO.humanIds.length
          : Math.max(n - 1, 1);

    const out = [];
    for (let i = numHuman; i < n; i++) out.push(i);
    return out;
  };

  const ensureLastCardAnnouncementForBots = (io, codigo, datosUNO, engine) => {
    if (!engine || engine.status !== "playing") return engine;

    let updated = engine;
    for (const botIndex of getBotIndexes(updated, datosUNO)) {
      const bot = updated.players?.[botIndex];
      if (!bot) continue;
      const handLen = Array.isArray(bot.hand) ? bot.hand.length : 0;

      if (handLen === 1) {
        if (bot.hasCalledUno) continue;

        const prevLastAction = updated.lastAction ? { ...updated.lastAction } : null;
        const next = applyAction(updated, {
          type: ACTION_TYPES.CALL_UNO,
          playerIndex: botIndex,
          meta: { source: "BOT", reason: "autoUno" },
        });
        if (prevLastAction) next.lastAction = prevLastAction;
        updated = next;

        clearUnoDeadline(io, codigo, datosUNO, bot.id, { emit: false });
        io.to(codigo).emit("uno:uno_called", {
          codigo,
          playerId: bot.id,
          atTs: Date.now(),
          auto: true,
        });
        continue;
      }

      if (handLen !== 1 && bot.hasCalledUno) {
        updated = {
          ...updated,
          players: (updated.players || []).map((p, idx) =>
            idx === botIndex ? { ...p, hasCalledUno: false } : p,
          ),
        };
      }
    }

    return updated;
  };

  const deriveActionEffectFromCard = (card, byPlayerId) => {
    if (!card) return null;
    if (card.value === "+2") return { type: "+2", value: 2, byPlayerId };
    if (card.value === "+4") return { type: "+4", value: 4, color: card.color, byPlayerId };
    if (card.value === "+6") return { type: "+6", value: 6, color: card.color, byPlayerId };
    if (card.value === "+8") return { type: "+8", value: 8, color: card.color, byPlayerId };
    if (card.value === "skip") return { type: "SKIP", byPlayerId };
    if (card.value === "skip_all") return { type: "SKIP_ALL", color: card.color, byPlayerId };
    if (card.value === "reverse") return { type: "REVERSE", byPlayerId };
    if (card.value === "wild") return { type: "WILD", color: card.color, byPlayerId };
    if (card.value === "swap") return { type: "SWAP", color: card.color, byPlayerId };
    if (card.value === "discard_all") return { type: "DISCARD_ALL", color: card.color, byPlayerId };
    if (card.value === "double") return { type: "DOUBLE", byPlayerId };
    return null;
  };

  const emitReshuffleIfNeeded = (io, codigo, prevReshuffleSeq, engine) => {
    const prev = Number.isFinite(prevReshuffleSeq) ? prevReshuffleSeq : 0;
    const next = Number.isFinite(engine?.reshuffleSeq) ? engine.reshuffleSeq : 0;
    if (next <= prev) return next;
    const movedCount =
      typeof engine?.lastReshuffle?.movedCount === "number" ? engine.lastReshuffle.movedCount : null;
    const top =
      engine?.discardPile?.[(engine?.discardPile?.length ?? 1) - 1] ?? null;
    io.to(codigo).emit("uno_deck_reshuffle", {
      codigo,
      movedCount: movedCount ?? 0,
      remainingDiscardTop: top,
      timestamp: Date.now(),
      seq: next,
    });
    return next;
  };

  const runBotTurnLoop = async (io, codigo, datosUNO) => {
    if (!io || !codigo || !datosUNO?.engine?.hasBot) return;
    if (botRunningByCodigo[codigo]) return;
    botRunningByCodigo[codigo] = true;

    try {
      let safety = 0;
      let prevReshuffleSeq = Number.isFinite(datosUNO.engine?.reshuffleSeq)
        ? datosUNO.engine.reshuffleSeq
        : 0;

      while (
        datosUNO.engine?.status === "playing" &&
        datosUNO.engine?.currentPlayerIndex === 1 &&
        safety < 25
      ) {
        safety++;
        await sleep(thinkMs());

        let updated = datosUNO.engine;
        const canDraw = updated.drawPile.length > 0 || updated.discardPile.length > 1;
        const playable = getPlayableCards(updated, 1);

        if (playable.length === 0) {
          if (!canDraw) {
            // Sin jugadas posibles y sin mazo: pasar turno (y consumir doublePlay si toca).
            if (updated.doublePlay && updated.doublePlay.playerIndex === 1 && updated.doublePlay.remaining === 0) {
              updated = applyAction(updated, {
                type: ACTION_TYPES.PASS_TURN,
                playerIndex: 1,
                meta: { source: "BOT", reason: "botLogic" },
              });
            } else {
              updated = { ...updated, currentPlayerIndex: getNextPlayerIndex(updated, 1, 1) };
            }
          } else {
            updated = applyAction(updated, {
              type: ACTION_TYPES.DRAW_CARD,
              playerIndex: 1,
              meta: { source: "BOT", reason: "botLogic" },
            });
          }

          updated = ensureLastCardAnnouncementForBots(io, codigo, datosUNO, updated);
          datosUNO.engine = updated;
          prevReshuffleSeq = emitReshuffleIfNeeded(io, codigo, prevReshuffleSeq, updated);
          syncUnoDeadlinesFromEngine(io, codigo, datosUNO);
          await emitirEstadoUNO(io, codigo, datosUNO);
          continue;
        }

        const card = playable[0];
        const needsColor = BOT_WILD_VALUES.has(card.value);
        const needsTarget = card.value === "swap";
        const chosenTargetId = needsTarget
          ? (() => {
              const candidates = (updated.players || []).map((p, idx) => ({
                idx,
                id: p?.id ?? null,
                handCount: p?.hand?.length ?? 0,
              }));
              const others = candidates.filter((c) => c.idx !== 1 && c.id != null);
              if (others.length === 0) return null;
              const best = others.reduce((acc, cur) => (cur.handCount < acc.handCount ? cur : acc));
              return best.id;
            })()
          : null;

        updated = applyAction(updated, {
          type: ACTION_TYPES.PLAY_CARD,
          playerIndex: 1,
          cardId: card.id,
          ...(needsColor ? { chosenColor: chooseBotColor(updated, 1) } : {}),
          ...(chosenTargetId != null ? { chosenTargetId } : {}),
          meta: { source: "BOT", reason: "botLogic" },
        });
        updated = ensureLastCardAnnouncementForBots(io, codigo, datosUNO, updated);

        datosUNO.engine = updated;
        prevReshuffleSeq = emitReshuffleIfNeeded(io, codigo, prevReshuffleSeq, updated);

        const byPlayerId = updated.players?.[1]?.id ?? 1;
        const effect = deriveActionEffectFromCard(updated.lastAction?.card, byPlayerId);
        if (effect) io.to(codigo).emit("uno:action_effect", { codigo, ...effect });

        syncUnoDeadlinesFromEngine(io, codigo, datosUNO);
        await emitirEstadoUNO(io, codigo, datosUNO);
      }
    } catch (e) {
      logger.warn("[UNO] error en bot loop", codigo, e?.message || e);
    } finally {
      botRunningByCodigo[codigo] = false;
    }
  };

  const getBotUserFromPartida = (partida) => {
    const players = Array.isArray(partida?.jugadores) ? partida.jugadores : [];
    return (
      players.find(
        (p) =>
          p &&
          (p.isBot === true ||
            normalizePlayerId(p.email) === "bot" ||
            normalizePlayerId(p.email).startsWith("bot@")),
      ) || null
    );
  };

  const maybeBotMoveConnect4 = async (io, codigo) => {
    if (!io || !codigo) return;
    if (botRunningByCodigo[codigo]) return;

    const partida = sistemaRef?.partidas?.[codigo];
    if (!partida || partida.juego !== "4raya" || partida.mode !== "PVBOT") return;

    const datos4Raya = estados4raya[codigo];
    const engine = datos4Raya?.engine;
    if (!engine || engine.status !== "playing") return;

    const botUser = getBotUserFromPartida(partida);
    const botPlayerId = botUser ? normalizePlayerId(botUser.email) : "bot";
    const botStableId = `bot:${codigo}`;
    const botIndex = (engine.players || []).findIndex(
      (p) =>
        normalizePlayerId(p?.id) === botPlayerId ||
        String(p?.id || "").trim().toLowerCase() === botStableId,
    );
    if (botIndex !== engine.currentPlayerIndex) return;

    botRunningByCodigo[codigo] = true;
    try {
      await sleep(botTurnDelayMs());

      const latest = estados4raya[codigo]?.engine;
      if (!latest || latest.status !== "playing") return;
      if (latest.currentPlayerIndex !== botIndex) return;

      const botId = latest.players?.[botIndex]?.id ?? botPlayerId;
      const best = getBestConnect4Move(latest, botId, BOT_TURN_BUDGET_MS);
      const col = best && Number.isFinite(best.col) ? Math.trunc(best.col) : null;
      if (col == null || col < 0 || col > 6) return;

      estados4raya[codigo].engine = applyConnect4Action(latest, {
        type: CONNECT4_ACTION_TYPES.PLACE_TOKEN,
        column: col,
        playerIndex: botIndex,
      });

      emitirEstado4Raya(io, codigo, estados4raya[codigo]);
    } catch (e) {
      logger.warn("[4RAYA][BOT] error", codigo, e?.message || e);
    } finally {
      botRunningByCodigo[codigo] = false;
    }
  };

  const maybeBotMoveCheckers = async (io, codigo) => {
    if (!io || !codigo) return;
    if (botRunningByCodigo[codigo]) return;

    const partida = sistemaRef?.partidas?.[codigo];
    if (!partida || (partida.juego !== "damas" && partida.juego !== "checkers")) return;
    if (partida.mode !== "PVBOT") return;

    const datosCheckers = estadosCheckers[codigo];
    const state = datosCheckers?.state;
    if (!state || state.status !== "playing") return;

    const botUser = getBotUserFromPartida(partida);
    const botPlayerId = botUser ? normalizePlayerId(botUser.email) : "bot";
    const players = Array.isArray(datosCheckers?.players) ? datosCheckers.players : [];
    const botStableId = `bot:${codigo}`;
    const botPlayer =
      players.find(
        (p) =>
          normalizePlayerId(p?.id) === botPlayerId ||
          String(p?.id || "").trim().toLowerCase() === botStableId,
      ) || null;
    const botColor = botPlayer?.color === "white" || botPlayer?.color === "black" ? botPlayer.color : "black";
    if (state.currentPlayer !== botColor) return;

    botRunningByCodigo[codigo] = true;
    try {
      await sleep(botTurnDelayMs());

      const latest = estadosCheckers[codigo]?.state;
      const latestPlayers = Array.isArray(estadosCheckers[codigo]?.players)
        ? estadosCheckers[codigo].players
        : players;
      if (!latest || latest.status !== "playing") return;
      if (latest.currentPlayer !== botColor) return;
      if (!latestPlayers.find((p) => p?.color === botColor)) return;

      const best = getBestCheckersMove(latest, botColor, BOT_TURN_BUDGET_MS);
      const steps = Array.isArray(best?.steps) ? best.steps : null;
      if (!steps || steps.length === 0) return;

      let updated = latest;
      for (const step of steps) {
        updated = applyCheckersMove(updated, {
          player: botColor,
          from: step.from,
          to: step.to,
        });
      }

      estadosCheckers[codigo].state = updated;
      emitirEstadoCheckers(io, codigo, estadosCheckers[codigo]);
    } catch (e) {
      logger.warn("[CHECKERS][BOT] error", codigo, e?.message || e);
    } finally {
      botRunningByCodigo[codigo] = false;
    }
  };

  const rotateEngineForViewer = (engine, viewerIndex) => {
    if (!engine || !Array.isArray(engine.players) || engine.players.length < 2) {
      return engine;
    }
    const n = engine.players.length;
    const shift = ((viewerIndex % n) + n) % n;
    if (shift === 0) return engine;

    const rotateIndex = (idx) => (idx == null ? idx : (idx - shift + n) % n);
    const rotateIndexes = (arr) =>
      Array.isArray(arr) ? arr.map((idx) => rotateIndex(idx)).filter((v) => v != null) : arr;
    const players = engine.players
      .slice(shift)
      .concat(engine.players.slice(0, shift));

    return {
      ...engine,
      players,
      currentPlayerIndex: rotateIndex(engine.currentPlayerIndex),
      winnerIndex: rotateIndex(engine.winnerIndex),
      winnerIndexes: rotateIndexes(engine.winnerIndexes),
      loserIndexes: rotateIndexes(engine.loserIndexes),
      lastAction: engine.lastAction
        ? {
            ...engine.lastAction,
            playerIndex: rotateIndex(engine.lastAction.playerIndex),
            triggeredBy: rotateIndex(engine.lastAction.triggeredBy),
          }
        : null,
      doublePlay: engine.doublePlay
        ? { ...engine.doublePlay, playerIndex: rotateIndex(engine.doublePlay.playerIndex) }
        : null,
    };
  };

  const emitirEstadoUNO = async (io, codigo, datosUNO) => {
    if (!datosUNO || !datosUNO.engine) return;
    try {
      const sockets = await io.in(codigo).fetchSockets();
      const connectedHumanIds = new Set();
      for (const s of sockets) {
        const humanId = datosUNO.socketToPlayerId?.[s.id];
        if (humanId) connectedHumanIds.add(humanId);
      }

      const sanitizeEngineForViewer = (engineView) => {
        const drawCount = engineView?.drawPile?.length ?? 0;
        const safePlayers = (engineView?.players || []).map((p, idx) => {
          const handCount = p?.hand?.length ?? 0;
          const base = {
            id: p?.id,
            name: p?.name,
            handCount,
            hasCalledUno: !!p?.hasCalledUno,
          };
          if (idx === 0) return { ...base, hand: p?.hand || [] };
          return base;
        });

        const { gameLog, logSeq, ...rest } = engineView || {};
        return {
          ...rest,
          players: safePlayers,
          drawPile: Array.from({ length: drawCount }),
        };
      };

      const buildPayloadForEngineSafe = (engineSafe) => {
        const playersPublic = (engineSafe.players || []).map((p) => {
          const rawId = p?.id;
          const humanIdForPlayer =
            typeof rawId === "number" && Array.isArray(datosUNO.humanIds)
              ? datosUNO.humanIds[rawId]
              : null;
          const isBot =
            !!engineSafe.hasBot &&
            (humanIdForPlayer == null || humanIdForPlayer === undefined);
          const isConnected = isBot
            ? true
            : !!(humanIdForPlayer && connectedHumanIds.has(humanIdForPlayer));

          return {
            playerId: rawId == null ? "" : String(rawId),
            nick: p?.name ?? "Jugador",
            handCount:
              typeof p?.handCount === "number"
                ? p.handCount
                : Array.isArray(p?.hand)
                  ? p.hand.length
                  : 0,
            isBot,
            hasSaidUno: !!p?.hasCalledUno,
            isConnected,
          };
        });

          const players = playersPublic.map(({ playerId, nick, handCount }) => ({
            id: playerId,
            name: nick,
            handCount,
          }));

          const turnPlayerIdRaw =
            engineSafe.players?.[engineSafe.currentPlayerIndex]?.id ?? null;
          const turnPlayerId = turnPlayerIdRaw == null ? "" : String(turnPlayerIdRaw);
          const playerOrder = (engineSafe.players || []).map((p) =>
            p?.id == null ? "" : String(p.id),
          );

          if (process.env.UNO_DEBUG_PUBLIC === "1") {
            logger.debug(
              "[UNO] payload public",
              playersPublic.map((p) => `${p.nick}:${p.handCount}`),
              "turn",
              turnPlayerId,
              "dir",
              engineSafe.direction,
            );
          }

          return {
            codigo,
            meId: engineSafe.players?.[0]?.id == null ? "" : String(engineSafe.players[0].id),
            myPlayerId: engineSafe.players?.[0]?.id ?? null,
            players,
            playersPublic,
            myHand: engineSafe.players?.[0]?.hand || [],
            turnIndex: engineSafe.currentPlayerIndex,
            turnPlayerId,
            playerOrder,
            direction: engineSafe.direction,
            engine: engineSafe,
          };
        };

      for (const s of sockets) {
        const playerId = datosUNO.socketToPlayerId?.[s.id];
        const canonicalIndex = playerId
          ? datosUNO.humanIds.indexOf(playerId)
          : 0;
        const engineView =
          canonicalIndex > 0
            ? rotateEngineForViewer(datosUNO.engine, canonicalIndex)
            : datosUNO.engine;
        const engineSafe = sanitizeEngineForViewer(engineView);
        const payload = buildPayloadForEngineSafe(engineSafe);

        s.emit("uno:estado", payload);
        s.emit("uno_state", payload);
      }
    } catch (e) {
      const drawCount = datosUNO.engine?.drawPile?.length ?? 0;
      const safePlayers = (datosUNO.engine?.players || []).map((p) => ({
        id: p?.id,
        name: p?.name,
        handCount: p?.hand?.length ?? 0,
        hasCalledUno: !!p?.hasCalledUno,
      }));
      const { gameLog, logSeq, ...engineRest } = datosUNO.engine || {};
      const engineSafe = {
        ...engineRest,
        players: safePlayers,
        drawPile: Array.from({ length: drawCount }),
      };

      const playersPublic = safePlayers.map((p) => ({
        playerId: p?.id == null ? "" : String(p.id),
        nick: p?.name ?? "Jugador",
        handCount:
          typeof p?.handCount === "number"
            ? p.handCount
            : Array.isArray(p?.hand)
              ? p.hand.length
              : 0,
        isBot: !!engineSafe.hasBot && p?.id === 1,
        hasSaidUno: !!p?.hasCalledUno,
        isConnected: null,
      }));

      const turnPlayerIdRaw =
        engineSafe.players?.[engineSafe.currentPlayerIndex]?.id ?? null;
      const playerOrder = (engineSafe.players || []).map((p) =>
        p?.id == null ? "" : String(p.id),
      );

      const payload = {
        codigo,
        meId: "",
        myPlayerId: null,
        players: safePlayers.map(({ id, name, handCount }) => ({ id, name, handCount })),
        playersPublic,
        myHand: [],
        turnIndex: engineSafe.currentPlayerIndex,
        turnPlayerId: turnPlayerIdRaw == null ? "" : String(turnPlayerIdRaw),
        playerOrder,
        direction: engineSafe.direction,
        engine: engineSafe,
      };

      io.to(codigo).emit("uno:estado", payload);
      io.to(codigo).emit("uno_state", payload);
    }
  };

  const emitirEstado4Raya = (io, codigo, datos4Raya, { socket = null } = {}) => {
    const engine = datos4Raya?.engine ?? null;
    if (!engine) return;

    const target = socket ? socket : io.to(codigo);

    target.emit("4raya:estado", {
      codigo,
      engine,
    });

    try {
      target.emit("game:state", {
        matchCode: codigo,
        gameKey: "4raya",
        state: engine,
      });
      if (!socket) logger.debug("[EMIT STATE] 4raya", codigo);
    } catch (e) {}
  };

  const buildConnect4PlayersFromPartida = (partida, codigo) => {
    const raw = Array.isArray(partida?.jugadores) ? partida.jugadores.slice(0, 2) : [];
    return raw
      .map((j, idx) => {
        const isBot =
          !!(j && (j.isBot === true || normalizePlayerId(j.email) === "bot@local"));
        const id = isBot ? `bot:${codigo}` : publicUserIdFromEmail(j?.email);
        if (!id) return null;
        const fallbackName = idx === 0 ? "Jugador 1" : "Jugador 2";
        const name = isBot ? "Bot" : safePublicName(j?.nick, fallbackName);
        return { id, name };
      })
      .filter(Boolean);
  };

  const initConnect4State = (codigo, partida, { reason = "" } = {}) => {
    if (!codigo || !partida) return null;
    const players = buildConnect4PlayersFromPartida(partida, codigo);
    estados4raya[codigo] = {
      engine: createConnect4InitialState({ players }),
    };
    logger.debug(
      "[INIT] 4raya",
      codigo,
      "players=" + players.length,
      "mode=" + String(partida.mode || "PVP"),
      reason ? "reason=" + reason : "",
    );
    return estados4raya[codigo];
  };

  const ensureConnect4State = (codigo, partida, { reason = "" } = {}) => {
    if (!codigo || !partida) return null;
    const started =
      String(partida?.status || "").toUpperCase() === "STARTED" ||
      (partida?.estado && partida.estado !== "pendiente");
    if (!started && !isBotMatch(partida)) return null;

    if (!estados4raya[codigo] || !estados4raya[codigo].engine) {
      return initConnect4State(codigo, partida, { reason: reason || "ensure" });
    }

    const datos4Raya = estados4raya[codigo];
    const engine = datos4Raya.engine;
    const desiredPlayers = buildConnect4PlayersFromPartida(partida, codigo);

    if (engine && Array.isArray(engine.players) && engine.players.length >= 2) {
      const nextPlayers = engine.players.slice(0, 2).map((p, idx) => {
        const desired = desiredPlayers[idx];
        if (!desired) return p;
        return { ...p, id: desired.id ?? p.id, name: desired.name ?? p.name };
      });
      datos4Raya.engine = { ...engine, players: nextPlayers };
    }

    return datos4Raya;
  };

  const buildCheckersPlayersFromPartida = (partida, codigo) => {
    const raw = Array.isArray(partida?.jugadores) ? partida.jugadores.slice(0, 2) : [];
    return raw
      .map((j, idx) => {
        const isBot =
          !!(j && (j.isBot === true || normalizePlayerId(j.email) === "bot@local"));
        const id = isBot ? `bot:${codigo}` : publicUserIdFromEmail(j?.email);
        if (!id) return null;
        const fallbackName = idx === 0 ? "Jugador 1" : "Jugador 2";
        const name = isBot ? "Bot" : safePublicName(j?.nick, fallbackName);
        return {
          color: idx === 0 ? "white" : "black",
          id,
          name,
        };
      })
      .filter(Boolean);
  };

  const initCheckersState = (codigo, partida, { reason = "" } = {}) => {
    if (!codigo || !partida) return null;
    const players = buildCheckersPlayersFromPartida(partida, codigo);
    estadosCheckers[codigo] = {
      state: createCheckersInitialState(),
      players,
    };
    logger.debug(
      "[INIT]",
      String(partida.juego || "damas"),
      codigo,
      "players=" + players.length,
      "mode=" + String(partida.mode || "PVP"),
      reason ? "reason=" + reason : "",
    );
    return estadosCheckers[codigo];
  };

  const ensureCheckersState = (codigo, partida, { reason = "" } = {}) => {
    if (!codigo || !partida) return null;
    const started =
      String(partida?.status || "").toUpperCase() === "STARTED" ||
      (partida?.estado && partida.estado !== "pendiente");
    if (!started && !isBotMatch(partida)) return null;
    if (!estadosCheckers[codigo] || !estadosCheckers[codigo].state) {
      return initCheckersState(codigo, partida, { reason: reason || "ensure" });
    }
    estadosCheckers[codigo].players = buildCheckersPlayersFromPartida(partida, codigo);
    return estadosCheckers[codigo];
  };

  const emitirEstadoCheckers = (io, codigo, datosCheckers, { socket = null } = {}) => {
    const state = datosCheckers?.state ?? null;
    if (!state) return;

    const legalMoves = getCheckersLegalMoves(state, state.currentPlayer);
    let white = 0;
    let black = 0;
    const board = state.board || [];
    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < (board[r] || []).length; c++) {
        const v = board[r][c];
        if (v > 0) white++;
        else if (v < 0) black++;
      }
    }

    const players = Array.isArray(datosCheckers?.players) ? datosCheckers.players : [];
    const winnerColor = state.status === "finished" ? state.winner : null;
    const winnerPlayer = winnerColor ? players.find((p) => p?.color === winnerColor) : null;
    const loserPlayer =
      winnerColor ? players.find((p) => p?.color && p.color !== winnerColor) : null;

    const payload = {
      codigo,
      statePublic: {
        board: state.board,
        currentPlayer: state.currentPlayer,
        forcedFrom: state.forcedFrom,
        status: state.status,
        winner: state.winner,
        winnerPlayerId: winnerPlayer?.id ?? null,
        winnerName: winnerPlayer?.name ?? null,
        loserPlayerId: loserPlayer?.id ?? null,
        loserName: loserPlayer?.name ?? null,
        lastMove: state.lastMove ?? null,
        legalMoves,
        pieceCounts: { white, black },
        players,
      },
      // compat (cliente antiguo)
      players,
      state: {
        ...state,
        legalMoves,
        pieceCounts: { white, black },
      },
    };

    const target = socket ? socket : io.to(codigo);

    target.emit("damas_state", payload);
    target.emit("checkers_state", payload);

    try {
      const partida = sistemaRef?.partidas?.[codigo] || null;
      const gameKey = String(partida?.juego || "damas").trim().toLowerCase();
      target.emit("game:state", {
        matchCode: codigo,
        gameKey,
        state: payload.statePublic,
      });
      if (!socket) logger.debug("[EMIT STATE]", gameKey || "damas", codigo);
    } catch (e) {}

    // Damas PVP rematch ready-check: initialize + broadcast rematch state when a round ends.
    try {
      const partida = sistemaRef?.partidas?.[codigo] || null;
      const gameKey = String(partida?.juego || "").trim().toLowerCase();
      if (gameKey !== "damas" && gameKey !== "checkers") return;
      if (!partida || isBotMatch(partida)) return;

      if (String(state.status || "").toLowerCase() !== "finished") {
        cancelCheckersRematch(io, codigo, "round_active");
        return;
      }

      const required = getCheckersMatchPlayerUids(partida);
      if (required.length < 2) return;

      const rematch = ensureCheckersRematchRecord(codigo, partida);
      if (!rematch) return;
      rematch.active = true;
      rematch.started = false;
      rematch.votes = new Set();
      rematch.createdAt = Date.now();
      if (rematch.timeout) {
        try { clearTimeout(rematch.timeout); } catch (e2) {}
      }
      rematch.timeout = setTimeout(() => {
        try {
          cancelCheckersRematch(io, codigo, "timeout");
        } catch (e) {}
      }, CHECKERS_REMATCH_TIMEOUT_MS);

      emitCheckersRematchState(io, codigo, partida);
    } catch (e) {}
  };

  const ensureUnoTimers = (datosUNO) => {
    if (!datosUNO.unoTimers) {
      datosUNO.unoTimers = {
        deadlinesByPlayerId: {},
        timeoutsByPlayerId: {},
      };
    }
    return datosUNO.unoTimers;
  };

  const ensureRematchState = (datosUNO) => {
    if (!datosUNO.rematch) {
      datosUNO.rematch = {
        round: 0,
        inProgress: false,
        readyByPlayerId: {},
      };
    }
    if (!datosUNO.rematch.readyByPlayerId) datosUNO.rematch.readyByPlayerId = {};
    return datosUNO.rematch;
  };

  const emitRematchStatus = (io, codigo, datosUNO, { socket = null } = {}) => {
    if (!datosUNO) return;
    const rematch = ensureRematchState(datosUNO);
    const activePlayerIds = Array.isArray(datosUNO.humanIds) ? datosUNO.humanIds : [];
    const readyPlayerIds = activePlayerIds.filter(
      (id) => !!rematch.readyByPlayerId[String(id)],
    );
    const payload = {
      codigo,
      readyCount: readyPlayerIds.length,
      totalCount: activePlayerIds.length,
      readyPlayerIds,
      round: rematch.round,
      inProgress: rematch.inProgress,
    };
    if (socket) socket.emit("uno:rematch_status", payload);
    else io.to(codigo).emit("uno:rematch_status", payload);
  };

  const clearUnoDeadline = (io, codigo, datosUNO, playerId, { emit = true } = {}) => {
    if (!datosUNO) return;
    const unoTimers = ensureUnoTimers(datosUNO);
    const key = String(playerId);
    const t = unoTimers.timeoutsByPlayerId[key];
    if (t) clearTimeout(t);
    delete unoTimers.timeoutsByPlayerId[key];
    if (unoTimers.deadlinesByPlayerId[key] != null) {
      delete unoTimers.deadlinesByPlayerId[key];
      if (emit) io.to(codigo).emit("uno:uno_cleared", { codigo, playerId });
    }
  };

  const clearAllUnoDeadlines = (io, codigo, datosUNO) => {
    if (!datosUNO) return;
    const unoTimers = ensureUnoTimers(datosUNO);
    for (const key of Object.keys(unoTimers.timeoutsByPlayerId || {})) {
      clearTimeout(unoTimers.timeoutsByPlayerId[key]);
      delete unoTimers.timeoutsByPlayerId[key];
    }
    unoTimers.deadlinesByPlayerId = {};
  };

  const syncUnoDeadlinesFromEngine = (io, codigo, datosUNO) => {
    if (!datosUNO || !datosUNO.engine) return;
    const engine = datosUNO.engine;
    const unoTimers = ensureUnoTimers(datosUNO);

    if (engine.status !== "playing") {
      clearAllUnoDeadlines(io, codigo, datosUNO);
      return;
    }

    const requiresUno = new Set();
    for (const p of engine.players || []) {
      if (p && p.hand && p.hand.length === 1 && !p.hasCalledUno) {
        requiresUno.add(String(p.id));
      }
    }

    // Cancelar timers que ya no aplican.
    for (const key of Object.keys(unoTimers.deadlinesByPlayerId || {})) {
      if (!requiresUno.has(key)) {
        clearUnoDeadline(io, codigo, datosUNO, isNaN(Number(key)) ? key : Number(key));
      }
    }

    // Programar nuevos timers donde toque.
    for (const p of engine.players || []) {
      const key = String(p.id);
      if (!requiresUno.has(key)) continue;
      if (unoTimers.deadlinesByPlayerId[key] != null) continue;

      const deadlineTs = Date.now() + UNO_CALL_WINDOW_MS;
      unoTimers.deadlinesByPlayerId[key] = deadlineTs;

      io.to(codigo).emit("uno:uno_required", {
        codigo,
        playerId: p.id,
        deadlineTs,
        windowMs: UNO_CALL_WINDOW_MS,
      });

      unoTimers.timeoutsByPlayerId[key] = setTimeout(async () => {
        try {
          const current = estadosUNO[codigo];
          if (!current || !current.engine) return;
          const currentTimers = ensureUnoTimers(current);
          const currentDeadline = currentTimers.deadlinesByPlayerId[key];
          if (currentDeadline !== deadlineTs) return;

          const still = (current.engine.players || []).find((pl) => String(pl.id) === key);
          if (!still) {
            clearUnoDeadline(io, codigo, current, p.id);
            return;
          }
          const stillRequires =
            current.engine.status === "playing" &&
            still.hand?.length === 1 &&
            !still.hasCalledUno;
          if (!stillRequires) {
            clearUnoDeadline(io, codigo, current, p.id);
            return;
          }

          const loserIndex = current.engine.players.findIndex((pl) => String(pl.id) === key);
          const winnerIndex =
            current.engine.players.length === 2
              ? loserIndex === 0
                ? 1
                : 0
              : getNextPlayerIndex(current.engine, loserIndex, 1);

          current.engine = {
            ...current.engine,
            status: "finished",
            winnerIndex,
            lastAction: { type: "UNO_TIMEOUT", playerIndex: loserIndex },
          };

          clearAllUnoDeadlines(io, codigo, current);

          io.to(codigo).emit("uno:player_lost", {
            codigo,
            playerId: p.id,
            reason: "uno_timeout",
            deadlineTs,
            atTs: Date.now(),
          });
          io.to(codigo).emit("uno:game_over", {
            codigo,
            reason: "uno_timeout",
            loserPlayerId: p.id,
            winnerPlayerId: current.engine.players?.[winnerIndex]?.id ?? null,
            atTs: Date.now(),
          });

          await emitirEstadoUNO(io, codigo, current);
        } catch (e) {
          logger.warn("[UNO] error en timeout UNO", e?.message || e);
        }
      }, UNO_CALL_WINDOW_MS);
    }
  };

  const tryHandleUnoCallByIndex = async (io, codigo, datosUNO, playerIndex) => {
    if (!datosUNO || !datosUNO.engine) return false;
    const player = datosUNO.engine.players?.[playerIndex];
    if (!player) return false;

    const unoTimers = ensureUnoTimers(datosUNO);
    const key = String(player.id);
    const deadlineTs = unoTimers.deadlinesByPlayerId[key];
    if (deadlineTs == null) return false;
    if (Date.now() > deadlineTs) return false;

    clearUnoDeadline(io, codigo, datosUNO, player.id, { emit: false });
    datosUNO.engine = applyAction(datosUNO.engine, {
      type: ACTION_TYPES.CALL_UNO,
      playerIndex,
    });

    io.to(codigo).emit("uno:uno_called", {
      codigo,
      playerId: player.id,
      atTs: Date.now(),
    });

    return true;
  };

  this.enviarAlRemitente = function(socket, mensaje, datos) {
    socket.emit(mensaje, datos);
  };

  this.enviarATodosMenosRemitente = function(socket, mensaje, datos) {
    socket.broadcast.emit(mensaje, datos);
  };

  this.enviarGlobal = function(io, mensaje, datos) {
    io.emit(mensaje, datos);
  };

  this.lanzarServidor = function(io, sistema) {
    sistemaRef = sistema;
    io.on("connection", function(socket) {
      logger.debug("Capa WS activa");

      // Enviar lista inicial de partidas disponibles
      socket.on("obtenerListaPartidas", function(datos) {
        const juego = datos && datos.juego;
        let lista = sistema.obtenerPartidasDisponibles(juego);
        srv.enviarAlRemitente(socket, "listaPartidas", sanitizeListaPartidasPublic(lista));
      });
      // dispara una vez al conectar
      socket.emit("listaPartidas", sanitizeListaPartidasPublic(sistema.obtenerPartidasDisponibles()));

      // === crearPartida ===
      socket.on("crearPartida", function(datos, ack) {
        const juego = datos && datos.juego;
        const modeRaw = datos && (datos.matchMode ?? datos.mode);
        const vsBotRaw = datos && (datos.isBotMatch ?? datos.vsBot ?? datos.bot);
        const vsBot =
          vsBotRaw === true ||
          vsBotRaw === 1 ||
          vsBotRaw === "1" ||
          String(vsBotRaw).toLowerCase() === "true";
        const modeNorm = String(modeRaw || "").trim().toLowerCase();
        const mode =
          modeNorm === "pvbot" || modeNorm === "bot" || modeNorm === "machine" || modeNorm === "cpu" || vsBot
            ? "PVBOT"
            : "PVP";
        const isBotMode =
          mode === "PVBOT" &&
          (juego === "uno" || juego === "4raya" || juego === "damas" || juego === "checkers");
        const rawMaxPlayers = datos && (datos.maxPlayers ?? datos.maxJug);
        const parsed = parseInt(rawMaxPlayers, 10);
        const maxPlayers =
          juego === "4raya"
            ? 2
            : juego === "damas" || juego === "checkers"
              ? 2
            : isBotMode && juego === "uno"
              ? 1
            : Number.isFinite(parsed) && parsed >= 2 && parsed <= 8
              ? parsed
              : 2;

        let codigo = sistema.crearPartida(datos.email, juego, maxPlayers, {
          vsBot: isBotMode,
          mode,
          nick: datos && typeof datos.nick === "string" ? datos.nick : undefined,
        });

        if (codigo !== -1) {
          socket.join(codigo); // sala de socket.io
          cancelRoomEmptyTimer(codigo);
          trackMatchPresence(codigo, datos.email, socket);
        }

        try {
          const partidaNow = codigo !== -1 ? sistema.partidas?.[codigo] : null;
          if (partidaNow) emitMatchUpdate(io, codigo, partidaNow);
        } catch (e) {}

        const partidaCreada = codigo !== -1 ? sistema.partidas[codigo] : null;
        try {
          const gameKeyDbg = String(partidaCreada?.juego || juego || "").trim().toLowerCase();
          if (codigo !== -1 && (gameKeyDbg === "4raya" || gameKeyDbg === "damas" || gameKeyDbg === "checkers")) {
            const playersLenDbg = Array.isArray(partidaCreada?.jugadores) ? partidaCreada.jugadores.length : 0;
            const hasStateDbg =
              gameKeyDbg === "4raya"
                ? !!estados4raya?.[codigo]?.engine
                : !!estadosCheckers?.[codigo]?.state;
            logger.debug("[CREATE]", {
              matchCode: codigo,
              gameKey: gameKeyDbg,
              mode: partidaCreada?.mode,
              players: playersLenDbg,
              hasState: hasStateDbg,
            });
          }
        } catch (e) {}
        srv.enviarAlRemitente(socket, "partidaCreada", {
          codigo: codigo,
          maxPlayers: maxPlayers,
          juego: partidaCreada?.juego || juego,
          isBotGame: !!(partidaCreada && isBotMatch(partidaCreada)),
        });
        if (typeof ack === "function") {
          ack({
            ok: codigo !== -1,
            codigo,
            juego: partidaCreada?.juego || juego,
            maxPlayers,
          });
        }

        if (
          codigo !== -1 &&
          isBotMode &&
          (juego === "uno" || juego === "4raya" || juego === "damas" || juego === "checkers")
        ) {
          const contRes = sistema.continuarPartida(datos.email, codigo);
          const contCodigo = contRes && typeof contRes === "object" ? contRes.codigo : contRes;
          if (contCodigo !== -1) {
            const partida = sistema.partidas?.[codigo] || null;
            try {
              const gameKey = String(juego || "").trim().toLowerCase();
              if (partida && (gameKey === "4raya" || gameKey === "damas" || gameKey === "checkers")) {
                if (gameKey === "4raya") {
                  ensureConnect4State(codigo, partida, { reason: "create_bot" });
                  if (estados4raya[codigo]) emitirEstado4Raya(io, codigo, estados4raya[codigo]);
                } else {
                  ensureCheckersState(codigo, partida, { reason: "create_bot" });
                  if (estadosCheckers[codigo]) emitirEstadoCheckers(io, codigo, estadosCheckers[codigo]);
                  if (partida.mode === "PVBOT") {
                    try { maybeBotMoveCheckers(io, codigo); } catch (e) {}
                  }
                }
              }
            } catch (e) {}
            io.to(codigo).emit("partidaContinuada", {
              codigo,
              juego,
              isBotGame: true,
              creatorNick: safePublicName(partida?.propietario, "Anfitrión"),
            });
          } else {
            srv.enviarAlRemitente(
              socket,
              "partidaContinuada",
              contRes && typeof contRes === "object" ? contRes : { codigo: -1 }
            );
          }
        }

        let lista = sistema.obtenerPartidasDisponibles(juego);
        srv.enviarGlobal(io, "listaPartidas", sanitizeListaPartidasPublic(lista));
      });

      // === unirAPartida ===
      socket.on("unirAPartida", async function(datos, ack) {
        // Mejor esfuerzo: actualizar nick del usuario para que el lobby muestre siempre displayName.
        try {
          const nick = datos && typeof datos.nick === "string" ? String(datos.nick).trim() : "";
          if (nick && !looksLikeEmail(nick) && typeof sistema._obtenerOcrearUsuarioEnMemoria === "function") {
            sistema._obtenerOcrearUsuarioEnMemoria(datos.email, nick);
          }
        } catch (e) {}

        const res = sistema.unirAPartida(datos.email, datos.codigo);
        const codigo = res && typeof res === "object" ? res.codigo : res;
        try {
          const partidaDbg = codigo !== -1 ? sistema.partidas?.[codigo] : sistema.partidas?.[datos.codigo];
          const gameKeyDbg = String(partidaDbg?.juego || datos?.juego || "").trim().toLowerCase();
          const playersLenDbg = Array.isArray(partidaDbg?.jugadores) ? partidaDbg.jugadores.length : 0;
          const hasStateDbg =
            gameKeyDbg === "4raya"
              ? !!estados4raya?.[String(codigo !== -1 ? codigo : datos.codigo)]?.engine
              : gameKeyDbg === "damas" || gameKeyDbg === "checkers"
                ? !!estadosCheckers?.[String(codigo !== -1 ? codigo : datos.codigo)]?.state
                : false;
          if (gameKeyDbg === "4raya" || gameKeyDbg === "damas" || gameKeyDbg === "checkers") {
            logger.debug("[JOIN]", {
              matchCode: String(codigo !== -1 ? codigo : datos.codigo),
              gameKey: gameKeyDbg,
              mode: partidaDbg?.mode,
              players: playersLenDbg,
              hasState: hasStateDbg,
            });
          }
        } catch (e) {}

        // Si ya est\u00e1 en la sala, no tratar como error (deduplicaci\u00f3n).
        if (codigo === -1 && res && typeof res === "object" && res.reason === "ALREADY_IN") {
          const partida = sistema.partidas?.[datos.codigo] || null;
          const maxPlayers = partida?.maxPlayers ?? partida?.maxJug ?? 2;
          const playersCount = Array.isArray(partida?.jugadores)
            ? partida.jugadores.length
            : (partida?.playersCount || 0);
          const status = partida?.status || (playersCount >= maxPlayers ? "FULL" : "OPEN");

          try {
            socket.join(datos.codigo);
            cancelRoomEmptyTimer(datos.codigo);
            trackMatchPresence(datos.codigo, datos.email, socket);
          } catch (e) {}

          srv.enviarAlRemitente(socket, "unidoAPartida", {
            codigo: datos.codigo,
            status,
            playersCount,
            maxPlayers,
            alreadyJoined: true,
          });
          if (typeof ack === "function") ack({ ok: true, reason: "already_joined" });

          let lista = sistema.obtenerPartidasDisponibles(datos.juego);
          srv.enviarGlobal(io, "listaPartidas", sanitizeListaPartidasPublic(lista));
          return;
        }

        if (codigo !== -1) {
          socket.join(codigo);
          cancelRoomEmptyTimer(codigo);
          trackMatchPresence(codigo, datos.email, socket);
          cancelRoomEmptyTimer(codigo);
          cancelRoomEmptyTimer(codigo);
          trackMatchPresence(codigo, datos.email, socket);
        }

        try {
          const partidaNow = codigo !== -1 ? sistema.partidas?.[codigo] : null;
          if (partidaNow) emitMatchUpdate(io, codigo, partidaNow);
        } catch (e) {}

        // Si ya hay un engine UNO creado, sincronizarlo con los jugadores reales de la partida.
        try {
          const partida = sistema.partidas[codigo];
          const datosUNO = estadosUNO[codigo];
          if (codigo !== -1 && partida && partida.juego === "uno" && datosUNO) {
            const partidaHumanIds = [];
            const partidaHumanNames = [];
            for (const j of partida.jugadores || []) {
              const id = normalizePlayerId(j.email);
              if (!id || partidaHumanIds.includes(id)) continue;
              partidaHumanIds.push(id);
              const fallback = `Jugador ${partidaHumanNames.length + 1}`;
              partidaHumanNames.push(pickDisplayName(partida, id, fallback));
            }

            datosUNO.humanIds = partidaHumanIds;
            datosUNO.humanNames = partidaHumanNames;

            const numHumanPlayers = datosUNO.humanIds.length;
            const shouldHaveBot = numHumanPlayers < 2;
            const desiredNames = shouldHaveBot
              ? [datosUNO.humanNames[0] || "Jugador 1", "Bot"]
              : [...datosUNO.humanNames];
            const desiredNumPlayers = shouldHaveBot ? 2 : numHumanPlayers;

            const existingNames =
              datosUNO.engine?.players?.map((p) => p.name) || null;
            const needsRecreate =
              !datosUNO.engine ||
              !!datosUNO.engine.hasBot !== shouldHaveBot ||
              (datosUNO.engine.players?.length || 0) !== desiredNumPlayers ||
              !arraysEqual(existingNames, desiredNames);

            if (needsRecreate) {
              clearAllUnoDeadlines(io, codigo, datosUNO);
              const engine = createInitialState({
                numPlayers: desiredNumPlayers,
                names: desiredNames,
              });
              engine.numHumanPlayers = numHumanPlayers;
              engine.hasBot = shouldHaveBot;
              datosUNO.engine = engine;
            } else {
              datosUNO.engine.numHumanPlayers = numHumanPlayers;
              datosUNO.engine.hasBot = shouldHaveBot;
            }

            await emitirEstadoUNO(io, codigo, datosUNO);
          }
        } catch (e) {
          logger.warn("[UNO] error sincronizando engine tras unirAPartida", e?.message || e);
        }

        // Damas / 4raya PVP: NO auto-start. El host debe iniciar manualmente.
        try {
          const partidaNow = sistema.partidas?.[codigo] || null;
          const gameKey = String(partidaNow?.juego || "").trim().toLowerCase();
          const isTwoPlayerGame = gameKey === "4raya" || gameKey === "damas" || gameKey === "checkers";
          if (false && partidaNow && isTwoPlayerGame && !isBotMatch(partidaNow)) {
            const maxPlayers = partidaNow?.maxPlayers ?? partidaNow?.maxJug ?? 2;
            const playersLen = Array.isArray(partidaNow?.jugadores) ? partidaNow.jugadores.length : 0;
            const started = String(partidaNow?.status || "").toUpperCase() === "STARTED" || (partidaNow?.estado && partidaNow.estado !== "pendiente");

            if (!started && playersLen >= 2 && playersLen >= maxPlayers) {
              const hostEmail =
                partidaNow.propietarioEmail || (partidaNow.jugadores && partidaNow.jugadores[0] && partidaNow.jugadores[0].email);
              const contRes = hostEmail ? sistema.continuarPartida(hostEmail, codigo) : null;
              const contCodigo = contRes && typeof contRes === "object" ? contRes.codigo : contRes;
              if (contCodigo !== -1) {
                logger.debug("[AUTO-START]", { gameKey, matchCode: codigo, players: playersLen });
                if (gameKey === "4raya") {
                  try {
                    ensureConnect4State(codigo, partidaNow, { reason: "auto_start" });
                    if (estados4raya[codigo]) emitirEstado4Raya(io, codigo, estados4raya[codigo]);
                  } catch (e) {}
                } else if (gameKey === "damas" || gameKey === "checkers") {
                  try {
                    ensureCheckersState(codigo, partidaNow, { reason: "auto_start" });
                    if (estadosCheckers[codigo]) emitirEstadoCheckers(io, codigo, estadosCheckers[codigo]);
                  } catch (e) {}
                }
                io.to(codigo).emit("partidaContinuada", {
                  codigo,
                  juego: gameKey,
                  isBotGame: false,
                  creatorNick: safePublicName(partidaNow?.propietario, "Anfitrión"),
                });
              }
            }
          }
        } catch (e) {}

        srv.enviarAlRemitente(
          socket,
          "unidoAPartida",
          res && typeof res === "object" ? res : { codigo: codigo }
        );
        if (typeof ack === "function") {
          ack({
            ok: codigo !== -1,
            reason: res && typeof res === "object" ? res.reason : undefined,
          });
        }

        let lista = sistema.obtenerPartidasDisponibles(datos.juego);
        srv.enviarGlobal(io, "listaPartidas", sanitizeListaPartidasPublic(lista));
      });

      // === continuarPartida ===
      socket.on("continuarPartida", function(datos, ack) {
        // Marca la partida como "en curso" en tu sistema
        const res = sistema.continuarPartida(datos.email, datos.codigo);
        const codigo = res && typeof res === "object" ? res.codigo : res;

        if (codigo !== -1) {
          const partida = sistema.partidas[codigo];
          const juego = partida?.juego || datos.juego || "uno";

          // Aseguramos que este socket está en la sala
          socket.join(codigo);

          // Enviar a TODOS los jugadores de la sala que la partida empieza
          io.to(codigo).emit("partidaContinuada", {
            codigo: codigo,
            juego,
            isBotGame: !!(partida && isBotMatch(partida)),
            creatorNick: safePublicName(partida?.propietario, "Anfitrión"),
          });

          try {
            const gameKey = String(juego || "").trim().toLowerCase();
            io.to(codigo).emit("match:started", {
              matchCode: String(codigo),
              gameKey,
              status: getDerivedMatchStatus(partida),
              creatorNick: safePublicName(partida?.propietario, "Anfitrión"),
              ts: Date.now(),
            });
            emitMatchUpdate(io, codigo, partida);
          } catch (e) {}

          // Actualizar la lista para TODO el mundo
          // (si sistema.obtenerPartidasDisponibles ya filtra las "en curso",
          //   desaparecerá del listado como quieres)
          let lista = sistema.obtenerPartidasDisponibles(juego);
          srv.enviarGlobal(io, "listaPartidas", sanitizeListaPartidasPublic(lista));
          if (typeof ack === "function") ack({ ok: true, codigo });
        } else {
          // No se pudo continuar la partida (no es el propietario, código inválido, etc.)
          srv.enviarAlRemitente(
            socket,
            "partidaContinuada",
            res && typeof res === "object" ? res : { codigo: -1 }
          );
          if (typeof ack === "function") {
            ack({
              ok: false,
              codigo: -1,
              reason: res && typeof res === "object" ? res.reason : "ERROR",
            });
          }
        }
      });

      // === eliminarPartida ===
      socket.on("eliminarPartida", function(datos, ack) {
        const codigoReq = datos && datos.codigo;
        const partidaBefore = codigoReq && sistema.partidas ? sistema.partidas[codigoReq] : null;
        const email = datos && datos.email;
        const playerId = normalizePlayerId(email);
        const wasHost =
          !!partidaBefore &&
          !!playerId &&
          normalizePlayerId(partidaBefore.propietarioEmail || "") === playerId;
        const wasPlayer =
          !!partidaBefore &&
          !!playerId &&
          Array.isArray(partidaBefore.jugadores) &&
          partidaBefore.jugadores.some((j) => normalizePlayerId(j?.email) === playerId);

        const before = !!(codigoReq && sistema.partidas && sistema.partidas[codigoReq]);
        let codigo = sistema.eliminarPartida(datos.email, codigoReq);
        const deletedRoom =
          before && !!codigoReq && !(sistema.partidas && sistema.partidas[codigoReq]);

        try {
          if (codigoReq) socket.leave(codigoReq);
          if (codigoReq && email) untrackSocketFromMatchPresence(codigoReq, email, socket);
        } catch (e) {}
        if (deletedRoom && codigoReq) {
          try { io.to(codigoReq).emit("room:deleted", { codigo: codigoReq }); } catch (e) {}
          try {
            emitMatchEnded(io, { matchCode: codigoReq, gameKey: partidaBefore?.juego || datos?.juego, reason: "DELETED" });
          } catch (e) {}
        }

        if (codigo !== -1 && !sistema.partidas[codigo]) {
          cleanupCodigoState(io, codigo);
        }

        if (codigoReq && partidaBefore && wasPlayer && !wasHost) {
          const playerNick = pickDisplayName(partidaBefore, playerId, "Jugador");
          emitMatchPlayerLeft(
            io,
            { matchCode: codigoReq, gameKey: partidaBefore.juego || datos?.juego, playerNick },
            { excludeSocket: socket }
          );
        }

        srv.enviarAlRemitente(socket, "partidaEliminada", { codigo: codigo });
        if (typeof ack === "function") {
          ack({ ok: codigo !== -1, codigo, deletedRoom });
        }

        let lista = sistema.obtenerPartidasDisponibles(datos.juego);
        srv.enviarGlobal(io, "listaPartidas", sanitizeListaPartidasPublic(lista));
      });

      // ==========================
      //  MATCH RESUME (GLOBAL)
      // ==========================

      socket.on("match:can_resume", function(datos, ack) {
        const matchCode = String(datos?.matchCode || datos?.codigo || "").trim();
        const email = datos?.email;
        const emailId = normalizePlayerId(email);
        const userId = normalizePlayerId(datos?.userId || datos?.uid || "");

        const respond = (payload) => {
          if (typeof ack === "function") return ack(payload);
          socket.emit("match:can_resume", payload);
        };

        if (!matchCode || (!emailId && !userId)) {
          return respond({ ok: false, matchCode, reason: "INVALID_REQUEST" });
        }

        const partida = sistema.partidas?.[matchCode] || null;
        if (!partida) return respond({ ok: false, matchCode, reason: "MATCH_NOT_FOUND" });
        if (isBotMatch(partida)) return respond({ ok: false, matchCode, reason: "BOT_MATCH" });
        if (getConnectedCount(matchCode) <= 0) {
          // If the match has no connected players, treat it as dead.
          if (shouldDestroyImmediatelyWhenEmpty(partida)) {
            try { destroyMatch(io, sistema, matchCode, { reason: "EMPTY" }); } catch (e) {}
          }
          return respond({ ok: false, matchCode, reason: "MATCH_EMPTY" });
        }

        const belongs =
          Array.isArray(partida.jugadores) &&
          partida.jugadores.some((j) => {
            const e = normalizePlayerId(j?.email);
            if (emailId && e === emailId) return true;
            if (userId && publicUserIdFromEmail(j?.email) === userId) return true;
            return false;
          });
        if (!belongs) return respond({ ok: false, matchCode, reason: "NOT_ALLOWED" });

        return respond({
          ok: true,
          matchCode,
          gameKey: String(partida.juego || "uno").trim().toLowerCase(),
          status: getDerivedMatchStatus(partida),
          creatorNick: safePublicName(partida.propietario, "Anfitrión"),
        });
      });

      socket.on("match:resume", function(datos, ack) {
        const matchCode = String(datos?.matchCode || datos?.codigo || "").trim();
        const email = datos?.email;
        const emailId = normalizePlayerId(email);
        const userId = normalizePlayerId(datos?.userId || datos?.uid || "");

        const respond = (payload) => {
          if (typeof ack === "function") return ack(payload);
          socket.emit("match:resume", payload);
        };

        if (!matchCode || (!emailId && !userId)) {
          return respond({ ok: false, matchCode, reason: "INVALID_REQUEST" });
        }

        const partida = sistema.partidas?.[matchCode] || null;
        if (!partida) return respond({ ok: false, matchCode, reason: "MATCH_NOT_FOUND" });
        if (isBotMatch(partida)) return respond({ ok: false, matchCode, reason: "BOT_MATCH" });
        if (getConnectedCount(matchCode) <= 0) {
          if (shouldDestroyImmediatelyWhenEmpty(partida)) {
            try { destroyMatch(io, sistema, matchCode, { reason: "EMPTY" }); } catch (e) {}
          }
          return respond({ ok: false, matchCode, reason: "MATCH_EMPTY" });
        }

        const belongs =
          Array.isArray(partida.jugadores) &&
          partida.jugadores.some((j) => {
            const e = normalizePlayerId(j?.email);
            if (emailId && e === emailId) return true;
            if (userId && publicUserIdFromEmail(j?.email) === userId) return true;
            return false;
          });
        if (!belongs) return respond({ ok: false, matchCode, reason: "NOT_ALLOWED" });

        try {
          socket.join(matchCode);
          cancelRoomEmptyTimer(matchCode);
          if (email) trackMatchPresence(matchCode, email, socket);
        } catch (e) {}

        return respond({
          ok: true,
          matchCode,
          gameKey: String(partida.juego || "uno").trim().toLowerCase(),
          status: getDerivedMatchStatus(partida),
          creatorNick: safePublicName(partida.propietario, "Anfitrión"),
        });
      });

      socket.on("matches:my_active", function(datos, ack) {
        const email = datos?.email;
        const emailId = normalizePlayerId(email);
        const userIdRaw = normalizePlayerId(datos?.userId || datos?.uid || "");
        const userId = userIdRaw || (email ? publicUserIdFromEmail(email) : "");

        const respond = (payload) => {
          if (typeof ack === "function") return ack(payload);
          socket.emit("matches:my_active", payload);
        };

        if (!emailId && !userId) return respond({ ok: false, reason: "INVALID_REQUEST" });

        const partidas = sistema?.partidas || {};
        const matches = [];
        for (const codigo of Object.keys(partidas)) {
          const partida = partidas[codigo];
          if (!partida) continue;
          if (isBotMatch(partida)) continue;

          const gameKey = String(partida.juego || "").trim().toLowerCase();
          if (gameKey !== "4raya" && gameKey !== "damas" && gameKey !== "checkers" && gameKey !== "uno") continue;
          if (getConnectedCount(codigo) <= 0) continue;

          const belongs =
            Array.isArray(partida.jugadores) &&
            partida.jugadores.some((j) => {
              const e = normalizePlayerId(j?.email);
              if (emailId && e === emailId) return true;
              if (userId && publicUserIdFromEmail(j?.email) === userId) return true;
              return false;
            });
          if (!belongs) continue;

          matches.push({
            matchCode: String(codigo),
            gameKey,
            status: getDerivedMatchStatus(partida),
            creatorNick: safePublicName(partida.propietario, "Anfitrión"),
            playersCount: getMatchPlayersLen(partida),
            maxPlayers: getMatchMaxPlayers(partida),
          });
        }

        const order = (s) =>
          s === "IN_PROGRESS" ? 0 : s === "WAITING_START" ? 1 : 2;
        matches.sort((a, b) => order(a.status) - order(b.status));
        return respond({ ok: true, matches });
      });

      socket.on("match:rejoin", function(datos, ack) {
        const matchCode = String(datos?.matchCode || datos?.codigo || "").trim();
        const email = datos?.email;
        const emailId = normalizePlayerId(email);
        const userIdRaw = normalizePlayerId(datos?.userId || datos?.uid || "");
        const userId = userIdRaw || (email ? publicUserIdFromEmail(email) : "");

        const respond = (payload) => {
          if (typeof ack === "function") return ack(payload);
          socket.emit("match:rejoin", payload);
        };

        if (!matchCode || (!emailId && !userId)) {
          return respond({ ok: false, matchCode, reason: "INVALID_REQUEST" });
        }

        const partida = sistema.partidas?.[matchCode] || null;
        if (!partida) return respond({ ok: false, matchCode, reason: "MATCH_NOT_FOUND" });
        if (isBotMatch(partida)) return respond({ ok: false, matchCode, reason: "BOT_MATCH" });
        if (getConnectedCount(matchCode) <= 0) {
          if (shouldDestroyImmediatelyWhenEmpty(partida)) {
            try { destroyMatch(io, sistema, matchCode, { reason: "EMPTY" }); } catch (e) {}
          }
          return respond({ ok: false, matchCode, reason: "MATCH_EMPTY" });
        }

        const belongs =
          Array.isArray(partida.jugadores) &&
          partida.jugadores.some((j) => {
            const e = normalizePlayerId(j?.email);
            if (emailId && e === emailId) return true;
            if (userId && publicUserIdFromEmail(j?.email) === userId) return true;
            return false;
          });
        if (!belongs) return respond({ ok: false, matchCode, reason: "NOT_ALLOWED" });

        try {
          socket.join(matchCode);
          cancelRoomEmptyTimer(matchCode);
          if (email) trackMatchPresence(matchCode, email, socket);
        } catch (e) {}

        const gameKey = String(partida.juego || "").trim().toLowerCase();
        const status = getDerivedMatchStatus(partida);

        // Best-effort: keep lobby UI in sync.
        emitMatchUpdate(io, matchCode, partida);

        // If already started, re-send state to this socket.
        try {
          if (status === "IN_PROGRESS") {
            if (gameKey === "4raya") {
              ensureConnect4State(matchCode, partida, { reason: "rejoin" });
              if (estados4raya[matchCode]) {
                emitirEstado4Raya(io, matchCode, estados4raya[matchCode], { socket });
              }
            } else if (gameKey === "damas" || gameKey === "checkers") {
              ensureCheckersState(matchCode, partida, { reason: "rejoin" });
              if (estadosCheckers[matchCode]) {
                emitirEstadoCheckers(io, matchCode, estadosCheckers[matchCode], { socket });
              }
            }
          }
        } catch (e) {}

        return respond({
          ok: true,
          matchCode,
          gameKey,
          status,
          creatorNick: safePublicName(partida.propietario, "Anfitrión"),
        });
      });

      socket.on("match:start", function(datos, ack) {
        const matchCode = String(datos?.matchCode || datos?.codigo || "").trim();
        const email = datos?.email;
        const emailId = normalizePlayerId(email);
        const userIdRaw = normalizePlayerId(datos?.userId || datos?.uid || "");
        const userId = userIdRaw || (email ? publicUserIdFromEmail(email) : "");

        const respond = (payload) => {
          if (typeof ack === "function") return ack(payload);
          socket.emit("match:start", payload);
        };

        if (!matchCode || (!emailId && !userId)) {
          return respond({ ok: false, matchCode, reason: "INVALID_REQUEST" });
        }

        const partida = sistema.partidas?.[matchCode] || null;
        if (!partida) return respond({ ok: false, matchCode, reason: "MATCH_NOT_FOUND" });
        if (isBotMatch(partida)) return respond({ ok: false, matchCode, reason: "BOT_MATCH" });

        const gameKey = String(partida.juego || "").trim().toLowerCase();
        if (gameKey !== "4raya" && gameKey !== "damas" && gameKey !== "checkers") {
          return respond({ ok: false, matchCode, reason: "UNSUPPORTED_GAME" });
        }

        const hostEmail =
          partida.propietarioEmail || (partida.jugadores && partida.jugadores[0] && partida.jugadores[0].email) || "";
        const hostEmailId = normalizePlayerId(hostEmail);
        const hostUserId = hostEmail ? publicUserIdFromEmail(hostEmail) : "";
        const isHost =
          (!!emailId && !!hostEmailId && emailId === hostEmailId) ||
          (!!userId && !!hostUserId && userId === hostUserId);
        if (!isHost) return respond({ ok: false, matchCode, reason: "NOT_HOST" });

        const playersLen = getMatchPlayersLen(partida);
        const maxPlayers = getMatchMaxPlayers(partida);
        if (playersLen < maxPlayers) return respond({ ok: false, matchCode, reason: "NOT_FULL" });

        const res = sistema.continuarPartida(hostEmail, matchCode);
        const codigo = res && typeof res === "object" ? res.codigo : res;
        if (codigo === -1) {
          return respond({ ok: false, matchCode, reason: res?.reason || "START_FAILED" });
        }

        const partidaNow = sistema.partidas?.[matchCode] || partida;
        const status = getDerivedMatchStatus(partidaNow);

        io.to(matchCode).emit("match:started", {
          matchCode,
          gameKey,
          status,
          creatorNick: safePublicName(partidaNow?.propietario, "Anfitrión"),
          ts: Date.now(),
        });
        emitMatchUpdate(io, matchCode, partidaNow);

        // Keep legacy client behavior: `partidaContinuada` triggers navigation.
        io.to(matchCode).emit("partidaContinuada", {
          codigo: matchCode,
          juego: gameKey,
          isBotGame: false,
          creatorNick: safePublicName(partidaNow?.propietario, "Anfitrión"),
        });

        try {
          if (gameKey === "4raya") {
            ensureConnect4State(matchCode, partidaNow, { reason: "start" });
            if (estados4raya[matchCode]) emitirEstado4Raya(io, matchCode, estados4raya[matchCode]);
          } else {
            ensureCheckersState(matchCode, partidaNow, { reason: "start" });
            if (estadosCheckers[matchCode]) emitirEstadoCheckers(io, matchCode, estadosCheckers[matchCode]);
          }
        } catch (e) {}

        return respond({ ok: true, matchCode, gameKey, status });
      });

      socket.on("match:soft_disconnect", function(datos, ack) {
        const matchCode = String(datos?.matchCode || datos?.codigo || "").trim();
        const email = datos?.email;
        const emailId = normalizePlayerId(email);

        const respond = (payload) => {
          if (typeof ack === "function") return ack(payload);
          socket.emit("match:soft_disconnect", payload);
        };

        if (!matchCode || !emailId) return respond({ ok: false, matchCode, reason: "INVALID_REQUEST" });

        const partida = sistema.partidas?.[matchCode] || null;
        if (!partida) return respond({ ok: false, matchCode, reason: "MATCH_NOT_FOUND" });
        if (isBotMatch(partida)) return respond({ ok: false, matchCode, reason: "BOT_MATCH" });

        const belongs =
          Array.isArray(partida.jugadores) &&
          partida.jugadores.some((j) => normalizePlayerId(j?.email) === emailId);
        if (!belongs) return respond({ ok: false, matchCode, reason: "NOT_ALLOWED" });

        try {
          socket.leave(matchCode);
        } catch (e) {}
        try {
          untrackSocketFromMatchPresence(matchCode, email, socket);
        } catch (e) {}

        // If nobody is connected anymore, end the match immediately.
        if (getConnectedCount(matchCode) <= 0 && shouldDestroyImmediatelyWhenEmpty(partida)) {
          destroyMatch(io, sistema, matchCode, { reason: "EMPTY" });
          return respond({ ok: true, matchCode, ended: true });
        }

        // Otherwise behave like a disconnect (start TTL removal + notify).
        scheduleRemovePlayerIfStillDisconnected(io, sistema, matchCode, emailId);
        return respond({ ok: true, matchCode, ended: false });
      });

      socket.on("match:leave", function(datos, ack) {
        const matchCode = String(datos?.matchCode || datos?.codigo || "").trim();
        const email = datos?.email;
        const emailId = normalizePlayerId(email);

        const respond = (payload) => {
          if (typeof ack === "function") return ack(payload);
          socket.emit("match:leave", payload);
        };

        if (!matchCode || !emailId) return respond({ ok: false, matchCode, reason: "INVALID_REQUEST" });

        const partidaBefore = sistema.partidas?.[matchCode] || null;
        if (!partidaBefore) return respond({ ok: false, matchCode, reason: "MATCH_NOT_FOUND" });
        if (isBotMatch(partidaBefore)) return respond({ ok: false, matchCode, reason: "BOT_MATCH" });

        const belongs =
          Array.isArray(partidaBefore.jugadores) &&
          partidaBefore.jugadores.some((j) => normalizePlayerId(j?.email) === emailId);
        if (!belongs) return respond({ ok: false, matchCode, reason: "NOT_ALLOWED" });

        const playerNick = pickDisplayName(partidaBefore, emailId, "Jugador");
        const gameKey = partidaBefore.juego || null;

        try {
          untrackSocketFromMatchPresence(matchCode, email, socket);
        } catch (e) {}
        try {
          socket.leave(matchCode);
        } catch (e) {}

        const res = sistema.eliminarPartida(email, matchCode);
        const partidaAfter = sistema.partidas?.[matchCode] || null;

        emitMatchPlayerLeft(io, { matchCode, gameKey, playerNick }, { excludeSocket: socket });

        if (!partidaAfter || getConnectedCount(matchCode) <= 0) {
          if (partidaAfter) {
            destroyMatch(io, sistema, matchCode, { reason: "EMPTY" });
          } else {
            // already deleted by model
            emitMatchEnded(io, { matchCode, gameKey, reason: "EMPTY" });
          }
        }

        return respond({ ok: true, matchCode, codigo: res && typeof res === "object" ? res.codigo : res });
      });

      // ==========================
      //  GAME STATE (DAMAS / 4RAYA)
      // ==========================

      socket.on("game:get_state", function(datos, ack) {
        const matchCode = String(datos?.matchCode || datos?.codigo || "").trim();
        const requestedKey = String(datos?.gameKey || datos?.gameType || "").trim().toLowerCase();
        const email = datos?.email;
        const emailId = normalizePlayerId(email);
        const userId = normalizePlayerId(datos?.userId || datos?.uid || "");

        const respond = (payload) => {
          if (typeof ack === "function") return ack(payload);
          socket.emit("game:get_state", payload);
        };

        if (!matchCode) return respond({ ok: false, matchCode, reason: "INVALID_REQUEST" });

        const partida = sistema.partidas?.[matchCode] || null;
        if (!partida) return respond({ ok: false, matchCode, reason: "MATCH_NOT_FOUND" });

        const gameKey = String(partida.juego || "").trim().toLowerCase();
        if (!gameKey) return respond({ ok: false, matchCode, reason: "UNKNOWN_GAME" });

        if (requestedKey && requestedKey !== gameKey) {
          return respond({ ok: false, matchCode, reason: "GAME_MISMATCH", gameKey });
        }

        const playersLen = Array.isArray(partida.jugadores) ? partida.jugadores.length : 0;
        const hasState =
          gameKey === "4raya"
            ? !!estados4raya?.[matchCode]?.engine
            : gameKey === "damas" || gameKey === "checkers"
              ? !!estadosCheckers?.[matchCode]?.state
              : false;
        logger.debug("[GET_STATE]", { matchCode, gameKey, mode: partida.mode, players: playersLen, hasState });

        const belongs =
          Array.isArray(partida.jugadores) &&
          partida.jugadores.some((j) => {
            const e = normalizePlayerId(j?.email);
            if (emailId && e === emailId) return true;
            if (userId && publicUserIdFromEmail(j?.email) === userId) return true;
            return false;
          });
        const alreadyInRoom = (() => {
          try { return socket.rooms && socket.rooms.has(matchCode); } catch { return false; }
        })();
        if (!belongs && !alreadyInRoom) {
          return respond({ ok: false, matchCode, reason: "NOT_ALLOWED" });
        }

        try {
          socket.join(matchCode);
          cancelRoomEmptyTimer(matchCode);
          if (email) trackMatchPresence(matchCode, email, socket);
        } catch (e) {}

        if (gameKey === "4raya") {
          if (playersLen < 2 && String(partida.mode || "").toUpperCase() !== "PVBOT") {
            return respond({ ok: false, matchCode, gameKey, reason: "WAITING_FOR_PLAYERS" });
          }
          const started =
            String(partida?.status || "").toUpperCase() === "STARTED" ||
            (partida?.estado && partida.estado !== "pendiente");
          if (!started && !isBotMatch(partida)) {
            return respond({ ok: false, matchCode, gameKey, reason: "WAITING_FOR_START" });
          }
          const ensured = ensureConnect4State(matchCode, partida, { reason: "get_state" });
          if (!ensured || !estados4raya?.[matchCode]?.engine) {
            return respond({ ok: false, matchCode, gameKey, reason: "STATE_NOT_READY" });
          }
          emitirEstado4Raya(io, matchCode, estados4raya[matchCode], { socket });
          return respond({ ok: true, matchCode, gameKey });
        }

        if (gameKey === "damas" || gameKey === "checkers") {
          let started =
            String(partida?.status || "").toUpperCase() === "STARTED" ||
            (partida?.estado && partida.estado !== "pendiente");
          if (false && !started) {
            // Best-effort auto-start (if full / vs bot).
            try {
              const hostEmail =
                partida.propietarioEmail || (partida.jugadores && partida.jugadores[0] && partida.jugadores[0].email);
              const contRes = hostEmail ? sistema.continuarPartida(hostEmail, matchCode) : null;
              const contCodigo = contRes && typeof contRes === "object" ? contRes.codigo : contRes;
              if (contCodigo !== -1) {
                started = true;
                io.to(matchCode).emit("partidaContinuada", {
                  codigo: matchCode,
                  juego: gameKey,
                  isBotGame: !!isBotMatch(partida),
                  creatorNick: safePublicName(partida?.propietario, "Anfitrión"),
                });
              }
          } catch (e) {}
          }

          if (!started) {
            return respond({ ok: false, matchCode, gameKey, reason: "WAITING_FOR_START" });
          }

          ensureCheckersState(matchCode, partida, { reason: "get_state" });
          emitirEstadoCheckers(io, matchCode, estadosCheckers[matchCode], { socket });
          if (partida.mode === "PVBOT") {
            try { maybeBotMoveCheckers(io, matchCode); } catch (e) {}
          }
          return respond({ ok: true, matchCode, gameKey });
        }

        return respond({ ok: false, matchCode, gameKey, reason: "UNSUPPORTED_GAME" });
      });

      // ==========================
      //  RESUME (UNO / DAMAS)
      // ==========================

      socket.on("game:resumeStatus", function(datos, ack) {
        const gameType = String(datos?.gameType || "").trim().toLowerCase();
        const gameId = String(datos?.gameId || datos?.codigo || "").trim();
        const email = datos?.email;
        const playerId = normalizePlayerId(email);

        const respond = (payload) => {
          if (typeof ack === "function") return ack(payload);
          socket.emit("game:resumeStatus", payload);
        };

        if (!gameType || !gameId || !playerId) {
          return respond({ canResume: false, gameType, gameId, reason: "INVALID_REQUEST" });
        }

        const partida = sistema.partidas?.[gameId] || null;
        if (!partida) {
          return respond({ canResume: false, gameType, gameId, reason: "GAME_NOT_FOUND" });
        }

        if (isRoomEmpty(io, gameId)) {
          return respond({ canResume: false, gameType, gameId, reason: "GAME_EMPTY" });
        }

        const partidaGame = String(partida.juego || "").trim().toLowerCase();
        const normalizedType = gameType === "checkers" ? "damas" : gameType;
        const partidaType = partidaGame === "checkers" ? "damas" : partidaGame;
        if (normalizedType !== partidaType) {
          return respond({ canResume: false, gameType: normalizedType, gameId, reason: "GAME_MISMATCH" });
        }

        if (isBotMatch(partida)) {
          return respond({ canResume: false, gameType: normalizedType, gameId, reason: "BOT_MATCH" });
        }

        const belongs =
          Array.isArray(partida.jugadores) &&
          partida.jugadores.some((j) => normalizePlayerId(j.email) === playerId);
        if (!belongs) {
          return respond({ canResume: false, gameType: normalizedType, gameId, reason: "NOT_ALLOWED" });
        }

        return respond({ canResume: true, gameType: normalizedType, gameId });
      });

      socket.on("game:leave", function(datos, ack) {
        const codigo = String(datos?.gameId || datos?.codigo || "").trim();
        const email = datos?.email;

        const respond = (payload) => {
          if (typeof ack === "function") return ack(payload);
          socket.emit("game:leave", payload);
        };

        if (!codigo || !email) {
          return respond({ ok: false, codigo, reason: "INVALID_REQUEST" });
        }

        const before = sistema.partidas?.[codigo] || null;
        const res = sistema.eliminarPartida(email, codigo);
        const deleted = !!before && !sistema.partidas?.[codigo];

        try {
          socket.leave(codigo);
        } catch (e) {}
        try {
          untrackSocketFromMatchPresence(codigo, email, socket);
        } catch (e) {}

        try {
          if (before && codigo && email) {
            const playerId = normalizePlayerId(email);
            const playerNick = pickDisplayName(before, playerId, "Jugador");
            emitMatchPlayerLeft(
              io,
              { matchCode: codigo, gameKey: before.juego || datos?.gameType, playerNick },
              { excludeSocket: socket }
            );
          }
        } catch (e) {}

        // Notificar abandono + cancelar rematch si estaba en votación (UNO).
        try {
          const juego = String(before?.juego || "").trim().toLowerCase();
          if (!deleted && codigo && juego === "uno") {
            const datosUNO = estadosUNO?.[codigo] || null;
            const humanId = normalizePlayerId(email);
            const humanIds = Array.isArray(datosUNO?.humanIds) ? datosUNO.humanIds : [];
            const playerIndex = humanId ? humanIds.indexOf(humanId) : -1;
            const playerName =
              (playerIndex >= 0
                ? String(datosUNO?.engine?.players?.[playerIndex]?.name || "").trim()
                : "") ||
              pickDisplayName(before, humanId, humanId || "Jugador") ||
              "Jugador";

            io.to(codigo).emit("player:left", {
              gameId: codigo,
              gameType: "uno",
              playerId: playerIndex >= 0 ? playerIndex : humanId,
              playerName,
              ts: Date.now(),
            });

            const rematch = datosUNO?.rematch || null;
            const readyBy = rematch?.readyByPlayerId || null;
            const hasVotes = readyBy && typeof readyBy === "object" && Object.keys(readyBy).length > 0;
            const inFinished = String(datosUNO?.engine?.status || "") === "finished";
            if (inFinished && hasVotes && !rematch?.inProgress) {
              rematch.readyByPlayerId = {};
              rematch.inProgress = false;
              io.to(codigo).emit("rematch:cancelled", {
                gameId: codigo,
                gameType: "uno",
                reason: "PLAYER_LEFT",
                playerName,
                ts: Date.now(),
              });
              emitRematchStatus(io, codigo, datosUNO);
            }
          }
        } catch (e) {}

        if (deleted) {
          cleanupCodigoState(io, codigo);
        }

        if (isRoomEmpty(io, codigo) && sistema.partidas?.[codigo]) {
          const partidaNow = sistema.partidas[codigo];
          delete sistema.partidas[codigo];
          cleanupCodigoState(io, codigo);
          const lista = sistema.obtenerPartidasDisponibles(partidaNow.juego);
          srv.enviarGlobal(io, "listaPartidas", sanitizeListaPartidasPublic(lista));
        }

        return respond({ ok: true, codigo: res && typeof res === "object" ? res.codigo : res, deleted });
      });

      socket.on("game:resume", function(datos, ack) {
        const gameTypeRaw = String(datos?.gameType || "").trim().toLowerCase();
        const codigo = String(datos?.gameId || datos?.codigo || "").trim();
        const email = datos?.email;

        const respond = (payload) => {
          if (typeof ack === "function") return ack(payload);
          socket.emit("game:resume", payload);
        };

        if (!codigo || !email || !gameTypeRaw) {
          return respond({ ok: false, codigo, gameType: gameTypeRaw, reason: "INVALID_REQUEST" });
        }

        const partida = sistema.partidas?.[codigo] || null;
        if (!partida) return respond({ ok: false, codigo, gameType: gameTypeRaw, reason: "GAME_NOT_FOUND" });
        if (isBotMatch(partida)) return respond({ ok: false, codigo, gameType: gameTypeRaw, reason: "BOT_MATCH" });

        if (isRoomEmpty(io, codigo)) {
          return respond({ ok: false, codigo, gameType: gameTypeRaw, reason: "GAME_EMPTY" });
        }

        const playerId = normalizePlayerId(email);
        const belongs =
          Array.isArray(partida.jugadores) &&
          partida.jugadores.some((j) => normalizePlayerId(j.email) === playerId);
        if (!belongs) return respond({ ok: false, codigo, gameType: gameTypeRaw, reason: "NOT_ALLOWED" });

        cancelRoomEmptyTimer(codigo);

        const normalizedType = gameTypeRaw === "checkers" ? "damas" : gameTypeRaw;
        const partidaGame = String(partida.juego || "").trim().toLowerCase();
        const partidaType = partidaGame === "checkers" ? "damas" : partidaGame;
        if (normalizedType !== partidaType) {
          return respond({ ok: false, codigo, gameType: normalizedType, reason: "GAME_MISMATCH" });
        }

        if (normalizedType === "uno") {
          // Resume UNO by reusing the server subscription handler.
          // (Important: do NOT socket.emit("uno:suscribirse") here, that would only emit to the client.)
          Promise.resolve()
            .then(() => handleUnoSubscribe({ codigo, email }))
            .then(() => {
              logger.debug("[RESUME] ok", { gameType: "uno", codigo, email });
              respond({ ok: true, codigo, gameType: "uno" });
            })
            .catch((e) => {
              logger.warn("[RESUME] error UNO", codigo, e?.message || e);
              respond({ ok: false, codigo, gameType: "uno", reason: "ERROR" });
            });
          return;
        }

        if (normalizedType === "damas") {
          try {
            handleDamasJoin({ codigo, email });
            logger.debug("[RESUME] ok", { gameType: "damas", codigo, email });
            return respond({ ok: true, codigo, gameType: "damas" });
          } catch (e) {
            logger.warn("[RESUME] error DAMAS", codigo, e?.message || e);
            return respond({ ok: false, codigo, gameType: "damas", reason: "ERROR" });
          }
        }

        return respond({ ok: false, codigo, gameType: normalizedType, reason: "UNKNOWN_GAME" });
      });
      // ==========================
      //  UNO MULTIJUGADOR (WS)
      // ==========================

      const handleUnoReaction = function (payload, ack) {
        const respond = (res) => {
          if (typeof ack === "function") return ack(res);
          return;
        };

        const gameId = String(
          payload?.gameId ?? payload?.roomId ?? payload?.matchId ?? payload?.codigo ?? ""
        ).trim();
        const toPlayerId = String(payload?.toPlayerId ?? "").trim();
        const emoji = String(payload?.emoji ?? payload?.icon ?? "").trim();

        if (!gameId || !toPlayerId || !emoji) {
          return respond({ ok: false, error: "INVALID_REQUEST" });
        }
        if (!ALLOWED_REACTION_EMOJIS.has(emoji)) {
          return respond({ ok: false, error: "INVALID_EMOJI" });
        }

        const partida = sistema.partidas?.[gameId] || null;
        if (!partida || String(partida.juego || "").trim().toLowerCase() !== "uno") {
          return respond({ ok: false, error: "GAME_NOT_FOUND" });
        }

        const datosUNO = estadosUNO?.[gameId] || null;
        const fromHumanIdRaw = datosUNO?.socketToPlayerId?.[socket.id] || null;
        const fromHumanId =
          fromHumanIdRaw == null ? "" : String(fromHumanIdRaw).trim().toLowerCase();
        if (!datosUNO || !fromHumanId || !datosUNO.engine) {
          return respond({ ok: false, error: "NOT_SUBSCRIBED" });
        }

        try {
          if (!socket?.rooms?.has?.(gameId)) {
            return respond({ ok: false, error: "NOT_IN_ROOM" });
          }
        } catch (e) {}

        const humanIds = Array.isArray(datosUNO.humanIds) ? datosUNO.humanIds : [];
        const fromPlayerIndex = humanIds.indexOf(fromHumanId);
        if (fromPlayerIndex < 0) {
          return respond({ ok: false, error: "NOT_ALLOWED" });
        }

        const toPlayerIndex = Number.parseInt(String(toPlayerId), 10);
        if (!Number.isInteger(toPlayerIndex)) {
          return respond({ ok: false, error: "INVALID_TARGET" });
        }

        const playerCount = Array.isArray(datosUNO.engine?.players) ? datosUNO.engine.players.length : 0;
        if (toPlayerIndex < 0 || toPlayerIndex >= playerCount) {
          return respond({ ok: false, error: "INVALID_TARGET" });
        }

        // No reactions hacia bots (si existe bot, su índice no tiene humanId).
        const toHumanId = humanIds[toPlayerIndex] || null;
        if (!toHumanId) {
          return respond({ ok: false, error: "INVALID_TARGET" });
        }

        if (toPlayerIndex === fromPlayerIndex) {
          return respond({ ok: false, error: "CANNOT_SELF" });
        }

        // Rate-limit por socket (defensa adicional; el cliente también aplica cooldown).
        const now = Date.now();
        const lastTs = Number(socket?.data?.lastReactionSendTs || 0) || 0;
        const COOLDOWN_MS = 2000;
        if (now - lastTs < COOLDOWN_MS) {
          return respond({ ok: false, error: "RATE_LIMIT" });
        }
        try {
          socket.data.lastReactionSendTs = now;
        } catch (e) {}

        const fromName =
          String(datosUNO.engine?.players?.[fromPlayerIndex]?.name || "").trim() ||
          pickDisplayName(partida, fromHumanId, fromHumanId);

        const reactionPayload = {
          id: `${now}-${Math.random().toString(16).slice(2)}`,
          gameId,
          toPlayerId: String(toPlayerIndex),
          emoji,
          fromPlayerId: fromPlayerIndex,
          fromName,
          durationMs: 7000,
          ts: now,
        };

        if (process.env.UNO_DEBUG_REACTIONS === "1") {
          logger.debug("[UNO][REACTION] show", {
            gameId,
            toPlayerId: reactionPayload.toPlayerId,
            fromPlayerId: fromPlayerIndex,
            fromName,
            emoji,
          });
        }

        // Evento canonical para reacciones (y compat hacia clientes antiguos).
        io.to(gameId).emit("reaction:received", reactionPayload);
        io.to(gameId).emit("reaction:show", reactionPayload);

        return respond({ ok: true });
      };

      socket.on("reaction:send", handleUnoReaction);
      socket.on("uno:reaction", handleUnoReaction);

      socket.on("uno_get_state", async function (datos) {
        const codigo = (datos && (datos.codigo || datos.codigoPartida)) || null;
        const email = datos && datos.email;
        if (!codigo) return;

        const partida = sistema.partidas[codigo];
        if (!partida) {
          try {
            socket.emit("uno_error", { codigo, reason: "NOT_FOUND", message: "La partida no existe o ha expirado." });
          } catch (e) {}
          return;
        }
        if (partida.juego !== "uno") {
          try {
            socket.emit("uno_error", { codigo, reason: "GAME_MISMATCH", message: "La partida no es de UNO." });
          } catch (e) {}
          return;
        }

        const playerId = normalizePlayerId(email);
        if (!playerId) {
          try {
            socket.emit("uno_error", { codigo, reason: "INVALID_SESSION", message: "Sesi\u00f3n inv\u00e1lida." });
          } catch (e) {}
          return;
        }

        const belongs =
          Array.isArray(partida.jugadores) &&
          partida.jugadores.some((j) => normalizePlayerId(j.email) === playerId);
        if (!belongs) {
          try {
            socket.emit("uno_error", { codigo, reason: "NOT_IN_ROOM", message: "No perteneces a esta partida." });
          } catch (e) {}
          return;
        }

        trackMatchPresence(codigo, email, socket);

        const datosUNO = ensureUnoState(codigo);
        if (!datosUNO) {
          try {
            socket.emit("uno_error", { codigo, reason: "INVALID_SESSION", message: "Código inválido." });
          } catch (e) {}
          return;
        }
        datosUNO.socketToPlayerId[socket.id] = playerId;
        datosUNO.playerIdToSocketId[playerId] = socket.id;

        const partidaHumanIds = [];
        const partidaHumanNames = [];
        for (const j of partida.jugadores || []) {
          const id = normalizePlayerId(j.email);
          if (!id || partidaHumanIds.includes(id)) continue;
          partidaHumanIds.push(id);
          const fallback = `Jugador ${partidaHumanNames.length + 1}`;
          partidaHumanNames.push(pickDisplayName(partida, id, fallback));
        }
        datosUNO.humanIds = partidaHumanIds;
        datosUNO.humanNames = partidaHumanNames;

        const numHumanPlayers = datosUNO.humanIds.length;
        const shouldHaveBot = numHumanPlayers < 2;
        const desiredNames = shouldHaveBot
          ? [datosUNO.humanNames[0] || "Jugador 1", "Bot"]
          : [...datosUNO.humanNames];
        const desiredNumPlayers = shouldHaveBot ? 2 : numHumanPlayers;

        const existingNames = datosUNO.engine?.players?.map((p) => p.name) || null;
        const needsRecreate =
          !datosUNO.engine ||
          !!datosUNO.engine.hasBot !== shouldHaveBot ||
          (datosUNO.engine.players?.length || 0) !== desiredNumPlayers ||
          !arraysEqual(existingNames, desiredNames);

        if (needsRecreate) {
          clearAllUnoDeadlines(io, codigo, datosUNO);
          const rematch = ensureRematchState(datosUNO);
          rematch.readyByPlayerId = {};
          rematch.inProgress = false;
          const engine = createInitialState({
            numPlayers: desiredNumPlayers,
            names: desiredNames,
          });
          engine.numHumanPlayers = numHumanPlayers;
          engine.hasBot = shouldHaveBot;
          datosUNO.engine = engine;
        } else {
          datosUNO.engine.numHumanPlayers = numHumanPlayers;
          datosUNO.engine.hasBot = shouldHaveBot;
        }

        socket.join(codigo);

        // Emitir estado actual solo a este socket (emitirEstadoUNO ya emite a todos).
        try {
          const sockets = await io.in(codigo).fetchSockets();
          const connectedHumanIds = new Set();
          for (const s of sockets) {
            const human = datosUNO.socketToPlayerId?.[s.id];
            if (human) connectedHumanIds.add(human);
          }

          const canonicalIndex = datosUNO.humanIds.indexOf(playerId);
          const engineView =
            canonicalIndex > 0
              ? rotateEngineForViewer(datosUNO.engine, canonicalIndex)
              : datosUNO.engine;

          const drawCount = engineView?.drawPile?.length ?? 0;
          const safePlayers = (engineView?.players || []).map((p, idx) => {
            const handCount = p?.hand?.length ?? 0;
            const base = {
              id: p?.id,
              name: p?.name,
              handCount,
              hasCalledUno: !!p?.hasCalledUno,
            };
            if (idx === 0) return { ...base, hand: p?.hand || [] };
            return base;
          });
          const { gameLog, logSeq, ...engineRest } = engineView || {};
          const engineSafe = {
            ...engineRest,
            players: safePlayers,
            drawPile: Array.from({ length: drawCount }),
          };

          const playersPublic = (engineSafe.players || []).map((p) => {
            const rawId = p?.id;
            const humanIdForPlayer =
              typeof rawId === "number" && Array.isArray(datosUNO.humanIds)
                ? datosUNO.humanIds[rawId]
                : null;
            const isBot =
              !!engineSafe.hasBot &&
              (humanIdForPlayer == null || humanIdForPlayer === undefined);
            const isConnected = isBot
              ? true
              : !!(humanIdForPlayer && connectedHumanIds.has(humanIdForPlayer));
            return {
              playerId: rawId == null ? "" : String(rawId),
              nick: p?.name ?? "Jugador",
              handCount:
                typeof p?.handCount === "number"
                  ? p.handCount
                  : Array.isArray(p?.hand)
                    ? p.hand.length
                    : 0,
              isBot,
              hasSaidUno: !!p?.hasCalledUno,
              isConnected,
            };
          });

          const turnPlayerIdRaw =
            engineSafe.players?.[engineSafe.currentPlayerIndex]?.id ?? null;
          const playerOrder = (engineSafe.players || []).map((p) =>
            p?.id == null ? "" : String(p.id),
          );

          const payload = {
            codigo,
            meId: engineSafe.players?.[0]?.id == null ? "" : String(engineSafe.players[0].id),
            myPlayerId: engineSafe.players?.[0]?.id ?? null,
            players: playersPublic.map(({ playerId, nick, handCount }) => ({
              id: playerId,
              name: nick,
              handCount,
            })),
            playersPublic,
            myHand: engineSafe.players?.[0]?.hand || [],
            turnIndex: engineSafe.currentPlayerIndex,
            turnPlayerId: turnPlayerIdRaw == null ? "" : String(turnPlayerIdRaw),
            playerOrder,
            direction: engineSafe.direction,
            engine: engineSafe,
          };

          socket.emit("uno_state", payload);
        } catch (e) {
          // Si falla, al menos forzar un broadcast normal.
          await emitirEstadoUNO(io, codigo, datosUNO);
        }
      });

      socket.on("uno_get_log", async function (datos) {
        const codigo = (datos && (datos.codigo || datos.codigoPartida)) || null;
        if (!codigo) return;

        const partida = sistema.partidas[codigo];
        if (!partida) return;
        if (partida.juego !== "uno") return;

        const datosUNO = estadosUNO[codigo];
        if (!datosUNO || !datosUNO.engine) return;

        const email = datos && datos.email;
        const mappedPlayerId = datosUNO.socketToPlayerId?.[socket.id] || null;
        const playerId = mappedPlayerId || normalizePlayerId(email);
        if (!playerId) return;

        const belongs =
          Array.isArray(partida.jugadores) &&
          partida.jugadores.some((j) => normalizePlayerId(j.email) === playerId);
        if (!belongs) return;

        const humanIds = Array.isArray(datosUNO.humanIds) ? datosUNO.humanIds : [];
        const canonicalIndexRaw = humanIds.indexOf(playerId);
        const canonicalIndex = canonicalIndexRaw >= 0 ? canonicalIndexRaw : 0;

        const engine = datosUNO.engine;
        const n = Array.isArray(engine.players) ? engine.players.length : 0;
        const shift = n > 0 ? ((canonicalIndex % n) + n) % n : 0;
        const rotateIndex = (idx) => (idx == null || n <= 0 ? idx : (idx - shift + n) % n);
        const rotateArray = (arr) =>
          Array.isArray(arr) && shift > 0 ? arr.slice(shift).concat(arr.slice(0, shift)) : arr;

        const rawEntries = Array.isArray(engine.gameLog) ? engine.gameLog : [];
        const entries = rawEntries.map((e) => {
          const actor = e?.actor ?? null;
          const details = e?.details && typeof e.details === "object" ? e.details : {};
          const privateDelta =
            e?.privateByPlayerIndex && typeof e.privateByPlayerIndex === "object"
              ? e.privateByPlayerIndex[canonicalIndex]
              : null;

          const before = details?.before && typeof details.before === "object" ? details.before : null;
          const after = details?.after && typeof details.after === "object" ? details.after : null;

          const safeDetails = {
            ...details,
            ...(typeof details?.victimIndex === "number"
              ? { victimIndex: rotateIndex(details.victimIndex) }
              : null),
            ...(before
              ? {
                  before: {
                    ...before,
                    ...(Array.isArray(before.handsCounts)
                      ? { handsCounts: rotateArray(before.handsCounts) }
                      : null),
                  },
                }
              : null),
            ...(after
              ? {
                  after: {
                    ...after,
                    ...(Array.isArray(after.handsCounts)
                      ? { handsCounts: rotateArray(after.handsCounts) }
                      : null),
                  },
                }
              : null),
            ...(privateDelta?.myHandDelta ? { myHandDelta: privateDelta.myHandDelta } : null),
          };

          return {
            t: e?.t,
            seq: e?.seq,
            actor: actor
              ? {
                  ...actor,
                  playerIndex: rotateIndex(actor.playerIndex),
                }
              : { playerIndex: null, name: "System", isBot: false },
            action: e?.action,
            details: safeDetails,
          };
        });

        socket.emit("uno_log", { codigo, entries });
      });

      // Cuando el juego UNO (en /uno) se conecta
      async function handleUnoSubscribe(datos, ack) {
        const codigo = datos && datos.codigo;
        const email  = datos && datos.email;

        const respond = (payload) => {
          if (typeof ack === "function") ack(payload);
        };
        if (!codigo || !email) {
          logger.warn("[UNO] suscribirse sin codigo o email");
          try {
            socket.emit("uno_error", {
              codigo,
              reason: "INVALID_SUBSCRIBE",
              message: "Suscripci\u00f3n inv\u00e1lida: falta c\u00f3digo o sesi\u00f3n.",
            });
          } catch (e) {}
          respond({ ok: false, reason: "INVALID_SUBSCRIBE" });
          return;
        }
        cancelRoomEmptyTimer(codigo);

        const partida = sistema.partidas[codigo];
        if (!partida) {
          logger.warn("[UNO] partida no encontrada", codigo);
          try {
            socket.emit("uno_error", {
              codigo,
              reason: "NOT_FOUND",
              message: "La partida no existe o ha expirado.",
            });
          } catch (e) {}
          respond({ ok: false, reason: "NOT_FOUND" });
          return;
        }
        if (partida.juego !== "uno") {
          logger.warn("[UNO] la partida no es de UNO", codigo, partida.juego);
          try {
            socket.emit("uno_error", {
              codigo,
              reason: "GAME_MISMATCH",
              message: "La partida no es de UNO.",
            });
          } catch (e) {}
          respond({ ok: false, reason: "GAME_MISMATCH" });
          return;
        }

        // Si aún no hemos creado el engine para esta partida, lo creamos
        const emailId = normalizePlayerId(email);
        if (!emailId) return;

        const belongs =
          Array.isArray(partida.jugadores) &&
          partida.jugadores.some((j) => normalizePlayerId(j.email) === emailId);
        if (!belongs) {
          const roomIds = Array.isArray(partida.jugadores)
            ? partida.jugadores
                .map((j) => normalizePlayerId(j && j.email))
                .filter(Boolean)
            : [];
          logger.warn(
            "[UNO] suscripcion rechazada (no pertenece a la partida)",
            { codigo, socketId: socket.id, playerId: emailId, roomIdsCount: roomIds.length }
          );
          try {
            socket.emit("uno_error", {
              codigo,
              reason: "NOT_IN_ROOM",
              message: "No perteneces a esta partida.",
            });
          } catch (e) {}
          respond({ ok: false, reason: "NOT_IN_ROOM", message: "No perteneces a esta partida." });
          return;
        }

        if (!estadosUNO[codigo]) {
          estadosUNO[codigo] = {
            engine: null,
            humanIds: [],
            humanNames: [],
            socketToPlayerId: {},
          };
        }

        const datosUNO = estadosUNO[codigo];
        datosUNO.socketToPlayerId[socket.id] = emailId;

        const partidaHumanIds = [];
        const partidaHumanNames = [];
        for (const j of partida.jugadores || []) {
          const id = normalizePlayerId(j.email);
          if (!id || partidaHumanIds.includes(id)) continue;
          partidaHumanIds.push(id);
          const fallback = `Jugador ${partidaHumanNames.length + 1}`;
          partidaHumanNames.push(pickDisplayName(partida, id, fallback));
        }
        datosUNO.humanIds = partidaHumanIds;
        datosUNO.humanNames = partidaHumanNames;

        const numHumanPlayers = datosUNO.humanIds.length;
        const shouldHaveBot = numHumanPlayers < 2;
        const desiredNames = shouldHaveBot
          ? [datosUNO.humanNames[0] || "Jugador 1", "Bot"]
          : [...datosUNO.humanNames];
        const desiredNumPlayers = shouldHaveBot ? 2 : numHumanPlayers;

        const existingNames = datosUNO.engine?.players?.map((p) => p.name) || null;
        const needsRecreate =
          !datosUNO.engine ||
          !!datosUNO.engine.hasBot !== shouldHaveBot ||
          (datosUNO.engine.players?.length || 0) !== desiredNumPlayers ||
          !arraysEqual(existingNames, desiredNames);

        if (needsRecreate) {
          clearAllUnoDeadlines(io, codigo, datosUNO);
          const rematch = ensureRematchState(datosUNO);
          rematch.readyByPlayerId = {};
          rematch.inProgress = false;
          const engine = createInitialState({
            numPlayers: desiredNumPlayers,
            names: desiredNames,
          });
          engine.numHumanPlayers = numHumanPlayers;
          engine.hasBot = shouldHaveBot;
          datosUNO.engine = engine;
        } else {
          datosUNO.engine.numHumanPlayers = numHumanPlayers;
          datosUNO.engine.hasBot = shouldHaveBot;
        }

        // Este socket entra en la room de la partida
        socket.join(codigo);

        await emitirEstadoUNO(io, codigo, datosUNO);

        if (datosUNO.engine && datosUNO.engine.status === "finished") {
          emitRematchStatus(io, codigo, datosUNO, { socket });
        }

        // Si hay un requisito UNO vigente, reenviarlo a este socket (útil en reconexión).
        try {
          const unoTimers = ensureUnoTimers(datosUNO);
          for (const key of Object.keys(unoTimers.deadlinesByPlayerId || {})) {
            socket.emit("uno:uno_required", {
              codigo,
              playerId: isNaN(Number(key)) ? key : Number(key),
              deadlineTs: unoTimers.deadlinesByPlayerId[key],
              windowMs: UNO_CALL_WINDOW_MS,
            });
          }
        } catch (e) {
          logger.warn("[UNO] error reenviando uno_required al suscribir", e?.message || e);
        }

        respond({ ok: true });
      }

      socket.on("uno:suscribirse", handleUnoSubscribe);

      // Cuando un jugador realiza una acción en el UNO
      socket.on("uno:rematch_ready", async function(datos) {
        const codigo = datos && datos.codigo;
        const email = datos && datos.email;
        if (!codigo || !email) return;

        const partida = sistema.partidas[codigo];
        const datosUNO = estadosUNO[codigo];
        if (!partida || !datosUNO || !datosUNO.engine) return;
        if (partida.juego !== "uno") return;

        if (datosUNO.engine.status !== "finished") {
          logger.debug("[UNO][REMATCH] ready ignorado (partida no finalizada)", {
            codigo,
          });
          return;
        }

        const playerId = normalizePlayerId(email);
        if (!playerId) return;
        if (!datosUNO.humanIds.includes(playerId)) {
          logger.warn("[UNO][REMATCH] ready rechazado (no pertenece)", {
            codigo,
            email,
            playerId,
          });
          return;
        }

        const rematch = ensureRematchState(datosUNO);
        const key = String(playerId);
        if (rematch.readyByPlayerId[key]) {
          emitRematchStatus(io, codigo, datosUNO);
          return;
        }

        rematch.readyByPlayerId[key] = true;
        emitRematchStatus(io, codigo, datosUNO);

        const activePlayerIds = Array.isArray(datosUNO.humanIds) ? datosUNO.humanIds : [];
        const readyPlayerIds = activePlayerIds.filter(
          (id) => !!rematch.readyByPlayerId[String(id)],
        );

        logger.debug("[UNO][REMATCH] ready", {
          codigo,
          playerId,
          ready: readyPlayerIds.length,
          total: activePlayerIds.length,
          readyPlayerIds,
          round: rematch.round,
          inProgress: rematch.inProgress,
        });

        if (rematch.inProgress) return;
        if (activePlayerIds.length === 0) return;
        if (readyPlayerIds.length !== activePlayerIds.length) return;

        rematch.inProgress = true;
        rematch.round += 1;

        try {
          clearAllUnoDeadlines(io, codigo, datosUNO);

          const numHumanPlayers = activePlayerIds.length;
          const shouldHaveBot = numHumanPlayers < 2;
          const desiredNames = shouldHaveBot
            ? [pickDisplayName(partida, activePlayerIds[0], email), "Bot"]
            : activePlayerIds.map((id) => pickDisplayName(partida, id, id));
          const desiredNumPlayers = shouldHaveBot ? 2 : numHumanPlayers;

          const engine = createInitialState({
            numPlayers: desiredNumPlayers,
            names: desiredNames,
          });
          engine.numHumanPlayers = numHumanPlayers;
          engine.hasBot = shouldHaveBot;
          datosUNO.engine = engine;

          rematch.readyByPlayerId = {};

          logger.debug("[UNO][REMATCH] start", {
            codigo,
            round: rematch.round,
            players: engine.players?.map((p) => p.name),
            numHumanPlayers: engine.numHumanPlayers,
            hasBot: engine.hasBot,
          });

          io.to(codigo).emit("uno:rematch_start", {
            codigo,
            round: rematch.round,
          });

          syncUnoDeadlinesFromEngine(io, codigo, datosUNO);
          await emitirEstadoUNO(io, codigo, datosUNO);
        } finally {
          rematch.inProgress = false;
          emitRematchStatus(io, codigo, datosUNO);
        }
      });

      socket.on("uno:uno_call", async function(datos) {
        const codigo = datos && datos.codigo;
        const email = datos && datos.email;
        if (!codigo || !email) return;

        const partida = sistema.partidas[codigo];
        const datosUNO = estadosUNO[codigo];
        if (!partida || !datosUNO || !datosUNO.engine) return;
        if (partida.juego !== "uno") return;

        const playerId = normalizePlayerId(email);
        const playerIndex = datosUNO.humanIds.indexOf(playerId);
        if (playerIndex === -1) return;

        const handled = await tryHandleUnoCallByIndex(io, codigo, datosUNO, playerIndex);
        if (handled) {
          syncUnoDeadlinesFromEngine(io, codigo, datosUNO);
          await emitirEstadoUNO(io, codigo, datosUNO);
        }
      });

      socket.on("uno:accion", async function(datos) {
        const codigo = datos && datos.codigo;
        const email  = datos && datos.email;
        const action = datos && datos.action;
        if (!codigo || !email || !action) {
          logger.warn("[UNO] accion con datos incompletos", datos);
          return;
        }

        const partida = sistema.partidas[codigo];
        const datosUNO = estadosUNO[codigo];
        if (!partida || !datosUNO || !datosUNO.engine) {
          logger.warn("[UNO] partida o engine no encontrados", codigo);
          return;
        }
        if (partida.juego !== "uno") {
          logger.warn("[UNO] partida no es de UNO al recibir accion", codigo);
          return;
        }

        // Buscamos el índice del jugador según el Sistema
        const playerId = normalizePlayerId(email);
        const playerIndex = datosUNO.humanIds.indexOf(playerId);
        if (playerIndex === -1) {
          logger.warn("[UNO] jugador no pertenece a la partida/estado", email, codigo);
          return;
        }

        if (action.type === ACTION_TYPES.CALL_UNO) {
          const handled = await tryHandleUnoCallByIndex(io, codigo, datosUNO, playerIndex);
          if (handled) {
            syncUnoDeadlinesFromEngine(io, codigo, datosUNO);
            await emitirEstadoUNO(io, codigo, datosUNO);
          }
          return;
        }

        if (action.type === ACTION_TYPES.PASS_TURN) {
          const doublePlay = datosUNO.engine?.doublePlay ?? null;
          const allowed =
            !!doublePlay &&
            doublePlay.playerIndex === playerIndex &&
            (doublePlay.remaining ?? null) === 0;
          if (!allowed) return;
        }

        const fullAction = { ...action, playerIndex };
        const prevReshuffleSeq = Number.isFinite(datosUNO.engine?.reshuffleSeq)
          ? datosUNO.engine.reshuffleSeq
          : 0;
        let engineAfterHuman = applyAction(datosUNO.engine, fullAction);
        engineAfterHuman = ensureLastCardAnnouncementForBots(io, codigo, datosUNO, engineAfterHuman);

        datosUNO.engine = engineAfterHuman;
        emitReshuffleIfNeeded(io, codigo, prevReshuffleSeq, datosUNO.engine);
        if (fullAction.type === ACTION_TYPES.PLAY_CARD) {
          const byPlayerId = datosUNO.engine.players?.[playerIndex]?.id ?? playerIndex;
          const effect = deriveActionEffectFromCard(datosUNO.engine.lastAction?.card, byPlayerId);
          if (effect) io.to(codigo).emit("uno:action_effect", { codigo, ...effect });
        }

        syncUnoDeadlinesFromEngine(io, codigo, datosUNO);
        await emitirEstadoUNO(io, codigo, datosUNO);

        // Orquestar turno del bot (con delay visible) sin bloquear el handler.
        if (datosUNO.engine?.hasBot && datosUNO.engine?.currentPlayerIndex === 1) {
          runBotTurnLoop(io, codigo, datosUNO);
        }
      });

      socket.on("uno_reload_deck", async function (datos) {
        const codigo = (datos && (datos.codigo || datos.codigoPartida)) || null;
        const email = datos && datos.email;
        if (!codigo) return;

        const partida = sistema.partidas[codigo];
        const datosUNO = estadosUNO[codigo];
        if (!partida || !datosUNO || !datosUNO.engine) {
          socket.emit("uno_error", {
            codigo,
            reason: "missing_game",
            message: "No se pudo recargar el mazo: partida no encontrada.",
          });
          return;
        }
        if (partida.juego !== "uno") return;

        const playerId =
          datosUNO.socketToPlayerId?.[socket.id] || normalizePlayerId(email);
        if (!playerId) {
          socket.emit("uno_error", {
            codigo,
            reason: "unauthorized",
            message: "No se pudo recargar el mazo: no autorizado.",
          });
          return;
        }

        const belongs =
          Array.isArray(partida.jugadores) &&
          partida.jugadores.some((j) => normalizePlayerId(j.email) === playerId);
        if (!belongs) {
          socket.emit("uno_error", {
            codigo,
            reason: "not_in_game",
            message: "No perteneces a esta partida.",
          });
          return;
        }

        const playerIndex = Array.isArray(datosUNO.humanIds)
          ? datosUNO.humanIds.indexOf(playerId)
          : -1;
        if (playerIndex === -1) {
          socket.emit("uno_error", {
            codigo,
            reason: "not_in_state",
            message: "No se pudo recargar el mazo: jugador no registrado en el estado.",
          });
          return;
        }

        if (datosUNO.engine.status !== "playing") {
          socket.emit("uno_error", {
            codigo,
            reason: "not_playing",
            message: "La partida no est\u00e1 en curso.",
          });
          return;
        }

        if (datosUNO.engine.currentPlayerIndex !== playerIndex) {
          socket.emit("uno_error", {
            codigo,
            reason: "not_your_turn",
            message: "Solo puedes recargar el mazo en tu turno.",
          });
          return;
        }

        const res = refillDeckFromDiscard(datosUNO.engine, { reason: "manual" });
        if (!res.ok) {
          const msg =
            res.reason === "not_empty"
              ? "El mazo todav\u00eda tiene cartas."
              : res.reason === "not_enough_discard"
                ? "No hay suficientes cartas en el descarte para recargar."
                : "No se pudo recargar el mazo.";
          socket.emit("uno_error", { codigo, reason: res.reason, message: msg });
          return;
        }

        io.to(codigo).emit("uno_deck_reloaded", {
          codigo,
          movedCount: res.movedCount,
          timestamp: Date.now(),
          seq: res.seq ?? null,
        });

        syncUnoDeadlinesFromEngine(io, codigo, datosUNO);
        await emitirEstadoUNO(io, codigo, datosUNO);
      });

      // ==========================
      //  DAMAS / CHECKERS (WS)
      // ==========================

      const resolveCheckersPlayers = (partida, codigo) => {
        const raw = Array.isArray(partida?.jugadores) ? partida.jugadores.slice(0, 2) : [];
        return raw
          .map((j, idx) => {
            const isBot =
              !!(j && (j.isBot === true || normalizePlayerId(j.email) === "bot@local"));
            const id = isBot ? `bot:${codigo}` : publicUserIdFromEmail(j?.email);
            if (!id) return null;
            const fallbackName = idx === 0 ? "Jugador 1" : "Jugador 2";
            const name = isBot ? "Bot" : safePublicName(j?.nick, fallbackName);
            return {
              color: idx === 0 ? "white" : "black",
              id,
              name,
            };
          })
          .filter(Boolean);
      };

      const isDamasGame = (partida) =>
        partida?.juego === "damas" || partida?.juego === "checkers";

      const emitDamasError = (socket, payload) => {
        try { socket.emit("damas_error", payload); } catch {}
        try { socket.emit("checkers_error", payload); } catch {}
      };

      function handleDamasJoin(datos) {
        const codigo = datos && datos.codigo;
        const email = datos && datos.email;
        if (!codigo || !email) return;
        cancelRoomEmptyTimer(codigo);

        const partida = sistema.partidas[codigo];
        if (!partida) return;
        if (!isDamasGame(partida)) return;
        if (partida.status !== "STARTED") {
          emitDamasError(socket, {
            codigo,
            reason: "NOT_STARTED",
            message: "La partida no está iniciada.",
          });
          return;
        }

        const playerId = normalizePlayerId(email);
        if (!playerId) return;

        const belongs =
          Array.isArray(partida.jugadores) &&
          partida.jugadores.some((j) => normalizePlayerId(j.email) === playerId);
        if (!belongs) {
          emitDamasError(socket, {
            codigo,
            reason: "NOT_IN_MATCH",
            message: "No perteneces a esta partida.",
          });
          return;
        }

        try {
          const playersLen = Array.isArray(partida.jugadores) ? partida.jugadores.length : 0;
          const hasState = !!estadosCheckers?.[codigo]?.state;
          logger.debug("[SUBSCRIBE]", { matchCode: codigo, gameKey: String(partida.juego || "damas"), mode: partida.mode, players: playersLen, hasState });
        } catch (e) {}

        socketToCheckersPlayerId[socket.id] = playerId;
        socketToCheckersCodigo[socket.id] = codigo;

        ensureCheckersState(codigo, partida, { reason: "subscribe" });

        trackMatchPresence(codigo, email, socket);
        socket.join(codigo);
        emitirEstadoCheckers(io, codigo, estadosCheckers[codigo]);
      }

      socket.on("damas_join", handleDamasJoin);
      socket.on("checkers_join", handleDamasJoin);

      const onDamasMove = function (datos) {
        const codigo = datos && datos.codigo;
        const email = datos && datos.email;
        const from = datos && datos.from;
        const to = datos && datos.to;
        if (!codigo || !email || !from || !to) return;

        const partida = sistema.partidas[codigo];
        if (!partida) return;
        if (!isDamasGame(partida)) return;
        if (partida.status !== "STARTED") {
          emitDamasError(socket, {
            codigo,
            reason: "NOT_STARTED",
            message: "La partida no está iniciada.",
          });
          return;
        }

        const emailId = normalizePlayerId(email);
        if (!emailId) return;

        const belongs =
          Array.isArray(partida.jugadores) &&
          partida.jugadores.some((j) => normalizePlayerId(j?.email) === emailId);
        if (!belongs) {
          emitDamasError(socket, {
            codigo,
            reason: "NOT_IN_MATCH",
            message: "No perteneces a esta partida.",
          });
          return;
        }

        ensureCheckersState(codigo, partida, { reason: "move" });

        const datosCheckers = estadosCheckers[codigo];
        const players = Array.isArray(datosCheckers?.players) ? datosCheckers.players : [];
        const publicId = publicUserIdFromEmail(email);
        const me =
          players.find(
            (p) =>
              normalizePlayerId(p?.id) === normalizePlayerId(publicId) ||
              normalizePlayerId(p?.id) === emailId,
          ) || null;
        const myColor = me?.color || null;
        if (!myColor) {
          emitDamasError(socket, {
            codigo,
            reason: "NOT_IN_MATCH",
            message: "No perteneces a esta partida.",
          });
          return;
        }
        if (players.length < 2) {
          emitDamasError(socket, {
            codigo,
            reason: "WAITING_FOR_OPPONENT",
            message: "Esperando al segundo jugador...",
          });
          return;
        }

        try {
          if (datosCheckers.state?.status === "finished") {
            emitDamasError(socket, {
              codigo,
              reason: "FINISHED",
              message: "La partida ya ha terminado.",
            });
            return;
          }
          datosCheckers.state = applyCheckersMove(datosCheckers.state, {
            from,
            to,
            player: myColor,
          });
          emitirEstadoCheckers(io, codigo, datosCheckers);
          maybeBotMoveCheckers(io, codigo);
        } catch (e) {
          const reason =
            e instanceof CheckersError ? e.code : (e && e.code) || "ERROR";
          const message =
            e instanceof CheckersError
              ? e.message
              : (e && e.message) || "Movimiento inválido.";
          emitDamasError(socket, { codigo, reason, message });
        }
      };

      socket.on("damas_move", onDamasMove);
      socket.on("checkers_move", onDamasMove);

      const handleCheckersRematchRequest = function(datos) {
        const codigo = String((datos && (datos.codigo || datos.matchCode)) || "").trim();
        const email = datos?.email;
        const userIdRaw = normalizePlayerId(datos?.userId || datos?.uid || "");
        const userId = userIdRaw || (email ? publicUserIdFromEmail(email) : "");
        if (!codigo || !userId) return;

        const partida = sistema.partidas[codigo];
        if (!partida || !isDamasGame(partida) || isBotMatch(partida)) return;

        const rematch = ensureCheckersRematchRecord(codigo, partida);
        if (!rematch || !rematch.active) return;

        const requiredUids = getCheckersMatchPlayerUids(partida);
        if (requiredUids.length < 2) {
          cancelCheckersRematch(io, codigo, "not_enough_players");
          return;
        }
        if (!requiredUids.includes(userId)) return;

        rematch.votes.add(userId);
        logger.debug("[CHECKERS REMATCH] request", {
          matchCode: codigo,
          userId,
          votes: rematch.votes.size,
          required: requiredUids.length,
        });
        emitCheckersRematchState(io, codigo, partida);

        if (rematch.started || rematch.votes.size < requiredUids.length) return;

        rematch.started = true;
        rematch.active = false;
        rematch.createdAt = Date.now();
        if (rematch.timeout) {
          try { clearTimeout(rematch.timeout); } catch (e) {}
        }
        rematch.timeout = null;
        rematch.votes = new Set();
        if (partida) partida.rematch = rematch;

        if (!estadosCheckers[codigo]) {
          estadosCheckers[codigo] = {
            state: createCheckersInitialState(),
            players: resolveCheckersPlayers(partida, codigo),
          };
        } else {
          estadosCheckers[codigo].state = createCheckersInitialState();
          estadosCheckers[codigo].players = resolveCheckersPlayers(partida, codigo);
        }

        const newState = estadosCheckers[codigo].state;
        partida.status = "STARTED";

        logger.debug("[CHECKERS REMATCH] start", { matchCode: codigo });

        io.to(codigo).emit("checkers:rematch_start", { matchCode: codigo, codigo, newState });
        io.to(codigo).emit("damas:rematch_start", { matchCode: codigo, codigo, newState });
        io.to(codigo).emit("damas_restart", { codigo });
        io.to(codigo).emit("checkers_restart", { codigo });
        emitirEstadoCheckers(io, codigo, estadosCheckers[codigo]);
        emitCheckersRematchState(io, codigo, partida);
      };

      // New API (preferred)
      socket.on("checkers:rematch_request", handleCheckersRematchRequest);
      socket.on("damas:rematch_request", handleCheckersRematchRequest);
      // Backwards-compatible API
      socket.on("checkers:rematch_vote", handleCheckersRematchRequest);
      socket.on("damas:rematch_vote", handleCheckersRematchRequest);

      const onDamasRestart = function (datos) {
        const codigo = datos && datos.codigo;
        const email = datos && datos.email;
        if (!codigo || !email) return;

        const partida = sistema.partidas[codigo];
        if (!partida) return;
        if (!isDamasGame(partida)) return;
        if (partida.status !== "STARTED") {
          emitDamasError(socket, {
            codigo,
            reason: "NOT_STARTED",
            message: "La partida no está iniciada.",
          });
          return;
        }

        const playerId = normalizePlayerId(email);
        if (!playerId) return;

        const belongs =
          Array.isArray(partida.jugadores) &&
          partida.jugadores.some((j) => normalizePlayerId(j.email) === playerId);
        if (!belongs) {
          emitDamasError(socket, {
            codigo,
            reason: "NOT_IN_MATCH",
            message: "No perteneces a esta partida.",
          });
          return;
        }

        if (!estadosCheckers[codigo]) {
          estadosCheckers[codigo] = {
            state: createCheckersInitialState(),
            players: resolveCheckersPlayers(partida, codigo),
          };
        } else {
          estadosCheckers[codigo].players = resolveCheckersPlayers(partida, codigo);
        }

        const datosCheckers = estadosCheckers[codigo];
        const players = Array.isArray(datosCheckers.players) ? datosCheckers.players : [];
        if (players.length < 2) {
          emitDamasError(socket, {
            codigo,
            reason: "WAITING_FOR_OPPONENT",
            message: "Esperando al segundo jugador...",
          });
          return;
        }

        if (datosCheckers.state?.status !== "finished") {
          emitDamasError(socket, {
            codigo,
            reason: "NOT_FINISHED",
            message: "La partida todavía está en curso.",
          });
          return;
        }

        if (partida.mode === "PVBOT") {
          const hostEmail = normalizePlayerId(partida.propietarioEmail || email);
          try {
            if (!hostEmail) throw new Error("no se pudo resolver hostEmail");

            const newCodigo = sistema.crearPartida(hostEmail, partida.juego, 2, {
              mode: "PVBOT",
              vsBot: true,
            });
            if (newCodigo === -1) throw new Error("no se pudo crear partida vs bot");

            const contRes = sistema.continuarPartida(hostEmail, newCodigo);
            const contCodigo = contRes && typeof contRes === "object" ? contRes.codigo : contRes;
            if (contCodigo === -1) throw new Error("no se pudo iniciar la partida vs bot");

            try {
              sistema.eliminarPartida(hostEmail, codigo);
            } catch {
              // best-effort
            }
            if (sistema.partidas && sistema.partidas[codigo]) {
              delete sistema.partidas[codigo];
            }

            delete estadosCheckers[codigo];
            delete botRunningByCodigo[codigo];

            io.to(codigo).emit("damas_restart", { codigo, newCodigo });
            io.to(codigo).emit("checkers_restart", { codigo, newCodigo });

            const lista = sistema.obtenerPartidasDisponibles(partida.juego);
            srv.enviarGlobal(io, "listaPartidas", sanitizeListaPartidasPublic(lista));
          } catch (e) {
            logger.warn("[CHECKERS] fallo creando nueva vs bot:", e?.message || e);
            emitDamasError(socket, {
              codigo,
              reason: "RESTART_FAILED",
              message: "No se pudo iniciar la revancha.",
            });
          }
          return;
        }

        // PVP: require BOTH players to accept rematch.
        handleCheckersRematchRequest({ codigo, email });
      };

      socket.on("damas_restart", onDamasRestart);
      socket.on("checkers_restart", onDamasRestart);

      // ==========================
      //  4 EN RAYA MULTIJUGADOR (WS)
      // ==========================

      socket.on("4raya:suscribirse", function(datos) {
        const codigo = datos && datos.codigo;
        const email = datos && datos.email;
        if (!codigo || !email) return;

        const partida = sistema.partidas[codigo];
        if (!partida) return;
        if (partida.juego !== "4raya") return;

        const playerId = normalizePlayerId(email);
        if (!playerId) return;

        const belongs =
          Array.isArray(partida.jugadores) &&
          partida.jugadores.some((j) => normalizePlayerId(j.email) === playerId);
        if (!belongs) {
          logger.warn("[4RAYA] suscripcion rechazada (no pertenece a la partida)", email, codigo);
          return;
        }

        try {
          const playersLen = Array.isArray(partida.jugadores) ? partida.jugadores.length : 0;
          const hasState = !!estados4raya?.[codigo]?.engine;
          logger.debug("[SUBSCRIBE]", { matchCode: codigo, gameKey: "4raya", mode: partida.mode, players: playersLen, hasState });
        } catch (e) {}

        socketTo4RayaPlayerId[socket.id] = playerId;
        socketTo4RayaCodigo[socket.id] = codigo;

        ensureConnect4State(codigo, partida, { reason: "subscribe" });

        trackMatchPresence(codigo, email, socket);
        socket.join(codigo);
        emitirEstado4Raya(io, codigo, estados4raya[codigo]);
      });

      socket.on("4raya:accion", function(datos) {
        const codigo = datos && datos.codigo;
        const email = datos && datos.email;
        const action = datos && datos.action;
        if (!codigo || !email || !action) return;

        const partida = sistema.partidas[codigo];
        const datos4Raya = estados4raya[codigo];
        if (!partida || !datos4Raya || !datos4Raya.engine) return;
        if (partida.juego !== "4raya") return;

        const emailId = normalizePlayerId(email);
        const belongs =
          Array.isArray(partida.jugadores) &&
          partida.jugadores.some((j) => normalizePlayerId(j?.email) === emailId);
        if (!belongs) {
          logger.warn("[4RAYA] accion rechazada (no pertenece a la partida)", codigo);
          return;
        }

        const playerId = publicUserIdFromEmail(email);
        const playerIndex = (datos4Raya.engine.players || []).findIndex(
          (p) => String(p?.id || "").trim().toLowerCase() === String(playerId || "").trim().toLowerCase(),
        );
        if (playerIndex === -1) {
          logger.warn("[4RAYA] jugador no pertenece a la partida", email, codigo);
          return;
        }

        const prevEngine = datos4Raya.engine;
        datos4Raya.engine = applyConnect4Action(prevEngine, {
          ...action,
          playerIndex,
        });

        emitirEstado4Raya(io, codigo, datos4Raya);
        if (datos4Raya.engine !== prevEngine) {
          maybeBotMoveConnect4(io, codigo);
        }
      });

      socket.on("4raya:rematch_request", function(datos) {
        const codigo = datos && datos.codigo;
        const email = datos && datos.email;
        if (!codigo || !email) return;

        const partida = sistema.partidas[codigo];
        const datos4Raya = estados4raya[codigo];
        if (!partida || !datos4Raya || !datos4Raya.engine) return;
        if (partida.juego !== "4raya") return;
        if (datos4Raya.engine.status !== "finished") return;

        const playerId = normalizePlayerId(email);
        const belongs =
          Array.isArray(partida.jugadores) &&
          partida.jugadores.some((j) => normalizePlayerId(j.email) === playerId);
        if (!belongs) return;

        if (partida.mode === "PVBOT") {
          const hostEmail = normalizePlayerId(partida.propietarioEmail || email);
          try {
            if (!hostEmail) throw new Error("no se pudo resolver hostEmail");

            const newCodigo = sistema.crearPartida(hostEmail, "4raya", 2, {
              mode: "PVBOT",
              vsBot: true,
            });
            if (newCodigo === -1) throw new Error("no se pudo crear partida vs bot");

            const contRes = sistema.continuarPartida(hostEmail, newCodigo);
            const contCodigo = contRes && typeof contRes === "object" ? contRes.codigo : contRes;
            if (contCodigo === -1) throw new Error("no se pudo iniciar la partida vs bot");

            try {
              sistema.eliminarPartida(hostEmail, codigo);
            } catch {
              // best-effort
            }
            if (sistema.partidas && sistema.partidas[codigo]) {
              delete sistema.partidas[codigo];
            }

            delete estados4raya[codigo];
            delete rematchVotes4raya[codigo];

            io.to(codigo).emit("4raya:rematch_ready", { codigo, newCodigo });

            const lista = sistema.obtenerPartidasDisponibles("4raya");
            srv.enviarGlobal(io, "listaPartidas", sanitizeListaPartidasPublic(lista));
          } catch (e) {
            logger.warn("[4RAYA] fallo creando revancha vs bot:", e?.message || e);
            io.to(codigo).emit("4raya:rematch_ready", {
              codigo,
              newCodigo: null,
              error: "No se pudo iniciar la revancha.",
            });
          }
          return;
        }

        if (!rematchVotes4raya[codigo]) rematchVotes4raya[codigo] = new Set();
        rematchVotes4raya[codigo].add(playerId);

        const players = (partida.jugadores || []).slice(0, 2);
        const total = players.length;
        const ready = rematchVotes4raya[codigo].size;

        if (total >= 2 && ready >= 2) {
          const hostEmail = normalizePlayerId(partida.propietarioEmail || players[0]?.email);
          const otherEmail = normalizePlayerId(
            players.find((j) => normalizePlayerId(j.email) && normalizePlayerId(j.email) !== hostEmail)
              ?.email || players[1]?.email,
          );

          try {
            if (!hostEmail || !otherEmail || hostEmail === otherEmail) {
              throw new Error("no se pudieron resolver los emails de revancha");
            }

            const newCodigo = sistema.crearPartida(hostEmail, "4raya", 2);
            if (newCodigo === -1) throw new Error("no se pudo crear partida revancha");

            const joinRes = sistema.unirAPartida(otherEmail, newCodigo);
            const joinedCodigo = joinRes && typeof joinRes === "object" ? joinRes.codigo : joinRes;
            if (joinedCodigo === -1) throw new Error("no se pudo unir rival a la revancha");

            const contRes = sistema.continuarPartida(hostEmail, newCodigo);
            const contCodigo = contRes && typeof contRes === "object" ? contRes.codigo : contRes;
            if (contCodigo === -1) throw new Error("no se pudo iniciar la revancha");

            try {
              sistema.eliminarPartida(hostEmail, codigo);
            } catch {
              // best-effort
            }
            if (sistema.partidas && sistema.partidas[codigo]) {
              delete sistema.partidas[codigo];
            }

            delete estados4raya[codigo];
            delete rematchVotes4raya[codigo];

            io.to(codigo).emit("4raya:rematch_ready", { codigo, newCodigo });

            const lista = sistema.obtenerPartidasDisponibles("4raya");
            srv.enviarGlobal(io, "listaPartidas", sanitizeListaPartidasPublic(lista));
          } catch (e) {
            logger.warn("[4RAYA] fallo creando revancha:", e?.message || e);
            io.to(codigo).emit("4raya:rematch_ready", {
              codigo,
              newCodigo: null,
              error: "No se pudo iniciar la revancha.",
            });
          }
        }
      });

      socket.on("disconnect", function() {
        // Evitar leaks de mapeo socket->playerId
        for (const [codigo, datosUNO] of Object.entries(estadosUNO)) {
          const raw = datosUNO?.socketToPlayerId?.[socket.id] || null;
          if (!raw) continue;
          delete datosUNO.socketToPlayerId[socket.id];

          const playerId = String(raw).trim().toLowerCase();

          // Informar al resto de la room (UNO) y cancelar rematch si estaba en votación.
          try {
            const partida = sistema.partidas?.[codigo] || null;
            if (partida && String(partida.juego || "").trim().toLowerCase() === "uno") {
              const humanIds = Array.isArray(datosUNO?.humanIds) ? datosUNO.humanIds : [];
              const playerIndex = playerId ? humanIds.indexOf(playerId) : -1;
              const playerName =
                (playerIndex >= 0
                  ? String(datosUNO?.engine?.players?.[playerIndex]?.name || "").trim()
                  : "") ||
                pickDisplayName(partida, playerId, playerId || "Jugador") ||
                "Jugador";

              io.to(codigo).emit("player:left", {
                gameId: codigo,
                gameType: "uno",
                playerId: playerIndex >= 0 ? playerIndex : playerId,
                playerName,
                ts: Date.now(),
              });

              const rematch = datosUNO?.rematch || null;
              const readyBy = rematch?.readyByPlayerId || null;
              const hasVotes =
                readyBy && typeof readyBy === "object" && Object.keys(readyBy).length > 0;
              const inFinished = String(datosUNO?.engine?.status || "") === "finished";
              if (inFinished && hasVotes && !rematch?.inProgress) {
                rematch.readyByPlayerId = {};
                rematch.inProgress = false;
                io.to(codigo).emit("rematch:cancelled", {
                  gameId: codigo,
                  gameType: "uno",
                  reason: "PLAYER_LEFT",
                  playerName,
                  ts: Date.now(),
                });
                emitRematchStatus(io, codigo, datosUNO);
              }
            }
          } catch (e) {}

          if (playerId && datosUNO?.playerIdToSocketId?.[playerId] === socket.id) {
            delete datosUNO.playerIdToSocketId[playerId];
          }
        }

        const code4 = socketTo4RayaCodigo[socket.id];
        const pid4 = socketTo4RayaPlayerId[socket.id];
        if (code4 && pid4 && rematchVotes4raya[code4]) {
          rematchVotes4raya[code4].delete(pid4);
          if (rematchVotes4raya[code4].size === 0) {
            delete rematchVotes4raya[code4];
          } else {
            io.to(code4).emit("4raya:rematch_ready", {
              codigo: code4,
              newCodigo: null,
              error: "El otro jugador se ha desconectado.",
            });
            delete rematchVotes4raya[code4];
          }
        }
        delete socketTo4RayaCodigo[socket.id];
        delete socketTo4RayaPlayerId[socket.id];
        delete socketToCheckersCodigo[socket.id];
        delete socketToCheckersPlayerId[socket.id];

        try {
          handleSocketDisconnectPresence(io, sistema, socket);
        } catch (e) {}

        // If any match rooms became empty due to this disconnect, delete after grace.
        try {
          const rooms = Array.from(socket.rooms || []);
          for (const codigo of rooms) {
            if (!codigo || codigo === socket.id) continue;
            const partida = sistema.partidas?.[codigo];
            if (!partida) continue;
            if (isRoomEmpty(io, codigo)) {
              scheduleDeleteIfStillEmpty(io, sistema, codigo);
            }
          }
        } catch (e) {}
      });

    });

  };
}

module.exports.ServidorWS = ServidorWS;
