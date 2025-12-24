const {
  createInitialState,
  applyAction,
  ACTION_TYPES,
  COLORS,
  getPlayableCards,
  getNextPlayerIndex,
} = require("./game/unoEngineMultiplayer");

const UNO_CALL_WINDOW_MS = (() => {
  const parsed = Number.parseInt(process.env.UNO_CALL_WINDOW_MS, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
})();

function ServidorWS() {
  let srv = this;
  const estadosUNO = {};

  const normalizePlayerId = (value) =>
    (value || "").toString().trim().toLowerCase();

  const pickDisplayName = (partida, playerId, fallback) => {
    if (!partida || !Array.isArray(partida.jugadores)) return fallback;
    const found = partida.jugadores.find(
      (j) => normalizePlayerId(j.email) === playerId
    );
    return (found && (found.nick || found.email)) || fallback;
  };

  const arraysEqual = (a, b) =>
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((v, i) => v === b[i]);

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

  const runBotTurnsIfNeeded = (engine) => {
    if (!engine || !engine.hasBot) return engine;

    let updated = engine;
    let safety = 0;
    while (
      updated.status === "playing" &&
      updated.currentPlayerIndex === 1 &&
      safety < 25
    ) {
      safety++;

      let playable = getPlayableCards(updated, 1);
      while (playable.length === 0 && updated.drawPile.length > 0) {
        updated = applyAction(updated, {
          type: ACTION_TYPES.DRAW_CARD,
          playerIndex: 1,
        });
        playable = getPlayableCards(updated, 1);
      }

      if (playable.length > 0) {
        const card = playable[0];
        const needsColor = card.color === "wild";
        updated = applyAction(updated, {
          type: ACTION_TYPES.PLAY_CARD,
          playerIndex: 1,
          cardId: card.id,
          ...(needsColor ? { chosenColor: chooseBotColor(updated, 1) } : {}),
        });
        continue;
      }

      // Sin jugadas posibles y sin mazo: pasar turno manualmente.
      updated = {
        ...updated,
        currentPlayerIndex: getNextPlayerIndex(updated, 1, 1),
      };
    }

    return updated;
  };

  const deriveActionEffectFromCard = (card, byPlayerId) => {
    if (!card) return null;
    if (card.value === "+2") return { type: "+2", value: 2, byPlayerId };
    if (card.value === "+4") return { type: "+4", value: 4, color: card.color, byPlayerId };
    if (card.value === "skip") return { type: "SKIP", byPlayerId };
    if (card.value === "reverse") return { type: "REVERSE", byPlayerId };
    if (card.value === "wild") return { type: "WILD", color: card.color, byPlayerId };
    return null;
  };

  const runBotTurnsIfNeededWithEffects = (engine) => {
    if (!engine || !engine.hasBot) return { engine, effects: [] };

    let updated = engine;
    const effects = [];
    let safety = 0;
    while (
      updated.status === "playing" &&
      updated.currentPlayerIndex === 1 &&
      safety < 25
    ) {
      safety++;

      let playable = getPlayableCards(updated, 1);
      while (playable.length === 0 && updated.drawPile.length > 0) {
        updated = applyAction(updated, {
          type: ACTION_TYPES.DRAW_CARD,
          playerIndex: 1,
        });
        playable = getPlayableCards(updated, 1);
      }

      if (playable.length > 0) {
        const card = playable[0];
        const needsColor = card.color === "wild";
        updated = applyAction(updated, {
          type: ACTION_TYPES.PLAY_CARD,
          playerIndex: 1,
          cardId: card.id,
          ...(needsColor ? { chosenColor: chooseBotColor(updated, 1) } : {}),
        });
        const byPlayerId = updated.players?.[1]?.id ?? 1;
        const effect = deriveActionEffectFromCard(updated.lastAction?.card, byPlayerId);
        if (effect) effects.push(effect);
        continue;
      }

      // Sin jugadas posibles y sin mazo: pasar turno manualmente.
      updated = {
        ...updated,
        currentPlayerIndex: getNextPlayerIndex(updated, 1, 1),
      };
    }

    return { engine: updated, effects };
  };

  const rotateEngineForViewer = (engine, viewerIndex) => {
    if (!engine || !Array.isArray(engine.players) || engine.players.length < 2) {
      return engine;
    }
    const n = engine.players.length;
    const shift = ((viewerIndex % n) + n) % n;
    if (shift === 0) return engine;

    const rotateIndex = (idx) => (idx == null ? idx : (idx - shift + n) % n);
    const players = engine.players
      .slice(shift)
      .concat(engine.players.slice(0, shift));

    return {
      ...engine,
      players,
      currentPlayerIndex: rotateIndex(engine.currentPlayerIndex),
      winnerIndex: rotateIndex(engine.winnerIndex),
      lastAction: engine.lastAction
        ? { ...engine.lastAction, playerIndex: rotateIndex(engine.lastAction.playerIndex) }
        : null,
    };
  };

  const emitirEstadoUNO = async (io, codigo, datosUNO) => {
    if (!datosUNO || !datosUNO.engine) return;
    try {
      const sockets = await io.in(codigo).fetchSockets();
      console.log("[UNO][DBG] emitirEstadoUNO", {
        codigo,
        recipients: sockets.length,
        numHumanPlayers: datosUNO.engine.numHumanPlayers,
        hasBot: datosUNO.engine.hasBot,
        players: datosUNO.engine.players?.map((p) => p.name),
        currentPlayerIndex: datosUNO.engine.currentPlayerIndex,
      });
      for (const s of sockets) {
        const playerId = datosUNO.socketToPlayerId?.[s.id];
        const canonicalIndex = playerId
          ? datosUNO.humanIds.indexOf(playerId)
          : 0;
        const engineView =
          canonicalIndex > 0
            ? rotateEngineForViewer(datosUNO.engine, canonicalIndex)
            : datosUNO.engine;
        console.log("[UNO][DBG] -> socket", {
          codigo,
          socketId: s.id,
          playerId,
          canonicalIndex,
          viewPlayers: engineView.players?.map((p) => p.name),
          viewCurrentPlayerIndex: engineView.currentPlayerIndex,
        });
        s.emit("uno:estado", { codigo, engine: engineView });
      }
    } catch (e) {
      console.log("[UNO][DBG] emitirEstadoUNO fallback broadcast", {
        codigo,
        numHumanPlayers: datosUNO.engine.numHumanPlayers,
        hasBot: datosUNO.engine.hasBot,
        players: datosUNO.engine.players?.map((p) => p.name),
      });
      io.to(codigo).emit("uno:estado", { codigo, engine: datosUNO.engine });
    }
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
          console.warn("[UNO] error en timeout UNO", e?.message || e);
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
    io.on("connection", function(socket) {
      console.log("Capa WS activa");

      // Enviar lista inicial de partidas disponibles
      socket.on("obtenerListaPartidas", function(datos) {
        const juego = datos && datos.juego;
        let lista = sistema.obtenerPartidasDisponibles(juego);
        srv.enviarAlRemitente(socket, "listaPartidas", lista);
      });
      // dispara una vez al conectar
      socket.emit("listaPartidas", sistema.obtenerPartidasDisponibles());

      // === crearPartida ===
      socket.on("crearPartida", function(datos) {
        const rawMaxPlayers = datos && (datos.maxPlayers ?? datos.maxJug);
        const parsed = parseInt(rawMaxPlayers, 10);
        const maxPlayers =
          Number.isFinite(parsed) && parsed >= 2 && parsed <= 8 ? parsed : 2;

        let codigo = sistema.crearPartida(datos.email, datos.juego, maxPlayers);

        if (codigo !== -1) {
          socket.join(codigo); // sala de socket.io
        }

        srv.enviarAlRemitente(socket, "partidaCreada", {
          codigo: codigo,
          maxPlayers: maxPlayers,
        });

        let lista = sistema.obtenerPartidasDisponibles(datos.juego);
        srv.enviarGlobal(io, "listaPartidas", lista);
      });

      // === unirAPartida ===
      socket.on("unirAPartida", async function(datos) {
        const res = sistema.unirAPartida(datos.email, datos.codigo);
        const codigo = res && typeof res === "object" ? res.codigo : res;

        if (codigo !== -1) {
          socket.join(codigo);
        }

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
              partidaHumanNames.push(j.nick || j.email);
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
              console.log("[UNO][DBG] sync tras unirAPartida", {
                codigo,
                players: engine.players.map((p) => p.name),
                numHumanPlayers: engine.numHumanPlayers,
                hasBot: engine.hasBot,
              });
            } else {
              datosUNO.engine.numHumanPlayers = numHumanPlayers;
              datosUNO.engine.hasBot = shouldHaveBot;
            }

            await emitirEstadoUNO(io, codigo, datosUNO);
          }
        } catch (e) {
          console.warn("[UNO] error sincronizando engine tras unirAPartida", e?.message || e);
        }

        srv.enviarAlRemitente(
          socket,
          "unidoAPartida",
          res && typeof res === "object" ? res : { codigo: codigo }
        );

        let lista = sistema.obtenerPartidasDisponibles(datos.juego);
        srv.enviarGlobal(io, "listaPartidas", lista);
      });

      // === continuarPartida ===
      socket.on("continuarPartida", function(datos) {
        // Marca la partida como "en curso" en tu sistema
        const res = sistema.continuarPartida(datos.email, datos.codigo);
        const codigo = res && typeof res === "object" ? res.codigo : res;

        if (codigo !== -1) {
          // Aseguramos que este socket está en la sala
          socket.join(codigo);

          // Enviar a TODOS los jugadores de la sala que la partida empieza
          io.to(codigo).emit("partidaContinuada", {
            codigo: codigo,
            juego: datos.juego || "uno"
          });

          // Actualizar la lista para TODO el mundo
          // (si sistema.obtenerPartidasDisponibles ya filtra las "en curso",
          //   desaparecerá del listado como quieres)
          let lista = sistema.obtenerPartidasDisponibles(datos.juego);
          srv.enviarGlobal(io, "listaPartidas", lista);
        } else {
          // No se pudo continuar la partida (no es el propietario, código inválido, etc.)
          srv.enviarAlRemitente(
            socket,
            "partidaContinuada",
            res && typeof res === "object" ? res : { codigo: -1 }
          );
        }
      });

      // === eliminarPartida ===
      socket.on("eliminarPartida", function(datos) {
        let codigo = sistema.eliminarPartida(datos.email, datos.codigo);

        if (codigo !== -1 && estadosUNO[codigo]) {
          clearAllUnoDeadlines(io, codigo, estadosUNO[codigo]);
          delete estadosUNO[codigo];
          console.log("[UNO] engine eliminado para partida", codigo);
        }

        srv.enviarAlRemitente(socket, "partidaEliminada", { codigo: codigo });

        let lista = sistema.obtenerPartidasDisponibles(datos.juego);
        srv.enviarGlobal(io, "listaPartidas", lista);
      });
      // ==========================
      //  UNO MULTIJUGADOR (WS)
      // ==========================

      // Cuando el juego UNO (en /uno) se conecta
      socket.on("uno:suscribirse", async function(datos) {
        const codigo = datos && datos.codigo;
        const email  = datos && datos.email;
        if (!codigo || !email) {
          console.warn("[UNO] suscribirse sin codigo o email");
          return;
        }

        const partida = sistema.partidas[codigo];
        if (!partida) {
          console.warn("[UNO] partida no encontrada", codigo);
          return;
        }
        if (partida.juego !== "uno") {
          console.warn("[UNO] la partida no es de UNO", codigo, partida.juego);
          return;
        }

        // Si aún no hemos creado el engine para esta partida, lo creamos
        const playerId = normalizePlayerId(email);
        if (!playerId) return;

        const belongs =
          Array.isArray(partida.jugadores) &&
          partida.jugadores.some((j) => normalizePlayerId(j.email) === playerId);
        if (!belongs) {
          console.warn(
            "[UNO] suscripcion rechazada (no pertenece a la partida)",
            email,
            codigo
          );
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
        datosUNO.socketToPlayerId[socket.id] = playerId;

        const partidaHumanIds = [];
        const partidaHumanNames = [];
        for (const j of partida.jugadores || []) {
          const id = normalizePlayerId(j.email);
          if (!id || partidaHumanIds.includes(id)) continue;
          partidaHumanIds.push(id);
          partidaHumanNames.push(j.nick || j.email);
        }
        datosUNO.humanIds = partidaHumanIds;
        datosUNO.humanNames = partidaHumanNames;

        const numHumanPlayers = datosUNO.humanIds.length;
        const shouldHaveBot = numHumanPlayers < 2;
        const desiredNames = shouldHaveBot
          ? [datosUNO.humanNames[0] || email, "Bot"]
          : [...datosUNO.humanNames];
        const desiredNumPlayers = shouldHaveBot ? 2 : numHumanPlayers;

        console.log("[UNO][DBG] suscribirse", {
          codigo,
          socketId: socket.id,
          email,
          playerId,
          humanIds: [...datosUNO.humanIds],
          humanNames: [...datosUNO.humanNames],
          numHumanPlayers,
          shouldHaveBot,
          desiredNames,
          desiredNumPlayers,
        });

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
          console.log("[UNO][DBG] engine creado/actualizado", {
            codigo,
            players: engine.players.map((p) => p.name),
            numHumanPlayers: engine.numHumanPlayers,
            hasBot: engine.hasBot,
          });
          console.log(
            "[UNO] engine creado/actualizado para partida",
            codigo,
            "humanos=",
            numHumanPlayers,
            "bot=",
            shouldHaveBot
          );
        } else {
          datosUNO.engine.numHumanPlayers = numHumanPlayers;
          datosUNO.engine.hasBot = shouldHaveBot;
          console.log("[UNO][DBG] engine reutilizado", {
            codigo,
            players: datosUNO.engine.players.map((p) => p.name),
            numHumanPlayers: datosUNO.engine.numHumanPlayers,
            hasBot: datosUNO.engine.hasBot,
          });
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
          console.warn("[UNO] error reenviando uno_required al suscribir", e?.message || e);
        }
      });

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
          console.log("[UNO][REMATCH] ready ignorado (partida no finalizada)", {
            codigo,
          });
          return;
        }

        const playerId = normalizePlayerId(email);
        if (!playerId) return;
        if (!datosUNO.humanIds.includes(playerId)) {
          console.warn("[UNO][REMATCH] ready rechazado (no pertenece)", {
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

        console.log("[UNO][REMATCH] ready", {
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

          console.log("[UNO][REMATCH] start", {
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
          console.warn("[UNO] accion con datos incompletos", datos);
          return;
        }

        const partida = sistema.partidas[codigo];
        const datosUNO = estadosUNO[codigo];
        if (!partida || !datosUNO || !datosUNO.engine) {
          console.warn("[UNO] partida o engine no encontrados", codigo);
          return;
        }
        if (partida.juego !== "uno") {
          console.warn("[UNO] partida no es de UNO al recibir accion", codigo);
          return;
        }

        // Buscamos el índice del jugador según el Sistema
        const playerId = normalizePlayerId(email);
        const playerIndex = datosUNO.humanIds.indexOf(playerId);
        if (playerIndex === -1) {
          console.warn("[UNO] jugador no pertenece a la partida/estado", email, codigo);
          return;
        }

        console.log("[UNO][DBG] accion", {
          codigo,
          socketId: socket.id,
          email,
          playerId,
          playerIndex,
          actionType: action.type,
          enginePlayers: datosUNO.engine.players?.map((p) => p.name),
          engineCurrentPlayerIndex: datosUNO.engine.currentPlayerIndex,
          engineHasBot: datosUNO.engine.hasBot,
          engineNumHumanPlayers: datosUNO.engine.numHumanPlayers,
        });

        // Inyectamos playerIndex en la acción y aplicamos el engine
        // Retrocompatible: clientes antiguos envían CALL_UNO via uno:accion.
        if (action.type === ACTION_TYPES.CALL_UNO) {
          const handled = await tryHandleUnoCallByIndex(io, codigo, datosUNO, playerIndex);
          if (handled) {
            syncUnoDeadlinesFromEngine(io, codigo, datosUNO);
            await emitirEstadoUNO(io, codigo, datosUNO);
          }
          return;
        }

        const fullAction = { ...action, playerIndex };
        const engineAfterHuman = applyAction(datosUNO.engine, fullAction);

        const actionEffects = [];
        if (fullAction.type === ACTION_TYPES.PLAY_CARD) {
          const byPlayerId = engineAfterHuman.players?.[playerIndex]?.id ?? playerIndex;
          const effect = deriveActionEffectFromCard(engineAfterHuman.lastAction?.card, byPlayerId);
          if (effect) actionEffects.push(effect);
        }

        const botResult = runBotTurnsIfNeededWithEffects(engineAfterHuman);
        datosUNO.engine = botResult.engine;
        actionEffects.push(...(botResult.effects || []));

        for (const effect of actionEffects) {
          io.to(codigo).emit("uno:action_effect", { codigo, ...effect });
        }

        console.log("[UNO][DBG] accion aplicada", {
          codigo,
          engineCurrentPlayerIndex: datosUNO.engine.currentPlayerIndex,
          status: datosUNO.engine.status,
          winnerIndex: datosUNO.engine.winnerIndex,
        });

        syncUnoDeadlinesFromEngine(io, codigo, datosUNO);
        await emitirEstadoUNO(io, codigo, datosUNO);
      });

      socket.on("disconnect", function() {
        // Evitar leaks de mapeo socket->playerId
        for (const [codigo, datosUNO] of Object.entries(estadosUNO)) {
          if (datosUNO?.socketToPlayerId?.[socket.id]) {
            delete datosUNO.socketToPlayerId[socket.id];
            // No borramos timers UNO: son por jugador, no por socket.
            console.log("[UNO][DBG] socket desconectado", { codigo, socketId: socket.id });
          }
        }
      });

    });

  };
}

module.exports.ServidorWS = ServidorWS;
