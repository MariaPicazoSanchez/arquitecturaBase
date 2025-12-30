const BOARD_SIZE = 8;

class CheckersError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CheckersError";
    this.code = code;
  }
}

function inBounds(r, c) {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

function cloneBoard(board) {
  return (board || []).map((row) => row.slice());
}

function normalizePlayer(player) {
  return player === "white" || player === "black" ? player : null;
}

function getSignForPlayer(player) {
  return player === "white" ? 1 : -1;
}

function isKing(piece) {
  return Math.abs(piece) === 2;
}

function isPlayersPiece(piece, player) {
  if (player === "white") return piece > 0;
  if (player === "black") return piece < 0;
  return false;
}

function isOpponentsPiece(piece, player) {
  if (player === "white") return piece < 0;
  if (player === "black") return piece > 0;
  return false;
}

function countPieces(board) {
  let white = 0;
  let black = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const v = board[r][c];
      if (v > 0) white++;
      else if (v < 0) black++;
    }
  }
  return { white, black };
}

function shouldPromote(piece, player, row) {
  if (isKing(piece)) return false;
  if (player === "white") return row === 0;
  return row === BOARD_SIZE - 1;
}

function promotePiece(piece, player) {
  const sign = getSignForPlayer(player);
  return 2 * sign;
}

function createInitialBoard() {
  const board = Array.from({ length: BOARD_SIZE }, () =>
    Array(BOARD_SIZE).fill(0),
  );
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if ((r + c) % 2 === 1) board[r][c] = -1;
    }
  }
  for (let r = BOARD_SIZE - 3; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if ((r + c) % 2 === 1) board[r][c] = 1;
    }
  }
  return board;
}

function createInitialState() {
  return {
    board: createInitialBoard(),
    currentPlayer: "white",
    forcedFrom: null,
    status: "playing", // playing|finished
    winner: null, // white|black|null
    lastAction: null,
  };
}

function getMoveDirsForPiece(piece, player) {
  const forward = player === "white" ? -1 : 1;
  const dirs = [
    [forward, -1],
    [forward, 1],
  ];
  if (isKing(piece)) {
    dirs.push([-forward, -1], [-forward, 1]);
  }
  return dirs;
}

function getCaptureMovesForPiece(board, player, fromR, fromC) {
  if (!inBounds(fromR, fromC)) return [];
  const piece = board[fromR][fromC];
  if (!isPlayersPiece(piece, player)) return [];
  const dirs = getMoveDirsForPiece(piece, player);

  const out = [];
  for (const [dr, dc] of dirs) {
    const midR = fromR + dr;
    const midC = fromC + dc;
    const toR = fromR + dr * 2;
    const toC = fromC + dc * 2;
    if (!inBounds(midR, midC) || !inBounds(toR, toC)) continue;
    if (board[toR][toC] !== 0) continue;
    const mid = board[midR][midC];
    if (!isOpponentsPiece(mid, player)) continue;
    out.push({
      from: { r: fromR, c: fromC },
      to: { r: toR, c: toC },
      capture: { r: midR, c: midC },
    });
  }
  return out;
}

function getSimpleMovesForPiece(board, player, fromR, fromC) {
  if (!inBounds(fromR, fromC)) return [];
  const piece = board[fromR][fromC];
  if (!isPlayersPiece(piece, player)) return [];
  const dirs = getMoveDirsForPiece(piece, player);

  const out = [];
  for (const [dr, dc] of dirs) {
    const toR = fromR + dr;
    const toC = fromC + dc;
    if (!inBounds(toR, toC)) continue;
    if (board[toR][toC] !== 0) continue;
    out.push({
      from: { r: fromR, c: fromC },
      to: { r: toR, c: toC },
      capture: null,
    });
  }
  return out;
}

function getLegalMoves(state, player) {
  const s = state || createInitialState();
  const p = normalizePlayer(player);
  if (!p) return [];
  if (s.status !== "playing") return [];

  const board = s.board || createInitialBoard();

  const forced = s.forcedFrom;
  if (forced && inBounds(forced.r, forced.c)) {
    return getCaptureMovesForPiece(board, p, forced.r, forced.c);
  }

  const captures = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (!isPlayersPiece(board[r][c], p)) continue;
      captures.push(...getCaptureMovesForPiece(board, p, r, c));
    }
  }
  if (captures.length > 0) return captures;

  const moves = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (!isPlayersPiece(board[r][c], p)) continue;
      moves.push(...getSimpleMovesForPiece(board, p, r, c));
    }
  }
  return moves;
}

function samePos(a, b) {
  if (!a || !b) return false;
  return a.r === b.r && a.c === b.c;
}

function applyMove(state, { from, to, player } = {}) {
  const s = state || createInitialState();
  const p = normalizePlayer(player);
  if (!p) throw new CheckersError("INVALID_PLAYER", "Jugador inválido.");
  if (s.status !== "playing") throw new CheckersError("FINISHED", "La partida ya ha terminado.");
  if (s.currentPlayer !== p) throw new CheckersError("NOT_YOUR_TURN", "No es tu turno.");

  if (!from || !to || !inBounds(from.r, from.c) || !inBounds(to.r, to.c)) {
    throw new CheckersError("INVALID_COORDS", "Movimiento inválido.");
  }

  if (s.forcedFrom && !samePos(s.forcedFrom, from)) {
    throw new CheckersError(
      "FORCED_PIECE",
      "Debes seguir capturando con la misma pieza.",
    );
  }

  const legal = getLegalMoves(s, p);
  const chosen = legal.find((m) => samePos(m.from, from) && samePos(m.to, to));
  if (!chosen) throw new CheckersError("ILLEGAL_MOVE", "Movimiento ilegal.");

  const board = cloneBoard(s.board);
  const movingPiece = board[from.r][from.c];
  if (!isPlayersPiece(movingPiece, p)) {
    throw new CheckersError("NOT_YOUR_PIECE", "No puedes mover piezas del rival.");
  }

  board[from.r][from.c] = 0;
  board[to.r][to.c] = movingPiece;

  let captured = null;
  if (chosen.capture) {
    captured = { ...chosen.capture };
    board[captured.r][captured.c] = 0;
  }

  let promoted = false;
  if (shouldPromote(board[to.r][to.c], p, to.r)) {
    board[to.r][to.c] = promotePiece(board[to.r][to.c], p);
    promoted = true;
  }

  const next = {
    ...s,
    board,
    lastAction: {
      type: "MOVE",
      player: p,
      from: { ...from },
      to: { ...to },
      capture: captured,
      promoted,
    },
  };

  const counts = countPieces(board);
  const opponent = p === "white" ? "black" : "white";
  if (counts[opponent] === 0) {
    next.status = "finished";
    next.winner = p;
    next.forcedFrom = null;
    next.currentPlayer = p;
    next.lastAction = { ...next.lastAction, type: "WIN", reason: "no_pieces" };
    return next;
  }

  if (captured) {
    const furtherCaptures = getCaptureMovesForPiece(board, p, to.r, to.c);
    if (furtherCaptures.length > 0) {
      next.forcedFrom = { r: to.r, c: to.c };
      next.currentPlayer = p;
      next.lastAction = {
        ...next.lastAction,
        multiCapture: true,
        forcedFrom: next.forcedFrom,
      };
      return next;
    }
  }

  next.forcedFrom = null;
  next.currentPlayer = opponent;

  const oppMoves = getLegalMoves(next, opponent);
  if (oppMoves.length === 0) {
    next.status = "finished";
    next.winner = p;
    next.currentPlayer = p;
    next.lastAction = { ...next.lastAction, type: "WIN", reason: "no_moves" };
    return next;
  }

  return next;
}

module.exports = {
  BOARD_SIZE,
  CheckersError,
  createInitialState,
  getLegalMoves,
  applyMove,
};

