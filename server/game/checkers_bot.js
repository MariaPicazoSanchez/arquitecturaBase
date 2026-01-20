const { performance } = require("node:perf_hooks");
const { applyMove, getLegalMoves } = require("./checkersEngine");

function nowMs() {
  return typeof performance?.now === "function" ? performance.now() : Date.now();
}

class TimeUp extends Error {
  constructor() {
    super("time_up");
    this.name = "TimeUp";
  }
}

function opponent(player) {
  return player === "white" ? "black" : "white";
}

function evaluate(state, botColor) {
  const board = state?.board || [];
  let material = 0;
  let position = 0;

  for (let r = 0; r < board.length; r++) {
    const row = board[r] || [];
    for (let c = 0; c < row.length; c++) {
      const v = row[c] || 0;
      if (v === 0) continue;

      const isWhite = v > 0;
      const isKing = Math.abs(v) === 2;
      const base = isKing ? 3 : 1;
      const sign = isWhite ? 1 : -1;
      material += base * sign;

      // Centro y avance (heurística barata)
      const centerBonus = c >= 2 && c <= 5 && r >= 2 && r <= 5 ? 0.05 : 0;
      const advance =
        !isKing && isWhite
          ? (7 - r) * 0.02
          : !isKing && !isWhite
            ? r * 0.02
            : 0;
      position += (centerBonus + advance) * sign;
    }
  }

  const scoreFromWhite = material + position;
  return botColor === "white" ? scoreFromWhite : -scoreFromWhite;
}

function generateTurnSequences(state, player) {
  const legal = getLegalMoves(state, player);
  const pool = legal.captures.length > 0 ? legal.captures : legal.normals;
  if (!pool.length) return [];

  const out = [];
  for (const mv of pool) {
    let next;
    try {
      next = applyMove(state, { player, from: mv.from, to: mv.to });
    } catch {
      continue;
    }

    const step = { from: mv.from, to: mv.to };
    if (next.status === "playing" && next.currentPlayer === player) {
      const tails = generateTurnSequences(next, player);
      if (tails.length === 0) {
        out.push({ steps: [step], finalState: next });
      } else {
        for (const t of tails) {
          out.push({ steps: [step, ...t.steps], finalState: t.finalState });
        }
      }
    } else {
      out.push({ steps: [step], finalState: next });
    }
  }

  // Capturas y promociones primero (move ordering simple).
  out.sort((a, b) => {
    const am = a.finalState?.lastMove || {};
    const bm = b.finalState?.lastMove || {};
    const aCap = am.captured ? 1 : 0;
    const bCap = bm.captured ? 1 : 0;
    if (aCap !== bCap) return bCap - aCap;
    const aKing = am.becameKing ? 1 : 0;
    const bKing = bm.becameKing ? 1 : 0;
    if (aKing !== bKing) return bKing - aKing;
    return b.steps.length - a.steps.length;
  });

  return out;
}

function alphabeta(state, botColor, depth, alpha, beta, deadlineMs) {
  if (nowMs() >= deadlineMs) throw new TimeUp();

  if (state.status === "finished") {
    if (state.winner === botColor) return 1_000_000;
    if (state.winner === opponent(botColor)) return -1_000_000;
    return 0;
  }

  if (depth <= 0) return evaluate(state, botColor);

  const toMove = state.currentPlayer;
  const moves = generateTurnSequences(state, toMove);
  if (moves.length === 0) {
    // Sin movimientos: pierde el jugador que le toca.
    return toMove === botColor ? -1_000_000 : 1_000_000;
  }

  const maximizing = toMove === botColor;
  if (maximizing) {
    let best = -Infinity;
    for (const mv of moves) {
      const val = alphabeta(mv.finalState, botColor, depth - 1, alpha, beta, deadlineMs);
      if (val > best) best = val;
      if (val > alpha) alpha = val;
      if (alpha >= beta) break;
    }
    return best;
  }

  let best = Infinity;
  for (const mv of moves) {
    const val = alphabeta(mv.finalState, botColor, depth - 1, alpha, beta, deadlineMs);
    if (val < best) best = val;
    if (val < beta) beta = val;
    if (alpha >= beta) break;
  }
  return best;
}

function getBestMove(state, botId, timeLimitMs = 220) {
  const botColor = botId === "white" || botId === "black" ? botId : "black";
  if (!state || state.status !== "playing" || state.currentPlayer !== botColor) {
    return null;
  }

  const start = nowMs();
  const budget = Math.max(20, Number(timeLimitMs) || 220);
  const deadline = start + budget;

  const rootMoves = generateTurnSequences(state, botColor);
  if (rootMoves.length === 0) return null;

  let best = rootMoves[0];
  let bestScore = -Infinity;

  for (let depth = 1; depth <= 4; depth++) {
    if (nowMs() >= deadline) break;
    let localBest = best;
    let localBestScore = -Infinity;

    try {
      for (const mv of rootMoves) {
        const val = alphabeta(mv.finalState, botColor, depth - 1, -Infinity, Infinity, deadline);
        if (val > localBestScore) {
          localBestScore = val;
          localBest = mv;
        }
      }
    } catch (e) {
      if (!(e instanceof TimeUp)) throw e;
      break;
    }

    best = localBest;
    bestScore = localBestScore;
    if (bestScore >= 900_000) break;
  }

  return best;
}

module.exports = {
  getBestMove,
  generateLegalMoves: generateTurnSequences,
};

