const {
  createInitialState,
  applyAction,
  ACTION_TYPES,
  getTopCard,
  refillDeckFromDiscard,
} = require("./unoEngineMultiplayer");

const countTotalCards = (state) => {
  const hands =
    (state.players || []).reduce((sum, p) => sum + ((p && p.hand) || []).length, 0) || 0;
  return hands + (state.drawPile || []).length + (state.discardPile || []).length;
};

describe("[UNO] recarga del mazo desde descarte", function () {
  it("refillDeckFromDiscard recicla el descarte (excepto top) in-place", function () {
    let state = createInitialState({ numPlayers: 2, names: ["A", "B"] });

    const moved = state.drawPile.slice(0, 6);
    state = {
      ...state,
      drawPile: [],
      discardPile: [...state.discardPile, ...moved],
    };

    const topBefore = getTopCard(state);
    const totalBefore = countTotalCards(state);

    const res = refillDeckFromDiscard(state);
    expect(res.ok).toBe(true);
    expect(res.movedCount).toBeGreaterThan(0);
    expect(getTopCard(state)).toEqual(topBefore);
    expect(state.discardPile.length).toEqual(1);
    expect(state.drawPile.length).toEqual(res.movedCount);
    expect(countTotalCards(state)).toEqual(totalBefore);
  });
  it("recicla el descarte (excepto top) al robar con drawPile vacío", function () {
    let state = createInitialState({ numPlayers: 2, names: ["A", "B"] });

    const moved = state.drawPile.slice(0, 4);
    state = {
      ...state,
      drawPile: [],
      discardPile: [...state.discardPile, ...moved],
    };

    const topBefore = getTopCard(state);
    const totalBefore = countTotalCards(state);

    const next = applyAction(state, {
      type: ACTION_TYPES.DRAW_CARD,
      playerIndex: state.currentPlayerIndex,
    });

    expect(getTopCard(next)).toEqual(topBefore);
    expect(next.discardPile.length).toEqual(1);
    expect(next.players[state.currentPlayerIndex].hand.length).toEqual(
      state.players[state.currentPlayerIndex].hand.length + 1
    );
    expect(countTotalCards(next)).toEqual(totalBefore);
  });

  it("no puede recargar si solo hay 1 carta en descarte", function () {
    let state = createInitialState({ numPlayers: 2, names: ["A", "B"] });
    state = { ...state, drawPile: [], discardPile: [getTopCard(state)] };

    const totalBefore = countTotalCards(state);
    const next = applyAction(state, {
      type: ACTION_TYPES.DRAW_CARD,
      playerIndex: state.currentPlayerIndex,
    });

    expect(next.drawPile.length).toEqual(0);
    expect(next.discardPile.length).toEqual(1);
    expect(next.lastAction && next.lastAction.card).toBe(null);
    expect(countTotalCards(next)).toEqual(totalBefore);
  });

  it("aplica +2 recargando desde descarte si el mazo se agota", function () {
    let state = createInitialState({ numPlayers: 2, names: ["A", "B"] });

    const plus2Index = state.drawPile.findIndex((c) => c && c.value === "+2" && c.color !== "wild");
    expect(plus2Index).toBeGreaterThan(-1);
    const plus2Card = state.drawPile[plus2Index];

    let drawAfterPicking = state.drawPile.slice();
    drawAfterPicking.splice(plus2Index, 1);

    const topMatchIndex = drawAfterPicking.findIndex((c) => c && c.color === plus2Card.color && c.color !== "wild");
    expect(topMatchIndex).toBeGreaterThan(-1);
    const topMatch = drawAfterPicking[topMatchIndex];
    drawAfterPicking.splice(topMatchIndex, 1);

    const p0 = state.players[0];
    const p1 = state.players[1];

    state = {
      ...state,
      players: [
        { ...p0, hand: [...p0.hand, plus2Card] },
        { ...p1 },
      ],
      drawPile: [],
      discardPile: [...drawAfterPicking, ...state.discardPile, topMatch],
    };

    const topBefore = getTopCard(state);
    expect(topBefore).toEqual(topMatch);

    const totalBefore = countTotalCards(state);

    const next = applyAction(state, {
      type: ACTION_TYPES.PLAY_CARD,
      playerIndex: 0,
      cardId: plus2Card.id,
    });

    expect(getTopCard(next)).toEqual(plus2Card);
    expect(next.discardPile.length).toEqual(1);
    expect(next.players[1].hand.length).toEqual(p1.hand.length + 2);
    expect(countTotalCards(next)).toEqual(totalBefore);
  });
});

describe("[UNO] l\u00edmite m\u00e1ximo de cartas en mano (MAX_HAND)", function () {
  const mkCard = (id) => ({ id: `c-${id}`, color: "red", value: String(id) });

  it("con 2 jugadores: si alguien llega a 40, gana el otro", function () {
    let state = createInitialState({ numPlayers: 2, names: ["A", "B"] });
    state = {
      ...state,
      currentPlayerIndex: 1,
      players: [
        { ...state.players[0], hand: Array.from({ length: 10 }, (_, i) => mkCard(`p0-${i}`)) },
        { ...state.players[1], hand: Array.from({ length: 39 }, (_, i) => mkCard(`p1-${i}`)) },
      ],
      drawPile: [mkCard("draw-0")],
    };

    const next = applyAction(state, {
      type: ACTION_TYPES.DRAW_CARD,
      playerIndex: 1,
    });

    expect(next.status).toBe("finished");
    expect(next.finishReason).toBe("max_hand");
    expect(next.winnerIndexes).toEqual([0]);
    expect(next.loserIndexes).toEqual([1]);
    expect(next.lastAction && next.lastAction.finishReason).toBe("max_hand");
    expect(next.lastAction && next.lastAction.maxHand).toBe(40);
    expect(next.lastAction && next.lastAction.triggeredBy).toBe(1);
  });

  it("con 3+ jugadores: gana(n) los de menor mano y el resto pierde", function () {
    let state = createInitialState({ numPlayers: 3, names: ["A", "B", "C"] });
    state = {
      ...state,
      currentPlayerIndex: 1,
      players: [
        { ...state.players[0], hand: Array.from({ length: 10 }, (_, i) => mkCard(`p0-${i}`)) },
        { ...state.players[1], hand: Array.from({ length: 39 }, (_, i) => mkCard(`p1-${i}`)) },
        { ...state.players[2], hand: Array.from({ length: 5 }, (_, i) => mkCard(`p2-${i}`)) },
      ],
      drawPile: [mkCard("draw-0")],
    };

    const next = applyAction(state, {
      type: ACTION_TYPES.DRAW_CARD,
      playerIndex: 1,
    });

    expect(next.status).toBe("finished");
    expect(next.finishReason).toBe("max_hand");
    expect(next.winnerIndexes).toEqual([2]);
    expect(next.loserIndexes.sort()).toEqual([0, 1]);
  });

  it("si hay empate en la menor mano, devuelve varios ganadores", function () {
    let state = createInitialState({ numPlayers: 3, names: ["A", "B", "C"] });
    state = {
      ...state,
      currentPlayerIndex: 1,
      players: [
        { ...state.players[0], hand: Array.from({ length: 5 }, (_, i) => mkCard(`p0-${i}`)) },
        { ...state.players[1], hand: Array.from({ length: 39 }, (_, i) => mkCard(`p1-${i}`)) },
        { ...state.players[2], hand: Array.from({ length: 5 }, (_, i) => mkCard(`p2-${i}`)) },
      ],
      drawPile: [mkCard("draw-0")],
    };

    const next = applyAction(state, {
      type: ACTION_TYPES.DRAW_CARD,
      playerIndex: 1,
    });

    expect(next.status).toBe("finished");
    expect(next.finishReason).toBe("max_hand");
    expect(next.winnerIndexes.sort()).toEqual([0, 2]);
    expect(next.winnerIndex).toBe(null);
    expect(next.loserIndexes).toEqual([1]);
  });

  it("prioriza victoria normal (0 cartas) frente a max hand en la misma acci\u00f3n", function () {
    let state = createInitialState({ numPlayers: 2, names: ["A", "B"] });
    const plus8 = { id: "red-plus8", color: "red", value: "+8" };

    state = {
      ...state,
      currentPlayerIndex: 0,
      players: [
        { ...state.players[0], hand: [plus8] },
        { ...state.players[1], hand: Array.from({ length: 32 }, (_, i) => mkCard(`p1-${i}`)) },
      ],
      discardPile: [{ id: "top", color: "red", value: "5" }],
      drawPile: Array.from({ length: 8 }, (_, i) => mkCard(`draw-${i}`)),
    };

    const next = applyAction(state, {
      type: ACTION_TYPES.PLAY_CARD,
      playerIndex: 0,
      cardId: plus8.id,
    });

    expect(next.status).toBe("finished");
    expect(next.finishReason).toBe("normal");
    expect(next.winnerIndexes).toEqual([0]);
  });
});
