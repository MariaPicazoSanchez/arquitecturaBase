const {
  createInitialState,
  applyAction,
  ACTION_TYPES,
  COLORS,
  getPlayableCards,
  getNextPlayerIndex,
} = require("./game/unoEngineMultiplayer");


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
        let codigo = sistema.crearPartida(datos.email);

        if (codigo !== -1) {
          socket.join(codigo); // sala de socket.io
        }

        srv.enviarAlRemitente(socket, "partidaCreada", { codigo: codigo });

        let lista = sistema.obtenerPartidasDisponibles(datos.juego);
        srv.enviarGlobal(io, "listaPartidas", lista);
      });

      // === unirAPartida ===
      socket.on("unirAPartida", async function(datos) {
        let codigo = sistema.unirAPartida(datos.email, datos.codigo);

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

        srv.enviarAlRemitente(socket, "unidoAPartida", { codigo: codigo });

        let lista = sistema.obtenerPartidasDisponibles(datos.juego);
        srv.enviarGlobal(io, "listaPartidas", lista);
      });

      // === continuarPartida ===
      socket.on("continuarPartida", function(datos) {
        // Marca la partida como "en curso" en tu sistema
        let codigo = sistema.continuarPartida(datos.email, datos.codigo);

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
          srv.enviarAlRemitente(socket, "partidaContinuada", { codigo: -1 });
        }
      });

      // === eliminarPartida ===
      socket.on("eliminarPartida", function(datos) {
        let codigo = sistema.eliminarPartida(datos.email, datos.codigo);

        if (codigo !== -1 && estadosUNO[codigo]) {
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
      });

      // Cuando un jugador realiza una acción en el UNO
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
        const fullAction = { ...action, playerIndex };
        const newEngine = applyAction(datosUNO.engine, fullAction);
        datosUNO.engine = runBotTurnsIfNeeded(newEngine);

        console.log("[UNO][DBG] accion aplicada", {
          codigo,
          engineCurrentPlayerIndex: datosUNO.engine.currentPlayerIndex,
          status: datosUNO.engine.status,
          winnerIndex: datosUNO.engine.winnerIndex,
        });

        await emitirEstadoUNO(io, codigo, datosUNO);
      });

    });

  };
}

module.exports.ServidorWS = ServidorWS;
