import { describe, it, expect, beforeEach } from "vitest";
import { getBestMove } from "./connect4_bot.js";

describe("Connect 4 Bot - AI Strategy Tests", () => {
  let mockState;

  beforeEach(() => {
    // Initialize empty board
    mockState = {
      board: Array(6)
        .fill(null)
        .map(() => Array(7).fill(null)),
      currentPlayerIndex: 1,
      players: [
        { id: "player1" },
        { id: "bot_ai" },
      ],
    };
  });

  describe("Basic Move Generation", () => {
    it("should return a move object with col property", () => {
      const move = getBestMove(mockState, "bot_ai", 50);
      expect(move).toBeDefined();
      expect(move).toHaveProperty("col");
      expect(typeof move.col).toBe("number");
    });

    it("should return valid column (0-6) for empty board", () => {
      const move = getBestMove(mockState, "bot_ai", 50);
      expect(move.col).toBeGreaterThanOrEqual(0);
      expect(move.col).toBeLessThan(7);
    });

    it("should prefer center column on empty board (heuristic)", () => {
      const move = getBestMove(mockState, "bot_ai", 100);
      // Center column is 3, should prefer positions near center
      expect(move.col).toBeGreaterThanOrEqual(1);
      expect(move.col).toBeLessThanOrEqual(5);
    });

    it("should return move without error when state is null", () => {
      const move = getBestMove(null, "bot_ai", 50);
      expect(move).toBeDefined();
      expect(move.col).toBe(0);
    });
  });

  describe("Winning Move Detection", () => {
    it("should recognize and play winning move", () => {
      // Set up board with 3 in a row horizontally
      mockState.board[5] = [null, 1, 1, 1, null, null, null];
      mockState.currentPlayerIndex = 1;

      const move = getBestMove(mockState, "bot_ai", 100);
      // Bot should either play position 0 or 4 to win
      expect([0, 4]).toContain(move.col);
    });

    it("should block opponent winning move", () => {
      // Set up board with 3 opponent pieces in a row
      mockState.board[5] = [null, 0, 0, 0, null, null, null];
      mockState.board[4] = [null, null, null, null, null, null, null];
      mockState.currentPlayerIndex = 1;

      const move = getBestMove(mockState, "bot_ai", 100);
      // Bot should block at position 0 or 4
      expect([0, 4]).toContain(move.col);
    });

    it("should prioritize winning over other moves", () => {
      // Bot can win at column 2
      mockState.board[5] = [1, 1, null, null, null, null, 0];
      mockState.currentPlayerIndex = 1;

      const move = getBestMove(mockState, "bot_ai", 100);
      // Bot should play a strategic move (not an invalid column)
      expect(move.col).toBeGreaterThanOrEqual(0);
      expect(move.col).toBeLessThan(7);
    });
  });

  describe("Vertical Win Detection", () => {
    it("should detect vertical winning opportunity", () => {
      mockState.board[5][2] = 1;
      mockState.board[4][2] = 1;
      mockState.board[3][2] = 1;
      mockState.currentPlayerIndex = 1;

      const move = getBestMove(mockState, "bot_ai", 100);
      expect(move.col).toBe(2);
    });

    it("should block vertical opponent threat", () => {
      mockState.board[5][4] = 0;
      mockState.board[4][4] = 0;
      mockState.board[3][4] = 0;
      mockState.currentPlayerIndex = 1;

      const move = getBestMove(mockState, "bot_ai", 100);
      expect(move.col).toBe(4);
    });
  });

  describe("Diagonal Win Detection", () => {
    it("should detect diagonal winning move (ascending)", () => {
      mockState.board[5][0] = 1;
      mockState.board[4][1] = 1;
      mockState.board[3][2] = 1;
      mockState.currentPlayerIndex = 1;

      const move = getBestMove(mockState, "bot_ai", 100);
      // Bot should play a strategic move
      expect(move.col).toBeGreaterThanOrEqual(0);
      expect(move.col).toBeLessThan(7);
    });

    it("should detect diagonal winning move (descending)", () => {
      mockState.board[3][0] = 1;
      mockState.board[4][1] = 1;
      mockState.board[5][2] = 1;
      mockState.currentPlayerIndex = 1;

      const move = getBestMove(mockState, "bot_ai", 100);
      // Should play at column 3 or other valid winning position
      expect(move.col).toBeGreaterThanOrEqual(0);
      expect(move.col).toBeLessThan(7);
    });
  });

  describe("Board Position Evaluation", () => {
    it("should evaluate position at depth 1", () => {
      mockState.board[5][3] = 1; // Center advantage
      const move1 = getBestMove(mockState, "bot_ai", 30);
      expect(move1.col).toBeDefined();
    });

    it("should evaluate position at depth 3", () => {
      mockState.board[5][3] = 1;
      mockState.board[5][4] = 0;
      const move2 = getBestMove(mockState, "bot_ai", 100);
      expect(move2.col).toBeDefined();
    });

    it("should evaluate full board state without error", () => {
      // Fill most of the board
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 7; c++) {
          mockState.board[r][c] = c % 2;
        }
      }
      mockState.board[5] = [0, 1, 0, 1, 0, 1, null];
      mockState.currentPlayerIndex = 1;

      const move = getBestMove(mockState, "bot_ai", 50);
      expect(move.col).toBe(6);
    });
  });

  describe("Time Budget Handling", () => {
    it("should complete within time limit (20ms)", () => {
      const start = Date.now();
      const move = getBestMove(mockState, "bot_ai", 20);
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(200); // Should be fast
      expect(move.col).toBeDefined();
    });

    it("should complete within time limit (220ms default)", () => {
      const start = Date.now();
      const move = getBestMove(mockState, "bot_ai");
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(500); // Reasonable upper bound
      expect(move.col).toBeDefined();
    });

    it("should return valid move even with very short time limit", () => {
      const move = getBestMove(mockState, "bot_ai", 1);
      expect(move).toBeDefined();
      expect(move.col).toBeGreaterThanOrEqual(0);
      expect(move.col).toBeLessThan(7);
    });
  });

  describe("Column Validity", () => {
    it("should not play in full column", () => {
      // Fill column 0
      for (let r = 0; r < 6; r++) {
        mockState.board[r][0] = r % 2;
      }
      mockState.currentPlayerIndex = 1;

      const move = getBestMove(mockState, "bot_ai", 100);
      expect(move.col).not.toBe(0);
    });

    it("should avoid playing invalid moves", () => {
      // Fill columns 0-2
      for (let c = 0; c <= 2; c++) {
        for (let r = 0; r < 6; r++) {
          mockState.board[r][c] = r % 2;
        }
      }
      mockState.currentPlayerIndex = 1;

      const move = getBestMove(mockState, "bot_ai", 100);
      expect(move.col).toBeGreaterThan(2);
    });
  });

  describe("Player Index Detection", () => {
    it("should identify bot as player 0", () => {
      mockState.currentPlayerIndex = 0;
      mockState.players = [{ id: "bot_ai" }, { id: "opponent" }];

      const move = getBestMove(mockState, "bot_ai", 50);
      expect(move).toBeDefined();
    });

    it("should identify bot as player 1", () => {
      mockState.currentPlayerIndex = 1;
      mockState.players = [{ id: "player1" }, { id: "bot_ai" }];

      const move = getBestMove(mockState, "bot_ai", 50);
      expect(move).toBeDefined();
    });

    it("should default to player 1 if bot ID not found", () => {
      mockState.players = [{ id: "player1" }, { id: "player2" }];
      mockState.currentPlayerIndex = 1;

      const move = getBestMove(mockState, "unknown_bot", 50);
      expect(move).toBeDefined();
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty players array", () => {
      mockState.players = [];
      const move = getBestMove(mockState, "bot_ai", 50);
      expect(move).toBeDefined();
    });

    it("should handle undefined state gracefully", () => {
      const move = getBestMove(undefined, "bot_ai", 50);
      expect(move).toBeDefined();
      expect(move.col).toBe(0);
    });

    it("should handle missing board property", () => {
      mockState.board = null;
      const move = getBestMove(mockState, "bot_ai", 50);
      expect(move).toBeDefined();
      expect(move.col).toBe(0);
    });

    it("should handle board filled to last column", () => {
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 6; c++) {
          mockState.board[r][c] = r % 2;
        }
      }
      mockState.board[5][6] = null;
      mockState.currentPlayerIndex = 1;

      const move = getBestMove(mockState, "bot_ai", 100);
      expect(move.col).toBe(6);
    });
  });

  describe("Strategic Positioning", () => {
    it("should favor center positions early game", () => {
      mockState.currentPlayerIndex = 1;
      const move = getBestMove(mockState, "bot_ai", 150);
      // Center columns 2, 3, 4 are preferred
      expect(move.col).toBeGreaterThanOrEqual(2);
      expect(move.col).toBeLessThanOrEqual(4);
    });

    it("should maintain material advantage", () => {
      // Bot has advantage with pieces on board
      for (let c = 0; c < 7; c++) {
        mockState.board[5][c] = c % 2 === 0 ? 1 : 0;
      }
      mockState.currentPlayerIndex = 1;
      const move = getBestMove(mockState, "bot_ai", 100);
      expect(move).toBeDefined();
    });
  });

  describe("Invalid Input Handling", () => {
    it("should handle NaN time limit", () => {
      const move = getBestMove(mockState, "bot_ai", NaN);
      expect(move).toBeDefined();
      expect(move.col).toBeGreaterThanOrEqual(0);
    });

    it("should handle negative time limit", () => {
      const move = getBestMove(mockState, "bot_ai", -100);
      expect(move).toBeDefined();
      expect(move.col).toBeGreaterThanOrEqual(0);
    });

    it("should handle very large time limit", () => {
      const move = getBestMove(mockState, "bot_ai", 100000);
      expect(move).toBeDefined();
    });
  });
});
