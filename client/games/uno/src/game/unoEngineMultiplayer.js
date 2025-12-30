// ====== Configuración de cartas ======

import { rebuildDeckIfNeeded, shuffle } from './deckUtils';

export const COLORS = ['red', 'green', 'blue', 'yellow'];
export const VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

const SPECIAL_COLOR_COUNTS = {
  skip: 2,
  '+2': 2,
  reverse: 2,
  double: 1,
};

const COLORLESS_COUNTS = {
  swap: 2,
  discard_all: 2,
  skip_all: 1,
};

const COLORLESS_VALUES = ['wild', '+4'];

// +6/+8 son cartas con color (no comodines): su cantidad es total (no por color).
const COLORED_SPECIAL_TOTAL_COUNTS = {
  '+6': 2,
  '+8': 1,
};

export const ACTION_TYPES = {
  PLAY_CARD: 'PLAY_CARD',
  DRAW_CARD: 'DRAW_CARD',
  CALL_UNO: 'CALL_UNO',
  PASS_TURN: 'PASS_TURN',
};

const WILD_VALUES = new Set(['wild', '+4', 'swap', 'discard_all', 'skip_all']);
const MAX_HAND = 40;

function createCard(color, value) {
  return {
    id: `${color}-${value}-${Math.random().toString(36).slice(2)}`,
    color,
    value,
  };
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

  for (const [value, count] of Object.entries(COLORED_SPECIAL_TOTAL_COUNTS)) {
    if (count <= 0) continue;
    const shuffledColors = shuffle(COLORS);
    for (let i = 0; i < count; i++) {
      deck.push(createCard(shuffledColors[i % shuffledColors.length], value));
    }
  }

  for (const [value, count] of Object.entries(COLORLESS_COUNTS)) {
    for (let i = 0; i < count; i++) deck.push(createCard('wild', value));
  }

  for (const value of COLORLESS_VALUES) {
    for (let i = 0; i < 4; i++) deck.push(createCard('wild', value));
  }

  return shuffle(deck);
}

// ====== Reglas básicas ======

export function canPlayCard(card, topCard) {
  if (!card || !topCard) return false;
  if (WILD_VALUES.has(card.value)) return true;
  return card.color === topCard.color || card.value === topCard.value;
}

// ====== Estado inicial ======

export function createInitialState({ numPlayers = 2, names = [] } = {}) {
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

  let firstCard = drawPile.shift();
  let safety = 0;
  while (WILD_VALUES.has(firstCard?.value) && drawPile.length > 0 && safety < 10) {
    drawPile.push(firstCard);
    firstCard = drawPile.shift();
    safety++;
  }

  const discardPile = firstCard ? [firstCard] : [];

  if (
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    window?.localStorage?.getItem &&
    window.localStorage.getItem('UNO_DEBUG_WILDS') === '1'
  ) {
    const wildCount = drawPile.filter((c) => c?.value === 'wild').length;
    const plus4Count = drawPile.filter((c) => c?.value === '+4').length;
    // eslint-disable-next-line no-console
    console.log('[UNO] init drawPile', { wild: wildCount, plus4: plus4Count, total: drawPile.length });
  }

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
    winnerIndexes: [],
    loserIndexes: [],
    finishReason: null, // 'normal' | 'max_hand'
    maxHand: MAX_HAND,
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
    penaltyDrawCount: state.penaltyDrawCount ?? 0,
    winnerIndexes: Array.isArray(state.winnerIndexes) ? [...state.winnerIndexes] : [],
    loserIndexes: Array.isArray(state.loserIndexes) ? [...state.loserIndexes] : [],
    finishReason: state.finishReason ?? null,
  };
}

function finishGame(state, { finishReason, winnerIndexes, loserIndexes, triggeredByPlayerIndex } = {}) {
  const winners = Array.isArray(winnerIndexes) ? [...winnerIndexes] : [];
  const losers =
    Array.isArray(loserIndexes)
      ? [...loserIndexes]
      : Array.from({ length: state.players.length }, (_, idx) => idx).filter(
          (idx) => !winners.includes(idx),
        );

  state.status = 'finished';
  state.finishReason = finishReason ?? 'normal';
  state.winnerIndexes = winners;
  state.loserIndexes = losers;
  state.winnerIndex = winners.length === 1 ? winners[0] : null;

  if (state.finishReason === 'max_hand') {
    state.lastAction = {
      ...(state.lastAction || {}),
      finishReason: 'max_hand',
      maxHand: MAX_HAND,
      triggeredBy: triggeredByPlayerIndex ?? null,
    };
  }
}

function checkMaxHandLose(state, { triggeredByPlayerIndex } = {}) {
  const counts = (state.players || []).map((p) => (Array.isArray(p?.hand) ? p.hand.length : 0));
  if (counts.length === 0) return false;
  if (!counts.some((n) => n >= MAX_HAND)) return false;

  const minCount = Math.min(...counts);
  const winnerIndexes = counts
    .map((n, idx) => ({ n, idx }))
    .filter((x) => x.n === minCount)
    .map((x) => x.idx);

  finishGame(state, {
    finishReason: 'max_hand',
    winnerIndexes,
    triggeredByPlayerIndex,
  });
  return true;
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

function applyForcedDraw(s, playerIndex, count) {
  const victimIndex = getNextPlayerIndex(s, playerIndex, 1);
  const res = drawCardsIntoHand(s, victimIndex, count);
  s.currentPlayerIndex = getNextPlayerIndex(s, victimIndex, 1);
  return { victimIndex, ...res };
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

function applyPlayCard(state, action) {
  const { playerIndex, cardId, chosenColor, chosenTargetIndex, chosenTargetId } = action;
  if (playerIndex !== state.currentPlayerIndex) return state;

  const s = cloneState(state);
  const player = s.players[playerIndex];
  const top = getTopCard(s);

  const cardIdx = player.hand.findIndex((c) => c.id === cardId);
  if (cardIdx === -1) return state;

  const card = player.hand[cardIdx];
  if (!canPlayCard(card, top)) return state;

  const isWildType = WILD_VALUES.has(card.value);
  if (isWildType && !chosenColor) return state;

  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[UNO] play', { value: card.value, color: card.color, chosenColor });
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

  let rebuiltDeck = false;
  let forcedDraw = null;
  let swapTargetIndex = null;

  if (card.value === '+2') {
    const res = applyForcedDraw(s, playerIndex, 2);
    if (res.rebuiltDeck) rebuiltDeck = true;
    if (res.drawnCount > 0) forcedDraw = { victimIndex: res.victimIndex, count: res.drawnCount };
  } else if (card.value === 'skip') {
    s.currentPlayerIndex = getNextPlayerIndex(s, playerIndex, 2);
  } else if (card.value === 'reverse') {
    s.direction = -s.direction;
    s.currentPlayerIndex = getNextPlayerIndex(s, playerIndex, 1);
  } else if (card.value === '+4') {
    const res = applyForcedDraw(s, playerIndex, 4);
    if (res.rebuiltDeck) rebuiltDeck = true;
    if (res.drawnCount > 0) forcedDraw = { victimIndex: res.victimIndex, count: res.drawnCount };
  } else if (card.value === '+6') {
    const res = applyForcedDraw(s, playerIndex, 6);
    if (res.rebuiltDeck) rebuiltDeck = true;
    if (res.drawnCount > 0) forcedDraw = { victimIndex: res.victimIndex, count: res.drawnCount };
  } else if (card.value === '+8') {
    const res = applyForcedDraw(s, playerIndex, 8);
    if (res.rebuiltDeck) rebuiltDeck = true;
    if (res.drawnCount > 0) forcedDraw = { victimIndex: res.victimIndex, count: res.drawnCount };
  } else if (card.value === 'wild') {
    s.currentPlayerIndex = getNextPlayerIndex(s, playerIndex, 1);
  } else if (card.value === 'skip_all') {
    s.currentPlayerIndex = playerIndex;
  } else if (card.value === 'double') {
    const victimIndex = getNextPlayerIndex(s, playerIndex, 1);
    const n = s.players[victimIndex].hand.length;
    const res = drawCardsIntoHand(s, victimIndex, n);
    if (res.rebuiltDeck) rebuiltDeck = true;
    if (res.drawnCount > 0) forcedDraw = { victimIndex, count: res.drawnCount };
    s.currentPlayerIndex = getNextPlayerIndex(s, victimIndex, 1);
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
    s.currentPlayerIndex = getNextPlayerIndex(s, playerIndex, 1);
  }

  if (swapTargetIndex != null && swapTargetIndex >= 0) {
    const target = s.players[swapTargetIndex];
    if (target?.hand?.length === 0) {
      s.lastAction = baseLastAction;
      finishGame(s, { finishReason: 'normal', winnerIndexes: [swapTargetIndex] });
      return s;
    }
  }

  if (player.hand.length === 0) {
    s.lastAction = baseLastAction;
    finishGame(s, { finishReason: 'normal', winnerIndexes: [playerIndex] });
    return s;
  }

  if (s.doublePlay && s.doublePlay.playerIndex === playerIndex) {
    if ((s.doublePlay.remaining ?? 0) > 0) {
      s.doublePlay.remaining -= 1;
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

  if (checkMaxHandLose(s, { triggeredByPlayerIndex: playerIndex })) {
    return s;
  }
  return s;
}

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
    if (!res.card) break;
    if (res.rebuiltDeck) rebuiltDeck = true;
    player.hand.push(res.card);
    drawnCards.push(res.card);
  }
  s.penaltyDrawCount = 0;

  s.lastAction = {
    type: ACTION_TYPES.DRAW_CARD,
    playerIndex,
    card: drawnCards[0] ?? null,
    cards: drawnCards,
    ...(rebuiltDeck ? { rebuiltDeck: true } : null),
  };

  if (checkMaxHandLose(s, { triggeredByPlayerIndex: playerIndex })) {
    return s;
  }
  return s;
}

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
  return player.hand.filter((c) => canPlayCard(c, top));
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
