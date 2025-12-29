// ====== Configuración de cartas ======

const COLORS = ['red', 'green', 'blue', 'yellow'];
const VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

// Especiales con color (con cantidades distintas)
const SPECIAL_COLOR_COUNTS = {
  skip: 2,
  '+2': 2,
  reverse: 2,
  double: 1,
};

// Especiales sin color (comodines, con cantidades distintas)
const COLORLESS_COUNTS = {
  wild: 4, // cambio de color
  '+4': 4,
  swap: 2,
  discard_all: 2,
  skip_all: 1,
  '+6': 2,
  '+8': 1,
};

const ACTION_TYPES = {
  PLAY_CARD: 'PLAY_CARD',
  DRAW_CARD: 'DRAW_CARD',
  CALL_UNO: 'CALL_UNO',
  PASS_TURN: 'PASS_TURN',
};

const WILD_VALUES = new Set(['wild', '+4', '+6', '+8', 'swap', 'discard_all', 'skip_all']);
const MAX_LOG_ENTRIES = 300;

function snapshotState(state) {
  return {
    drawPile: Array.isArray(state?.drawPile) ? state.drawPile.length : 0,
    discardPile: Array.isArray(state?.discardPile) ? state.discardPile.length : 0,
    handsCounts: Array.isArray(state?.players)
      ? state.players.map((p) => (Array.isArray(p?.hand) ? p.hand.length : 0))
      : [],
  };
}

function inferIsBot(state, playerIndex) {
  if (!state?.hasBot) return false;
  const n = Array.isArray(state?.players) ? state.players.length : 0;
  const numHuman =
    Number.isFinite(state?.numHumanPlayers) && state.numHumanPlayers > 0
      ? state.numHumanPlayers
      : Math.max(n - 1, 1);
  return Number.isInteger(playerIndex) && playerIndex >= numHuman;
}

function buildActor(state, playerIndex) {
  if (!Number.isInteger(playerIndex)) {
    return { playerIndex: null, name: 'System', isBot: false };
  }
  const player = state?.players?.[playerIndex] ?? null;
  return {
    playerIndex,
    name: player?.name ?? `Jugador ${playerIndex + 1}`,
    isBot: inferIsBot(state, playerIndex),
  };
}

function pushLog(state, entry) {
  if (!state) return;
  if (!Array.isArray(state.gameLog)) state.gameLog = [];
  const prevSeq = Number.isFinite(state.logSeq) ? state.logSeq : 0;
  const seq = prevSeq + 1;
  state.logSeq = seq;

  const actorIndex = entry?.actorIndex;
  const base = {
    t: new Date().toISOString(),
    seq,
    actor: buildActor(state, actorIndex),
    action: entry?.action ?? 'UNKNOWN',
    details: entry?.details && typeof entry.details === 'object' ? entry.details : {},
  };

  if (entry?.privateByPlayerIndex && typeof entry.privateByPlayerIndex === 'object') {
    base.privateByPlayerIndex = entry.privateByPlayerIndex;
  }

  state.gameLog.push(base);
  if (state.gameLog.length > MAX_LOG_ENTRIES) {
    state.gameLog.splice(0, state.gameLog.length - MAX_LOG_ENTRIES);
  }
}

function buildMyHandDelta(cards = [], removed = []) {
  const normalize = (c) => (c ? { id: c.id, color: c.color, value: c.value } : null);
  return {
    added: cards.map(normalize).filter(Boolean),
    removed: removed.map(normalize).filter(Boolean),
  };
}

// ====== Utilidades de cartas/mazo ======

function createCard(color, value) {
  return {
    id: `${color}-${value}-${Math.random().toString(36).slice(2)}`,
    color, // 'red' | 'green' | 'blue' | 'yellow' | 'wild'
    value, // '0'-'9', 'skip', '+2', 'reverse', 'double', 'wild', '+4', 'swap', 'discard_all', 'skip_all', '+6', '+8'
  };
}

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createDeck() {
  const deck = [];

  for (const color of COLORS) {
    for (const v of VALUES) {
      deck.push(createCard(color, v));
      if (v !== '0') deck.push(createCard(color, v));
    }

    for (const [value, count] of Object.entries(SPECIAL_COLOR_COUNTS)) {
      for (let i = 0; i < count; i++) deck.push(createCard(color, value));
    }
  }

  for (const [value, count] of Object.entries(COLORLESS_COUNTS)) {
    for (let i = 0; i < count; i++) deck.push(createCard('wild', value));
  }

  return shuffle(deck);
}

// ====== Reglas básicas ======

function canPlayCard(card, topCard) {
  if (!card || !topCard) return false;
  if (WILD_VALUES.has(card.value)) return true;
  return card.color === topCard.color || card.value === topCard.value;
}

// ====== Estado inicial ======

function createInitialState({ numPlayers = 2, names = [] } = {}) {
  if (numPlayers < 2) {
    throw new Error('UNO necesita al menos 2 jugadores.');
  }

  const deck = createDeck();

  const players = [];
  const CARDS_PER_PLAYER = 7;

  for (let i = 0; i < numPlayers; i++) {
    const hand = deck.slice(i * CARDS_PER_PLAYER, (i + 1) * CARDS_PER_PLAYER);
    players.push({
      id: i,
      name: names[i] ?? `Jugador ${i + 1}`,
      hand,
      hasCalledUno: false,
    });
  }

  const drawPile = deck.slice(numPlayers * CARDS_PER_PLAYER);

  // Primera carta en mesa: intentamos que no sea comodín.
  let firstCard = drawPile.shift();
  let safety = 0;
  while (WILD_VALUES.has(firstCard?.value) && drawPile.length > 0 && safety < 10) {
    drawPile.push(firstCard);
    firstCard = drawPile.shift();
    safety++;
  }

  const discardPile = firstCard ? [firstCard] : [];

  const state = {
    players,
    drawPile,
    discardPile,
    currentPlayerIndex: 0,
    direction: 1,
    doublePlay: null, // { playerIndex, remaining }
    penaltyDrawCount: 0,
    status: 'playing', // 'playing' | 'finished'
    winnerIndex: null,
    lastAction: null,
    reshuffleSeq: 0,
    lastReshuffle: null, // { seq, movedCount }
    gameLog: [],
    logSeq: 0,
  };

  pushLog(state, {
    actorIndex: null,
    action: 'START',
    details: { after: snapshotState(state) },
  });

  return state;
}

// ====== Utilidades de estado ======

function cloneState(state) {
  return {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      hand: [...p.hand],
    })),
    drawPile: [...state.drawPile],
    discardPile: [...state.discardPile],
    lastAction: state.lastAction ? { ...state.lastAction } : null,
    doublePlay: state.doublePlay ? { ...state.doublePlay } : null,
    penaltyDrawCount: state.penaltyDrawCount,
    lastReshuffle: state.lastReshuffle ? { ...state.lastReshuffle } : null,
    gameLog: Array.isArray(state.gameLog) ? [...state.gameLog] : [],
    logSeq: Number.isFinite(state.logSeq) ? state.logSeq : 0,
  };
}

function refillDeckFromDiscard(state, { reason = 'deckEmpty' } = {}) {
  const draw = state?.drawPile ?? state?.deck ?? state?.mazo;
  const disc = state?.discardPile ?? state?.discard ?? state?.tiradas;

  if (!Array.isArray(draw) || !Array.isArray(disc)) {
    return { ok: false, reason: 'missing_piles', movedCount: 0 };
  }

  if (draw.length > 0) return { ok: false, reason: 'not_empty', movedCount: 0 };
  if (disc.length <= 1) return { ok: false, reason: 'not_enough_discard', movedCount: 0 };

  const before = snapshotState(state);
  const top = disc[disc.length - 1];
  const recycle = disc.slice(0, disc.length - 1);
  const normalizedRecycle = recycle.map((c) => (WILD_VALUES.has(c.value) ? { ...c, color: 'wild' } : c));
  const shuffled = shuffle(normalizedRecycle);

  if (process.env.UNO_DEBUG_REBUILD === '1') {
    console.log('[UNO] rebuild deck', { recycle: normalizedRecycle.length, top: top?.value, topColor: top?.color });
  }

  if (Array.isArray(state.drawPile)) state.drawPile = shuffled;
  else if (Array.isArray(state.deck)) state.deck = shuffled;
  else state.mazo = shuffled;

  if (Array.isArray(state.discardPile)) state.discardPile = [top];
  else if (Array.isArray(state.discard)) state.discard = [top];
  else state.tiradas = [top];

  const prevSeq = Number.isFinite(state.reshuffleSeq) ? state.reshuffleSeq : 0;
  const seq = prevSeq + 1;
  state.reshuffleSeq = seq;
  state.lastReshuffle = { seq, movedCount: normalizedRecycle.length };

  pushLog(state, {
    actorIndex: null,
    action: 'RESHUFFLE',
    details: {
      movedCount: normalizedRecycle.length,
      reason,
      before,
      after: snapshotState(state),
    },
  });

  return { ok: true, reason: 'ok', movedCount: normalizedRecycle.length, top, seq };
}

function drawOneCard(state) {
  const draw = state?.drawPile ?? state?.deck ?? state?.mazo;
  if (!Array.isArray(draw)) return { card: null, refilled: false, movedCount: 0 };

  let refillRes = { ok: false, movedCount: 0 };
  if (draw.length === 0) {
    refillRes = refillDeckFromDiscard(state, { reason: 'deckEmpty' });
  }

  const drawAfter = state?.drawPile ?? state?.deck ?? state?.mazo;
  const card = Array.isArray(drawAfter) ? (drawAfter.shift() ?? null) : null;
  return { card, refilled: refillRes.ok, movedCount: refillRes.movedCount };
}

function drawCardsIntoHand(state, playerIndex, count) {
  const player = state.players[playerIndex];
  let drawnCount = 0;
  let refilled = false;
  const cards = [];

  for (let i = 0; i < count; i++) {
    const res = drawOneCard(state);
    if (!res.card) break;
    if (res.refilled) refilled = true;
    player.hand.push(res.card);
    cards.push(res.card);
    drawnCount++;
  }

  return { drawnCount, refilled, cards };
}

function getTopCard(state) {
  return state.discardPile[state.discardPile.length - 1] ?? null;
}

function getNextPlayerIndex(state, fromIndex = state.currentPlayerIndex, steps = 1) {
  const n = state.players.length;
  let idx = fromIndex;
  for (let i = 0; i < steps; i++) {
    idx = (idx + state.direction + n) % n;
  }
  return idx;
}

function applyForcedDraw(state, playerIndex, count, { reason = null } = {}) {
  const victimIndex = getNextPlayerIndex(state, playerIndex, 1);
  const before = snapshotState(state);
  const res = drawCardsIntoHand(state, victimIndex, count);
  state.currentPlayerIndex = getNextPlayerIndex(state, victimIndex, 1);

  pushLog(state, {
    actorIndex: playerIndex,
    action: 'FORCED_DRAW',
    details: {
      victimIndex,
      drawCount: res.drawnCount,
      reason: reason ?? String(count),
      before,
      after: snapshotState(state),
    },
    privateByPlayerIndex: {
      [victimIndex]: { myHandDelta: buildMyHandDelta(res.cards) },
    },
  });

  return { victimIndex, ...res };
}

function resolveTargetIndex(state, { chosenTargetId, chosenTargetIndex }) {
  if (chosenTargetId != null) {
    const idx = state.players.findIndex((p) => String(p.id) === String(chosenTargetId));
    return idx;
  }
  if (Number.isInteger(chosenTargetIndex)) return chosenTargetIndex;
  return -1;
}

// ====== Acciones ======

function applyAction(state, action) {
  if (state.status !== 'playing') {
    return state;
  }

  switch (action.type) {
    case ACTION_TYPES.PLAY_CARD: {
      const next = applyPlayCard(state, action);
      if (next !== state && action?.meta?.source === 'BOT') {
        pushLog(next, {
          actorIndex: action?.playerIndex,
          action: 'BOT_MOVE',
          details: { action: 'PLAY', reason: action?.meta?.reason ?? 'botLogic' },
        });
      }
      return next;
    }
    case ACTION_TYPES.DRAW_CARD: {
      const next = applyDrawCard(state, action);
      if (next !== state && action?.meta?.source === 'BOT') {
        pushLog(next, {
          actorIndex: action?.playerIndex,
          action: 'BOT_MOVE',
          details: { action: 'DRAW', reason: action?.meta?.reason ?? 'botLogic' },
        });
      }
      return next;
    }
    case ACTION_TYPES.CALL_UNO: {
      const next = applyCallUno(state, action);
      if (next !== state && action?.meta?.source === 'BOT') {
        pushLog(next, {
          actorIndex: action?.playerIndex,
          action: 'BOT_MOVE',
          details: { action: 'CALL_LAST_CARD', reason: action?.meta?.reason ?? 'botLogic' },
        });
      }
      return next;
    }
    case ACTION_TYPES.PASS_TURN: {
      const next = applyPassTurn(state, action);
      if (next !== state && action?.meta?.source === 'BOT') {
        pushLog(next, {
          actorIndex: action?.playerIndex,
          action: 'BOT_MOVE',
          details: { action: 'PASS', reason: action?.meta?.reason ?? 'botLogic' },
        });
      }
      return next;
    }
    default:
      throw new Error(`Acción desconocida: ${action.type}`);
  }
}

// --- PLAY_CARD ---

function applyPlayCard(state, action) {
  const { playerIndex, cardId, chosenColor } = action;
  if (playerIndex !== state.currentPlayerIndex) {
    return state;
  }

  const s = cloneState(state);
  const player = s.players[playerIndex];
  const top = getTopCard(s);

  const cardIdx = player.hand.findIndex((c) => c.id === cardId);
  if (cardIdx === -1) return state;

  const card = player.hand[cardIdx];
  if (!canPlayCard(card, top)) return state;

  const isWildType = WILD_VALUES.has(card.value);
  if (isWildType && !chosenColor) return state;

  if (process.env.UNO_DEBUG_PLAYED === '1') {
    console.log('[UNO] play', { value: card.value, color: card.color, chosenColor });
  }

  if (card.value === 'swap') {
    const targetIndex = resolveTargetIndex(s, action);
    if (targetIndex < 0 || targetIndex >= s.players.length) return state;
    if (targetIndex === playerIndex) return state;
  }

  const cardForDiscard = isWildType ? { ...card, color: chosenColor } : card;

  player.hand.splice(cardIdx, 1);
  s.discardPile.push(cardForDiscard);

  if (player.hand.length !== 1) {
    player.hasCalledUno = false;
  }

  const baseLastAction = {
    type: ACTION_TYPES.PLAY_CARD,
    playerIndex,
    card: cardForDiscard,
  };

  let swapTargetIndex = null;
  const before = snapshotState(state);

  if (card.value === '+2') {
    applyForcedDraw(s, playerIndex, 2, { reason: '+2' });
  } else if (card.value === 'skip') {
    s.currentPlayerIndex = getNextPlayerIndex(s, playerIndex, 2);
  } else if (card.value === 'reverse') {
    s.direction = -s.direction;
    s.currentPlayerIndex = getNextPlayerIndex(s, playerIndex, 1);
  } else if (card.value === '+4' || card.value === '+6' || card.value === '+8') {
    const drawCount = card.value === '+4' ? 4 : card.value === '+6' ? 6 : 8;
    applyForcedDraw(s, playerIndex, drawCount, { reason: card.value });
  } else if (card.value === 'wild') {
    s.currentPlayerIndex = getNextPlayerIndex(s, playerIndex, 1);
  } else if (card.value === 'skip_all') {
    s.currentPlayerIndex = playerIndex;
  } else if (card.value === 'double') {
    const victimIndex = getNextPlayerIndex(s, playerIndex, 1);
    const n = s.players[victimIndex].hand.length;
    const beforeDouble = snapshotState(s);
    const res = drawCardsIntoHand(s, victimIndex, n);
    s.currentPlayerIndex = getNextPlayerIndex(s, victimIndex, 1);
    pushLog(s, {
      actorIndex: playerIndex,
      action: 'FORCED_DRAW',
      details: {
        victimIndex,
        drawCount: res.drawnCount,
        reason: 'double',
        before: beforeDouble,
        after: snapshotState(s),
      },
      privateByPlayerIndex: {
        [victimIndex]: { myHandDelta: buildMyHandDelta(res.cards) },
      },
    });
  } else if (card.value === 'discard_all') {
    const toDiscard = player.hand.filter((c) => c.color === chosenColor);
    player.hand = player.hand.filter((c) => c.color !== chosenColor);
    s.discardPile.push(...toDiscard);
    if (player.hand.length !== 1) player.hasCalledUno = false;
    s.currentPlayerIndex = getNextPlayerIndex(s, playerIndex, 1);
  } else if (card.value === 'swap') {
    const targetIndex = resolveTargetIndex(s, action);
    if (targetIndex < 0 || targetIndex >= s.players.length) return state;
    if (targetIndex === playerIndex) return state;

    swapTargetIndex = targetIndex;
    const target = s.players[targetIndex];

    const tmp = player.hand;
    player.hand = target.hand;
    target.hand = tmp;

    if (player.hand.length !== 1) player.hasCalledUno = false;
    if (target.hand.length !== 1) target.hasCalledUno = false;

    s.currentPlayerIndex = getNextPlayerIndex(s, playerIndex, 1);
  } else {
    s.currentPlayerIndex = getNextPlayerIndex(s, playerIndex, 1);
  }

  if (swapTargetIndex != null && swapTargetIndex >= 0) {
    const target = s.players[swapTargetIndex];
    if (target?.hand?.length === 0) {
      s.lastAction = baseLastAction;
      s.status = 'finished';
      s.winnerIndex = swapTargetIndex;
      return s;
    }
  }

  if (player.hand.length === 0) {
    s.lastAction = baseLastAction;
    s.status = 'finished';
    s.winnerIndex = playerIndex;
    return s;
  }

  // Doble jugada (solo afecta al jugador marcado)
  if (s.doublePlay && s.doublePlay.playerIndex === playerIndex) {
    if ((s.doublePlay.remaining ?? 0) > 0) {
      s.doublePlay.remaining -= 1; // de 1 -> 0 (queda 1 jugada extra pendiente)
      s.currentPlayerIndex = playerIndex;
    } else {
      s.doublePlay = null;
    }
  }

  s.lastAction = baseLastAction;
  pushLog(s, {
    actorIndex: playerIndex,
    action: 'PLAY',
    details: {
      cardPlayed: { color: cardForDiscard.color, value: cardForDiscard.value },
      ...(isWildType && chosenColor ? { chosenColor } : null),
      before,
      after: snapshotState(s),
    },
  });
  return s;
}

// --- DRAW_CARD ---

function applyDrawCard(state, action) {
  const { playerIndex } = action;
  if (playerIndex !== state.currentPlayerIndex) {
    return state;
  }

  const s = cloneState(state);
  const player = s.players[playerIndex];

  const before = snapshotState(state);
  const drawCount = s.penaltyDrawCount > 0 ? s.penaltyDrawCount : 1;
  const reason = s.penaltyDrawCount > 0 ? 'penalty' : 'manual';
  const res = drawCardsIntoHand(s, playerIndex, drawCount);
  s.penaltyDrawCount = 0; // reset after drawing

  s.lastAction = {
    type: ACTION_TYPES.DRAW_CARD,
    playerIndex,
    card: res.cards?.[0] ?? null,
    cards: res.cards || [], // mantener compatibilidad (single + multiple)
  };

  pushLog(s, {
    actorIndex: playerIndex,
    action: 'DRAW',
    details: {
      drawCount: res.drawnCount,
      reason,
      before,
      after: snapshotState(s),
    },
    privateByPlayerIndex: {
      [playerIndex]: { myHandDelta: buildMyHandDelta(res.cards) },
    },
  });

  return s;
}

// --- CALL_UNO ---

function applyCallUno(state, action) {
  const { playerIndex } = action;
  const s = cloneState(state);
  const player = s.players[playerIndex];

  const before = snapshotState(state);
  if (player.hand.length === 1) {
    player.hasCalledUno = true;
  }

  s.lastAction = {
    type: ACTION_TYPES.CALL_UNO,
    playerIndex,
  };

  pushLog(s, {
    actorIndex: playerIndex,
    action: 'CALL_LAST_CARD',
    details: { before, after: snapshotState(s) },
  });

  return s;
}

// --- PASS_TURN ---

function applyPassTurn(state, action) {
  const { playerIndex } = action;
  if (playerIndex !== state.currentPlayerIndex) {
    return state;
  }

  const s = cloneState(state);
  const before = snapshotState(state);
  const canPassExtra =
    !!s.doublePlay &&
    s.doublePlay.playerIndex === playerIndex &&
    (s.doublePlay.remaining ?? null) === 0;
  if (!canPassExtra) return state;

  s.doublePlay = null;

  s.currentPlayerIndex = getNextPlayerIndex(s, playerIndex, 1);
  s.lastAction = {
    type: ACTION_TYPES.PASS_TURN,
    playerIndex,
  };

  pushLog(s, {
    actorIndex: playerIndex,
    action: 'PASS',
    details: { before, after: snapshotState(s) },
  });

  return s;
}

// ====== Helpers para UI / IA ======

function getPlayableCards(state, playerIndex) {
  if (playerIndex !== state.currentPlayerIndex) return [];
  const player = state.players[playerIndex];
  const top = getTopCard(state);
  const basePlayable = player.hand.filter((c) => canPlayCard(c, top));
  // Si hay penalty, permitir double
  if (state.penaltyDrawCount > 0) {
    const doubleCard = player.hand.find((c) => c.value === 'double');
    if (doubleCard && !basePlayable.some((c) => c.id === doubleCard.id)) {
      basePlayable.push(doubleCard);
    }
  }
  return basePlayable;
}

function getTurnInfo(state) {
  const playerIndex = state.currentPlayerIndex;
  const player = state.players[playerIndex];
  const playableCards = getPlayableCards(state, playerIndex);

  return {
    playerIndex,
    player,
    playableCards,
    canDraw: state.drawPile.length > 0 || state.discardPile.length > 1,
    mustCallUno: player.hand.length === 1 && !player.hasCalledUno,
  };
}

module.exports = {
  COLORS,
  VALUES,
  ACTION_TYPES,
  canPlayCard,
  createInitialState,
  refillDeckFromDiscard,
  getTopCard,
  getNextPlayerIndex,
  applyAction,
  getPlayableCards,
  getTurnInfo,
};
