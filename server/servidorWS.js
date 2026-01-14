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

function ServidorWS() {
  let srv = this;
  let sistemaRef = null;
  const estadosUNO = {};
  const estados4raya = {};
  const estadosCheckers = {};
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
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const thinkMs = () => BOT_THINK_MS + Math.floor(Math.random() * 300);
  const botTurnDelayMs = () => {
    const min = Math.max(0, BOT_TURN_DELAY_MIN_MS);
    const max = Math.max(min, BOT_TURN_DELAY_MAX_MS);
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  const normalizePlayerId = (value) =>
    (value || "").toString().trim().toLowerCase();

  const ALLOWED_REACTION_ICONS = new Set([
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
  ]);

  const pickDisplayName = (partida, playerId, fallback) => {
    if (!partida || !Array.isArray(partida.jugadores)) return fallback;
    const found = partida.jugadores.find(
      (j) => normalizePlayerId(j.email) === playerId
    );
    const nick = (found && typeof found.nick === "string" ? found.nick.trim() : "") || "";
    return nick || fallback;
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

        console.log("[RESUME] deleting empty match after grace", {
          codigo,
          juego: partidaNow.juego,
          graceMs: ROOM_EMPTY_GRACE_MS,
        });

        delete sistema.partidas[codigo];
        cleanupCodigoState(io, codigo);

        const lista = sistema.obtenerPartidasDisponibles(partidaNow.juego);
        srv.enviarGlobal(io, "listaPartidas", lista);
      } catch (e) {
        console.warn("[RESUME] error deleting empty match:", e?.message || e);
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
      console.warn("[UNO] error en bot loop", codigo, e?.message || e);
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
    const botIndex = (engine.players || []).findIndex(
      (p) => normalizePlayerId(p?.id) === botPlayerId,
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
      console.warn("[4RAYA][BOT] error", codigo, e?.message || e);
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
    const botPlayer = players.find((p) => normalizePlayerId(p?.id) === botPlayerId) || null;
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
      console.warn("[CHECKERS][BOT] error", codigo, e?.message || e);
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
            console.log(
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

  const emitirEstado4Raya = (io, codigo, datos4Raya) => {
    const engine = datos4Raya?.engine ?? null;
    if (!engine) return;

    io.to(codigo).emit("4raya:estado", {
      codigo,
      engine,
    });
  };

  const emitirEstadoCheckers = (io, codigo, datosCheckers) => {
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

    io.to(codigo).emit("damas_state", payload);
    io.to(codigo).emit("checkers_state", payload);
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
    sistemaRef = sistema;
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
        const juego = datos && datos.juego;
        const modeRaw = datos && datos.mode;
        const vsBotRaw = datos && datos.vsBot;
        const vsBot =
          vsBotRaw === true ||
          vsBotRaw === 1 ||
          vsBotRaw === "1" ||
          String(vsBotRaw).toLowerCase() === "true";
        const mode =
          String(modeRaw || "").trim().toUpperCase() === "PVBOT" || vsBot
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

        let codigo = sistema.crearPartida(datos.email, juego, maxPlayers, { vsBot: isBotMode, mode });

        if (codigo !== -1) {
          socket.join(codigo); // sala de socket.io
          cancelRoomEmptyTimer(codigo);
        }

        const partidaCreada = codigo !== -1 ? sistema.partidas[codigo] : null;
        srv.enviarAlRemitente(socket, "partidaCreada", {
          codigo: codigo,
          maxPlayers: maxPlayers,
          juego: partidaCreada?.juego || juego,
          isBotGame: !!(partidaCreada && isBotMatch(partidaCreada)),
        });

        if (
          codigo !== -1 &&
          isBotMode &&
          (juego === "uno" || juego === "4raya" || juego === "damas" || juego === "checkers")
        ) {
          const contRes = sistema.continuarPartida(datos.email, codigo);
          const contCodigo = contRes && typeof contRes === "object" ? contRes.codigo : contRes;
          if (contCodigo !== -1) {
            io.to(codigo).emit("partidaContinuada", { codigo, juego, isBotGame: true });
          } else {
            srv.enviarAlRemitente(
              socket,
              "partidaContinuada",
              contRes && typeof contRes === "object" ? contRes : { codigo: -1 }
            );
          }
        }

        let lista = sistema.obtenerPartidasDisponibles(juego);
        srv.enviarGlobal(io, "listaPartidas", lista);
      });

      // === unirAPartida ===
      socket.on("unirAPartida", async function(datos) {
        const res = sistema.unirAPartida(datos.email, datos.codigo);
        const codigo = res && typeof res === "object" ? res.codigo : res;

        if (codigo !== -1) {
          socket.join(codigo);
          cancelRoomEmptyTimer(codigo);
          cancelRoomEmptyTimer(codigo);
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
          const partida = sistema.partidas[codigo];
          const juego = partida?.juego || datos.juego || "uno";

          // Aseguramos que este socket está en la sala
          socket.join(codigo);

          // Enviar a TODOS los jugadores de la sala que la partida empieza
          io.to(codigo).emit("partidaContinuada", {
            codigo: codigo,
            juego,
            isBotGame: !!(partida && isBotMatch(partida)),
          });

          // Actualizar la lista para TODO el mundo
          // (si sistema.obtenerPartidasDisponibles ya filtra las "en curso",
          //   desaparecerá del listado como quieres)
          let lista = sistema.obtenerPartidasDisponibles(juego);
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

        if (codigo !== -1 && !sistema.partidas[codigo]) {
          cleanupCodigoState(io, codigo);
        }

        srv.enviarAlRemitente(socket, "partidaEliminada", { codigo: codigo });

        let lista = sistema.obtenerPartidasDisponibles(datos.juego);
        srv.enviarGlobal(io, "listaPartidas", lista);
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

        if (deleted) {
          cleanupCodigoState(io, codigo);
        }

        if (isRoomEmpty(io, codigo) && sistema.partidas?.[codigo]) {
          const partidaNow = sistema.partidas[codigo];
          delete sistema.partidas[codigo];
          cleanupCodigoState(io, codigo);
          const lista = sistema.obtenerPartidasDisponibles(partidaNow.juego);
          srv.enviarGlobal(io, "listaPartidas", lista);
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
              console.log("[RESUME] ok", { gameType: "uno", codigo, email });
              respond({ ok: true, codigo, gameType: "uno" });
            })
            .catch((e) => {
              console.warn("[RESUME] error UNO", codigo, e?.message || e);
              respond({ ok: false, codigo, gameType: "uno", reason: "ERROR" });
            });
          return;
        }

        if (normalizedType === "damas") {
          try {
            handleDamasJoin({ codigo, email });
            console.log("[RESUME] ok", { gameType: "damas", codigo, email });
            return respond({ ok: true, codigo, gameType: "damas" });
          } catch (e) {
            console.warn("[RESUME] error DAMAS", codigo, e?.message || e);
            return respond({ ok: false, codigo, gameType: "damas", reason: "ERROR" });
          }
        }

        return respond({ ok: false, codigo, gameType: normalizedType, reason: "UNKNOWN_GAME" });
      });
      // ==========================
      //  UNO MULTIJUGADOR (WS)
      // ==========================

      socket.on("reaction:send", function (payload, ack) {
        const respond = (res) => {
          if (typeof ack === "function") return ack(res);
          socket.emit("reaction:send", res);
        };

        const gameId = String(payload?.gameId || "").trim();
        const toPlayerId = String(payload?.toPlayerId || "").trim().toLowerCase();
        const icon = String(payload?.icon || "").trim();

        if (!gameId || !toPlayerId || !icon) {
          return respond({ ok: false, error: "INVALID_REQUEST" });
        }
        if (!ALLOWED_REACTION_ICONS.has(icon)) {
          return respond({ ok: false, error: "INVALID_ICON" });
        }

        const partida = sistema.partidas?.[gameId] || null;
        if (!partida || String(partida.juego || "").trim().toLowerCase() !== "uno") {
          return respond({ ok: false, error: "GAME_NOT_FOUND" });
        }

        const datosUNO = estadosUNO?.[gameId] || null;
        const fromPlayerIdRaw = datosUNO?.socketToPlayerId?.[socket.id] || null;
        const fromPlayerId = fromPlayerIdRaw == null ? "" : String(fromPlayerIdRaw).trim().toLowerCase();
        if (!datosUNO || !fromPlayerId) {
          return respond({ ok: false, error: "NOT_SUBSCRIBED" });
        }
        if (fromPlayerId === toPlayerId) {
          return respond({ ok: false, error: "CANNOT_SELF" });
        }

        const humanIds = Array.isArray(datosUNO.humanIds) ? datosUNO.humanIds : [];
        if (!humanIds.includes(fromPlayerId) || !humanIds.includes(toPlayerId)) {
          return respond({ ok: false, error: "NOT_ALLOWED" });
        }

        const destSocketId = datosUNO.playerIdToSocketId?.[toPlayerId] || null;
        if (!destSocketId) {
          return respond({ ok: false, error: "PLAYER_OFFLINE" });
        }

        const fromName = pickDisplayName(partida, fromPlayerId, fromPlayerId);
        io.to(destSocketId).emit("reaction:receive", {
          fromPlayerId: isNaN(Number(fromPlayerId)) ? fromPlayerId : Number(fromPlayerId),
          fromName,
          icon,
          ts: Date.now(),
        });

        return respond({ ok: true });
      });

      socket.on("uno_get_state", async function (datos) {
        const codigo = (datos && (datos.codigo || datos.codigoPartida)) || null;
        const email = datos && datos.email;
        if (!codigo) return;

        const partida = sistema.partidas[codigo];
        if (!partida) return;
        if (partida.juego !== "uno") return;

        const playerId = normalizePlayerId(email);
        if (!playerId) return;

        const belongs =
          Array.isArray(partida.jugadores) &&
          partida.jugadores.some((j) => normalizePlayerId(j.email) === playerId);
        if (!belongs) return;

        if (!estadosUNO[codigo]) {
          estadosUNO[codigo] = {
            engine: null,
            humanIds: [],
            humanNames: [],
            socketToPlayerId: {},
            playerIdToSocketId: {},
          };
        }

        const datosUNO = estadosUNO[codigo];
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
      async function handleUnoSubscribe(datos) {
        const codigo = datos && datos.codigo;
        const email  = datos && datos.email;
        if (!codigo || !email) {
          console.warn("[UNO] suscribirse sin codigo o email");
          return;
        }
        cancelRoomEmptyTimer(codigo);

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
          console.warn("[UNO] error reenviando uno_required al suscribir", e?.message || e);
        }
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

      const resolveCheckersPlayers = (partida) => {
        const raw = Array.isArray(partida?.jugadores) ? partida.jugadores.slice(0, 2) : [];
        return raw
          .map((j, idx) => {
            const id = normalizePlayerId(j?.email);
            if (!id) return null;
            return {
              color: idx === 0 ? "white" : "black",
              id,
              name: j?.nick || (idx === 0 ? "Jugador 1" : "Jugador 2"),
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

        socketToCheckersPlayerId[socket.id] = playerId;
        socketToCheckersCodigo[socket.id] = codigo;

        if (!estadosCheckers[codigo]) {
          estadosCheckers[codigo] = {
            state: createCheckersInitialState(),
            players: resolveCheckersPlayers(partida),
          };
          console.log("[CHECKERS] estado creado para partida", codigo);
        } else {
          estadosCheckers[codigo].players = resolveCheckersPlayers(partida);
        }

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

        const playerId = normalizePlayerId(email);
        if (!playerId) return;

        if (!estadosCheckers[codigo]) {
          estadosCheckers[codigo] = {
            state: createCheckersInitialState(),
            players: resolveCheckersPlayers(partida),
          };
        } else {
          estadosCheckers[codigo].players = resolveCheckersPlayers(partida);
        }

        const datosCheckers = estadosCheckers[codigo];
        const players = Array.isArray(datosCheckers.players) ? datosCheckers.players : [];
        const me = players.find((p) => normalizePlayerId(p.id) === playerId) || null;
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
            players: resolveCheckersPlayers(partida),
          };
        } else {
          estadosCheckers[codigo].players = resolveCheckersPlayers(partida);
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
            srv.enviarGlobal(io, "listaPartidas", lista);
          } catch (e) {
            console.warn("[CHECKERS] fallo creando nueva vs bot:", e?.message || e);
            emitDamasError(socket, {
              codigo,
              reason: "RESTART_FAILED",
              message: "No se pudo iniciar la revancha.",
            });
          }
          return;
        }

        datosCheckers.state = createCheckersInitialState();
        io.to(codigo).emit("damas_restart", { codigo });
        io.to(codigo).emit("checkers_restart", { codigo });
        emitirEstadoCheckers(io, codigo, datosCheckers);
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
          console.warn("[4RAYA] suscripcion rechazada (no pertenece a la partida)", email, codigo);
          return;
        }

        socketTo4RayaPlayerId[socket.id] = playerId;
        socketTo4RayaCodigo[socket.id] = codigo;

        if (!estados4raya[codigo]) {
          const players = (partida.jugadores || []).slice(0, 2).map((j) => ({
            id: normalizePlayerId(j.email),
            name: j.nick || j.email,
          }));
          estados4raya[codigo] = {
            engine: createConnect4InitialState({ players }),
          };
          console.log("[4RAYA] engine creado para partida", codigo);
        } else {
          // Si la partida aun no ha empezado (tablero vacio), sincronizamos nombres/ids.
          const datos4Raya = estados4raya[codigo];
          const engine = datos4Raya.engine;
          if (engine && !engine.lastMove) {
            const players = (partida.jugadores || []).slice(0, 2).map((j) => ({
              id: normalizePlayerId(j.email),
              name: j.nick || j.email,
            }));
            datos4Raya.engine = { ...engine, players: createConnect4InitialState({ players }).players };
          }
        }

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

        const playerId = normalizePlayerId(email);
        const playerIndex = (datos4Raya.engine.players || []).findIndex(
          (p) => normalizePlayerId(p?.id) === playerId,
        );
        if (playerIndex === -1) {
          console.warn("[4RAYA] jugador no pertenece a la partida", email, codigo);
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
            srv.enviarGlobal(io, "listaPartidas", lista);
          } catch (e) {
            console.warn("[4RAYA] fallo creando revancha vs bot:", e?.message || e);
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
            srv.enviarGlobal(io, "listaPartidas", lista);
          } catch (e) {
            console.warn("[4RAYA] fallo creando revancha:", e?.message || e);
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
