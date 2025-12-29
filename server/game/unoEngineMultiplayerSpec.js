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
