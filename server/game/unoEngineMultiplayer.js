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

  return {
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
  };
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
  };
}

function refillDeckFromDiscard(state) {
  const draw = state?.drawPile ?? state?.deck ?? state?.mazo;
  const disc = state?.discardPile ?? state?.discard ?? state?.tiradas;

  if (!Array.isArray(draw) || !Array.isArray(disc)) {
    return { ok: false, reason: 'missing_piles', movedCount: 0 };
  }

  if (draw.length > 0) return { ok: false, reason: 'not_empty', movedCount: 0 };
  if (disc.length <= 1) return { ok: false, reason: 'not_enough_discard', movedCount: 0 };

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

  return { ok: true, reason: 'ok', movedCount: normalizedRecycle.length, top, seq };
}

function drawOneCard(state) {
  const draw = state?.drawPile ?? state?.deck ?? state?.mazo;
  if (!Array.isArray(draw)) return { card: null, refilled: false, movedCount: 0 };

  let refillRes = { ok: false, movedCount: 0 };
  if (draw.length === 0) {
    refillRes = refillDeckFromDiscard(state);
  }

  const drawAfter = state?.drawPile ?? state?.deck ?? state?.mazo;
  const card = Array.isArray(drawAfter) ? (drawAfter.shift() ?? null) : null;
  return { card, refilled: refillRes.ok, movedCount: refillRes.movedCount };
}

function drawCardsIntoHand(state, playerIndex, count) {
  const player = state.players[playerIndex];
  let drawnCount = 0;
  let refilled = false;

  for (let i = 0; i < count; i++) {
    const res = drawOneCard(state);
    if (!res.card) break;
    if (res.refilled) refilled = true;
    player.hand.push(res.card);
    drawnCount++;
  }

  return { drawnCount, refilled };
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

function applyForcedDraw(state, playerIndex, count) {
  const victimIndex = getNextPlayerIndex(state, playerIndex, 1);
  const res = drawCardsIntoHand(state, victimIndex, count);
  state.currentPlayerIndex = getNextPlayerIndex(state, victimIndex, 1);
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
    case ACTION_TYPES.PLAY_CARD:
      return applyPlayCard(state, action);
    case ACTION_TYPES.DRAW_CARD:
      return applyDrawCard(state, action);
    case ACTION_TYPES.CALL_UNO:
      return applyCallUno(state, action);
    case ACTION_TYPES.PASS_TURN:
      return applyPassTurn(state, action);
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

  if (card.value === '+2') {
    applyForcedDraw(s, playerIndex, 2);
  } else if (card.value === 'skip') {
    s.currentPlayerIndex = getNextPlayerIndex(s, playerIndex, 2);
  } else if (card.value === 'reverse') {
    s.direction = -s.direction;
    s.currentPlayerIndex = getNextPlayerIndex(s, playerIndex, 1);
  } else if (card.value === '+4' || card.value === '+6' || card.value === '+8') {
    const drawCount = card.value === '+4' ? 4 : card.value === '+6' ? 6 : 8;
    applyForcedDraw(s, playerIndex, drawCount);
  } else if (card.value === 'wild') {
    s.currentPlayerIndex = getNextPlayerIndex(s, playerIndex, 1);
  } else if (card.value === 'skip_all') {
    s.currentPlayerIndex = playerIndex;
  } else if (card.value === 'double') {
    const victimIndex = getNextPlayerIndex(s, playerIndex, 1);
    const n = s.players[victimIndex].hand.length;
    drawCardsIntoHand(s, victimIndex, n);
    s.currentPlayerIndex = getNextPlayerIndex(s, victimIndex, 1);
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

  const drawCount = s.penaltyDrawCount > 0 ? s.penaltyDrawCount : 1;
  const drawnCards = [];
  for (let i = 0; i < drawCount; i++) {
    const res = drawOneCard(s);
    if (res.card) {
      player.hand.push(res.card);
      drawnCards.push(res.card);
    } else {
      break;
    }
  }
  s.penaltyDrawCount = 0; // reset after drawing

  s.lastAction = {
    type: ACTION_TYPES.DRAW_CARD,
    playerIndex,
    card: drawnCards[0] ?? null,
    cards: drawnCards, // mantener compatibilidad (single + multiple)
  };

  return s;
}

// --- CALL_UNO ---

function applyCallUno(state, action) {
  const { playerIndex } = action;
  const s = cloneState(state);
  const player = s.players[playerIndex];

  if (player.hand.length === 1) {
    player.hasCalledUno = true;
  }

  s.lastAction = {
    type: ACTION_TYPES.CALL_UNO,
    playerIndex,
  };

  return s;
}

// --- PASS_TURN ---

function applyPassTurn(state, action) {
  const { playerIndex } = action;
  if (playerIndex !== state.currentPlayerIndex) {
    return state;
  }

  const s = cloneState(state);
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
