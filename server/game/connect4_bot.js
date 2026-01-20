const { performance } = require("node:perf_hooks");

const COLS = 7;
const ROWS = 6;

function nowMs() {
  return typeof performance?.now === "function" ? performance.now() : Date.now();
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

function findDropRow(board, col) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] == null) return r;
  }
  return -1;
}

function isWinningMove(board, playerIndex, row, col) {
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  const inBounds = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
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

function getLegalCols(board) {
  const out = [];
  for (let c = 0; c < COLS; c++) {
    if (findDropRow(board, c) !== -1) out.push(c);
  }
  return out;
}

function orderedCols(cols) {
  const center = 3;
  return cols
    .slice()
    .sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
}

function applyDrop(board, col, playerIndex) {
  const row = findDropRow(board, col);
  if (row === -1) return null;
  const next = cloneBoard(board);
  next[row][col] = playerIndex;
  return { board: next, row, col };
}

function isBoardFull(board) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] == null) return false;
    }
  }
  return true;
}

function scoreWindow(a, b, botIndex) {
  const opp = botIndex === 0 ? 1 : 0;
  const botCount = a[botIndex];
  const oppCount = a[opp];
  const empty = b;

  if (botCount === 4) return 1_000_000;
  if (oppCount === 4) return -1_000_000;

  if (botCount === 3 && empty === 1) return 140;
  if (botCount === 2 && empty === 2) return 18;

  if (oppCount === 3 && empty === 1) return -170;
  if (oppCount === 2 && empty === 2) return -20;
  return 0;
}

function evaluateBoard(board, botIndex) {
  const opp = botIndex === 0 ? 1 : 0;
  let score = 0;

  // Centro
  for (let r = 0; r < ROWS; r++) {
    if (board[r][3] === botIndex) score += 6;
    else if (board[r][3] === opp) score -= 6;
  }

  const addWindow = (cells) => {
    const counts = { 0: 0, 1: 0 };
    let empty = 0;
    for (const v of cells) {
      if (v == null) empty++;
      else if (v === 0) counts[0]++;
      else if (v === 1) counts[1]++;
    }
    score += scoreWindow(counts, empty, botIndex);
  };

  // Horizontal
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      addWindow([board[r][c], board[r][c + 1], board[r][c + 2], board[r][c + 3]]);
    }
  }
  // Vertical
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r <= ROWS - 4; r++) {
      addWindow([board[r][c], board[r + 1][c], board[r + 2][c], board[r + 3][c]]);
    }
  }
  // Diag \
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      addWindow([board[r][c], board[r + 1][c + 1], board[r + 2][c + 2], board[r + 3][c + 3]]);
    }
  }
  // Diag /
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 3; c < COLS; c++) {
      addWindow([board[r][c], board[r + 1][c - 1], board[r + 2][c - 2], board[r + 3][c - 3]]);
    }
  }

  return score;
}

function findPlayerIndexById(state, botId) {
  const players = Array.isArray(state?.players) ? state.players : [];
  const norm = (v) => String(v ?? "").trim().toLowerCase();
  const target = norm(botId);
  const idx = players.findIndex((p) => norm(p?.id) === target);
  if (idx === 0 || idx === 1) return idx;
  return null;
}

class TimeUp extends Error {
  constructor() {
    super("time_up");
    this.name = "TimeUp";
  }
}

function alphabeta(board, currentIndex, botIndex, depth, alpha, beta, deadlineMs) {
  if (nowMs() >= deadlineMs) throw new TimeUp();

  const opp = currentIndex === 0 ? 1 : 0;
  const legal = orderedCols(getLegalCols(board));
  if (depth === 0 || legal.length === 0) {
    if (isBoardFull(board)) return 0;
    return evaluateBoard(board, botIndex);
  }

  const maximizing = currentIndex === botIndex;
  let best = maximizing ? -Infinity : Infinity;

  for (const col of legal) {
    const drop = applyDrop(board, col, currentIndex);
    if (!drop) continue;

    const win = isWinningMove(drop.board, currentIndex, drop.row, drop.col);
    const val = win
      ? (currentIndex === botIndex ? 900_000 - (8 - depth) : -900_000 + (8 - depth))
      : alphabeta(drop.board, opp, botIndex, depth - 1, alpha, beta, deadlineMs);

    if (maximizing) {
      if (val > best) best = val;
      if (val > alpha) alpha = val;
      if (alpha >= beta) break;
    } else {
      if (val < best) best = val;
      if (val < beta) beta = val;
      if (alpha >= beta) break;
    }
  }

  return best;
}

function pickImmediate(board, playerIndex) {
  const legal = orderedCols(getLegalCols(board));
  for (const col of legal) {
    const drop = applyDrop(board, col, playerIndex);
    if (!drop) continue;
    if (isWinningMove(drop.board, playerIndex, drop.row, drop.col)) return col;
  }
  return null;
}

function getBestMove(state, botId, timeLimitMs = 220) {
  const s = state || {};
  const board = Array.isArray(s.board) ? s.board : null;
  if (!board) return { col: 0 };

  const botIndex = findPlayerIndexById(s, botId) ?? s.currentPlayerIndex ?? 1;
  const current = s.currentPlayerIndex ?? 0;
  const legal = orderedCols(getLegalCols(board));
  if (legal.length === 0) return { col: 0 };

  // Quick tactical checks.
  const winNow = pickImmediate(board, botIndex);
  if (winNow != null) return { col: winNow };
  const opp = botIndex === 0 ? 1 : 0;
  const blockNow = pickImmediate(board, opp);
  if (blockNow != null && legal.includes(blockNow)) return { col: blockNow };

  const start = nowMs();
  const budget = Math.max(20, Number(timeLimitMs) || 220);
  const deadline = start + budget;

  let bestCol = legal[0];
  let bestScore = -Infinity;
  const maxDepth = 8;

  for (let depth = 1; depth <= maxDepth; depth++) {
    if (nowMs() >= deadline) break;
    let localBestCol = bestCol;
    let localBestScore = -Infinity;

    try {
      for (const col of legal) {
        const drop = applyDrop(board, col, current);
        if (!drop) continue;
        const win = isWinningMove(drop.board, current, drop.row, drop.col);
        const val = win
          ? (current === botIndex ? 900_000 : -900_000)
          : alphabeta(
              drop.board,
              current === 0 ? 1 : 0,
              botIndex,
              depth - 1,
              -Infinity,
              Infinity,
              deadline,
            );
        if (val > localBestScore) {
          localBestScore = val;
          localBestCol = col;
        }
      }
    } catch (e) {
      if (!(e instanceof TimeUp)) throw e;
      break;
    }

    bestCol = localBestCol;
    bestScore = localBestScore;
    if (bestScore >= 800_000) break;
  }

  return { col: bestCol };
}

module.exports = { getBestMove };
