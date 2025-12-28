const ACTION_TYPES = {
  PLACE_TOKEN: 'PLACE_TOKEN',
};

const BOARD_COLS = 7;
const BOARD_ROWS = 6;

function createEmptyBoard() {
  return Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLS).fill(null));
}

function isBoardFull(board) {
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      if (board[r][c] == null) return false;
    }
  }
  return true;
}

function findDropRow(board, column) {
  for (let r = BOARD_ROWS - 1; r >= 0; r--) {
    if (board[r][column] == null) return r;
  }
  return -1;
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

function hasFourInARow(board, playerIndex, row, col) {
  const dirs = [
    [0, 1], // horizontal
    [1, 0], // vertical
    [1, 1], // diag \
    [1, -1], // diag /
  ];

  const inBounds = (r, c) => r >= 0 && r < BOARD_ROWS && c >= 0 && c < BOARD_COLS;
  const isMe = (r, c) => inBounds(r, c) && board[r][c] === playerIndex;

  for (const [dr, dc] of dirs) {
    let count = 1;

    for (let step = 1; step < 4; step++) {
      if (!isMe(row + dr * step, col + dc * step)) break;
      count++;
    }

    for (let step = 1; step < 4; step++) {
      if (!isMe(row - dr * step, col - dc * step)) break;
      count++;
    }

    if (count >= 4) return true;
  }

  return false;
}

function normalizePlayers({ players, names }) {
  const fromPlayers = Array.isArray(players) ? players.slice(0, 2) : null;
  const fromNames = Array.isArray(names) ? names.slice(0, 2) : [];

  const base =
    fromPlayers ??
    fromNames.map((name, idx) => ({ id: idx, name })) ??
    [];

  const list = base.map((p, idx) => ({
    id: p?.id ?? idx,
    name: p?.name ?? `Jugador ${idx + 1}`,
  }));

  while (list.length < 2) {
    const idx = list.length;
    list.push({ id: idx, name: `Jugador ${idx + 1}` });
  }

  return list.map((p, idx) => ({
    id: p.id,
    name: p.name,
    token: idx === 0 ? 'white' : 'red',
  }));
}

function createInitialState({ players, names } = {}) {
  const normalizedPlayers = normalizePlayers({ players, names });
  return {
    players: normalizedPlayers,
    board: createEmptyBoard(),
    currentPlayerIndex: 0,
    status: 'playing', // playing|finished
    winnerIndex: null, // 0|1|null
    lastMove: null, // { playerIndex, row, col, column }
  };
}

function applyAction(state, action) {
  const s = state || createInitialState();
  const a = action || {};

  if (s.status !== 'playing') return s;
  if (a.type !== ACTION_TYPES.PLACE_TOKEN) return s;

  const playerIndex = a.playerIndex;
  if (playerIndex !== 0 && playerIndex !== 1) return s;
  if (playerIndex !== s.currentPlayerIndex) return s;

  const column = Number.parseInt(a.column, 10);
  if (!Number.isFinite(column) || column < 0 || column >= BOARD_COLS) return s;

  const row = findDropRow(s.board, column);
  if (row === -1) return s;

  const board = cloneBoard(s.board);
  board[row][column] = playerIndex;

  const isWin = hasFourInARow(board, playerIndex, row, column);
  const isTie = !isWin && isBoardFull(board);

  const next = {
    ...s,
    board,
    lastMove: { playerIndex, row, col: column, column },
  };

  if (isWin) {
    next.status = 'finished';
    next.winnerIndex = playerIndex;
    return next;
  }

  if (isTie) {
    next.status = 'finished';
    next.winnerIndex = null;
    return next;
  }

  next.currentPlayerIndex = playerIndex === 0 ? 1 : 0;
  return next;
}

module.exports = {
  ACTION_TYPES,
  BOARD_COLS,
  BOARD_ROWS,
  createInitialState,
  applyAction,
};
