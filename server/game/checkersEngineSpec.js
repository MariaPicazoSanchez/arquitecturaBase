const {
  createInitialState,
  getLegalMoves,
  applyMove,
} = require("./checkersEngine");

function empty8() {
  return Array.from({ length: 8 }, () => Array(8).fill(0));
}

describe("[CHECKERS] reglas MVP", function () {
  it("capturas obligatorias: si hay captura, no hay movimientos simples", function () {
    const board = empty8();
    board[5][0] = 1;
    board[4][1] = -1;
    board[5][2] = 1;
    board[4][3] = 0;

    const state = {
      ...createInitialState(),
      board,
      currentPlayer: "white",
      forcedFrom: null,
      status: "playing",
      winner: null,
    };

    const moves = getLegalMoves(state, "white");
    expect(moves.some((m) => m.capture)).toBe(true);
    expect(moves.every((m) => m.capture)).toBe(true);
    expect(
      moves.some((m) => m.from.r === 5 && m.from.c === 2 && m.to.r === 4 && m.to.c === 3),
    ).toBe(false);
  });

  it("multi-captura: forcedFrom y turno se mantienen tras captura con continuación", function () {
    const board = empty8();
    board[5][0] = 1;
    board[4][1] = -1;
    board[2][3] = -1;
    board[0][1] = -1;

    const state = {
      ...createInitialState(),
      board,
      currentPlayer: "white",
      forcedFrom: null,
      status: "playing",
      winner: null,
    };

    const afterFirst = applyMove(state, {
      player: "white",
      from: { r: 5, c: 0 },
      to: { r: 3, c: 2 },
    });

    expect(afterFirst.currentPlayer).toBe("white");
    expect(afterFirst.forcedFrom).toEqual({ r: 3, c: 2 });
    expect(afterFirst.board[4][1]).toBe(0);

    const afterSecond = applyMove(afterFirst, {
      player: "white",
      from: { r: 3, c: 2 },
      to: { r: 1, c: 4 },
    });

    expect(afterSecond.currentPlayer).toBe("black");
    expect(afterSecond.forcedFrom).toBe(null);
    expect(afterSecond.board[2][3]).toBe(0);
    expect(afterSecond.board[1][4]).toBe(1);
  });

  it("coronación: al llegar a la última fila, se convierte en dama", function () {
    const board = empty8();
    board[1][2] = 1;

    const state = {
      ...createInitialState(),
      board,
      currentPlayer: "white",
      forcedFrom: null,
      status: "playing",
      winner: null,
    };

    const next = applyMove(state, {
      player: "white",
      from: { r: 1, c: 2 },
      to: { r: 0, c: 3 },
    });

    expect(next.board[0][3]).toBe(2);
  });

  it("fin de partida: gana si el rival se queda sin piezas", function () {
    const board = empty8();
    board[5][0] = 1;
    board[4][1] = -1;

    const state = {
      ...createInitialState(),
      board,
      currentPlayer: "white",
      forcedFrom: null,
      status: "playing",
      winner: null,
    };

    const next = applyMove(state, {
      player: "white",
      from: { r: 5, c: 0 },
      to: { r: 3, c: 2 },
    });

    expect(next.status).toBe("finished");
    expect(next.winner).toBe("white");
  });

  it("fin de partida: gana si el rival no tiene movimientos", function () {
    const board = empty8();
    // Negro bloqueado en (2,1)
    board[2][1] = -1;
    board[3][0] = 1;
    board[3][2] = 1;
    board[4][3] = 1; // bloquea captura negra a (4,3)

    // Evitar captura obligatoria para blancas (bloquear aterrizajes)
    board[1][0] = 1;
    board[1][2] = 1;

    // Blanco tiene un movimiento simple para pasar turno
    board[5][4] = 1;

    const state = {
      ...createInitialState(),
      board,
      currentPlayer: "white",
      forcedFrom: null,
      status: "playing",
      winner: null,
    };

    const next = applyMove(state, {
      player: "white",
      from: { r: 5, c: 4 },
      to: { r: 4, c: 5 },
    });

    expect(next.status).toBe("finished");
    expect(next.winner).toBe("white");
  });
});
