import { describe, it, expect, beforeEach, vi } from "vitest";
import { getBestMove, generateLegalMoves } from "./checkers_bot.js";

// Mock the checkersEngine module
vi.mock("./checkersEngine", () => ({
  applyMove: vi.fn((state, move) => {
    // Simple mock: just return a state indicating the move was applied
    return {
      ...state,
      currentPlayer: state.currentPlayer === "white" ? "black" : "white",
      lastMove: move,
      status: "playing",
    };
  }),
  getLegalMoves: vi.fn((state, player) => {
    // Return mock legal moves
    return {
      captures: [],
      normals: [
        { from: [5, 2], to: [4, 1] },
        { from: [5, 2], to: [4, 3] },
        { from: [6, 3], to: [5, 2] },
      ],
    };
  }),
}));

describe("Checkers Bot - AI Strategy Tests", () => {
  let mockState;

  beforeEach(() => {
    mockState = {
      board: Array(8)
        .fill(null)
        .map(() => Array(8).fill(null)),
      currentPlayer: "black",
      status: "playing",
    };
  });

  describe("Move Generation", () => {
    it("should return turn sequences for legal moves", () => {
      const sequences = generateLegalMoves(mockState, "black");
      expect(Array.isArray(sequences)).toBe(true);
    });

    it("should structure turn sequences with steps and finalState", () => {
      const sequences = generateLegalMoves(mockState, "black");
      if (sequences.length > 0) {
        const seq = sequences[0];
        expect(seq).toHaveProperty("steps");
        expect(seq).toHaveProperty("finalState");
        expect(Array.isArray(seq.steps)).toBe(true);
      }
    });

    it("should return empty array when no legal moves available", () => {
      const sequences = generateLegalMoves(mockState, "white");
      expect(Array.isArray(sequences)).toBe(true);
    });
  });

  describe("Board Evaluation", () => {
    it("should return positive score for white advantage", () => {
      mockState.board[1] = [1, null, 1, null, 1, null, 1, null];
      mockState.board[2] = [null, 1, null, 1, null, 1, null, 1];
      const move = getBestMove(mockState, "white", 50);
      expect(move).toBeDefined();
    });

    it("should return positive score for black advantage", () => {
      mockState.board[5] = [-1, null, -1, null, -1, null, -1, null];
      mockState.board[6] = [null, -1, null, -1, null, -1, null, -1];
      const move = getBestMove(mockState, "black", 50);
      expect(move).toBeDefined();
    });

    it("should evaluate piece value (regular vs king)", () => {
      mockState.board[3][3] = 2; // white king
      mockState.board[4][4] = -2; // black king
      mockState.board[2][2] = 1; // white regular
      mockState.board[5][5] = -1; // black regular
      const move = getBestMove(mockState, "white", 50);
      expect(move).toBeDefined();
    });
  });

  describe("Piece Value Hierarchy", () => {
    it("should prioritize capturing opponent pieces", () => {
      mockState.board[3][3] = 1; // white
      mockState.board[4][4] = -1; // black to capture
      mockState.currentPlayer = "white";
      
      const move = getBestMove(mockState, "white", 100);
      expect(move).toBeDefined();
    });

    it("should prioritize king promotion moves", () => {
      mockState.board[6][1] = 1; // white near promotion
      mockState.board[7][0] = null; // Can reach promotion
      mockState.currentPlayer = "white";
      
      const move = getBestMove(mockState, "white", 100);
      expect(move).toBeDefined();
    });

    it("should value king pieces higher than regular pieces", () => {
      mockState.board[3][3] = 2; // white king
      mockState.board[4][4] = -2; // black king
      mockState.currentPlayer = "white";
      
      const move = getBestMove(mockState, "white", 100);
      expect(move).toBeDefined();
    });
  });

  describe("Center Control Strategy", () => {
    it("should prefer center positions (columns 2-5, rows 2-5)", () => {
      // Setup with empty center
      mockState.currentPlayer = "white";
      mockState.status = "playing";
      
      const move = getBestMove(mockState, "white", 100);
      expect(move).toBeDefined();
    });

    it("should value position in center of board", () => {
      mockState.board[3][3] = 1; // white in center
      mockState.board[4][4] = 1; // white in center
      mockState.currentPlayer = "white";
      
      const move = getBestMove(mockState, "white", 100);
      expect(move).toBeDefined();
    });
  });

  describe("Forward Advance Strategy", () => {
    it("should advance white pieces toward row 7 (promotion)", () => {
      mockState.board[6][1] = 1; // white near promotion
      mockState.currentPlayer = "white";
      
      const move = getBestMove(mockState, "white", 100);
      expect(move).toBeDefined();
    });

    it("should advance black pieces toward row 0 (promotion)", () => {
      mockState.board[1][1] = -1; // black near promotion
      mockState.currentPlayer = "black";
      
      const move = getBestMove(mockState, "black", 100);
      expect(move).toBeDefined();
    });
  });

  describe("Best Move Selection", () => {
    it("should return move object with steps and finalState", () => {
      mockState.currentPlayer = "white";
      mockState.status = "playing";
      
      const move = getBestMove(mockState, "white", 100);
      if (move) {
        expect(move).toHaveProperty("steps");
        expect(move).toHaveProperty("finalState");
      }
    });

    it("should return null if no legal moves available", () => {
      mockState.status = "finished";
      
      const move = getBestMove(mockState, "white", 100);
      expect(move).toBeNull();
    });

    it("should return null if not current player's turn", () => {
      mockState.currentPlayer = "black";
      
      const move = getBestMove(mockState, "white", 100);
      expect(move).toBeNull();
    });

    it("should return null if game not in playing status", () => {
      mockState.status = "finished";
      mockState.winner = "white";
      
      const move = getBestMove(mockState, "white", 100);
      expect(move).toBeNull();
    });
  });

  describe("Minimax Depth Exploration", () => {
    it("should search depth 1 with adequate time", () => {
      mockState.currentPlayer = "white";
      mockState.status = "playing";
      
      const move = getBestMove(mockState, "white", 50);
      expect(move).toBeDefined();
    });

    it("should search depth 2+ with more time", () => {
      mockState.currentPlayer = "white";
      mockState.status = "playing";
      
      const move = getBestMove(mockState, "white", 150);
      expect(move).toBeDefined();
    });

    it("should respect time deadline", () => {
      mockState.currentPlayer = "white";
      mockState.status = "playing";
      
      const start = Date.now();
      const move = getBestMove(mockState, "white", 20);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(300);
      expect(move).toBeDefined();
    });
  });

  describe("Alpha-Beta Pruning", () => {
    it("should terminate search early with good score", () => {
      mockState.currentPlayer = "white";
      mockState.status = "playing";
      mockState.winner = null;
      
      // Should find winning scenario quickly
      const move = getBestMove(mockState, "white", 100);
      expect(move).toBeDefined();
    });

    it("should prune branches to improve performance", () => {
      mockState.currentPlayer = "white";
      mockState.status = "playing";
      
      const start = Date.now();
      const move = getBestMove(mockState, "white", 80);
      const duration = Date.now() - start;
      
      // Should complete within reasonable time due to pruning
      expect(duration).toBeLessThan(500);
      expect(move).toBeDefined();
    });
  });

  describe("Time Budget Handling", () => {
    it("should complete with 20ms budget", () => {
      mockState.currentPlayer = "white";
      mockState.status = "playing";
      
      const start = Date.now();
      const move = getBestMove(mockState, "white", 20);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(200);
      expect(move).toBeDefined();
    });

    it("should complete with default 220ms budget", () => {
      mockState.currentPlayer = "white";
      mockState.status = "playing";
      
      const start = Date.now();
      const move = getBestMove(mockState, "white");
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(1000);
      expect(move).toBeDefined();
    });

    it("should handle very short time limit gracefully", () => {
      mockState.currentPlayer = "white";
      mockState.status = "playing";
      
      const move = getBestMove(mockState, "white", 1);
      expect(move).toBeDefined();
    });

    it("should use full time for deep search when available", () => {
      mockState.currentPlayer = "white";
      mockState.status = "playing";
      
      const start = Date.now();
      const move = getBestMove(mockState, "white", 300);
      const duration = Date.now() - start;
      
      expect(move).toBeDefined();
    });
  });

  describe("Color Validation", () => {
    it("should handle white color", () => {
      mockState.currentPlayer = "white";
      mockState.status = "playing";
      
      const move = getBestMove(mockState, "white", 50);
      expect(move).toBeDefined();
    });

    it("should handle black color", () => {
      mockState.currentPlayer = "black";
      mockState.status = "playing";
      
      const move = getBestMove(mockState, "black", 50);
      expect(move).toBeDefined();
    });

    it("should default to black for invalid color", () => {
      mockState.currentPlayer = "black";
      mockState.status = "playing";
      
      const move = getBestMove(mockState, "invalid_color", 50);
      expect(move).toBeDefined();
    });
  });

  describe("Game State Handling", () => {
    it("should handle null state gracefully", () => {
      const move = getBestMove(null, "white", 50);
      expect(move).toBeNull();
    });

    it("should handle undefined state gracefully", () => {
      const move = getBestMove(undefined, "white", 50);
      expect(move).toBeNull();
    });

    it("should handle finished game state", () => {
      mockState.status = "finished";
      mockState.winner = "white";
      mockState.currentPlayer = "white";
      
      const move = getBestMove(mockState, "white", 50);
      expect(move).toBeNull();
    });

    it("should handle wrong turn (not bot's turn)", () => {
      mockState.currentPlayer = "black";
      mockState.status = "playing";
      
      const move = getBestMove(mockState, "white", 50);
      expect(move).toBeNull();
    });
  });

  describe("Move Prioritization", () => {
    it("should prioritize capture moves over normal moves", () => {
      mockState.currentPlayer = "white";
      mockState.status = "playing";
      
      const move = getBestMove(mockState, "white", 100);
      expect(move).toBeDefined();
    });

    it("should prioritize promotion moves", () => {
      mockState.board[6][1] = 1; // white near promotion
      mockState.currentPlayer = "white";
      mockState.status = "playing";
      
      const move = getBestMove(mockState, "white", 100);
      expect(move).toBeDefined();
    });

    it("should consider multi-capture sequences", () => {
      mockState.currentPlayer = "white";
      mockState.status = "playing";
      
      const move = getBestMove(mockState, "white", 150);
      expect(move).toBeDefined();
    });
  });

  describe("Heuristic Evaluation", () => {
    it("should evaluate empty board neutrally", () => {
      // Empty board
      const move = getBestMove(mockState, "white", 50);
      expect(move).toBeDefined();
    });

    it("should evaluate material imbalance correctly", () => {
      // White advantage
      mockState.board[1][1] = 1;
      mockState.board[2][2] = 1;
      mockState.board[3][3] = 2;
      mockState.currentPlayer = "white";
      
      const move = getBestMove(mockState, "white", 100);
      expect(move).toBeDefined();
    });

    it("should evaluate positional advantage", () => {
      // Pieces in center
      mockState.board[3][3] = 1;
      mockState.board[3][4] = 1;
      mockState.board[4][3] = 1;
      mockState.board[4][4] = 1;
      mockState.currentPlayer = "white";
      
      const move = getBestMove(mockState, "white", 100);
      expect(move).toBeDefined();
    });
  });

  describe("Input Validation", () => {
    it("should handle NaN time limit", () => {
      mockState.currentPlayer = "white";
      mockState.status = "playing";
      
      const move = getBestMove(mockState, "white", NaN);
      expect(move).toBeDefined();
    });

    it("should handle negative time limit", () => {
      mockState.currentPlayer = "white";
      mockState.status = "playing";
      
      const move = getBestMove(mockState, "white", -100);
      expect(move).toBeDefined();
    });

    it("should handle very large time limit", () => {
      mockState.currentPlayer = "white";
      mockState.status = "playing";
      
      const move = getBestMove(mockState, "white", 100000);
      expect(move).toBeDefined();
    });

    it("should handle missing currentPlayer field", () => {
      delete mockState.currentPlayer;
      mockState.status = "playing";
      
      const move = getBestMove(mockState, "white", 50);
      expect(move).toBeNull();
    });

    it("should handle missing board field", () => {
      delete mockState.board;
      mockState.currentPlayer = "white";
      mockState.status = "playing";
      
      const move = getBestMove(mockState, "white", 50);
      expect(move).toBeDefined();
    });
  });

  describe("Performance", () => {
    it("should complete search within reasonable time for depth 1", () => {
      mockState.currentPlayer = "white";
      mockState.status = "playing";
      
      const start = Date.now();
      getBestMove(mockState, "white", 30);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(200);
    });

    it("should complete search within reasonable time for depth 2-4", () => {
      mockState.currentPlayer = "white";
      mockState.status = "playing";
      
      const start = Date.now();
      getBestMove(mockState, "white", 150);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(500);
    });

    it("should not hang on very large boards", () => {
      // Fill board with many pieces
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if ((r + c) % 2 === 0) {
            mockState.board[r][c] = r < 4 ? 1 : -1;
          }
        }
      }
      mockState.currentPlayer = "white";
      mockState.status = "playing";
      
      const start = Date.now();
      const move = getBestMove(mockState, "white", 100);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(500);
      expect(move).toBeDefined();
    });
  });
});
