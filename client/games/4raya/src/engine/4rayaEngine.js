export function buildEmptyBoard() {
  return Array.from({ length: 6 }, () => Array(7).fill(null));
}

export function createInitialEngineState() {
  return {
    players: [],
    board: buildEmptyBoard(),
    currentPlayerIndex: 0,
    status: "playing",
    winnerIndex: null,
    lastMove: null,
    winningCells: null,
  };
}

export function resolveEnginePayload(payload) {
  if (!payload) return null;
  if (payload.engine) return payload.engine;
  if (payload.state) return payload.state;
  return null;
}

export function mergeEngineState(previous, next) {
  if (!next) return previous;
  return { ...previous, ...next };
}

export function deriveStatusText(engineState, myIndex, isMyTurn) {
  if (!engineState) return "";

  if (engineState.status === "finished") {
    if (engineState.winnerIndex == null) return "Empate.";
    if (myIndex != null && engineState.winnerIndex === myIndex) return "¡Has ganado!";
    return "Has perdido.";
  }

  const players = engineState.players || [];
  const turnName = players[engineState.currentPlayerIndex]?.name ?? "—";
  if (myIndex == null) {
    return players.length < 2 ? "Esperando al segundo jugador..." : `Turno de ${turnName}`;
  }
  return isMyTurn ? "Tu turno" : `Turno de ${turnName}`;
}

export function buildWinningSet(engineState, isReviewingEnd) {
  if (!engineState || !isReviewingEnd) return null;
  const arr = Array.isArray(engineState.winningCells) ? engineState.winningCells : null;
  if (!arr || arr.length === 0) return null;
  return new Set(arr.map((cell) => `${cell.r},${cell.c}`));
}
