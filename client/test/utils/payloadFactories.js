export function unoEstadoBase() {
  const card = { id: 'card-1', color: 'red', value: '5' };
  return {
    players: [
      { id: 'p1', name: 'Jugador 1', hand: [card], hasCalledUno: false },
      { id: 'p2', name: 'Jugador 2', hand: [] },
    ],
    drawPile: [],
    discardPile: [{ id: 'top', color: 'red', value: '8' }],
    currentPlayerIndex: 0,
    direction: 1,
    status: 'playing',
    winnerIndex: null,
    winnerIndexes: [],
    loserIndexes: [],
    finishReason: null,
    lastAction: null,
    doublePlay: null,
    penaltyDrawCount: 0,
    maxHand: 40,
  };
}

export function damasEstadoBase() {
  return {
    board: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 0)),
    status: 'playing',
    currentPlayer: 'white',
    legalMoves: { captures: [], normals: [] },
    players: [
      { id: 'a', color: 'white' },
      { id: 'b', color: 'black' },
    ],
    pieceCounts: { white: 12, black: 12 },
    forcedFrom: null,
    lastMove: null,
  };
}

export function rayaEstadoBase() {
  return {
    players: [
      { id: 'p1', name: 'Blancas' },
      { id: 'p2', name: 'Rojas' },
    ],
    board: Array.from({ length: 6 }, () => Array.from({ length: 7 }, () => null)),
    currentPlayerIndex: 0,
    status: 'playing',
    winnerIndex: null,
    lastMove: null,
    winningCells: null,
  };
}
