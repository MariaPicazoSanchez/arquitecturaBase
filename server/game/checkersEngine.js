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

function isDarkSquare(r, c) {
  return ((r + c) & 1) === 1;
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

function promotePiece(player) {
  return 2 * getSignForPlayer(player);
}

function createInitialBoard() {
  const board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (isDarkSquare(r, c)) board[r][c] = -1;
    }
  }
  for (let r = BOARD_SIZE - 3; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (isDarkSquare(r, c)) board[r][c] = 1;
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
    lastMove: null,
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
  if (!isDarkSquare(fromR, fromC)) return [];
  const piece = board[fromR][fromC];
  if (!isPlayersPiece(piece, player)) return [];

  const out = [];
  for (const [dr, dc] of getMoveDirsForPiece(piece, player)) {
    const midR = fromR + dr;
    const midC = fromC + dc;
    const toR = fromR + dr * 2;
    const toC = fromC + dc * 2;
    if (!inBounds(midR, midC) || !inBounds(toR, toC)) continue;
    if (!isDarkSquare(toR, toC)) continue;
    if (board[toR][toC] !== 0) continue;
    const mid = board[midR][midC];
    if (!isOpponentsPiece(mid, player)) continue;

    out.push({
      from: { r: fromR, c: fromC },
      to: { r: toR, c: toC },
      captured: { r: midR, c: midC },
    });
  }
  return out;
}

function getSimpleMovesForPiece(board, player, fromR, fromC) {
  if (!inBounds(fromR, fromC)) return [];
  if (!isDarkSquare(fromR, fromC)) return [];
  const piece = board[fromR][fromC];
  if (!isPlayersPiece(piece, player)) return [];

  const out = [];
  for (const [dr, dc] of getMoveDirsForPiece(piece, player)) {
    const toR = fromR + dr;
    const toC = fromC + dc;
    if (!inBounds(toR, toC)) continue;
    if (!isDarkSquare(toR, toC)) continue;
    if (board[toR][toC] !== 0) continue;
    out.push({
      from: { r: fromR, c: fromC },
      to: { r: toR, c: toC },
    });
  }
  return out;
}

function getLegalMoves(state, playerColor) {
  const s = state || createInitialState();
  const p = normalizePlayer(playerColor);
  if (!p) return { captures: [], normals: [] };
  if (s.status !== "playing") return { captures: [], normals: [] };

  const board = s.board || createInitialBoard();
  const forced = s.forcedFrom;
  if (forced && inBounds(forced.r, forced.c)) {
    return {
      captures: getCaptureMovesForPiece(board, p, forced.r, forced.c),
      normals: [],
    };
  }

  const captures = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (!isPlayersPiece(board[r][c], p)) continue;
      captures.push(...getCaptureMovesForPiece(board, p, r, c));
    }
  }
  if (captures.length > 0) return { captures, normals: [] };

  const normals = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (!isPlayersPiece(board[r][c], p)) continue;
      normals.push(...getSimpleMovesForPiece(board, p, r, c));
    }
  }
  return { captures: [], normals };
}

function samePos(a, b) {
  return !!a && !!b && a.r === b.r && a.c === b.c;
}

function normalizeApplyMoveArgs(playerOrPayload, fromMaybe, toMaybe) {
  if (
    playerOrPayload &&
    typeof playerOrPayload === "object" &&
    (playerOrPayload.player || playerOrPayload.from || playerOrPayload.to)
  ) {
    return {
      player: playerOrPayload.player,
      from: playerOrPayload.from,
      to: playerOrPayload.to,
    };
  }
  return {
    player: playerOrPayload,
    from: fromMaybe,
    to: toMaybe,
  };
}

function applyMove(state, playerOrPayload, fromMaybe, toMaybe) {
  const s = state || createInitialState();
  const { player, from, to } = normalizeApplyMoveArgs(playerOrPayload, fromMaybe, toMaybe);
  const p = normalizePlayer(player);
  if (!p) throw new CheckersError("INVALID_PLAYER", "Jugador inválido.");
  if (s.status !== "playing") throw new CheckersError("FINISHED", "La partida ya ha terminado.");
  if (s.currentPlayer !== p) throw new CheckersError("NOT_YOUR_TURN", "No es tu turno.");

  if (!from || !to || !inBounds(from.r, from.c) || !inBounds(to.r, to.c)) {
    throw new CheckersError("INVALID_COORDS", "Movimiento inválido.");
  }
  if (!isDarkSquare(from.r, from.c) || !isDarkSquare(to.r, to.c)) {
    throw new CheckersError("ILLEGAL_SQUARE", "Solo se puede jugar en casillas oscuras.");
  }
  if (s.forcedFrom && !samePos(s.forcedFrom, from)) {
    throw new CheckersError("FORCED_PIECE", "Debes seguir capturando con la misma pieza.");
  }

  const board = cloneBoard(s.board);
  const movingPiece = board[from.r][from.c];
  if (movingPiece === 0) throw new CheckersError("EMPTY_FROM", "No hay ninguna pieza en esa casilla.");
  if (!isPlayersPiece(movingPiece, p)) {
    throw new CheckersError("NOT_YOUR_PIECE", "No puedes mover piezas del rival.");
  }

  const legal = getLegalMoves(s, p);
  const pool = legal.captures.length > 0 ? legal.captures : legal.normals;
  const chosen = pool.find((m) => samePos(m.from, from) && samePos(m.to, to));
  if (!chosen) throw new CheckersError("ILLEGAL_MOVE", "Movimiento ilegal.");

  board[from.r][from.c] = 0;
  board[to.r][to.c] = movingPiece;

  let captured = null;
  if (chosen.captured) {
    captured = { ...chosen.captured };
    board[captured.r][captured.c] = 0;
  }

  let becameKing = false;
  if (shouldPromote(board[to.r][to.c], p, to.r)) {
    board[to.r][to.c] = promotePiece(p);
    becameKing = true;
  }

  const next = {
    ...s,
    board,
    lastMove: {
      from: { ...from },
      to: { ...to },
      captured,
      becameKing,
      multi: false,
    },
  };

  const counts = countPieces(board);
  const opponent = p === "white" ? "black" : "white";

  if (counts[opponent] === 0) {
    next.status = "finished";
    next.winner = p;
    next.forcedFrom = null;
    next.currentPlayer = p;
    return next;
  }

  if (captured) {
    const furtherCaptures = getCaptureMovesForPiece(board, p, to.r, to.c);
    if (furtherCaptures.length > 0) {
      next.forcedFrom = { r: to.r, c: to.c };
      next.currentPlayer = p;
      next.lastMove = { ...next.lastMove, multi: true };
      return next;
    }
  }

  next.forcedFrom = null;
  next.currentPlayer = opponent;

  const oppLegal = getLegalMoves(next, opponent);
  const oppHasMove = oppLegal.captures.length > 0 || oppLegal.normals.length > 0;
  if (!oppHasMove) {
    next.status = "finished";
    next.winner = p;
    next.currentPlayer = p;
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
  // exported for tests / helpers
  _internals: {
    isDarkSquare,
    countPieces,
  },
};
