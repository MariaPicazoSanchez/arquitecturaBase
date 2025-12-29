// ====== Configuración de cartas ======

import { rebuildDeckIfNeeded, shuffle } from './deckUtils';

export const COLORS = ['red', 'green', 'blue', 'yellow'];
export const VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

// Especiales con color
const SPECIAL_COLOR_COUNTS = {
  skip: 2,
  '+2': 2,
  reverse: 2,
  double: 1,
};

// Especiales sin color (comodines)
const COLORLESS_COUNTS = {
  wild: 4, // cambio de color
  '+4': 4,
  swap: 2,
  discard_all: 2,
  skip_all: 1,
  '+6': 2,
  '+8': 1,
};

export const ACTION_TYPES = {
  PLAY_CARD: 'PLAY_CARD',
  DRAW_CARD: 'DRAW_CARD',
  CALL_UNO: 'CALL_UNO',
  PASS_TURN: 'PASS_TURN',
};

// ====== Utilidades de cartas/mazo ======

function createCard(color, value) {
  return {
    id: `${color}-${value}-${Math.random().toString(36).slice(2)}`,
    color, // 'red' | 'green' | 'blue' | 'yellow' | 'wild'
    value, // '0'-'9', 'skip', '+2', 'reverse', 'wild', '+4'
  };
}

function createDeck() {
  const deck = [];

  // Cartas numéricas + especiales con color
  for (const color of COLORS) {
    // números: 1x 0, 2x 1..9
    for (const v of VALUES) {
      deck.push(createCard(color, v));
      if (v !== '0') deck.push(createCard(color, v));
    }
    // especiales de color (con distintas cantidades)
    for (const [value, count] of Object.entries(SPECIAL_COLOR_COUNTS)) {
      for (let i = 0; i < count; i++) deck.push(createCard(color, value));
    }
  }

  // Comodines sin color (con distintas cantidades)
  for (const [value, count] of Object.entries(COLORLESS_COUNTS)) {
    for (let i = 0; i < count; i++) deck.push(createCard('wild', value));
  }

  return shuffle(deck);
}

// ====== Reglas básicas ======

export function canPlayCard(card, topCard) {
  if (!card || !topCard) return false;
  // comodines (wild y +4) siempre se pueden jugar
  if (card.color === 'wild') return true;
  // resto: coincide color o valor
  return card.color === topCard.color || card.value === topCard.value;
}

// ====== Estado inicial ======

export function createInitialState({ numPlayers = 2, names = [] } = {}) {
  if (numPlayers < 2) {
    throw new Error('UNO necesita al menos 2 jugadores.');
  }

  let deck = createDeck();

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

  let drawPile = deck.slice(numPlayers * CARDS_PER_PLAYER);

  // Primera carta en mesa: intentamos que no sea comodín
  let firstCard = drawPile.shift();
  let safety = 0;
  while (
    firstCard.color === 'wild' &&
    drawPile.length > 0 &&
    safety < 10
  ) {
    drawPile.push(firstCard);
    firstCard = drawPile.shift();
    safety++;
  }

  const discardPile = [firstCard];

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

export function getTopCard(state) {
  return state.discardPile[state.discardPile.length - 1] ?? null;
}

export function getNextPlayerIndex(state, fromIndex = state.currentPlayerIndex, steps = 1) {
  const n = state.players.length;
  let idx = fromIndex;
  for (let i = 0; i < steps; i++) {
    idx = (idx + state.direction + n) % n;
  }
  return idx;
}

// ====== Acciones ======

export function applyAction(state, action) {
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

function drawOneFromPile(s) {
  let rebuiltDeck = false;

  if (s.drawPile.length === 0) {
    const rebuilt = rebuildDeckIfNeeded({
      deck: s.drawPile,
      discard: s.discardPile,
    });
    if (rebuilt.rebuilt) {
      s.drawPile = rebuilt.deck;
      s.discardPile = rebuilt.discard;
      rebuiltDeck = true;
    }
  }

  const card = s.drawPile.shift() ?? null;
  return { card, rebuiltDeck };
}

function drawCardsIntoHand(s, playerIndex, count) {
  const player = s.players[playerIndex];
  let drawnCount = 0;
  let rebuiltDeck = false;

  for (let i = 0; i < count; i++) {
    const res = drawOneFromPile(s);
    if (!res.card) break;
    if (res.rebuiltDeck) rebuiltDeck = true;
    player.hand.push(res.card);
    drawnCount++;
  }

  return { drawnCount, rebuiltDeck };
}

// --- PLAY_CARD ---

function applyPlayCard(state, action) {
  const { playerIndex, cardId, chosenColor, chosenTargetIndex, chosenTargetId } = action;
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

  const isWildType = card.color === 'wild'; // wild, +4, swap, discard_all, skip_all, +6, +8
  if (isWildType && !chosenColor) {
    // si es comodín, necesitamos color elegido
    return state;
  }

  if (card.value === 'swap') {
    const resolvedTargetIdx =
      chosenTargetId != null
        ? s.players.findIndex((p) => String(p.id) === String(chosenTargetId))
        : Number.isInteger(chosenTargetIndex)
          ? chosenTargetIndex
          : -1;
    if (resolvedTargetIdx < 0 || resolvedTargetIdx >= s.players.length) return state;
    if (resolvedTargetIdx === playerIndex) return state;
  }

  // carta que va a la pila de descarte (comodines cambian el color visible)
  const cardForDiscard = isWildType
    ? { ...card, color: chosenColor }
    : card;

  // quitar de la mano y descartar
  player.hand.splice(cardIdx, 1);
  s.discardPile.push(cardForDiscard);

  // reset de UNO si ya no tiene 1 carta
  if (player.hand.length !== 1) {
    player.hasCalledUno = false;
  }

  const baseLastAction = {
    type: ACTION_TYPES.PLAY_CARD,
    playerIndex,
    card: cardForDiscard,
  };

  // Efectos especiales según valor
  let rebuiltDeck = false;
  let forcedDraw = null;
  let swapTargetIndex = null;

  if (card.value === '+2') {
    const victimIndex = getNextPlayerIndex(s, playerIndex, 1);
    const res = drawCardsIntoHand(s, victimIndex, 2);
    if (res.rebuiltDeck) rebuiltDeck = true;
    if (res.drawnCount > 0) forcedDraw = { victimIndex, count: res.drawnCount };
    s.currentPlayerIndex = getNextPlayerIndex(s, victimIndex, 1);
  } else if (card.value === 'skip') {
    s.currentPlayerIndex = getNextPlayerIndex(s, playerIndex, 2);
  } else if (card.value === 'reverse') {
    s.direction = -s.direction;
    s.currentPlayerIndex = getNextPlayerIndex(s, playerIndex, 1);
  } else if (card.value === '+4') {
    s.penaltyDrawCount = 4;
    s.currentPlayerIndex = getNextPlayerIndex(s, playerIndex, 1);
  } else if (card.value === '+6') {
    s.penaltyDrawCount = 6;
    s.currentPlayerIndex = getNextPlayerIndex(s, playerIndex, 1);
  } else if (card.value === '+8') {
    s.penaltyDrawCount = 8;
    s.currentPlayerIndex = getNextPlayerIndex(s, playerIndex, 1);
  } else if (card.value === 'wild') {
    s.currentPlayerIndex = getNextPlayerIndex(s, playerIndex, 1);
  } else if (card.value === 'skip_all') {
    s.currentPlayerIndex = playerIndex;
  } else if (card.value === 'double') {
    if (s.penaltyDrawCount > 0) {
      s.penaltyDrawCount *= 2;
    } else {
      s.penaltyDrawCount = 2;
    }
    s.currentPlayerIndex = getNextPlayerIndex(s, playerIndex, 1);
  } else if (card.value === 'discard_all') {
    const toDiscard = player.hand.filter((c) => c.color === chosenColor);
    player.hand = player.hand.filter((c) => c.color !== chosenColor);
    s.discardPile.push(...toDiscard);
    if (player.hand.length !== 1) player.hasCalledUno = false;
    s.currentPlayerIndex = getNextPlayerIndex(s, playerIndex, 1);
  } else if (card.value === 'swap') {
    const resolvedTargetIdx =
      chosenTargetId != null
        ? s.players.findIndex((p) => String(p.id) === String(chosenTargetId))
        : Number.isInteger(chosenTargetIndex)
          ? chosenTargetIndex
          : -1;
    if (resolvedTargetIdx < 0 || resolvedTargetIdx >= s.players.length) return state;
    if (resolvedTargetIdx === playerIndex) return state;

    swapTargetIndex = resolvedTargetIdx;

    const target = s.players[resolvedTargetIdx];
    const tmp = player.hand;
    player.hand = target.hand;
    target.hand = tmp;

    if (player.hand.length !== 1) player.hasCalledUno = false;
    if (target.hand.length !== 1) target.hasCalledUno = false;

    s.currentPlayerIndex = getNextPlayerIndex(s, playerIndex, 1);
  } else {
    // carta normal
    s.currentPlayerIndex = getNextPlayerIndex(s, playerIndex, 1);
  }

  // Consumir jugada extra (la carta "double" concede la extra para la siguiente acción)
  // doublePlay se resuelve más abajo.

  // ¿ha ganado? (después de efectos como swap/discard_all)
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

  s.lastAction = {
    ...baseLastAction,
    ...(rebuiltDeck ? { rebuiltDeck: true } : null),
    ...(forcedDraw ? { forcedDraw } : null),
  };

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
  let rebuiltDeck = false;
  for (let i = 0; i < drawCount; i++) {
    const res = drawOneFromPile(s);
    if (res.card) {
      player.hand.push(res.card);
      drawnCards.push(res.card);
    }
    if (res.rebuiltDeck) rebuiltDeck = true;
  }
  s.penaltyDrawCount = 0;

  s.lastAction = {
    type: ACTION_TYPES.DRAW_CARD,
    playerIndex,
    cards: drawnCards,
    ...(rebuiltDeck ? { rebuiltDeck: true } : null),
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

export function getPlayableCards(state, playerIndex) {
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

export function getTurnInfo(state) {
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
